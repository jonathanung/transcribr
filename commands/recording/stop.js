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
      if (recordingData.size === 0) {
        return interaction.reply('No active recordings found.');
      }

      await interaction.deferReply();
      const promises = [];
      const transcriptionResults = [];

      let connection;
      recordingData.forEach((recordingInfo, userId) => {
        const user = interaction.guild.members.cache.get(userId).user;
        if (!connection) {
          connection = recordingInfo.connection;
        }
        promises.push(stopAndProcessRecording(interaction, user, recordingInfo, transcriptionResults));
      });

      await Promise.all(promises);
      
      const finalMessage = transcriptionResults.length > 0 
        ? transcriptionResults.join('\n') 
        : 'No transcriptions were successful.';

      await interaction.followUp(finalMessage);

      // Disconnect from the voice channel
      if (connection) {
        connection.disconnect();
      }
    } catch (error) {
      console.error('Error executing stop command:', error);
      await interaction.followUp('There was an error while executing this command!');
    }
  },
};

async function stopAndProcessRecording(interaction, user, recordingInfo, transcriptionResults) {
  const { audioStream, writeStream, audioFilePath } = recordingInfo;

  audioStream.destroy();
  writeStream.end();

  console.log(`Recording saved to ${audioFilePath}`);

  const outputWavPath = path.join(__dirname, `recording_${user.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`);
  const outputMp3Path = path.join(__dirname, `recording_${user.id}_${new Date().toISOString().replace(/[:.]/g, '-')}.mp3`);

  return new Promise((resolve, reject) => {
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

            fs.unlinkSync(outputWavPath);

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

              if (typeof response === 'string') {
                const transcription = response.trim();
                transcriptionResults.push(`Transcription for user ${user.username}: ${transcription}`);
                console.log('Transcription:', transcription);
              } else {
                console.error('Unexpected response structure:', response);
                transcriptionResults.push(`Unexpected response structure received for user ${user.username}.`);
              }
            } catch (error) {
              if (error.code === 'audio_too_short') {
                console.log(`No audio recorded for user ${user.username}`);
                transcriptionResults.push(`No audio recorded for user ${user.username}`);
              } else {
                console.error('Error during transcription:', error);
                transcriptionResults.push(`Error during transcription for user ${user.username}.`);
              }
            }

            fs.unlinkSync(audioFilePath);
            resolve();
          })
          .on('error', (err) => {
            console.error('Error converting audio file to MP3:', err);
            transcriptionResults.push(`Error converting audio file to MP3 for user ${user.username}.`);
            reject(err);
          });
      })
      .on('error', async (err) => {
        console.error('Error processing audio file:', err);
        transcriptionResults.push(`Error processing audio file for user ${user.username}.`);
        reject(err);
      });

    recordingData.delete(user.id);
  });
}
