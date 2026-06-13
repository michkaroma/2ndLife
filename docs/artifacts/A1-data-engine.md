I have the full spec. Now I'll produce the complete design artifact. This is a pure design task — no files to write. Let me deliver the exhaustive, implementation-ready artifact.

# HabitQuest — Subsystem Design: Data Layer + Server Game Engines

This artifact is implementation-ready. An engineer pastes the code verbatim. Where the brief is silent, defaults are chosen and flagged with **[DEFAULT]**.

Global conventions used throughout:
- **Dates**: all calendar dates are `'YYYY-MM-DD'` strings in the **server's local timezone** (single-user, self-hosted). A helper `localDate()` is the single source of truth. **[DEFAULT]** Local TZ, not UTC, so "today" matches the user's wall clock.
- **Timestamps**: `datetime('now')` (SQLite UTC) for audit columns; never used for streak math.
- **Booleans**: SQLite `INTEGER` 0/1.
- **All money/coins are integers** except `money_per_day` (REAL, per brief).

---

## 1. Final SQLite schema

### 1.1 Tables from the brief (kept verbatim, with added indexes/columns noted)

```sql
-- =========================================================================
--  user_state — single row (id always 1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS user_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  total_xp      INTEGER NOT NULL DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,
  prestige      INTEGER NOT NULL DEFAULT 0,
  freezes       INTEGER NOT NULL DEFAULT 1,
  last_active   TEXT,                                   -- 'YYYY-MM-DD' (local)
  last_freeze_grant TEXT,                               -- ADDED: ISO week '2026-W24' of last weekly freeze grant
  equipped_cosmetic_id INTEGER,                         -- ADDED: currently equipped avatar cosmetic (rewards.id), nullable
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
--  habits
-- =========================================================================
CREATE TABLE IF NOT EXISTS habits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('build','break')),
  category    TEXT,
  difficulty  INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),  -- TIGHTENED check
  icon        TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,               -- ADDED: stable manual ordering on "Aujourd'hui"
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
--  habit_logs
-- =========================================================================
CREATE TABLE IF NOT EXISTS habit_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id  INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,  -- ADDED cascade
  date      TEXT NOT NULL,                              -- 'YYYY-MM-DD' (local)
  status    TEXT NOT NULL CHECK (status IN ('done','skipped','relapsed')),
  note      TEXT,
  xp_awarded   INTEGER NOT NULL DEFAULT 0,              -- ADDED: XP actually granted (for clean rollback on re-log)
  coins_awarded INTEGER NOT NULL DEFAULT 0,             -- ADDED: coins granted (rollback on re-log)
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),   -- ADDED: audit
  UNIQUE(habit_id, date)
);

-- =========================================================================
--  quests
-- =========================================================================
CREATE TABLE IF NOT EXISTS quests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scope        TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
  kind         TEXT NOT NULL DEFAULT 'generic',         -- ADDED: machine key for auto-progress (see §quests.ts)
  description  TEXT NOT NULL,
  target       INTEGER NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  reward_xp    INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  period       TEXT NOT NULL,                           -- 'YYYY-MM-DD' (daily) | 'YYYY-Www' (weekly)
  completed    INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,                                    -- ADDED: when reward was paid (idempotency guard)
  UNIQUE(period, kind)                                  -- ADDED: one quest per kind per period (idempotent generation)
);

-- =========================================================================
--  achievements
-- =========================================================================
CREATE TABLE IF NOT EXISTS achievements (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,                                     -- ADDED: badge icon/emoji
  reward_coins INTEGER NOT NULL DEFAULT 0,              -- ADDED: one-off coin payout on unlock
  unlocked_at TEXT
);

-- =========================================================================
--  rewards (shop: cosmetics + real-life rewards)
-- =========================================================================
CREATE TABLE IF NOT EXISTS rewards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  cost       INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('cosmetic','real')),
  icon       TEXT,                                      -- ADDED: shop display
  description TEXT,                                     -- ADDED: microcopy
  min_level  INTEGER NOT NULL DEFAULT 1,                -- ADDED: gated unlocks that grow with level (§5 anti-stagnation)
  repeatable INTEGER NOT NULL DEFAULT 0,                -- ADDED: real rewards can be claimed repeatedly; cosmetics once
  claimed_at TEXT
);

-- =========================================================================
--  addiction_targets ("boss")
-- =========================================================================
CREATE TABLE IF NOT EXISTS addiction_targets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  clean_since      TEXT,                                -- 'YYYY-MM-DD' (local) start of current clean run
  money_per_day    REAL NOT NULL DEFAULT 0,
  best_streak_days INTEGER NOT NULL DEFAULT 0,
  boss_max_hp      INTEGER NOT NULL DEFAULT 100,        -- ADDED: boss total HP (days to defeat)
  health_track     TEXT NOT NULL DEFAULT 'generic',     -- ADDED: which recovery-timeline preset to show
  icon             TEXT,                                -- ADDED
  archived         INTEGER NOT NULL DEFAULT 0,          -- ADDED: hide defeated/abandoned bosses
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
--  trigger_journal
-- =========================================================================
CREATE TABLE IF NOT EXISTS trigger_journal (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id  INTEGER REFERENCES addiction_targets(id) ON DELETE CASCADE,  -- ADDED cascade
  date       TEXT NOT NULL DEFAULT (datetime('now')),
  trigger    TEXT,
  craving    INTEGER CHECK (craving BETWEEN 1 AND 10),  -- TIGHTENED check
  note       TEXT,
  gave_in    INTEGER NOT NULL DEFAULT 0
);
```

### 1.2 Added tables (with rationale)

