const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const fs = require('fs');
const path = require('path');
const recordingData = require('../../recording-data'); // Adjusted path

module.exports = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription('Records your meeting in your current voice channel.'),
  async execute(interaction) {
    if (!interaction.member.voice.channel) {
      return interaction.reply('You need to join a voice channel first!');
    }

    const channel = interaction.member.voice.channel;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    connection.on('stateChange', async (oldState, newState) => {
      console.log(`Voice connection state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === 'ready') {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply(`Recording started in ${channel.name}.`);
        }
        startRecording(interaction, connection);
      }
    });

    connection.on('error', error => {
      console.error('Voice connection error:', error);
      if (!interaction.replied && !interaction.deferred) {
        interaction.reply('Failed to connect to the voice channel.');
      }
    });
  },
};

async function startRecording(interaction, connection) {
  const userId = interaction.user.id;
  const audio = [];
  const audioStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: 'manual',
    },
  });

  audioStream.on('data', (chunk) => {
    audio.push(chunk);
    console.log(`Received audio chunk of size ${chunk.length}`);
  });

  audioStream.on('error', error => {
    console.error('Audio stream error:', error);
  });

  recordingData.set(userId, { connection, audioStream, audio, interaction });
}
