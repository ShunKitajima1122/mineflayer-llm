require('dotenv-safe').config({ allowEmptyValues: true });
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const collectBlockPlugin = require('mineflayer-collectblock').plugin;
const mcDataLoader = require('minecraft-data');
const history = require('./history');
const createAI = require('./ai');
const createActions = require('./actions');
const createUtils = require('./utils');
const Sentry = process.env.SENTRY_DSN ? require('@sentry/node') : null;
const createTaskQueue = require('./taskQueue');

module.exports = function createBot() {
    const bot = mineflayer.createBot({
        host: process.env.MC_HOST,
        port: Number(process.env.MC_PORT),
        version: process.env.MC_VERSION,
        username: process.env.MC_USERNAME,
        auth: process.env.MC_AUTH
    });

    if (Sentry) Sentry.init({ dsn: process.env.SENTRY_DSN });

    /* ── Plugins / Utilities ── */
    bot.loadPlugin(pathfinder);
    bot.loadPlugin(pvp);
    bot.loadPlugin(collectBlockPlugin);

    const ai = createAI();
    const utils = createUtils(bot);
    const mcData = mcDataLoader(bot.version);
    const actions = createActions(bot, utils, mcData);

    /* ── spawn 後に経路設定を初期化 ── */
    bot.once('spawn', () => {
        /* Movements 初期化 */
        const mcData = mcDataLoader(bot.version);
        const movements = new Movements(bot, mcData);
        movements.allow1by1towers = true;
        bot.pathfinder.setMovements(movements);

        /* NBT 重量対策：アンロードされたチャンクを pathfinder キャッシュから除去 */
        bot.world.on('chunkColumnUnload', col => {
            delete bot.pathfinder.movements?.cachedWorld?.[col];
        });

        // 初回あいさつ
        bot.chat(
            'こんにちは！できること：来る・掘る・戦う・フォロー・アイテム渡し・持ち物表示・チェスト収納・食事・ジャンプ・寝る。'
        );
    });

    /* ── Interval / Cleanup ── */
    const foodTimer = setInterval(() => {
        if (bot.food < 18 && !bot.pathfinder.isMoving()) utils.tryEat();
    }, 10_000);

    function dispose() { clearInterval(foodTimer); }
    bot.once('end', dispose);
    bot.once('kicked', dispose);

    /* ── Auto-reconnect ── */
    bot.on('end', () => setTimeout(createBot, 3000));
    bot.on('kicked', r => console.log('Kicked:', r));
    bot.on('error', err => console.error('Error:', err));

    /* ── LLM チャット制御 ── */
    const taskQueue = createTaskQueue(bot, actions);

    bot.on('chat', async (username, message) => {
        if (username === bot.username) return;

        history.add('chat', `${username}: ${message}`);
        const status = utils.getStatus(username, message);
        const memory = history.recent(40);

        console.log('Status:', status);
        console.log();

        try {
            const result = await ai.getAction(memory, status);

            if (result.type === 'plan' && Array.isArray(result.steps)) {
                bot.chat('I understand the plan. executing...');
                taskQueue.add(result.steps);
                return;
            }

            const { type, target, block, count } = result;
            if (type === 'digAt') {
                await actions.digAt(target);
            } else if (type === 'placeBlock') {
                await actions.placeBlock(target, block);
            } else {
                await (actions[type] ?? actions.chat).call(actions, target, count);
            }

        } catch (err) {
            console.error(err);
            if (Sentry) Sentry.captureException?.(err);
            bot.chat('Error: ' + err.message);
        }
    });

    /* ── 行動監視 ── */
    // 溺水回避
    bot.on('physicsTick', () => {
        if (!bot.entity.isInWater || bot.oxygenLevel > 10) return;
        const surface = bot.findBlock({
            matching: b => !b.boundingBox && b.position.y > bot.entity.position.y,
            maxDistance: 6
        });
        if (surface) {
            bot.chat('おぼれそうなので陸地へ！');
            bot.pathfinder.setGoal(new GoalNear(surface.position.x, surface.position.y, surface.position.z, 1));
        }
    });

    // 自動食事
    bot.on('foodLevelChange', (_, level) => { if (level < 18) utils.tryEat(); });

    // クイック反撃（3s クールダウン）
    bot.on('entityHurt', (victim) => {
        if (victim !== bot.entity) return;
        const attacker = utils.closestEntity(() => true, 4);
        if (!attacker || utils.recentAttackCooldown()) return;
        bot.chat(`${attacker.name || attacker.mobType} に襲われたので反撃します！`);
        bot.pvp.attack(attacker);
    });

    // 移動結果
    bot.on('goal_reached', () => bot.chat('目的地に到着しました！'));
    bot.on('path_update', r => { if (r.status === 'noPath') bot.chat('経路が見つかりません。'); });

    // 夜間自動就寝
    bot.on('time', () => {
        if (bot.time.isNight && !bot.isSleeping) {
            const bed = bot.findBlock({ matching: b => b.name?.includes('bed'), maxDistance: 16 });
            if (bed) bot.sleep(bed).then(() => bot.chat('Good Night!')).catch(() => { });
        }
    });

    // ログ表示コマンド
    bot.on('chat', (username, message) => {
        if (username === bot.username && message === '!log') {
            (history.recent(15) || 'No log').split('\n').forEach(l => bot.chat(l));
        }
    });
};
