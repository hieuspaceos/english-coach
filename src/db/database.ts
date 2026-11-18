import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('english_coach.db');

export function initDb() {
  // idempotent — also invoked at module scope below so importers
  // (screens/effects) never query before the tables exist.

  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      transcript TEXT NOT NULL DEFAULT '',
      analysis_json TEXT
    );
    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      err_key TEXT,
      said TEXT NOT NULL,
      correct TEXT NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vocab (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT NOT NULL UNIQUE,
      meaning_vi TEXT NOT NULL,
      example TEXT,
      session_id INTEGER,
      box INTEGER NOT NULL DEFAULT 0,
      next_review_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pitches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uri TEXT NOT NULL,
      transcript TEXT,
      duration_sec INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS custom_scenarios (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL DEFAULT 'custom',
      title TEXT NOT NULL,
      title_vi TEXT NOT NULL,
      skill TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  // Migration for installs created before the category column existed
  try {
    db.execSync(
      "ALTER TABLE custom_scenarios ADD COLUMN category TEXT NOT NULL DEFAULT 'custom'",
    );
  } catch {
    // column already exists
  }
  // Migration: pattern tag for recurring-error grouping
  try {
    db.execSync('ALTER TABLE errors ADD COLUMN err_key TEXT');
  } catch {
    // column already exists
  }
  // Migration: recorded call audio for replay in history/review
  try {
    db.execSync('ALTER TABLE sessions ADD COLUMN audio_uri TEXT');
  } catch {
    // column already exists
  }
  // Drop rows left behind by dropped connects/remounts — they never
  // got a transcript, so they carry no value in history.
  db.runSync("DELETE FROM sessions WHERE transcript IS NULL OR transcript = ''");
}

export interface StoredError {
  err_key: string | null;
  said: string;
  correct: string;
  category: string;
  occurrences: number;
  last_seen: number;
}

export interface SessionRow {
  id: number;
  scenario_id: string;
  started_at: number;
  duration_sec: number;
  transcript: string;
  analysis_json: string | null;
  audio_uri: string | null;
}

export interface VocabRow {
  id: number;
  term: string;
  meaning_vi: string;
  example: string | null;
  box: number;
  next_review_at: number;
}

export interface PitchRow {
  id: number;
  file_uri: string;
  duration_sec: number;
  created_at: number;
}

export interface CustomScenarioRow {
  id: string;
  category: string;
  title: string;
  title_vi: string;
  skill: string;
  system_prompt: string;
}

export const queries = {
  insertSession(scenarioId: string, startedAt: number): number {
    return db.runSync(
      'INSERT INTO sessions (scenario_id, started_at) VALUES (?, ?)',
      scenarioId, startedAt,
    ).lastInsertRowId;
  },

  finishSession(id: number, durationSec: number, transcript: string, audioUri?: string | null) {
    if (!transcript.trim()) {
      // Phantom session (dropped connect / remount) — nothing was ever
      // said, so don't leave an empty row in history.
      db.runSync('DELETE FROM sessions WHERE id = ?', id);
      return;
    }
    db.runSync(
      'UPDATE sessions SET duration_sec = ?, transcript = ?, audio_uri = ? WHERE id = ?',
      durationSec, transcript, audioUri ?? null, id,
    );
  },

  allAudioUris(): string[] {
    return db
      .getAllSync<{ audio_uri: string }>(
        'SELECT audio_uri FROM sessions WHERE audio_uri IS NOT NULL',
      )
      .map((r) => r.audio_uri);
  },

  getSession(id: number) {
    return db.getFirstSync<{ analysis_json: string | null }>(
      'SELECT analysis_json FROM sessions WHERE id = ?',
      id,
    );
  },

  updateSessionAudio(id: number, audioUri: string) {
    db.runSync('UPDATE sessions SET audio_uri = ? WHERE id = ?', audioUri, id);
  },

  saveAnalysis(sessionId: number, analysisJson: string) {
    db.runSync(
      'UPDATE sessions SET analysis_json = ? WHERE id = ?',
      analysisJson, sessionId,
    );
  },

  insertError(sessionId: number, key: string | null, said: string, correct: string, category: string, note: string | null) {
    db.runSync(
      'INSERT INTO errors (session_id, err_key, said, correct, category, note, created_at) VALUES (?,?,?,?,?,?,?)',
      sessionId, key, said, correct, category, note, Date.now(),
    );
  },

  /**
   * Errors grouped by the same underlying mistake — drives the
   * "repeated >= 3 times" rule. New errors carry an AI-generated pattern
   * tag (err_key) so paraphrases count together; legacy rows fall back to
   * normalized said+correct text.
   */
  listRecurringErrors(): StoredError[] {
    return db.getAllSync<StoredError>(
      `SELECT MAX(err_key) AS err_key, MAX(said) AS said, MAX(correct) AS correct, category,
              COUNT(*) AS occurrences, MAX(created_at) AS last_seen
       FROM errors
       GROUP BY COALESCE(NULLIF(err_key,''), lower(trim(said))||'|'||lower(trim(correct)))
       ORDER BY occurrences DESC, last_seen DESC`,
    );
  },

  upsertVocab(term: string, meaningVi: string, example: string | null, sessionId: number) {
    db.runSync(
      `INSERT INTO vocab (term, meaning_vi, example, session_id, created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(term) DO UPDATE SET
         meaning_vi = excluded.meaning_vi,
         example = COALESCE(excluded.example, vocab.example)`,
      term, meaningVi, example, sessionId, Date.now(),
    );
  },

  /** Leitner boxes 0-3 → review after 1d / 3d / 7d / 21d. */
  listVocabDue(): VocabRow[] {
    return db.getAllSync<VocabRow>(
      'SELECT * FROM vocab WHERE next_review_at <= ? ORDER BY next_review_at',
      Date.now(),
    );
  },

  vocabStats(): { total: number; due: number } {
    const row = db.getFirstSync<{ total: number; due: number }>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN next_review_at <= ? THEN 1 ELSE 0 END) AS due
       FROM vocab`,
      Date.now(),
    );
    return { total: row?.total ?? 0, due: row?.due ?? 0 };
  },

  markVocabReviewed(id: number, remembered: boolean) {
    const box = remembered
      ? Math.min(3, (db.getFirstSync<{ box: number }>('SELECT box FROM vocab WHERE id = ?', id)?.box ?? 0) + 1)
      : 0;
    const days = [1, 3, 7, 21][box];
    db.runSync(
      'UPDATE vocab SET box = ?, next_review_at = ? WHERE id = ?',
      box, Date.now() + days * 86400_000, id,
    );
  },

  insertPitch(fileUri: string, transcript: string | null, durationSec: number) {
    db.runSync(
      'INSERT INTO pitches (file_uri, transcript, duration_sec, created_at) VALUES (?,?,?,?)',
      fileUri, transcript, durationSec, Date.now(),
    );
  },

  listPitches(limit = 30): PitchRow[] {
    return db.getAllSync<PitchRow>(
      'SELECT * FROM pitches ORDER BY created_at DESC LIMIT ?',
      limit,
    );
  },

  insertCustomScenario(
    id: string,
    category: string,
    title: string,
    titleVi: string,
    skill: string,
    systemPrompt: string,
  ) {
    db.runSync(
      'INSERT INTO custom_scenarios (id, category, title, title_vi, skill, system_prompt, created_at) VALUES (?,?,?,?,?,?,?)',
      id, category, title, titleVi, skill, systemPrompt, Date.now(),
    );
  },

  listCustomScenarios(category?: string): CustomScenarioRow[] {
    return category
      ? db.getAllSync<CustomScenarioRow>(
          'SELECT * FROM custom_scenarios WHERE category = ? ORDER BY created_at DESC',
          category,
        )
      : db.getAllSync<CustomScenarioRow>(
          'SELECT * FROM custom_scenarios ORDER BY created_at DESC',
        );
  },

  deleteCustomScenario(id: string) {
    db.runSync('DELETE FROM custom_scenarios WHERE id = ?', id);
  },

  /** How many finished sessions exist per scenario — shows "đã luyện ×N". */
  scenarioCounts(): Record<string, number> {
    const rows = db.getAllSync<{ scenario_id: string; n: number }>(
      'SELECT scenario_id, COUNT(*) AS n FROM sessions GROUP BY scenario_id',
    );
    return Object.fromEntries(rows.map((r) => [r.scenario_id, r.n]));
  },

  /** Wipe all learning data — profile, settings, API key and custom
   *  scenarios survive; sessions/errors/vocab/pitches/coins and every
   *  streak/penalty record do not. */
  resetProgress() {
    db.execSync(
      'DELETE FROM sessions; DELETE FROM errors; DELETE FROM vocab; DELETE FROM pitches;',
    );
    this.setMeta('coins', '0');
    // Streaks, celebrated ranks and charged penalty days must reset too —
    // otherwise the first new streak would silently inherit an old
    // penalty_through watermark or skip an already-celebrated tier.
    for (const k of ['best_streak', 'last_rank_idx', 'penalty_through']) {
      db.runSync('DELETE FROM meta WHERE key = ?', k);
    }
  },

  getMeta(key: string): string | null {
    return db.getFirstSync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?', key,
    )?.value ?? null;
  },

  setMeta(key: string, value: string) {
    db.runSync(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key, value,
    );
  },

  /** Coin balance — virtual currency, earned per session, lost per missed day. */
  getCoins(): number {
    return parseInt(this.getMeta('coins') ?? '0', 10) || 0;
  },

  /** n may be negative (penalties); balance never drops below 0. */
  addCoins(n: number) {
    db.runSync(
      `INSERT INTO meta (key, value) VALUES ('coins', ?)
       ON CONFLICT(key) DO UPDATE SET value = CAST(MAX(0, CAST(value AS INTEGER) + ?) AS TEXT)`,
      String(Math.max(0, n)), n,
    );
  },

  /** Per-day session counts — needed when the daily goal is > 1 session. */
  practiceDayStats(): { day: string; count: number }[] {
    return db.getAllSync<{ day: string; count: number }>(
      "SELECT date(started_at/1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count FROM sessions GROUP BY day",
    );
  },

  listSessions(limit = 50): SessionRow[] {
    return db.getAllSync<SessionRow>(
      'SELECT id, scenario_id, started_at, duration_sec, transcript, analysis_json, audio_uri FROM sessions ORDER BY started_at DESC LIMIT ?',
      limit,
    );
  },
};

// Run once at import time so any screen can query immediately;
// _layout calls it again harmlessly.
initDb();
