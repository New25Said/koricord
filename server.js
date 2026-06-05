const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

let messages = [];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', msg => {
  if (msg.author.bot) return;

  messages.unshift({
    user: msg.author.username,
    avatar: msg.author.displayAvatarURL(),
    text: msg.content,
    timestamp: msg.createdTimestamp
  });

  messages = messages.slice(0, 100);
});

app.get('/messages', (req, res) => {
  res.json(messages);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}`);
});

client.login(process.env.TOKEN);
