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
    GatewayIntentBits.GuildPresences, // Requerido para ver quién está online/offline
    GatewayIntentBits.GuildMembers
  ]
});

// Función para sincronizar todos los usuarios del servidor y su estado actual
async function updateAllUsersStatus() {
  const guilds = client.guilds.cache.values();
  for (const guild of guilds) {
    try {
      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(member => {
        if (member.user.bot) return;

        // Determinar estado de presencia de Discord
        const presence = member.presence?.status;
        const isOnline = presence === "online" || presence === "idle" || presence === "dnd";

        db.ref(`usersStatus/${member.user.id}`).set({
          uid: member.user.id,
          nickname: member.displayName,
          username: member.user.username,
          avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
          status: isOnline ? "online" : "offline"
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

/* 🟢 ESCUCHAR CAMBIOS DE ESTADO (Online/Offline) */
client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || newPresence.user.bot) return;
  
  const member = newPresence.member;
  const status = newPresence.status;
  const isOnline = status === "online" || status === "idle" || status === "dnd";

  db.ref(`usersStatus/${newPresence.user.id}`).update({
    nickname: member?.displayName || newPresence.user.username,
    username: newPresence.user.username,
    avatar: newPresence.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: isOnline ? "online" : "offline"
  });
});

/* 💬 DISCORD → FIREBASE (Mensajes + Multimedia) */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Extraer fotos o videos adjuntos
  let attachments = [];
  if (message.attachments.size > 0) {
    message.attachments.forEach(att => {
      const isImage = att.contentType?.startsWith("image/");
      const isVideo = att.contentType?.startsWith("video/");
      
      if (isImage) {
        attachments.push({ type: "image", url: att.url });
      } else if (isVideo) {
        attachments.push({ type: "video", url: att.url });
      }
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

/* 🌐 WEB → DISCORD (Mensajes limpios sin duplicados) */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;

  // Evitar loops temporales
  if (Date.now() - data.time > 5000) return;

  // Buscar un canal donde el bot pueda escribir
  const channel = client.channels.cache.find(c => c.isTextBased() && c.permissionsFor(client.user)?.has("SendMessages"));
  
  if (channel) {
    // Mandamos el texto limpio a Discord directamente
    await channel.send(data.text);
  }
});

client.login(process.env.DISCORD_TOKEN);
