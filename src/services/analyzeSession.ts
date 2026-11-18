import { getUserName, learnerFieldEn, learnerTopics } from './profile';

/**
 * Post-session analysis: send the transcript to Gemini (text model) and get
 * back structured feedback — errors + vocabulary — saved to the error log.
 */

const REST_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// Tried in order — free-tier daily quota is per-model, so a 429 on the first
// falls through to a cheaper model rather than losing the whole review.
const ANALYSIS_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
];

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
  outline?: { step_vi: string; en: string; up?: string }[];
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
  "outline": [
    {"step_vi": "một ý cần nói — theo đúng thứ tự một câu trả lời hay cho tình huống này",
     "en": "câu mẫu tiếng Anh ngắn cho ý đó — dùng lại nội dung/fact thật của học viên nhưng diễn đạt chuẩn; chỗ nào học viên nên tự thay thông tin của mình thì để ___",
     "up": "optional — phiên bản nâng cấp tự nhiên/hay hơn của câu mẫu, hoặc gợi ý chỗ mở rộng thêm. CHỈ điền khi thật sự đáng nâng cấp, không thì bỏ trống"}
  ],
  "overall_comment_vi": "nhận xét chung 1-2 câu bằng tiếng Việt — thẳng, không xu nịnh"
}

Rules:
- Max 10 errors, ordered by importance. Skip trivial disfluencies.
- Max 8 vocab items — only things genuinely useful for client calls in the
  student's actual field, not generic business English.
- "outline": 4-6 steps — structure it on the PROVEN FORMULA for this kind of
  scenario, and name the formula step in step_vi. Examples:
    self-introduction → Present (who I am now) → Past (relevant experience) →
      Proof (one concrete result) → Future (why I'm here / what I want)
    discovery call → Open question → Dig into the pain → Confirm understanding
      → Propose next step
    pitching a service → Their problem → Your solution → Proof/result → Ask
    negotiating rate/scope → Anchor → Justify with value → Offer a trade
  If the scenario has no standard formula, use whatever structure a strong
  answer would take. Keep each "en" short and speakable, not fancy.
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

  const body = JSON.stringify({
    contents: [{ parts: [{ text: PROMPT.replace('<<<LEARNER>>>', learner) + transcript }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });

  for (const model of ANALYSIS_MODELS) {
    try {
      const res = await fetch(
        `${REST_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      );
      if (!res.ok) {
        console.warn(`[analyze] ${model} → HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const text: string | undefined =
        json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      try {
        return JSON.parse(text) as AnalysisResult;
      } catch {
        console.warn(`[analyze] ${model} → invalid JSON`);
      }
    } catch (e) {
      console.warn(`[analyze] ${model} →`, e);
    }
  }
  return null;
}
