const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config({ path: path.resolve(__dirname, "..", "..", '.env') });
const recordingData = require('./recording-data');
const stopAndProcessRecording = require('./stop-and-process-recording');
const summarizeMeeting = require('../gpt/summarize');
const createMarkdownFile = require('../gpt/create-markdown');
const { create } = require('domain');
const { AttachmentBuilder } = require('discord.js');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function stopRecording(interaction, guildId) {
  try {
    if (!recordingData[guildId] || recordingData[guildId].size === 0) {
      return interaction.reply('No active recordings found.');
    }

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
    .map(result => {
        const datetimeStr = `${result.day} ${result.time}`;
        result.timestamp = new Date(datetimeStr);
        return result;
    })
    .sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0);

    const mergedTranscriptions = [];
    validTranscriptions.forEach(result => {
      const member = interaction.guild.members.cache.get(result.user.id);
      const nickname = member ? (member.nickname || member.user.globalName) : null;
      const match = result.transcription.match(/(?:user )?(\w+):/);
      if (match) {
        const user = match[1];
        const transcriptionText = result.transcription.split(`${user}: `)[1];
        if (mergedTranscriptions.length > 0 && mergedTranscriptions[mergedTranscriptions.length - 1].user === user) {
          mergedTranscriptions[mergedTranscriptions.length - 1].transcription += ` ${transcriptionText}`;
        } else {
          mergedTranscriptions.push({ nickname: nickname, user, transcription: transcriptionText, time: result.time, day: result.day });
        }
      }
    });
    let finalMessage = recordingData[guildId].name
        ? `# Transcription for meeting **${recordingData[guildId].name}**:\n`
        : '# Transcription:\n';
    finalMessage += mergedTranscriptions.length > 0
      ? mergedTranscriptions.map(result => "*[" + result.day + ", "+ result.time + "]* **" + result.nickname + "**:" + result.transcription).join('\n')
        : 'No transcriptions were successful.';

      const summary = await summarizeMeeting(finalMessage);
      finalMessage += '\n\n' + summary;
      const mdPath = await createMarkdownFile(finalMessage, guildId, recordingData[guildId].name);
      await interaction.followUp({ content: 'Here is the meeting minutes:', files: [new AttachmentBuilder(fs.readFileSync(mdPath), {name : `${recordingData[guildId].name ? recordingData[guildId].name : guildId}.md`})] });
      
  } catch (error) {
    console.error('Error executing stop command:', error);
    await interaction.followUp('There was an error while executing this command!');
  } finally {
    delete recordingData[guildId];
  }
}

module.exports = stopRecording;