```sql
-- =========================================================================
--  applied_migrations — migration bookkeeping (§2)
--  Rationale: idempotent versioned runner needs to know which versions ran.
-- =========================================================================
CREATE TABLE IF NOT EXISTS applied_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
--  settings — generic key/value store
--  Rationale: APP-level toggles, push reminder time, theme, daily-reminder
--  opt-in, last quest-generation marker, VAPID rotation flag, etc. Avoids a
--  schema migration every time a single scalar setting is added.
-- =========================================================================
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,                             -- JSON-encoded scalar/object
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
--  push_subscriptions — Web Push (VAPID) endpoints
--  Rationale: §8/§10 require Web Push. Single user but multiple devices
--  (phone + desktop) → multiple subscriptions. Keyed by endpoint.
-- =========================================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen  TEXT
);

-- =========================================================================
--  owned_cosmetics — cosmetics the user has purchased
--  Rationale: rewards.claimed_at marks a one-shot purchase, but an explicit
--  ownership table cleanly supports equip/unequip and prestige-persistent
--  cosmetics independent of the shop row lifecycle.
-- =========================================================================
CREATE TABLE IF NOT EXISTS owned_cosmetics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id    INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(reward_id)
);

-- =========================================================================
--  level_events — log of level-ups / prestige for celebration animations
--  Rationale: the dashboard must trigger a one-time celebration on level-up.
--  An events log lets the client poll "unseen" events and replay missed ones
--  (e.g. level gained while offline), and gives a permanent progression
--  history. 'seen' flips once the client has played the animation.
-- =========================================================================
CREATE TABLE IF NOT EXISTS level_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK (type IN ('level_up','prestige')),
  from_level  INTEGER,
  to_level    INTEGER,
  prestige    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  seen        INTEGER NOT NULL DEFAULT 0
);
```

### 1.3 Indexes (hot queries)

```sql
-- habit_logs: streak scan per habit walks logs in date order → composite.
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
-- "Aujourd'hui" and quest progress scan all logs for one date.
CREATE INDEX IF NOT EXISTS idx_habit_logs_date       ON habit_logs(date);

-- Active habit list filters on archived, orders by sort_order.
CREATE INDEX IF NOT EXISTS idx_habits_archived       ON habits(archived, sort_order);

-- Quest lookup for "today"/"this week" filters on period (+ scope/kind).
CREATE INDEX IF NOT EXISTS idx_quests_period         ON quests(period);

-- Trigger trends grouped by target & ordered by date.
CREATE INDEX IF NOT EXISTS idx_trigger_target_date   ON trigger_journal(target_id, date);

-- Unseen level events poll.
CREATE INDEX IF NOT EXISTS idx_level_events_seen      ON level_events(seen);
```

### 1.4 Pragmas (applied once on connect, before migrations)

```sql
PRAGMA journal_mode = WAL;     -- concurrent reads during writes
PRAGMA foreign_keys = ON;      -- enforce REFERENCES / cascades
PRAGMA busy_timeout = 5000;    -- avoid SQLITE_BUSY under SW + page concurrency
PRAGMA synchronous = NORMAL;   -- WAL-safe, faster than FULL
```

---

## 2. Versioned migration runner (`src/lib/server/migrations.ts`)

Idempotent, synchronous, runs on boot inside a transaction per migration. Each migration is a `(db) => void`. Adding a migration = append to the array; never edit a shipped one.

```typescript
// src/lib/server/migrations.ts
import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

// --- Ordered, append-only list. Never renumber or edit a shipped migration. ---
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(/* sql */ `
        CREATE TABLE IF NOT EXISTS user_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          total_xp INTEGER NOT NULL DEFAULT 0,
          coins INTEGER NOT NULL DEFAULT 0,
          prestige INTEGER NOT NULL DEFAULT 0,
          freezes INTEGER NOT NULL DEFAULT 1,
          last_active TEXT,
          last_freeze_grant TEXT,
          equipped_cosmetic_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS habits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('build','break')),
          category TEXT,
          difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
          icon TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS habit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
          date TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('done','skipped','relapsed')),
          note TEXT,
          xp_awarded INTEGER NOT NULL DEFAULT 0,
          coins_awarded INTEGER NOT NULL DEFAULT 0,
          logged_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(habit_id, date)
        );

        CREATE TABLE IF NOT EXISTS quests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
          kind TEXT NOT NULL DEFAULT 'generic',
          description TEXT NOT NULL,
          target INTEGER NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          reward_xp INTEGER NOT NULL,
          reward_coins INTEGER NOT NULL DEFAULT 0,
          period TEXT NOT NULL,
          completed INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          UNIQUE(period, kind)
        );

        CREATE TABLE IF NOT EXISTS achievements (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          reward_coins INTEGER NOT NULL DEFAULT 0,
          unlocked_at TEXT
        );

        CREATE TABLE IF NOT EXISTS rewards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          cost INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('cosmetic','real')),
          icon TEXT,
          description TEXT,
          min_level INTEGER NOT NULL DEFAULT 1,
          repeatable INTEGER NOT NULL DEFAULT 0,
          claimed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS addiction_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          clean_since TEXT,
          money_per_day REAL NOT NULL DEFAULT 0,
          best_streak_days INTEGER NOT NULL DEFAULT 0,
          boss_max_hp INTEGER NOT NULL DEFAULT 100,
          health_track TEXT NOT NULL DEFAULT 'generic',
          icon TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS trigger_journal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_id INTEGER REFERENCES addiction_targets(id) ON DELETE CASCADE,
          date TEXT NOT NULL DEFAULT (datetime('now')),
          trigger TEXT,
          craving INTEGER CHECK (craving BETWEEN 1 AND 10),
          note TEXT,
          gave_in INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen TEXT
        );

        CREATE TABLE IF NOT EXISTS owned_cosmetics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(reward_id)
        );

        CREATE TABLE IF NOT EXISTS level_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN ('level_up','prestige')),
          from_level INTEGER,
          to_level INTEGER,
          prestige INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          seen INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
        CREATE INDEX IF NOT EXISTS idx_habit_logs_date       ON habit_logs(date);
        CREATE INDEX IF NOT EXISTS idx_habits_archived       ON habits(archived, sort_order);
        CREATE INDEX IF NOT EXISTS idx_quests_period         ON quests(period);
        CREATE INDEX IF NOT EXISTS idx_trigger_target_date   ON trigger_journal(target_id, date);
        CREATE INDEX IF NOT EXISTS idx_level_events_seen      ON level_events(seen);

        -- Ensure the singleton user_state row exists.
        INSERT OR IGNORE INTO user_state (id) VALUES (1);
      `);
    }
  }
  // Future migrations: { version: 2, name: '...', up: (db) => db.exec('ALTER TABLE ...') }
];

/**
 * Apply all migrations whose version is greater than the recorded maximum.
 * Idempotent: safe to call on every boot. Each migration runs in its own
 * transaction so a failure leaves earlier migrations committed and the failing
 * one fully rolled back.
 */
export function runMigrations(db: Database): void {
  // Bootstrap the bookkeeping table (cannot live in a versioned migration).
  db.exec(/* sql */ `
    CREATE TABLE IF NOT EXISTS applied_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const currentRow = db
    .prepare('SELECT COALESCE(MAX(version), 0) AS v FROM applied_migrations')
    .get() as { v: number };
  const current = currentRow.v;

  const record = db.prepare(
    'INSERT INTO applied_migrations (version, name) VALUES (?, ?)'
  );

  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    const tx = db.transaction(() => {
      m.up(db);
      record.run(m.version, m.name);
    });
    tx();
    // eslint-disable-next-line no-console
    console.log(`[migrations] applied v${m.version} (${m.name})`);
  }
}
```

---

## 3. `src/lib/types.ts` (paste verbatim)

```typescript
// src/lib/types.ts
// Shared domain types. Row types mirror SQLite columns 1:1 (numbers for 0/1
// booleans); view-models are the shapes the UI consumes.

