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

/* 🌐 WEB */
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("🌐 Web activa");
});

/* 🤖 DISCORD */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("messages").push({
    source: "discord",
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({
      extension: message.author.avatar?.startsWith("a_") ? "gif" : "png",
      size: 128,
      dynamic: true
    }),
    text: message.content,
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("messages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data || data.source !== "web") return;

  const channel = client.channels.cache.find(c => c.isTextBased());
  if (channel) await channel.send(data.text);
});

/* 🚀 LOGIN */
client.login(process.env.DISCORD_TOKEN);
