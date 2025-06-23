const Vec3 = require('vec3');
const { GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

module.exports = (bot, utils, mcData) => {
    const {
        parseCoords, getGroundY, tryEat, getPlayerEntity,
        inventoryList, findNearestChest
    } = utils;

    function waitGoal() {
        return new Promise(res => {
            const done = () => {
                bot.off('goal_reached', done);
                bot.off('path_update', noPath);
                res();
            };
            const noPath = r => {
                if (r.status === 'noPath') done();
            };
            bot.on('goal_reached', done);
            bot.on('path_update', noPath);
        });
    }

    return {
        /* ----- move ----- */
        async move(target) {
            const coords = parseCoords(target);
            if (coords) {
                let [x, y, z] = coords;
                if (!y) y = getGroundY(x, z) ?? bot.entity.position.y;
                bot.chat(`座標(${x},${y},${z})へ向かいます。`);
                bot.pathfinder.setGoal(new GoalNear(x, y, z, 2));
                await waitGoal();
                return;
            }
            const player = getPlayerEntity(target);
            if (player) {
                bot.chat(`${player.username} のところへ。`);
                bot.pathfinder.setGoal(new GoalNear(
                    player.position.x, player.position.y, player.position.z, 2));
                await waitGoal();
            } else {
                bot.chat('移動先が分かりません。');
            }
        },

        /* ----- dig ----- */
        async dig(target) {
            const coords = parseCoords(target);
            let block;
            if (coords) block = bot.blockAt(new Vec3(...coords));
            else {
                const id = bot.registry.blocksByName[target]?.id;
                if (id) block = bot.findBlock({ matching: id, maxDistance: 16 });
            }
            if (!block) { bot.chat('掘れるブロックが見つかりません。'); return; }
            bot.chat(`${block.name} を掘ります。`);
            await bot.dig(block);
        },

        /* ───────── attack ───────── */
        async attack(target) {
            let entity;
            const coords = parseCoords(target);
            if (coords) {
                entity = Object.values(bot.entities).find(e =>
                    coords.every((v, i) => Math.floor(e.position[['x', 'y', 'z'][i]]) === v));
            } else {
                entity = Object.values(bot.entities).find(e =>
                    (e.name || e.mobType || '').toLowerCase() === target.toLowerCase());
            }
            if (!entity) return bot.chat('対象が見つかりません。');
            bot.chat(`${target} を攻撃します。`);
            bot.pvp.attack(entity);
        },

        /* ---------- Gather (掘って回収) ---------- */
        async gather(target, count = 1) {
            const id = bot.registry.blocksByName[target]?.id;
            if (!id) return bot.chat('そのブロック名が分かりません。');

            /** 既に所持している数を差し引く */
            const have = bot.inventory.items().filter(i => i.name === target).reduce((s, i) => s + i.count, 0);
            let needed = Math.max(0, count - have);
            if (needed === 0) return bot.chat(`${target} は既に十分所持しています。`);

            while (needed > 0) {
                const block = bot.findBlock({ matching: id, maxDistance: 32 });
                if (!block) { bot.chat(`${target} が見つかりません。`); return; }

                await bot.collectBlock.collect(block);
                needed--;
                bot.chat(`${target} を回収。残り ${needed}`);
            }
        },

        /* ---------- Craft (クラフト) ---------- */
        async craft(target, count = 1) {
            const item = bot.registry.itemsByName[target];
            if (!item) return bot.chat('そのアイテム名が分かりません。');

            /** 既存数を考慮 */
            const have = bot.inventory.items().filter(i => i.name === target).reduce((s, i) => s + i.count, 0);
            const needItems = Math.max(0, count - have);
            if (needItems === 0) { bot.chat(`${target} は既に十分あります。`); return; }

            const recipe = bot.recipesFor(item.id, null, 1, null)[0];
            if (!recipe) return bot.chat('レシピが見つかりません。');

            // レシピ1回の出力数 (例: 原木→木材 は 4)
            const perCraft = recipe.result.count;
            const crafts = Math.ceil(needItems / perCraft);

            try {
                await bot.craft(recipe, crafts, null);
                bot.chat(`${target} ×${perCraft * crafts} をクラフトしました`);
            } catch (err) {
                bot.chat('クラフト失敗: ' + err.message);
            }
        },

        /* ───────── follow ───────── */
        async follow(target) {
            const player = getPlayerEntity(target);
            if (!player) return bot.chat('プレイヤーが見当たりません。');
            bot.chat(`${player.username} についていきます。`);
            bot.pathfinder.setGoal(new GoalFollow(player, 2), true);
        },

        /* ───────── give ───────── */
        async give(target) {
            const [name, ...rest] = target.split(/\s+/);
            const itemName = rest.join(' ');
            const player = getPlayerEntity(name);
            if (!player) return bot.chat('相手が見つかりません。');
            const item = bot.inventory.items().find(i => i.name === itemName);
            if (!item) return bot.chat('アイテムを持っていません。');
            await bot.tossStack(item);
            bot.chat(`${itemName} を ${name} に渡しました。`);
        },

        /* ───────── inventory ───────── */
        inventory() { bot.chat('持ち物: ' + inventoryList()); },

        /* ───────── store ───────── */
        async store(target) {
            const chestBlock = findNearestChest();
            if (!chestBlock) return bot.chat('チェストが見つかりません。');
            const item = bot.inventory.items().find(i => i.name === target);
            if (!item) return bot.chat('アイテムを所持していません。');
            const chest = await bot.openChest(chestBlock);
            await chest.deposit(item.type, null, item.count);
            bot.chat(`${target} を収納しました。`);
            chest.close();
        },

        /* ───────── eat ───────── */
        async eat() { await tryEat(); },

        /* ───────── jump ───────── */
        jump() {
            bot.pathfinder.setGoal(null);
            if (!bot.entity.onGround) return bot.chat('今はジャンプできません。');

            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 350);
            bot.chat('ジャンプ！');
        },

        /* ───────── sleep ───────── */
        async sleep() {
            const bed = bot.findBlock({ matching: b => b.name?.includes('bed'), maxDistance: 16 });
            if (!bed) return bot.chat('近くにベッドがありません。');
            try { await bot.sleep(bed); bot.chat('おやすみ！'); }
            catch { bot.chat('寝られませんでした。'); }
        },

        /* ───────── chat ───────── */
        chat(text) { bot.chat(text); },


        /* ───────── placeBlockAt ───────── */
        async placeBlock(target, blockName) {
            console.log(`placeBlockAt: target=${target}, blockName=${blockName}`);
            // 1) 座標パース
            const coords = utils.parseCoords(target);
            if (!coords) {
                return bot.chat('座標の形式が正しくありません。例: "100 64 -200"');
            }
            const [x, y, z] = coords;

            // 2) Minecraft-data からブロック名→ID
            const name = blockName.includes(':') ? blockName.split(':')[1] : blockName;
            const itemId = mcData.itemsByName[name]?.id;
            if (!itemId) {
                return bot.chat(`不明なアイテム: ${blockName}`);
            }

            // 3) インベントリからそのブロックを探す
            const item = bot.inventory.findInventoryItem(itemId, null);
            if (!item) {
                return bot.chat(`${blockName} を手持ちに見つけられませんでした`);
            }

            // 4) 手に持つ
            await bot.equip(item, 'hand');

            // 5) 目標地点まで移動
            bot.chat(`ブロックを置くため ${x}, ${y}, ${z} へ移動します…`);
            bot.pathfinder.setGoal(new GoalNear(x, y, z, 1));
            await new Promise(res => {
                bot.once('goal_reached', res);
            });

            // 6) 設置基準ブロックを取得
            const placePos = new Vec3(x, y, z);
            const refBlock = bot.blockAt(placePos.offset(0, -1, 0));
            if (!refBlock) {
                return bot.chat('設置場所の下にブロックが見当たりません');
            }

            // 7) 視線を合わせてから設置
            await bot.lookAt(placePos.offset(0.5, 0.5, 0.5));
            try {
                await bot.placeBlock(refBlock, new Vec3(0, 1, 0));
                bot.chat(`${blockName} を (${x}, ${y}, ${z}) に設置しました`);
            } catch (err) {
                bot.chat(`ブロック設置に失敗: ${err.message}`);
            }
        },

        /* ───────── equip ───────── */
        async equip(itemName) {
            const item = bot.inventory.items().find(i => i.name === itemName);
            if (!item) return bot.chat(`${itemName} を持っていません。`);
            await bot.equip(item, 'hand');
            bot.chat(`${itemName} を装備しました。`);
        },

        /* ───────── depositAll ───────── */
        async depositAll() {
            const chestBlock = findNearestChest();
            if (!chestBlock) return bot.chat('チェストが見つかりません。');
            const chest = await bot.openChest(chestBlock);
            for (const it of bot.inventory.items()) {
                await chest.deposit(it.type, null, it.count);
            }
            bot.chat('全アイテムを預けました。');
            chest.close();
        },

        /* ───────── status ───────── */
        status() { bot.chat(utils.getStatus(bot.username, '(status)')); },

        /* ───────── stop ───────── */
        stop() {
            bot.pathfinder.setGoal(null);
            bot.pvp.stop();
            bot.clearControlStates();
            bot.chat('行動を停止しました。');
        }

    };
};
