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
      const recordingInfo = recordingData.get(interaction.user.id);

      if (!recordingInfo) {
        return interaction.reply('No active recording found for you.');
      }

      await interaction.deferReply(); // Defer the reply to give more time for processing

      const { connection, audioStream, writeStream, audioFilePath } = recordingInfo;

      audioStream.destroy();
      writeStream.end();

      console.log(`Recording saved to ${audioFilePath}`);

      const outputWavPath = path.join(__dirname, 'recording.wav');
      const outputMp3Path = path.join(__dirname, 'recording.mp3');

      console.log('Starting audio processing with ffmpeg');
      ffmpeg(audioFilePath)
        .inputFormat('s16le')
        .audioChannels(1) // Ensure mono channel
        .audioFrequency(48000)
        .audioFilters('volume=1') // Apply normalization
        .save(outputWavPath)
        .on('end', async () => {
          console.log('Audio file converted to WAV');
          const audioFile = fs.createReadStream(outputWavPath);

          // Convert WAV to MP3 for easy listening
          ffmpeg(outputWavPath)
            .audioCodec('libmp3lame')
            .save(outputMp3Path)
            .on('end', async () => {
              console.log('Audio file converted to MP3');
              await interaction.followUp(`The audio file is saved as recording.mp3. You can listen to it to check the recorded audio.`);

              // Clean up the WAV file after MP3 conversion
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
              model: 'whisper-1', // OpenAI's Whisper model for transcription
              prompt: '',
              response_format: 'text',
              language: 'en',
            });

            console.log('Transcription response:', response); // Log the entire response

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

          // Clean up the PCM file after transcription
          fs.unlinkSync(audioFilePath);
        })
        .on('error', async (err) => {
          console.error('Error processing audio file:', err);
          await interaction.followUp('Error processing audio file.');
        });

      connection.disconnect();
      recordingData.delete(interaction.user.id);
    } catch (error) {
      console.error('Error executing stop command:', error);
      await interaction.followUp('There was an error while executing this command!');
    }
  },
};
