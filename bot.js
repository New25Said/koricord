import { Client, GatewayIntentBits } from "discord.js";
import http from "http";
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

/* 🌐 WEB SERVER (Render hosting del HTML) */
const appWeb = express();
appWeb.use(express.static("public"));

const PORT = process.env.PORT || 10000;

appWeb.listen(PORT, () => {
  console.log("🌐 Web corriendo en Render");
});

/* 🔄 Keep alive */
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("KoriBot vivo");
}).listen(PORT);

/* 🤖 DISCORD */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`🤖 Conectado como ${client.user.tag}`);
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("discordMessages").push({
    user: message.author.username,
    text: message.content,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;

  const channels = client.channels.cache;
  const channel = channels.find(c => c.isTextBased());

  if (channel) {
    await channel.send(
      `💬 ${data.user}: ${data.text}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
