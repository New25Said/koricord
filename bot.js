import { Client, GatewayIntentBits, Partials } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔑 CONFIGURACIÓN DE FIREBASE */
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});

const db = admin.database();

/* 🌐 SERVIDOR WEB EXPRESS */
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.listen(PORT, () => { console.log("🌐 KoriCord Web corriendo a la velocidad de la luz"); });

/* 🤖 CONFIGURACIÓN DEL BOT DE DISCORD (CON TODOS LOS INTENTS REACTIVOS) */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences, 
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages, 
    GatewayIntentBits.DirectMessageTyping
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Función optimizada para extraer la actividad exacta en tiempo real
function getMemberActivity(member) {
  if (!member.presence || !member.presence.activities.length) return null;
  for (const activity of member.presence.activities) {
    if (activity.name === "Custom Status") {
      if(!activity.state) return null;
      return `✨ ${activity.state.replace(/<a?:.+?:\d+>/g, '✨')}`; // Limpia emojis personalizados rotos
    }
    if (activity.type === 2) return `🎧 Escuchando ${activity.name}`;
    if (activity.type === 0) return `🎮 Jugando a ${activity.name}`;
  }
  return member.presence.activities[0].name ? `✨ ${member.presence.activities[0].name}` : null;
}

// Sincronización estructural rápida al encender (No borra mensajes ni historiales)
async function syncDiscordStructure() {
  console.log("⚡ Sincronizando servidores, canales y estados iniciales...");
  const guilds = client.guilds.cache.values();
  
  for (const guild of guilds) {
    try {
      const iconUrl = guild.iconURL({ extension: 'png', size: 128 }) || null;
      await db.ref(`guilds/${guild.id}`).update({ id: guild.id, name: guild.name, iconUrl: iconUrl });

      // Cargar canales de texto
      const channels = await guild.channels.fetch();
      channels.forEach(ch => {
        if (ch.isTextBased()) {
          db.ref(`channels/${guild.id}/${ch.id}`).update({ id: ch.id, name: ch.name });
        }
      });

      // Cargar miembros y presencias iniciales de forma directa
      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(member => {
        if (member.user.bot) return;
        const status = member.presence?.status || "offline";
        const activityText = getMemberActivity(member);
        const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);

        db.ref(`usersStatus/${guild.id}/${member.user.id}`).update({
          uid: member.user.id,
          nickname: member.displayName,
          username: member.user.username,
          avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
          status: status,
          activity: status !== "offline" ? activityText : null,
          joinedAt: member.user.createdAt.getTime(),
          roles: roles
        });
      });
    } catch (e) { console.error("Error en sincronización inicial:", e); }
  }
  console.log("✅ Sincronización inicial completada con éxito.");
}

client.once("ready", () => {
  console.log(`🤖 KoriCord-Bot en línea como ${client.user.tag}`);
  syncDiscordStructure();
});

/* 📡 EVENTO PRESENCE UPDATE: Cambios de estado instantáneos (A la velocidad de la luz) */
client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || newPresence.user.bot) return;
  const member = newPresence.member;
  if (!member) return;

  const guildId = newPresence.guild.id;
  const status = newPresence.status || "offline";
  const activityText = getMemberActivity(member);
  const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);

  // Actualización atómica del usuario que cambió su estado, sin tocar nada más
  db.ref(`usersStatus/${guildId}/${newPresence.user.id}`).update({
    nickname: member.displayName,
    username: newPresence.user.username,
    avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: status,
    activity: status !== "offline" ? activityText : null,
    roles: roles
  });
});

/* ⌨️ INDICADOR ESCRIBIENDO: Discord -> Web en milisegundos */
client.on("typingStart", (typing) => {
  if (typing.user.bot) return;
  db.ref("typing/discord").set({
    username: typing.user.username,
    time: Date.now()
  });
});

/* 💬 TRANSMISIÓN DIRECTA: DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  let attachments = [];
  if (message.attachments.size > 0) {
    message.attachments.forEach(att => {
      const isImage = att.contentType?.startsWith("image/");
      const isVideo = att.contentType?.startsWith("video/");
      if (isImage) attachments.push({ type: "image", url: att.url });
      if (isVideo) attachments.push({ type: "video", url: att.url });
    });
  }

  const isDM = !message.guild; 
  const guildId = isDM ? "DM" : message.guild.id;

  // Si es un mensaje directo (DM), guardamos/actualizamos dinámicamente el contacto en la lista
  if(isDM) {
    await db.ref(`dmChannels/${message.channel.id}`).update({
      id: message.channel.id,
      name: message.author.globalName || message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 })
    });
  }

  // Empujar el mensaje con una marca de tiempo única e inequívoca
  await db.ref("discordMessages").push({
    nickname: isDM ? (message.author.globalName || message.author.username) : (message.member?.displayName || message.author.username),
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
    text: message.content,
    attachments: attachments,
    guildId: guildId, 
    channelId: message.channel.id, 
    timestamp: Date.now()
  });
});

/* 🌐 TRANSMISIÓN DIRECTA: WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data.channelId) return;
  
  // Evita re-enviar mensajes antiguos que queden en la caché al encender el bot
  if (Date.now() - data.time > 4000) return; 

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) { console.error("Error al enviar mensaje a Discord nativo:", err); }
});

client.login(process.env.DISCORD_TOKEN);
