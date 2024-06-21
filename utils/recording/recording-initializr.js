const { joinVoiceChannel } = require('@discordjs/voice');
const startRecording = require('./start-recording');
const startRecordingForUser = require('./start-recording-for-user');
const recordingData = require('./recording-data');
const stopRecording = require('./stop-recording');

async function startRecordingInteraction(interaction, meetingName) {
  if (!interaction.member.voice.channel) {
    return interaction.reply('You need to join a voice channel first!');
  }

  const guildId = interaction.guild.id;
  const channel = interaction.member.voice.channel;
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  await interaction.deferReply();

  connection.on('stateChange', async (oldState, newState) => {
    if (newState.status === 'ready') {
      if (meetingName) {
        await interaction.followUp(`Recording started in ${channel.name} for meeting **${meetingName}**.`);
      } else {
        await interaction.followUp(`Recording started in ${channel.name}.`);
      }
      startRecording(interaction, connection, channel, guildId, meetingName);
    } else if (newState.status === 'disconnected') {
      console.log('Voice connection disconnected.');
      await stopRecording(interaction, guildId);
      connection.destroy();
    }
  });

  connection.on('error', async error => {
    console.error('Voice connection error:', error);
    await interaction.followUp('Failed to connect to the voice channel.');
  });

  interaction.client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.channelId === channel.id && !newState.member.user.bot) {
      if (!recordingData[guildId]) {
        recordingData[guildId] = new Map();
        recordingData[guildId].name = meetingName;
      }
      if (!recordingData[guildId].has(newState.id)) {
        startRecordingForUser(newState.id, connection, interaction, guildId, meetingName);
      }
    }
  });
}

module.exports = startRecordingInteraction;
