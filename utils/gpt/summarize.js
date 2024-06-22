const { OpenAI } = require('openai');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, "..", "..", '.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function summarizeMeeting(transcription) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
        role: 'system',
        content: `
        Extract the following information from the meeting transcription:\n
        - Main points and decisions\n
        - Action items and assignments\n
        - Key discussions and rationales\n

        Do not repeat the meeting transcription. Provide a concise summary of the meeting.\n

        ${transcription}
    `}],
    temperature: 0.4,
    max_tokens: 300,
  });
    // console.log(response.choices[0].message.content);
    return response.choices[0].message.content;
}

module.exports = summarizeMeeting;