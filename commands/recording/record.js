const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, EndBehaviorType } = require('@discordjs/voice');
const prism = require('prism-media');
const fs = require('fs');
const path = require('path');
const recordingData = require('../../recording-data');

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

async function startRecording(interaction, connection, channel, guildId) {
  const members = channel.members.filter(member => !member.user.bot);

  members.forEach(member => {
    startRecordingForUser(member.id, connection, interaction, guildId);
  });
}

async function startRecordingForUser(userId, connection, interaction, guildId) {
  const startNewRecording = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let time = null;
    const guildFolderPath = path.join(__dirname, guildId);
    if (!fs.existsSync(guildFolderPath)) {
      fs.mkdirSync(guildFolderPath);
    }
    const audioFilePath = path.join(guildFolderPath, `recording_${userId}_${timestamp}.pcm`);
    const writeStream = fs.createWriteStream(audioFilePath);

    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual,
      },
    });

    const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
    const volumeTransformer = new prism.VolumeTransformer({ type: 's16le' });

    let silenceTimeout;

    volumeTransformer.on('data', (chunk) => {
      const volume = Math.sqrt(chunk.reduce((sum, val) => sum + val ** 2, 0) / chunk.length);
      if (volume < 0.01) {
        if (!silenceTimeout) {
          silenceTimeout = setTimeout(() => {
            audioStream.unpipe(volumeTransformer);
            volumeTransformer.unpipe(writeStream);
            writeStream.end();
            // console.log(`Silence detected for user ${userId}, stopping recording.`);
            startNewRecording(); // Start a new recording after silence
          }, 250);
        }
      } else {
        if (!time) {
          time = new Date().toLocaleTimeString('en-US', { hour12: false });
          const recordingEntry = recordingData[guildId].get(userId).find(entry => entry.audioFilePath === audioFilePath);
          if (recordingEntry) {
            recordingEntry.time = time; 
          }
        }
        if (silenceTimeout) {
          clearTimeout(silenceTimeout);
          silenceTimeout = null;
        }
      }
    });

    audioStream.pipe(decoder).pipe(volumeTransformer).pipe(writeStream);

    audioStream.on('data', (chunk) => {
      // console.log(`Received audio chunk of size ${chunk.length} from user ${userId}`);
    });

    audioStream.on('error', error => {
      // console.error('Audio stream error:', error);
    });

    writeStream.on('finish', () => {
      // console.log(`Finished writing audio for user ${userId}`);
    });

    if (!recordingData[guildId]) {
      recordingData[guildId] = new Map();
    }

    if (!recordingData[guildId].has(userId)) {
      recordingData[guildId].set(userId, []);
    }

    recordingData[guildId].get(userId).push({ connection, audioStream, writeStream, audioFilePath, interaction, timestamp, time });
  };

  startNewRecording();
}
