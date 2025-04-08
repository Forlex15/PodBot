const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

client.once('ready', () => {
    console.log('PodBot is online!');
});

client.on('error', (err) => {
    console.error('Error occurred:', err);
});

client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Successfully logged in!');
    })
    .catch(err => {
        console.error('Login failed:', err);
    });
