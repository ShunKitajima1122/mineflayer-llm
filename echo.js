const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const mineflayer = require('mineflayer');

const bot = mineflayer.createBot({
  host: '192.168.50.230',
  port: 25565,
  version: '1.21.1',
  username: 'BOT',
  auth: 'offline'
});

bot.once('spawn', () => {
  bot.chat("こんにちは！");
})

bot.on('chat', async (username, message_from_bot) => {
  if (username === bot.username) return; // 自分の発言は無視

  if (message_from_bot === 'exit') {
    bot.chat("終了します。");
    bot.quit();
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: message_from_bot }],
      temperature: 0,
      max_tokens: 100,
    });

    const aiText = completion.choices[0].message.content.trim();

    bot.chat(aiText);

  } catch (err) {
    console.error(err);
    bot.chat("エラーが発生しました。");
  }
});

bot.on('kicked', reason => console.log('Kicked:', reason));
bot.on('error', err => console.log('Error:', err));
