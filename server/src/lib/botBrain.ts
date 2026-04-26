// LLM-driven brain for in-engine bot fighters. Per-bot personality
// derived from NFT traits, rolling memory, an LLM-backed decision
// every N seconds. Lua mod ticks every ~3s with each bot's snapshot;
// brain returns per-bot commands that drive both *what they say* and
// *how they play*.
//
// Pluggable provider via BRAIN_PROVIDER env:
//   ollama (default, local dev) | groq (prod default) | openai (fallback)
//
// Cost shape: idle ticks return [] so the LLM only fires on interesting
// events (rank flip, score milestone, low stamina, idle streak, periodic
// ambient ~30s). For a 5-min 4-bot match: ~30-50 calls total.

const BRAIN_PROVIDER = (process.env.BRAIN_PROVIDER || "ollama").toLowerCase();
const BRAIN_API_KEY = process.env.BRAIN_API_KEY || "";
const BRAIN_MODEL =
  process.env.BRAIN_MODEL ||
  (BRAIN_PROVIDER === "groq" ? "llama-3.1-8b-instant"
    : BRAIN_PROVIDER === "openai" ? "gpt-4o-mini"
    : "llama3.1:8b");
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const CHAT_COOLDOWN_MS = 8000;
const PLAY_COOLDOWN_MS = 10000;

// What the Lua mod sends per bot every tick.
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
  stamina?: number;       // 0..100, 0 = exhausted
  idleSec?: number;        // seconds since last dig
  pace?: "fast" | "normal" | "slow" | "rest";
  lastChat?: string;
}

// What the brain can tell the bot to do. The Lua mod knows how to
// apply each. Multiple commands can stack on a single tick.
export type Command =
  | { skill: "chat"; text: string }
  | { skill: "set_pace"; pace: "fast" | "normal" | "slow" | "rest"; durationSec?: number }
  | { skill: "wander"; xOffset: number; zOffset: number; reason?: string }
  | { skill: "look_around" };

interface BrainState {
  lastChatAt: number;
  lastPlayAt: number;
  lastChat: string;
  lastPace: "fast" | "normal" | "slow" | "rest";
  lastRank: number;
  lastScore: number;
  lastStamina: number;
  recentChat: string[];     // rolling, last 6
  recentGoals: string[];    // rolling, last 4 — for narration variety
  personality: string;
  playStyleHint: string;
}

const STATE = new Map<string, BrainState>();

// Personality preamble derived from NFT traits.
// Power → committedness, Speed → energy/cadence, Luck → instincts.
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

// Hint for the LLM about how this bot's traits should shape *play*
// decisions, not just speech. Power-heavy bots commit to columns,
// speed-heavy bots wander more, luck-heavy bots chase hunches.
function playStyleFor(obs: BotObservation): string {
  const hints: string[] = [];
  if (obs.power > 75) hints.push("bias toward sprint and committing to your column");
  else if (obs.power < 35) hints.push("rest more often, conserve stamina");
  if (obs.speed > 75) hints.push("you can sprint longer without crashing");
  if (obs.luck > 75) hints.push("when behind, willing to wander to a fresh spot — gut feeling matters");
  else if (obs.luck < 35) hints.push("rarely wander, trust the plan");
  return hints.length ? hints.join("; ") : "play steady";
}

