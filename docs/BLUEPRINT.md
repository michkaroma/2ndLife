The blueprint is large; I'll return it directly as my final response. Given the brief explicitly forbids writing report/summary `.md` files, I return the full document as the assistant message.

# HabitQuest — Authoritative Implementation Blueprint

This is the single source of truth. It supersedes all 6 artifacts. Every conflict between artifacts has been resolved; resolutions are flagged **[RESOLVED]** inline. Build strictly from this document. All user-facing copy is French. Stack: SvelteKit 2 + Svelte 5 runes, TS strict, better-sqlite3 v11, TailwindCSS v3, adapter-node, @vite-pwa/sveltekit, web-push.

## Conflict resolution log (read first)

| # | Conflict between artifacts | Resolution |
|---|---|---|
| R1 | **Service worker location/strategy**: A2 says `injectManifest` `src/service-worker.ts`; A6 says same but `serviceWorker.register:false`; A2 hooks allowlisted both `/sw.js` and `/service-worker.js` | **`injectManifest`, file = `src/service-worker.ts`**, `svelte.config.js` sets `serviceWorker.register:false`. Allowlist `/service-worker.js` only (vite-pwa serves it there). |
| R2 | **Boss HP model**: A2 = linear 1 HP/day over fixed 100; A4 = `targetCleanDays * 10 * diffMult` with phases; A5 = HP = `target_streak_days` (1 day = 1 HP), defeated kept as trophy + "viser plus loin" | **A5 wins** (simplest, matches the day-counter metaphor and the schema). HP = `target_streak_days`, 1 clean day = 1 HP of damage. No phases, no per-day damage scaling. `boss_max_hp` column from A1 is dropped in favor of `target_streak_days`. |
| R3 | **Date helper / timezone**: A1 `localDate()` server-local; A2 `today()` fixed `Europe/Paris` via `fr-CA`; A5 local calendar | **Server-local** (A1). One helper `localDate()` in `db.ts`. No hardcoded Europe/Paris (self-hosted single box, server clock is authoritative). Client mirror `todayStr()` uses local tz. |
| R4 | **Coins on habit log**: A1 = `round(xpAwarded/10)`; A4 economy = flat 5/habit, 6/clean day | **A4 wins** (centralized economy). `PER_HABIT=5`, `PER_CLEAN_DAY=6`. A1's `/10` rule dropped. |
| R5 | **`habit_logs` award columns**: A1 = `xp_awarded`/`coins_awarded`; A2 = `grant_xp`/`grant_coins` | **`xp_awarded`/`coins_awarded`** (A1 names). A2's names are aliases of the same thing — use A1. |
| R6 | **Quest identity**: A1 added `kind`+`UNIQUE(period,kind)`; A4 wants `key`+`kind`; A6 seed has no kind | **Add both `kind` and `key`**, `UNIQUE(period, key)`. `kind` drives auto-progress matching; `key` is the template id for idempotent generation. |
| R7 | **Quest generation determinism**: A2 lazy `ensureQuestsForPeriod`; A4 deterministic FNV/xorshift selection | **A4 generator** (`generateDailyQuests`/`generateWeeklyQuests`), called from the dashboard `load()` via `ensureQuests()` (A2's lazy trigger). |
| R8 | **Reminder scheduler**: A6 = in-process `node-cron` default + external `/api/cron/daily` fallback | **A6 as written**. `node-cron` on by default; `node-cron` added to deps (missing from current package.json). |
| R9 | **Tab label for `/`**: A3 = "Accueil"; brief = "Dashboard" | **Accueil**. Routes use French slugs: `/`, `/habitudes`, `/addictions`, `/boutique`, `/reglages`. |
| R10 | **Stores**: A2 = `gameState`/`celebration`/`sync` (`.svelte.ts`); A3 = `ui`/`userState` (class-based); A5 = `sos` (writable) | **Unified set**: `gameState.svelte.ts`, `celebration.svelte.ts`, `sync.svelte.ts`, `sos.svelte.ts`. A3's `ui`+`userState` are folded into `gameState` (XP/coins) + `celebration` (toasts/overlays). All runes-in-module, no `svelte/store writable`. |
| R11 | **Health timeline content**: A2 generic 10-item; A3 `TABAC_MILESTONES`; A5 full per-kind `HEALTH_TIMELINES` | **A5 wins** (richest, per-`kind`, bienveillant). A2/A3 versions dropped. File = `src/lib/config/healthTimelines.ts`. |
| R12 | **Recovery file path**: A2 `config/recovery.ts`; A5 `config/healthTimelines.ts` | **`config/healthTimelines.ts`** (matches brief section 5 naming). |
| R13 | **`addiction_targets` extra columns**: A1 `boss_max_hp`/`health_track`/`icon`/`archived`; A5 `target_streak_days`/`icon`/`kind`/`defeated_at` | **Union, boss_max_hp dropped**: `target_streak_days`, `icon`, `kind`, `archived`, `defeated_at`. `health_track`→renamed `kind`. |
| R14 | **Relapse clean restart day**: A1 = same day; A5 = `date('now')` + optional freeze keeps `clean_since` | **A5**: relapse with freeze keeps `clean_since`; without freeze resets to `date('now')`. `best_streak_days` never decreases. |
| R15 | **Avatar bands**: A3 4 bands placeholder; A4 9 stages + moods | **A4 wins** (`avatar.ts` with 9 stages + 5 moods). A3's `AvatarCard` consumes `avatarAppearance()`. |
| R16 | **Settings/push tables**: A1 + A2 + A6 all add `settings` and `push_subscriptions` with slightly different columns | **Merged canonical schema** in §2 (push_subscriptions includes `user_agent`, `p256dh`, `auth`, `endpoint UNIQUE`). |
| R17 | **`node-cron` dependency** missing from existing package.json | Added in §0. |
| R18 | **Confetti / motion**: A3 hand-rolled `confettiLite`; consistent across | Keep A3's hand-rolled approach, no canvas-confetti dep. |

---

## 0. Stack & exact dependency versions

Matches the existing `package.json`, with `node-cron` + `@types/node-cron` added (R17) and the transitive `workbox-*` packages pinned for SW type resolution.

```jsonc
{
  "name": "habitquest",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node build/index.js",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "seed": "tsx scripts/seed.ts",
    "icons": "tsx scripts/generate-icons.ts",
    "vapid": "web-push generate-vapid-keys"
  },
  "dependencies": {
    "better-sqlite3": "^11.6.0",   // synchronous SQLite driver
    "node-cron": "^3.0.3",         // in-process daily reminder scheduler (R8/R17)
    "web-push": "^3.6.7"           // VAPID Web Push
  },
  "devDependencies": {
    "@sveltejs/adapter-node": "^5.2.9",
    "@sveltejs/kit": "^2.8.1",
    "@sveltejs/vite-plugin-svelte": "^4.0.2",
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.9.0",
    "@types/node-cron": "^3.0.11",
    "@types/web-push": "^3.6.4",
    "@vite-pwa/sveltekit": "^0.6.7",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "sharp": "^0.33.5",            // PWA icon generation (Windows-friendly prebuilt)
    "svelte": "^5.2.7",
    "svelte-check": "^4.1.0",
    "tailwindcss": "^3.4.15",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

`workbox-*` runtime packages (`workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`) are pulled transitively by `@vite-pwa/sveltekit`; their types resolve through it. If `svelte-check` complains, add them to devDependencies at the version `@vite-pwa` resolves (`^7.x`).

---

## 1. Final file tree

```
2ndLife/
├─ .env.example
├─ .gitignore                      # ignores: data/  .env  build/  node_modules/  .svelte-kit/
├─ CLAUDE.md
├─ README.md
├─ package.json
├─ postcss.config.js
├─ svelte.config.js
├─ tailwind.config.js
├─ tsconfig.json
├─ vite.config.ts
├─ assets/
│  └─ logo-source.svg              # icon generator source (not shipped to client)
├─ data/                           # SQLite lives here (gitignored), DB_PATH overridable
├─ scripts/
│  ├─ generate-icons.ts            # npm run icons
│  └─ seed.ts                      # npm run seed
├─ static/
│  ├─ favicon.png
│  └─ icons/
│     ├─ icon-192.png  icon-512.png
│     ├─ maskable-192.png  maskable-512.png
│     ├─ apple-touch-icon.png  badge-72.png
│     └─ safari-pinned-tab.svg
└─ src/
   ├─ app.html
   ├─ app.css
   ├─ app.d.ts                     # App.Locals.authed
   ├─ hooks.server.ts              # auth guard + init hook (cron)
   ├─ service-worker.ts            # injectManifest target (R1)
   ├─ lib/
   │  ├─ types.ts                  # all shared domain types (§3)
   │  ├─ motion.ts                 # reducedMotion(), dur()
   │  ├─ actions/
   │  │  └─ swipeable.ts
   │  ├─ config/                   # ⭐ all balancing/content (§5)
   │  │  ├─ progression.ts
   │  │  ├─ types.ts               # GameState/GameStats
   │  │  ├─ achievements.ts
   │  │  ├─ quests.ts
   │  │  ├─ shop.ts
   │  │  ├─ avatar.ts
   │  │  ├─ boss.ts                # boss config + HP fns (R2)
   │  │  ├─ healthTimelines.ts     # FR recovery frises (R11/R12)
   │  │  └─ wellnessCopy.ts        # SOS + relapse FR microcopy
   │  ├─ content/
   │  │  └─ fr.ts                  # misc FR arrays (toasts, triggers, empty states)
   │  ├─ server/
   │  │  ├─ db.ts                  # connection + helpers + CRUD API (§4)
   │  │  ├─ migrations.ts          # versioned runner (§2)
   │  │  ├─ progression.ts         # logHabit orchestration engine
   │  │  ├─ streaks.ts             # pure streak math (§5 of A1)
   │  │  ├─ boss.ts                # computeBossState, money, tiers
   │  │  ├─ achievements.ts        # seed + checkAchievements glue
   │  │  ├─ quests.ts              # ensureQuests + progress
   │  │  ├─ triggerStats.ts        # journal trends aggregation
   │  │  ├─ push.ts                # web-push send/save/remove
   │  │  ├─ reminder.ts            # buildDailyReminder()
   │  │  ├─ auth.ts                # HMAC session + password compare
   │  │  ├─ env.ts                 # runtime config loader
   │  │  ├─ respond.ts             # ok()/fail() JSON helpers
   │  │  └─ schemas.ts             # Zod-free manual validators
   │  ├─ client/
   │  │  ├─ api.ts                 # apiFetch + postLog (offline-aware)
   │  │  ├─ clock.ts               # todayStr()
   │  │  ├─ outbox.ts              # IndexedDB outbox
   │  │  └─ push.ts                # enablePush/disablePush
   │  ├─ stores/
   │  │  ├─ gameState.svelte.ts    # shared XP/coins/level/quests/today
   │  │  ├─ celebration.svelte.ts  # toasts + level-up/achievement overlays
   │  │  ├─ sync.svelte.ts         # online/pending/syncing
   │  │  └─ sos.svelte.ts          # global SOS sheet open state
   │  └─ components/
   │     ├─ layout/   AppHeader.svelte  BottomNav.svelte
   │     ├─ game/     AvatarCard.svelte  XpBar.svelte  LevelBadge.svelte  CoinPill.svelte  StreakFlame.svelte
   │     ├─ habits/   HabitRow.svelte  HabitForm.svelte
   │     ├─ quests/   QuestList.svelte  QuestCard.svelte
   │     ├─ boss/     BossPanel.svelte  BossHpBar.svelte  MoneySaved.svelte  HealthTimeline.svelte  TriggerJournalForm.svelte  TriggerTrends.svelte  RelapseFlow.svelte
   │     ├─ sos/      SosButton.svelte  SosSheet.svelte  BreathingExercise.svelte  BubbleGame.svelte  MotivationCard.svelte
   │     ├─ shop/     ShopGrid.svelte  RewardCard.svelte
   │     ├─ feedback/ Toast.svelte  ToastHost.svelte  AchievementToast.svelte  LevelUpOverlay.svelte  OverlayHost.svelte  Modal.svelte  ConfirmDialog.svelte  PwaUpdater.svelte  confetti.ts
   │     └─ ui/       EmptyState.svelte  SegmentedControl.svelte
   └─ routes/
      ├─ +layout.server.ts         # exposes locals.authed
      ├─ +layout.svelte            # shell + hosts + hydrate gameState
      ├─ +page.server.ts           # dashboard load() (ensureQuests, etc.)
      ├─ +page.svelte              # Accueil
      ├─ login/+page.svelte
      ├─ habitudes/+page.server.ts  habitudes/+page.svelte
      ├─ addictions/+page.server.ts addictions/+page.svelte
      ├─ boutique/+page.server.ts   boutique/+page.svelte
      ├─ reglages/+page.svelte
      └─ api/
         ├─ auth/login/+server.ts       auth/logout/+server.ts
         ├─ habits/+server.ts           habits/[id]/+server.ts        habits/[id]/log/+server.ts
         ├─ quests/[id]/claim/+server.ts
         ├─ rewards/+server.ts          rewards/[id]/+server.ts       rewards/[id]/claim/+server.ts
         ├─ addictions/+server.ts       addictions/[id]/+server.ts
         │  addictions/[id]/clean-date/+server.ts   addictions/[id]/relapse/+server.ts
         ├─ triggers/+server.ts
         ├─ push/vapid/+server.ts  push/subscribe/+server.ts  push/unsubscribe/+server.ts  push/test/+server.ts
         ├─ cron/daily/+server.ts       # inert unless DISABLE_CRON=1 + CRON_SECRET set
         ├─ settings/+server.ts
         └─ sync/state/+server.ts
```

---

## 2. Final SQLite schema + migration runner

Single migration (v1) creates everything below. Pragmas applied on connect before migrations.

### 2.1 `src/lib/server/migrations.ts`

```typescript
// src/lib/server/migrations.ts
import type { Database } from 'better-sqlite3';

export interface Migration { version: number; name: string; up: (db: Database) => void; }

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

        -- ===== habit_logs (R5 award column names) =====
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

        -- ===== quests (R6: key + kind, UNIQUE(period,key)) =====
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

        -- ===== addiction_targets (R2/R13: target_streak_days is HP) =====
        CREATE TABLE IF NOT EXISTS addiction_targets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          clean_since TEXT,                          -- 'YYYY-MM-DD'
          money_per_day REAL NOT NULL DEFAULT 0,
          best_streak_days INTEGER NOT NULL DEFAULT 0,
          target_streak_days INTEGER NOT NULL DEFAULT 90,  -- boss HP (min 7, max 365 enforced in code)
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

        -- ===== push_subscriptions (R16) =====
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
];

