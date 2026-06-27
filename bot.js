import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔑 FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});

const db = admin.database();

/* 🌐 WEB SERVER */
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));
app.listen(PORT, () => {
  console.log("🌐 Web activa en Render");
});

/* 🤖 DISCORD BOT */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping 
  ]
});

function getMemberActivity(member) {
  if (!member.presence || !member.presence.activities.length) return null;
  for (const activity of member.presence.activities) {
    if (activity.name === "Custom Status") return activity.state ? `✨ ${activity.state}` : null;
    if (activity.type === 2) return `🎧 Escuchando ${activity.name}`;
    if (activity.type === 0) return `🎮 Jugando a ${activity.name}`;
  }
  return member.presence.activities[0].name ? `✨ ${member.presence.activities[0].name}` : null;
}

// Sincronizar Canales del Servidor y Perfiles Detallados de Usuarios
async function syncGuildData() {
  const guilds = client.guilds.cache.values();
  for (const guild of guilds) {
    try {
      // 1. Sincronizar todos los canales de texto de Discord hacia Firebase
      const channels = await guild.channels.fetch();
      channels.forEach(ch => {
        if (ch.isTextBased()) {
          db.ref(`channels/${ch.id}`).set({
            id: ch.id,
            name: ch.name
          });
        }
      });

      // 2. Sincronizar perfiles detallados de los miembros
      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(member => {
        if (member.user.bot) return;

        const status = member.presence?.status || "offline";
        const activityText = getMemberActivity(member);
        
        // Obtener lista de nombres de sus roles (excepto @everyone)
        const roles = member.roles.cache
          .filter(r => r.name !== "@everyone")
          .map(r => r.name);

        db.ref(`usersStatus/${member.user.id}`).set({
          uid: member.user.id,
          nickname: member.displayName,
          username: member.user.username,
          avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
          status: status,
          activity: status !== "offline" ? activityText : null,
          joinedAt: member.user.createdAt.getTime(), // Fecha de creación de su cuenta de Discord
          roles: roles
        });
      });
    } catch (e) {
      console.error("Error en sincronización profunda:", e);
    }
  }
}

client.once("ready", () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  syncGuildData();
});

/* 🟢 ACTUALIZAR PERFIL / ACTIVIDADES AL INSTANTE */
client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || newPresence.user.bot) return;
  const member = newPresence.member;
  if (!member) return;

  const status = newPresence.status || "offline";
  const activityText = getMemberActivity(member);
  const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);

  db.ref(`usersStatus/${newPresence.user.id}`).update({
    nickname: member.displayName,
    username: newPresence.user.username,
    avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: status,
    activity: status !== "offline" ? activityText : null,
    roles: roles
  });
});

/* ✍️ DETECTAR TYPING */
let typingTimeout;
client.on("typingStart", (typing) => {
  if (typing.user.bot) return;
  db.ref("typing/discord").set({ username: typing.user.username, time: Date.now() });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { db.ref("typing/discord").remove(); }, 5000);
});

/* 💬 DISCORD → FIREBASE (Guardando a qué canal pertenece cada mensaje) */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  db.ref("typing/discord").remove();

  let attachments = [];
  if (message.attachments.size > 0) {
    message.attachments.forEach(att => {
      const isImage = att.contentType?.startsWith("image/");
      const isVideo = att.contentType?.startsWith("video/");
      if (isImage) attachments.push({ type: "image", url: att.url });
      if (isVideo) attachments.push({ type: "video", url: att.url });
    });
  }

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
    text: message.content,
    attachments: attachments,
    channelId: message.channel.id, // ID del canal de origen
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD (Enviando el mensaje exactamente al canal en el que está Kori en la web) */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data.channelId) return;
  if (Date.now() - data.time > 5000) return;

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) {
    console.error("Error reenviando mensaje al canal:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
