import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔑 FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageTyping
  ]
});

client.once("ready", () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
});

/* typing discord */
client.on("typingStart", (typing) => {
  db.ref("typing/discord").set({
    username: typing.user?.username || "alguien",
    time: Date.now()
  });
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Obtiene la URL limpia del avatar del usuario de Discord
  const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: avatarUrl, // URL guardada de manera exitosa
    text: message.content,
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });

  db.ref("typing/discord").remove();
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;
  
  // Evitar que vuelva a procesar si ya se envió (control de marcas de tiempo muy recientes opcional)
  // Buscamos el primer canal de texto disponible donde el bot pueda escribir
  const channel = client.channels.cache.find(c => c.isTextBased() && c.permissionsFor(client.user)?.has("SendMessages"));
  
  if (channel) {
    // Para evitar loops, el bot envía el mensaje. El "if(message.author.bot) return" de arriba evitará duplicados.
    await channel.send(`**Kori:** ${data.text}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
