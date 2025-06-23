const Vec3 = require('vec3');

module.exports = (bot) => {
    /* ---------- Parsers ---------- */
    function parseCoords(str) {
        if (typeof str !== 'string') return null;
        const parts = str.trim().split(/[ ,]+/);
        if (parts.length < 3) return null;
        const nums = parts.slice(0, 3).map(p => Number(p));
        return nums.every(n => !Number.isNaN(n)) ? nums : null;
    }
    function getGroundY(x, z) {
        for (let y = 255; y > 0; y--) {
            const here = bot.blockAt(new Vec3(x, y, z));
            const above = bot.blockAt(new Vec3(x, y + 1, z));
            if (here?.boundingBox && !above?.boundingBox) return y + 1;
        }
        return null;
    }

    /* ---------- Inventory ---------- */
    function inventoryList() {
        const items = bot.inventory.items();
        return items.length ? items.map(i => `${i.name}×${i.count}`).join(', ') : 'None';
    }
    function findNearestChest() {
        return bot.findBlock({ matching: b => b.name?.includes('chest'), maxDistance: 10 });
    }
    async function tryEat() {
        const food = bot.inventory.items().find(i =>
            /(bread|apple|beef|porkchop|potato|cooked_beef|cooked_porkchop|baked_potato)/.test(i.name)
        );
        if (!food) return false;
        await bot.equip(food, 'hand');
        await bot.consume();
        bot.chat('Eating ' + food.name);
        return true;
    }

    /* ---------- Entities ---------- */
    function getPlayerEntity(name) {
        const key = Object.keys(bot.players).find(p => p.toLowerCase().includes(name.toLowerCase()));
        return bot.players[key]?.entity;
    }
    function closestEntity(filter, max = 4) {
        return Object.values(bot.entities)
            .filter(e => e !== bot.entity && filter(e) && bot.entity.position.distanceTo(e.position) < max)
            .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
    }
    let lastAttack = 0;
    function recentAttackCooldown() {
        const now = Date.now();
        if (now - lastAttack < 3000) return true;
        lastAttack = now; return false;
    }

    /* ---------- Status ---------- */
    function getNearbyPlayers(max = 64) {
        return Object.values(bot.players)
            .filter(p => p.entity && p.username !== bot.username && bot.entity.position.distanceTo(p.entity.position) < max)
            .map(p => `- ${p.username} (Distance:${bot.entity.position.distanceTo(p.entity.position).toFixed(1)})`)
            .join('\\n') || 'None';
    }
    function getNearbyEntities(max = 16) {
        return Object.values(bot.entities)
            .filter(e => e.type === 'mob' && e.mobType !== 'Player' && bot.entity.position.distanceTo(e.position) < max)
            .map(e => `- ${e.name || e.mobType} (HP:${e.health})`).join('\\n') || 'None';
    }

    function getStatus(username, message) {
        // 1. プレイヤー発言
        const playerMessage = { username, message };

        // 2. Bot の状態
        const botStatus = {
            health: bot.health,
            food: bot.food,
            position: {
                x: Math.floor(bot.entity.position.x),
                y: Math.floor(bot.entity.position.y),
                z: Math.floor(bot.entity.position.z),
            }
        };

        // 3. インベントリ
        const inventory = bot.inventory.items().map(item => ({
            item: item.name,
            count: item.count
        }));

        // 4. 周囲のプレイヤー
        const nearbyPlayers = Object.values(bot.players)
            .filter(p => p.entity && p.username !== bot.username)
            .map(p => ({
                name: p.username,
                distance: parseFloat(bot.entity.position.distanceTo(p.entity.position).toFixed(1)),
                position: {
                    x: Math.floor(p.entity.position.x),
                    y: Math.floor(p.entity.position.y),
                    z: Math.floor(p.entity.position.z),
                }
            }));

        // 5. 周囲のモブ
        const nearbyMobs = Object.values(bot.entities)
            .filter(e => e.type === 'mob')
            .map(mob => ({
                type: mob.name,
                health: mob.metadata.health ?? null
            }));

        // ステータスオブジェクトを組み立てて文字列化
        const statusObj = {
            playerMessage,
            botStatus,
            inventory,
            nearbyPlayers,
            nearbyMobs
        };

        // ここで JSON 形式の文字列を返す
        return JSON.stringify(statusObj);
    }

    return {
        parseCoords, getGroundY, tryEat, getPlayerEntity,
        inventoryList, findNearestChest,
        closestEntity, recentAttackCooldown,
        getStatus
    };
};
