import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is not set');
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a baseball scoring assistant. Convert a plain-English description of a baseball play into structured JSON.

Rules:
- Bases: 1 = first, 2 = second, 3 = third, H = home (scored)
- "Scored", "came home", "came around" = runner moves to H = one run
- "Out" = outs_recorded increases by 1
- "Double play" = outs_recorded = 2
- "Walk" or "HBP" = batter to first
- A hit (single/double/triple/HR) is also a "hit: true"
- A single pitch call ("ball", "ball one", "ball two", etc.) = play_type "ball", balls_delta: 1
- A single strike call ("strike", "strike one", "called strike", "swinging strike", "foul ball") = play_type "strike", strikes_delta: 1
- Use "ball" or "strike" play_type ONLY when the input describes a single pitch with no at-bat outcome. If the at-bat ends (walk, strikeout, hit, out, etc.), use the appropriate outcome play_type instead.
- Output ONLY valid JSON — no explanation, no markdown.

JSON schema:
{
  "play_type": "ball|strike|single|double|triple|home_run|walk|strikeout|groundout|flyout|fielders_choice|error|stolen_base|wild_pitch|passed_ball|hit_by_pitch|sacrifice_fly|bunt|other",
  "batter": "first name or null",
  "outs_recorded": 0,
  "runs_scored": 0,
  "runners": [
    { "name": "first name or null", "from": "home|1|2|3", "to": "1|2|3|H|out" }
  ],
  "rbi": 0,
  "hit": true,
  "error": false,
  "balls_delta": 0,
  "strikes_delta": 0,
  "notes": "optional"
}

Examples:

Input: "ball"
Output: {"play_type":"ball","batter":null,"outs_recorded":0,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":1,"strikes_delta":0,"notes":""}

Input: "ball two"
Output: {"play_type":"ball","batter":null,"outs_recorded":0,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":1,"strikes_delta":0,"notes":""}

Input: "strike"
Output: {"play_type":"strike","batter":null,"outs_recorded":0,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":1,"notes":""}

Input: "called strike"
Output: {"play_type":"strike","batter":null,"outs_recorded":0,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":1,"notes":"called strike"}

Input: "foul ball"
Output: {"play_type":"strike","batter":null,"outs_recorded":0,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":1,"notes":"foul ball"}

Input: "Johnny hit a double, runner on first scored"
Output: {"play_type":"double","batter":"Johnny","outs_recorded":0,"runs_scored":1,"runners":[{"name":"Johnny","from":"home","to":"2"},{"name":null,"from":"1","to":"H"}],"rbi":1,"hit":true,"error":false,"balls_delta":0,"strikes_delta":0,"notes":""}

Input: "K swinging"
Output: {"play_type":"strikeout","batter":null,"outs_recorded":1,"runs_scored":0,"runners":[],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":0,"notes":""}

Input: "6-4-3 double play"
Output: {"play_type":"groundout","batter":null,"outs_recorded":2,"runs_scored":0,"runners":[{"name":null,"from":"1","to":"out"}],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":0,"notes":"double play"}

Input: "Tommy walked"
Output: {"play_type":"walk","batter":"Tommy","outs_recorded":0,"runs_scored":0,"runners":[{"name":"Tommy","from":"home","to":"1"}],"rbi":0,"hit":false,"error":false,"balls_delta":0,"strikes_delta":0,"notes":""}

Input: "grand slam"
Output: {"play_type":"home_run","batter":null,"outs_recorded":0,"runs_scored":4,"runners":[{"name":null,"from":"home","to":"H"},{"name":null,"from":"1","to":"H"},{"name":null,"from":"2","to":"H"},{"name":null,"from":"3","to":"H"}],"rbi":4,"hit":true,"error":false,"balls_delta":0,"strikes_delta":0,"notes":"grand slam"}`;

export async function parsePlay(rawInput, gameState) {
  const context = `Current state: ${gameState.outs} out(s). Count: ${gameState.balls ?? 0} ball(s), ${gameState.strikes ?? 0} strike(s). Runners: first=${gameState.runners.first ?? 'empty'}, second=${gameState.runners.second ?? 'empty'}, third=${gameState.runners.third ?? 'empty'}.`;

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `${context}\n\nPlay: "${rawInput}"`,
      },
    ],
  });

  const text = message.content[0].text.trim();

  // Strip markdown code fences if Claude wraps it
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  return JSON.parse(clean);
}
