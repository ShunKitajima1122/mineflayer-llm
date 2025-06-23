// history.js  ── 同じフォルダに保存
const Denque = require('denque');          // npm i denque
const fs = require('fs');
const path = require('path');

const SHORT_LIMIT = 400;                   // メモリに保持する最大件数
const LOG_PATH   = path.join(__dirname, 'bot-history.log');  // 長期ログ

const buf = new Denque();

/** 履歴を push。kind は "chat" | "action" | "pvp" など自由 */
function add(kind, payload, meta = {}) {
  const ev = { ts: Date.now(), kind, payload, meta };
  buf.push(ev);
  if (buf.length > SHORT_LIMIT) buf.shift();           // 古いものを捨てる
  fs.appendFile(LOG_PATH, JSON.stringify(ev) + '\n', () => {});  // 永続ログ
}

/** GPT やチャットに渡す表示用フォーマット */
function recent(lines = 40) {
  return buf
    .toArray()
    .slice(-lines)
    .map(e => `[${new Date(e.ts).toLocaleTimeString()}] ${e.kind}: ${e.payload}`)
    .join('\n');
}

module.exports = { add, recent };
