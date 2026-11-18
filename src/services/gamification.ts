import { queries } from '../db/database';

/** Local YYYY-MM-DD for a Date — the unit streaks and goals are measured in. */
export function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sessions per day required to count the day toward the streak (Duolingo XP goal). */
export function getDailyGoal(): number {
  return Math.min(3, Math.max(1, parseInt(queries.getMeta('daily_goal') ?? '1', 10) || 1));
}
export function setDailyGoal(n: number): void {
  queries.setMeta('daily_goal', String(Math.min(3, Math.max(1, Math.round(n)))));
}

/** Conversation mode: 'push' = tap Nói/Gửi per turn, 'auto' = free-flow VAD. */
export type TalkMode = 'push' | 'auto';
export function getTalkMode(): TalkMode {
  return queries.getMeta('talk_mode') === 'auto' ? 'auto' : 'push';
}
export function setTalkMode(m: TalkMode): void {
  queries.setMeta('talk_mode', m);
}

/** Hour of day (0-23) the practice reminder fires. */
export function getReminderHour(): number {
  const h = parseInt(queries.getMeta('reminder_hour') ?? '20', 10);
  return Number.isNaN(h) ? 20 : Math.min(23, Math.max(0, h));
}
export function setReminderHour(h: number): void {
  queries.setMeta('reminder_hour', String(((Math.round(h) % 24) + 24) % 24));
}

/** Consecutive completed days ending today (or yesterday — streak stays alive until today is missed). */
export function computeStreak(completedDays: Set<string>): number {
  const today = dayStr(new Date());
  const d = new Date();
  if (!completedDays.has(today)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (completedDays.has(dayStr(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
