const { Client, Events, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, EndBehaviorType, generateDependencyReport } = require('@discordjs/voice');
const fs = require('fs');
const path = require('node:path');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { exec } = require('child_process');
const sodium = require('libsodium-wrappers');

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
        exec('./refresh.sh', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing script: ${error}`);
                return;
            }
            if (stderr) {
                console.error(`Error output: ${stderr}`);
                return;
            }
            console.log(`Script output: ${stdout}`);
        });
    } else {
        console.log('Production mode');
    }
	console.log(`${client.user.tag} is now running!`);
});

async function deleteFiles(directory) {
    return new Promise((resolve, reject) => {
        fs.readdir(directory, (err, files) => {
            if (err) {
                return reject(`Error reading directory: ${err}`);
            }

            const deletePromises = files.map(file => {
                const filePath = path.join(directory, file);
                return new Promise((resolve, reject) => {
                    fs.stat(filePath, (err, stats) => {
                        if (err) {
                            console.error(`Error getting stats for file: ${file}, ${err}`);
                            return reject(err);
                        }

                        if (stats.isDirectory()) {
                            deleteFiles(filePath)
                                .then(() => {
                                    fs.rmdir(filePath, err => {
                                        if (err) {
                                            console.error(`Error deleting directory: ${file}, ${err}`);
                                            return reject(err);
                                        } else {
                                            console.log(`Deleted directory: ${file}`);
                                            resolve();
                                        }
                                    });
                                })
                                .catch(reject);
                        } else {
                            if (file.endsWith('.pcm') || file.endsWith('.mp3') || file.endsWith('.wav')) {
                                fs.unlink(filePath, err => {
                                    if (err) {
                                        console.error(`Error deleting file: ${file}, ${err}`);
                                        return reject(err);
                                    } else {
                                        console.log(`Deleted file: ${file}`);
                                        resolve();
                                    }
                                });
                            } else {
                                resolve(); // Ignore non-audio files
                            }
                        }
                    });
                });
            });

            Promise.all(deletePromises)
                .then(resolve)
                .catch(reject);
        });
    });
}

process.on('SIGINT', async () => {
    console.log('^C. Shutting down gracefully...');
    
    const recordingDir = path.join(__dirname, 'commands', 'recording');

    try {
        const subdirs = (await fs.promises.readdir(recordingDir, { withFileTypes: true }))
            .filter(dirent => dirent.isDirectory())
            .map(dirent => path.join(recordingDir, dirent.name));

        for (const subdir of subdirs) {
            await deleteFiles(subdir);
        }

        console.log('All files in subdirectories deleted successfully');
    } catch (error) {
        console.error('Error during file and directory deletion:', error);
    }

    client.destroy();
    process.exit(0);
});

client.login(TOKEN);