function getState(obs: BotObservation): BrainState {
  let s = STATE.get(obs.name);
  if (!s) {
    s = {
      lastChatAt: 0,
      lastPlayAt: 0,
      lastChat: "",
      lastPace: "normal",
      lastRank: obs.rank,
      lastScore: 0,
      lastStamina: obs.stamina ?? 100,
      recentChat: [],
      recentGoals: [],
      personality: personalityFor(obs),
      playStyleHint: playStyleFor(obs),
    };
    STATE.set(obs.name, s);
  }
  return s;
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
      options: { temperature: 0.85, num_predict: 220 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const data = (await r.json()) as OllamaResp;
  return data.message?.content?.trim() ?? "";
}

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
      temperature: 0.85,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(9000),
  });
  if (!r.ok) throw new Error(`${BRAIN_PROVIDER} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = (await r.json()) as OpenAIResp;
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callBrain(system: string, user: string): Promise<string> {
  if (BRAIN_PROVIDER === "groq") return callOpenAICompat(system, user, "https://api.groq.com/openai/v1");
  if (BRAIN_PROVIDER === "openai") return callOpenAICompat(system, user, "https://api.openai.com/v1");
  return callOllama(system, user);
}

// Trigger conditions for the play-decision LLM call. We're stricter
// than chat — play-style shouldn't change every few seconds.
function shouldDecidePlay(obs: BotObservation, s: BrainState, now: number): boolean {
  if (now - s.lastPlayAt < PLAY_COOLDOWN_MS) return false;
  const stamina = obs.stamina ?? 100;
  if (s.lastRank !== obs.rank) return true;
  if (Math.floor(obs.score / 10) > Math.floor(s.lastScore / 10)) return true;
  if (stamina < 25 && s.lastPace !== "rest") return true;
  if (stamina > 80 && s.lastPace === "rest") return true;
  if ((obs.idleSec ?? 0) > 6) return true;
  if (now - s.lastPlayAt > 25000) return true;   // re-evaluate every 25s
  return false;
}

function shouldDecideChat(obs: BotObservation, s: BrainState, now: number): boolean {
  if (now - s.lastChatAt < CHAT_COOLDOWN_MS) return false;
  if (s.lastRank !== obs.rank) return true;
  if (Math.floor(obs.score / 10) > Math.floor(s.lastScore / 10)) return true;
  if (obs.nearbyBots.length > 0 && now - s.lastChatAt > 12000) return true;
  if (now - s.lastChatAt > 30000) return true;
  return false;
}

interface BrainOutput {
  chat: string | null;
  goal: "dig" | "sprint" | "rest" | "wander" | null;
  pace: "fast" | "normal" | "slow" | "rest" | null;
  wander: { xOffset: number; zOffset: number } | null;
  reason: string | null;
}

async function decide(obs: BotObservation, s: BrainState, mode: "chat" | "play" | "both"): Promise<BrainOutput | null> {
  const stamina = obs.stamina ?? 100;
  const lead = obs.score - obs.topScore;          // negative = behind, positive = leading
  const system =
    `You are ${obs.name}, a fighter NFT in an open-world first-to-diamond mining race against 3 other bots in a Minecraft-style game. ` +
    `Personality: ${s.personality}. Play style hints: ${s.playStyleHint}. ` +
    `Your decisions should make the match feel like 4 humans playing — not scripted miners. Vary your goals; don't repeat the same loop. ` +
    `When asked, return strict JSON with these fields (any field can be null when not applicable):\n` +
    `  "chat": short in-character line under 90 chars, lowercase, no emojis/hashtags, twitch-chat style. null = stay silent.\n` +
    `  "goal": one of "dig" | "sprint" | "rest" | "wander" — what you want to do for the next 15-25s. null = keep current.\n` +
    `  "pace": one of "fast" | "normal" | "slow" | "rest" — how hard you swing the pickaxe. null = no change.\n` +
    `  "wander": { "xOffset": int -8..8, "zOffset": int -8..8 } if you want to shift to a new column. null otherwise.\n` +
    `  "reason": one short sentence telling the spectator why (this gets logged, not spoken). null when no decision changed.\n\n` +
    `Rules of thumb:\n` +
    `- if stamina is below 25 you should rest (pace=rest) for ~10s. ignoring this leads to crashes.\n` +
    `- if you're behind by 8+ blocks and have luck>60, consider wander to break the pattern.\n` +
    `- if you're in 1st with a comfortable lead, you can throttle to slow and play it cool.\n` +
    `- if a fighter is in nearbyBots, that's a chance to taunt or react in chat.\n` +
    `- avoid repeating the same goal twice in a row; spectators get bored.`;

  const standings =
    `Rank ${obs.rank}/4. Your score ${obs.score} (${lead >= 0 ? "+" : ""}${lead} vs leader). ` +
    `Depth y=${obs.posY}. Stamina ${stamina}. Current pace ${obs.pace ?? "normal"}. Idle for ${(obs.idleSec ?? 0).toFixed(1)}s.`;
  const prox = obs.nearbyBots.length ? `Nearby: ${obs.nearbyBots.join(", ")}.` : "No fighters near you.";
  const recentChat = s.recentChat.length ? `Recent chat (don't repeat): ${s.recentChat.join(" | ")}` : "";
  const recentGoals = s.recentGoals.length ? `Your recent goals: ${s.recentGoals.join(", ")}.` : "";

  const want =
    mode === "chat" ? `Decide CHAT only this turn (set goal/pace/wander to null).` :
    mode === "play" ? `Decide PLAY only this turn (set chat to null). Update goal/pace and optionally wander.` :
    `You may set both chat and play fields.`;

  const user = `${standings}\n${prox}\n${recentChat}\n${recentGoals}\n\n${want}`;

  try {
    const out = await callBrain(system, user);
    const parsed = JSON.parse(out) as Partial<BrainOutput>;
    const chat = (parsed.chat ?? "").toString().trim();
    const goal = parsed.goal ?? null;
    const pace = parsed.pace ?? null;
    const wander = parsed.wander && typeof parsed.wander === "object"
      ? {
          xOffset: clampInt(parsed.wander.xOffset, -8, 8),
          zOffset: clampInt(parsed.wander.zOffset, -8, 8),
        }
      : null;
    const reason = (parsed.reason ?? "").toString().trim() || null;
    return {
      chat: chat && chat !== s.lastChat ? chat.slice(0, 120) : null,
      goal: ["dig", "sprint", "rest", "wander"].includes(String(goal)) ? (goal as BrainOutput["goal"]) : null,
      pace: ["fast", "normal", "slow", "rest"].includes(String(pace)) ? (pace as BrainOutput["pace"]) : null,
      wander,
      reason: reason ? reason.slice(0, 200) : null,
    };
  } catch {
    return null;
  }
}

