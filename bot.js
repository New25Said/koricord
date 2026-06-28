import { Client, GatewayIntentBits, Partials } from 'discord.js';
import express from 'express';
import admin from 'firebase-admin';

// 🔐 FIREBASE
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});
const db = admin.database();

// 🌐 WEB SERVER (RENDER COMPATIBLE)
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.static("public"));

// Escuchar en 0.0.0.0 es OBLIGATORIO para Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web activa y escuchando en el puerto ${PORT}`);
});

// 🤖 DISCORD BOT
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => console.log(`🤖 Logueado como ${client.user.tag}`));

// 💬 DISCORD → FIREBASE
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const attachments = message.attachments.map(a => ({ 
    url: a.url, 
    type: a.contentType?.startsWith('video') ? 'video' : 'image' 
  }));
  
  await db.ref('discordMessages').push({
    text: message.content,
    username: message.author.username,
    nickname: message.member?.displayName || message.author.username,
    avatar: message.author.displayAvatarURL({ extension: 'png' }),
    timestamp: Date.now(),
    channelId: message.channelId,
    attachments: attachments.length ? attachments : null
  });
});

client.login(process.env.DISCORD_TOKEN);
