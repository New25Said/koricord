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

let botAvatar = ""; 
let botName = "Tú (Bot)";
let typingTimeout = null;
let currentChannelId = "";
let isWindowFocused = true;
let unreadCount = 0;
let lastMessageDividerAdded = false;

// Monitorear foco de la pestaña del navegador
window.addEventListener("focus", () => {
  isWindowFocused = true;
  unreadCount = 0;
  document.title = "KoriCord Futurist";
  clearUnreadDividers();
});
window.addEventListener("blur", () => {
  isWindowFocused = false;
});

// Función nativa para emitir sonido de notificación de Discord sin archivos externos
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(550, ctx.currentTime); // Tono Discord
    osc.frequency.setValueAtTime(440, ctx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch (e) {
    console.log("Audio esperando interacción del usuario.");
  }
}

// Mostrar/Ocultar lista de miembros
window.toggleMembersList = function() {
  const sidebar = document.getElementById("membersSidebar");
  sidebar.classList.toggle("hidden");
};

// Login global
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
  // 1. Datos del Bot
  onValue(ref(db, "botConfig"), (snap) => {
    const data = snap.val();
    if(data) {
      botAvatar = data.avatar || "";
      botName = data.username || "Tú (Bot)";
    }
  });

  // 2. Información del Servidor y Canales
  onValue(ref(db, "serverConfig"), (snap) => {
    const data = snap.val();
    if (!data) return;

    document.getElementById("serverTitle").innerText = data.serverName || "Servidor";
    document.getElementById("guildTooltip").innerText = data.serverName || "Servidor";
    
    if (data.serverIcon) {
      document.getElementById("guildIcon").innerHTML = `<img src="${data.serverIcon}">`;
    } else {
      document.getElementById("guildIcon").innerText = (data.serverName || "K")[0].toUpperCase();
    }

    const channelsList = document.getElementById("channelsList");
    channelsList.innerHTML = "";
    
    if (data.channels && data.channels.length > 0) {
      data.channels.forEach((ch, idx) => {
        const wrap = document.createElement("div");
        wrap.className = "channel-wrap";
        wrap.id = `wrap-${ch.id}`;

        const btn = document.createElement("div");
        btn.className = `channel-btn ${currentChannelId === ch.id || (!currentChannelId && idx === 0) ? 'active' : ''}`;
        btn.innerText = ch.name;
        
        const badge = document.createElement("div");
        badge.className = "unread-badge";
        badge.id = `badge-${ch.id}`;

        if (!currentChannelId && idx === 0) {
          switchChannel(ch.id, ch.name);
        }

        btn.onclick = () => switchChannel(ch.id, ch.name);
        
        wrap.appendChild(btn);
        wrap.appendChild(badge);
        channelsList.appendChild(wrap);
      });
    }
  });

  // 3. Cargar Miembros y Estados en Vivo
  onValue(ref(db, "serverMembers"), (snap) => {
    const members = snap.val();
    const container = document.getElementById("membersList");
    container.innerHTML = "";

    if (members) {
      Object.values(members).forEach(m => {
        const item = document.createElement("div");
        item.className = "member-item";

        const avContainer = document.createElement("div");
        avContainer.className = "member-avatar-container";

        const avHtml = m.avatar 
          ? `<img class="member-avatar" src="${m.avatar}">`
          : `<div class="member-avatar">${(m.nickname || m.username || "?")[0].toUpperCase()}</div>`;

        const dot = document.createElement("div");
        dot.className = `status-dot ${m.status || 'offline'}`;

        avContainer.innerHTML = avHtml;
        avContainer.appendChild(dot);

        const info = document.createElement("div");
        info.className = "member-info";
        info.innerHTML = `
          <div class="member-name">${m.nickname || m.username}</div>
          <div class="member-sub">${m.isBot ? '🤖 BOT' : `@${m.username}`}</div>
        `;

        item.appendChild(avContainer);
        item.appendChild(info);
        container.appendChild(item);
      });
    }
  });

  // 4. Estado de Escritura
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

  // Escuchar Mensajes entrantes
  onChildAdded(ref(db, "discordMessages"), (snap) => {
    processMessage(snap.val(), "discord");
  });

  onChildAdded(ref(db, "webMessages"), (snap) => {
    processMessage(snap.val(), "web");
  });
}

