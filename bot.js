import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔐 FIREBASE */
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);
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

client.once("ready", async () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  
  // Guardar datos del bot para que la web conozca su avatar
  try {
    await db.ref("botConfig").set({
      username: client.user.username,
      avatar: client.user.displayAvatarURL({ extension: "png", size: 128 })
    });
  } catch (err) {
    console.error("Error al guardar avatar del bot:", err);
  }
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({
      extension: "png",
      size: 128
    }),
    text: message.content,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;

  // Evitar que el bot reenvíe lo que él mismo acaba de escribir de vuelta a Discord
  if (data.isBotLog) return;

  const channels = client.channels.cache;
  const channel = channels.find(c => c.isTextBased());

  if (channel) {
    await channel.send(data.text);
  }
});

client.login(process.env.DISCORD_TOKEN);
