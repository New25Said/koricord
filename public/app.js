import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue, set } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";

// Configuración de Firebase (Se mantiene intacta y segura)
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

// Estado de la Aplicación Global
let localMessages = [];
let cacheUsers = {};
let isDMMode = true; 
let currentGuildId = "DM"; 
let currentChannelId = "";

// Referencias activas de Firebase para poder apagarlas y evitar fugas de memoria/fantasmas
let currentChannelsRef = null;
let currentStatusRef = null;
let currentGuildNameRef = null;

// Auxiliares de Renderizado
function escapeHTML(text) { 
  return text ? text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : ""; 
}

function parseMarkdown(text) {
  return escapeHTML(text)
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<u>$1</u>')
    .replace(/\*([\s\S]+?)\*\*/g, '<em>$1</em>') // Fix marcador itálica alternativo
    .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
    .replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Control de Login de Usuario
document.getElementById("loginBtn").addEventListener("click", () => {
  const val = document.getElementById("code").value;
  if (val === "soykori") {
    document.getElementById("login").style.display = "none";
    document.getElementById("app").style.display = "flex";
    selectDMMode();
  } else {
    document.getElementById("err").innerText = "Código incorrecto.";
  }
});

// Desactivar escuchadores de Firebase anteriores para evitar solapamientos de datos
function detachPreviousListeners() {
  if (currentChannelsRef) currentChannelsRef.off();
  if (currentStatusRef) currentStatusRef.off();
  if (currentGuildNameRef) currentGuildNameRef.off();
}

// Limpieza total y forzada del DOM y variables
function clearAppDOM() {
  localMessages = [];
  document.getElementById("messages").innerHTML = "";
  document.getElementById("channels-container").innerHTML = "";
  document.getElementById("sidebarRightColumn").innerHTML = "";
  document.getElementById("typing").innerText = "";
}

// Renderizador Unificado de Mensajes en el Chat
function renderMessages() {
  const box = document.getElementById("messages");
  box.innerHTML = "";
  document.getElementById("typing").innerText = "";

  if (!currentChannelId) {
    document.getElementById("placeholderView").style.display = "flex";
    document.getElementById("mainChatContent").style.display = "none";
    renderRightSidebar();
    return;
  }
  
  document.getElementById("placeholderView").style.display = "none";
  document.getElementById("mainChatContent").style.display = "flex";
  
  const filtered = localMessages.filter(m => m.channelId === currentChannelId);
  filtered.sort((a, b) => a.timestamp - b.timestamp);

  filtered.forEach(m => {
    const div = document.createElement("div"); 
    div.className = "msg";
    const avatarHtml = m.avatar ? `<img src="${m.avatar}">` : (m.nickname || m.username || "K")[0];
    
    let attachmentHtml = "";
    if (m.attachments) {
      m.attachments.forEach(att => {
        if (att.type === "image") attachmentHtml += `<div class="media-attachment"><img src="${att.url}"></div>`;
        if (att.type === "video") attachmentHtml += `<div class="media-attachment"><video src="${att.url}" controls></video></div>`;
      });
    }

    div.innerHTML = `
      <div class="avatar-container">
        <div class="avatar">${avatarHtml}</div>
      </div>
      <div class="msg-content">
        <div class="top">
          <span class="name" data-username="${m.username}">${m.nickname || m.username}</span>
          <span class="time">${new Date(m.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="text">${parseMarkdown(m.text)}</div>
        ${attachmentHtml}
      </div>`;
    
    // Evento nativo para abrir el perfil al hacer clic en el nombre del remitente
    div.querySelector(".name").addEventListener("click", () => {
      openProfileFromMessage(m.username);
    });

    box.appendChild(div);
  });
  
  box.scrollTop = box.scrollHeight;
  renderRightSidebar();
}

// Renderizador Dinámico de la Columna Derecha (Miembros o Info de Perfil de Bot en MD)
function renderRightSidebar() {
  const sidebar = document.getElementById("sidebarRightColumn");
  sidebar.innerHTML = "";

  if (isDMMode) {
    if (!currentChannelId || !cacheUsers[currentChannelId]) {
      sidebar.innerHTML = `
        <div class="member-title">Lista de MDs</div>
        <div style="padding:16px; color:#949ba4; font-size:13px; line-height: 1.4;">
          Selecciona una conversación privada de la barra izquierda para inspeccionar su perfil detallado.
        </div>`;
      return;
    }
    
    const activeUser = cacheUsers[currentChannelId];
    const statusClass = "status-" + (activeUser.status || "offline");
    const statusMap = { online: "En línea", idle: "Ausente", dnd: "No molestar", offline: "Desconectado" };
    const friendlyStatus = statusMap[activeUser.status || "offline"];
    const bioText = activeUser.bio || "Este usuario no ha definido ninguna descripción en su perfil de KoriCord todavía.";
    const creationDate = activeUser.joinedAt ? new Date(activeUser.joinedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : "6 jun 2026";

    sidebar.innerHTML = `
      <div class="sidebar-dm-profile">
        <div class="side-banner">
          <div class="side-avatar-wrapper">
            <div class="side-avatar">
              ${activeUser.avatar ? `<img src="${activeUser.avatar}">` : activeUser.name[0]}
            </div>
            <div class="status-dot ${statusClass}" style="width:16px; height:16px; border:4px solid #18191c; bottom:2px; right:2px;"></div>
          </div>
        </div>
        <div class="side-profile-header">
          <div class="side-nick">${activeUser.name} <span class="side-app-badge">BOT</span></div>
          <div class="side-user">@${activeUser.username || 'usuario'}</div>
        </div>
        <div class="side-body">
          <div>
            <div class="side-sub-title">Estado</div>
            <div style="font-size:13px; color:#dbdee1; margin-bottom:12px;">${friendlyStatus}</div>
          </div>
          <div>
            <div class="side-sub-title">Biografía</div>
            <div class="side-box">${bioText}</div>
          </div>
          <div>
            <div class="side-sub-title">Miembro Desde</div>
            <div style="color:#dbdee1; font-size:13px;">${creationDate}</div>
          </div>
        </div>
      </div>`;
  } else {
    // Modo Servidores: Mostrar lista jerárquica de miembros reales
    const title = document.createElement("div"); 
    title.className = "member-title"; 
    title.innerText = "Miembros del Servidor";
    sidebar.appendChild(title);

    Object.values(cacheUsers).forEach(u => {
      const card = document.createElement("div"); 
      card.className = "member-card";
      const statusClass = "status-" + (u.status || "offline");
      const activityHtml = u.activity ? `<span class="member-activity">${u.activity}</span>` : "";
      
      card.innerHTML = `
        <div class="avatar-container" style="width:32px; height:32px;">
          <div class="avatar" style="width:32px; height:32px; font-size:14px;">
            ${u.avatar ? `<img src="${u.avatar}">` : u.nickname[0]}
          </div>
          <div class="status-dot ${statusClass}" style="width:10px; height:10px; border:2px solid #2b2d31;"></div>
        </div>
        <div class="user-info-sidebar">
          <span class="member-nick">${u.nickname}</span>
          ${activityHtml}
        </div>
      `;
      card.addEventListener("click", () => openProfile(u.uid || u.id));
      sidebar.appendChild(card);
    });
  }
}

// Carga Dinámica Reactiva de Canales de Servidores o MDs Nativo
function loadChannelsAndMembers() {
  detachPreviousListeners();
  const channelContainer = document.getElementById("channels-container");
  channelContainer.innerHTML = "";

  if (isDMMode) {
    document.getElementById("currentGuildName").innerText = "Mensajes Directos";
    
    currentChannelsRef = ref(db, "dmChannels");
    onValue(currentChannelsRef, snap => {
      if (!isDMMode) return; // Salvaguarda anti-cambios rápidos
      channelContainer.innerHTML = ""; 
      const dms = snap.val(); 
      if (!dms) { cacheUsers = {}; renderRightSidebar(); return; }
      
      cacheUsers = dms;
      Object.values(dms).forEach(dm => {
        const btn = document.createElement("div");
        btn.className = `channel-btn ${dm.id === currentChannelId ? 'active' : ''}`;
        const statusClass = "status-" + (dm.status || "offline");
        
        btn.innerHTML = `
          <div class="avatar-container" style="width:32px; height:32px;">
            <div class="avatar" style="width:32px; height:32px; font-size:12px;">
              ${dm.avatar ? `<img src="${dm.avatar}">` : dm.name[0]}
            </div>
            <div class="status-dot ${statusClass}" style="width:10px; height:10px; border:2px solid #2b2d31;"></div>
          </div>
          <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; font-weight:500;">${dm.name}</div>
        `;
        
        btn.onclick = () => {
          currentChannelId = dm.id;
          document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderMessages();
        };
        channelContainer.appendChild(btn);
      });
      renderRightSidebar();
    });
  } else {
    // MODO SERVIDORES NORMAL
    currentGuildNameRef = ref(db, `guilds/${currentGuildId}/name`);
    onValue(currentGuildNameRef, snap => { 
      if (snap.val()) document.getElementById("currentGuildName").innerText = snap.val(); 
    });
    
    currentChannelsRef = ref(db, `channels/${currentGuildId}`);
    onValue(currentChannelsRef, snap => {
      if (isDMMode) return;
      channelContainer.innerHTML = ""; 
      const channels = snap.val(); 
      if (!channels) return;
      
      let firstChannel = true;
      Object.values(channels).forEach(ch => {
        const btn = document.createElement("div");
        btn.className = `channel-btn is-channel ${ch.id === currentChannelId ? 'active' : ''}`;
        btn.innerText = ch.name;
        
        btn.onclick = () => {
          currentChannelId = ch.id;
          document.querySelectorAll('.channel-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderMessages();
        };
        channelContainer.appendChild(btn);
        
        if (firstChannel && !currentChannelId) {
          currentChannelId = ch.id;
          btn.classList.add('active');
          renderMessages();
          firstChannel = false;
        }
      });
    });

    currentStatusRef = ref(db, `usersStatus/${currentGuildId}`);
    onValue(currentStatusRef, snap => {
      if (isDMMode) return;
      cacheUsers = snap.val() || {};
      renderRightSidebar();
    });
  }
}

// Cambiar a Modo de Mensajes Directos (Por defecto al iniciar)
function selectDMMode() {
  isDMMode = true; 
  currentGuildId = "DM"; 
  currentChannelId = "";
  
  document.querySelectorAll('.guild-icon').forEach(i => i.classList.remove('active'));
  document.getElementById("dmServerBtn").classList.add('active');
  
  clearAppDOM();
  renderMessages();
  loadChannelsAndMembers();
}
window.selectDMMode = selectDMMode;

// Escuchadores Globales para alimentar el flujo de Mensajería cruzada
onChildAdded(ref(db, "discordMessages"), snap => {
  const msgData = snap.val();
  if (msgData) {
    localMessages.push(msgData);
    renderMessages();
  }
});

onChildAdded(ref(db, "webMessages"), snap => {
  const data = snap.val();
  if (data) {
    localMessages.push({ 
      text: data.text, 
      nickname: "Kori", 
      username: "soykori", 
      timestamp: data.time, 
      channelId: data.channelId,
      avatar: null 
    });
    renderMessages();
  }
});

// Modales de Perfil Expandidos Avanzados
window.openProfile = (uid) => {
  const u = cacheUsers[uid]; 
  if (!u) return;
  const statusMap = { online: "En línea 🟢", idle: "Ausente 🌙", dnd: "No molestar ⛔", offline: "Desconectado 👤" };
  
  document.getElementById("modalAvatar").innerHTML = u.avatar ? `<img src="${u.avatar}">` : (u.nickname || u.name || "K")[0];
  document.getElementById("modalNick").innerText = u.nickname || u.name;
  document.getElementById("modalUser").innerText = "@" + (u.username || "usuario");
  document.getElementById("modalStatusText").innerText = statusMap[u.status || "offline"];
  document.getElementById("modalActivity").innerText = u.activity || "Ninguna";
  document.getElementById("modalJoined").innerText = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : "6 jun 2026";
  
  const rolesBox = document.getElementById("modalRoles"); 
  rolesBox.innerHTML = "";
  if (u.roles && u.roles.length) { 
    u.roles.forEach(r => { 
      const b = document.createElement("span"); 
      b.className = "role-badge"; 
      b.innerText = r; 
      rolesBox.appendChild(b); 
    }); 
  } else { 
    rolesBox.innerText = "Ninguno"; 
  }
  
  document.getElementById("profileModal").style.display = "flex";
};

function openProfileFromMessage(username) {
  const found = Object.values(cacheUsers).find(u => u.username === username);
  if (found) {
    openProfile(found.uid || found.id);
  }
}

// Cierre del modal haciendo clic fuera de la tarjeta
document.getElementById("profileModal").addEventListener("click", () => {
  document.getElementById("profileModal").style.display = "none";
});

// Mecanismo reactivo para los indicadores de escritura (Typing Indicators)
onValue(ref(db, "typing/discord"), snap => {
  const typingBox = document.getElementById("typing"); 
  const data = snap.val();
  if (data && data.channelId === currentChannelId && (Date.now() - data.time < 4000)) { 
    typingBox.innerText = `@${data.username} está escribiendo...`; 
  } else { 
    typingBox.innerText = ""; 
  }
});

let typingTimeoutWeb;
document.getElementById("msg").addEventListener("input", () => {
  if (!currentChannelId) return;
  set(ref(db, "typing/web"), { username: "soykori", time: Date.now(), channelId: currentChannelId });
  clearTimeout(typingTimeoutWeb);
  typingTimeoutWeb = setTimeout(() => { 
    set(ref(db, "typing/web"), null); 
  }, 3500);
});

// Función de Envío de Mensajes a Firebase
async function sendMessage() {
  const input = document.getElementById("msg");
  const text = input.value; 
  if (!text.trim() || !currentChannelId) return;
  
  set(ref(db, "typing/web"), null);
  await push(ref(db, "webMessages"), { 
    text: text, 
    time: Date.now(), 
    channelId: currentChannelId 
  });
  input.value = "";
}

document.getElementById("msg").addEventListener("keydown", (e) => { 
  if (e.key === "Enter") sendMessage(); 
});

// Renderizar la lista de servidores del usuario dinámicamente en el menú izquierdo
onValue(ref(db, "guilds"), snap => {
  const container = document.getElementById("guildsContainer"); 
  container.innerHTML = "";
  const guilds = snap.val(); 
  if (!guilds) return;
  
  Object.values(guilds).forEach(g => {
    const iconBtn = document.createElement("div");
    iconBtn.className = `guild-icon ${(!isDMMode && g.id === currentGuildId) ? 'active' : ''}`;
    iconBtn.title = g.name;
    
    iconBtn.innerHTML = g.iconUrl ? 
      `<img src="${g.iconUrl}"><div class="guild-badge"></div>` : 
      `${g.name.split(" ").map(w => w[0]).join("")}<div class="guild-badge"></div>`;
    
    iconBtn.onclick = () => {
      isDMMode = false; 
      currentGuildId = g.id; 
      currentChannelId = "";
      
      document.querySelectorAll('.guild-icon').forEach(i => i.classList.remove('active'));
      iconBtn.classList.add('active');
      
      clearAppDOM();
      renderMessages();
      loadChannelsAndMembers();
    };
    container.appendChild(iconBtn);
  });
});

// Activar vista DM por defecto en el primer arranque
document.getElementById("dmServerBtn").addEventListener("click", selectDMMode);
