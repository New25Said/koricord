import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});

const db = admin.database();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("WEB ONLINE");
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`BOT LOGGED AS ${client.user.tag}`);
});

/* DISCORD -> FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const sticker = message.stickers.first();

  await db.ref("messages").push({
    source: "discord",
    sender: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({
      dynamic: true,
      size: 128
    }),
    text: message.content || (sticker ? `🎟️ ${sticker.name}` : ""),
    timestamp: Date.now()
  });
});

/* WEB -> DISCORD */
db.ref("messages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data || data.source !== "web") return;

  const channel = client.channels.cache.find(c => c.isTextBased());
  if (channel) channel.send(data.text);
});

client.login(process.env.DISCORD_TOKEN);
