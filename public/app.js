import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js"; [cite: 12]
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  onChildAdded
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js"; [cite: 12]

const firebaseConfig = {
  apiKey: "AIzaSyARq5j8Kf9p4SYj4sj3167BjVD-Q4KczQE", [cite: 12]
  authDomain: "koricord-a5f4e.firebaseapp.com", [cite: 12]
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com", [cite: 12]
  projectId: "koricord-a5f4e", [cite: 12]
  storageBucket: "koricord-a5f4e.firebasestorage.app", [cite: 12]
  messagingSenderId: "228519016518", [cite: 12]
  appId: "1:228519016518:web:9062449c2b5135ee36b247" [cite: 12]
};

const app = initializeApp(firebaseConfig); [cite: 13]
const db = getDatabase(app); [cite: 13]

let botAvatar = ""; 
let botName = "Tú (Bot)";
let typingTimeout = null;
let currentChannelId = "";

// Login global
window.checkLogin = function() { [cite: 14]
  const pass = document.getElementById("loginInput").value; [cite: 14]
  if(pass === "soykori") { [cite: 14]
    document.getElementById("loginScreen").style.display = "none"; [cite: 14]
    initApp();
  } else {
    document.getElementById("errorMsg").style.display = "block"; [cite: 14]
    document.getElementById("loginInput").value = ""; [cite: 14]
  }
};

document.getElementById("loginInput").addEventListener("keydown", (e) => { [cite: 15]
  if (e.key === "Enter") checkLogin(); [cite: 15]
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

  // 2. Información del Servidor y Canales en tiempo real (Pum, inmediato!)
  onValue(ref(db, "serverConfig"), (snap) => {
    const data = snap.val();
    if (!data) return;

    // Actualizar nombre e icono del grupo (Tooltip dinámico)
    document.getElementById("serverTitle").innerText = data.serverName || "Servidor";
    document.getElementById("guildTooltip").innerText = data.serverName || "Servidor";
    
    if (data.serverIcon) {
      document.getElementById("guildIcon").innerHTML = `<img src="${data.serverIcon}">`;
    } else {
      document.getElementById("guildIcon").innerText = (data.serverName || "K")[0].toUpperCase();
    }

    // Renderizar lista de canales
    const channelsList = document.getElementById("channelsList");
    channelsList.innerHTML = "";
    
    if (data.channels && data.channels.length > 0) {
      data.channels.forEach((ch, idx) => {
        const btn = document.createElement("div");
        btn.className = `channel-btn ${currentChannelId === ch.id || (!currentChannelId && idx === 0) ? 'active' : ''}`;
        btn.innerText = ch.name;
        
        // Si no hay canal activo por defecto, tomamos el primero
        if (!currentChannelId && idx === 0) {
          switchChannel(ch.id, ch.name);
        }

        btn.onclick = () => switchChannel(ch.id, ch.name);
        channelsList.appendChild(btn);
      });
    }
  });

  // 3. Estado de Escritura (Sincronizado)
  onValue(ref(db, "typing status"), (snap) => {
    const data = snap.val();
    if (data && data.isTyping && data.user !== "WebUser" && data.channelId === currentChannelId) {
      document.getElementById("typing").innerText = `${data.user} está escribiendo...`;
    } else {
      document.getElementById("typing").innerText = "";
    }
  });

  document.getElementById("msg").addEventListener("input", () => { [cite: 15]
    set(ref(db, "typing status"), { isTyping: true, user: "WebUser", channelId: currentChannelId });
    
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      set(ref(db, "typing status"), { isTyping: false, user: "", channelId: "" });
    }, 2000);
  });

  // Escuchar Mensajes entrantes de ambos nodos
  onChildAdded(ref(db, "discordMessages"), (snap) => {
    processMessage(snap.val(), "discord");
  });

  onChildAdded(ref(db, "webMessages"), (snap) => { [cite: 16]
    processMessage(snap.val(), "web"); [cite: 16]
  });
}

function switchChannel(id, name) {
  currentChannelId = id;
  document.getElementById("currentChannelName").innerText = name;
  
  // Actualizar clases activas visualmente
  const buttons = document.querySelectorAll(".channel-btn");
  buttons.forEach(btn => {
    if(btn.innerText === name) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  // Filtrar los mensajes visibles en el DOM para este canal
  filterMessages();
}

function processMessage(data, type) {
  const div = document.createElement("div");
  div.className = "msg";
  
  const msgTime = data.timestamp || data.time; [cite: 14]
  div.dataset.time = msgTime;
  div.dataset.channelId = data.channelId || ""; // Guardamos tag del canal en el nodo HTML
  
  const timeStr = new Date(msgTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}); [cite: 14]

  if (type === "discord") {
    const avatarHtml = (data.avatar && data.avatar.startsWith('http')) 
      ? `<img class="avatar" src="${data.avatar}" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'avatar\\'>${(data.nickname || '?')[0].toUpperCase()}</div>';">` [cite: 14]
      : `<div class="avatar">${(data.nickname || "?")[0].toUpperCase()}</div>`; [cite: 14]

    div.innerHTML = `
      ${avatarHtml}
      <div class="content">
        <div class="top">
          <span class="name">${data.nickname || data.username}</span> [cite: 14]
          <span class="time">${timeStr}</span> [cite: 14]
        </div>
        <div class="username">@${data.username}</div> [cite: 14]
        <div class="text">${data.text}</div> [cite: 14]
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
          <span class="time">${timeStr}</span> [cite: 16]
        </div>
        <div class="text">${data.text}</div> [cite: 16]
      </div>
    `;
  }

  // Insertar ordenado cronológicamente
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
    // Si el mensaje corresponde al canal activo (o es un webMessage antiguo sin ID asignado), se muestra
    if (!child.dataset.channelId || child.dataset.channelId === currentChannelId) {
      child.style.display = "flex";
    } else {
      child.style.display = "none";
    }
  }
  container.scrollTop = container.scrollHeight; [cite: 14]
}

/* 🌐 ENVIAR A FIREBASE */
window.sendMessage = async function(){ [cite: 14]
  const text = document.getElementById("msg").value; [cite: 14]
  if(!text) return; [cite: 14]

  set(ref(db, "typing status"), { isTyping: false, user: "", channelId: "" });

  await push(ref(db,"webMessages"), { [cite: 14]
    text: text, [cite: 14]
    time: Date.now(), [cite: 14]
    channelId: currentChannelId // Asociar el mensaje de la web al canal que estás viendo
  });

  document.getElementById("msg").value=""; [cite: 14]
};

document.getElementById("msg").addEventListener("keydown", (e) => { [cite: 15]
  if (e.key === "Enter") sendMessage(); [cite: 15]
});
