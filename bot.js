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
    GatewayIntentBits.MessageContent
  ]
});

// Sincronizar canales e información del servidor en tiempo real
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

client.once("ready", async () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  
  try {
    await db.ref("botConfig").set({
      username: client.user.username,
      avatar: client.user.displayAvatarURL({ extension: "png", size: 128 })
    });
    await syncServerData();
  } catch (err) {
    console.error("Error en inicialización:", err);
  }
});

// Escuchas de eventos del servidor para cambios en tiempo real
client.on("guildUpdate", syncServerData);
client.on("channelCreate", syncServerData);
client.on("channelDelete", syncServerData);
client.on("channelUpdate", syncServerData);

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
