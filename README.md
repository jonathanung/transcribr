# Transcribr Discord Bot

### General Libraries:
```zsh
brew install opus
brew install ffmpeg
```

```bash
sudo apt-get install libopus-dev
sudo apt-get install ffmpeg
```

### JS Libraries:
```bash
npm install discord.js@latest @discordjs/voice@latest fluent-ffmpeg@latest dotenv@latest libsodium-wrappers openai@latest
npm install opusscript prism-media@1.3.1 --legacy-peer-deps
npm install --save speech-to-text
```

Optionally just use:
```bash
npm i
```

### dev mode:
```bash
chmod +x refresh.sh
```
in .env
```env
DEV_MODE=true
```

This forces a command refresh every run of bot.js