export function runMigrations(db: Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS applied_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  const current = (db.prepare('SELECT COALESCE(MAX(version),0) v FROM applied_migrations').get() as { v: number }).v;
  const record = db.prepare('INSERT INTO applied_migrations (version, name) VALUES (?, ?)');
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    db.transaction(() => { m.up(db); record.run(m.version, m.name); })();
    console.log(`[migrations] applied v${m.version} (${m.name})`);
  }
}
```

### 2.2 Pragmas (in `getDb()`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
```

---

## 3. `src/lib/types.ts` (full)

```typescript
// src/lib/types.ts — shared domain types. Row types mirror SQLite 1:1 (0/1 = boolean).

// ---------- enums / unions ----------
export type HabitType = 'build' | 'break';
export type HabitStatus = 'done' | 'skipped' | 'relapsed';
export type QuestScope = 'daily' | 'weekly';
export type RewardKind = 'cosmetic' | 'real';
export type LevelEventType = 'level_up' | 'prestige';
export type Difficulty = 1 | 2 | 3;
export type AddictionKind = 'tabac' | 'alcool' | 'sucre' | 'ecrans' | 'autre';

export type QuestKind =
  | 'generic' | 'build' | 'clean' | 'journaling' | 'variety' | 'streak' | 'sos';

// ---------- raw DB rows ----------
export interface UserStateRow {
  id: 1; total_xp: number; coins: number; prestige: number; freezes: number;
  last_active: string | null; last_freeze_grant: string | null;
  equipped_cosmetic_id: number | null; created_at: string;
}
export interface Habit {
  id: number; name: string; type: HabitType; category: string | null;
  difficulty: Difficulty; icon: string | null; archived: number; sort_order: number; created_at: string;
}
export interface HabitLog {
  id: number; habit_id: number; date: string; status: HabitStatus; note: string | null;
  xp_awarded: number; coins_awarded: number; logged_at: string;
}
export interface Quest {
  id: number; scope: QuestScope; kind: QuestKind; key: string; description: string;
  target: number; progress: number; reward_xp: number; reward_coins: number;
  period: string; completed: number; completed_at: string | null;
}
export interface Achievement {
  key: string; name: string; description: string | null; icon: string | null;
  reward_coins: number; unlocked_at: string | null;
}
export interface Reward {
  id: number; name: string; cost: number; kind: RewardKind; icon: string | null;
  description: string | null; min_level: number; repeatable: number; claimed_at: string | null;
}
export interface AddictionTarget {
  id: number; name: string; clean_since: string | null; money_per_day: number;
  best_streak_days: number; target_streak_days: number; kind: AddictionKind | null;
  icon: string | null; archived: number; defeated_at: string | null; created_at: string;
}
export interface TriggerEntry {
  id: number; target_id: number | null; date: string; trigger: string | null;
  craving: number | null; note: string | null; gave_in: number;
}
export interface PushSubscriptionRow {
  id: number; endpoint: string; p256dh: string; auth: string;
  user_agent: string | null; created_at: string; last_seen: string | null;
}
export interface OwnedCosmetic { id: number; reward_id: number; acquired_at: string; }
export interface LevelEvent {
  id: number; type: LevelEventType; from_level: number | null; to_level: number | null;
  prestige: number; created_at: string; seen: number;
}

// ---------- input DTOs ----------
export interface NewHabit {
  name: string; type: HabitType; category?: string | null; difficulty?: Difficulty; icon?: string | null;
}
export type HabitPatch = Partial<NewHabit> & { sort_order?: number; archived?: boolean };
export interface NewReward {
  name: string; cost: number; kind: RewardKind; icon?: string | null;
  description?: string | null; min_level?: number; repeatable?: boolean;
}
export interface NewAddictionTarget {
  name: string; clean_since?: string | null; money_per_day?: number;
  target_streak_days?: number; kind?: AddictionKind; icon?: string | null;
}
export interface NewTriggerEntry {
  target_id: number | null; trigger?: string | null; craving?: number | null;
  note?: string | null; gave_in?: boolean;
}
export interface WebPushKeys { endpoint: string; keys: { p256dh: string; auth: string }; }

// ---------- computed view-models ----------
export interface LevelInfo {
  level: number; intoLevel: number; needed: number; totalXp: number;
  progressPct: number; prestige: number; canPrestige: boolean;
}
export interface StreakInfo { current: number; best: number; }
export interface HabitWithStatus {
  habit: Habit; todayStatus: HabitStatus | null; streak: number; bestStreak: number;
}
export interface CleanStreakInfo { currentDays: number; bestDays: number; moneySaved: number; }
export interface HealthMilestone { afterLabel: string; afterSeconds: number; title: string; message: string; reached?: boolean; }
export interface QuestView extends Quest { progressPct: number; }

export interface ProgressDelta {
  xpGained: number; coinsGained: number; totalXp: number; coins: number; freezes: number;
  leveledUp: boolean; newLevel: number | null; level: LevelInfo; streakDays: number;
  unlockedAchievements: Achievement[]; completedQuests: Quest[];
}
export interface LogResult {
  log: HabitLog; delta: ProgressDelta; levelBefore: number; levelAfter: number;
}

export interface TodayView {
  date: string;
  habits: { habit: Habit; log: HabitLog | null; streak: number }[];
  globalStreak: number;
}
export interface SyncStateResponse {
  userState: UserStateRow; level: LevelInfo; today: TodayView; quests: Quest[];
}

// ---------- feedback / UI ----------
export interface ToastItem {
  id: string; message: string; tone?: 'info' | 'success' | 'warn' | 'danger' | 'flame' | 'gold';
  icon?: string; action?: { label: string; run: () => void }; duration?: number;
}
export interface ApiError { error: { code: string; message: string }; }
```

