import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  onChildAdded
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyARq5j8Kf9p4SYj4sj3167BjVD-Q4KczQE",
  authDomain: "koricord-a5f4e.firebaseapp.com",
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com",
  projectId: "koricord-a5f4e",
  storageBucket: "koricord-a5f4e.firebasestorage.app",
  messagingSenderId: "228519016518",
  appId: "1:228519016518:web:9062449c2b5135ee36b247"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let botId = "";
let serversData = {};
let currentServerId = "";
let currentChannelId = "";
let isWindowFocused = true;
let unreadCount = 0;
let lastMessageDividerAdded = false;

const popout = document.createElement("div");
popout.className = "profile-popout";
document.body.appendChild(popout);

// Evento para cerrar la tarjeta de perfil si se hace click fuera
document.addEventListener("click", (e) => {
  if (!popout.contains(e.target) && !e.target.closest(".member-item")) {
    popout.style.display = "none";
  }
});

window.addEventListener("focus", () => {
  isWindowFocused = true;
  unreadCount = 0;
  document.title = "KoriCord Futurist";
  clearUnreadDividers();
});
window.addEventListener("blur", () => { isWindowFocused = false; });

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(550, ctx.currentTime);
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  } catch (e) {}
}

window.toggleMembersList = function() {
  document.getElementById("membersSidebar").classList.toggle("hidden");
};

window.checkLogin = function() {
  const pass = document.getElementById("loginInput").value;
  if(pass === "soykori") {
    document.getElementById("loginScreen").style.display = "none";
    initApp();
  } else {
    document.getElementById("errorMsg").style.display = "block";
    document.getElementById("loginInput").value = "";
  }
};

document.getElementById("loginInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.checkLogin();
});

function initApp() {
  // 1. Obtener ID del bot para reconocerte a ti mismo
  onValue(ref(db, "botConfig"), (snap) => {
    const data = snap.val();
    if(data) botId = data.id || "";
  });

  // 2. Escuchar Múltiples Servidores en Tiempo Real
  onValue(ref(db, "serverConfig"), (snap) => {
    serversData = snap.val() || {};
    renderServers();
  });

  // 3. Estado de Escritura
  onValue(ref(db, "typing status"), (snap) => {
    const data = snap.val();
    if (data && data.isTyping && data.user !== "WebUser" && data.channelId === currentChannelId) {
      document.getElementById("typing").innerText = `${data.user} está escribiendo...`;
    } else {
      document.getElementById("typing").innerText = "";
    }
  });

  document.getElementById("msg").addEventListener("input", () => {
    set(ref(db, "typing status"), { isTyping: true, user: "WebUser", channelId: currentChannelId });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      set(ref(db, "typing status"), { isTyping: false, user: "", channelId: "" });
    }, 2000);
  });

  onChildAdded(ref(db, "discordMessages"), (snap) => { processMessage(snap.val(), "discord"); });
  onChildAdded(ref(db, "webMessages"), (snap) => { processMessage(snap.val(), "web"); });
}

function renderServers() {
  const container = document.getElementById("guildsSidebar");
  container.innerHTML = "";

  Object.values(serversData).forEach((srv, idx) => {
    const wrap = document.createElement("div");
    wrap.className = `guild-icon-wrap ${currentServerId === srv.id || (!currentServerId && idx === 0) ? 'active' : ''}`;
    
    const iconHtml = srv.icon 
      ? `<img src="${srv.icon}">` 
      : `<div>${srv.name[0].toUpperCase()}</div>`;

    wrap.innerHTML = `
      <div class="guild-icon">${iconHtml}</div>
      <span class="guild-tooltip">${srv.name}</span>
    `;

    if (!currentServerId && idx === 0) {
      selectServer(srv.id);
    }

    wrap.onclick = () => {
      document.querySelectorAll(".guild-icon-wrap").forEach(w => w.classList.remove("active"));
      wrap.classList.add("active");
      selectServer(srv.id);
    };
    container.appendChild(wrap);
  });
}

function selectServer(serverId) {
  currentServerId = serverId;
  const srv = serversData[serverId];
  if (!srv) return;

  document.getElementById("serverTitle").innerText = srv.name;
  
  // Renderizar Canales de este Servidor
  const channelsList = document.getElementById("channelsList");
  channelsList.innerHTML = "";
  currentChannelId = "";

  if (srv.channels && srv.channels.length > 0) {
    srv.channels.forEach((ch, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "channel-wrap";

      const btn = document.createElement("div");
      btn.className = `channel-btn ${idx === 0 ? 'active' : ''}`;
      btn.innerText = ch.name;
      
      const badge = document.createElement("div");
      badge.className = "unread-badge";
      badge.id = `badge-${ch.id}`;

      if (idx === 0) {
        switchChannel(ch.id, ch.name);
      }

      btn.onclick = () => switchChannel(ch.id, ch.name);
      wrap.appendChild(btn); wrap.appendChild(badge);
      channelsList.appendChild(wrap);
    });
  }

  // Escuchar Miembros en Tiempo Real de forma indexada y directa sin delays
  onValue(ref(db, `serverMembers/${currentServerId}`), (snap) => {
    renderMembers(snap.val());
  });
}

