const { Client, Events, GatewayIntentBits} = require('discord.js');
const { generateDependencyReport } = require('@discordjs/voice');
const fs = require('fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const commandRefresh = require('./utils/refresh/command-refresh');
const sodium = require('libsodium-wrappers');
const deleteDirectory = require('./utils/directories/delete-directory');

(async () => {
    await sodium.ready;
    console.log('Sodium is ready');
})();

console.log(generateDependencyReport());

const TOKEN = process.env.DISCORD_TOKEN;
const DEV_MODE = process.env.TR_DEV_MODE === 'true'; 

const client = new Client({ 
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages ] 
});

client.commands = new Map();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}
	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});

client.once(Events.ClientReady, client => {
    if (DEV_MODE) {
        console.log('Running in development mode, refreshing commands...');
        try {
            commandRefresh();
        }
        catch (error) {
            console.error('Error refreshing commands:', error);
        }
    } else {
        console.log('Production mode');
    }
	console.log(`${client.user.tag} is now running!`);
});

process.on('SIGINT', async () => {
  console.log('^C. Shutting down gracefully...');
  
  const recordingDir = path.join(__dirname, 'utils', 'recording', 'audio_data');

  try {
    await deleteDirectory(recordingDir);
    console.log('All files in the directory deleted successfully');
  } catch (error) {
    console.error('Error during directory deletion:', error);
  }

  client.destroy();
  process.exit(0);
});

client.login(TOKEN);
