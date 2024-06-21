const { SlashCommandBuilder } = require('discord.js');
const stopRecording = require('../../utils/recording/stop-recording');
const recordingData = require('../../utils/recording/recording-data');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stops the recording.'),
  async execute(interaction) {
    await interaction.deferReply();
    const guildId = interaction.guild.id;
    const meetingName = recordingData[guildId]?.name || undefined;
    let connection;
    recordingData[guildId].forEach((recordings, userId) => {
      const user = interaction.guild.members.cache.get(userId)?.user;
      if (!connection && recordings.length > 0) {
        connection = recordings[0].connection;
      }
    });
    if (connection && connection.state.status !== 'disconnected') {
      connection.disconnect();
    }
    if (meetingName) {
      await interaction.followUp(`Recording stopped for meeting ${meetingName}.`);
    } else {
      await interaction.followUp('Recording stopped.');
    }
  },
};
