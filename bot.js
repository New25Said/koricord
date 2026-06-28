import { Client, GatewayIntentBits, Partials } from 'discord.js';
import admin from 'firebase-admin';

// Inicialización de Firebase con variables de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://koricord-a5f4e-default-rtdb.firebaseio.com"
});
const db = admin.database();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

client.once('ready', () => console.log(`🤖 Logueado como ${client.user.tag}`));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const attachments = message.attachments.map(a => ({ url: a.url, type: a.contentType?.startsWith('video') ? 'video' : 'image' }));
  
  await db.ref('discordMessages').push({
    text: message.content,
    username: message.author.username,
    nickname: message.member?.displayName || message.author.username,
    avatar: message.author.displayAvatarURL({ extension: 'png' }),
    timestamp: Date.now(),
    channelId: message.channelId,
    guildId: message.guild?.id || "DM",
    attachments: attachments.length ? attachments : null
  });
});

client.login(process.env.DISCORD_TOKEN);
