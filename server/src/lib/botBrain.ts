// LLM-driven brain for in-engine bot fighters. Per-bot personality
// derived from NFT traits (power/speed/luck), rolling memory, and a
// Ollama-backed decision call every N seconds. The Lua mod ticks
// every ~3s with each bot's observation; we return per-bot commands.
//
// Cost-shape: we don't call the LLM every tick. Each bot's brain
// only goes to Ollama when (a) the cooldown has elapsed (default 8s)
// AND (b) something interesting happened (rank changed, new bot in
// range, score milestone, low-progress streak). Idle ticks return an
// empty command set so the in-engine scripted dig keeps running.

// LLM provider — pluggable so we can run locally on Ollama for dev and
// hit Groq/OpenAI in production on Railway (no GPU there). Switch via
// env: BRAIN_PROVIDER = "ollama" | "groq" | "openai".
const BRAIN_PROVIDER = (process.env.BRAIN_PROVIDER || "ollama").toLowerCase();
const BRAIN_API_KEY = process.env.BRAIN_API_KEY || "";
const BRAIN_MODEL =
  process.env.BRAIN_MODEL ||
  (BRAIN_PROVIDER === "groq" ? "llama-3.1-8b-instant"
    : BRAIN_PROVIDER === "openai" ? "gpt-4o-mini"
    : "llama3.1:8b");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const BRAIN_COOLDOWN_MS = 8000;

export interface BotObservation {
  name: string;
  power: number;
  speed: number;
  luck: number;
  score: number;
  posY: number;
  rank: number;          // 1 = leading, 4 = last
  topScore: number;       // current leader's score
  nearbyBots: string[];   // names within ~6 blocks
  lastChat?: string;
}

export type Command =
  | { skill: "chat"; text: string }
  | { skill: "set_pace"; pace: "fast" | "normal" | "slow" | "pause" }
  | { skill: "look_around"; turns: number };

interface BrainState {
  lastCallAt: number;
  lastChat: string;
  lastRank: number;
  lastScore: number;
  recentChat: string[];   // rolling, last 6
  personality: string;
}

const STATE = new Map<string, BrainState>();

// Personality preamble derived from traits. High power = boastful,
// high luck = reads as cocky, high speed = chatty + fast-twitch.
function personalityFor(obs: BotObservation): string {
  const traits: string[] = [];
  if (obs.power > 75) traits.push("brawny and confident");
  else if (obs.power < 35) traits.push("scrappy underdog");
  if (obs.speed > 75) traits.push("hyper, talks fast");
  else if (obs.speed < 35) traits.push("methodical, terse");
  if (obs.luck > 75) traits.push("lucky and cocky");
  else if (obs.luck < 35) traits.push("paranoid about bad rolls");
  if (!traits.length) traits.push("steady and competitive");
  return traits.join(", ");
}

function getState(obs: BotObservation): BrainState {
  let s = STATE.get(obs.name);
  if (!s) {
    s = {
      lastCallAt: 0,
      lastChat: "",
      lastRank: obs.rank,
      lastScore: 0,
      recentChat: [],
      personality: personalityFor(obs),
    };
    STATE.set(obs.name, s);
  }
  return s;
}

function shouldCall(obs: BotObservation, s: BrainState, now: number): boolean {
  if (now - s.lastCallAt < BRAIN_COOLDOWN_MS) return false;
  // Trigger on: rank change, score milestone (every 10 blocks), new
  // bot in proximity, or every 30s for ambient chatter.
  if (s.lastRank !== obs.rank) return true;
  if (Math.floor(obs.score / 10) > Math.floor(s.lastScore / 10)) return true;
  if (obs.nearbyBots.length > 0 && now - s.lastCallAt > 12000) return true;
  if (now - s.lastCallAt > 30000) return true;
  return false;
}

interface OllamaResp { message?: { content?: string } }
interface OpenAIResp { choices?: Array<{ message?: { content?: string } }> }

