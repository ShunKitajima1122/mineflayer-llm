// fighters.js
const mineflayer = require('mineflayer');
const loadAll    = require('./plugins');

// ★ 起動用ユーティリティ
function makeFighter(name, authTitle) {
  const bot = mineflayer.createBot({
    host: '192.168.50.230',
    username: name,
    version:  '1.21.1',
    forceRefresh: false,
    auth:     'offline',     // LANなら offline ／ Microsoft 認証なら 'microsoft'
    authTitle                  // ← 同じ PC で MS アカを使い分ける場合に指定
  });

  loadAll(bot);

  // エラー出力
  bot.on('kicked',  (reason, loggedIn) => {
  console.log('KICK:', reason)          // ← JSON がそのまま表示される
  })
  bot.on('error', err => console.error('ERR:', err))


  // ───────── 戦闘ロジック ─────────
  bot.on('chat', async (username, msg) => {
    if (username === bot.username) return;

    const [cmd, targetName] = msg.split(' ');

    // 「attack Kitajima」→ プレイヤー Kitajima を２体同時に攻撃
    if (cmd === 'attack' && targetName) {
      const target = bot.players[targetName]?.entity;
      if (!target) return bot.chat(`Target ${targetName} not found`);

      bot.chat(`Engaging ${targetName}!`);
      bot.swordpvp.attack(target);
    }

    // 「stop」→ 追跡＆攻撃中止
    if (cmd === 'stop') {
      bot.chat('Standing down.');
      bot.swordpvp.stop();
      bot.pathfinder.setGoal(null);
    }
  });

  bot.on('death', () => bot.chat('Ouch… respawning soon'));

  return bot;
}

// 起動（名前は好きに変えてOK）
makeFighter('R');
makeFighter('B');
