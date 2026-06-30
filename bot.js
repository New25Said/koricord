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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ]
});

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

async function syncSingleMember(member) {
  if (!member) return;
  try {
    let userFull = member.user;
    try {
      userFull = await client.users.fetch(member.user.id, { force: true });
    } catch (e) {}

    let status = member.presence?.status || "offline";
    if (status === "invisible") status = "offline";

    let activitiesList = [];
    let spotifyDetails = null;
    let customStatusText = "";

    // Capturar Estado de Voz Nativo
    const voiceState = member.guild.voiceStates.cache.get(member.user.id);
    if (voiceState && voiceState.channel) {
      activitiesList.push({
        type: "voice",
        header: "EN CANAL DE VOZ",
        name: voiceState.channel.name,
        details: member.guild.name,
        state: `🔊 Conectado ${voiceState.selfVideo ? "🎥 En Cámara" : ""}`
      });
    }

    // Procesar TODAS las actividades de Discord en paralelo
    if (member.presence?.activities && member.presence.activities.length > 0) {
      member.presence.activities.forEach(act => {
        // 1. Estado Personalizado (Tipo 4)
        if (act.type === 4) {
          const emojiPrefix = act.emoji ? (act.emoji.id ? `<img class="status-emoji" src="https://cdn.discordapp.com/emojis/${act.emoji.id}.png">` : act.emoji.name + " ") : "";
          customStatusText = emojiPrefix + (act.state || "");
          return;
        }

        // 2. Spotify
        if (act.name === "Spotify") {
          let spotifyTrackImg = "";
          if (act.assets && act.assets.largeImage) {
            const imgId = act.assets.largeImage.replace("spotify:", "");
            spotifyTrackImg = `https://i.scdn.co/image/${imgId}`;
          }
          spotifyDetails = {
            song: act.details || "Canción desconocida",
            artist: act.state || "Artista desconocido",
            album: act.assets?.largeText || "",
            image: spotifyTrackImg
          };
          return;
        }

        // 3. Actividades Generales (Juegos, Transmisiones, Watch Together / Actividades integradas)
        const typeNames = ["JUGANDO A", "TRANSMITIENDO", "ESCUCHANDO A", "VIENDO", "COMPITIENDO EN", "COMPARTIENDO"];
        let headerText = typeNames[act.type] || "ACTIVIDAD";
        
        if (act.applicationId) {
          headerText = "COMPARTIENDO ACTIVIDAD";
        }

        let actImg = "";
        if (act.assets?.largeImage) {
          if (act.assets.largeImage.startsWith("mp:external")) {
            actImg = act.assets.largeImage.replace(/mp:external\/.*\/https\//, "https://");
          } else if (act.applicationId) {
            actImg = `https://cdn.discordapp.com/app-assets/${act.applicationId}/${act.assets.largeImage}.png`;
          }
        }

        activitiesList.push({
          type: "generic",
          header: headerText,
          name: act.name,
          details: act.details || "",
          state: act.state || "",
          image: actImg
        });
      });
    }

    const memberData = {
      id: member.user.id,
      username: member.user.username,
      nickname: member.displayName,
      avatar: member.user.displayAvatarURL({ extension: "png", size: 128 }),
      bannerColor: userFull.hexAccentColor || "#5865f2",
      aboutMe: userFull.aboutMe || userFull.description || "", 
      status: status,
      customStatus: customStatusText,
      spotify: spotifyDetails,
      activities: activitiesList,
      isBot: member.user.bot
    };

    await db.ref(`serverMembers/${member.guild.id}/${member.user.id}`).set(memberData);
  } catch (err) {
    console.error("Error al sincronizar miembro:", err);
  }
}

async function syncAllGuildMembers(guild) {
  try {
    const membersFetch = await guild.members.fetch({ withPresences: true });
    for (const [id, member] of membersFetch) {
      await syncSingleMember(member);
    }
  } catch (e) {}
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
    for (const [id, guild] of client.guilds.cache) {
      await syncAllGuildMembers(guild);
    }
  } catch (err) {}
});

client.on("guildCreate", async (guild) => { await syncServers(); await syncAllGuildMembers(guild); });
client.on("guildDelete", syncServers);
client.on("guildUpdate", syncServers);
client.on("channelCreate", syncServers);
client.on("channelDelete", syncServers);
client.on("channelUpdate", syncServers);

client.on("presenceUpdate", (oldP, newP) => { if (newP?.member) syncSingleMember(newP.member); });
client.on("voiceStateUpdate", (oldS, newS) => {
  const member = newS.member || oldS.member;
  if (member) syncSingleMember(member);
});
client.on("guildMemberAdd", syncSingleMember);
client.on("guildMemberUpdate", syncSingleMember);
client.on("guildMemberRemove", async (member) => {
  await db.ref(`serverMembers/${member.guild.id}/${member.user.id}`).remove();
});

client.on("typingStart", (typing) => {
  if (typing.user.bot) return;
  db.ref(`typingStatus/${typing.channel.id}`).set({
    isTyping: true,
    user: typing.member?.displayName || typing.user.username,
    timestamp: Date.now()
  });

  setTimeout(() => {
    db.ref(`typingStatus/${typing.channel.id}`).transaction((current) => {
      if (current && Date.now() - current.timestamp >= 4000) {
        return { isTyping: false, user: "", timestamp: 0 };
      }
      return current;
    });
  }, 4100);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const attachments = message.attachments.map(a => ({
    url: a.url,
    name: a.name,
    contentType: a.contentType || ""
  }));

  await db.ref("discordMessages").push({
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    text: message.content,
    channelId: message.channel.id,
    guildId: message.guild?.id || "",
    server: message.guild?.name || "DM",
    attachments: attachments,
    timestamp: Date.now()
  });
});

db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text || !data?.channelId) return;
  try {
    const channel = await client.channels.fetch(data.channelId);
    if (channel && channel.isTextBased()) {
      await channel.send(data.text);
    }
  } catch (err) {}
});

client.login(process.env.DISCORD_TOKEN);
