const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { OpenAI } = require('openai');
const recordingData = require('../../recording-data');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the recording.'),
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      const recordingInfo = recordingData.get(userId);

      if (!recordingInfo) {
        return interaction.reply('No active recording found for you.');
      }

      await interaction.deferReply();

      const { connection, audioStream, writeStream, audioFilePath } = recordingInfo;

      audioStream.destroy();
      writeStream.end();

      console.log(`Recording saved to ${audioFilePath}`);

      const outputWavPath = path.join(__dirname, `recording_${userId}_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`);
      const outputMp3Path = path.join(__dirname, `recording_${userId}_${new Date().toISOString().replace(/[:.]/g, '-')}.mp3`);

      console.log('Starting audio processing with ffmpeg');
      ffmpeg(audioFilePath)
        .inputFormat('s16le')
        .audioChannels(1)
        .audioFrequency(48000)
        .audioFilters('volume=1')
        .save(outputWavPath)
        .on('end', async () => {
          console.log('Audio file converted to WAV:', outputWavPath);
          const audioFile = fs.createReadStream(outputWavPath);

          ffmpeg(outputWavPath)
            .audioCodec('libmp3lame')
            .save(outputMp3Path)
            .on('end', async () => {
              console.log('Audio file converted to MP3:', outputMp3Path);
              await interaction.followUp(`The audio file is saved. You can listen to it to check the recorded audio.`);

              fs.unlinkSync(outputWavPath);
            })
            .on('error', (err) => {
              console.error('Error converting audio file to MP3:', err);
              interaction.followUp('Error converting audio file to MP3.');
            });

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

            if (response && response.text) {
              const transcription = response.text.trim();
              await interaction.followUp(`Transcription completed.`);
              console.log('Transcription:', transcription);
            } else {
              console.error('Unexpected response structure:', response);
              await interaction.followUp('Unexpected response structure received.');
            }
          } catch (error) {
            console.error('Error during transcription:', error);
            await interaction.followUp('Error during transcription.');
          }

          fs.unlinkSync(audioFilePath);
        })
        .on('error', async (err) => {
          console.error('Error processing audio file:', err);
          await interaction.followUp('Error processing audio file.');
        });

      connection.disconnect();
      recordingData.delete(userId);
    } catch (error) {
      console.error('Error executing stop command:', error);
      await interaction.followUp('There was an error while executing this command!');
    }
  },
};
