const fs = require('fs');
const path = require('path');
const prism = require('prism-media');
const recordingData = require('./recording-data');
const startRecordingForUser = require('./start-recording-for-user');

async function startRecording(interaction, connection, channel, guildId, meetingName) {
  const members = channel.members.filter(member => !member.user.bot);

  members.forEach(member => {
    startRecordingForUser(member.id, connection, interaction, guildId, meetingName);
  });
}

module.exports = startRecording;