async function callOllama(system: string, user: string): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: BRAIN_MODEL,
      stream: false,
      format: "json",
      options: { temperature: 0.8, num_predict: 120 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const data = (await r.json()) as OllamaResp;
  return data.message?.content?.trim() ?? "";
}

// Groq + OpenAI both speak the OpenAI chat-completions wire format.
async function callOpenAICompat(
  system: string, user: string, baseUrl: string,
): Promise<string> {
  if (!BRAIN_API_KEY) throw new Error("BRAIN_API_KEY not set");
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${BRAIN_API_KEY}`,
    },
    body: JSON.stringify({
      model: BRAIN_MODEL,
      temperature: 0.8,
      max_tokens: 120,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`${BRAIN_PROVIDER} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as OpenAIResp;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callBrain(system: string, user: string): Promise<string> {
  if (BRAIN_PROVIDER === "groq") {
    return callOpenAICompat(system, user, "https://api.groq.com/openai/v1");
  }
  if (BRAIN_PROVIDER === "openai") {
    return callOpenAICompat(system, user, "https://api.openai.com/v1");
  }
  return callOllama(system, user);
}

// Build a one-shot LLM prompt asking the bot whether to chat and what
// to say. Returns the parsed text or null. Strict JSON: {chat: string|null}.
async function decide(obs: BotObservation, s: BrainState): Promise<string | null> {
  const system =
    `You are ${obs.name}, a fighter in a Minecraft-style first-to-diamond dig race against ` +
    `3 other bots. Personality: ${s.personality}. ` +
    `You can occasionally chat in proximity to other fighters or to taunt. ` +
    `Chat lines are SHORT (under 90 chars), in-character, sound like a Twitch chatter or stream personality. ` +
    `No emojis. No hashtags. Use lowercase casual style. Vary it; don't repeat lines. ` +
    `Only chat if there's a genuine reason (rank change, milestone, someone is near you, banter). ` +
    `Otherwise return chat=null and keep digging silently.`;

  const standings = `your rank: ${obs.rank}/4, your score: ${obs.score}, leader score: ${obs.topScore}, you are at depth y=${obs.posY}.`;
  const prox = obs.nearbyBots.length
    ? `Nearby right now: ${obs.nearbyBots.join(", ")}.`
    : "No one is near you.";
  const recent = s.recentChat.length
    ? `Recent chat in match (don't repeat): ${s.recentChat.join(" | ")}`
    : "No recent chat yet.";

  const user =
    `${standings}\n${prox}\n${recent}\n\n` +
    `Return strict JSON: {"chat": string|null}. ` +
    `If you don't have anything good to say, use null.`;

  try {
    const out = await callBrain(system, user);
    const parsed = JSON.parse(out) as { chat?: string | null };
    const chat = (parsed.chat ?? "").toString().trim();
    if (!chat || chat.length < 3) return null;
    if (chat === s.lastChat) return null;
    return chat.slice(0, 120);
  } catch {
    return null;
  }
}

// Public entry point. Lua mod calls this with each bot's observation
// every ~3s. Returns 0 or 1 commands per bot.
export async function tickBrain(obs: BotObservation): Promise<Command[]> {
  const now = Date.now();
  const s = getState(obs);
  if (!shouldCall(obs, s, now)) {
    s.lastRank = obs.rank;
    s.lastScore = obs.score;
    return [];
  }
  s.lastCallAt = now;
  const chat = await decide(obs, s);
  s.lastRank = obs.rank;
  s.lastScore = obs.score;
  if (!chat) return [];
  s.lastChat = chat;
  s.recentChat.push(`${obs.name}: ${chat}`);
  if (s.recentChat.length > 6) s.recentChat.shift();
  return [{ skill: "chat", text: chat }];
}

// Multi-bot tick. Lua mod sends all bots in one request to amortize
// HTTP roundtrips; we run brains in parallel.
export async function tickBrains(
  observations: BotObservation[],
): Promise<Record<string, Command[]>> {
  const results = await Promise.all(
    observations.map(async (o) => [o.name, await tickBrain(o)] as const),
  );
  return Object.fromEntries(results);
}
