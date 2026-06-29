import { Client, GatewayIntentBits } from "discord.js";
import express from "express";
import admin from "firebase-admin";

/* 🔐 FIREBASE */
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
app.listen(PORT, () => console.log("🌐 Web activa en Render"));

/* 🤖 DISCORD BOT */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers
  ]
});

// Sincronizar todos los servidores y canales en un solo mapa estructurado
async function syncServers() {
  const serversMap = {};
  
  for (const [guildId, guild] of client.guilds.cache) {
    const channels = guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ id: c.id, name: c.name }));

    serversMap[guildId] = {
      id: guildId,
      name: guild.name,
      icon: guild.iconURL({ extension: "png", size: 128 }) || "",
      channels: channels
    };
  }
  
  await db.ref("serverConfig").set(serversMap);
}

// Sincronizar un miembro individual inmediatamente (Evita Delays de carga masiva)
async function syncSingleMember(member) {
  if (!member) return;
  try {
    let userFull = member.user;
    try {
      userFull = await client.users.fetch(member.user.id, { force: true });
    } catch (e) {}

    let status = member.presence?.status || "offline";
    if (status === "invisible") status = "offline";

    // Detectar Actividades
    let activityText = "";
    if (member.presence?.activities && member.presence.activities.length > 0) {
      const currentAct = member.presence.activities.find(a => a.type !== 4);
      if (currentAct) {
        const typeNames = ["Jugando a", "Transmitiendo", "Escuchando", "Viendo", "Compitiendo en"];
        activityText = `${typeNames[currentAct.type] || "Jugando a"} ${currentAct.name}`;
      }
    }

    // Detectar Estado Personalizado con su Emoji
    const customStatusObj = member.presence?.activities.find(a => a.type === 4);
    let customStatusText = "";
    if (customStatusObj) {
      const emojiPrefix = customStatusObj.emoji ? (customStatusObj.emoji.id ? `<img class="status-emoji" src="https://cdn.discordapp.com/emojis/${customStatusObj.emoji.id}.png">` : customStatusObj.emoji.name + " ") : "";
      customStatusText = emojiPrefix + (customStatusObj.state || "");
    }

    const memberData = {
      id: member.user.id,
      username: member.user.username,
      nickname: member.displayName,
      avatar: member.user.displayAvatarURL({ extension: "png", size: 128 }),
      bannerColor: userFull.hexAccentColor || "#5865f2",
      status: status,
      customStatus: customStatusText,
      activity: activityText,
      isBot: member.user.bot
    };

    // Guardar indexado por servidor y usuario para actualización instantánea
    await db.ref(`serverMembers/${member.guild.id}/${member.user.id}`).set(memberData);
  } catch (err) {
    console.error("Error al sincronizar miembro individual:", err);
  }
}

// Sincronizar todos los miembros de un servidor (Solo al iniciar)
async function syncAllGuildMembers(guild) {
  try {
    const membersFetch = await guild.members.fetch({ withPresences: true });
    for (const [id, member] of membersFetch) {
      await syncSingleMember(member);
    }
  } catch (e) {
    console.error("Error cargando miembros iniciales de gremio:", e);
  }
}

client.once("ready", async () => {
  console.log(`🤖 Logueado como ${client.user.tag}`);
  
  try {
    await db.ref("botConfig").set({
      id: client.user.id,
      username: client.user.username,
      avatar: client.user.displayAvatarURL({ extension: "png", size: 128 })
    });
    await syncServers();
    
    // Carga inicial de todos los servidores soportados
    for (const [id, guild] of client.guilds.cache) {
      await syncAllGuildMembers(guild);
    }
  } catch (err) {
    console.error("Error en inicialización:", err);
  }
});

// Eventos de Servidores y Canales
client.on("guildCreate", async (guild) => { await syncServers(); await syncAllGuildMembers(guild); });
client.on("guildDelete", syncServers);
client.on("guildUpdate", syncServers);
client.on("channelCreate", syncServers);
client.on("channelDelete", syncServers);
client.on("channelUpdate", syncServers);

// Eventos de Presencia al milisegundo por usuario
client.on("presenceUpdate", (oldP, newP) => { if (newP?.member) syncSingleMember(newP.member); });
client.on("guildMemberAdd", syncSingleMember);
client.on("guildMemberUpdate", syncSingleMember);
client.on("guildMemberRemove", async (member) => {
  await db.ref(`serverMembers/${member.guild.id}/${member.user.id}`).remove();
});

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    text: message.content,
    channelId: message.channel.id,
    guildId: message.guild?.id || "",
    server: message.guild?.name || "DM",
    timestamp: Date.now()
  });
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data?.channelId) return;

  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) {
    console.error("Error al enviar mensaje:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
