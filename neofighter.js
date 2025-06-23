// neofighter.js  ─ CommonJS 版 ───────────────────
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { default: customPvp } = require('@nxg-org/mineflayer-custom-pvp')

const bot = mineflayer.createBot({
  host: '192.168.50.230',   // ← サーバー IP
  username: 'NeoFighter',
  version: '1.21.1',
  auth: 'offline'
})

// プラグイン
bot.loadPlugin(pathfinder)
bot.loadPlugin(customPvp)           // default が plugin 関数

// ── 移動 & PvP パラメータ ─────────────────────
bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version)
  const move   = new Movements(bot, mcData)

  move.maxDistance     = 128
  move.maxNodesPerTick = 1500
  move.canDig          = true       // 障害物を掘って進む

  bot.pathfinder.setMovements(move)
  bot.swordpvp.movements   = move    // same config for PvP
  bot.swordpvp.viewDistance = 128
  bot.swordpvp.followRange  = 20
  bot.swordpvp.attackRange  = 3

  bot.chat('Ready for orders!')
})

// グローバルターゲット
let currentTarget = null

// ── チャット制御 ───────────────────────────────
bot.on('chat', (user, msg) => {
  if (user === bot.username) return
  const [cmd, name] = msg.split(' ')

  if (cmd === 'attack' && name) {
    const target = bot.players[name]?.entity
    if (!target) return bot.chat('Target not found')
    currentTarget = target
    bot.chat(`Engaging ${name}`)
  }

  if (cmd === 'stop') {
    currentTarget = null
    bot.swordpvp.stop()
    bot.pathfinder.setGoal(null)
    bot.chat('Standing down')
  }
})

// ── 毎 tick : 追尾+攻撃 再投入 ─────────────────
bot.on('physicsTick', () => {
  if (!currentTarget || !currentTarget.isValid) return

  const dist = bot.entity.position.distanceTo(currentTarget.position)

  // 追尾
  if (dist > 3) {
    bot.pathfinder.setGoal(new goals.GoalFollow(currentTarget, 1), false)
  } else {
    bot.pathfinder.setGoal(null)
  }

  // 殴り指令
  bot.swordpvp.attack(currentTarget)
})

// デバッグ
bot.on('kicked', r => console.log('KICK', r))
bot.on('error',  e => console.error('ERR', e))

