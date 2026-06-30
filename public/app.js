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

let channelUnreadCounts = {};
let serverUnreadCounts = {};
let currentTypingListener = null;

const popout = document.createElement("div");
popout.className = "profile-popout";
document.body.appendChild(popout);

document.addEventListener("click", (e) => {
  if (!popout.contains(e.target) && !e.target.closest(".member-item")) {
    popout.style.display = "none";
  }
  clearUnreadDividers();
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
  onValue(ref(db, "botConfig"), (snap) => {
    const data = snap.val();
    if(data) botId = data.id || "";
  });

  onValue(ref(db, "serverConfig"), (snap) => {
    serversData = snap.val() || {};
    renderServers();
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
    wrap.id = `server-wrap-${srv.id}`;
    
    const iconHtml = srv.icon ? `<img src="${srv.icon}">` : `<div>${srv.name[0].toUpperCase()}</div>`;
    const serverBadge = document.createElement("div");
    serverBadge.className = "unread-badge";
    serverBadge.id = `server-badge-${srv.id}`;

    wrap.innerHTML = `
      <div class="guild-icon">${iconHtml}</div>
      <span class="guild-tooltip">${srv.name}</span>
    `;
    wrap.appendChild(serverBadge);

    if (serverUnreadCounts[srv.id] && serverUnreadCounts[srv.id] > 0 && currentServerId !== srv.id) {
      serverBadge.innerText = serverUnreadCounts[srv.id];
      serverBadge.style.display = "block";
    }

    if (!currentServerId && idx === 0) selectServer(srv.id);

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
  serverUnreadCounts[serverId] = 0;
  const srvBadge = document.getElementById(`server-badge-${serverId}`);
  if (srvBadge) srvBadge.style.display = "none";

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

      if (idx === 0) switchChannel(ch.id, ch.name);

      if (channelUnreadCounts[ch.id] && channelUnreadCounts[ch.id] > 0 && currentChannelId !== ch.id) {
        badge.innerText = channelUnreadCounts[ch.id];
        badge.style.display = "block";
      }

      btn.onclick = () => switchChannel(ch.id, ch.name);
      wrap.appendChild(btn); wrap.appendChild(badge);
      channelsList.appendChild(wrap);
    });
  }

  onValue(ref(db, `serverMembers/${currentServerId}`), (snap) => {
    renderMembers(snap.val());
  });
}

