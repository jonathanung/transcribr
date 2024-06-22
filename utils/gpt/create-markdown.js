const fs = require('fs');
const path = require('path');
async function createMarkdownFile(content, guildID, meetingName) {
    const markdownPath = path.join(__dirname, '..', 'recording', `markdowns`);
    if (!fs.existsSync(markdownPath)) {
        fs.mkdirSync(markdownPath,{ recursive: true });
    }
    const folderPath = path.join(markdownPath, `${guildID}`);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath,{ recursive: true });
    }
    const filePath = path.join(folderPath, `${meetingName ? meetingName : guildID}.md`);
    const markdownContent = `${content}`;
    fs.writeFileSync(filePath, markdownContent, 'utf8');

    return filePath;
}

module.exports = createMarkdownFile;