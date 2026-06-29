import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  off
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

let channelUnreadCounts = {};
let serverUnreadCounts = {};
let dmUnreadCounts = {};

let currentTypingListener = null;
let currentMessageListener = null;

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

  // Listener en segundo plano exclusivo para controlar Globos de Notificaciones de Servidores
  onValue(ref(db, "serverChannelMessages"), (snap) => {
    const allChannels = snap.val();
    if (!allChannels || !isWindowFocused) return;
    
    Object.keys(allChannels).forEach(chId => {
      if (chId !== currentChannelId) {
        // Encontrar a qué servidor pertenece este canal
        Object.values(serversData).forEach(srv => {
          const match = srv.channels?.find(c => c.id === chId);
          if (match && currentServerId !== srv.id) {
            serverUnreadCounts[srv.id] = (serverUnreadCounts[srv.id] || 0) + 1;
            const sBadge = document.getElementById(`server-badge-${srv.id}`);
            if (sBadge) { sBadge.innerText = serverUnreadCounts[srv.id]; sBadge.style.display = "block"; }
          }
        });

        channelUnreadCounts[chId] = (channelUnreadCounts[chId] || 0) + 1;
        const cBadge = document.getElementById(`badge-${chId}`);
        if (cBadge) { cBadge.innerText = channelUnreadCounts[chId]; cBadge.style.display = "block"; }
        playNotificationSound();
      }
    });
  });

  // Listener en segundo plano exclusivo para controlar Globos de Notificaciones de MDs
  onValue(ref(db, "dmMessages"), (snap) => {
    const allDms = snap.val();
    if (!allDms) return;

    Object.keys(allDms).forEach(userId => {
      if (currentServerId === "" && userId === currentChannelId) return; // Si estás dentro de su chat, ignorar globo
      
      dmUnreadCounts[userId] = (dmUnreadCounts[userId] || 0) + 1;
      const dmBadge = document.getElementById(`badge-dm-${userId}`);
      if (dmBadge) { dmBadge.innerText = dmUnreadCounts[userId]; dmBadge.style.display = "block"; }
      playNotificationSound();
    });
  });
  
  selectDMHome();
}

function renderServers() {
  const container = document.getElementById("guildsSidebar");
  container.innerHTML = "";

  Object.values(serversData).forEach((srv) => {
    const wrap = document.createElement("div");
    wrap.className = `guild-icon-wrap ${currentServerId === srv.id ? 'active' : ''}`;
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

    if (serverUnreadCounts[srv.id] && serverUnreadCounts[srv.id] > 0) {
      serverBadge.innerText = serverUnreadCounts[srv.id];
      serverBadge.style.display = "block";
    }

    wrap.onclick = () => {
      document.getElementById("dmHomeBtn").classList.remove("active");
      document.querySelectorAll(".guild-icon-wrap").forEach(w => w.classList.remove("active"));
      wrap.classList.add("active");
      selectServer(srv.id);
    };
    container.appendChild(wrap);
  });
}

window.selectDMHome = function() {
  currentServerId = "";
  document.querySelectorAll(".guild-icon-wrap").forEach(w => w.classList.remove("active"));
  document.getElementById("dmHomeBtn").classList.add("active");

  document.getElementById("serverTitle").innerText = "Mensajes directos";
  document.getElementById("serverSub").innerText = "Conversaciones directas";
  document.getElementById("chatHeaderPrefix").innerText = "@";
  document.getElementById("membersToggleBtn").style.display = "none";
  document.getElementById("membersSidebar").classList.add("hidden");

  document.getElementById("messages").innerHTML = "";
  currentChannelId = "";
  document.getElementById("currentChannelName").innerText = "selecciona-un-chat";

  onValue(ref(db, "dmChats"), (snap) => {
    renderDmChatsList(snap.val() || {});
  });
};

