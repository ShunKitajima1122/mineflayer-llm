// followAttackBot.js
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { GoalFollow } = goals
const pvp = require('mineflayer-pvp').plugin

function createBot () {
  const bot = mineflayer.createBot({
    host: '192.168.50.230',      // 接続先サーバー
    port: 25565,            // ポート（省略可）
    username: 'HunterBot',  // Botの名前
    auth: 'offline',        // オンライン認証なら 'microsoft'
    version: '1.21.1'       // 明示的に1.21.1を指定
  })

  // プラグイン読み込み
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)

  bot.once('spawn', () => {
    // 移動時の基本設定
    const defaultMove = new Movements(bot)
    bot.pathfinder.setMovements(defaultMove)

    // x[ms]毎にターゲット探索
    setInterval(() => huntNearestPlayer(bot), 200)
  })

  bot.on('kicked', console.log)
  bot.on('error', console.log)
}

function huntNearestPlayer (bot) {
  const target = bot.nearestEntity(e =>
    // プレイヤー     …自分以外
    (e.type === 'player' && e.username !== bot.username) ||
    // 敵対モブ       …ゾンビ・スケルトンなど
    (e.type === 'mob' && e.kind === 'Hostile mobs')
  )

  if (!target) return            // 範囲内にプレイヤーがいない
  if (bot.entity.position.distanceTo(target.position) > 64) return
  if (bot.pvp.target === target) return // 既に攻撃中

  // 追跡開始
  bot.pathfinder.setGoal(new GoalFollow(target, 1), true) // true: 継続追跡
  bot.pvp.attack(target)          // 攻撃開始
}

createBot()

