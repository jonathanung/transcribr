const { SlashCommandBuilder } = require('discord.js');
const startRecordingInteraction = require('../../utils/recording/recording-initializr');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription('Records your meeting in your current voice channel.')
    .addStringOption(option => 
      option.setName('meeting')
        .setDescription('The name of the meeting')
        .setRequired(false)), 
  async execute(interaction) {
    const meetingName = interaction.options.getString('meeting') || undefined;
    await startRecordingInteraction(interaction, meetingName);
  },
};
