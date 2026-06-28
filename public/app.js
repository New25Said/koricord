import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyARq5j8Kf9p4SYj4sj3167BjVD-Q4KczQE",
  authDomain: "koricord-a5f4e.firebaseapp.com",
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com",
  projectId: "koricord-a5f4e",
  storageBucket: "koricord-a5f4e.appspot.com",
  messagingSenderId: "228519016518",
  appId: "1:228519016518:web:9062449c2b5135ee36b247"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let localMessages = [];
let cacheUsers = {};
let isDMMode = true; 
let currentGuildId = "DM"; 
let currentChannelId = "";
let currentChannelsRef = null;
let currentStatusRef = null;

// Funciones de utilidad
function parseMarkdown(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
    .replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function clearAppDOM() {
  localMessages = [];
  document.getElementById("messages").innerHTML = "";
  document.getElementById("channels-container").innerHTML = "";
  document.getElementById("sidebarRightColumn").innerHTML = "";
  document.getElementById("typing").innerText = "";
  if (currentChannelsRef) currentChannelsRef.off();
  if (currentStatusRef) currentStatusRef.off();
}

// Render de Mensajes
function renderMessages() {
  const box = document.getElementById("messages");
  box.innerHTML = "";
  if(!currentChannelId) {
    document.getElementById("placeholderView").style.display = "flex";
    document.getElementById("mainChatContent").style.display = "none";
    return;
  }
  document.getElementById("placeholderView").style.display = "none";
  document.getElementById("mainChatContent").style.display = "flex";
  
  const filtered = localMessages.filter(m => m.channelId === currentChannelId);
  filtered.sort((a,b) => a.timestamp - b.timestamp);

  filtered.forEach(m => {
    const div = document.createElement("div"); div.className = "msg";
    div.innerHTML = `
      <div class="avatar-container"><div class="avatar">${m.avatar ? `<img src="${m.avatar}">` : (m.nickname || "K")[0]}</div></div>
      <div class="msg-content">
        <div class="top"><span class="name" onclick="openProfileFromMessage('${m.username}')">${m.nickname || m.username}</span><span class="time">${new Date(m.timestamp).toLocaleTimeString()}</span></div>
        <div class="text">${parseMarkdown(m.text)}</div>
      </div>`;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}

// Lógica de navegación
window.selectDMMode = () => {
  isDMMode = true; currentGuildId = "DM"; currentChannelId = "";
  document.querySelectorAll('.guild-icon').forEach(i => i.classList.remove('active'));
  document.getElementById("dmServerBtn").classList.add('active');
  clearAppDOM();
  loadChannelsAndMembers();
};

function loadChannelsAndMembers() {
  const channelContainer = document.getElementById("channels-container");
  if (isDMMode) {
    document.getElementById("currentGuildName").innerText = "Mensajes Directos";
    currentChannelsRef = ref(db, "dmChannels");
    onValue(currentChannelsRef, snap => {
      channelContainer.innerHTML = ""; cacheUsers = snap.val() || {};
      Object.values(cacheUsers).forEach(dm => {
        const btn = document.createElement("div");
        btn.className = `channel-btn ${dm.id === currentChannelId ? 'active' : ''}`;
        btn.innerHTML = `<div class="avatar-container" style="width:32px;height:32px;"><div class="avatar" style="width:32px;height:32px;font-size:12px;">${dm.avatar ? `<img src="${dm.avatar}">`:dm.name[0]}</div><div class="status-dot status-${dm.status||'offline'}" style="width:10px;height:10px;border:2px solid #2b2d31;"></div></div><div style="font-weight:500;">${dm.name}</div>`;
        btn.onclick = () => { currentChannelId = dm.id; renderMessages(); renderRightSidebar(); };
        channelContainer.appendChild(btn);
      });
      renderMessages();
    });
  } else {
    currentChannelsRef = ref(db, `channels/${currentGuildId}`);
    onValue(currentChannelsRef, snap => {
      channelContainer.innerHTML = "";
      Object.values(snap.val() || {}).forEach(ch => {
        const btn = document.createElement("div"); btn.className = "channel-btn is-channel"; btn.innerText = ch.name;
        btn.onclick = () => { currentChannelId = ch.id; renderMessages(); };
        channelContainer.appendChild(btn);
      });
    });
    currentStatusRef = ref(db, `usersStatus/${currentGuildId}`);
    onValue(currentStatusRef, snap => { cacheUsers = snap.val() || {}; renderRightSidebar(); });
  }
}

function renderRightSidebar() {
  const sidebar = document.getElementById("sidebarRightColumn"); sidebar.innerHTML = "";
  if (isDMMode && currentChannelId) {
    const u = cacheUsers[currentChannelId];
    sidebar.innerHTML = `<div class="sidebar-dm-profile"><div class="side-banner"><div class="side-avatar-wrapper"><div class="side-avatar">${u.avatar?`<img src="${u.avatar}">`:u.name[0]}</div></div></div><div class="side-profile-header"><div class="side-nick">${u.name} <span class="side-app-badge">BOT</span></div><div class="side-user">@${u.username}</div></div><div class="side-body"><div class="side-sub-title">Biografía</div><div class="side-box">${u.bio||"Sin biografía."}</div></div></div>`;
  } else if (!isDMMode) {
    sidebar.innerHTML = '<div class="member-title">Miembros</div>';
    Object.values(cacheUsers).forEach(u => {
      const card = document.createElement("div"); card.className = "member-card";
      card.innerHTML = `<div class="avatar-container" style="width:32px;height:32px;"><div class="avatar" style="width:32px;height:32px;font-size:14px;">${u.avatar?`<img src="${u.avatar}">`:u.nickname[0]}</div><div class="status-dot status-${u.status||'offline'}" style="width:10px;height:10px;border:2px solid #2b2d31;"></div></div><div class="user-info-sidebar"><span class="member-nick">${u.nickname}</span></div>`;
      sidebar.appendChild(card);
    });
  }
}

// Conectores de Firebase
onChildAdded(ref(db, "discordMessages"), snap => { localMessages.push(snap.val()); renderMessages(); });
onChildAdded(ref(db, "webMessages"), snap => { localMessages.push({ text:snap.val().text, nickname:"Kori", username:"soykori", timestamp:snap.val().time, channelId:snap.val().channelId }); renderMessages(); });

// Typing & Send
document.getElementById("msg").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const val = document.getElementById("msg").value;
    if(!val.trim()) return;
    push(ref(db, "webMessages"), { text: val, time: Date.now(), channelId: currentChannelId });
    document.getElementById("msg").value = "";
  }
});

// Inicialización de Servidores
onValue(ref(db, "guilds"), snap => {
  const container = document.getElementById("guildsContainer"); container.innerHTML = "";
  Object.values(snap.val() || {}).forEach(g => {
    const icon = document.createElement("div"); icon.className = "guild-icon";
    icon.innerHTML = g.iconUrl ? `<img src="${g.iconUrl}">` : g.name[0];
    icon.onclick = () => { isDMMode=false; currentGuildId=g.id; currentChannelId=""; clearAppDOM(); loadChannelsAndMembers(); };
    container.appendChild(icon);
  });
});
