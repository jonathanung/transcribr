const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const recordingData = require('../../utils/recording/recording-data');
const stopAndProcessRecording = require('../../utils/recording/stop-and-process-recording');

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