function renderDmChatsList(chats) {
  const channelsList = document.getElementById("channelsList");
  channelsList.innerHTML = "";

  const chatArray = Object.values(chats).sort((a,b) => b.lastMessageTime - a.lastMessageTime);
  if (chatArray.length === 0) {
    channelsList.innerHTML = `<div style="padding:10px; color:var(--text-muted); font-size:13px; text-align:center;">No hay MDs activos</div>`;
    return;
  }

  chatArray.forEach((chat, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "channel-wrap";

    const btn = document.createElement("div");
    btn.className = `channel-btn ${currentChannelId === chat.id ? 'active' : ''}`;
    
    const avHtml = chat.avatar 
      ? `<img class="dm-avatar-sidebar" src="${chat.avatar}">` 
      : `<div class="dm-avatar-sidebar">${chat.nickname[0].toUpperCase()}</div>`;

    btn.innerHTML = `${avHtml} <span>${chat.nickname}</span>`;
    
    const badge = document.createElement("div");
    badge.className = "unread-badge";
    badge.id = `badge-dm-${chat.id}`;

    if (!currentChannelId && idx === 0) {
      switchChatEnvironment(chat.id, chat.nickname, true);
    }

    if (dmUnreadCounts[chat.id] && dmUnreadCounts[chat.id] > 0) {
      badge.innerText = dmUnreadCounts[chat.id];
      badge.style.display = "block";
    }

    btn.onclick = () => switchChatEnvironment(chat.id, chat.nickname, true);
    wrap.appendChild(btn); wrap.appendChild(badge);
    channelsList.appendChild(wrap);
  });
}

function selectServer(serverId) {
  currentServerId = serverId;
  const srv = serversData[serverId];
  if (!srv) return;

  document.getElementById("serverTitle").innerText = srv.name;
  document.getElementById("chatHeaderPrefix").innerText = "#";
  document.getElementById("membersToggleBtn").style.display = "block";
  document.getElementById("messages").innerHTML = "";
  currentChannelId = "";

  serverUnreadCounts[serverId] = 0;
  const srvBadge = document.getElementById(`server-badge-${serverId}`);
  if (srvBadge) srvBadge.style.display = "none";

  const channelsList = document.getElementById("channelsList");
  channelsList.innerHTML = "";

  if (srv.channels && srv.channels.length > 0) {
    srv.channels.forEach((ch, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "channel-wrap";

      const btn = document.createElement("div");
      btn.className = `channel-btn channel-guild-btn ${idx === 0 ? 'active' : ''}`;
      btn.innerText = ch.name;
      
      const badge = document.createElement("div");
      badge.className = "unread-badge";
      badge.id = `badge-${ch.id}`;

      if (idx === 0) switchChatEnvironment(ch.id, ch.name, false);

      if (channelUnreadCounts[ch.id] && channelUnreadCounts[ch.id] > 0) {
        badge.innerText = channelUnreadCounts[ch.id];
        badge.style.display = "block";
      }

      btn.onclick = () => switchChatEnvironment(ch.id, ch.name, false);
      wrap.appendChild(btn); wrap.appendChild(badge);
      channelsList.appendChild(wrap);
    });
  }

  onValue(ref(db, `serverMembers/${currentServerId}`), (snap) => {
    renderMembers(snap.val());
  });
}

