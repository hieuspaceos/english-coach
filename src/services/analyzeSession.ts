import { getUserName, learnerFieldEn, learnerTopics } from './profile';

/**
 * Post-session analysis: send the transcript to Gemini (text model) and get
 * back structured feedback — errors + vocabulary — saved to the error log.
 */

const REST_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent';

export interface AnalysisResult {
  errors: {
    /** Stable snake_case tag for the underlying pattern — same mistake across
     * sessions must get the same tag so the app can count recurrences. */
    key: string;
    said: string;
    correct: string;
    category: 'grammar' | 'vocab' | 'phrasing' | 'pronunciation' | 'other';
    note_vi: string;
  }[];
  vocab: { term: string; meaning_vi: string; example: string }[];
  overall_comment_vi: string;
}

const PROMPT = `You are a strict but constructive English coach. The student is
<<<LEARNER>>> practicing client calls for freelance work.

Below is a transcript of a practice session. "User" lines are what the
student said (speech-to-text, so judge phrasing and grammar, not spelling).
"Client" lines are the AI role-play partner — ignore them except for context.

Find the student's recurring or notable problems:
- grammar mistakes (tense, articles, prepositions, word order)
- unnatural phrasing — correct English that a native speaker wouldn't say
- missing/weak vocabulary for the situation

Return ONLY JSON matching this shape, no markdown:
{
  "errors": [
    {"key": "short-snake-case-tag naming the underlying pattern, e.g. third-person-s, missing-article-the, past-tense, wrong-preposition — REUSE the same tag whenever the same mistake appears, even if the words differ",
     "said": "exact phrase the student said", "correct": "natural way to say it",
     "category": "grammar|vocab|phrasing|other",
     "note_vi": "giải thích ngắn bằng tiếng Việt"}
  ],
  "vocab": [
    {"term": "useful word/phrase worth saving", "meaning_vi": "nghĩa tiếng Việt",
     "example": "example sentence in a freelance/client context"}
  ],
  "overall_comment_vi": "nhận xét chung 1-2 câu bằng tiếng Việt — thẳng, không xu nịnh"
}

Rules:
- Max 10 errors, ordered by importance. Skip trivial disfluencies.
- Max 8 vocab items — only things genuinely useful for client calls in the
  student's actual field, not generic business English.
- If the student's speech is mostly fine, return fewer errors rather than
  padding the list.

TRANSCRIPT:
`;

export async function analyzeTranscript(
  apiKey: string,
  transcript: string,
): Promise<AnalysisResult | null> {
  // Learner profile from onboarding — makes vocab/error feedback domain-relevant.
  const name = getUserName();
  const topics = learnerTopics();
  const learner =
    `a Vietnamese ${learnerFieldEn()} professional${name ? ` named ${name}` : ''}` +
    (topics.length ? ` whose work revolves around ${topics.join(', ')}` : '');

  const res = await fetch(`${REST_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT.replace('<<<LEARNER>>>', learner) + transcript }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const text: string | undefined =
    json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  try {
    return JSON.parse(text) as AnalysisResult;
  } catch {
    return null;
  }
}
