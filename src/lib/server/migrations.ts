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
          last_active TEXT,
          last_freeze_grant TEXT,
          equipped_theme_id INTEGER,
          equipped_skin_id INTEGER,
          equipped_accessory_id INTEGER,
          equipped_frame_id INTEGER,
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
          date TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('done','skipped','relapsed')),
          note TEXT,
          xp_awarded INTEGER NOT NULL DEFAULT 0,
          coins_awarded INTEGER NOT NULL DEFAULT 0,
          logged_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(habit_id, date)
        );

        -- ===== quests =====
        CREATE TABLE IF NOT EXISTS quests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scope TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
          kind TEXT NOT NULL DEFAULT 'generic',
          key TEXT NOT NULL DEFAULT 'generic',
          description TEXT NOT NULL,
          target INTEGER NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0,
          reward_xp INTEGER NOT NULL,
          reward_coins INTEGER NOT NULL DEFAULT 0,
          period TEXT NOT NULL,
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
          category TEXT,    -- 'theme'|'avatar_skin'|'accessory'|'badge_frame' for cosmetics
          asset_id TEXT,    -- matches COSMETICS[].assetId for sprite lookup
          icon TEXT,
          description TEXT,
          min_level INTEGER NOT NULL DEFAULT 1,
          repeatable INTEGER NOT NULL DEFAULT 0,
          claimed_at TEXT
        );

        -- ===== owned_cosmetics =====
        CREATE TABLE IF NOT EXISTS owned_cosmetics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
          acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(reward_id)
        );

        -- ===== addiction_targets ("boss") =====
        CREATE TABLE IF NOT EXISTS addiction_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          kind TEXT,           -- 'tabac'|'alcool'|'sucre'|'ecrans'|'reseaux'|'jeux'|'autre'
          icon TEXT,
          clean_since TEXT,    -- 'YYYY-MM-DD'
          target_streak_days INTEGER NOT NULL DEFAULT 90,
          best_streak_days INTEGER NOT NULL DEFAULT 0,
          defeated_at TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          -- mode & règles combinables
          mode TEXT NOT NULL DEFAULT 'abstinence' CHECK (mode IN ('abstinence','limit')),
          daily_limit_minutes INTEGER,    -- si mode='limit'
          no_use_before TEXT,             -- 'HH:MM', règle « pas avant X »
          -- indicateurs de progression
          baseline_minutes_per_day INTEGER NOT NULL DEFAULT 0,
          track_time INTEGER NOT NULL DEFAULT 0,
          track_money INTEGER NOT NULL DEFAULT 1,
          money_per_day REAL NOT NULL DEFAULT 0
        );

        -- ===== daily_checkins (self-report journalier pour les boss limit/no_use_before) =====
        CREATE TABLE IF NOT EXISTS daily_checkins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_id INTEGER NOT NULL REFERENCES addiction_targets(id) ON DELETE CASCADE,
          date TEXT NOT NULL,              -- 'YYYY-MM-DD'
          minutes_used INTEGER,            -- pour mode limit
          respected_no_before INTEGER,     -- 1 = respecté, pour no_use_before
          coins_awarded INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(target_id, date)
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

        -- ===== settings =====
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
        CREATE INDEX IF NOT EXISTS idx_checkins_target_date  ON daily_checkins(target_id, date);

        INSERT OR IGNORE INTO user_state (id) VALUES (1);
      `);
		}
	}
	// Future migrations: { version: 2, name: '...', up: (db) => db.exec('ALTER TABLE ...') }
];

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
