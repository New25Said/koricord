import { Client, GatewayIntentBits, Partials } from 'discord.js';
import admin from 'firebase-admin';

// 1. Inicialización Segura de Firebase Admin
// Recuerda que en el panel de Render debes tener tu variable FIREBASE_SERVICE_ACCOUNT con el JSON comprimido
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
    });
    console.log("[Bot Core] Firebase Admin inicializado correctamente.");
  } catch (err) {
    console.error("[Bot Core] Error crítico al parsear las credenciales de Firebase:", err);
  }
} else {
  console.error("[Bot Core] ERROR: No se encontró la variable de entorno FIREBASE_SERVICE_ACCOUNT.");
}

const db = admin.database();

// 2. Configuración de los Intents necesarios para capturar mensajes, miembros y estados
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Requerido para poder capturar eventos en Mensajes Directos (DMs)
});

// Evento de confirmación cuando el bot se conecta exitosamente
client.once('ready', () => {
  console.log(`[Bot Core] ¡Bot listo y conectado a Discord como: ${client.user.tag}!`);
});

// 3. Sincronización de Mensajes desde Discord hacia Firebase (Servidores y Canales)
client.on('messageCreate', async (message) => {
  // Evitar que el bot se responda a sí mismo o a otros bots para prevenir bucles infinitos
  if (message.author.bot) return;

  try {
    // Procesar y capturar archivos multimedia adjuntos (imágenes o videos)
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

    // Generar una nueva clave única dentro del nodo 'discordMessages' de Firebase
    const msgRef = db.ref('discordMessages').push();
    await msgRef.set({
      id: message.id,
      text: message.content,
      username: message.author.username,
      // Si el mensaje viene de un servidor toma su apodo, si no, usa su nombre de usuario global
      nickname: message.member ? message.member.displayName : message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png' }),
      timestamp: message.createdTimestamp,
      channelId: message.channelId,
      attachments: attachmentsArray.length > 0 ? attachmentsArray : null
    });

  } catch (error) {
    console.error('[Bot Core] Error al intentar guardar el mensaje en Firebase:', error);
  }
});

// 4. Conexión e Inicio de sesión protegido
// Lee de manera interna el token desde el panel de control de Render (Invisible en el código)
if (process.env.DISCORD_TOKEN) {
  client.login(process.env.DISCORD_TOKEN);
} else {
  console.error("[Bot Core] ERROR CRÍTICO: Falta configurar la variable de entorno DISCORD_TOKEN en el hosting.");
}