// ---------- Enums / string unions ----------
export type HabitType = 'build' | 'break';
export type HabitStatus = 'done' | 'skipped' | 'relapsed';
export type QuestScope = 'daily' | 'weekly';
export type RewardKind = 'cosmetic' | 'real';
export type LevelEventType = 'level_up' | 'prestige';

/** Difficulty is an XP multiplier 1..3 (brief §4). */
export type Difficulty = 1 | 2 | 3;

/** Machine keys driving automatic quest progress (see quests engine). */
export type QuestKind =
  | 'generic'
  | 'log_builds'      // valider N habitudes "build" aujourd'hui/cette semaine
  | 'log_any'         // valider N habitudes (tous types)
  | 'clean_days'      // N jours clean cette semaine
  | 'no_relapse'      // aucune rechute aujourd'hui
  | 'sos_used'        // utiliser le bouton SOS (résister à une envie)
  | 'journal_entry';  // noter un déclencheur

// ---------- Raw DB row types ----------
export interface UserStateRow {
  id: 1;
  total_xp: number;
  coins: number;
  prestige: number;
  freezes: number;
  last_active: string | null;
  last_freeze_grant: string | null;
  equipped_cosmetic_id: number | null;
  created_at: string;
}

export interface Habit {
  id: number;
  name: string;
  type: HabitType;
  category: string | null;
  difficulty: Difficulty;
  icon: string | null;
  archived: number; // 0 | 1
  sort_order: number;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  date: string; // 'YYYY-MM-DD'
  status: HabitStatus;
  note: string | null;
  xp_awarded: number;
  coins_awarded: number;
  logged_at: string;
}

export interface Quest {
  id: number;
  scope: QuestScope;
  kind: QuestKind;
  description: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  period: string; // 'YYYY-MM-DD' | 'YYYY-Www'
  completed: number; // 0 | 1
  completed_at: string | null;
}

export interface Achievement {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  reward_coins: number;
  unlocked_at: string | null;
}

export interface Reward {
  id: number;
  name: string;
  cost: number;
  kind: RewardKind;
  icon: string | null;
  description: string | null;
  min_level: number;
  repeatable: number; // 0 | 1
  claimed_at: string | null;
}

export interface AddictionTarget {
  id: number;
  name: string;
  clean_since: string | null; // 'YYYY-MM-DD'
  money_per_day: number;
  best_streak_days: number;
  boss_max_hp: number;
  health_track: string;
  icon: string | null;
  archived: number; // 0 | 1
  created_at: string;
}

export interface TriggerEntry {
  id: number;
  target_id: number | null;
  date: string; // datetime('now')
  trigger: string | null;
  craving: number | null; // 1..10
  note: string | null;
  gave_in: number; // 0 | 1
}

export interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen: string | null;
}

export interface OwnedCosmetic {
  id: number;
  reward_id: number;
  acquired_at: string;
}

export interface LevelEvent {
  id: number;
  type: LevelEventType;
  from_level: number | null;
  to_level: number | null;
  prestige: number;
  created_at: string;
  seen: number; // 0 | 1
}

// ---------- Input/DTO types ----------
export interface NewHabit {
  name: string;
  type: HabitType;
  category?: string | null;
  difficulty?: Difficulty;
  icon?: string | null;
}
export type HabitPatch = Partial<NewHabit> & { sort_order?: number };

export interface NewReward {
  name: string;
  cost: number;
  kind: RewardKind;
  icon?: string | null;
  description?: string | null;
  min_level?: number;
  repeatable?: boolean;
}

export interface NewAddictionTarget {
  name: string;
  clean_since?: string | null;
  money_per_day?: number;
  boss_max_hp?: number;
  health_track?: string;
  icon?: string | null;
}

