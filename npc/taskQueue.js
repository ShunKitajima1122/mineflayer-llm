/**
 * シンプルなタスクキュー
 *   queue.add(tasksArray) で [{type,target}, …] を登録
 *   内部で逐次 actions[type](target) を await 実行
 */
module.exports = (bot, actions) => {
    const q = [];
    let running = false;

    async function run() {
        if (running) return;
        running = true;
        while (q.length) {
            const { type, target, block, count, idx, total } = q.shift();
            if (total) bot.chat(`(${idx}/${total}) ${type} ${target ?? ''}`);
            try {
                if (type === 'placeBlock') {
                    // placeBlock(target, blockName)
                    await actions.placeBlock(target, block);
                } else {
                    // それ以外は (target, count)
                    const fn = actions[type] ?? actions.chat;
                    await fn.call(actions, target, count);
                }
            } catch (err) {
                bot.chat(`タスク ${type} でエラー: ${err.message}`);
            }
        }
        running = false;
    }

    return {
        add(arr) {
            if (!Array.isArray(arr)) return;
            const total = arr.length;
            q.push(...arr.map((t, i) => ({ count: 1, idx: i + 1, total, ...t })));
            run();
        },
        clear() {
            q.length = 0;
        }
    };
};
