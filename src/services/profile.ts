import { queries } from '../db/database';

/**
 * User profile — collected once at onboarding, editable in Settings.
 * Each sub-field carries a `topics` list: the real problem-domains of that
 * niche. Topics get injected into the AI prompts so role-play stays on
 * substance (load balancing, ad fatigue, month-end close...) instead of
 * generic small-talk.
 */
export interface SubField {
  id: string;
  vi: string;
  en: string;
  /** Domain problem-areas the AI can realistically bring up. */
  topics: string[];
}
export interface Field {
  id: string;
  vi: string;
  en: string; // fallback when the "Khác" sub is picked
  subs: SubField[];
}

export const FIELDS: Field[] = [
  {
    id: 'dev', vi: 'Lập trình / IT', en: 'software development',
    subs: [
      { id: 'web', vi: 'Web developer', en: 'web development', topics: [
        'page load speed & performance', 'SEO basics', 'responsive UI',
        'deployment & hosting', 'API integration', 'browser compatibility'] },
      { id: 'mobile', vi: 'App / Mobile dev', en: 'mobile app development', topics: [
        'app store review & rejection', 'offline mode & data sync', 'push notifications',
        'battery & memory usage', 'app size limits'] },
      { id: 'backend', vi: 'Backend / API', en: 'backend & API development', topics: [
        'API design & versioning', 'database query optimization', 'caching strategy',
        'scaling & load balancing', 'authentication & security', 'uptime & monitoring'] },
      { id: 'data-ai', vi: 'Data / AI engineer', en: 'data engineering & AI', topics: [
        'data pipelines', 'training cost & GPU limits', 'data quality issues',
        'LLM integration', 'latency vs accuracy tradeoffs'] },
      { id: 'qa', vi: 'QA / Tester', en: 'QA & software testing', topics: [
        'test coverage', 'flaky tests', 'regression bugs', 'automation vs manual testing',
        'release checklists'] },
      { id: 'devops', vi: 'DevOps / Infra', en: 'DevOps & infrastructure', topics: [
        'CI/CD pipelines', 'downtime & incidents', 'cloud cost optimization',
        'monitoring & alerts', 'security patches'] },
      { id: 'other-dev', vi: 'Khác', en: 'software development', topics: [
        'technical debt', 'code review', 'deadline pressure', 'vague requirements', 'estimation'] },
    ],
  },
  {
    id: 'design', vi: 'Thiết kế', en: 'design',
    subs: [
      { id: 'uiux', vi: 'UI/UX designer', en: 'UI/UX design', topics: [
        'user research', 'usability testing', 'design systems', 'accessibility',
        'developer handoff', 'design vs business goals'] },
      { id: 'graphic', vi: 'Graphic design', en: 'graphic design', topics: [
        'brand identity', 'print vs digital specs', 'color & typography',
        'revision rounds', 'licensing & usage rights'] },
      { id: 'product', vi: 'Product design', en: 'product design', topics: [
        'feature prioritization', 'user flows', 'prototyping',
        'conversion metrics', 'stakeholder alignment'] },
      { id: 'motion', vi: 'Motion / Animation', en: 'motion design & animation', topics: [
        'storyboards', 'render time', 'file formats & size limits',
        'frame rate choices', 'client feedback loops'] },
      { id: 'other-design', vi: 'Khác', en: 'design', topics: [
        'creative briefs', 'feedback rounds', 'deadlines', 'portfolio presentation'] },
    ],
  },
  {
    id: 'marketing', vi: 'Marketing / Content', en: 'marketing',
    subs: [
      { id: 'digital', vi: 'Digital marketing', en: 'digital marketing', topics: [
        'funnel optimization', 'conversion rate', 'attribution problems',
        'marketing automation', 'ROI reporting'] },
      { id: 'seo', vi: 'SEO / Content', en: 'SEO & content marketing', topics: [
        'keyword research', 'ranking drops', 'algorithm updates',
        'content calendar', 'backlink building'] },
      { id: 'social', vi: 'Social media', en: 'social media marketing', topics: [
        'engagement rate', 'content calendar', 'community management',
        'algorithm changes', 'influencer collaboration'] },
      { id: 'ads', vi: 'Ads / Performance', en: 'paid advertising & performance marketing', topics: [
        'CAC & ROAS', 'A/B testing', 'audience targeting',
        'ad fatigue', 'budget pacing'] },
      { id: 'email', vi: 'Email / CRM', en: 'email marketing & CRM', topics: [
        'open & click rates', 'list segmentation', 'deliverability',
        'drip campaigns', 'churn & retention'] },
      { id: 'other-mkt', vi: 'Khác', en: 'marketing', topics: [
        'brand positioning', 'campaign planning', 'budgets', 'KPIs'] },
    ],
  },
  {
    id: 'data', vi: 'Data / Phân tích', en: 'data & analytics',
    subs: [
      { id: 'analyst', vi: 'Data analyst', en: 'data analysis', topics: [
        'dashboards', 'data cleaning', 'SQL queries',
        'ad-hoc stakeholder requests', 'metric definitions'] },
      { id: 'bi', vi: 'BI / Reporting', en: 'business intelligence & reporting', topics: [
        'report automation', 'data accuracy', 'dashboard design', 'KPI alignment'] },
      { id: 'ds', vi: 'Data science', en: 'data science', topics: [
        'model accuracy', 'feature engineering', 'A/B experiments',
        'production deployment', 'overfitting'] },
      { id: 'other-data', vi: 'Khác', en: 'data & analytics', topics: [
        'data quality', 'reporting', 'insights', 'tooling'] },
    ],
  },
  {
    id: 'video', vi: 'Video / Media', en: 'media production',
    subs: [
      { id: 'editing', vi: 'Video editing', en: 'video editing', topics: [
        'render times', 'footage organization', 'color grading',
        'client revision rounds', 'format & resolution specs'] },
      { id: 'photo', vi: 'Photography', en: 'photography', topics: [
        'lighting conditions', 'retouching', 'shoot scheduling',
        'licensing & usage rights', 'delivery formats'] },
      { id: 'animator', vi: 'Animator', en: 'animation', topics: [
        'storyboards', 'rigging', 'render times',
        'style consistency', 'frame-by-frame feedback'] },
      { id: 'other-media', vi: 'Khác', en: 'media production', topics: [
        'briefs', 'deadlines', 'revisions', 'delivery formats'] },
    ],
  },
  {
    id: 'sales', vi: 'Kinh doanh / Sales', en: 'sales',
    subs: [
      { id: 'b2b', vi: 'B2B sales', en: 'B2B sales', topics: [
        'pipeline management', 'decision makers', 'contract negotiation',
        'long sales cycles', 'price objections'] },
      { id: 'ecom', vi: 'E-commerce', en: 'e-commerce', topics: [
        'conversion rate', 'cart abandonment', 'shipping & returns',
        'product reviews', 'promotions & discounts'] },
      { id: 'bizdev', vi: 'Biz development', en: 'business development', topics: [
        'partnership proposals', 'market entry', 'relationship building', 'targets & quotas'] },
      { id: 'other-sales', vi: 'Khác', en: 'sales', topics: [
        'quotas', 'prospecting', 'follow-ups', 'CRM hygiene'] },
    ],
  },
  {
    id: 'finance', vi: 'Kế toán / Tài chính', en: 'finance',
    subs: [
      { id: 'accounting', vi: 'Kế toán', en: 'accounting', topics: [
        'reconciliation', 'month-end close', 'invoices & payments',
        'tax deadlines', 'audit preparation'] },
      { id: 'fin-analyst', vi: 'Financial analyst', en: 'financial analysis', topics: [
        'forecasting', 'variance analysis', 'budget planning',
        'financial models', 'investor reporting'] },
      { id: 'audit', vi: 'Kiểm toán', en: 'auditing', topics: [
        'compliance checks', 'evidence collection', 'findings reports',
        'fieldwork schedules', 'materiality thresholds'] },
      { id: 'other-fin', vi: 'Khác', en: 'finance', topics: [
        'budgets', 'cash flow', 'reporting deadlines'] },
    ],
  },
  {
    id: 'edu', vi: 'Giáo dục / Đào tạo', en: 'education',
    subs: [
      { id: 'teacher', vi: 'Giảng dạy', en: 'teaching', topics: [
        'curriculum planning', 'student engagement', 'grading & feedback',
        'classroom management', 'parent communication'] },
      { id: 'trainer', vi: 'Corporate trainer', en: 'corporate training', topics: [
        'learning outcomes', 'workshop facilitation', 'training materials',
        'participant engagement', 'post-training evaluation'] },
      { id: 'tutor', vi: 'Gia sư online', en: 'online tutoring', topics: [
        'lesson planning', 'student progress tracking', 'scheduling across time zones',
        'platform tools', 'student retention'] },
      { id: 'other-edu', vi: 'Khác', en: 'education', topics: [
        'lesson planning', 'assessment', 'student outcomes'] },
    ],
  },
  {
    id: 'writing', vi: 'Viết / Dịch thuật', en: 'writing',
    subs: [
      { id: 'copy', vi: 'Copywriting', en: 'copywriting', topics: [
        'brand voice', 'conversion copy', 'headlines & hooks',
        'client feedback rounds', 'deadline pressure'] },
      { id: 'translate', vi: 'Dịch thuật', en: 'translation', topics: [
        'accuracy vs naturalness', 'terminology consistency', 'CAT tools',
        'tight deadlines', 'ambiguous source text'] },
      { id: 'content', vi: 'Content writing', en: 'content writing', topics: [
        'SEO writing', 'editorial calendar', 'content briefs',
        'tone of voice', 'revision cycles'] },
      { id: 'other-write', vi: 'Khác', en: 'writing', topics: [
        'briefs', 'drafts', 'revisions', 'deadlines'] },
    ],
  },
  {
    id: 'support', vi: 'CSKH / Trợ lý ảo', en: 'customer service',
    subs: [
      { id: 'va', vi: 'Virtual assistant', en: 'virtual assistance', topics: [
        'task management', 'scheduling & calendars', 'email handling',
        'time zone coordination', 'tool stacks'] },
      { id: 'csr', vi: 'Customer support', en: 'customer support', topics: [
        'ticket queues', 'response time SLAs', 'angry customers',
        'escalation paths', 'product knowledge gaps'] },
      { id: 'ops', vi: 'Operations', en: 'operations support', topics: [
        'process documentation', 'vendor coordination', 'workflow efficiency', 'reporting'] },
      { id: 'other-cs', vi: 'Khác', en: 'customer service', topics: [
        'SLAs', 'escalations', 'communication'] },
    ],
  },
];

