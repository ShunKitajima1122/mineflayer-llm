// plugins.js
// ───────────────────────────────────────────────
// 共通プラグインロード：pathfinder + custom-pvp
// ───────────────────────────────────────────────
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { default: customPvp }    = require('@nxg-org/mineflayer-custom-pvp')

module.exports = function loadAll (bot) {
  // ① 経路探索
  bot.loadPlugin(pathfinder)

  // ② 近接・遠隔 PvP API を追加（bot.swordpvp / bot.bowpvp）
  bot.loadPlugin(customPvp)

  // ③ スポーン後に移動パラメータをセット
  bot.once('spawn', () => {
    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
  })
}