export interface NewTriggerEntry {
  target_id: number | null;
  trigger?: string | null;
  craving?: number | null;
  note?: string | null;
  gave_in?: boolean;
}

export interface WebPushKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ---------- Computed view-models ----------
export interface LevelInfo {
  level: number;
  intoLevel: number;   // XP accumulated inside current level
  needed: number;      // XP needed to finish current level
  totalXp: number;     // raw total
  progressPct: number; // 0..100, intoLevel / needed
  prestige: number;
  canPrestige: boolean; // level >= PRESTIGE_LEVEL
}

export interface StreakInfo {
  current: number; // consecutive 'done' days anchored to today/yesterday
  best: number;    // all-time longest 'done' run
}

export interface HabitWithStatus {
  habit: Habit;
  todayStatus: HabitStatus | null; // null = not logged today
  streak: number;                  // current streak
  bestStreak: number;
}

export interface CleanStreakInfo {
  currentDays: number; // days since clean_since (0 if null/today)
  bestDays: number;
  moneySaved: number;  // currentDays * money_per_day, rounded to 2 dp
}

export interface HealthMilestone {
  afterDays: number;
  label: string;       // FRENCH, encouraging, generic
  reached: boolean;
}

export interface BossView {
  target: AddictionTarget;
  clean: CleanStreakInfo;
  bossHp: number;        // remaining HP = max(0, boss_max_hp - currentDays)
  bossMaxHp: number;
  bossHpPct: number;     // 0..100 remaining
  defeated: boolean;     // currentDays >= boss_max_hp
  health: HealthMilestone[];
  nextMilestone: HealthMilestone | null;
}

export interface TriggerTrends {
  totalEntries: number;
  gaveInCount: number;
  resistedCount: number;
  resistRate: number;          // 0..1 resisted / total
  avgCraving: number;          // mean craving across entries
  topTriggers: { trigger: string; count: number }[]; // descending, max 5
}

export interface QuestView extends Quest {
  progressPct: number; // 0..100
}

export interface DashboardData {
  user: UserStateRow;
  level: LevelInfo;
  habits: HabitWithStatus[];
  globalStreak: StreakInfo;     // longest current streak across habits
  dailyQuests: QuestView[];
  weeklyQuests: QuestView[];
  bosses: BossView[];
  recentAchievements: Achievement[]; // last unlocked, max 5
  unseenLevelEvents: LevelEvent[];   // drive celebration animations
  equippedCosmetic: Reward | null;
}

// ---------- Engine result types ----------
export interface XpGain {
  baseXp: number;
  streakBonusPct: number; // 0..0.5
  xpAwarded: number;      // after bonus
  coinsAwarded: number;
}

export interface LogResult {
  log: HabitLog;
  gain: XpGain;
  levelBefore: number;
  levelAfter: number;
  leveledUp: boolean;
  newAchievements: Achievement[];
  questsAdvanced: Quest[];
}

export interface PrestigeResult {
  ok: boolean;
  newPrestige: number;
  message: string; // FRENCH
}
```

---

## 4. `src/lib/server/db.ts` — public API (exact signatures)

The module owns one shared connection. Helpers (`localDate`, `isoWeek`) are exported for engines/routes. All write paths that touch XP/coins/level go through engine functions in §5/progression, but the raw mutators below are the primitives those engines call. Everything is synchronous (better-sqlite3).

```typescript
// src/lib/server/db.ts
import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import type {
  UserStateRow, Habit, HabitLog, HabitStatus, Quest, QuestKind, QuestScope,
  Achievement, Reward, RewardKind, AddictionTarget, TriggerEntry,
  PushSubscriptionRow, OwnedCosmetic, LevelEvent, LevelEventType,
  NewHabit, HabitPatch, NewReward, NewAddictionTarget, NewTriggerEntry,
  WebPushKeys, Difficulty
} from '$lib/types';

// =========================================================================
//  Connection / init
// =========================================================================

/** Resolve the singleton DB connection, running pragmas + migrations once. */
export function getDb(): Database.Database;

/** Path resolution: env DB_PATH || './data/habitquest.db'. Creates ./data. */
export function dbPath(): string;

/** Run on server boot (hooks.server.ts). Opens conn, pragmas, migrations,
 *  seeds idempotent content (achievements catalog, default settings). */
export function initDb(): void;

/** Close the connection (graceful shutdown / tests). */
export function closeDb(): void;

// =========================================================================
//  Date / period helpers (single source of truth for "today")
// =========================================================================

/** Local 'YYYY-MM-DD' for a Date (default now). */
export function localDate(d?: Date): string;

/** Yesterday's local date relative to `date` ('YYYY-MM-DD' in, out). */
export function previousDate(date: string): string;

/** ISO week label 'YYYY-Www' for a local date (default today). */
export function isoWeek(date?: string): string;

// =========================================================================
//  Settings (key/value, JSON-encoded)
// =========================================================================
export function getSetting<T = unknown>(key: string): T | null;
export function setSetting(key: string, value: unknown): void;
export function getAllSettings(): Record<string, unknown>;

// =========================================================================
//  User state
// =========================================================================
export function getUserState(): UserStateRow; // always returns row id=1

/** Add (or subtract) XP. Returns the new total_xp. Pure mutation — caller
 *  is responsible for level-event logging via progression engine. */
export function addXp(delta: number): number;

export function addCoins(delta: number): number; // returns new coins

/** Atomically spend coins if affordable. Returns true if spent. */
export function spendCoins(amount: number): boolean;

export function setFreezes(count: number): void;
export function consumeFreeze(): boolean;        // -1 if >0, returns success
export function grantWeeklyFreezeIfDue(week: string): boolean; // idempotent per ISO week

