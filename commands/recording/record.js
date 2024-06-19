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

    await interaction.deferReply(); // Defer the interaction response

    connection.on('stateChange', async (oldState, newState) => {
      console.log(`Voice connection state changed from ${oldState.status} to ${newState.status}`);
      if (newState.status === 'ready') {
        startRecording(interaction, connection);
        await interaction.followUp(`Recording started in ${channel.name}.`);
      }
    });

    connection.on('error', async error => {
      console.error('Voice connection error:', error);
      await interaction.followUp('Failed to connect to the voice channel.');
    });
  },
};

async function startRecording(interaction, connection) {
  const userId = interaction.user.id;

  const startNewRecording = async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const audioFilePath = path.join(__dirname, `recording_${userId}_${timestamp}.pcm`);
    const writeStream = fs.createWriteStream(audioFilePath);

    const audioStream = connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.Manual,
      },
    });

    const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });

    audioStream.pipe(decoder).pipe(writeStream);

    audioStream.on('data', (chunk) => {
      console.log(`Received audio chunk of size ${chunk.length}`);
    });

    audioStream.on('error', error => {
      console.error('Audio stream error:', error);
    });

    recordingData.set(userId, { connection, audioStream, writeStream, audioFilePath, interaction });

    // Schedule the next recording
    const timer = setTimeout(() => stopRecording(userId, true), 30000);
    recordingData.set(userId, { connection, audioStream, writeStream, audioFilePath, interaction, timer });
  };

  await startNewRecording();
}

async function stopRecording(userId, startNew) {
  const recordingInfo = recordingData.get(userId);

  if (recordingInfo) {
    const { audioStream, writeStream, audioFilePath, timer, interaction } = recordingInfo;

    clearTimeout(timer);
    audioStream.destroy();
    writeStream.end();

    console.log(`Recording saved to ${audioFilePath}`);

    const outputWavPath = path.join(__dirname, `recording_${userId}_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`);
    
    console.log('Starting audio processing with ffmpeg');
    ffmpeg(audioFilePath)
      .inputFormat('s16le')
      .audioChannels(2)
      .audioFrequency(48000)
      .audioFilters('volume=1')
      .save(outputWavPath)
      .on('end', async () => {
        console.log('Audio file converted to WAV');
        const audioFile = fs.createReadStream(outputWavPath);

        // Transcription logic here
        try {
          console.log('Starting transcription with OpenAI');
          const response = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            prompt: '',
            response_format: 'text',
            language: 'en',
          });

          console.log('Transcription response:', response);

          if (response) {
            const transcription = response.trim();
            await interaction.followUp(`Transcription: ${transcription}`);
            console.log('Transcription completed');
          } else {
            console.error('Unexpected response structure:', response);
            await interaction.followUp('Unexpected response structure received.');
          }
        } catch (error) {
          console.error('Error during transcription:', error);
          await interaction.followUp('Error during transcription.');
        }

        // Clean up the PCM and WAV files after transcription
        fs.unlinkSync(audioFilePath);
        fs.unlinkSync(outputWavPath);
      })
      .on('error', async (err) => {
        console.error('Error processing audio file:', err);
        await interaction.followUp('Error processing audio file.');
      });

    recordingData.delete(userId);

    if (startNew) {
      // Start a new recording
      startRecording(interaction, recordingInfo.connection);
    }
  } else {
    console.log('No active recording found for user:', userId);
  }
}