function clampInt(v: unknown, lo: number, hi: number): number {
  const n = Math.round(Number(v) || 0);
  return Math.max(lo, Math.min(hi, n));
}

// Public per-bot tick.
export async function tickBrain(obs: BotObservation): Promise<Command[]> {
  const now = Date.now();
  const s = getState(obs);
  const wantChat = shouldDecideChat(obs, s, now);
  const wantPlay = shouldDecidePlay(obs, s, now);
  if (!wantChat && !wantPlay) {
    s.lastRank = obs.rank;
    s.lastScore = obs.score;
    s.lastStamina = obs.stamina ?? 100;
    return [];
  }
  const mode: "chat" | "play" | "both" =
    wantChat && wantPlay ? "both" : wantChat ? "chat" : "play";
  if (wantChat) s.lastChatAt = now;
  if (wantPlay) s.lastPlayAt = now;

  const out = await decide(obs, s, mode);
  s.lastRank = obs.rank;
  s.lastScore = obs.score;
  s.lastStamina = obs.stamina ?? 100;
  if (!out) return [];

  const cmds: Command[] = [];
  if (out.chat) {
    s.lastChat = out.chat;
    s.recentChat.push(`${obs.name}: ${out.chat}`);
    if (s.recentChat.length > 6) s.recentChat.shift();
    cmds.push({ skill: "chat", text: out.chat });
  }
  if (out.pace) {
    s.lastPace = out.pace;
    cmds.push({ skill: "set_pace", pace: out.pace, durationSec: 18 });
  }
  if (out.wander) {
    cmds.push({ skill: "wander", xOffset: out.wander.xOffset, zOffset: out.wander.zOffset, reason: out.reason ?? undefined });
  }
  if (out.goal) {
    s.recentGoals.push(out.goal);
    if (s.recentGoals.length > 4) s.recentGoals.shift();
  }
  return cmds;
}

export async function tickBrains(
  observations: BotObservation[],
): Promise<Record<string, Command[]>> {
  const results = await Promise.all(
    observations.map(async (o) => [o.name, await tickBrain(o)] as const),
  );
  return Object.fromEntries(results);
}