export function setLastActive(date: string): void;
export function setEquippedCosmetic(rewardId: number | null): void;

/** Prestige: requires level >= PRESTIGE_LEVEL. Resets total_xp to 0,
 *  prestige+1, logs a 'prestige' level_event. Returns new prestige or null
 *  if not eligible. Coins/cosmetics/achievements are preserved. */
export function prestige(): number | null;

// =========================================================================
//  Level events (celebration queue)
// =========================================================================
export function logLevelEvent(
  type: LevelEventType, fromLevel: number, toLevel: number, prestige: number
): void;
export function getUnseenLevelEvents(): LevelEvent[];
export function markLevelEventsSeen(ids: number[]): void;

// =========================================================================
//  Habits — CRUD + lists
// =========================================================================
export function createHabit(input: NewHabit): Habit;
export function getHabit(id: number): Habit | null;
export function updateHabit(id: number, patch: HabitPatch): Habit | null;
export function archiveHabit(id: number, archived?: boolean): void; // soft archive
export function deleteHabit(id: number): void; // hard delete (cascades logs)
export function listHabits(opts?: { archived?: boolean }): Habit[]; // default active only
export function reorderHabits(orderedIds: number[]): void;

// =========================================================================
//  Habit logs
// =========================================================================

/** UPSERT a log for (habitId, date). Idempotent on the UNIQUE(habit_id,date).
 *  Stores xp/coins actually awarded so a status change can roll them back.
 *  NOTE: this writes ONLY the log row + awarded columns; XP/coins/level/quests/
 *  achievements are applied by the progression engine (§5) which calls this. */
export function upsertHabitLog(args: {
  habitId: number; date: string; status: HabitStatus; note?: string | null;
  xpAwarded: number; coinsAwarded: number;
}): HabitLog;

export function getHabitLog(habitId: number, date: string): HabitLog | null;

/** All logs for a habit ordered by date ASC (used by streak computation). */
export function getHabitLogDates(habitId: number, status?: HabitStatus): string[];

/** All logs on one date joined to nothing (used by quest auto-progress). */
export function getLogsForDate(date: string): HabitLog[];

/** Count distinct habits with a given status on a date. */
export function countLogsForDate(date: string, status: HabitStatus): number;

// =========================================================================
//  Quests — list / upsert / progress / complete
// =========================================================================

/** Get-or-create a quest for (period, kind). Idempotent (UNIQUE(period,kind)). */
export function upsertQuest(args: {
  scope: QuestScope; kind: QuestKind; description: string; target: number;
  rewardXp: number; rewardCoins: number; period: string;
}): Quest;

export function listQuests(period: string, scope?: QuestScope): Quest[];
export function getQuest(id: number): Quest | null;

/** Increment progress by `by` (clamped to target). Returns updated quest.
 *  Does NOT auto-complete; caller checks/marks completion. */
export function incrementQuestProgress(id: number, by: number): Quest | null;

export function setQuestProgress(id: number, value: number): Quest | null;

/** Mark complete + stamp completed_at. Idempotent: no-op if already completed.
 *  Returns true only on the transition (so reward is paid exactly once). */
export function completeQuest(id: number): boolean;

/** Delete quests for periods older than the given cutoff (housekeeping). */
export function pruneOldQuests(beforePeriod: string): number;

// =========================================================================
//  Achievements
// =========================================================================
export function listAchievements(): Achievement[];
export function getAchievement(key: string): Achievement | null;

/** Insert catalog rows if missing (locked). Idempotent seed. */
export function seedAchievements(rows: Array<{
  key: string; name: string; description?: string; icon?: string; reward_coins?: number;
}>): void;

/** Stamp unlocked_at if currently null. Returns the row IFF it transitioned
 *  from locked → unlocked (so the celebration + coin payout fire once). */
export function unlockAchievement(key: string): Achievement | null;

// =========================================================================
//  Rewards (shop)
// =========================================================================
export function createReward(input: NewReward): Reward;
export function getReward(id: number): Reward | null;
export function updateReward(id: number, patch: Partial<NewReward>): Reward | null;
export function deleteReward(id: number): void;
export function listRewards(opts?: { kind?: RewardKind; maxLevel?: number }): Reward[];

/** Claim a reward: checks affordability + min_level, spends coins, stamps
 *  claimed_at (for non-repeatable), records ownership for cosmetics. Returns
 *  the updated reward or null if unaffordable / level-locked / already claimed. */
export function claimReward(id: number, currentLevel: number): Reward | null;

export function listOwnedCosmetics(): OwnedCosmetic[];

// =========================================================================
//  Addiction targets ("boss")
// =========================================================================
export function createAddictionTarget(input: NewAddictionTarget): AddictionTarget;
export function getAddictionTarget(id: number): AddictionTarget | null;
export function updateAddictionTarget(
  id: number, patch: Partial<NewAddictionTarget>
): AddictionTarget | null;
export function archiveAddictionTarget(id: number, archived?: boolean): void;
export function deleteAddictionTarget(id: number): void;
export function listAddictionTargets(opts?: { archived?: boolean }): AddictionTarget[];

/** Start/reset a clean run. If clearing an existing run, roll the prior run's
 *  length into best_streak_days first. Pass null to clear. */
export function setCleanSince(id: number, date: string | null): AddictionTarget | null;

/** Relapse (benevolent): updates best_streak_days from current run, resets
 *  clean_since to `date` (the new clean start = relapse day or next day per
 *  policy). Returns updated target. Logs nothing punitive. */
export function relapse(id: number, date: string): AddictionTarget | null;

// =========================================================================
//  Trigger journal
// =========================================================================
export function addTriggerEntry(input: NewTriggerEntry): TriggerEntry;
export function listTriggerEntries(opts?: {
  targetId?: number; limit?: number;
}): TriggerEntry[];
export function deleteTriggerEntry(id: number): void;

