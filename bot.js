import{Client,GatewayIntentBits}from"discord.js";
import express from"express";
import admin from"firebase-admin";

const serviceAccount=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
credential:admin.credential.cert(serviceAccount),
databaseURL:"https://koricord-a5f4e-default-rtdb.firebaseio.com"
});

const db=admin.database();

const app=express();
app.use(express.static("public"));
app.listen(process.env.PORT||3000);

const client=new Client({
intents:[
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildMessages,
GatewayIntentBits.MessageContent
]
});

client.once("ready",()=>console.log("BOT OK"));

/* DISCORD -> FIREBASE */
client.on("messageCreate",async m=>{
if(m.author.bot)return;

const sticker=m.stickers.first();

db.ref("messages").push({
source:"discord",
sender:m.member?.displayName||m.author.username,
username:m.author.username,
avatar:m.author.displayAvatarURL({dynamic:true,size:128}),
text:m.content||(sticker?`🎟️${sticker.name}`:""),
timestamp:Date.now()
});
});

/* WEB -> DISCORD */
db.ref("messages").on("child_added",async s=>{
const d=s.val();
if(!d||d.source!=="web")return;

const c=client.channels.cache.find(x=>x.isTextBased());
if(c)c.send(d.text);
});

client.login(process.env.DISCORD_TOKEN);
