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

/* 🌐 EXPRESS (WEB SERVER) */
const app = express();
const PORT = process.env.PORT;

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("🌐 Web corriendo en Render");
});

/* 🤖 DISCORD BOT */
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
    await channel.send(`💬 ${data.user}: ${data.text}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