// =========================================================================
//  Push subscriptions (Web Push / VAPID)
// =========================================================================

/** Upsert by endpoint (UNIQUE). Refreshes keys + last_seen. */
export function savePushSubscription(sub: WebPushKeys, userAgent?: string): PushSubscriptionRow;
export function listPushSubscriptions(): PushSubscriptionRow[];
export function deletePushSubscription(endpoint: string): void; // on 404/410 from push service
export function touchPushSubscription(endpoint: string): void;  // update last_seen
```

**Reference implementations for the load-bearing/non-obvious functions** (engineer pastes; trivial CRUD omitted for brevity but follows the same `db.prepare(...).run/get/all` pattern):

```typescript
// ---- connection singleton ----
let _db: Database.Database | null = null;

export function dbPath(): string {
  const p = process.env.DB_PATH ?? './data/habitquest.db';
  // ensure ./data exists (sync)
  const { dirname } = require('node:path');
  const { mkdirSync } = require('node:fs');
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000');
  _db.pragma('synchronous = NORMAL');
  runMigrations(_db);
  return _db;
}

export function initDb(): void {
  getDb(); // runs pragmas + migrations (migration v1 seeds user_state row)
  // seed default settings (idempotent)
  if (getSetting('reminder_hour') === null) setSetting('reminder_hour', 20);
  // achievements catalog seeded by achievements engine on boot.
}

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return localDate(dt);
}