---

## 4. `src/lib/server/db.ts` API (all signatures, grouped)

One shared synchronous connection. Engines (`progression.ts`, `quests.ts`, etc.) call these primitives. Reference implementations for the non-obvious functions follow the grouped signatures; trivial CRUD uses the `db.prepare(...).run/get/all` pattern shown in A1.

```typescript
// src/lib/server/db.ts
import Database from 'better-sqlite3';
// types imported from '$lib/types'

// ===== connection / init =====
export function getDb(): Database.Database;              // singleton + pragmas + migrations
export function dbPath(): string;                        // env DB_PATH || './data/habitquest.db', mkdir
export function initDb(): void;                          // boot: open + seed achievements/rewards/settings
export function closeDb(): void;

// ===== date / period helpers (single source of "today") =====
export function localDate(d?: Date): string;             // server-local 'YYYY-MM-DD'  (R3)
export function previousDate(date: string): string;
export function isoWeek(date?: string): string;          // 'YYYY-Www'
export function daysBetween(a: string, b: string): number;

// ===== settings (JSON) =====
export function getSetting<T = unknown>(key: string): T | null;
export function setSetting(key: string, value: unknown): void;
export function getAllSettings(): Record<string, unknown>;

// ===== user_state =====
export function getUserState(): UserStateRow;            // always id=1
export function addXp(delta: number): number;            // clamps >=0, returns new total
export function addCoins(delta: number): number;
export function spendCoins(amount: number): boolean;     // atomic
export function setFreezes(count: number): void;
export function consumeFreeze(): boolean;
export function grantWeeklyFreezeIfDue(week: string): boolean;  // idempotent per ISO week
export function setLastActive(date: string): void;
export function setEquippedCosmetic(rewardId: number | null): void;
export function prestige(): number | null;               // level>=50 -> reset xp, +1 prestige, log event

// ===== level events =====
export function logLevelEvent(type: LevelEventType, fromLevel: number, toLevel: number, prestige: number): void;
export function getUnseenLevelEvents(): LevelEvent[];
export function markLevelEventsSeen(ids: number[]): void;

// ===== habits =====
export function createHabit(input: NewHabit): Habit;
export function getHabit(id: number): Habit | null;
export function updateHabit(id: number, patch: HabitPatch): Habit | null;
export function archiveHabit(id: number, archived?: boolean): void;
export function deleteHabit(id: number): void;            // cascades logs
export function listHabits(opts?: { archived?: boolean }): Habit[];  // default active
export function reorderHabits(orderedIds: number[]): void;

// ===== habit logs =====
export function upsertHabitLog(args: {
  habitId: number; date: string; status: HabitStatus; note?: string | null;
  xpAwarded: number; coinsAwarded: number;
}): HabitLog;                                            // ON CONFLICT(habit_id,date)
export function getHabitLog(habitId: number, date: string): HabitLog | null;
export function deleteHabitLog(habitId: number, date: string): boolean;
export function getHabitLogDates(habitId: number, status?: HabitStatus): string[];  // ASC
export function getLogsForDate(date: string): HabitLog[];
export function countLogsForDate(date: string, status: HabitStatus): number;

// ===== quests =====
export function upsertQuest(args: {
  scope: QuestScope; kind: QuestKind; key: string; description: string; target: number;
  rewardXp: number; rewardCoins: number; period: string;
}): Quest;                                              // ON CONFLICT(period,key) DO NOTHING
export function listQuests(period: string, scope?: QuestScope): Quest[];
export function getQuest(id: number): Quest | null;
export function incrementQuestProgress(id: number, by: number): Quest | null;  // clamps to target
export function setQuestProgress(id: number, value: number): Quest | null;
export function completeQuest(id: number): boolean;      // returns true only on transition
export function pruneOldQuests(beforePeriod: string): number;

// ===== achievements =====
export function listAchievements(): Achievement[];
export function getAchievement(key: string): Achievement | null;
export function seedAchievements(rows: Array<{ key: string; name: string; description?: string; icon?: string; reward_coins?: number }>): void;
export function unlockAchievement(key: string): Achievement | null;  // returns row only on lock->unlock

// ===== rewards (shop) =====
export function createReward(input: NewReward): Reward;
export function getReward(id: number): Reward | null;
export function updateReward(id: number, patch: Partial<NewReward>): Reward | null;
export function deleteReward(id: number): void;
export function listRewards(opts?: { kind?: RewardKind }): Reward[];
export function claimReward(id: number, currentLevel: number): Reward | null;  // checks coins+min_level
export function listOwnedCosmetics(): OwnedCosmetic[];

// ===== addiction targets =====
export function createAddictionTarget(input: NewAddictionTarget): AddictionTarget;
export function getAddictionTarget(id: number): AddictionTarget | null;
export function updateAddictionTarget(id: number, patch: Partial<NewAddictionTarget>): AddictionTarget | null;
export function archiveAddictionTarget(id: number, archived?: boolean): void;
export function deleteAddictionTarget(id: number): void;
export function listAddictionTargets(opts?: { archived?: boolean }): AddictionTarget[];
export function markBossDefeated(id: number): AddictionTarget | null;  // set defeated_at, roll best
export function setCleanSince(id: number, date: string | null): AddictionTarget | null;
export function relapse(id: number, date: string, useFreeze: boolean): { target: AddictionTarget; usedFreeze: boolean } | null;  // R14

// ===== trigger journal =====
export function addTriggerEntry(input: NewTriggerEntry): TriggerEntry;
export function listTriggerEntries(opts?: { targetId?: number; limit?: number }): TriggerEntry[];
export function deleteTriggerEntry(id: number): void;

// ===== push subscriptions =====
export function savePushSubscription(sub: WebPushKeys, userAgent?: string): PushSubscriptionRow;  // upsert by endpoint
export function listPushSubscriptions(): PushSubscriptionRow[];
export function deletePushSubscription(endpoint: string): void;
export function touchPushSubscription(endpoint: string): void;
```

