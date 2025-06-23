// miner.js
const mineflayer          = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

const bot = mineflayer.createBot({
  host: '192.168.50.230',
  port: 25565,
  username: 'Miner',
  auth: 'offline',
  forceRefresh: false,
  version: '1.21.1'
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  // デフォルトの移動コストを取得
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
  bot.chat('Ready for orders! (type: follow <name>, goto <x> <y> <z>)');
});

// チャット制御
bot.on('chat', (username, msg) => {
  if (username === bot.username) return;
  const args = msg.split(' ');

  if (args[0] === 'follow' && args[1]) {
    const target = bot.players[args[1]]?.entity;
    if (!target) return bot.chat('Target not found');
    bot.pathfinder.setGoal(new goals.GoalFollow(target, 1));
  }

  if (args[0] === 'goto' && args.length === 4) {
    const [ , x, y, z ] = args.map(Number);
    bot.pathfinder.setGoal(new goals.GoalBlock(x, y, z));
  }

  if (args[0] === 'stop') {
    bot.pathfinder.setGoal(null);
  }
});

