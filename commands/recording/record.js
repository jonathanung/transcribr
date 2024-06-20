const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const recordingData = require('../../recording-data');
const { setTimeout, clearTimeout } = require('timers');

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

    await interaction.deferReply();

    connection.on('stateChange', async (oldState, newState) => {
      console.log(`Voice connection state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === 'ready') {
        await interaction.followUp(`Recording started in ${channel.name}.`);
        startRecording(interaction, connection, channel);
      }
    });

    connection.on('error', async error => {
      console.error('Voice connection error:', error);
      await interaction.followUp('Failed to connect to the voice channel.');
    });

    interaction.client.on('voiceStateUpdate', (oldState, newState) => {
      if (newState.channelId === channel.id && !newState.member.user.bot) {
        if (!recordingData.has(newState.id)) {
          startRecordingForUser(newState.id, connection, interaction);
        }
      }
    });
  },
};

async function startRecording(interaction, connection, channel) {
  const members = channel.members.filter(member => !member.user.bot);

  members.forEach(member => {
    startRecordingForUser(member.id, connection, interaction);
  });
}

async function startRecordingForUser(userId, connection, interaction) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const audioFilePath = path.join(__dirname, `recording_${userId}_${timestamp}.pcm`);
  const writeStream = fs.createWriteStream(audioFilePath);

  const audioStream = connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.Manual,
    },
  });

  const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

  audioStream.pipe(decoder).pipe(writeStream);

  audioStream.on('data', (chunk) => {
    console.log(`Received audio chunk of size ${chunk.length} from user ${userId}`);
  });

  audioStream.on('error', error => {
    console.error('Audio stream error:', error);
  });

  writeStream.on('finish', () => {
    console.log(`Finished writing audio for user ${userId}`);
  });

  recordingData.set(userId, { connection, audioStream, writeStream, audioFilePath, interaction });

  const timer = setTimeout(() => stopRecording(userId, true), 30000);
  recordingData.set(userId, { connection, audioStream, writeStream, audioFilePath, interaction, timer });
}

async function stopRecording(userId, startNew) {
  const recordingInfo = recordingData.get(userId);

  if (recordingInfo) {
    const { audioStream, writeStream, audioFilePath, timer, interaction } = recordingInfo;

    clearTimeout(timer);
    audioStream.destroy();
    writeStream.end();

    console.log(`Recording saved to ${audioFilePath}`);

    recordingData.delete(userId);

    if (startNew) {
      startRecordingForUser(userId, recordingInfo.connection, interaction);
    }
  } else {
    console.log('No active recording found for user:', userId);
  }
}
