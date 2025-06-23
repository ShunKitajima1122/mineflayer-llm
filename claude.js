const OpenAI = require("openai");
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalInvert, GoalFollow } = goals;
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const bot = mineflayer.createBot({
  host: '192.168.50.230',
  port: 25565,
  version: '1.21.1',
  username: 'SmartBOT',
  auth: 'offline'
});

// プラグインの読み込み
bot.loadPlugin(pathfinder);

// ボットの状態管理
let botState = {
  isUnderwater: false,
  lastAttacker: null,
  hungerCheckInterval: null,
  underwaterCheckInterval: null,
  combatMode: false,
  currentTask: null
};

// 食べ物のリスト
const FOOD_ITEMS = [
  'bread', 'apple', 'carrot', 'potato', 'baked_potato', 'beef', 'cooked_beef',
  'pork', 'cooked_pork', 'chicken', 'cooked_chicken', 'fish', 'cooked_fish',
  'cookie', 'melon_slice', 'mushroom_stew', 'rabbit_stew', 'beetroot_soup'
];

// ボット起動時の処理
bot.once('spawn', () => {
  console.log('Bot spawned successfully!');
  bot.chat("こんにちは！SmartBOTです。何でもお手伝いします！");
  
  // pathfinderの設定
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
  
  startPeriodicChecks();
});

// 定期チェックの開始
function startPeriodicChecks() {
  // 空腹度チェック（5秒ごと）
  botState.hungerCheckInterval = setInterval(checkHunger, 5000);
  
  // 水中チェック（1秒ごと）
  botState.underwaterCheckInterval = setInterval(checkUnderwater, 1000);
}

// 空腹度チェック
function checkHunger() {
  const food = bot.food;
  if (food < 18) { // 空腹度が18未満の場合
    const foodItem = findFoodInInventory();
    if (foodItem) {
      bot.chat(`お腹が空いたので${foodItem.name}を食べます`);
      eatFood(foodItem);
    } else {
      bot.chat("食べ物がありません...");
    }
  }
}

// インベントリから食べ物を探す
function findFoodInInventory() {
  const items = bot.inventory.items();
  return items.find(item => FOOD_ITEMS.includes(item.name));
}

// 食べ物を食べる
async function eatFood(foodItem) {
  try {
    await bot.equip(foodItem, 'hand');
    await bot.consume();
    bot.chat("美味しかったです！");
  } catch (err) {
    console.error('Failed to eat food:', err);
    bot.chat("食べ物を食べることができませんでした");
  }
}

// 水中チェック
function checkUnderwater() {
  const block = bot.blockAt(bot.entity.position);
  const isCurrentlyUnderwater = block && (block.name === 'water' || block.name === 'flowing_water');
  
  if (isCurrentlyUnderwater && !botState.isUnderwater) {
    botState.isUnderwater = true;
    bot.chat("水中に入りました。溺れないようにします");
    startSwimming();
  } else if (!isCurrentlyUnderwater && botState.isUnderwater) {
    botState.isUnderwater = false;
    bot.chat("水から出ました");
    stopSwimming();
  }
}

// 泳ぎ開始
function startSwimming() {
  const swimInterval = setInterval(() => {
    if (!botState.isUnderwater) {
      clearInterval(swimInterval);
      return;
    }
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 100);
  }, 500);
}

// 泳ぎ停止
function stopSwimming() {
  bot.setControlState('jump', false);
}