export function isoWeek(date: string = localDate()): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  // ISO: Thursday-anchored week number
  const dayNum = (dt.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  dt.setUTCDate(dt.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((dt.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    );
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ---- settings ----
export function getSetting<T = unknown>(key: string): T | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}
export function setSetting(key: string, value: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, JSON.stringify(value));
}

// ---- user_state ----
export function getUserState(): UserStateRow {
  return getDb().prepare('SELECT * FROM user_state WHERE id = 1').get() as UserStateRow;
}
export function addXp(delta: number): number {
  const db = getDb();
  db.prepare('UPDATE user_state SET total_xp = MAX(0, total_xp + ?) WHERE id = 1').run(delta);
  return getUserState().total_xp;
}
export function addCoins(delta: number): number {
  getDb().prepare('UPDATE user_state SET coins = MAX(0, coins + ?) WHERE id = 1').run(delta);
  return getUserState().coins;
}
export function spendCoins(amount: number): boolean {
  const info = getDb()
    .prepare('UPDATE user_state SET coins = coins - ? WHERE id = 1 AND coins >= ?')
    .run(amount, amount);
  return info.changes === 1;
}
export function consumeFreeze(): boolean {
  const info = getDb()
    .prepare('UPDATE user_state SET freezes = freezes - 1 WHERE id = 1 AND freezes > 0')
    .run();
  return info.changes === 1;
}
export function grantWeeklyFreezeIfDue(week: string): boolean {
  const info = getDb()
    .prepare(
      `UPDATE user_state
         SET freezes = freezes + 1, last_freeze_grant = ?
       WHERE id = 1 AND (last_freeze_grant IS NULL OR last_freeze_grant <> ?)`
    )
    .run(week, week);
  return info.changes === 1;
}

// ---- habit log upsert (rollback-aware) ----
export function upsertHabitLog(args: {
  habitId: number; date: string; status: HabitStatus;
  note?: string | null; xpAwarded: number; coinsAwarded: number;
}): HabitLog {
  const db = getDb();
  db.prepare(
    `INSERT INTO habit_logs (habit_id, date, status, note, xp_awarded, coins_awarded)
     VALUES (@habitId, @date, @status, @note, @xpAwarded, @coinsAwarded)
     ON CONFLICT(habit_id, date) DO UPDATE SET
       status = excluded.status,
       note = excluded.note,
       xp_awarded = excluded.xp_awarded,
       coins_awarded = excluded.coins_awarded,
       logged_at = datetime('now')`
  ).run({ ...args, note: args.note ?? null });
  return getHabitLog(args.habitId, args.date)!;
}
export function getHabitLog(habitId: number, date: string): HabitLog | null {
  return (getDb()
    .prepare('SELECT * FROM habit_logs WHERE habit_id = ? AND date = ?')
    .get(habitId, date) as HabitLog) ?? null;
}
export function getHabitLogDates(habitId: number, status?: HabitStatus): string[] {
  const sql = status
    ? 'SELECT date FROM habit_logs WHERE habit_id = ? AND status = ? ORDER BY date ASC'
    : 'SELECT date FROM habit_logs WHERE habit_id = ? ORDER BY date ASC';
  const rows = status
    ? getDb().prepare(sql).all(habitId, status)
    : getDb().prepare(sql).all(habitId);
  return (rows as { date: string }[]).map((r) => r.date);
}

// ---- quests ----
export function upsertQuest(args: {
  scope: QuestScope; kind: QuestKind; description: string; target: number;
  rewardXp: number; rewardCoins: number; period: string;
}): Quest {
  const db = getDb();
  db.prepare(
    `INSERT INTO quests (scope, kind, description, target, reward_xp, reward_coins, period)
     VALUES (@scope, @kind, @description, @target, @rewardXp, @rewardCoins, @period)
     ON CONFLICT(period, kind) DO NOTHING`
  ).run(args);
  return db
    .prepare('SELECT * FROM quests WHERE period = ? AND kind = ?')
    .get(args.period, args.kind) as Quest;
}
export function incrementQuestProgress(id: number, by: number): Quest | null {
  const db = getDb();
  db.prepare(
    `UPDATE quests SET progress = MIN(target, progress + ?)
     WHERE id = ? AND completed = 0`
  ).run(by, id);
  return getQuest(id);
}
export function completeQuest(id: number): boolean {
  const info = getDb()
    .prepare(
      `UPDATE quests SET completed = 1, completed_at = datetime('now')
       WHERE id = ? AND completed = 0`
    )
    .run(id);
  return info.changes === 1;
}
export function getQuest(id: number): Quest | null {
  return (getDb().prepare('SELECT * FROM quests WHERE id = ?').get(id) as Quest) ?? null;
}

// ---- achievements ----
export function unlockAchievement(key: string): Achievement | null {
  const info = getDb()
    .prepare(`UPDATE achievements SET unlocked_at = datetime('now')
              WHERE key = ? AND unlocked_at IS NULL`)
    .run(key);
  return info.changes === 1 ? getAchievement(key) : null;
}
export function getAchievement(key: string): Achievement | null {
  return (getDb().prepare('SELECT * FROM achievements WHERE key = ?').get(key) as Achievement) ?? null;
}

// ---- rewards ----
export function claimReward(id: number, currentLevel: number): Reward | null {
  const db = getDb();
  const tx = db.transaction((): Reward | null => {
    const r = getReward(id);
    if (!r) return null;
    if (currentLevel < r.min_level) return null;
    if (!r.repeatable && r.claimed_at) return null;
    if (!spendCoins(r.cost)) return null;
    if (!r.repeatable) {
      db.prepare(`UPDATE rewards SET claimed_at = datetime('now') WHERE id = ?`).run(id);
    }
    if (r.kind === 'cosmetic') {
      db.prepare('INSERT OR IGNORE INTO owned_cosmetics (reward_id) VALUES (?)').run(id);
    }
    return getReward(id);
  });
  return tx();
}
export function getReward(id: number): Reward | null {
  return (getDb().prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Reward) ?? null;
}

// ---- addiction targets ----
export function relapse(id: number, date: string): AddictionTarget | null {
  const db = getDb();
  const tx = db.transaction((): AddictionTarget | null => {
    const t = getAddictionTarget(id);
    if (!t) return null;
    if (t.clean_since) {
      const run = daysBetween(t.clean_since, date); // helper below
      if (run > t.best_streak_days) {
        db.prepare('UPDATE addiction_targets SET best_streak_days = ? WHERE id = ?').run(run, id);
      }
    }
    // Benevolent: new clean run starts the same day (a fresh start, not a void).
    db.prepare('UPDATE addiction_targets SET clean_since = ? WHERE id = ?').run(date, id);
    return getAddictionTarget(id);
  });
  return tx();
}
export function getAddictionTarget(id: number): AddictionTarget | null {
  return (getDb().prepare('SELECT * FROM addiction_targets WHERE id = ?').get(id) as AddictionTarget) ?? null;
}

// ---- push subscriptions ----
export function savePushSubscription(sub: WebPushKeys, userAgent?: string): PushSubscriptionRow {
  const db = getDb();
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent, last_seen)
     VALUES (@endpoint, @p256dh, @auth, @ua, datetime('now'))
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh, auth = excluded.auth,
       user_agent = excluded.user_agent, last_seen = datetime('now')`
  ).run({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, ua: userAgent ?? null });
  return db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(sub.endpoint) as PushSubscriptionRow;
}
export function listPushSubscriptions(): PushSubscriptionRow[] {
  return getDb().prepare('SELECT * FROM push_subscriptions').all() as PushSubscriptionRow[];
}
export function deletePushSubscription(endpoint: string): void {
  getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}
```

---

## 5. Streak / best-streak / clean-streak computation (`src/lib/server/streaks.ts`)

Anchoring rule (per brief): the current streak counts consecutive `'done'` days ending at **today**; if today is not yet logged, it falls back to **yesterday** as the anchor, so an un-logged today does not break the streak. A gap (any missing calendar day in the run) ends it. `'skipped'`/`'relapsed'` rows do **not** count as `'done'` and therefore break the run unless covered by a freeze (freeze application is handled by the progression engine, not here — this module is pure date math over the recorded `'done'` set).

```typescript
// src/lib/server/streaks.ts
import { getHabitLogDates, previousDate, localDate } from './db';
import type { StreakInfo, CleanStreakInfo, AddictionTarget } from '$lib/types';

/** Inclusive day count between two 'YYYY-MM-DD' dates (b - a), assuming b >= a. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

/** Step one calendar day forward from a 'YYYY-MM-DD' date. */
function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return localDate(dt);
}

/**
 * Current streak = consecutive 'done' days ending at the anchor.
 * Anchor = today if today is 'done', else yesterday (so an un-logged today
 * does not break the streak). Walk backwards while each prior day is also
 * present in the 'done' set.
 *
 * `doneDates` must be the sorted-ASC list of 'done' dates for one habit.
 */
export function currentStreakFromDates(doneDates: string[], today: string = localDate()): number {
  if (doneDates.length === 0) return 0;
  const set = new Set(doneDates);

  // Choose the anchor.
  let anchor: string;
  if (set.has(today)) {
    anchor = today;
  } else {
    const yesterday = previousDate(today);
    if (set.has(yesterday)) anchor = yesterday;
    else return 0; // neither today nor yesterday is done → streak is 0
  }

  // Walk backwards from the anchor over contiguous 'done' days.
  let count = 0;
  let cursor = anchor;
  while (set.has(cursor)) {
    count++;
    cursor = previousDate(cursor);
  }
  return count;
}

/**
 * Best (longest-ever) streak = longest run of consecutive 'done' calendar days
 * anywhere in history. Single pass over the sorted ascending date list.
 */
export function bestStreakFromDates(doneDates: string[]): number {
  if (doneDates.length === 0) return 0;
  // Defensive: ensure ascending + unique.
  const dates = [...new Set(doneDates)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    if (daysBetween(dates[i - 1], dates[i]) === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  return best;
}

/** Convenience: compute both from the DB for one habit. */
export function computeHabitStreaks(habitId: number, today: string = localDate()): StreakInfo {
  const doneDates = getHabitLogDates(habitId, 'done'); // ASC
  return {
    current: currentStreakFromDates(doneDates, today),
    best: bestStreakFromDates(doneDates)
  };
}

/**
 * Clean streak for an addiction target.
 * currentDays = whole days elapsed since clean_since (inclusive of the start
 * day → "depuis le 1er = 1 jour clean aujourd'hui"). 0 if clean_since is null.
 * bestDays = max(stored best_streak_days, currentDays) so an ongoing record run
 * is always reflected. moneySaved = currentDays * money_per_day (2 dp).
 */
export function computeCleanStreak(
  t: AddictionTarget,
  today: string = localDate()
): CleanStreakInfo {
  let currentDays = 0;
  if (t.clean_since && t.clean_since <= today) {
    currentDays = daysBetween(t.clean_since, today) + 1; // inclusive
  }
  const bestDays = Math.max(t.best_streak_days, currentDays);
  const moneySaved = Math.round(currentDays * t.money_per_day * 100) / 100;
  return { currentDays, bestDays, moneySaved };
}
```

**Edge-case notes baked into the above (state explicitly for the engineer):**
- `currentStreakFromDates` treats `'skipped'`/`'relapsed'` as absent because it is fed only `'done'` dates from `getHabitLogDates(habitId, 'done')`. Freeze-protected days: when the progression engine consumes a freeze for a missed day, it should write a synthetic `'done'` log (or, **[DEFAULT]** simpler: a freeze inserts a `'done'` log with `xp_awarded=0, coins_awarded=0, note='gel de série'` for the missed date) so the pure date math here remains correct. This keeps streak logic in one place.
- Clean streak is **inclusive** (day 0 = clean_since counts as "jour 1") to match the encouraging tone ("1 jour clean" on the first day).
- `bestDays` never regresses and absorbs an in-progress record.

---

## Engine integration contract (how §4 + §5 compose — for the implementer)

The `logHabit` orchestration the routes call lives in `src/lib/server/progression.ts` and wires the pieces. Exact signature and flow (so the data layer's rollback columns make sense):

```typescript
// src/lib/server/progression.ts  (signature + flow, for reference)
export function logHabit(
  habitId: number,
  date: string,
  status: HabitStatus,
  note?: string | null
): LogResult;
```

Flow:
1. Load habit + existing log for (habitId,date). If a prior log exists, **roll back** its `xp_awarded`/`coins_awarded` via `addXp(-prev)` / `addCoins(-prev)` so re-logging never double-counts (this is why those columns exist).
2. Compute current streak via `computeHabitStreaks(habitId, date)` **excluding today** to get the pre-action streak, then base XP:
   - `build` + `done`: base `XP_PER_HABIT` (×`difficulty`). **[DEFAULT]** difficulty multiplies base XP: `XP_PER_HABIT * difficulty`.
   - `break` + `done`: base `XP_BREAK_HABIT_DAY` (×`difficulty`).
   - `skipped`/`relapsed`: 0 XP, 0 coins, no streak bonus.
3. `xpAwarded = xpWithStreak(base, streakDays)` from `progression.ts` config. **[DEFAULT]** coins: `coinsAwarded = Math.round(xpAwarded / 10)`.
4. `upsertHabitLog({...,xpAwarded,coinsAwarded})`, then `addXp(+xpAwarded)`, `addCoins(+coinsAwarded)`, `setLastActive(date)`.
5. Recompute `levelFromXp` before/after; if level increased, `logLevelEvent('level_up', before, after, prestige)`.
6. Drive quest auto-progress (`incrementQuestProgress` by kind) and achievement checks (`unlockAchievement`), paying their rewards exactly once via the `completeQuest`/`unlockAchievement` transition guards.
7. Wrap steps 1–6 in a single `db.transaction(...)` for atomicity.

All money/XP mutations are clamped at 0 (`MAX(0, ...)`) so rollbacks can't drive negatives.

---

## Summary of decisions where the brief was silent (defaults)

- **Timezone**: server-local for all calendar dates; one `localDate()` helper.
- **Difficulty** multiplies base XP (`base * difficulty`), range tightened to 1..3 via CHECK.
- **Coins** = `round(xpAwarded / 10)` per `done` action.
- **Freeze** = synthetic `done` log (xp/coins 0) on the missed day, keeping streak math pure.
- **Relapse** is benevolent: rolls best into `best_streak_days`, restarts `clean_since` same day, no penalty rows.
- **Clean streak** inclusive (start day = day 1).
- **Re-logging** a habit rolls back previously awarded XP/coins via `xp_awarded`/`coins_awarded` columns (no double-count).
- **Added tables**: `applied_migrations`, `settings`, `push_subscriptions`, `owned_cosmetics`, `level_events`.
- **Added columns**: `user_state.last_freeze_grant`, `user_state.equipped_cosmetic_id`; `habits.sort_order`; `habit_logs.xp_awarded/coins_awarded/logged_at`; `quests.kind/completed_at` + `UNIQUE(period,kind)`; `achievements.icon/reward_coins`; `rewards.icon/description/min_level/repeatable`; `addiction_targets.boss_max_hp/health_track/icon/archived`.
- **Quest idempotency** via `UNIQUE(period, kind)`; reward paid once via `completeQuest`/`unlockAchievement` transition guards.

Relevant target file paths (to be created by the implementer): `C:\Users\micha\OneDrive - Bilans et budgets\Documents\GitHub\2ndLife\src\lib\types.ts`, `...\src\lib\server\db.ts`, `...\src\lib\server\migrations.ts`, `...\src\lib\server\streaks.ts`, `...\src\lib\server\progression.ts`.