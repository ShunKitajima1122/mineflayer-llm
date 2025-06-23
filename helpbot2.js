const OpenAI = require("openai");
require("dotenv").config();
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalBlock, GoalNear, GoalFollow } } = require('mineflayer-pathfinder');
const history = require('./history'); // 履歴管理用モジュール
const Vec3 = require('vec3');
const pvp = require('mineflayer-pvp').plugin;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let bot;
function createBot() {
  bot = mineflayer.createBot({
    host: '192.168.50.229',
    port: 25565,
    version: '1.21.1',
    username: 'BOT',
    auth: 'offline'
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  bot.once('spawn', () => {
    history.add('spawn');
    bot.chat("こんにちは！できること：来る・掘る・戦う・フォロー・アイテム渡し・持ち物表示・チェスト収納・食事・ジャンプ・寝る。自然な言葉でどうぞ。");
    const movements = new Movements(bot, bot.registry);
    bot.pathfinder.setMovements(movements);

    const waterTimer = setInterval(() => {
      if (!bot.entity) {
        return;
      }
      if (!bot.entity.isInWater) {
        return;
      }
      // バブルゲージが残り少なければジャンプ or 陸地へ移動
      if (bot.oxygenLevel < 10) { // 1.21なら oxygenLevel, それ以前は bot.oxygenLevel
        // 直近の陸地ブロックを探して移動
        let found = false;
        for (let dx = -4; dx <= 4 && !found; dx++) {
          for (let dz = -4; dz <= 4 && !found; dz++) {
            for (let dy = 0; dy <= 4 && !found; dy++) {
              const x = Math.floor(bot.entity.position.x + dx);
              const y = Math.floor(bot.entity.position.y + dy);
              const z = Math.floor(bot.entity.position.z + dz);
              const block = bot.blockAt(new Vec3(x, y, z));
              const above = bot.blockAt(new Vec3(x, y + 1, z));
              if (block && block.boundingBox && above && !above.boundingBox) {
                bot.chat("おぼれそうなので陸地へ！");
                bot.pathfinder.setGoal(new GoalNear(x, y + 1, z, 1));
                found = true;
              }
            }
          }
        }
        if (!found) {
          // 陸地が見つからない場合はジャンプ
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 500);
        }
      }
    }, 500);
  });

  // ログを表示(!log)
  bot.on('chat', (u, msg) => {
    if (u !== bot.username && msg === '!log') {
      const lines = history.recent(15) || '履歴なし';
      lines.split('\n').forEach(l => bot.chat(l));
    }
  });

  // 自分が殴られたら近くの攻撃者を検出して pvp.attack() で反撃
    // 既存２本を削除して ↓ だけ残す
  bot.on('entityHurt', (victim) => {
    if (victim !== bot.entity) return;           // 自分以外なら無視

    // 半径 4 m 以内の最も近いエンティティを攻撃者候補に
    const attacker = Object.values(bot.entities)
      .filter(e =>
        e !== bot.entity &&
        e.position &&
        e.type !== 'object' &&  // 火球など除外               
        bot.entity.position.distanceTo(e.position) < 4
      )
      .sort((a, b) =>
        bot.entity.position.distanceTo(a.position) -
        bot.entity.position.distanceTo(b.position)
      )[0];

    if (!attacker) return;

    // ---- ① チャット＆履歴 ----
    const name = attacker.name || attacker.mobType;
    bot.chat(`${name} に襲われたので反撃します！`);
    history.add('pvp', `counter-attack ${name}`);

    // ---- ② 現在の行動を中断し、視線を合わせる ----
    bot.pathfinder.setGoal(null);
    bot.lookAt(attacker.position.offset(0, attacker.height, 0), true);

    // ---- ③ mineflayer-pvp に戦闘を委譲 ----
    if (!bot.pvp.target) {
      bot.pvp.attack(attacker);
    } else if (bot.pvp.target !== attacker) {
      bot.pvp.stop();
      bot.pvp.attack(attacker);
    }
  });

  // bot.on('entityHurt', (victim) => {
  //   if (victim !== bot.entity) return;              // 自分以外なら無視

  //   /** 最も近い “敵対エンティティ” を探す */
  //   const attacker = Object.values(bot.entities)
  //     .filter(e =>
  //       e !== bot.entity &&
  //       e.type !== 'object' &&                      // 火の玉などは除外
  //       bot.entity.position.distanceTo(e.position) < 4
  //     )
  //     .sort((a, b) =>
  //       bot.entity.position.distanceTo(a.position) -
  //       bot.entity.position.distanceTo(b.position)
  //     )[0];

  //   if (!attacker) return;

  //   bot.chat(`${attacker.name || attacker.mobType} に襲われたので反撃します！`);

  //   // 武器が装備されていなければ pvp が自動で最強武器を持ち替えてくれる
  //   bot.pvp.attack(attacker).catch(() => {
  //     bot.chat('反撃に失敗しました……');
  //   });
  // });

  // 戦闘終了通知（キルした／された）
  bot.on('stoppedAttacking', (target) => {
    if (target?.isValid) {
      bot.chat(`${target.name || target.mobType} を倒しました。`);
      history.add('pvp', `killed ${target.name || target.mobType}`);
    }
  });

  // 目的地到達/経路失敗など
  bot.on('goal_reached', () => {
    bot.chat('目的地に到着しました！')
    history.add('action', `arrived at goal`);
  });
  bot.on('path_update', (r) => {
    if (r.status === 'noPath') {
      bot.chat('経路が見つかりません。');
      history.add('action', `no path found`);
    }
  });

  // チャット受付
  bot.on('chat', (username, message) => {
    if (username !== bot.username) {
      history.add('chat', `${username}: ${message}`);
      handleChat(username, message);
    }
  });

  // 自動再接続
  bot.on('end', () => { setTimeout(() => createBot(), 3000); });
  bot.on('kicked', reason => console.log('Kicked:', reason));
  bot.on('error', err => console.log('Error:', err));

  // 夜は自動で寝る
  bot.on('time', () => {
    if (bot.time.isNight && !bot.isSleeping) {
      const bed = bot.findBlock({ matching: block => block.name?.includes('bed'), maxDistance: 16 });
      if (bed) {
        bot.chat("夜なので寝ます。");
        history.add('action', 'sleep at night');
        bot.sleep(bed).catch(err => {
          bot.chat("自動で寝られませんでした: " + (err?.message || "原因不明"));
        });
      }
    }
  });
  

  // 空腹ゲージが減ったタイミングで即時チェック
  bot.on('foodLevelChange', (oldLevel, newLevel) => {
    if (newLevel < 18) tryEat();   // 目安：満腹度９以下で食事
  });

  // 念のためバックアップで 10 秒ごとに監視
  setInterval(() => {
    if (bot.food < 18 && !bot.pathfinder.isMoving()) {
      tryEat();
    }
  }, 10_000);

  // // 被ダメージ直後に「誰に殴られたか」を推測して反撃
  // bot.on('entityHurt', (victim) => {
  //   if (victim !== bot.entity) return;               // bot 以外なら無視

  //   // 直近 3 ブロック以内で一番近いモブ／プレイヤーを攻撃者候補に
  //   const attacker = Object.values(bot.entities)
  //     .filter(e => e !== bot.entity && e.position &&
  //                 bot.entity.position.distanceTo(e.position) < 3.0)
  //     .sort((a, b) =>
  //       bot.entity.position.distanceTo(a.position) -
  //       bot.entity.position.distanceTo(b.position)
  //     )[0];

  //   if (!attacker) return;                           // 見当たらなければ諦める

  //   bot.chat(`${attacker.name || attacker.mobType} に殴られたので反撃！`);
  //   history.add('pvp', `counter-attack ${attacker.name || attacker.mobType}`);
  //   // 右手に武器が無ければインベントリから一番強い剣／斧を自動装備
  //   const weapon = bot.inventory.items()
  //     .filter(i => /(sword|axe)/.test(i.name))
  //     .sort((a, b) => b.attackDamage - a.attackDamage)[0];
  //   if (weapon) bot.equip(weapon, 'hand').catch(() => {});

  //   bot.pathfinder.setGoal(null);                    // 今の移動を中断
  //   bot.lookAt(attacker.position.offset(0, attacker.height, 0), true);
  //   bot.attack(attacker);                            // 近接攻撃
  // });


}

createBot();

// ------------------ ユーティリティ関数 ------------------

// 柔軟な座標抽出
function parseCoords(target) {
  let match = target.match(/x\s*[:=]\s*(-?\d+)\s*,\s*y\s*[:=]\s*(-?\d+)\s*,\s*z\s*[:=]\s*(-?\d+)/i);
  if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  match = target.match(/x\s*[:=]\s*(-?\d+)\s*y\s*[:=]\s*(-?\d+)\s*z\s*[:=]\s*(-?\d+)/i);
  if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  match = target.match(/(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/);
  if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  match = target.match(/(-?\d+)\s+(-?\d+)\s+(-?\d+)/);
  if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  return null;
}

// 指定X,Zの地面高さ（最高高度から降りて最初に立てるY）
function getGroundY(x, z) {
  for (let y = 255; y > 0; y--) {
    const block = bot.blockAt(new Vec3(x, y, z));
    const above = bot.blockAt(new Vec3(x, y + 1, z));
    if (!block || !block.boundingBox) continue;
    if (above && above.boundingBox) continue;
    return y + 1;
  }
  return null;
}

// 食事
async function tryEat() {
  const food = bot.inventory.items().find(i =>
    i.name.includes("bread") || i.name.includes("apple") || i.name.includes("beef") || i.name.includes("porkchop") || i.name.includes("potato")
  );
  if (!food) {
    // bot.chat("食べ物がありません。");
    return false;
  }
  try {
    await bot.equip(food, 'hand');
    await bot.consume();
    bot.chat("食事しました。");
    history.add('action', `ate → ${food.name}`);
    return true;
  } catch { return false; }
}

// プレイヤー名（部分一致可）からentity取得
function getPlayerEntity(name) {
  name = name.toLowerCase();
  const key = Object.keys(bot.players).find(p => p.toLowerCase().includes(name));
  return bot.players[key]?.entity;
}

// インベントリ一覧
function inventoryList() {
  const items = bot.inventory.items();
  if (items.length === 0) return "インベントリは空です。";
  return items.map(i => `${i.name}×${i.count}`).join(", ");
}

// 近くのチェストブロック取得
function findNearestChest() {
  return bot.findBlock({
    matching: block => block.name?.includes('chest'),
    maxDistance: 10
  });
}

function getNearbyPlayers(maxDist = 64) {
    return Object.values(bot.players)
      .filter(p => p.entity && p.username !== bot.username &&
        bot.entity.position.distanceTo(p.entity.position) < maxDist)
      .map(p => ({
        name: p.username,
        x: Math.floor(p.entity.position.x),
        y: Math.floor(p.entity.position.y),
        z: Math.floor(p.entity.position.z),
        distance: bot.entity.position.distanceTo(p.entity.position).toFixed(1)
      }));
  }
  
  function getNearbyEntities(maxDist = 16) {
    return Object.values(bot.entities)
      .filter(e =>
        e.type === 'mob' && e.mobType !== 'Player' &&
        bot.entity.position.distanceTo(e.position) < maxDist
      )
      .map(e => ({
        name: e.name || e.mobType,
        type: e.type,
        x: Math.floor(e.position.x),
        y: Math.floor(e.position.y),
        z: Math.floor(e.position.z),
        distance: bot.entity.position.distanceTo(e.position).toFixed(1),
        hp: e.health
      }));
  }
  
  function getStatus(username, message) {
    return `
  【プレイヤーからの発言】 ${username}: ${message}
  【Bot自身】 座標: x=${Math.floor(bot.entity.position.x)}, y=${Math.floor(bot.entity.position.y)}, z=${Math.floor(bot.entity.position.z)}
  HP: ${bot.health} / 満腹度: ${bot.food} / 状態: ${bot.isSleeping ? '寝ている' : bot.entity.isInWater ? '水中' : bot.pathfinder.isMoving() ? '移動中' : '待機中'}
  【インベントリ】 ${inventoryList()}
  【周囲のプレイヤー（64マス以内）】
  ${getNearbyPlayers().map(p => `- ${p.name} (距離: ${p.distance} 座標: ${p.x},${p.y},${p.z})`).join('\n') || 'なし'}
  【周囲のモンスター（16マス以内）】
  ${getNearbyEntities().map(e => `- ${e.name} (HP:${e.hp} 距離:${e.distance} 座標:${e.x},${e.y},${e.z})`).join('\n') || 'なし'}
  【時刻】 ${bot.time.timeOfDay >= 13000 && bot.time.timeOfDay < 23000 ? '夜' : '昼'} / 天候: ${bot.isRaining ? '雨' : '晴れ'}
  【ワールド名】 ${bot.game?.dimension}
  【現在のゴール】 ${bot.pathfinder.goal ? JSON.stringify(bot.pathfinder.goal) : 'なし'}
    `;
  }
  

// メインチャットハンドラ
async function handleChat(username, message) {
  // 状況
  const status = getStatus(username, message);
  const recent = history.recent(40);        // 直近40イベント

  // 履歴を systemPrompt の直前に差し込み
  const memoryBlock = `【直近イベント履歴】\n${recent || '（直近イベントなし）'}`;

  // AIプロンプト
  const systemPrompt = `
あなたはMinecraftのMineflayer Botの制御AIです。
ユーザーの発言をもとに、以下のいずれかのアクションを1つ選び、下記のフォーマットで返してください。
targetにはMinecraft(1.21.1)におけるアイテムIDを使用してください。

■可能なアクション(type)
- move: 座標/プレイヤーのもとへ移動（例: move x:100,y:64,z:200 または move Kitajima）
- dig: ブロックを掘る（例: dig x:99,y:63,z:199 または dig diamond_ore）
- attack: エンティティを攻撃（例: attack zombie または attack x:100,y:64,z:200）
- follow: プレイヤーに追従（例: follow Kitajima）
- give: アイテムをプレイヤーに渡す（例: give Kitajima ダイヤモンド）
- inventory: インベントリをチャットで表示
- store: アイテムをチェストにしまう（例: store ダイヤモンド）
- eat: 食事する
- jump: ジャンプする
- sleep: 寝る
- chat: 発言のみ（例: chat その指示は対応できません）

【出力例】
---
type: move
target: x:100,y:65,z:200
---
type: follow
target: Kitajima
---
type: give
target: Kitajima cooked_mutton
---
type: inventory
target: ignore
---
type: chat
target: アイテム名がわかりません
---
type: dig
target: x:100,y:64,z:200
---
type: jump
target: ignore
---
type: sleep
target: ignore
---
type: eat
target: ignore
---
type: store
target: diamond
---

ユーザーが分かりにくい指示や未対応の場合は type: chat で説明・確認メッセージを返してください。
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: memoryBlock },
        { role: "user", content: status }
      ],
      temperature: 0.1,
      max_tokens: 120,
    });

    const aiText = completion.choices[0].message.content.trim();
    const match = aiText.match(/type:\s*(\w+)[\s\S]*?target:\s*([^\n]+)/i);
    if (!match) { bot.chat("何をすればいいか分かりませんでした。"); return; }

    const type = match[1].toLowerCase();
    const target = match[2].trim();

    switch (type) {
      case 'move': {
        history.add('action', `move → ${target}`);
        const coords = parseCoords(target);
        if (coords) {
          let [x, y, z] = coords;
          if (isNaN(y) || y === 0) y = getGroundY(x, z) || bot.entity.position.y;
          bot.chat(`座標(${x},${y},${z})に向かいます。`);
          bot.pathfinder.setGoal(new GoalNear(x, y, z, 2));
        } else {
          const player = getPlayerEntity(target);
          if (player) {
            bot.chat(`${target}のところに向かいます。`);
            bot.pathfinder.setGoal(new GoalNear(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z), 2));
          } else {
            bot.chat("移動先が分かりません。");
          }
        }
        break;
      }
      case 'dig': {
        history.add('action', `dig → ${target}`);
        const coords = parseCoords(target);
        if (coords) {
          const [x, y, z] = coords;
          const block = bot.blockAt(new Vec3(x, y, z));
          if (block) {
            bot.chat(`ブロック(${block.name})を掘ります。`);
            await bot.dig(block);
          } else {
            bot.chat("その位置に掘れるブロックがありません。");
          }
        } else {
          const blockId = bot.registry.blocksByName[target]?.id;
          if (!blockId) { bot.chat("そのブロック名が分かりません。"); break; }
          const block = bot.findBlock({ matching: blockId, maxDistance: 16 });
          if (block) {
            bot.chat(`${target}を掘ります。`);
            await bot.dig(block);
          } else {
            bot.chat(`${target}が近くにありません。`);
          }
        }
        break;
      }
      case 'attack': {
        history.add('action', `attack → ${target}`);
        const coords = parseCoords(target);
        let entity;
        if (coords) {
          const [x, y, z] = coords;
          entity = Object.values(bot.entities).find(e =>
            Math.floor(e.position.x) === x && Math.floor(e.position.y) === y && Math.floor(e.position.z) === z
          );
        } else {
          entity = Object.values(bot.entities).find(e =>
            e.name?.toLowerCase() === target.toLowerCase() || e.mobType?.toLowerCase() === target.toLowerCase()
          );
        }
        if (entity) {
          bot.chat(`${target}を攻撃します。`);
          bot.attack(entity);
        } else {
          bot.chat(`${target}が見つかりません。`);
        }
        break;
      }
      case 'follow': {
        history.add('action', `follow → ${target}`);
        const player = getPlayerEntity(target);
        if (player) {
          bot.chat(`${target}についていきます。`);
          bot.pathfinder.setGoal(new GoalFollow(player, 2), true);
        } else {
          bot.chat("そのプレイヤーが見つかりません。");
        }
        break;
      }
      case 'give': {
        history.add('action', `give → ${target}`);
        const words = target.split(/\s+/);
        if (words.length < 2) { bot.chat("アイテム名や相手を指定してください。"); break; }
        const playerName = words[0];
        const itemName = words.slice(1).join(" ");
        const playerEntity = getPlayerEntity(playerName);
        if (!playerEntity) { bot.chat("そのプレイヤーが見つかりません。"); break; }
        const item = bot.inventory.items().find(i => i.name.toLowerCase() === itemName.toLowerCase());
        if (!item) { bot.chat(`${itemName}を持っていません。`); break; }
        try {
          await bot.tossStack(item);
          bot.chat(`${itemName}を${playerName}に渡します。`);
        } catch { bot.chat("アイテムの受け渡しに失敗しました。"); }
        break;
      }
      case 'inventory': {
        history.add('action', `inventory → ${target}`);
        bot.chat("持ち物: " + inventoryList());
        break;
      }
      case 'store': {
        // store target: アイテム名
        history.add('action', `store → ${target}`);
        const chestBlock = findNearestChest();
        const item = bot.inventory.items().find(i => i.name.toLowerCase() === target.toLowerCase());
        if (!chestBlock) { bot.chat("近くにチェストがありません。"); break; }
        if (!item) { bot.chat(`${target}を持っていません。`); break; }
        try {
          const chest = await bot.openChest(bot.blockAt(chestBlock));
          await chest.deposit(item.type, null, item.count);
          bot.chat(`${target}をチェストにしまいました。`);
          chest.close();
        } catch { bot.chat("チェストへの収納に失敗しました。"); }
        break;
      }
      case 'eat': {
        history.add('action', `eat → ${target}`);
        await tryEat();
        break;
      }
      case 'jump': {
        history.add('action', `jump → ${target}`);
        if (bot.entity.onGround) {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 350);
          bot.chat("ジャンプ！");
          history.add('action', 'jumped');
        } else {
          bot.chat("今はジャンプできません（地面にいません）。");
        }
        break;
      }
      case 'sleep': {
        // 近くのベッド取得
        history.add('action', `sleep → ${target}`);
        const bedBlock = bot.findBlock({ matching: block => block.name?.includes('bed'), maxDistance: 16 });
        if (bedBlock) {
          try {
            await bot.sleep(bedBlock);  // bedBlockは既にBlockインスタンス
            bot.chat("ベッドで寝ました。");
          } catch (err) {
            bot.chat("寝られませんでした: " + (err?.message || "原因不明"));
          }
        } else {
          bot.chat("近くにベッドがありません。");
        }
        break;
      }
      case 'chat': {
        history.add('action', `chat → ${target}`);
        bot.chat(target);
        break;
      }
      default: {
        bot.chat("未対応のアクションです。");
      }
    }
  } catch (err) {
    console.error(err);
    bot.chat("エラーが発生しました。");
  }
}
