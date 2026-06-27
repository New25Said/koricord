
import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* ðŸ” FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});

const db = admin.database();

/* ðŸŒ WEB SERVER */
const app = express();
const PORT = process.env.PORT;

app.use(express.static("public"));

app.listen(PORT, () => {
  console.log("ðŸŒ Web activa en Render");
});

/* ðŸ¤– DISCORD BOT */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageTyping
  ]
});

client.once("ready", () => {
  console.log(`ðŸ¤– Logueado como ${client.user.tag}`);
});

/* typing discord */
client.on("typingStart", (typing) => {
  db.ref("typing/discord").set({
    username: typing.user?.username || "alguien",
    time: Date.now()
  });
});

/* ðŸ’¬ DISCORD â†’ FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ size: 128 }),

    text: message.content,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });

  db.ref("typing/discord").remove();
});

/* ðŸŒ WEB â†’ DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;

  const channel = client.channels.cache.find(c => c.isTextBased());
  if (channel) await channel.send(data.text);
});

client.login(process.env.DISCORD_TOKEN);