function renderMembers(members) {
  const container = document.getElementById("membersList");
  container.innerHTML = "";
  if (!members) return;

  Object.values(members).forEach(m => {
    const item = document.createElement("div");
    item.className = "member-item";

    const avContainer = document.createElement("div");
    avContainer.className = "member-avatar-container";
    const avHtml = m.avatar ? `<img class="member-avatar" src="${m.avatar}">` : `<div class="member-avatar">${m.nickname[0]}</div>`;
    
    const dot = document.createElement("div");
    dot.className = `status-dot ${m.status}`;
    avContainer.innerHTML = avHtml; avContainer.appendChild(dot);

    const info = document.createElement("div");
    info.className = "member-info";
    
    // Si eres tú (Kori), se renderiza tu tag real
    const subText = m.customStatus ? m.customStatus : (m.isBot ? '🤖 BOT' : `@${m.username}`);

    info.innerHTML = `
      <div class="member-name">${m.nickname || m.username}</div>
      <div class="member-sub">${subText}</div>
    `;

    item.appendChild(avContainer); item.appendChild(info);

    // Muestra Info completa al hacer CLICK (Regla de oro + Sin cortar estados con scrolls internos)
    item.onclick = (e) => {
      e.stopPropagation();
      const rect = item.getBoundingClientRect();
      popout.style.top = `${Math.min(rect.top - 10, window.innerHeight - 240)}px`;
      
      popout.innerHTML = `
        <div class="popout-banner" style="background-color: ${m.bannerColor || '#5865f2'};"></div>
        <div class="popout-avatar-wrap">
          ${m.avatar ? `<img class="popout-avatar" src="${m.avatar}">` : `<div class="popout-avatar">${m.nickname[0]}</div>`}
        </div>
        <div class="popout-body">
          <div class="popout-names">
            <div class="popout-nick">${m.nickname || m.username}</div>
            <div class="popout-user">@${m.username}</div>
          </div>
          ${m.customStatus ? `<div><div class="popout-section-title">Estado</div><div class="popout-text">${m.customStatus}</div></div>` : ''}
          ${m.activity ? `<div><div class="popout-section-title">Actividad</div><div class="popout-text">${m.activity}</div></div>` : ''}
        </div>
      `;
      popout.style.display = "flex";
    };

    container.appendChild(item);
  });
}

function switchChannel(id, name) {
  currentChannelId = id;
  document.getElementById("currentChannelName").innerText = name;
  
  document.querySelectorAll(".channel-btn").forEach(btn => {
    if(btn.innerText === name) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  const badge = document.getElementById(`badge-${id}`);
  if (badge) badge.style.display = "none";

  lastMessageDividerAdded = false;
  clearUnreadDividers();
  filterMessages();
}

function clearUnreadDividers() { document.querySelectorAll(".unread-divider").forEach(d => d.remove()); }

function processMessage(data, type) {
  const targetChannelId = data.channelId || currentChannelId;
  
  if (targetChannelId !== currentChannelId || !isWindowFocused) {
    playNotificationSound();
    if (targetChannelId !== currentChannelId) {
      const badge = document.getElementById(`badge-${targetChannelId}`);
      if (badge) badge.style.display = "block";
    }
    if (!isWindowFocused) {
      unreadCount++;
      document.title = `🔴 (${unreadCount}) KoriCord Futurist`;
    }
  }

  if (!isWindowFocused && targetChannelId === currentChannelId && !lastMessageDividerAdded) {
    const divider = document.createElement("div");
    divider.className = "unread-divider";
    divider.innerHTML = "<span>NUEVOS MENSAJES</span>";
    divider.dataset.time = (data.timestamp || data.time) - 1;
    document.getElementById("messages").appendChild(divider);
    lastMessageDividerAdded = true;
  }

  const div = document.createElement("div");
  div.className = "msg";
  const msgTime = data.timestamp || data.time;
  div.dataset.time = msgTime;
  div.dataset.channelId = targetChannelId;
  const timeStr = new Date(msgTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  // Verificar si el mensaje es tuyo (Kori) en Discord o Web para unificar tu foto real
  let nameToShow = data.nickname || data.username;
  let avatarUrl = data.avatar;

  if (type === "web" || data.authorId === botId) {
    const containerMembers = serversData[currentServerId]?.members || {};
    const myDiscordProfile = Object.values(containerMembers).find(m => m.id === botId);
    if (myDiscordProfile) {
      nameToShow = myDiscordProfile.nickname;
      avatarUrl = myDiscordProfile.avatar;
    } else {
      nameToShow = botName;
      avatarUrl = botAvatar;
    }
  }

  const avatarHtml = (avatarUrl && avatarUrl.startsWith('http')) 
    ? `<img class="avatar" src="${avatarUrl}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'avatar\\'>${nameToShow[0]}</div>';">`
    : `<div class="avatar">${nameToShow[0].toUpperCase()}</div>`;

  div.innerHTML = `
    ${avatarHtml}
    <div class="content">
      <div class="top">
        <span class="name">${nameToShow}</span>
        <span class="time">${timeStr}</span>
      </div>
      ${data.username ? `<div class="username">@${data.username}</div>` : ''}
      <div class="text">${data.text}</div>
    </div>
  `;

  const container = document.getElementById("messages");
  const children = Array.from(container.children);
  const nextSibling = children.find(child => parseInt(child.dataset.time) > msgTime);

  if (nextSibling) container.insertBefore(div, nextSibling);
  else container.appendChild(div);

  filterMessages();
}

function filterMessages() {
  const container = document.getElementById("messages");
  for (let child of container.children) {
    if (!child.dataset.channelId || child.dataset.channelId === currentChannelId) {
      child.style.display = "flex";
    } else {
      child.style.display = "none";
    }
  }
  container.scrollTop = container.scrollHeight;
}

let typingTimeout;
window.sendMessage = async function(){
  const text = document.getElementById("msg").value;
  if(!text) return;

  set(ref(db, "typing status"), { isTyping: false, user: "", channelId: "" });
  clearUnreadDividers();

  await push(ref(db,"webMessages"), {
    text: text,
    time: Date.now(),
    channelId: currentChannelId
  });

  document.getElementById("msg").value="";
};

document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.sendMessage();
});
