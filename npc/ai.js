require('dotenv-safe').config({ allowEmptyValues: true });
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = () => ({
    async getAction(memory, status) {
        const ACTIONS = [
            'move', 'dig', 'attack', 'gather', 'craft', 'follow', 'give',
            'inventory', 'store', 'eat', 'jump', 'sleep', 'chat',
            'build', 'equip', 'depositAll', 'status', 'stop'
        ].join(', ');

        const systemPrompt = `
You control a Minecraft Mineflayer bot.
You will receive **Recent Event History** and **Current Status** as subsequent user messages.
Use that information to decide the next single action or multi-step plan.
Return **only** JSON with one of the following two schemas.

\`\`\`jsonc
// 1. Single action
{ "type": "<actionName>", "target": "<string or omitted>", "count": 1 }

// 2. Multi-step plan
{ "type": "plan", "steps": [ /* array of the same single-action objects */ ] }
\`\`\`

Valid \`<actionName>\` ⇒ **${ACTIONS}**.

**Examples (日本語指示対応):**
ユーザー: 「座標 100 64 200 に来て」
→ \`{"type":"move","target":"x:100,y:64,z:200"}\`

ユーザー: 「原木を 16 個集めて木材 64 個クラフト」
\`\`\`json
{
  "type": "plan",
  "steps": [
    { "type": "gather", "target": "oak_log", "count": 16 },
    { "type": "craft",  "target": "oak_planks", "count": 64 }
  ]
}
\`\`\`
`;

        // --- call with basic retry ---
        let res;
        for (let i = 0; i < 3; i++) {
            try {
                res = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    temperature: 0,
                    top_p: 0.1,
                    response_format: { type: 'json_object' },
                    max_tokens: 120,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user', content:
                                `Memory:\n${memory || '(No events)'}\n\n` +
                                `Current Status:\n${status}`
                        }
                    ]
                });
                console.log();
                return JSON.parse(res.choices[0].message.content);
            } catch (e) {
                if (i === 2) throw e;
                await new Promise(r => setTimeout(r, 2 ** i * 500));
            }
        }
    }
});
