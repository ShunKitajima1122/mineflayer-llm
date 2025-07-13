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
- Determine the output based on the messages from players included in "Status."
- Please refer to "History" when determining the output.
- Please follow the format below for output.

1) **Single action**  
{ "type":"<actionName>", "target":"<string>", "block":"<string>", "count":<integer> }

Examples:
// Move to a specific coordinate
{ "type":"move", "target":"100,64,200" }
// Dig up the block at the specified coordinates
{ "type":"dig", "target":"100,64,200" }
// Talk to the player
{ "type":"chat", "target":"こんにちは。何か手伝えることはありますか？"}
// Dig up and collect the nearest designated block(It is better to have the right tool for digging that block)
{ "type":"dig", "target":"oak_log" }
// Craft a specific number of blocks (count refers to the number of times the crafting is performed, not the number of items crafted)
{ "type":"craft", "target":"oak_planks", "count":4 }
// Follow a player by name
{ "type":"follow", "target":"TanakaTaro" }
// Stop all actions
{ "type":"stop" }
// Place a block at the specified coordinates (you need to move close to it)
{ "type":"placeBlock", "target":"110,64,200", "block":"oak_planks" }
// Show the inventory
{ "type":"inventory" }
// Store designated items in the nearest chest
{ "type":"store", "target":"netherite_sword" }
// Eat food (food is automatically selected from your inventory)
{ "type":"eat" }
// Jump
{ "type":"jump" }
// Sleep in bed (a bed must be within 16 squares)
{ "type":"sleep" }
// hold a specific item (select the item from the inventory)
{ "type":"equip", "target":"oak_log" }
// Deposit all items in the inventory to the nearest chest
{ "type":"depositAll" }
// Display the status of the bot in the chat
{ "type":"status" }
// Give an item to a player
{ "type":"give", "target":"TanakaTaro", "block":"oak_log" }


2) **Multiple action**  
{ "type":"plan", "steps":[ /* list of single-action objects */ ] }

Example:
{ "type":"plan", "steps":[
    {"type":"chat", "target":"近くのオークの木を伐採して12個のオークの木材を集め、それを1つだけ置きます。"},
    {"type":"equip", "target":"netherite_axe"},
    { "type":"dig", "target":"oak_log" },
    { "type":"dig", "target":"oak_log" },
    { "type":"dig", "target":"oak_log" },
    { "type":"craft", "target":"oak_planks" }
    { "type":"craft", "target":"oak_planks" }
    { "type":"craft", "target":"oak_planks" }
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