// REGLA DE ORO: Función unificada de carga de mensajes limpia para evitar duplicados y pérdidas de datos
function switchChatEnvironment(targetId, targetName, isDMEnvironment) {
  currentChannelId = targetId;
  document.getElementById("currentChannelName").innerText = targetName;

  document.querySelectorAll(".channel-btn").forEach(btn => {
    if (btn.innerText.trim() === targetName || btn.innerText === targetName) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  // Apagar y resetear contadores locales
  if (isDMEnvironment) {
    dmUnreadCounts[targetId] = 0;
    const b = document.getElementById(`badge-dm-${targetId}`); if (b) b.style.display = "none";
  } else {
    channelUnreadCounts[targetId] = 0;
    const b = document.getElementById(`badge-${targetId}`); if (b) b.style.display = "none";
  }

  // Desconectar escuchas anteriores para evitar fugas de memoria
  if (currentMessageListener) off(ref(db, currentMessageListener.path));
  if (currentTypingListener) off(ref(db, currentTypingListener.path));

  document.getElementById("messages").innerHTML = "";

  // Determinar la ruta exacta del canal seleccionado en Firebase
  const targetPath = isDMEnvironment ? `dmMessages/${targetId}` : `serverChannelMessages/${targetId}`;
  
  // Escucha Reactiva en tiempo real limpia y atómica
  currentMessageListener = onValue(ref(db, targetPath), (snap) => {
    document.getElementById("messages").innerHTML = "";
    const messagesData = snap.val();
    if (messagesData) {
      Object.values(messagesData).forEach(msg => {
        renderSingleMessageHTML(msg);
      });
    }
    const container = document.getElementById("messages");
    container.scrollTop = container.scrollHeight;
  });

  // Escucha del indicador de escritura de este canal
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

let cachedKoriProfile = null;
function renderMembers(members) {
  const container = document.getElementById("membersList");
  container.innerHTML = "";
  if (!members || !currentServerId) return;

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
      popout.style.top = `${Math.min(rect.top - 10, window.innerHeight - 260)}px`;
      
      let spotifyHtml = "";
      if (m.spotify) {
        const coverImg = m.spotify.image ? `<img class="spotify-img" src="${m.spotify.image}">` : `<div class="spotify-img">🎵</div>`;
        spotifyHtml = `
          <div>
            <div class="popout-section-title" style="color: var(--spotify);">Escuchando Spotify</div>
            <div class="popout-spotify-box">
              ${coverImg}
              <div class="spotify-info">
                <div class="spotify-song">${m.spotify.song}</div>
                <div class="spotify-artist">de ${m.spotify.artist}</div>
              </div>
            </div>
          </div>
        `;
      }

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
          ${spotifyHtml}
          ${m.activity && !m.spotify ? `<div><div class="popout-section-title">Actividad</div><div class="popout-text">${m.activity}</div></div>` : ''}
        </div>
      `;
      popout.style.display = "flex";
    };
    container.appendChild(item);
  });
}

function clearUnreadDividers() { document.querySelectorAll(".unread-divider").forEach(d => d.remove()); }

function renderSingleMessageHTML(data) {
  const div = document.createElement("div");
  div.className = "msg";
  const msgTime = data.timestamp || data.time;
  div.dataset.time = msgTime;

  let nameToShow = data.nickname || data.username;
  let avatarUrl = data.avatar;

  if (data.username === "WebUser") {
    if (cachedKoriProfile) {
      nameToShow = cachedKoriProfile.nickname || cachedKoriProfile.username;
      avatarUrl = cachedKoriProfile.avatar;
    } else {
      nameToShow = "Kori";
    }
  }

  const avatarHtml = (avatarUrl && avatarUrl.startsWith('http')) 
    ? `<img class="avatar" src="${avatarUrl}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'avatar\\'>${nameToShow[0]}</div>';">`
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
      ${data.username && data.username !== "WebUser" ? `<div class="username">@${data.username}</div>` : ''}
      <div class="text">${data.text}</div>
      ${attachmentsHtml}
    </div>
  `;

  document.getElementById("messages").appendChild(div);
}

window.sendMessage = async function(){
  const text = document.getElementById("msg").value;
  if(!text || !currentChannelId) return;
  clearUnreadDividers();

  const payload = {
    text: text,
    time: Date.now(),
    username: "WebUser",
    nickname: cachedKoriProfile ? cachedKoriProfile.nickname : "Kori"
  };

  if (currentServerId === "") {
    payload.isDM = true;
    payload.userId = currentChannelId;
    payload.channelId = currentChannelId;
    // Inyectar a tu propio nodo local ordenado de MDs
    await push(ref(db, `dmMessages/${currentChannelId}`), payload);
  } else {
    payload.channelId = currentChannelId;
    payload.guildId = currentServerId;
    // Inyectar al nodo local ordenado del canal del servidor
    await push(ref(db, `serverChannelMessages/${currentChannelId}`), payload);
  }

  // Despachar al bot para salida externa a Discord
  await push(ref(db,"webMessages"), payload);
  document.getElementById("msg").value = "";
};

document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.sendMessage();
});
