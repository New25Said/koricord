import { Client, GatewayIntentBits, Partials } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔑 CONFIGURACIÓN DE FIREBASE (Usa tus variables de entorno de Render) */
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

/* 🤖 CONFIGURACIÓN DEL BOT DE DISCORD */
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

// Cache local para controlar temporizadores de escritura individuales por canal
const typingTimeouts = {};

function getMemberActivity(member) {
  if (!member.presence || !member.presence.activities.length) return null;
  for (const activity of member.presence.activities) {
    if (activity.name === "Custom Status") {
      if(!activity.state) return null;
      return `✨ ${activity.state.replace(/<a?:.+?:\d+>/g, '✨')}`;
    }
    if (activity.type === 2) return `🎧 Escuchando ${activity.name}`;
    if (activity.type === 0) return `🎮 Jugando a ${activity.name}`;
  }
  return member.presence.activities[0].name ? `✨ ${member.presence.activities[0].name}` : null;
}

// Sincronización estructural rápida al encender (No borra mensajes ni historiales antiguos)
async function syncDiscordStructure() {
  const guilds = client.guilds.cache.values();
  
  for (const guild of guilds) {
    try {
      const iconUrl = guild.iconURL({ extension: 'png', size: 128 }) || null;
      await db.ref(`guilds/${guild.id}`).update({ id: guild.id, name: guild.name, iconUrl: iconUrl });

      const channels = await guild.channels.fetch();
      channels.forEach(ch => {
        if (ch.isTextBased()) {
          db.ref(`channels/${guild.id}/${ch.id}`).update({ id: ch.id, name: ch.name });
        }
      });

      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(member => {
        if (member.user.bot) return;
        const status = member.presence?.status || "offline";
        const activityText = getMemberActivity(member);
        const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);

        db.ref(`usersStatus/${guild.id}/${member.user.id}`).update({
          uid: member.user.id,
          username: member.user.username,
          nickname: member.displayName,
          avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }) || null,
          status: status,
          activity: status !== "offline" ? activityText : null,
          joinedAt: member.user.createdAt.getTime(),
          roles: roles
        });
      });
    } catch (e) { console.error("Error en sincronización inicial:", e); }
  }
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

  // Actualizar el estado en cada servidor donde coincidan
  db.ref(`usersStatus/${guildId}/${newPresence.user.id}`).update({
    nickname: member.displayName,
    username: newPresence.user.username,
    avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: status,
    activity: status !== "offline" ? activityText : null,
    roles: roles
  });

  // Si tiene un canal DM activo en la interfaz, actualizar su luna de estado al milisegundo
  db.ref(`dmChannels/${newPresence.user.id}`).update({ status: status });
});

/* ⌨️ INDICADOR ESCRIBIENDO: Discord -> Web en milisegundos */
client.on("typingStart", (typing) => {
  if (typing.user.bot) return;

  const channelId = typing.channel.id;
  db.ref("typing/discord").set({
    username: typing.user.username,
    channelId: channelId,
    time: Date.now()
  });

  // Apaga automáticamente el indicador tras 4 segundos para que no se quede congelado
  if (typingTimeouts[channelId]) clearTimeout(typingTimeouts[channelId]);
  typingTimeouts[channelId] = setTimeout(() => {
    db.ref("typing/discord").set(null);
  }, 4000);
});

/* 💬 TRANSMISIÓN DIRECTA: DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Si el usuario envió el mensaje, forzar el apagado inmediato del "está escribiendo..."
  const channelId = message.channel.id;
  if (typingTimeouts[channelId]) {
    clearTimeout(typingTimeouts[channelId]);
    delete typingTimeouts[channelId];
  }
  await db.ref("typing/discord").set(null);

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

  // Si es un MD, guardamos/actualizamos el contacto en la base con los campos de la tarjeta
  if(isDM) {
    await db.ref(`dmChannels/${message.channel.id}`).update({
      id: message.channel.id,
      name: message.author.globalName || message.author.username,
      username: message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
      status: message.author.presence?.status || "online",
      joinedAt: message.author.createdAt.getTime(),
      bio: "Conversación privada mapeada de forma segura hacia la interfaz de KoriCord."
    });
  }

  await db.ref("discordMessages").push({
    nickname: isDM ? (message.author.globalName || message.author.username) : (message.member?.displayName || message.author.username),
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
    text: message.content,
    attachments: attachments,
    guildId: guildId, 
    channelId: channelId, 
    timestamp: Date.now()
  });
});

/* 🌐 TRANSMISIÓN DIRECTA: WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data.channelId) return;
  if (Date.now() - data.time > 4000) return; 

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) { console.error("Error al retransmitir a Discord nativo:", err); }
});

/* 🌐 ESCUCHAR ESCRITURA DE LA WEB: Web -> Discord */
db.ref("typing/web").on("value", async (snap) => {
  const data = snap.val();
  if (data && data.channelId && (Date.now() - data.time < 3500)) {
    try {
      const channel = await client.channels.fetch(data.channelId);
      if (channel && channel.isTextBased()) await channel.sendTyping();
    } catch(e){}
  }
});

// Uso seguro del token mediante variable de entorno protegida en Render
client.login(process.env.DISCORD_TOKEN);
