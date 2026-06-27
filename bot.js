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

// Helper para extraer qué hace el usuario sin que tire el texto genérico "Custom Status"
function getMemberActivity(member) {
  if (!member.presence || !member.presence.activities.length) return null;
  
  // Buscar a través de las actividades del usuario
  for (const activity of member.presence.activities) {
    // Si es el texto de Estado Personalizado (Custom Status)
    if (activity.name === "Custom Status") {
      return activity.state ? `✨ ${activity.state}` : null;
    }
    // Si está escuchando música (Spotify)
    if (activity.type === 2) {
      return `🎧 Escuchando ${activity.name}`;
    }
    // Si está jugando
    if (activity.type === 0) {
      return `🎮 Jugando a ${activity.name}`;
    }
  }
  
  // Alternativa por defecto si hay algo más
  return member.presence.activities[0].name ? `✨ ${member.presence.activities[0].name}` : null;
}

// Sincronizar todos los estados finos (online, idle, dnd, offline) al arrancar
async function updateAllUsersStatus() {
  const guilds = client.guilds.cache.values();
  for (const guild of guilds) {
    try {
      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(member => {
        if (member.user.bot) return;

        // Extraer estado puro de Discord (online, idle, dnd) o marcar offline
        const status = member.presence?.status || "offline";
        const activityText = getMemberActivity(member);

        db.ref(`usersStatus/${member.user.id}`).set({
          uid: member.user.id,
          nickname: member.displayName,
          username: member.user.username,
          avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
          status: status, 
          activity: status !== "offline" ? activityText : null
        });
      });
    } catch (e) {
      console.error("Error cargando usuarios:", e);
    }
  }
}

client.once("ready", () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  updateAllUsersStatus();
});

/* 🟢 DETECTAR CAMBIOS EN ESTADOS (Online, Luna, No Molestar, Actividades) */
client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || newPresence.user.bot) return;
  
  const member = newPresence.member;
  if (!member) return;

  const status = newPresence.status || "offline"; 
  const activityText = getMemberActivity(member);

  db.ref(`usersStatus/${newPresence.user.id}`).update({
    nickname: member.displayName,
    username: newPresence.user.username,
    avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: status,
    activity: status !== "offline" ? activityText : null
  });
});

/* ✍️ DETECTAR "ESCRIBIENDO..." DESDE DISCORD */
let typingTimeout;
client.on("typingStart", (typing) => {
  if (typing.user.bot) return;

  db.ref("typing/discord").set({
    username: typing.user.username,
    time: Date.now()
  });

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    db.ref("typing/discord").remove();
  }, 5000);
});

/* 💬 DISCORD → FIREBASE */
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

  const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: avatarUrl,
    text: message.content,
    attachments: attachments,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;
  if (Date.now() - data.time > 5000) return;

  const channel = client.channels.cache.find(c => c.isTextBased() && c.permissionsFor(client.user)?.has("SendMessages"));
  if (channel) {
    await channel.send(data.text);
  }
});

client.login(process.env.DISCORD_TOKEN);
