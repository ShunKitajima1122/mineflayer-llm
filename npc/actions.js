const Vec3 = require('vec3');
const { GoalNear, GoalFollow } = require('mineflayer-pathfinder').goals;

module.exports = (bot, utils) => {
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


        /* ───────── build ───────── */
        async build(target) {
            const startPos = bot.entity.position.clone().floored();
            const delayed = [];

            // ── エイリアスを hut / pillar に正規化 ──
            const alias = {
                'house': 'hut', 'hut': 'hut',
                '家': 'hut', 'いえ': 'hut', 'ハウス': 'hut',
                'pillar': 'pillar', '柱': 'pillar'
            };
            const preset = alias[(target || '').toLowerCase()] || alias[target] || 'pillar';

            // 未定義ならエラー応答（予防）
            const presetTable = { pillar: 3, hut: 64 };
            const blocksNeeded = presetTable[preset];
            if (!blocksNeeded) {
                bot.chat(`"${target}" という建築プリセットは知りません。pillar または hut を指定してください。`);
                return;
            }
            const material = 'oak_planks';

            // ── gather if insufficient ──
            const have = bot.inventory.items().filter(i => i.name === material)
                .reduce((s, i) => s + i.count, 0);
            if (have < blocksNeeded) {
                // 欠けている木材枚数 → 必要な原木本数を計算
                const planksShort = blocksNeeded - have;           // 足りない木材
                const logsNeeded = Math.ceil(planksShort / 4);    // 原木1本→木材4枚

                await this.gather('oak_log', logsNeeded);
                await this.craft('oak_planks', planksShort);
            }

            await this.equip(material);

            bot.chat(`${preset} を建設します (${blocksNeeded} blocks)。`);

            /* ───────── towerJumpPlace (改) ─────────
               ① ジャンプ →「しっかり 0.9 ブロック以上」浮くまで待機
               ② 最高点付近で 3 回まで placeBlock リトライ */
            async function towerJumpPlace(ref) {
                /* ───── Pathfinder がキーを上書きしないよう一時停止 ───── */
                const savedGoal = bot.pathfinder.goal;   // ← 今の目標を退避
                bot.pathfinder.setGoal(null);            // ← ★これが核心
                for (let n = 0; n < 3; n++) {                 // 最大 3 回試す
                    bot.setControlState('jump', true);

                    /* onGround→空中に変わる瞬間を待つ */
                    await new Promise(r => {
                        const cb = () => {
                            if (!bot.entity.onGround) { bot.off('physicsTick', cb); r(); }
                        };
                        bot.on('physicsTick', cb);
                    });

                    /* さらに 6 tick ≒ 0.3 s 浮上して十分クリアランスを確保 */
                    await new Promise(r => setTimeout(r, 300));
                    bot.setControlState('jump', false);

                    await bot.lookAt(ref.position);           // 真下を向く
                    try {
                        await bot.placeBlock(ref, new Vec3(0, 1, 0), { timeout: 2000 });
                        return;                               // 成功したら終了
                    } catch { /* fall-through → 次ループで再挑戦 */ }
                }
                throw new Error('towerJumpPlace failed (3 attempts)');
            }

            /** Bot が立っているマスを置こうとした時、近場へ退避する */
            async function sidestep(center) {
                const rings = [1, 2];                 // 探索半径（1 → 2）
                for (const r of rings) {
                    for (let dx = -r; dx <= r; dx++) {
                        for (let dz = -r; dz <= r; dz++) {
                            const base = center.offset(dx, 0, dz);
                            for (const dy of [0, 1, -1]) {  // 同じ高さ / 1 段上 / 1 段下
                                const pos = base.offset(0, dy, 0);
                                const here = bot.blockAt(pos);
                                const above = bot.blockAt(pos.offset(0, 1, 0));
                                const below = bot.blockAt(pos.offset(0, -1, 0));
                                if (!here?.boundingBox && !above?.boundingBox && below?.boundingBox) {
                                    bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 1));
                                    await waitGoal();
                                    return true;               // 退避に成功
                                }
                            }
                        }
                    }
                }
                return false;                        // 退避できず
            }

            const place = async (dx, dy, dz, retry = false) => {
                const target = startPos.offset(dx, dy, dz) //   常に固定原点から計算

                if (bot.entity.position.floored().equals(target) && !retry) {
                    delayed.push([dx, dy, dz]);   // 後でまとめて再挑戦
                    return;
                }
                /* ② まだ足元なら退避 or tower へ */
                if (bot.entity.position.floored().equals(target)) {
                    const escaped = await sidestep(target);          // 退避をまず試す
                    if (!escaped) {
                        /* ★ 新しく追加する 8 行 ★ */
                        // Pathfinder に「ここへ登れ」と指示 → 1×1タワーを自動生成
                        bot.pathfinder.setGoal(new GoalNear(target.x, target.y + 1, target.z, 0));
                        await waitGoal();                            // 登り切るまで待機

                        // すでにブロックが置かれているはず。念のため確認して return
                        const filled = bot.blockAt(target);
                        if (filled && filled.boundingBox !== 'empty') return;

                        // ラグで置けていなければ通常の placeBlock ロジックへフォールバック
                    }
                }

                /* ① ターゲットが空気でなければスキップ */
                const targetBlock = bot.blockAt(target)
                if (targetBlock && targetBlock.boundingBox !== 'empty') return; // 空気・水などは OK

                /* ② 距離が 3.2 block 以上なら近づく */
                const dist = bot.entity.position.distanceTo(target);
                if (dist > 3.2) {
                    bot.pathfinder.setGoal(new GoalNear(target.x, target.y, target.z, 2));
                    await waitGoal();                             // actions.js に既にある helper
                }

                /* ③ 視線を合わせる */
                await bot.lookAt(target.offset(0.5, 0.5, 0.5));

                /* ④ 手持ちが尽きていたら再装備 */
                if (!bot.heldItem || bot.heldItem.name !== material) {
                    await this.equip(material);
                }

                /* ⑤ 余裕を持って 15 秒タイムアウトに拡張 */
                const ref = bot.blockAt(target.offset(0, -1, 0));
                try {
                    await bot.placeBlock(ref, new Vec3(0, 1, 0), { timeout: 15000 });
                } catch (e) {
                    bot.chat(`⚠️ 置けず再試行: ${e.message}`);
                    await bot.lookAt(ref.position)                 // 視線を補正
                    await bot.placeBlock(ref, new Vec3(0, 1, 0));  // もう一度だけ試す
                }
            };
            if (preset === 'pillar') {
                for (let y = 0; y < 3; y++) await place(0, y, 0);
            } else if (preset === 'hut') {
                for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++)
                    for (let y = 0; y <= (x === 0 && z === 0 ? 0 : 2); y++)
                        if (x === -2 || x === 2 || z === -2 || z === 2 || y === 0)
                            await place(x, y, z);
            }
            /* 後回し分を 1 周だけ再試行 */
            for (const [dx, dy, dz] of delayed) await place(dx, dy, dz, true);
            bot.chat('建設完了！');
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
