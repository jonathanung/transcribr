const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const startRecording = require('../../utils/recording/start-recording');
const startRecordingForUser = require('../../utils/recording/start-recording-for-user');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription('Records your meeting in your current voice channel.'),
  async execute(interaction) {
    if (!interaction.member.voice.channel) {
      return interaction.reply('You need to join a voice channel first!');
    }

    const guildId = interaction.guild.id;
    const channel = interaction.member.voice.channel;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    await interaction.deferReply();

    connection.on('stateChange', async (oldState, newState) => {
      // console.log(`Voice connection state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === 'ready') {
        await interaction.followUp(`Recording started in ${channel.name}.`);
        startRecording(interaction, connection, channel, guildId);
      }
    });

    connection.on('error', async error => {
      console.error('Voice connection error:', error);
      await interaction.followUp('Failed to connect to the voice channel.');
    });

    interaction.client.on('voiceStateUpdate', (oldState, newState) => {
      if (newState.channelId === channel.id && !newState.member.user.bot) {
        if (!recordingData[guildId]) {
          recordingData[guildId] = new Map();
        }
        if (!recordingData[guildId].has(newState.id)) {
          startRecordingForUser(newState.id, connection, interaction, guildId);
        }
      }
    });
  },
};