export function getUserName(): string | null {
  return queries.getMeta('user_name');
}

export function getUserField(): Field | null {
  return FIELDS.find((f) => f.id === queries.getMeta('user_field')) ?? null;
}

export function getUserSubfield(): SubField | null {
  const field = getUserField();
  return field?.subs.find((s) => s.id === queries.getMeta('user_subfield')) ?? null;
}

export function setUserProfile(name: string, fieldId: string, subId: string): void {
  queries.setMeta('user_name', name.trim());
  queries.setMeta('user_field', fieldId);
  queries.setMeta('user_subfield', subId);
}

/** First-run gate: onboarding is done once name + field + sub exist. */
export function isOnboarded(): boolean {
  return !!getUserName() && !!getUserField() && !!getUserSubfield();
}

/** English phrase for prompts — the sub when known, else the field, else generic. */
export function learnerFieldEn(): string {
  return getUserSubfield()?.en ?? getUserField()?.en ?? 'freelance/remote work';
}

/** Domain problem-topics of the chosen sub-field, for prompt anchoring. */
export function learnerTopics(): string[] {
  return getUserSubfield()?.topics ?? [];
}

/**
 * Extra system-instruction block appended to the scenario prompt so the AI
 * partner knows who it's talking to and which problems are realistic —
 * keeps role-play on-substance instead of generic small-talk.
 */
export function learnerContext(): string {
  const name = getUserName();
  const field = getUserField();
  if (!name && !field) return '';
  const topics = learnerTopics();
  const topicLine = topics.length
    ? ` Their work typically revolves around: ${topics.join(', ')} — weave these themes into the conversation naturally where the scenario allows.`
    : '';
  return `\n\nLEARNER CONTEXT: You are talking with ${name ?? 'the learner'}, a Vietnamese professional working in ${learnerFieldEn()}.${topicLine} Stay in character.`;
}
