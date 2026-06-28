import { Client, GatewayIntentBits, Partials } from 'discord.js';
import admin from 'firebase-admin';

// 1. Inicialización segura de Firebase Admin
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
    });
    console.log("[Bot] Firebase Admin conectado correctamente.");
  } catch (err) {
    console.error("[Bot] Error al inicializar Firebase:", err);
  }
}

const db = admin.database();

// 2. Configuración del Cliente de Discord
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

// 3. Evento Ready
client.once('ready', () => {
  console.log(`[Bot] Conectado como ${client.user.tag}`);
});

// 4. Captura y Sincronización de mensajes en tiempo real
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const attachments = [];
    if (message.attachments.size > 0) {
      message.attachments.forEach(att => {
        attachments.push({
          url: att.url,
          type: att.contentType?.startsWith('video') ? 'video' : 'image'
        });
      });
    }

    const msgData = {
      id: message.id,
      text: message.content,
      username: message.author.username,
      nickname: message.member ? message.member.displayName : message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png' }),
      timestamp: message.createdTimestamp,
      channelId: message.channelId,
      attachments: attachments.length > 0 ? attachments : null
    };

    await db.ref('discordMessages').push(msgData);
  } catch (error) {
    console.error('[Bot] Error al sincronizar mensaje:', error);
  }
});

// 5. Login Seguro
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.error("[Bot] ERROR: DISCORD_TOKEN no encontrado.");
}
