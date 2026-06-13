// src/lib/server/migrations.ts
import type { Database } from 'better-sqlite3';

export interface Migration {
	version: number;
	name: string;
	up: (db: Database) => void;
}

// Append-only. Never edit or renumber a shipped migration.
export const MIGRATIONS: Migration[] = [
	{
		version: 1,
		name: 'initial_schema',
		up: (db) => {
			db.exec(/* sql */ `
        -- ===== user_state: single row id=1 =====
        CREATE TABLE IF NOT EXISTS user_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          total_xp INTEGER NOT NULL DEFAULT 0,
          coins INTEGER NOT NULL DEFAULT 0,
          prestige INTEGER NOT NULL DEFAULT 0,
          freezes INTEGER NOT NULL DEFAULT 1,
          last_active TEXT,                          -- 'YYYY-MM-DD' (server-local)
          last_freeze_grant TEXT,                    -- ISO week '2026-W24' of last weekly grant
          equipped_cosmetic_id INTEGER,              -- rewards.id, nullable
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ===== habits =====
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

        -- ===== habit_logs =====
        CREATE TABLE IF NOT EXISTS habit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
          date TEXT NOT NULL,                        -- 'YYYY-MM-DD'
          status TEXT NOT NULL CHECK (status IN ('done','skipped','relapsed')),
          note TEXT,
          xp_awarded INTEGER NOT NULL DEFAULT 0,     -- for rollback on re-log
          coins_awarded INTEGER NOT NULL DEFAULT 0,
          logged_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(habit_id, date)
        );

        -- ===== quests (kind + key, UNIQUE(period,key)) =====
        CREATE TABLE IF NOT EXISTS quests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
          kind TEXT NOT NULL DEFAULT 'generic',      -- machine key for auto-progress
          key TEXT NOT NULL DEFAULT 'generic',       -- template id for idempotent gen
          description TEXT NOT NULL,
          target INTEGER NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          reward_xp INTEGER NOT NULL,
          reward_coins INTEGER NOT NULL DEFAULT 0,
          period TEXT NOT NULL,                      -- 'YYYY-MM-DD' | 'YYYY-Www'
          completed INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          UNIQUE(period, key)
        );

        -- ===== achievements =====
        CREATE TABLE IF NOT EXISTS achievements (
          key TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          reward_coins INTEGER NOT NULL DEFAULT 0,
          unlocked_at TEXT
        );

        -- ===== rewards (shop) =====
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

        -- ===== addiction_targets (target_streak_days IS boss HP) =====
        CREATE TABLE IF NOT EXISTS addiction_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          clean_since TEXT,                          -- 'YYYY-MM-DD'
          money_per_day REAL NOT NULL DEFAULT 0,
          best_streak_days INTEGER NOT NULL DEFAULT 0,
          target_streak_days INTEGER NOT NULL DEFAULT 90,  -- boss HP (7..365 enforced in code)
          kind TEXT,                                 -- 'tabac'|'alcool'|'sucre'|'ecrans'|'autre'
          icon TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          defeated_at TEXT,                          -- trophy timestamp
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ===== trigger_journal =====
        CREATE TABLE IF NOT EXISTS trigger_journal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_id INTEGER REFERENCES addiction_targets(id) ON DELETE CASCADE,
          date TEXT NOT NULL DEFAULT (datetime('now')),
          trigger TEXT,
          craving INTEGER CHECK (craving BETWEEN 1 AND 10),
          note TEXT,
          gave_in INTEGER NOT NULL DEFAULT 0
        );

        -- ===== settings (k/v JSON) =====
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- ===== push_subscriptions =====
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          endpoint TEXT NOT NULL UNIQUE,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          user_agent TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          last_seen TEXT
        );

        -- ===== owned_cosmetics =====
        CREATE TABLE IF NOT EXISTS owned_cosmetics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(reward_id)
        );

        -- ===== level_events (celebration queue) =====
        CREATE TABLE IF NOT EXISTS level_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL CHECK (type IN ('level_up','prestige')),
          from_level INTEGER,
          to_level INTEGER,
          prestige INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          seen INTEGER NOT NULL DEFAULT 0
        );

        -- ===== indexes =====
        CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, date);
        CREATE INDEX IF NOT EXISTS idx_habit_logs_date       ON habit_logs(date);
        CREATE INDEX IF NOT EXISTS idx_habits_archived       ON habits(archived, sort_order);
        CREATE INDEX IF NOT EXISTS idx_quests_period         ON quests(period);
        CREATE INDEX IF NOT EXISTS idx_trigger_target_date   ON trigger_journal(target_id, date);
        CREATE INDEX IF NOT EXISTS idx_level_events_seen     ON level_events(seen);

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
	db.exec(/* sql */ `
    CREATE TABLE IF NOT EXISTS applied_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

	const current = (
		db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM applied_migrations').get() as {
			v: number;
		}
	).v;

	const record = db.prepare('INSERT INTO applied_migrations (version, name) VALUES (?, ?)');

	for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
		if (m.version <= current) continue;
		db.transaction(() => {
			m.up(db);
			record.run(m.version, m.name);
		})();
		console.log(`[migrations] applied v${m.version} (${m.name})`);
	}
}
