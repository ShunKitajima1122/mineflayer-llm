require('dotenv-safe').config({ allowEmptyValues: true });
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

module.exports = () => ({
    async getAction(memory, status) {
        const ACTIONS = [
            'move', 'dig', 'attack', 'gather', 'craft', 'follow', 'give',
            'inventory', 'store', 'eat', 'jump', 'sleep', 'chat',
            'placeBlock', 'equip', 'depositAll', 'status', 'stop'
        ].join(', ');

        const systemPrompt = `
You are an AI agent controlling a Minecraft Mineflayer bot.
You will receive an information containing two sections:

History:
<plain-text event history lines>

Status:
<JSON string representing the current status in minecraft and player message>

Your task:
- Determine the output based on the messages from players included in “Status.”
- Please refer to “History” when determining the output.
- Please follow the format below for output.

1) **Single action**  
{ "type":"<actionName>", "target":"<string>", "block":"<string>", "count":<integer> }

Example:
{ "type":"move", "target":"100,64,200", "count":1 }

2) **Multiple action**  
{ "type":"plan", "steps":[ /* list of single-action objects */ ] }

Example:
{ "type":"plan", "steps":[
    {"type":"chat", "target":"近くの木を切って木材を集め、それを置きます。"},
    { "type":"move", "target":"99,63,200" },
    { "type":"dig", "target":"100,64,200" },
    { "type":"gather", "target":"oak_log", "count":1 },
    { "type":"craft", "target":"oak_planks", "count":4 }
    { "type":"placeBlock", "target":"110,64,200", "block":"oak_planks" }
] }

Valid actionName values:
${ACTIONS}

**IMPORTANT:**

* Return **only** the JSON.
* Do **not** include any extra text or comments.
`;

        // --- call with basic retry ---
        let res;
        for (let i = 0; i < 3; i++) {
            try {
                res = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL,
                    temperature: 0,
                    top_p: 0.1,
                    max_tokens: 4096,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content:
                                `History:\n${memory || '(No events)'}\n\n` +
                                `Status:\n${status}`
                        }
                    ]
                });
                console.log(`AI response: ${res.choices[0].message.content}`);
                console.log();
                return JSON.parse(res.choices[0].message.content);
            } catch (e) {
                if (i === 2) throw e;
                await new Promise(r => setTimeout(r, 2 ** i * 500));
            }
        }
    }
});
