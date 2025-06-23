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
You will receive a single user message containing two sections:

Memory:
<plain-text event history lines>

Current:
<JSON string representing the current bot status and the player's instruction>

Example user message:
Memory:
[12:34:56] chat: ShunKitajima: Build a house here

Current:
{"playerMessage":{"username":"ShunKitajima","message":"Build a house here"},"botStatus":{"health":20,"food":19,"position":{"x":100,"y":64,"z":200}},"inventory":[{"item":"oak_planks","count":32}],"nearbyPlayers":[{"name":"Notch","distance":5.3}],"nearbyMobs":[{"type":"zombie","health":10}]}

Your task:
- Parse the JSON in the “Current” section.
- Use the event lines in “Memory” to inform your decision.
- Decide on exactly one of these outputs:

1) **Single action**  
{ "type":"<actionName>", "target":"<string>", "count":<integer> }

Example:
{ "type":"move", "target":"100,64,200", "count":1 }

2) **Plan**
{ "type":"plan", "steps":[ /* list of single-action objects */ ] }

Example:
{ "type":"plan", "steps":[
    { "type":"move", "target":"100,64,200", "count":1 },
    { "type":"gather", "target":"oak_log", "count":1 },
    { "type":"craft", "target":"oak_planks", "count":4 }
    { "type":"placeBlock", "target":"100,64,200", "block":"oak_planks", "count":1 }
] }

Valid actionName values:
${ACTIONS}

3) In the case of **block installation**, be sure to return the following JSON format:
{ "type":"placeBlock", "target":"x,y,z", "block":"oak_planks", "count":1 }

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
                    max_tokens: 120,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        {
                            role: 'user',
                            content:
                                `Memory:\n${memory || '(No events)'}\n\n` +
                                `Current:\n${status}`
                        }
                    ]
                });
                console.log(`AI response: ${res.choices[0].message.content}`);
                return JSON.parse(res.choices[0].message.content);
            } catch (e) {
                if (i === 2) throw e;
                await new Promise(r => setTimeout(r, 2 ** i * 500));
            }
        }
    }
});