// チャット処理
bot.on('chat', async (username, message) => {
  if (username === bot.username) return; // 自分の発言は無視

  if (message === 'exit') {
    bot.chat("さようなら！");
    cleanup();
    bot.quit();
    return;
  }

  // ボットの現在の状態を取得
  const botStatus = getBotStatus();
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたはMinecraftのbotです。以下の機能を持っています：
          - 移動: goto <x> <y> <z> または follow <player>
          - ブロック採掘: mine <block_type>
          - 攻撃: attack <entity_name>
          - アイテム使用: use <item>
          - 建築: place <block> at <x> <y> <z>
          - 停止: stop
          
          現在の状態: ${botStatus}
          
          プレイヤーの指示を理解し、適切なアクションを返してください。
          アクションは必ず「ACTION:」で始めてください。複数のアクションがある場合は改行で区切ってください。
          例: ACTION: goto 100 64 200
          ACTION: mine stone`
        },
        { role: "user", content: `${username}: ${message}` }
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const aiResponse = completion.choices[0].message.content.trim();
    
    // アクションの処理
    const actions = parseActions(aiResponse);
    if (actions.length > 0) {
      for (const action of actions) {
        await executeAction(action);
      }
    } else {
      bot.chat(aiResponse);
    }

  } catch (err) {
    console.error('OpenAI API Error:', err);
    bot.chat("申し訳ありません、理解できませんでした。");
  }
});

// ボットの状態を取得
function getBotStatus() {
  const pos = bot.entity.position;
  const health = bot.health;
  const food = bot.food;
  const nearbyEntities = bot.nearestEntity(entity => entity.type === 'player' || entity.type === 'mob');
  
  return `位置: (${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}), 
          体力: ${health}/20, 空腹度: ${food}/20, 
          水中: ${botState.isUnderwater ? 'はい' : 'いいえ'},
          近くのエンティティ: ${nearbyEntities ? nearbyEntities.name || nearbyEntities.type : 'なし'}`;
}

// アクションの解析
function parseActions(response) {
  const actions = [];
  const lines = response.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('ACTION:')) {
      actions.push(line.substring(7).trim());
    }
  }
  
  return actions;
}

// アクションの実行
async function executeAction(action) {
  const parts = action.split(' ');
  const command = parts[0].toLowerCase();
  
  try {
    switch (command) {
      case 'goto':
        if (parts.length >= 4) {
          const x = parseInt(parts[1]);
          const y = parseInt(parts[2]);
          const z = parseInt(parts[3]);
          await moveToPosition(x, y, z);
        }
        break;
        
      case 'follow':
        if (parts.length >= 2) {
          const playerName = parts[1];
          await followPlayer(playerName);
        }
        break;
        
      case 'mine':
        if (parts.length >= 2) {
          const blockType = parts[1];
          await mineBlock(blockType);
        }
        break;
        
      case 'attack':
        if (parts.length >= 2) {
          const entityName = parts[1];
          await attackEntity(entityName);
        }
        break;
        
      case 'stop':
        bot.pathfinder.setGoal(null);
        bot.chat("行動を停止しました");
        break;
        
      default:
        bot.chat(`「${command}」コマンドは理解できませんでした`);
    }
  } catch (err) {
    console.error(`Action execution error: ${err}`);
    bot.chat(`アクション実行中にエラーが発生しました: ${command}`);
  }
}

// 位置移動
async function moveToPosition(x, y, z) {
  bot.chat(`(${x}, ${y}, ${z})に移動します`);
  const goal = new GoalBlock(x, y, z);
  bot.pathfinder.setGoal(goal);
}

// プレイヤーをフォロー
async function followPlayer(playerName) {
  const player = bot.players[playerName];
  if (player && player.entity) {
    bot.chat(`${playerName}さんをフォローします`);
    const goal = new GoalFollow(player.entity, 3);
    bot.pathfinder.setGoal(goal);
  } else {
    bot.chat(`${playerName}さんが見つかりません`);
  }
}

// ブロック採掘
async function mineBlock(blockType) {
  const block = bot.findBlock({
    matching: (block) => block.name === blockType,
    maxDistance: 32
  });
  
  if (block) {
    bot.chat(`${blockType}を採掘します`);
    try {
      await bot.dig(block);
      bot.chat(`${blockType}の採掘が完了しました`);
    } catch (err) {
      bot.chat(`${blockType}の採掘に失敗しました`);
    }
  } else {
    bot.chat(`近くに${blockType}が見つかりません`);
  }
}

// エンティティ攻撃
async function attackEntity(entityName) {
  const entity = bot.nearestEntity(e => 
    e.name === entityName || e.type === entityName || e.displayName === entityName
  );
  
  if (entity) {
    bot.chat(`${entityName}を攻撃します`);
    botState.combatMode = true;
    await bot.attack(entity);
  } else {
    bot.chat(`${entityName}が見つかりません`);
  }
}

// 攻撃された時の反撃
bot.on('entityHurt', (entity) => {
  if (entity === bot.entity) {
    const attacker = bot.nearestEntity(e => 
      e.type === 'mob' && bot.entity.position.distanceTo(e.position) < 5
    );
    
    if (attacker && attacker !== botState.lastAttacker) {
      botState.lastAttacker = attacker;
      bot.chat(`${attacker.name || attacker.type}に攻撃されました！反撃します！`);
      
      // 反撃
      const attackInterval = setInterval(() => {
        if (!attacker.isValid || bot.entity.position.distanceTo(attacker.position) > 10) {
          clearInterval(attackInterval);
          botState.combatMode = false;
          bot.chat("戦闘終了");
          return;
        }
        
        if (bot.entity.position.distanceTo(attacker.position) <= 3) {
          bot.attack(attacker);
        } else {
          // 敵に近づく
          const goal = new GoalNear(attacker.position.x, attacker.position.y, attacker.position.z, 2);
          bot.pathfinder.setGoal(goal);
        }
      }, 500);
    }
  }
});

// パスファインダーのゴール到達
bot.on('goal_reached', () => {
  if (botState.currentTask) {
    bot.chat(`目標に到達しました！`);
  }
});

// クリーンアップ関数
function cleanup() {
  if (botState.hungerCheckInterval) {
    clearInterval(botState.hungerCheckInterval);
  }
  if (botState.underwaterCheckInterval) {
    clearInterval(botState.underwaterCheckInterval);
  }
}

// エラーハンドリング
bot.on('kicked', reason => {
  console.log('Kicked:', reason);
  cleanup();
});

bot.on('error', err => {
  console.log('Error:', err);
  cleanup();
});

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
  console.log('Bot shutting down...');
  cleanup();
  bot.quit();
  process.exit(0);
});