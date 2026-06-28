import { Client, GatewayIntentBits, Partials } from 'discord.js';
import admin from 'firebase-admin';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. Configuración de rutas para ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 2. SERVIDOR WEB EXPRESS (La clave para un deploy ultra rápido en Render)
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Render detecta esto de inmediato y aprueba el deploy
app.listen(PORT, () => {
  console.log(`⚡ [Web] Servidor activo en puerto ${PORT}. Deploy exitoso.`);
});

// 3. INICIALIZACIÓN SEGURA DE FIREBASE
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
    });
    console.log("🔥 [Firebase] Conectado correctamente.");
  } catch (err) {
    console.error("❌ [Firebase] Error parseando credenciales:", err);
  }
}
const db = admin.database();

// 4. CONFIGURACIÓN DEL BOT DE DISCORD
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

client.once('ready', () => {
  console.log(`🤖 [Discord] ${client.user.tag} en línea y operando.`);
});

// 5. SINCRONIZACIÓN DE MENSAJES Y ARCHIVOS MULTIMEDIA
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const attachmentsArray = [];
    if (message.attachments.size > 0) {
      message.attachments.forEach(att => {
        const isVideo = att.contentType && att.contentType.startsWith('video');
        attachmentsArray.push({
          url: att.url,
          type: isVideo ? 'video' : 'image'
        });
      });
    }

    // Usamos un nodo temporary para inyectar el mensaje en tiempo real
    const temporaryRef = db.ref('discordMessages').push();
    await temporaryRef.set({
      id: message.id,
      text: message.content,
      username: message.author.username,
      nickname: message.member ? message.member.displayName : message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png' }),
      timestamp: message.createdTimestamp,
      channelId: message.channelId,
      attachments: attachmentsArray.length > 0 ? attachmentsArray : null
    });

  } catch (error) {
    console.error('[Error] Fallo al guardar en Firebase:', error);
  }
});

// 6. LOGIN PROTEGIDO
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.error("❌ [Error] No se detectó DISCORD_TOKEN en las variables de entorno.");
}
