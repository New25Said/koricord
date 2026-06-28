import { Client, GatewayIntentBits } from 'discord.js';
import express from 'express';
import admin from 'firebase-admin';

// Configuración de Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com" });
const db = admin.database();

// Servidor Web (para Render)
const app = express();
app.use(express.static("public"));
app.listen(process.env.PORT || 10000, '0.0.0.0', () => console.log("Bot+Web activo"));

// Bot Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;
  await db.ref('discordMessages').push({
    text: msg.content, nickname: msg.member?.displayName || msg.author.username, timestamp: Date.now()
  });
});

client.login(process.env.DISCORD_TOKEN);
