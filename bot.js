import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔐 FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); [cite: 2]
admin.initializeApp({ [cite: 3]
  credential: admin.credential.cert(serviceAccount), [cite: 3]
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com" [cite: 3]
});

const db = admin.database();

/* 🌐 WEB SERVER */
const app = express(); [cite: 2]
const PORT = process.env.PORT || 3000; [cite: 4]

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("🌐 Web activa en Render"); [cite: 4]
});

/* 🤖 DISCORD BOT */
const client = new Client({ [cite: 5]
  intents: [ [cite: 5]
    GatewayIntentBits.Guilds, [cite: 5]
    GatewayIntentBits.GuildMessages, [cite: 5]
    GatewayIntentBits.MessageContent [cite: 5]
  ] [cite: 5]
});

// Función para sincronizar Canales e Info del Servidor en tiempo real
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
  console.log(`🤖 Logueado como ${client.user.tag}`); [cite: 6]
  
  // Guardar datos del bot
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

// Escuchar si el servidor cambia de nombre, icono o si se modifican canales
client.on("guildUpdate", syncServerData);
client.on("channelCreate", syncServerData);
client.on("channelDelete", syncServerData);
client.on("channelUpdate", syncServerData);

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return; [cite: 6]

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username, [cite: 6]
    username: message.author.username, [cite: 6]
    avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }), [cite: 6]
    text: message.content, [cite: 6]
    channelId: message.channel.id, // Guardamos a qué canal pertenece
    server: message.guild?.name || "DM", [cite: 6]
    timestamp: Date.now() [cite: 6]
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data?.channelId) return; [cite: 7]

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text); [cite: 7]
    }
  } catch (err) {
    console.error("Error al enviar mensaje a Discord:", err);
  }
});

client.login(process.env.DISCORD_TOKEN); [cite: 8]
