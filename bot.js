import { Client, GatewayIntentBits, Partials } from "discord.js";
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
app.listen(PORT, () => { console.log("🌐 Web activa en Render"); });

/* 🤖 DISCORD BOT */
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

// Sincronización fija (Bug Resuelto: Ya no borra canales ni servidores enteros con .remove())
async function syncDeepDiscordStructure() {
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

        db.ref(`usersStatus/${guild.id}/${member.user.id}`).set({
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
    } catch (e) { console.error(e); }
  }
}

client.once("ready", () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  syncDeepDiscordStructure();
  setInterval(syncDeepDiscordStructure, 5 * 60 * 1000); 
});

client.on("presenceUpdate", (oldPresence, newPresence) => {
  if (!newPresence || newPresence.user.bot) return;
  const member = newPresence.member;
  if (!member) return;

  const guildId = newPresence.guild.id;
  const status = newPresence.status || "offline";
  const activityText = getMemberActivity(member);
  const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);

  db.ref(`usersStatus/${guildId}/${newPresence.user.id}`).update({
    nickname: member.displayName,
    username: newPresence.user.username,
    avatar: member.user.displayAvatarURL({ extension: 'png', size: 128 }),
    status: status,
    activity: status !== "offline" ? activityText : null,
    roles: roles
  });
});

/* 💬 DISCORD → FIREBASE */
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

  if(isDM) {
    await db.ref(`dmChannels/${message.channel.id}`).update({
      id: message.channel.id,
      name: message.author.globalName || message.author.username,
      avatar: message.author.displayAvatarURL({ extension: 'png', size: 128 })
    });
  }

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

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data.channelId) return;
  if (Date.now() - data.time > 5000) return;

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) { console.error("Error al retransmitir:", err); }
});

client.login(process.env.DISCORD_TOKEN);