let cachedKoriProfile = null;
function renderMembers(members) {
  const container = document.getElementById("membersList");
  container.innerHTML = "";
  if (!members) return;

  Object.values(members).forEach(m => {
    if (m.id === botId) cachedKoriProfile = m;

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
    
    const subText = m.customStatus ? m.customStatus : (m.isBot ? '🤖 BOT' : `@${m.username}`);

    info.innerHTML = `
      <div class="member-name">${m.nickname || m.username}</div>
      <div class="member-sub">${subText}</div>
    `;

    item.appendChild(avContainer); item.appendChild(info);

    item.onclick = (e) => {
      e.stopPropagation();
      const rect = item.getBoundingClientRect();
      popout.style.top = `${Math.min(rect.top - 10, window.innerHeight - 340)}px`;
      
      // Contenedor acumulativo de actividades múltiples
      let activitiesHtml = "";

      // 1. SECCIÓN SPOTIFY (Diseño Mejorado Estilo Discord Premium)
      if (m.spotify) {
        const coverImg = m.spotify.image ?
          `<img class="activity-img spotify-glow" src="${m.spotify.image}">` : `<div class="activity-img-placeholder spotify-bg">🎵</div>`;
        activitiesHtml += `
          <div class="activity-block">
            <div class="popout-section-title status-spotify">ESCUCHANDO SPOTIFY</div>
            <div class="popout-activity-box">
              <div class="activity-img-wrap">${coverImg}</div>
              <div class="activity-info">
                <div class="activity-title text-spotify">${m.spotify.song}</div>
                <div class="activity-details">de ${m.spotify.artist}</div>
                ${m.spotify.album ? `<div class="activity-details style-muted">en ${m.spotify.album}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }

      // 2. SECCIÓN DE LLAMADA O VOZ
      if (m.voice || (m.activity && (m.activity.toLowerCase().includes("llamada") || m.activity.toLowerCase().includes("en voz")))) {
        const voiceTitle = m.voice?.channelName || m.activity;
        activitiesHtml += `
          <div class="activity-block">
            <div class="popout-section-title status-voice">EN LLAMADA DE VOZ</div>
            <div class="popout-activity-box">
              <div class="activity-img-wrap">
                <div class="activity-img-placeholder voice-bg">🔊</div>
              </div>
              <div class="activity-info">
                <div class="activity-title">${voiceTitle}</div>
                <div class="activity-details style-muted">${m.voice?.serverName || 'Canal de voz activo'}</div>
              </div>
            </div>
          </div>
        `;
      }

      // 3. SECCIÓN JUEGOS O ACTIVIDAD GENERAL (Soporta renderizar en paralelo a Spotify)
      // Filtramos si la actividad ya fue mapeada arriba para no duplicar
      if (m.activity && (!m.spotify || !m.activity.toLowerCase().includes("spotify")) && !m.activity.toLowerCase().includes("llamada") && !m.activity.toLowerCase().includes("en voz")) {
        activitiesHtml += `
          <div class="activity-block">
            <div class="popout-section-title status-game">JUGANDO A</div>
            <div class="popout-activity-box">
              <div class="activity-img-wrap">
                <div class="activity-img-placeholder game-bg">🎮</div>
              </div>
              <div class="activity-info">
                <div class="activity-title">${m.activity}</div>
                <div class="activity-details">Jugando ahora mismo</div>
              </div>
            </div>
          </div>
        `;
      }

      // 4. NUEVO: Soporte si viene una lista nativa de múltiples actividades en un array m.activities
      if (Array.isArray(m.activities)) {
        m.activities.forEach(act => {
          if(act.type === 'spotify') return; // Evitar duplicar si ya se manejó arriba
          let icon = "🎮";
          let badgeClass = "status-game";
          let bgClass = "game-bg";
          if(act.type === 'voice') { icon = "🔊"; badgeClass = "status-voice"; bgClass = "voice-bg"; }
          
          activitiesHtml += `
            <div class="activity-block">
              <div class="popout-section-title ${badgeClass}">${act.header || 'ACTIVIDAD'}</div>
              <div class="popout-activity-box">
                <div class="activity-img-wrap">
                  ${act.image ? `<img class="activity-img" src="${act.image}">` : `<div class="activity-img-placeholder ${bgClass}">${icon}</div>`}
                </div>
                <div class="activity-info">
                  <div class="activity-title">${act.name}</div>
                  ${act.details ? `<div class="activity-details">${act.details}</div>` : ''}
                  ${act.state ? `<div class="activity-details style-muted">${act.state}</div>` : ''}
                </div>
              </div>
            </div>
          `;
        });
      }

      popout.innerHTML = `
        <div class="popout-banner" style="background-color: ${m.bannerColor || '#5865f2'};"></div>
        <div class="popout-avatar-wrap">
          ${m.avatar ?
            `<img class="popout-avatar" src="${m.avatar}">` : `<div class="popout-avatar">${m.nickname[0]}</div>`}
        </div>
        <div class="popout-body">
          <div class="popout-names">
            <div class="popout-nick">${m.nickname || m.username}</div>
            <div class="popout-user">@${m.username}</div>
          </div>
          ${m.customStatus ?
            `<div><div class="popout-section-title">Estado Personalizado</div><div class="popout-text">${m.customStatus}</div></div>` : ''}
          
          <div class="popout-activities-wrapper">
            ${activitiesHtml}
          </div>
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

  channelUnreadCounts[id] = 0;
  const badge = document.getElementById(`badge-${id}`);
  if (badge) badge.style.display = "none";

  lastMessageDividerAdded = false;
  clearUnreadDividers();
  filterMessages();

  if (currentTypingListener) currentTypingListener();
  currentTypingListener = onValue(ref(db, `typingStatus/${currentChannelId}`), (snap) => {
    const data = snap.val();
    const indicator = document.getElementById("typing");
    if (data && data.isTyping && data.user !== cachedKoriProfile?.nickname) {
      indicator.innerText = `${data.user} está escribiendo...`;
      indicator.style.opacity = "1";
    } else {
      indicator.innerText = "";
      indicator.style.opacity = "0";
    }
  });
}

function clearUnreadDividers() { document.querySelectorAll(".unread-divider").forEach(d => d.remove()); }

function processMessage(data, type) {
  const targetChannelId = data.channelId || currentChannelId;
  const targetGuildId = data.guildId || "";
  
  if (type !== "web" && (targetChannelId !== currentChannelId || !isWindowFocused)) {
    playNotificationSound();
    if (targetChannelId !== currentChannelId) {
      channelUnreadCounts[targetChannelId] = (channelUnreadCounts[targetChannelId] || 0) + 1;
      const badge = document.getElementById(`badge-${targetChannelId}`);
      if (badge) {
        badge.innerText = channelUnreadCounts[targetChannelId];
        badge.style.display = "block";
      }
    }

    if (targetGuildId && targetGuildId !== currentServerId) {
      serverUnreadCounts[targetGuildId] = (serverUnreadCounts[targetGuildId] || 0) + 1;
      const srvBadge = document.getElementById(`server-badge-${targetGuildId}`);
      if (srvBadge) {
        srvBadge.innerText = serverUnreadCounts[targetGuildId];
        srvBadge.style.display = "block";
      }
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

  let nameToShow = data.nickname || data.username;
  let avatarUrl = data.avatar;
  if (type === "web" || data.authorId === botId || data.username === "WebUser") {
    if (cachedKoriProfile) {
      nameToShow = cachedKoriProfile.nickname || cachedKoriProfile.username;
      avatarUrl = cachedKoriProfile.avatar;
    } else {
      nameToShow = nameToShow || "Kori";
    }
  }

  const avatarHtml = (avatarUrl && avatarUrl.startsWith('http')) 
    ?
    `<img class="avatar" src="${avatarUrl}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'avatar\\'>${nameToShow[0]}</div>';">`
    : `<div class="avatar">${nameToShow ? nameToShow[0].toUpperCase() : "K"}</div>`;
  const timeStr = new Date(msgTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

  let attachmentsHtml = "";
  if (data.attachments && data.attachments.length > 0) {
    data.attachments.forEach(file => {
      if (file.contentType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.url)) {
        attachmentsHtml += `<div class="media-attachment"><img src="${file.url}"></div>`;
      } else if (file.contentType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(file.url)) {
        attachmentsHtml += `<div class="media-attachment"><video src="${file.url}" controls></video></div>`;
      }
    });
  }

  div.innerHTML = `
    ${avatarHtml}
    <div class="content">
      <div class="top">
        <span class="name">${nameToShow}</span>
        <span class="time">${timeStr}</span>
      </div>
      ${data.username && data.username !== "WebUser" ?
        `<div class="username">@${data.username}</div>` : ''}
      <div class="text">${data.text}</div>
      ${attachmentsHtml}
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

window.sendMessage = async function(){
  const text = document.getElementById("msg").value;
  if(!text) return;
  clearUnreadDividers();
  await push(ref(db,"webMessages"), {
    text: text,
    time: Date.now(),
    username: "WebUser",
    nickname: "Kori",
    channelId: currentChannelId,
    guildId: currentServerId
  });
  document.getElementById("msg").value="";
};

document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.sendMessage();
});
