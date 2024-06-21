const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { OpenAI } = require('openai');
const recordingData = require('./recording-data');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function stopAndProcessRecording(interaction, user, recordingInfo, transcriptionResults, guildId) {
  const { audioStream, writeStream, audioFilePath, timestamp, time } = recordingInfo;

  audioStream.destroy();
  writeStream.end();

  // console.log(`Recording saved to ${audioFilePath}`);

  const outputWavPath = path.join(__dirname, "audio_data", guildId, `recording_${user.id}_${timestamp}.wav`);

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

module.exports = stopAndProcessRecording;
