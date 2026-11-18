/**
 * Generate a practice scenario from a free-text topic, e.g.
 * "khách hỏi daily standup", "phỏng vấn remote job backend dev".
 * Returns a client persona + system prompt for Gemini Live.
 */

import { learnerFieldEn, learnerTopics } from './profile';

const REST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

export interface GeneratedScenario {
  title: string;
  title_vi: string;
  skill: string;
  client_persona: string;
}

const PROMPT = `You design speaking-practice scenarios for an English learner.

The learner: a Vietnamese <<<LEARNER_FIELD>>> professional who can already
hold a basic conversation. Goal: freelance and remote work — client calls,
job interviews, negotiation, status updates, clarifying vague requirements.

The learner wants to practice this topic/situation:
"<<<TOPIC>>>"
(The scenario belongs to the area: <<<CATEGORY>>>)

Design ONE role-play scenario where the learner plays the freelancer/dev
and the AI plays the OTHER party (client, interviewer, colleague...).

Return ONLY JSON, no markdown:
{
  "title": "short English name, 2-4 words",
  "title_vi": "tên tiếng Việt ngắn gọn",
  "skill": "2-6 English words naming the skill trained",
  "client_persona": "instructions for the AI playing the other party —
    who they are, their goal in the call, how they should behave
    (vague? tough? friendly?), and what they must NOT reveal unless asked.
    80-150 words."
}`;

export async function generateScenario(
  apiKey: string,
  topic: string,
  categoryLabel = 'freelance and remote work',
): Promise<GeneratedScenario | null> {
  // Field + its problem-domains — anchors generated scenarios to real work.
  const topics = learnerTopics();
  const fieldDesc = learnerFieldEn() + (topics.length ? ` — their domain: ${topics.join(', ')}` : '');

  const prompt = PROMPT
    .replace('<<<TOPIC>>>', topic)
    .replace('<<<CATEGORY>>>', categoryLabel)
    .replace('<<<LEARNER_FIELD>>>', fieldDesc);
  const res = await fetch(`${REST_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) return null;
  const text: string | undefined = (await res.json()).candidates?.[0]
    ?.content?.parts?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text) as GeneratedScenario;
  } catch {
    return null;
  }
}

import { COMMON } from '../scenarios';

/** Wrap a generated persona into a complete Live-API system instruction. */
export function buildSystemPrompt(persona: string): string {
  return `${COMMON}\n\nYOUR ROLE:\n${persona}`;
}
