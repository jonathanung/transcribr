const fs = require('fs');
const path = require('path');
const prism = require('prism-media');
const { EndBehaviorType } = require('@discordjs/voice');
const recordingData = require('./recording-data');

async function startRecordingForUser(userId, connection, interaction, guildId) {
  const startNewRecording = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let day = null;
    let time = null;
    const audioFolderPath = path.join(__dirname, "audio_data");
    if (!fs.existsSync(audioFolderPath)) {
      fs.mkdirSync(audioFolderPath);
    }
    const guildFolderPath = path.join(audioFolderPath, guildId);
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
          day = new Date().toLocaleDateString('en-US');
          time = new Date().toLocaleTimeString('en-US', { hour12: false });
          const recordingEntry = recordingData[guildId].get(userId).find(entry => entry.audioFilePath === audioFilePath);
          if (recordingEntry) {
            recordingEntry.time = time; 
            recordingEntry.day = day;
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

    recordingData[guildId].get(userId).push({ connection, audioStream, writeStream, audioFilePath, interaction, timestamp, time, day });
  };

  startNewRecording();
}

module.exports = startRecordingForUser;
