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
let dmUnreadCounts = {};
let currentTypingListener = null;
let currentDmMessageListener = null;

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

    if (serverUnreadCounts[srv.id] && serverUnreadCounts[srv.id] > 0 && currentServerId !== srv.id) {
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

  if (currentDmMessageListener) { currentDmMessageListener(); currentDmMessageListener = null; }

  onValue(ref(db, "dmChats"), (snap) => {
    const chats = snap.val() || {};
    renderDmChatsList(chats);
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
      switchDmUser(chat.id, chat.nickname);
    }

    if (dmUnreadCounts[chat.id] && dmUnreadCounts[chat.id] > 0 && currentChannelId !== chat.id) {
      badge.innerText = dmUnreadCounts[chat.id];
      badge.style.display = "block";
    }

    btn.onclick = () => switchDmUser(chat.id, chat.nickname);
    wrap.appendChild(btn); wrap.appendChild(badge);
    channelsList.appendChild(wrap);
  });
}

function switchDmUser(userId, name) {
  currentChannelId = userId;
  document.getElementById("currentChannelName").innerText = name;

  document.querySelectorAll(".channel-btn").forEach(btn => {
    if(btn.innerText.trim() === name) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  dmUnreadCounts[userId] = 0;
  const badge = document.getElementById(`badge-dm-${userId}`);
  if (badge) badge.style.display = "none";

  lastMessageDividerAdded = false;
  clearUnreadDividers();
  
  document.getElementById("messages").innerHTML = "";
  if (currentDmMessageListener) currentDmMessageListener();

  currentDmMessageListener = onValue(ref(db, `dmMessages/${userId}`), (snap) => {
    document.getElementById("messages").innerHTML = "";
    const msgs = snap.val();
    if (msgs) {
      Object.values(msgs).forEach(msg => {
        processMessage(msg, msg.username === "WebUser" ? "web" : "discord");
      });
    }
  });

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

function selectServer(serverId) {
  currentServerId = serverId;
  const srv = serversData[serverId];
  if (!srv) return;

  document.getElementById("serverTitle").innerText = srv.name;
  document.getElementById("chatHeaderPrefix").innerText = "#";
  document.getElementById("membersToggleBtn").style.display = "block";

  // REGLA DE ORO: Ya NO borramos .innerHTML de mensajes aquí para que los guardados en caché persistan
  currentChannelId = "";

  if (currentDmMessageListener) { currentDmMessageListener(); currentDmMessageListener = null; }

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

function switchChannel(id, name) {
  currentChannelId = id;
  document.getElementById("currentChannelName").innerText = name;
  if (currentDmMessageListener) { currentDmMessageListener(); currentDmMessageListener = null; }
  
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
  const isMessageDM = data.userId ? true : false;
  
  if (type !== "web" && data.username !== "WebUser" && (isMessageDM ? currentServerId !== "" || currentChannelId !== data.userId : targetChannelId !== currentChannelId || !isWindowFocused)) {
    playNotificationSound();
    
    if (isMessageDM) {
      dmUnreadCounts[data.userId] = (dmUnreadCounts[data.userId] || 0) + 1;
      const badge = document.getElementById(`badge-dm-${data.userId}`);
      if (badge) {
        badge.innerText = dmUnreadCounts[data.userId];
        badge.style.display = "block";
      }
    } else {
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
    }

    if (!isWindowFocused) {
      unreadCount++;
      document.title = `🔴 (${unreadCount}) KoriCord Futurist`;
    }
  }

  if (!isMessageDM && currentServerId === "") return;
  if (isMessageDM && currentServerId !== "") return;

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

  if (!isWindowFocused && targetChannelId === currentChannelId && !lastMessageDividerAdded) {
    const divider = document.createElement("div");
    divider.className = "unread-divider";
    divider.innerHTML = "<span>NUEVOS MENSAJES</span>";
    divider.dataset.time = msgTime - 1;
    document.getElementById("messages").appendChild(divider);
    lastMessageDividerAdded = true;
  }

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
    if (currentServerId === "") {
      child.style.display = "flex"; 
    } else {
      if (child.dataset.channelId === currentChannelId || child.classList.contains("unread-divider")) {
        child.style.display = "flex";
      } else {
        child.style.display = "none";
      }
    }
  }
  container.scrollTop = container.scrollHeight;
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
    await push(ref(db, `dmMessages/${currentChannelId}`), payload);
  }

  payload.channelId = currentChannelId;
  payload.guildId = currentServerId;
  await push(ref(db,"webMessages"), payload);

  document.getElementById("msg").value="";
};

document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") window.sendMessage();
});
