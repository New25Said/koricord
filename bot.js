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
    GatewayIntentBits.DirectMessages // Asegura capturar los MDs
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

    let activityText = "";
    let spotifyDetails = null;

    if (member.presence?.activities && member.presence.activities.length > 0) {
      const spotifyAct = member.presence.activities.find(a => a.name === "Spotify");
      if (spotifyAct) {
        let spotifyTrackImg = "";
        if (spotifyAct.assets && spotifyAct.assets.largeImage) {
          const imgId = spotifyAct.assets.largeImage.replace("spotify:", "");
          spotifyTrackImg = `https://i.scdn.co/image/${imgId}`;
        }
        spotifyDetails = {
          song: spotifyAct.details || "Canción desconocida",
          artist: spotifyAct.state || "Artista desconocido",
          album: spotifyAct.assets?.largeText || "",
          image: spotifyTrackImg
        };
        activityText = `Escuchando Spotify`;
      } else {
        const currentAct = member.presence.activities.find(a => a.type !== 4);
        if (currentAct) {
          const typeNames = ["Jugando a", "Transmitiendo", "Escuchando", "Viendo", "Compitiendo en"];
          activityText = `${typeNames[currentAct.type] || "Jugando a"} ${currentAct.name}`;
          if (currentAct.details) activityText += ` - ${currentAct.details}`;
        }
      }
    }

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
      spotify: spotifyDetails,
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

/* 💬 DISCORD → FIREBASE */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const attachments = message.attachments.map(a => ({
    url: a.url,
    name: a.name,
    contentType: a.contentType || ""
  }));

  const msgData = {
    nickname: message.member?.displayName || message.author.username,
    username: message.author.username,
    avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
    text: message.content,
    attachments: attachments,
    timestamp: Date.now()
  };

  // REGLA DE ORO: Si no tiene guild, es un Mensaje Directo (MD)
  if (!message.guild) {
    const userId = message.author.id;
    msgData.userId = userId;

    // Guardar el mensaje en el nodo específico del MD de ese usuario
    await db.ref(`dmMessages/${userId}`).push(msgData);

    // Guardar o actualizar al usuario en la lista de chats privados abiertos del bot
    await db.ref(`dmChats/${userId}`).set({
      id: userId,
      username: message.author.username,
      nickname: message.author.username,
      avatar: message.author.displayAvatarURL({ extension: "png", size: 128 }),
      lastMessageTime: Date.now()
    });
  } else {
    // Mensaje normal de servidor
    msgData.channelId = message.channel.id;
    msgData.guildId = message.guild.id;
    await db.ref("discordMessages").push(msgData);
  }
});

/* 🌐 WEB → DISCORD */
db.ref("webMessages").on("child_added", async (snap) => {
  const data = snap.val();
  if (!data?.text) return;

  try {
    if (data.isDM && data.userId) {
      // Enviar MD directo al usuario de Discord
      const user = await client.users.fetch(data.userId);
      if (user) {
        await user.send(data.text);
      }
    } else if (data.channelId) {
      // Enviar a un canal de servidor regular
      const channel = await client.channels.fetch(data.channelId);
      if (channel && channel.isTextBased()) {
        await channel.send(data.text);
      }
    }
  } catch (err) {
    console.error("Error al despachar mensaje desde la Web:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
