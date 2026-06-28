import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔐 FIREBASE */
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
    GatewayIntentBits.GuildMembers
  ]
});

// Sincronizar canales e info del servidor
async function syncServerData() {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const channels = guild.channels.cache
    .filter(c => c.isTextBased())
    .map(c => ({ id: c.id, name: c.name }));

  await db.ref("serverConfig").set({
    serverName: guild.name,
    serverIcon: guild.iconURL({ extension: "png", size: 128 }) || "",
    channels: channels
  });
}

// Sincronizar Miembros con Perfil Completo (Banner, Estado, Actividad)
async function syncMembers() {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  try {
    const membersFetch = await guild.members.fetch({ withPresences: true });
    
    const membersList = await Promise.all(membersFetch.map(async (m) => {
      // Forzar fetch de usuario para obtener el color del banner
      let userFull = m.user;
      try {
        userFull = await client.users.fetch(m.user.id, { force: true });
      } catch(e) {}

      let status = m.presence?.status || "offline";
      if (status === "invisible") status = "offline";

      // Obtener actividades (juegos, Spotify, etc.)
      let activityText = "";
      if (m.presence?.activities && m.presence.activities.length > 0) {
        const currentAct = m.presence.activities.find(a => a.type !== 4); // Ignorar estado personalizado en texto plano aquí
        if (currentAct) {
          const typeNames = ["Jugando a", "Transmitiendo", "Escuchando", "Viendo", "Compitiendo en"];
          activityText = `${typeNames[currentAct.type] || "Jugando a"} ${currentAct.name}`;
        }
      }

      // Obtener el estado personalizado en texto
      const customStatusObj = m.presence?.activities.find(a => a.type === 4);
      const customStatusText = customStatusObj ? customStatusObj.state || "" : "";

      return {
        id: m.user.id,
        username: m.user.username,
        nickname: m.displayName,
        avatar: m.user.displayAvatarURL({ extension: "png", size: 128 }),
        bannerColor: userFull.hexAccentColor || "#5865f2",
        status: status, // online, idle, dnd, offline
        customStatus: customStatusText,
        activity: activityText,
        isBot: m.user.bot
      };
    }));

    await db.ref("serverMembers").set(membersList);
  } catch (err) {
    console.error("Error al sincronizar miembros:", err);
  }
}

client.once("ready", async () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  
  try {
    await db.ref("botConfig").set({
      username: client.user.username,
      avatar: client.user.displayAvatarURL({ extension: "png", size: 128 })
    });
    await syncServerData();
    await syncMembers();
  } catch (err) {
    console.error("Error en inicialización:", err);
  }
});

// Escuchas en tiempo real para actualización al milisegundo
client.on("guildUpdate", syncServerData);
client.on("channelCreate", syncServerData);
client.on("channelDelete", syncServerData);
client.on("channelUpdate", syncServerData);

client.on("presenceUpdate", syncMembers);
client.on("guildMemberAdd", syncMembers);
client.on("guildMemberRemove", syncMembers);
client.on("guildMemberUpdate", syncMembers);

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    text: message.content,
    channelId: message.channel.id,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data?.channelId) return;

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) {
    console.error("Error al enviar mensaje a Discord:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