**Key reference implementations** (the rest follow A1's patterns verbatim):

```typescript
let _db: Database.Database | null = null;
export function getDb() {
  if (_db) return _db;
  _db = new Database(dbPath());
  _db.pragma('journal_mode = WAL'); _db.pragma('foreign_keys = ON');
  _db.pragma('busy_timeout = 5000'); _db.pragma('synchronous = NORMAL');
  runMigrations(_db);
  return _db;
}
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function daysBetween(a: string, b: string): number {
  const [ay,am,ad]=a.split('-').map(Number), [by,bm,bd]=b.split('-').map(Number);
  return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);
}
export function upsertHabitLog(args: {...}): HabitLog {
  getDb().prepare(`INSERT INTO habit_logs (habit_id,date,status,note,xp_awarded,coins_awarded)
    VALUES (@habitId,@date,@status,@note,@xpAwarded,@coinsAwarded)
    ON CONFLICT(habit_id,date) DO UPDATE SET status=excluded.status, note=excluded.note,
      xp_awarded=excluded.xp_awarded, coins_awarded=excluded.coins_awarded, logged_at=datetime('now')`)
    .run({ ...args, note: args.note ?? null });
  return getHabitLog(args.habitId, args.date)!;
}
export function completeQuest(id: number): boolean {
  return getDb().prepare(`UPDATE quests SET completed=1, completed_at=datetime('now')
    WHERE id=? AND completed=0`).run(id).changes === 1;
}
export function unlockAchievement(key: string): Achievement | null {
  const r = getDb().prepare(`UPDATE achievements SET unlocked_at=datetime('now')
    WHERE key=? AND unlocked_at IS NULL`).run(key);
  return r.changes === 1 ? getAchievement(key) : null;
}
export function claimReward(id: number, currentLevel: number): Reward | null {
  const db = getDb();
  return db.transaction((): Reward | null => {
    const r = getReward(id); if (!r) return null;
    if (currentLevel < r.min_level) return null;
    if (!r.repeatable && r.claimed_at) return null;
    if (!spendCoins(r.cost)) return null;
    if (!r.repeatable) db.prepare(`UPDATE rewards SET claimed_at=datetime('now') WHERE id=?`).run(id);
    if (r.kind === 'cosmetic') db.prepare('INSERT OR IGNORE INTO owned_cosmetics (reward_id) VALUES (?)').run(id);
    return getReward(id);
  })();
}
export function relapse(id: number, date: string, useFreeze: boolean) {
  const db = getDb();
  return db.transaction(() => {
    const t = getAddictionTarget(id); if (!t) return null;
    if (t.clean_since) {
      const run = daysBetween(t.clean_since, date) + 1;
      if (run > t.best_streak_days)
        db.prepare('UPDATE addiction_targets SET best_streak_days=? WHERE id=?').run(run, id);
    }
    let usedFreeze = false;
    if (useFreeze && consumeFreeze()) usedFreeze = true;        // R14: freeze keeps clean_since
    else db.prepare('UPDATE addiction_targets SET clean_since=? WHERE id=?').run(date, id);
    return { target: getAddictionTarget(id)!, usedFreeze };
  })();
}
```

**Engine orchestration** — `src/lib/server/progression.ts` exports `logHabit(habitId, date, status, note?): LogResult`. Flow (one transaction): roll back prior log's `xp_awarded`/`coins_awarded` if re-logging → compute pre-action streak via `streaks.ts` → base XP from `progression.ts` config (`build` done = `XP_PER_HABIT*difficulty`, `break` done = `XP_BREAK_HABIT_DAY*difficulty`, skip/relapse = 0) → `xpWithStreak(base, streak)` → coins from `COIN_ECONOMY` (R4: `PER_HABIT=5` build, `PER_CLEAN_DAY=6` break) → `upsertHabitLog` + `addXp` + `addCoins` + `setLastActive` → recompute level before/after → `logLevelEvent` on increase → `incrementQuestProgress` by matching `kind` + `checkAchievements`. Freeze of a missed day writes a synthetic `done` log with `xp_awarded=0, coins_awarded=0, note='gel de série'` so streak math stays pure (A1 default).

---

## 5. Config (`src/lib/config/`)

### 5.1 `progression.ts` (from brief)

```typescript
// src/lib/config/progression.ts — ⭐ ALL balancing numbers live here.
export const PROGRESSION = {
  BASE_XP: 100,
  EXPONENT: 1.5,
  XP_PER_HABIT: 25,
  XP_BREAK_HABIT_DAY: 30,
  STREAK_BONUS_PER_DAY: 0.02,   // +2%/day
  STREAK_BONUS_CAP: 0.5,        // capped +50%
  PRESTIGE_LEVEL: 50,
  MAX_BACKFILL_DAYS: 2          // offline log tolerance (A2)
} as const;

/** XP required to go from `level` to `level+1`. */
export function xpToNextLevel(level: number): number {
  return Math.floor(PROGRESSION.BASE_XP * Math.pow(level, PROGRESSION.EXPONENT));
}
/** Cumulative XP needed to reach `level` (level 1 = 0). */
export function totalXpForLevel(level: number): number {
  let sum = 0; for (let l = 1; l < level; l++) sum += xpToNextLevel(l); return sum;
}
/** Resolve level + progress from total XP. */
export function levelFromXp(totalXp: number): { level: number; intoLevel: number; needed: number } {
  let level = 1, remaining = totalXp;
  while (remaining >= xpToNextLevel(level)) { remaining -= xpToNextLevel(level); level++; }
  return { level, intoLevel: remaining, needed: xpToNextLevel(level) };
}
/** Apply capped streak bonus to a base XP value. */
export function xpWithStreak(base: number, streakDays: number): number {
  const bonus = Math.min(streakDays * PROGRESSION.STREAK_BONUS_PER_DAY, PROGRESSION.STREAK_BONUS_CAP);
  return Math.round(base * (1 + bonus));
}
```

### 5.2 `config/types.ts` — `GameState`/`GameStats`

Paste A4 §0 verbatim (`GameState` snapshot interface + `GameStats` alias). Adds `cravingsResisted`, `sosUsed` (derivable from `trigger_journal`).

### 5.3 `achievements.ts`

Paste A4 §1 verbatim: `AchievementCondition` union, `Achievement` interface, the **30-item `ACHIEVEMENTS` array** (FR), `isUnlocked()`, `checkAchievements(state, stats, alreadyUnlocked)`, `achievementReward()`. Seeded into the `achievements` table at boot via `seedAchievements()`.

### 5.4 `quests.ts`

Paste A4 §2 verbatim: `QuestTemplate`, the **16-template `QUEST_TEMPLATES` array**, scaling helpers (`dailyXp`/`weeklyXp`/`dailyCoins`/`weeklyCoins`), `QUESTS_PER_PERIOD = { daily: 3, weekly: 2 }`, deterministic `fnv1a`/`makeStepper`/`pickTemplates`, `GeneratedQuest`, `generateDailyQuests`/`generateWeeklyQuests`/`generateQuests`. **[RESOLVED R6]** `GeneratedQuest` includes `key` and `kind`; the server `ensureQuests()` upserts via `upsertQuest({...,key,kind})` so `UNIQUE(period,key)` makes generation idempotent.

### 5.5 `shop.ts`

Paste A4 §3 verbatim: `COIN_ECONOMY` **[RESOLVED R4]** (`PER_HABIT: 5`, `PER_CLEAN_DAY: 6`, `LEVEL_UP_BASE: 10`, `LEVEL_UP_PER_LEVEL: 2`, `PRESTIGE_BONUS: 500`), `coinsForLevelUp()`, `CosmeticItem` + **18-item `COSMETICS` array**, `RealRewardSeed` + `REAL_REWARD_SEEDS`, `canPurchase()`. Post-prestige unlock gates use `effectiveLevel = level + prestige * PROGRESSION.PRESTIGE_LEVEL`.

### 5.6 `avatar.ts`

Paste A4 §4 verbatim **[RESOLVED R15]**: `AvatarStage` + 9-stage `AVATAR_STAGES`, `AvatarMood` + 5-mood `AVATAR_MOODS` (never negative), `avatarStageForLevel()`, `avatarMoodForStreak()`, `avatarAppearance(level, currentStreak, prestige)`.

### 5.7 `boss.ts` (config + HP functions) **[RESOLVED R2]**

```typescript
// src/lib/config/boss.ts
export const BOSS = {
  DEFAULT_TARGET: 90, MIN_TARGET: 7, MAX_TARGET: 365,
  DEFAULT_ICON: '👾',
  VICTORY_COIN_BONUS_PER_TARGET_DAY: 1,   // defeat bonus = targetDays coins
  MILESTONES: [
    { days: 1, label: 'Premier jour' }, { days: 3, label: '3 jours' },
    { days: 7, label: '1 semaine' }, { days: 14, label: '2 semaines' },
    { days: 30, label: '1 mois' }, { days: 90, label: '3 mois' },
    { days: 180, label: '6 mois' }, { days: 365, label: '1 an' }
  ]
} as const;
export const BOSS_DEFEAT_MESSAGES = [
  'Boss terrassé ! Chaque jour clean l’a affaibli — et regarde le chemin parcouru. 💪',
  'Victoire ! Tu as prouvé que tu es plus fort que cette habitude. Un nouveau défi t’attend.',
  'Incroyable. Ce boss est vaincu. Repose-toi, savoure, puis vise encore plus haut. 🌟'
] as const;
```

HP math lives in `src/lib/server/boss.ts`: `cleanDaysFrom`, `moneySaved`, `nextMilestone`, `bossTier`, `computeBossState` — paste A5 §1.2 verbatim. **HP = `target_streak_days`, hpRemaining = `max(0, target − cleanDays)`.** Defeat sets `defeated_at`, awards `targetDays` coins, offers "viser plus loin (+90)" which raises `target_streak_days` keeping `clean_since`.

### 5.8 `healthTimelines.ts` **[RESOLVED R11/R12]**

Paste A5 §3 verbatim: `HealthMilestone`, `HealthTimelineKey`, the full per-kind `HEALTH_TIMELINES` (tabac/alcool/sucre/ecrans/autre, all FR bienveillant), `timelineFor(kind)`.

### 5.9 `wellnessCopy.ts` + `content/fr.ts`

`wellnessCopy.ts`: paste A5 §4.4 (`SOS`, `MOTIVATION`) + A5 §8.3 (`RELAPSE`) + breathing config (A5 §5.1: `BREATHING_DEFAULT`, `BREATHING_PRESETS`) + `BUBBLE_GAME` (A5 §6.3). `content/fr.ts`: paste A3 §5.5 (`DONE_TOASTS`, `RELAPSE_TOASTS`, `COMMON_TRIGGERS`, `DIFFICULTY_LABELS`, `HABIT_TYPE_OPTIONS`, `EMPTY`) and A5's `MONEY_EQUIVALENTS`.

**Generator/checker functions exposed**: `checkAchievements` (achievements.ts), `generateDailyQuests`/`generateWeeklyQuests` (quests.ts), `canPurchase`/`coinsForLevelUp` (shop.ts), `avatarAppearance` (avatar.ts), `computeBossState`/`bossTier`/`handleBossDefeat` (boss.ts), `timelineFor` (healthTimelines.ts).

---

## 6. API endpoints table + auth

### 6.1 Endpoints

| Method | Path | Body → Response | Server fn |
|---|---|---|---|
| POST | `/api/auth/login` | `{password}` → `{ok}` + cookie | `auth.ts` |
| POST | `/api/auth/logout` | — → `{ok}` clear cookie | — |
| GET/POST | `/api/habits` | list / `NewHabit` → `{habit}` | `listHabits`/`createHabit` |
| PUT/DELETE | `/api/habits/[id]` | `HabitPatch` / — → `{habit}` | `updateHabit`/`archiveHabit` |
| POST | `/api/habits/[id]/log` | `{date?,status?,note?,clientId?}` → `{delta,log,clientId}` | `logHabit` |
| DELETE | `/api/habits/[id]/log` | `{date?}` → `{delta}` | reverse (same-day) |
| POST | `/api/quests/[id]/claim` | — → `{delta,quest}` | `completeQuest`+engine |
| GET/POST | `/api/rewards` | list / `NewReward` → `{reward}` | `listRewards`/`createReward` |
| DELETE | `/api/rewards/[id]` | → `{ok}` | `deleteReward` |
| POST | `/api/rewards/[id]/claim` | — → `{reward,coins,delta?}` | `claimReward` |
| GET/POST | `/api/addictions` | view-models / `NewAddictionTarget` → `{target}` | `listAddictionTargets`+`computeBossState` |
| PUT/DELETE | `/api/addictions/[id]` | patch / — → `{target}`/`{ok}` | update/delete |
| POST | `/api/addictions/[id]/clean-date` | `{cleanSince}` → `{target}` | `setCleanSince` |
| POST | `/api/addictions/[id]/relapse` | `{useFreeze,trigger?,craving?,note?}` → `{target,message,usedFreeze}` | `relapse` (R14) |
| GET/POST | `/api/triggers` | `?targetId` → `{entries,trends}` / `NewTriggerEntry` → `{entry}` | `triggerStats.ts` |
| GET | `/api/push/vapid` | → `{publicKey}` | `env` |
| POST | `/api/push/subscribe` | `PushSubscriptionJSON` → `{ok}` | `savePushSubscription` |
| POST | `/api/push/unsubscribe` | `{endpoint}` → `{ok}` | `deletePushSubscription` |
| POST | `/api/push/test` | — → `{sent,pruned}` | `sendToAll` |
| POST | `/api/cron/daily` | header `x-cron-secret` → result | `buildDailyReminder`+`sendToAll` (inert unless `DISABLE_CRON=1`) |
| GET/PUT | `/api/settings` | → `{settings}` / `Partial<SettingsView>` | `getAllSettings`/`setSetting` |
| GET | `/api/sync/state` | → `SyncStateResponse` | aggregate |

Error envelope: `{ error: { code, message } }`, `message` FR. Helpers in `respond.ts`: `ok(data,status)`, `fail(code,message,status)`.

### 6.2 Auth (`src/hooks.server.ts`)

HMAC-signed session cookie (`hq_session`, 90-day, key derived from `APP_PASSWORD + '::hq-session-v1'`), no DB session table, no JWT lib (A2 §2.1 `auth.ts` verbatim). The guard + the cron `init` hook live together:

```typescript
// src/hooks.server.ts
import type { Handle, ServerInit } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import cron from 'node-cron';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';
import { env } from '$lib/server/env';
import { sendToAll } from '$lib/server/push';
import { buildDailyReminder } from '$lib/server/reminder';
import { initDb } from '$lib/server/db';

const PUBLIC_EXACT = new Set(['/login','/manifest.webmanifest','/service-worker.js','/favicon.png','/robots.txt']);
const PUBLIC_PREFIX = ['/api/auth','/api/cron','/_app/','/icons/','/workbox-'];
const isPublic = (p: string) => PUBLIC_EXACT.has(p) || PUBLIC_PREFIX.some((x) => p.startsWith(x));

let started = false;
export const init: ServerInit = async () => {
  initDb();
  if (started || env.DISABLE_CRON) return;
  started = true;
  const [h, m] = env.PUSH_TIME.split(':');
  cron.schedule(`${Number(m)} ${Number(h)} * * *`, async () => {
    const payload = buildDailyReminder();
    if (payload) await sendToAll(payload);
  });
  console.log(`[cron] Rappel quotidien programmé à ${env.PUSH_TIME}`);
};

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const authed = verifySession(event.cookies.get(SESSION_COOKIE));
  event.locals.authed = authed;
  if (!authed && !isPublic(pathname)) {
    if (pathname.startsWith('/api/')) throw error(401, 'Non authentifié');
    throw redirect(303, `/login?redirectTo=${encodeURIComponent(pathname + event.url.search)}`);
  }
  return resolve(event);
};
```

**[RESOLVED]** `/api/push/*` requires a session (single-user spam guard); `/api/cron/daily` is public but `CRON_SECRET`-gated; `/api/auth/*` public. Cookie: `httpOnly, sameSite:'lax', secure:!dev, maxAge:7776000`. `app.d.ts` declares `App.Locals.authed: boolean`.

---

## 7. Client state + offline sync

### 7.1 Stores (runes-in-module, `.svelte.ts`) **[RESOLVED R10]**

- **`gameState.svelte.ts`** — module-scoped `$state` `{ user, quests, today, globalStreak }` + `$derived` `level`/`xpPercent`. Methods: `hydrate(payload)`, `optimisticLog(habitId, difficulty)`, `reconcile(delta, habitId?)`, `rollbackLog(...)`. A2 §3.2 verbatim. Absorbs A3's `userState`.
- **`celebration.svelte.ts`** — `events: CelebrationEvent[]`, `toasts: ToastItem[]`, `levelUp`, `achievementQueue`. Methods `celebrate`, `toast`, `consume`, `pushAchievement`, `celebrateFromDelta(delta)`. A2 §3.3 + A3 `ui` overlay queue merged here.
- **`sync.svelte.ts`** — `online`, `pendingCount`, `pendingKeys: Set`, `syncing`. Methods `isPending(habitId,date)`, `setOnline`, `markPending`, `refresh()`, `setSyncing`. A2 §4.5 verbatim.
- **`sos.svelte.ts`** — `{ open: boolean; targetId: number|null }`, `openSos(targetId?)`, `closeSos()`. A5 §4.1 (converted from `writable` to runes module).

### 7.2 Offline outbox (`src/lib/client/outbox.ts`)

IndexedDB `habitquest-outbox`, store `logs` (keyPath `clientId`), index `byState`. Records `{ clientId, habitId, date, status, note, createdAt, state: 'pending'|'syncing'|'synced'|'conflict', attempts }`. API: `enqueueLog`, `pendingLogs`, `countPending`, `flushOutbox()`, `pruneSynced()`. A2 §4.2–4.3 verbatim. Idempotency: server `UNIQUE(habit_id,date)` + `INSERT…ON CONFLICT` makes duplicate flush grant XP once (`delta.xpGained=0` on dup).

### 7.3 Tap flow & SW interplay

`postLog()` (A2 §3.4): offline → `enqueueLog` + `sync.markPending`; online → POST, reconcile via `gameState.reconcile(delta)` + `celebrateFromDelta`; any failure → enqueue (taps are never lost). **The SW never intercepts mutations** — it only relays a flush signal. On `sync` event (tag `outbox-sync`) or `message {type:'FLUSH_OUTBOX'}`, the SW `postMessage`s all clients; the page (root `+layout.svelte` `$effect` listening on `online`/`visibilitychange`/`BroadcastChannel('habitquest-sync')`) calls `flushOutbox()` then `GET /api/sync/state` + `gameState.hydrate()` to reconcile quests/freeze grants advanced offline.

---

## 8. Component tree with TS props

Conventions: Svelte 5 runes, `let { ... }: Props = $props()`. All props interfaces from A3 §3 / A5 are authoritative.

```
+layout.svelte (shell, max-w-[480px], hydrate gameState, mount listeners)
 ├─ AppHeader { user }                       ── LevelBadge, CoinPill, XpBar
 ├─ <main>{@render children()}</main>
 ├─ BottomNav                                 (Accueil/Habitudes/Addictions/Boutique)  [R9]
 ├─ SosButton                                 (global FAB → sos store)
 ├─ ToastHost                                 ── Toast, AchievementToast
 ├─ OverlayHost                               ── Modal, ConfirmDialog, LevelUpOverlay, SosSheet
 └─ PwaUpdater

/ (Accueil)
 ├─ AvatarCard { level,intoLevel,needed,coins,prestige,name?,topStreak? }  ── XpBar,LevelBadge,StreakFlame
 ├─ QuestList { quests,onclaim,title? }       ── QuestCard { quest,onclaim }
 ├─ HabitRow[] { habit,ondone,onskip,onrelapse,onundo? }  ── StreakFlame  [swipeable]
 └─ BossPanel[] (compact) { boss,onsos }      ── BossHpBar,MoneySaved,StreakFlame

/habitudes  ── HabitRow[], HabitForm{habit?,onsubmit,oncancel,submitting?}(Modal), EmptyState, SegmentedControl
/addictions ── BossPanel{boss,onsos}, BossHpBar{hp,maxHp,label?}, MoneySaved{amount,perDay?,currency?},
               HealthTimeline{kind,cleanSince}, TriggerJournalForm{targetId,onsubmit,oncancel?},
               TriggerTrends{entries}, RelapseFlow
               SosSheet → BreathingExercise{pattern?,cycles?,onfinish?}, BubbleGame, MotivationCard{targetId?}
/boutique   ── ShopGrid{rewards,coins,onbuy} ── RewardCard{reward,affordable,onbuy}, CoinPill, ConfirmDialog
/reglages   ── push toggle (enablePush/disablePush), theme, reminder time
/login      ── form → POST /api/auth/login
```

Component prop interfaces are exactly as specified in A3 §3.1–3.7 and A5 (BossPanel, BreathingExercise machine, BubbleGame, RelapseFlow). One-tap validation: `HabitRow`'s 44×44 done button = single tap → `gameState.optimisticLog` → `postLog` → reconcile. Skip/relapse only via swipe-left or long-press (never accidental).

---

## 9. Design tokens

### 9.1 `tailwind.config.js` `theme.extend`

Paste A3 §1.1 verbatim, **plus** the boss keyframes from A5 §1.5:

```js
// merge into theme.extend.keyframes / animation:
wiggle: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
victoryPop: { '0%': { transform:'scale(0.3)', opacity:'0' }, '60%': { transform:'scale(1.15)' }, '100%': { transform:'scale(1)', opacity:'1' } },
// animation:
'victory-pop': 'victoryPop 500ms cubic-bezier(.18,.89,.32,1.28)',
wiggle: 'wiggle 2s ease-in-out infinite',
```

Full token set: colors (`bg/surface/surface2/border/text/muted/primary/accent/xp/flame/gold/health/danger/boss` via CSS vars `<alpha-value>`), `borderRadius` (sm…2xl, pill), `fontFamily` (Inter sans, Space Grotesk display), `boxShadow` (card/raised/glow), timing (`out-soft`, `spring`), keyframes (flame-pulse, coin-pop, toast-in, sheen, ping-ring + the two boss ones). `darkMode: 'class'`, `content: ['./src/**/*.{html,js,svelte,ts}']`.

### 9.2 `src/app.css`

Paste A3 §1.2 verbatim: `:root,.dark` CSS custom properties (dark-first `--c-*` RGB triples, `--safe-top/bottom`, `--nav-h`), `@layer base` (tap-highlight, focus-visible ring, control `touch-action`), `@layer components` (`.card`, `.card-2`, `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-danger`/`.btn-icon`, `.pill`, `.input`, `.label`, `.track`/`.track-fill`), `@layer utilities` (`.pb-safe`, `.pt-safe`, `.pb-nav`, `.no-scrollbar`), the `prefers-reduced-motion` global kill-switch, and the extra keyframes (`coin-float`, `confetti-fall`, `claim-pulse` + their `.animate-*` classes). `<html class="dark">` hardcoded in `app.html`.

Motion helper `src/lib/motion.ts`: `reducedMotion()`, `dur(ms)`.

---

## 10. Addiction module

Paste A5 verbatim for all of the following; key resolved points:

- **Boss model** **[RESOLVED R2]**: `src/lib/server/boss.ts` — HP = `target_streak_days`, 1 clean day = 1 HP damage, `hpRemaining = max(0, target − cleanDays)`, tiers `colossal/affaibli/vacillant/agonisant/vaincu`. `computeBossState(row)` returns the full `BossState` view-model. Victory (`defeated`) sets `defeated_at`, awards `targetDays` coins, offers "viser plus loin (+90)" keeping `clean_since`. No XP created by boss (avoids double-count — XP already paid via `break` habit logs). Victory celebration overlay (`victory-pop` + CSS confetti) fires client-side on `false→true` transition.
- **SOS flow**: global FAB `SosButton` + inline per-`BossPanel`; opens `SosSheet` (bottom sheet) with 3 tiles — Respirer / Se distraire / Se motiver — footer "Finalement, j'ai cédé…" (→ `RelapseFlow`) + "Ça va mieux, je ferme". State via `sos.svelte.ts`.
- **Breathing state machine**: `BreathingExercise.svelte` — `idle→inhale→holdIn→exhale→holdOut→…→done`, `requestAnimationFrame` + `performance.now()` (anti-drift), default 5s/5s (6 resp/min), presets 1/3/5 min, haptics via `navigator.vibrate`, reduced-motion fallback to numeric countdown. A5 §5.3 code verbatim.
- **Distraction game**: `BubbleGame.svelte` — "Souffle de calme", tap bubbles, 60s OR 30 pops, no-fail, no assets, rAF-driven. A5 §6.
- **Trigger trends**: `src/lib/server/triggerStats.ts` `getTriggerStats(db, targetId, days=30)` (SQL aggregations by trigger/hour/day, avg craving, gave-in rate). `TriggerTrends.svelte` renders SVG-inline bars + sparklines, no chart lib. A5 §7.
- **Relapse handling** **[RESOLVED R14]**: `RelapseFlow.svelte` machine `intro→freeze?→confirm→done`, bienveillant, never red/shame. `POST /api/addictions/[id]/relapse` calls `db.relapse(id, today, useFreeze)`: freeze keeps `clean_since`, else resets to today; `best_streak_days` never decreases; logs a neutral `trigger_journal` row with `gave_in=1`.
- **FRENCH microcopy**: all in `wellnessCopy.ts` (`SOS`, `MOTIVATION`, `RELAPSE`) + `healthTimelines.ts` (per-kind frises) + `content/fr.ts` (`RELAPSE_TOASTS`, `DONE_TOASTS`, `COMMON_TRIGGERS`). Paste verbatim from A5 §3, §4.4, §8.3.

---

## 11. PWA

- **Manifest + vite config**: `vite.config.ts` paste A6 §1 verbatim — `SvelteKitPWA({ strategies:'injectManifest', srcDir:'src', filename:'service-worker.ts', registerType:'prompt', ... })`, manifest (`name:'HabitQuest'`, FR description, `theme_color:'#0f172a'`, `background_color:'#0b1120'`, `display:'standalone'`, icons any+maskable, shortcuts Aujourd'hui + SOS). **[RESOLVED R1]** `svelte.config.js` sets `kit.serviceWorker.register:false` + `adapter:adapter({out:'build',precompress:true})` + `csrf.checkOrigin:true`. `app.html` head: theme-color, apple-touch-icon, mask-icon (A6 §1.3).
- **Icons + generation script**: `static/icons/*` (8 files per A6 §2.1), source `assets/logo-source.svg` (A6 §2.2), generator `scripts/generate-icons.ts` using `sharp` (A6 §2.3, Windows-friendly, `npm run icons`). **Generated icons are committed** so prod builds don't require sharp.
- **Service worker** `src/service-worker.ts`: A6 §1.4 verbatim — `precacheAndRoute(self.__WB_MANIFEST)`, NavigationRoute NetworkFirst (fallback shell, denylist `/api/`,`/login`), GET `/api/**` NetworkFirst (`api-cache`), images/fonts CacheFirst, `sync`/`message` flush relay, `push` + `notificationclick` (FR payloads), `SKIP_WAITING`.
- **web-push + daily reminder**: `src/lib/server/push.ts` (A6 §3.3 — `setVapidDetails`, `saveSubscription`, `removeSubscription`, `sendToAll` pruning 404/410), endpoints `/api/push/{vapid,subscribe,unsubscribe,test}`, client `src/lib/client/push.ts` (`enablePush`/`disablePush`, user-gesture only). **[RESOLVED R8]** Daily reminder = in-process `node-cron` started in the `init` hook (§6.2) at `PUSH_TIME` (default 20:00), payload from `src/lib/server/reminder.ts buildDailyReminder()` (bienveillant FR copy, counts unlogged habits). External-cron fallback (`/api/cron/daily` + `CRON_SECRET`) inert unless `DISABLE_CRON=1`. `PwaUpdater.svelte` (A6 §1.5) shows FR update toast.

---

## 12. Deployment

Paste A6 §5 (README) deployment section verbatim. Summary:

- **`.env.example`** (A6 §4.1): `VAPID_PUBLIC/PRIVATE/SUBJECT`, `APP_PASSWORD`, `SESSION_SECRET`, `ORIGIN`, `PORT`, `HOST`, `PUSH_TIME`, `DISABLE_CRON`, `CRON_SECRET`, `DB_PATH`. Loader `src/lib/server/env.ts` (A6 §4.2) reads `$env/dynamic/private` at runtime, fails fast in FR on missing required vars.
- **Run**: `npm run build` → `HOST=127.0.0.1 PORT=3000 ORIGIN=https://habitquest.example.com node build`.
- **Caddyfile**:
  ```
  habitquest.example.com {
      encode zstd gzip
      reverse_proxy 127.0.0.1:3000
  }
  ```
- **nginx**: TLS server block proxying `127.0.0.1:3000` with `X-Forwarded-Proto $scheme` + upgrade headers, port-80 → 443 redirect (A6 §5 Option B). **`ORIGIN` must exactly match the HTTPS URL** (adapter-node CSRF).
- **systemd** `/etc/systemd/system/habitquest.service`: `Type=simple`, `WorkingDirectory=/opt/habitquest`, `EnvironmentFile=/opt/habitquest/.env`, `Environment=HOST=127.0.0.1 PORT=3000`, `ExecStart=/usr/bin/node build`, `Restart=always`, `User=habitquest`.
- **SQLite persistence**: DB at `data/habitquest.db` (gitignored), on a persistent disk in prod, `DB_PATH` overridable, backed up regularly, never committed.

---

## 13. Demo seed spec (exact inserts)

`scripts/seed.ts` (`npm run seed`) — paste A6 §7.2 verbatim, with these resolved adjustments to match the final schema:

- **Idempotent transaction**: deletes children-first then re-seeds; dates relative to `today` via `daysAgo(n)`, weekly period via `isoWeek()`.
- `user_state`: `total_xp=9200, coins=640, prestige=0, freezes=2, last_active=today, created_at=daysAgo(73)` (lands ~L13).
- **6 habits** (eau/sport/lecture/méditation/sucre-break/coucher), ~30 days of `habit_logs` engineering a 30-day streak (eau), 8-day (sport), 14-day (lecture), freeze-protected gap with a `skipped` row (méditation), a `relapsed` row at `daysAgo(11)` (sucre), irregular (coucher).
- **2 `addiction_targets`** — **[RESOLVED R13]** include `target_streak_days` and `kind`: Cigarette `(clean_since=daysAgo(73), money_per_day=12.5, best=73, target_streak_days=90, kind='tabac', icon='🚬')`, Sucre `(daysAgo(11), 4.0, best=41, target_streak_days=60, kind='sucre', icon='🍩')`.
- **5 quests** — **[RESOLVED R6]** add `key` + `kind` columns to each insert (e.g. daily `key='d_build_n', kind='build'`, weekly `key='w_clean_days', kind='clean'`); `period` = `today` (daily) / `isoWeek()` (weekly).
- **9 achievements** seeded (subset unlocked with `unlocked_at`), **5 rewards** (cosmetic+real, one claimed), **5 trigger_journal** entries (FR triggers, mix gave_in). All FR copy exactly as A6 §7.1 tables.

Seed insert statements must reference the final column names: quests insert includes `(scope, kind, key, description, target, progress, reward_xp, reward_coins, period, completed)`; addiction_targets insert includes `(id, name, clean_since, money_per_day, best_streak_days, target_streak_days, kind, icon)`.

---

## 14. BUILD ORDER CHECKLIST (mapped to brief section 9, steps 1–9)

Each step lists the concrete files it creates/touches and its verification gate. Do not advance until the gate passes.

**Step 1 — Setup (scaffold runs).**
Touches: `package.json` (add `node-cron`, `@types/node-cron`; run `npm install`), `svelte.config.js` (adapter-node, `serviceWorker.register:false`, `csrf.checkOrigin`), `vite.config.ts` (SvelteKitPWA injectManifest + manifest), `tailwind.config.js`, `postcss.config.js`, `tsconfig.json` (strict), `src/app.html` (`class="dark"` + PWA head), `src/app.css` (tokens), `src/app.d.ts`, `.gitignore`, `.env.example`.
**Verify**: `npm run check` (no TS errors) → `npm run dev` boots at `localhost:5173` and renders a blank dark shell.

**Step 2 — Data layer.**
Creates: `src/lib/types.ts`, `src/lib/server/migrations.ts`, `src/lib/server/db.ts`, `src/lib/server/streaks.ts`, `src/lib/config/progression.ts`.
**Verify**: `npm run check` → write a throwaway `node -e`/`tsx` call to `initDb()` and confirm `data/habitquest.db` is created with all tables (`SELECT name FROM sqlite_master`) and `user_state` row id=1 exists.

**Step 3 — Main loop (habit CRUD + Aujourd'hui).**
Creates: `src/lib/server/progression.ts` (logHabit), `src/routes/api/habits/+server.ts`, `habits/[id]/+server.ts`, `habits/[id]/log/+server.ts`, `src/lib/client/api.ts`, `src/lib/client/clock.ts`, `src/lib/components/habits/HabitRow.svelte`, `HabitForm.svelte`, `src/routes/+page.server.ts`, `+page.svelte`, `src/lib/stores/gameState.svelte.ts`, `src/lib/server/auth.ts`, `src/hooks.server.ts` (guard only, no cron yet), `src/routes/login/+page.svelte`, `api/auth/*`.
**Verify**: `npm run check` → `dev`: log in, create a habit, one-tap validate it, confirm XP/coins move and the log persists (re-tap is idempotent, no double XP).

**Step 4 — Progression engine + dashboard.**
Creates/touches: `src/lib/config/shop.ts` (COIN_ECONOMY), `src/lib/stores/celebration.svelte.ts`, `src/lib/components/game/*` (AvatarCard/XpBar/LevelBadge/CoinPill/StreakFlame), `AppHeader.svelte`, `BottomNav.svelte`, `OverlayHost.svelte`/`ToastHost.svelte`/`LevelUpOverlay.svelte`, `src/lib/server/db.ts` level-event fns, `src/routes/api/sync/state/+server.ts`.
**Verify**: `npm run check` → `dev`: validating enough habits triggers a level-up overlay; header XP bar + coin pill animate; streak flame reflects consecutive days.

**Step 5 — Quests + achievements.**
Creates: `src/lib/config/types.ts`, `achievements.ts`, `quests.ts`, `src/lib/server/quests.ts` (ensureQuests + progress), `src/lib/server/achievements.ts` (seed + check), `src/lib/components/quests/QuestList.svelte`/`QuestCard.svelte`, `api/quests/[id]/claim/+server.ts`.
**Verify**: `npm run check` → `dev`: dashboard `load()` generates today's/this-week's quests deterministically (reload = same set); validating habits advances matching quests; claiming a completed quest pays reward once; an achievement unlocks and toasts.

**Step 6 — Avatar + shop.**
Creates: `src/lib/config/avatar.ts`, `src/lib/components/shop/ShopGrid.svelte`/`RewardCard.svelte`, `src/routes/boutique/+page.server.ts`/`+page.svelte`, `api/rewards/*`, `ConfirmDialog.svelte`, `SegmentedControl.svelte`, `EmptyState.svelte`. Touches AvatarCard to consume `avatarAppearance()`.
**Verify**: `npm run check` → `dev`: shop lists cosmetics (level-gated) + seeded real rewards; buying a cosmetic spends coins, records ownership, equips; avatar stage reflects level.

**Step 7 — Addiction module.**
Creates: `src/lib/config/boss.ts`, `healthTimelines.ts`, `wellnessCopy.ts`, `src/lib/server/boss.ts`, `triggerStats.ts`, all `src/lib/components/boss/*` + `sos/*`, `src/lib/stores/sos.svelte.ts`, `src/routes/addictions/+page.server.ts`/`+page.svelte`, `api/addictions/*` (incl. clean-date, relapse), `api/triggers/+server.ts`, `src/lib/actions/swipeable.ts`.
**Verify**: `npm run check` → `dev`: create a boss, clean days reduce HP, money-saved counts up, health timeline marks reached milestones, SOS sheet opens (breathing animates, bubble game runs), relapse with freeze keeps streak / without resets gently and best never drops, trigger trends render.

**Step 8 — PWA finishing + Web Push.**
Creates: `src/service-worker.ts`, `src/lib/server/push.ts`, `reminder.ts`, `env.ts`, `src/lib/client/push.ts`, `api/push/{vapid,subscribe,unsubscribe,test}/+server.ts`, `api/cron/daily/+server.ts`, `src/lib/components/feedback/PwaUpdater.svelte`, `src/lib/client/outbox.ts`, `src/lib/stores/sync.svelte.ts`, `assets/logo-source.svg`, `scripts/generate-icons.ts`, `static/icons/*`. Touches `hooks.server.ts` (add `init` cron hook), `+layout.svelte` (PwaUpdater + sync listeners).
**Verify**: `npm run icons` produces all 8 icons → `npm run build` succeeds (SW + precache manifest emitted) → `npm run preview`: install PWA, toggle "Rappels quotidiens" (permission prompt), `POST /api/push/test` delivers a notification; go offline, validate a habit, return online → outbox flushes and reconciles.

**Step 9 — README + deployment + demo data.**
Creates: `scripts/seed.ts`, `README.md`, `CLAUDE.md`. Touches `.env.example` final.
**Verify**: `npm run seed` populates a believable demo profile (≈L13, streaks/bosses/quests/achievements) → `npm run build && node build` with a real `.env` serves over the configured `ORIGIN`; follow README Caddy/nginx + systemd steps on the target box and confirm HTTPS + push + PWA install all work end-to-end.

---

Relevant absolute paths the implementer will create are rooted at `C:\Users\micha\OneDrive - Bilans et budgets\Documents\GitHub\2ndLife\` per the file tree in §1. The existing `package.json` already pins all versions in §0 except `node-cron`/`@types/node-cron` (add them) and matches every other dependency this blueprint requires.