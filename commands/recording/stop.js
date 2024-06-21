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
    const guildId = interaction.guild.id;
    try {
      if (!recordingData[guildId] || recordingData[guildId].size === 0) {
        return interaction.reply('No active recordings found.');
      }

      await interaction.deferReply();
      const promises = [];
      const transcriptionResults = [];

      let connection;
      recordingData[guildId].forEach((recordings, userId) => {
        const user = interaction.guild.members.cache.get(userId)?.user;
        if (!connection && recordings.length > 0) {
          connection = recordings[0].connection;
        }
        recordings.forEach(recordingInfo => {
          promises.push(stopAndProcessRecording(interaction, user, recordingInfo, transcriptionResults, guildId));
        });
      });

      await Promise.all(promises);

      const validTranscriptions = transcriptionResults
        .filter(result => !result.transcription.includes('Unexpected response structure received for user') &&
          !result.transcription.includes('No audio recorded for user') &&
          !result.transcription.includes('Error during transcription for user') &&
          !result.transcription.includes('Error processing audio file for user') &&
          result.time !== null)
        .sort((a, b) => a.time.localeCompare(b.time));
      
      const mergedTranscriptions = [];
      validTranscriptions.forEach(result => {
        const member = interaction.guild.members.cache.get(result.user.id);
        const nickname = member ? (member.nickname || member.user.username) : null;
        const match = result.transcription.match(/(?:user )?(\w+):/);
        if (match) {
          const user = match[1];
          const transcriptionText = result.transcription.split(`${user}: `)[1];
          if (mergedTranscriptions.length > 0 && mergedTranscriptions[mergedTranscriptions.length - 1].user === user) {
            mergedTranscriptions[mergedTranscriptions.length - 1].transcription += ` ${transcriptionText}`;
          } else {
            mergedTranscriptions.push({nickname: nickname, user, transcription: transcriptionText, time: result.time });
          }
        }
      });

      const finalMessage = mergedTranscriptions.length > 0 
        ? mergedTranscriptions.map(result => "*[" + result.time + "]* **" + result.nickname + "**:" + result.transcription).join('\n') 
        : 'No transcriptions were successful.';

      await interaction.followUp(finalMessage);

      if (connection) {
        connection.disconnect();
      }
    } catch (error) {
      console.error('Error executing stop command:', error);
      await interaction.followUp('There was an error while executing this command!');
    } finally {
      delete recordingData[guildId];
    }
  },
};

async function stopAndProcessRecording(interaction, user, recordingInfo, transcriptionResults, guildId) {
  const { audioStream, writeStream, audioFilePath, timestamp, time } = recordingInfo;

  audioStream.destroy();
  writeStream.end();

  // console.log(`Recording saved to ${audioFilePath}`);

  const outputWavPath = path.join(__dirname, guildId, `recording_${user.id}_${timestamp}.wav`);

  return new Promise((resolve, reject) => {
    // console.log('Starting audio processing with ffmpeg');
    ffmpeg(audioFilePath)
      .inputFormat('s16le')
      .audioChannels(1)
      .audioFrequency(48000)
      .audioFilters('volume=1')
      .save(outputWavPath)
      .on('end', async () => {
        // console.log('Audio file converted to WAV:', outputWavPath);
        const audioFile = fs.createReadStream(outputWavPath);

        try {
          // console.log('Starting transcription with OpenAI');
          const response = await openai.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-1',
            prompt: '',
            response_format: 'text',
            language: 'en',
          });

          let transcription;
          if (typeof response === 'string') {
            transcription = response.trim();
          } else if (response && response.text) {
            transcription = response.text.trim();
          } else {
            transcriptionResults.push({ user: user, timestamp: new Date(timestamp), time: time, transcription: `Unexpected response structure received for user ${user.username}.` });
            return resolve();
          }

          transcriptionResults.push({ user: user, timestamp: new Date(timestamp), time: time, transcription: `${user.username}: ${transcription}` });
        } catch (error) {
          if (error.code === 'audio_too_short') {
            transcriptionResults.push({ user: user, timestamp: new Date(timestamp), time: time, transcription: `No audio recorded for user ${user.username}` });
          } else {
            console.error('Error during transcription:', error);
            transcriptionResults.push({ user: user, timestamp: new Date(timestamp), time: time, transcription: `Error during transcription for user ${user.username}.` });
          }
        }

        if (fs.existsSync(outputWavPath)) {
          fs.unlinkSync(outputWavPath);
        }
        if (fs.existsSync(audioFilePath)) {
          fs.unlinkSync(audioFilePath);
        }
        resolve();
      })
      .on('error', async (err) => {
        console.error('Error processing audio file:', err);
        transcriptionResults.push({ user: user, timestamp: new Date(timestamp), time: time, transcription: `Error processing audio file for user ${user.username}.` });
        reject(err);
      });

    recordingData[guildId].delete(user.id);
  });
}
