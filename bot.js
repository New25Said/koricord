import { Client, GatewayIntentBits } from "discord.js";
import http from "http";
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

/* 🌐 KEEP ALIVE (Render / hosting) */
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("KoriBot vivo");
}).listen(PORT);

/* 🤖 DISCORD BOT */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("ready", () => {
  console.log(`Conectado como ${client.user.tag}`);
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  console.log(
    `[${message.guild?.name}] ${message.author.username}: ${message.content}`
  );

  await db.ref("discordMessages").push({
    user: message.author.username,
    text: message.content,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD (PUENTE) */
const webRef = db.ref("webMessages");

webRef.on("child_added", async (snapshot) => {
  const data = snapshot.val();
  if (!data?.text) return;

  console.log("Mensaje desde web:", data.text);

  const channels = client.channels.cache;
  const channel = channels.find(c => c.isTextBased());

  if (channel) {
    await channel.send(
      `🌐 Web: ${data.user}\n💬 ${data.text}`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
