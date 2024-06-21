const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, "..", "..", '.env') });

const GUILDS_JSON = require('../../guilds.json');
const GUILD_IDS = GUILDS_JSON["GUILD_IDS"];

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

async function refreshCommands() {
  const commands = [];
  const foldersPath = path.join(__dirname, "..", "..", 'commands');
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }

  const rest = new REST().setToken(TOKEN);

  for (const GUILD_ID of GUILD_IDS) {
    try {
      console.log(`Started refreshing ${commands.length} application (/) commands for guild ${GUILD_ID}.`);
      const data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
      );
      console.log(`Successfully reloaded ${data.length} application (/) commands for guild ${GUILD_ID}.`);
    } catch (error) {
      console.error(error);
    }
  }
}

module.exports = refreshCommands;
