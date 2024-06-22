const fs = require('fs');
const path = require('path');
const prism = require('prism-media');
const { EndBehaviorType } = require('@discordjs/voice');
const recordingData = require('./recording-data');

async function startRecordingForUser(userId, connection, interaction, guildId, meetingName) {
  const startNewRecording = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    let time = null;
    let day = null;
    const parentFolderPath = path.join(__dirname, 'audio_data');
    if (!fs.existsSync(parentFolderPath)) {
      fs.mkdirSync(parentFolderPath, { recursive: true });
    }
    const guildFolderPath = path.join(parentFolderPath, guildId);
    if (!fs.existsSync(guildFolderPath)) {
      fs.mkdirSync(guildFolderPath, { recursive: true });
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
          day = new Date().toLocaleDateString('en-US');
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
      recordingData[guildId].name = meetingName;
    }

    if (!recordingData[guildId].has(userId)) {
      recordingData[guildId].set(userId, []);
    }

    recordingData[guildId].get(userId).push({ connection, audioStream, writeStream, audioFilePath, interaction, timestamp, time, day });
  };

  startNewRecording();
}

module.exports = startRecordingForUser;