function switchChannel(id, name) {
  currentChannelId = id;
  document.getElementById("currentChannelName").innerText = name;
  
  const buttons = document.querySelectorAll(".channel-btn");
  buttons.forEach(btn => {
    if(btn.innerText === name) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  // Quitar el puntito rojo del canal al entrar
  const badge = document.getElementById(`badge-${id}`);
  if (badge) badge.style.display = "none";

  lastMessageDividerAdded = false;
  clearUnreadDividers();
  filterMessages();
}

function clearUnreadDividers() {
  const dividers = document.querySelectorAll(".unread-divider");
  dividers.forEach(d => d.remove());
}

function processMessage(data, type) {
  const targetChannelId = data.channelId || currentChannelId;
  
  // Alerta de Notificación si llega un mensaje a otro canal o estando inactivo
  if (targetChannelId !== currentChannelId || !isWindowFocused) {
    playNotificationSound();
    
    // Poner circulito rojo en la lista de canales si no estás ahí
    if (targetChannelId !== currentChannelId) {
      const badge = document.getElementById(`badge-${targetChannelId}`);
      if (badge) badge.style.display = "block";
    }

    // Actualizar bolita de notificación en la pestaña del navegador
    if (!isWindowFocused) {
      unreadCount++;
      document.title = `🔴 (${unreadCount}) KoriCord Futurist`;
    }
  }

  // Crear separador rojo de "No Leído" si corresponde
  if (!isWindowFocused && targetChannelId === currentChannelId && !lastMessageDividerAdded) {
    const divider = document.createElement("div");
    divider.className = "unread-divider";
    divider.innerHTML = "<span>NUEVOS MENSAJES</span>";
    divider.dataset.time = (data.timestamp || data.time) - 1; // Un milisegundo antes
    document.getElementById("messages").appendChild(divider);
    lastMessageDividerAdded = true;
  }

  const div = document.createElement("div");
  div.className = "msg";
  
  const msgTime = data.timestamp || data.time;
  div.dataset.time = msgTime;
  div.dataset.channelId = targetChannelId;
  
  const timeStr = new Date(msgTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  if (type === "discord") {
    const avatarHtml = (data.avatar && data.avatar.startsWith('http')) 
      ? `<img class="avatar" src="${data.avatar}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'avatar\\'>${(data.nickname || '?')[0].toUpperCase()}</div>';">`
      : `<div class="avatar">${(data.nickname || "?")[0].toUpperCase()}</div>`;

    div.innerHTML = `
      ${avatarHtml}
      <div class="content">
        <div class="top">
          <span class="name">${data.nickname || data.username}</span>
          <span class="time">${timeStr}</span>
        </div>
        <div class="username">@${data.username}</div>
        <div class="text">${data.text}</div>
      </div>
    `;
  } else {
    const webAvatarHtml = botAvatar 
      ? `<img class="avatar" src="${botAvatar}" onerror="this.style.display='none';">` 
      : `<div class="avatar">K</div>`;

    div.innerHTML = `
      ${webAvatarHtml}
      <div class="content">
        <div class="top">
          <span class="name">${botName}</span>
          <span class="time">${timeStr}</span>
        </div>
        <div class="text">${data.text}</div>
      </div>
    `;
  }

  const container = document.getElementById("messages");
  const children = Array.from(container.children);
  const nextSibling = children.find(child => parseInt(child.dataset.time) > msgTime);

  if (nextSibling) {
    container.insertBefore(div, nextSibling);
  } else {
    container.appendChild(div);
  }

  filterMessages();
}

function filterMessages() {
  const container = document.getElementById("messages");
  const children = container.children;
  
  for (let child of children) {
    if (!child.dataset.channelId || child.dataset.channelId === currentChannelId) {
      child.style.display = child.classList.contains("unread-divider") ? "flex" : "flex";
    } else {
      child.style.display = "none";
    }
  }
  container.scrollTop = container.scrollHeight;
}

// Enviar mensaje
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
