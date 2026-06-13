The repo is essentially empty (only `.claude` and `.git`). This is a greenfield design task. I have everything I need from the spec. I'll produce the design artifact now.

I'm designing the **HTTP API contracts + client state + offline-first sync** subsystem. Here is the complete, implementation-ready artifact.

---

# HabitQuest — Subsystem Design: API Contracts, Client State & Offline-First Sync

This artifact assumes the DB layer (`src/lib/server/db.ts`), progression engine (`src/lib/server/progression.ts`), quests (`quests.ts`) and achievements (`achievements.ts`) exist. Where I reference a `db.*` function I give its exact signature; the DB engineer must provide these (they follow naturally from §4 schema). All user-facing strings are French. All money/XP numbers obey §5 config.

## 0. Conventions & shared types

### 0.1 Stated defaults (where brief is silent)

- **Dates**: server is source of truth for "today". A day = local calendar day in a fixed timezone `Europe/Paris` (single user). `date` strings are `'YYYY-MM-DD'`. A helper `today(): string` lives in `src/lib/server/clock.ts` and uses `Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' })` (fr-CA yields ISO `YYYY-MM-DD`). The client may **propose** a date for offline logs; the server **clamps** it (see §4.6).
- **Auth**: one `APP_PASSWORD`. Session cookie is an HMAC-signed token, no DB session table, no JWT lib.
- **Response envelope**: every API route returns JSON. Success = `2xx` with the documented shape. Error = non-2xx with `{ error: { code: string; message: string } }` where `message` is French (it may be shown in a toast). Codes are stable English identifiers.
- **CSRF**: SvelteKit's `csrf.checkOrigin` stays enabled (default). All mutating API calls are same-origin `fetch`, so this is sufficient; the session cookie is `SameSite=Lax`.
- **Content-Type**: requests send `application/json`; responses are `application/json`. The one exception is `/api/auth/login` which also accepts a form post (progressive enhancement of `/login`).
- **IDs**: integers from SQLite. Offline-created logs carry a **client UUID** (`clientId`) for outbox idempotency tracking; server idempotency is enforced by `UNIQUE(habit_id, date)`.

### 0.2 Shared TypeScript types — `src/lib/types.ts`

```typescript
// ---- Domain row mirrors (subset relevant to API) ----
export type HabitType = 'build' | 'break';
export type LogStatus = 'done' | 'skipped' | 'relapsed';
export type QuestScope = 'daily' | 'weekly';
export type RewardKind = 'cosmetic' | 'real';

export interface UserState {
  id: 1;
  total_xp: number;
  coins: number;
  prestige: number;
  freezes: number;
  last_active: string | null;
  created_at: string;
}

export interface Habit {
  id: number;
  name: string;
  type: HabitType;
  category: string | null;
  difficulty: number; // 1..3
  icon: string | null;
  archived: 0 | 1;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  date: string;        // YYYY-MM-DD
  status: LogStatus;
  note: string | null;
}

export interface Quest {
  id: number;
  scope: QuestScope;
  description: string;
  target: number;
  progress: number;
  reward_xp: number;
  reward_coins: number;
  period: string;
  completed: 0 | 1;
}

export interface Achievement {
  key: string;
  name: string;
  description: string | null;
  unlocked_at: string | null;
}

export interface Reward {
  id: number;
  name: string;
  cost: number;
  kind: RewardKind;
  claimed_at: string | null;
}

export interface AddictionTarget {
  id: number;
  name: string;
  clean_since: string | null;
  money_per_day: number;
  best_streak_days: number;
}

export interface TriggerEntry {
  id: number;
  target_id: number | null;
  date: string;
  trigger: string | null;
  craving: number | null; // 1..10
  gave_in: 0 | 1;
  note: string | null;
}

// ---- Derived / computed view models ----
export interface LevelInfo {
  level: number;
  intoLevel: number;
  needed: number;
  totalXp: number;
  prestige: number;
  canPrestige: boolean; // level >= PRESTIGE_LEVEL
}

/** What an XP-granting action returns so the client can celebrate. */
export interface ProgressDelta {
  xpGained: number;
  coinsGained: number;
  totalXp: number;
  coins: number;
  freezes: number;
  leveledUp: boolean;
  newLevel: number | null;       // null if no level up
  level: LevelInfo;              // recomputed authoritative level info
  streakDays: number;           // streak for the affected habit AFTER the action
  unlockedAchievements: Achievement[]; // newly unlocked this action
  completedQuests: Quest[];     // quests that flipped to completed this action
}

export interface ApiError {
  error: { code: string; message: string };
}
```

### 0.3 Required DB function signatures (the DB layer must export these from `src/lib/server/db.ts`)

These are the functions the API routes call. Listed once here; per-route I name which is used.

```typescript
// user_state
export function getUserState(): UserState;                      // always returns the single row (seeds if missing)
export function setUserState(patch: Partial<Omit<UserState,'id'|'created_at'>>): UserState;
export function touchLastActive(date: string): void;

// habits
export function listHabits(opts?: { includeArchived?: boolean }): Habit[];
export function getHabit(id: number): Habit | undefined;
export function createHabit(input: { name: string; type: HabitType; category?: string|null; difficulty?: number; icon?: string|null }): Habit;
export function updateHabit(id: number, patch: Partial<Pick<Habit,'name'|'category'|'difficulty'|'icon'|'archived'>>): Habit;
export function archiveHabit(id: number): Habit; // sets archived=1

// habit logs (idempotent insert)
export function getLog(habitId: number, date: string): HabitLog | undefined;
/** INSERT ... ON CONFLICT(habit_id,date) DO NOTHING; returns {row, inserted}. */
export function insertLog(input: { habitId: number; date: string; status: LogStatus; note?: string|null }):
  { row: HabitLog; inserted: boolean };
export function deleteLog(habitId: number, date: string): boolean; // returns true if a row was deleted
export function logsForDate(date: string): HabitLog[];
export function logsForHabit(habitId: number, since?: string): HabitLog[];

// streaks (computed from habit_logs)
export function computeHabitStreak(habitId: number, asOf: string): number; // consecutive 'done' days ending at asOf
export function computeGlobalStreak(asOf: string): number;

// quests
export function listQuests(periods: { daily: string; weekly: string }): Quest[];
export function getQuest(id: number): Quest | undefined;
export function claimQuest(id: number): { quest: Quest; alreadyClaimed: boolean };

// rewards
export function listRewards(): Reward[];
export function getReward(id: number): Reward | undefined;
export function createReward(input: { name: string; cost: number; kind: RewardKind }): Reward;
export function deleteReward(id: number): boolean;
export function claimReward(id: number, at: string): { reward: Reward; alreadyClaimed: boolean };

// addiction targets
export function listTargets(): AddictionTarget[];
export function getTarget(id: number): AddictionTarget | undefined;
export function createTarget(input: { name: string; clean_since?: string|null; money_per_day?: number }): AddictionTarget;
export function updateTarget(id: number, patch: Partial<Pick<AddictionTarget,'name'|'clean_since'|'money_per_day'|'best_streak_days'>>): AddictionTarget;
export function deleteTarget(id: number): boolean;

// trigger journal
export function listTriggers(targetId?: number): TriggerEntry[];
export function addTrigger(input: { target_id?: number|null; trigger?: string|null; craving?: number|null; gave_in?: boolean; note?: string|null }): TriggerEntry;

// push subscriptions  (new table — see §1.10)
export function savePushSubscription(sub: PushSubscriptionJSON): void;
export function deletePushSubscription(endpoint: string): void;
export function listPushSubscriptions(): PushSubscriptionJSON[];
```

> **New table required** (not in §4) — add a migration:
> ```sql
> CREATE TABLE push_subscriptions (
>   endpoint   TEXT PRIMARY KEY,
>   p256dh     TEXT NOT NULL,
>   auth       TEXT NOT NULL,
>   created_at TEXT NOT NULL DEFAULT (datetime('now'))
> );
> ```
> And a settings table for §1.9 (the brief has no settings table; settings are simple key/values):
> ```sql
> CREATE TABLE settings (
>   key   TEXT PRIMARY KEY,
>   value TEXT NOT NULL
> );
> ```
> DB layer adds `getSetting(key): string|undefined`, `setSetting(key, value): void`, `getAllSettings(): Record<string,string>`.

---

## 1. API routes (`src/routes/api/**`)

Every route file exports SvelteKit handlers (`GET`/`POST`/`PUT`/`DELETE`) typed `RequestHandler`. The orchestrating server logic (XP grant, streak recompute, quest progress, achievement check) is centralized in **`src/lib/server/engine.ts`** so routes stay thin. The single most important orchestration function:

```typescript
// src/lib/server/engine.ts
import type { ProgressDelta, LogStatus } from '$lib/types';

/**
 * Applies a habit log for `date`, granting XP/coins with streak bonus,
 * advancing quests and unlocking achievements, all inside ONE sqlite
 * transaction. Idempotent: if (habitId,date) already logged, returns a
 * ProgressDelta with xpGained=0 and the existing state (no double grant).
 */
export function applyHabitLog(habitId: number, date: string, status: LogStatus, note?: string|null): ProgressDelta;

/** Reverses a same-day log (un-tap). Removes the log and the XP/coins it granted
 *  ONLY if removable (see §4.7). Returns the new authoritative delta-ish state. */
export function reverseHabitLog(habitId: number, date: string): ProgressDelta;

/** Sets/clears clean_since for a target; updates best_streak_days. */
export function setCleanDate(targetId: number, cleanSince: string | null): AddictionTarget;

/** Records a relapse for a target: writes a 'relapsed' habit_log-equivalent
 *  trigger entry (gave_in=1), freezes best_streak_days, resets clean_since to today.
 *  Returns target + a gentle French message. Never punitive. */
export function recordRelapse(targetId: number, note?: string|null): { target: AddictionTarget; message: string };
```

`applyHabitLog` is what makes optimistic client updates safe: the server returns the **authoritative** `ProgressDelta`, so the client reconciles after its optimistic guess.

### Route index (overview)

| Method | Path | Body | Response | Server fn |
|---|---|---|---|---|
| POST | `/api/auth/login` | `{ password }` | `{ ok: true }` + Set-Cookie | (hooks helper) |
| POST | `/api/auth/logout` | — | `{ ok: true }` + clear cookie | — |
| POST | `/api/habits` | `CreateHabitBody` | `{ habit: Habit }` | `createHabit` |
| GET | `/api/habits` | — | `{ habits: Habit[] }` | `listHabits` |
| PUT | `/api/habits/[id]` | `UpdateHabitBody` | `{ habit: Habit }` | `updateHabit` |
| DELETE | `/api/habits/[id]` | — | `{ habit: Habit }` (archived) | `archiveHabit` |
| POST | `/api/habits/[id]/log` | `LogBody` | `{ delta: ProgressDelta; log: HabitLog }` | `applyHabitLog` |
| DELETE | `/api/habits/[id]/log` | `{ date }` | `{ delta: ProgressDelta }` | `reverseHabitLog` |
| POST | `/api/quests/[id]/claim` | — | `{ delta: ProgressDelta; quest: Quest }` | `claimQuest` + engine |
| GET | `/api/rewards` | — | `{ rewards: Reward[]; coins: number }` | `listRewards` |
| POST | `/api/rewards` | `CreateRewardBody` | `{ reward: Reward }` | `createReward` |
| DELETE | `/api/rewards/[id]` | — | `{ ok: true }` | `deleteReward` |
| POST | `/api/rewards/[id]/claim` | — | `{ reward; coins; delta? }` | engine + `claimReward` |
| GET | `/api/addictions` | — | `{ targets: AddictionTargetView[] }` | `listTargets` + compute |
| POST | `/api/addictions` | `CreateTargetBody` | `{ target }` | `createTarget` |
| PUT | `/api/addictions/[id]` | `UpdateTargetBody` | `{ target }` | `updateTarget` |
| DELETE | `/api/addictions/[id]` | — | `{ ok: true }` | `deleteTarget` |
| POST | `/api/addictions/[id]/clean-date` | `{ cleanSince }` | `{ target }` | `setCleanDate` |
| POST | `/api/addictions/[id]/relapse` | `{ note? }` | `{ target; message }` | `recordRelapse` |
| GET | `/api/triggers` | `?targetId=` | `{ entries: TriggerEntry[]; trends }` | `listTriggers` |
| POST | `/api/triggers` | `AddTriggerBody` | `{ entry: TriggerEntry }` | `addTrigger` |
| POST | `/api/push/subscribe` | `PushSubscriptionJSON` | `{ ok: true }` | `savePushSubscription` |
| POST | `/api/push/unsubscribe` | `{ endpoint }` | `{ ok: true }` | `deletePushSubscription` |
| GET | `/api/settings` | — | `{ settings: SettingsView }` | `getAllSettings` |
| PUT | `/api/settings` | `Partial<SettingsView>` | `{ settings: SettingsView }` | `setSetting` |
| GET | `/api/sync/state` | — | `{ userState; level; today: TodayView }` | aggregate |

> **Dashboard**: served by `+page.server.ts` `load()` (NOT an API route) — see §1.13. `/api/sync/state` exists only as the lightweight endpoint the **service worker / outbox** calls after replaying offline logs to refresh client state without a full navigation.

---

### 1.1 `POST /api/auth/login` and `POST /api/auth/logout`

`src/routes/api/auth/login/+server.ts`

- **Request**: `{ password: string }` (JSON) — also tolerates `application/x-www-form-urlencoded` with field `password` so `/login`'s `<form method="POST" use:enhance>` works without JS.
- **Logic**: constant-time compare `password` to `env.APP_PASSWORD`. On match, `cookies.set('hq_session', signSession(), { ... })` (see §2.3). On mismatch return `401`.
- **Response**: `200 { ok: true }` or `401 { error: { code: 'BAD_PASSWORD', message: 'Mot de passe incorrect.' } }`.
- **Server fn**: none (uses `signSession` from `src/lib/server/auth.ts`).
- **Rate limit**: an in-memory counter in `auth.ts` — max 5 failures / 60 s / IP → `429 { code: 'TOO_MANY', message: 'Trop de tentatives, réessaie dans une minute.' }`.

`src/routes/api/auth/logout/+server.ts`

- **Request**: none. **Response**: `200 { ok: true }`, `cookies.delete('hq_session', { path: '/' })`.

> Both `/api/auth/**` paths are in the hooks allowlist (§2.2).

### 1.2 Habits CRUD — `src/routes/api/habits/+server.ts` and `.../[id]/+server.ts`

```typescript
interface CreateHabitBody {
  name: string;                       // required, 1..60 chars
  type: HabitType;                    // required
  category?: string | null;           // <= 40 chars
  difficulty?: number;                // 1..3, default 1
  icon?: string | null;               // emoji or short key
}
interface UpdateHabitBody {
  name?: string;
  category?: string | null;
  difficulty?: number;                // 1..3
  icon?: string | null;
  archived?: boolean;                 // true => archive (same as DELETE)
}
```

- `POST /api/habits` → validate (Zod schema `createHabitSchema`), `createHabit`, return `201 { habit }`.
- `GET /api/habits?archived=1` → `listHabits({ includeArchived })`, return `{ habits }`. (Primarily used by the habits-management screen; the dashboard gets habits via its own `load()`.)
- `PUT /api/habits/[id]` → 404 if missing, else `updateHabit`, return `{ habit }`.
- `DELETE /api/habits/[id]` → `archiveHabit` (soft delete, preserves logs/streak history), return `{ habit }`.
- **Validation errors** → `400 { code: 'VALIDATION', message: <French>, }`. Provide French field messages e.g. `'Le nom est obligatoire.'`, `'La difficulté doit être entre 1 et 3.'`.

### 1.3 Habit log / unlog — `src/routes/api/habits/[id]/log/+server.ts`

This is **the hot path** (one-tap validation) and the only route in the offline outbox.

```typescript
interface LogBody {
  date?: string;            // 'YYYY-MM-DD'; default = server today. Offline logs send their captured date.
  status?: LogStatus;       // default 'done'
  note?: string | null;
  clientId?: string;        // UUID from outbox; echoed back for client reconciliation, not stored
}
```

`POST` logic:
1. Parse body. `const date = clampDate(body.date)` (see §4.6) — refuse future dates, allow today and up to `MAX_BACKFILL_DAYS = 2` in the past (offline tolerance).
2. `getHabit(id)` → 404 `{ code: 'NOT_FOUND', message: 'Habitude introuvable.' }` if missing or archived.
3. `const delta = applyHabitLog(id, date, status, note)` — idempotent.
4. `touchLastActive(date)`.
5. Respond `200 { delta, log }` where `log = getLog(id, date)!`. **Always 200 even if it was a duplicate** (idempotent replay must succeed); `delta.xpGained` is 0 on duplicate. Include `clientId` echo in the envelope: `{ delta, log, clientId }`.

`DELETE` logic (un-tap, undo a same-day mistake):
- Body `{ date?: string }` default today.
- `reverseHabitLog(id, date)`; only same-day, only if no downstream irreversible grant consumed it (see §4.7). If not reversible → `409 { code: 'NOT_REVERSIBLE', message: 'Cette validation ne peut plus être annulée.' }`.
- Respond `200 { delta }`.

> **Why this route returns the full `ProgressDelta`**: the client applies an optimistic delta on tap (XP_PER_HABIT × difficulty × streak guess), then replaces its store with the authoritative `delta` from the response. This guarantees the displayed level/XP/coins/streak match the server even if the client's streak estimate was wrong.

### 1.4 Quest claim — `src/routes/api/quests/[id]/claim/+server.ts`

- **Request**: none.
- **Logic**: `getQuest(id)` → 404 if missing. Inside a transaction: if `completed === 1` and not yet claimed → grant `reward_xp`/`reward_coins` via engine (so it flows through level-up + achievement checks), mark claimed. `claimQuest` returns `alreadyClaimed`; if so respond `409 { code: 'ALREADY_CLAIMED', message: 'Quête déjà réclamée.' }`. If `completed === 0` → `409 { code: 'QUEST_INCOMPLETE', message: 'Cette quête n\'est pas encore terminée.' }`.
- **Response**: `200 { delta: ProgressDelta, quest: Quest }`.

> Quest **progress** is advanced as a side effect of `applyHabitLog` (engine increments matching daily/weekly quests). There is no "increment quest" route. Quests are **generated/rotated** lazily inside the dashboard `load()` (§1.13) by calling `ensureQuestsForPeriod(today, isoWeek)` in `quests.ts`.

### 1.5 Rewards — `src/routes/api/rewards/+server.ts`, `.../[id]/+server.ts`, `.../[id]/claim/+server.ts`

```typescript
interface CreateRewardBody { name: string; cost: number; kind: RewardKind; } // cost >= 1
```

- `GET /api/rewards` → `{ rewards, coins: getUserState().coins }`.
- `POST /api/rewards` → `createReward`, `201 { reward }`.
- `DELETE /api/rewards/[id]` → `deleteReward`; `200 { ok: true }` (404 if missing).
- `POST /api/rewards/[id]/claim` → transaction:
  - `getReward` (404), if `claimed_at != null` and `kind==='real'` → already consumed → `409 { code: 'ALREADY_CLAIMED', message: 'Récompense déjà utilisée.' }`. (Cosmetics are also one-shot here; if you later want repeatable cosmetics, that's a kind variant — out of scope.)
  - Check `coins >= cost`; else `409 { code: 'NOT_ENOUGH_COINS', message: 'Pas assez de pièces.' }`.
  - `setUserState({ coins: coins - cost })`, `claimReward(id, today())`.
  - Cosmetic claim may unlock an achievement → run engine achievement check.
  - **Response**: `200 { reward, coins, delta? }` (`delta` present only if an achievement/level event fired).

### 1.6 Addiction targets CRUD — `src/routes/api/addictions/+server.ts`, `.../[id]/+server.ts`

```typescript
interface CreateTargetBody { name: string; cleanSince?: string | null; moneyPerDay?: number; }
interface UpdateTargetBody { name?: string; cleanSince?: string | null; moneyPerDay?: number; }
```

`GET /api/addictions` returns a **view model** (server computes derived fields so the UI is dumb):

```typescript
interface AddictionTargetView extends AddictionTarget {
  cleanDays: number;          // days since clean_since (0 if null), asOf server today
  moneySaved: number;         // cleanDays * money_per_day, rounded 2dp
  bossHpPct: number;          // 0..100, see §1.6 boss model
  nextMilestone: { days: number; label: string } | null; // French
  health: HealthMilestone[];  // recovery timeline, see content arrays §1.6.1
}
```

- Boss model (stated default): boss starts at `BOSS_MAX_HP = 100`. Each clean day deals `BOSS_DMG_PER_DAY = 1` damage capped at 100; `bossHpPct = Math.max(0, 100 - cleanDays * BOSS_DMG_PER_DAY)`. At 0 HP the boss is "vaincu". These three constants go in `src/lib/config/progression.ts` under a `BOSS` sub-object (keeps all balancing centralized per §5).
- `POST` → `createTarget`, `201`. `PUT [id]` → `updateTarget`. `DELETE [id]` → `deleteTarget` (cascades trigger_journal rows; do it in a transaction).

#### 1.6.1 Health-recovery content (ready-to-paste) — `src/lib/config/recovery.ts`

Generic, encouraging, non-medical French copy keyed loosely (the brief: "garde ces messages génériques et encourageants"). The view picks milestones with `days <= cleanDays` as "atteint".

```typescript
export interface HealthMilestone { days: number; label: string; }

/** Frise de récupération générique (non médicale, encourageante). */
export const HEALTH_TIMELINE: HealthMilestone[] = [
  { days: 1,   label: 'Premier jour franchi : ton corps commence déjà à se rééquilibrer.' },
  { days: 2,   label: '48 h : le plus dur du démarrage est souvent derrière toi.' },
  { days: 3,   label: '3 jours : ton énergie commence à remonter.' },
  { days: 7,   label: 'Une semaine clean. Tu as prouvé que tu pouvais tenir.' },
  { days: 14,  label: 'Deux semaines : tes nouvelles routines prennent racine.' },
  { days: 30,  label: 'Un mois ! Une étape majeure. Sois fier de toi.' },
  { days: 60,  label: 'Deux mois : ce qui semblait impossible devient ton quotidien.' },
  { days: 90,  label: 'Trois mois clean. Une vraie transformation est en cours.' },
  { days: 180, label: 'Six mois : tu as construit une habitude solide et durable.' },
  { days: 365, label: 'Un an ! Un accomplissement immense. Continue, une journée à la fois.' }
];

/** Paliers “célébrés” du compteur clean (toasts/confettis). */
export const CLEAN_MILESTONES: number[] = [1, 3, 7, 14, 30, 60, 90, 180, 365];
```

### 1.7 Clean-date set / relapse

`POST /api/addictions/[id]/clean-date` — `src/routes/api/addictions/[id]/clean-date/+server.ts`
- Body `{ cleanSince: string | null }` (YYYY-MM-DD or null to clear). Validate not in future.
- `setCleanDate(id, cleanSince)` (updates `best_streak_days` if the implied new streak exceeds it). Response `{ target: AddictionTargetView }`.

`POST /api/addictions/[id]/relapse` — `src/routes/api/addictions/[id]/relapse/+server.ts`
- Body `{ note?: string|null }`. **Bienveillant (§7)**: this is neutral data, never a punishment.
- `recordRelapse(id, note)`:
  - Freeze current streak into `best_streak_days` if larger.
  - Set `clean_since = today()` (repart à zéro, doucement).
  - Insert a `trigger_journal` row with `gave_in = 1`, `note`.
  - **No XP loss, no level reset.** Return a randomly-picked encouraging message:
    ```typescript
    export const RELAPSE_MESSAGES: string[] = [
      'Une rechute n\'efface pas tes progrès. Ta meilleure série reste un fait : {best} jours.',
      'Repartir, c\'est déjà avancer. On note, on respire, et on continue.',
      'Un mauvais jour ne définit pas ton parcours. Demain est un nouveau départ.',
      'Tu es revenu·e, c\'est ce qui compte. Ta meilleure série : {best} jours.'
    ];
    ```
    `{best}` is interpolated with `best_streak_days`.
- Response `200 { target: AddictionTargetView, message: string }`.

### 1.8 Trigger journal — `src/routes/api/triggers/+server.ts`

```typescript
interface AddTriggerBody {
  targetId?: number | null;
  trigger?: string | null;     // <= 200 chars
  craving?: number | null;     // 1..10
  gaveIn?: boolean;
  note?: string | null;
}
```
- `POST` → `addTrigger`, `201 { entry }`.
- `GET /api/triggers?targetId=` → `{ entries, trends }` where `trends` is a small computed object:
  ```typescript
  interface TriggerTrends {
    count: number;
    avgCraving: number | null;        // mean craving
    gaveInRate: number;               // 0..1
    topTriggers: { trigger: string; count: number }[]; // top 5 by frequency
    last7Days: { date: string; count: number }[];
  }
  ```
  Computed server-side in a `triggerTrends(entries)` helper so the UI just renders.

### 1.9 Settings — `src/routes/api/settings/+server.ts`

```typescript
interface SettingsView {
  theme: 'dark' | 'light';          // default 'dark' (brief: sombre par défaut)
  reminderEnabled: boolean;         // daily push reminder on/off
  reminderTime: string;             // 'HH:MM' local, default '20:00'
  vapidPublicKey: string;           // read-only, echoed from env for client push subscribe
}
```
- `GET` → merges `getAllSettings()` with defaults; injects `vapidPublicKey = env.VAPID_PUBLIC`.
- `PUT` body `Partial<SettingsView>` (ignores `vapidPublicKey`) → validate, `setSetting` per key, return full `SettingsView`. `reminderTime` validated `/^\d{2}:\d{2}$/`.

### 1.10 Push subscribe / unsubscribe — `src/routes/api/push/subscribe/+server.ts`, `.../unsubscribe/+server.ts`

- `POST /api/push/subscribe` — body is the browser `PushSubscription.toJSON()`:
  ```typescript
  interface PushSubscriptionJSON {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    expirationTime?: number | null;
  }
  ```
  → `savePushSubscription(...)` (upsert by endpoint). `200 { ok: true }`.
- `POST /api/push/unsubscribe` — body `{ endpoint: string }` → `deletePushSubscription(endpoint)`. `200 { ok: true }`.

> The actual sending of the daily reminder is a server-side scheduled job (cron/systemd timer hitting an internal script or a `node-cron` started in `hooks.server.ts` on boot) using `web-push` with `env.VAPID_PUBLIC/PRIVATE`. The job iterates `listPushSubscriptions()`; on `410 Gone` it calls `deletePushSubscription`. This is adjacent to this subsystem (notifications); I expose only the subscribe/unsubscribe contracts here.

### 1.11 Sync state — `src/routes/api/sync/state/+server.ts`

The lightweight "rehydrate client" endpoint used after offline replay (§4) and on `visibilitychange`/reconnect.

```typescript
interface TodayView {
  date: string;
  habits: { habit: Habit; log: HabitLog | null; streak: number }[]; // build+break, non-archived
  globalStreak: number;
}
interface SyncStateResponse {
  userState: UserState;
  level: LevelInfo;
  today: TodayView;
  quests: Quest[]; // current daily+weekly
}
```
- `GET` → assembles all of the above by calling `getUserState`, `levelFromXp`, `logsForDate(today)`, `computeHabitStreak`, `listQuests`. Returns `200 SyncStateResponse`. This is the canonical shape the `gameState` store hydrates from (§3).

### 1.12 Error handling helper — `src/lib/server/respond.ts`

```typescript
import { json } from '@sveltejs/kit';
export function ok<T>(data: T, status = 200) { return json(data, { status }); }
export function fail(code: string, message: string, status = 400) {
  return json({ error: { code, message } }, { status });
}
```
All routes use these. Validation uses Zod schemas in `src/lib/server/schemas.ts`; a `parseBody(request, schema)` helper throws a typed error mapped to `fail('VALIDATION', frenchMessage, 400)`.

### 1.13 Which screens use `+page.server.ts load()` vs API `fetch`

| Screen / route | Data source | Why |
|---|---|---|
| `/` (dashboard / "Aujourd'hui") | **`+page.server.ts` `load()`** | First paint must be fully rendered (SSR), no spinner; it also lazily runs `ensureQuestsForPeriod` + `ensureWeeklyFreezeGrant` + achievement re-check. Returns `SyncStateResponse`-shaped data that seeds the `gameState` store. |
| `/habits` (gestion) | **`load()`** for initial list; **API** (`POST/PUT/DELETE /api/habits`) for mutations | List is small; mutations are interactive. |
| `/addictions` (boss + journal) | **`load()`** returns `AddictionTargetView[]` + trigger trends | Heavy computed view models best done server-side once. Mutations (clean-date, relapse, trigger add) via API. |
| `/shop` (boutique) | **`load()`** returns `{ rewards, coins }`; mutations via API | — |
| `/login` | static `+page.svelte`; form posts to `/api/auth/login` | Only public route. |
| SOS / breathing | pure client (no server data) | Animation only; no `load()`. |
| **After offline replay / reconnect** | **API** `GET /api/sync/state` | No navigation; just rehydrate the store. |

> Rule of thumb encoded: **first render of a navigable page → `load()`. Interactive mutation or background rehydrate → `/api/**` fetch.** Habit logging from the dashboard is always an API `POST` (it must work from the installed PWA without navigation and must enqueue offline).

---

## 2. Auth: signed cookie + `hooks.server.ts` guard

### 2.1 Cookie signing — `src/lib/server/auth.ts` (no heavy lib, just `node:crypto`)

```typescript
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'hq_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days (single user, long-lived)

function secret(): string {
  // Reuse APP_PASSWORD as HMAC key material; mix a fixed salt so the raw
  // password is never the literal key. (Single-user app: acceptable.)
  return env.APP_PASSWORD + '::hq-session-v1';
}

/** token = base64url(payload) . base64url(hmac).  payload = `${issuedAt}` */
export function signSession(): string {
  const payload = String(Date.now());
  const p = Buffer.from(payload).toString('base64url');
  const sig = createHmac('sha256', secret()).update(p).digest('base64url');
  return `${p}.${sig}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false;
  const [p, sig] = token.split('.');
  if (!p || !sig) return false;
  const expected = createHmac('sha256', secret()).update(p).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  // expiry check
  const issuedAt = Number(Buffer.from(p, 'base64url').toString('utf8'));
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > MAX_AGE * 1000) return false;
  return true;
}

export const SESSION_COOKIE = COOKIE_NAME;
export const SESSION_MAX_AGE = MAX_AGE;

// constant-time password compare for /api/auth/login
export function passwordMatches(input: string): boolean {
  const expected = env.APP_PASSWORD ?? '';
  const a = Buffer.from(input); const b = Buffer.from(expected);
  // pad to equal length to avoid early-exit length leak
  if (a.length !== b.length) { randomBytes(0); return false; }
  return timingSafeEqual(a, b);
}
```

Cookie set in the login route:
```typescript
cookies.set(SESSION_COOKIE, signSession(), {
  path: '/',
  httpOnly: true,
  sameSite: 'lax',
  secure: !dev,            // dev=false over http://localhost; prod true behind Caddy/nginx HTTPS
  maxAge: SESSION_MAX_AGE
});
```
(`dev` from `$app/environment`.) Because the HMAC key is derived from `APP_PASSWORD`, rotating the password invalidates all sessions — desired.

### 2.2 Allowlist & guard logic — `src/hooks.server.ts`

```typescript
import type { Handle } from '@sveltejs/kit';
import { redirect, error } from '@sveltejs/kit';
import { SESSION_COOKIE, verifySession } from '$lib/server/auth';

// Paths reachable WITHOUT a session.
const PUBLIC_EXACT = new Set<string>([
  '/login',
  '/manifest.webmanifest',
  '/service-worker.js',
  '/sw.js',
  '/favicon.ico',
  '/robots.txt'
]);
// Public prefixes.
const PUBLIC_PREFIX = [
  '/api/auth',        // login / logout
  '/_app/',           // SvelteKit build assets
  '/icons/',          // PWA icons in static
  '/workbox-'         // vite-pwa workbox runtime chunks
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;
  const authed = verifySession(event.cookies.get(SESSION_COOKIE));
  event.locals.authed = authed;

  if (!authed && !isPublic(pathname)) {
    if (pathname.startsWith('/api/')) {
      // APIs return JSON 401, not an HTML redirect (so fetch() / outbox can detect it)
      throw error(401, 'Non authentifié');
    }
    // Pages: redirect to login, preserving intended destination.
    const to = encodeURIComponent(pathname + event.url.search);
    throw redirect(303, `/login?redirectTo=${to}`);
  }

  return resolve(event);
};
```

`src/app.d.ts`:
```typescript
declare global {
  namespace App {
    interface Locals { authed: boolean; }
  }
}
export {};
```

Notes:
- Static files served by adapter-node from `static/` (icons, manifest) are matched by `PUBLIC_PREFIX`/`PUBLIC_EXACT`. SvelteKit's own `_app/immutable/*` assets are under `/_app/`.
- The service worker file name depends on `@vite-pwa/sveltekit` config; with default `registerType` it is served at `/sw.js` (or `/service-worker.js` when `strategies: 'injectManifest'` with `srcDir`). Both are allowlisted; pick one and trim the other to match the chosen vite-pwa strategy (we use `injectManifest` → `service-worker.js`, see §4.8).
- A `401` on an `/api/` call is the signal the client uses to redirect to `/login` (handled by a `fetch` wrapper, §3.4).

### 2.3 Why no DB session table / no JWT lib

Single user, single secret. The HMAC-signed token is self-validating and self-expiring; logout just deletes the cookie. This satisfies "no heavy lib" — only `node:crypto`.

---

## 3. Svelte 5 client state architecture (runes mode)

### 3.1 Allocation of state

| State | Where | Rationale |
|---|---|---|
| Initial page data (habits, targets, rewards, quests, userState) | `+page.server.ts` `load()` → `data` prop | SSR, authoritative first paint. |
| **Shared, cross-page, optimistically-updated game state** (userState + derived LevelInfo, current streaks, quests) | **`gameState` writable store** (`src/lib/stores/gameState.svelte.ts`) | The XP bar / coins / level badge appear in the persistent app shell (header) on every screen and must update instantly after a habit tap regardless of which component triggered it. This is genuine shared cross-component client state → the one justified store. |
| **Toast / celebration events** (level-up, achievement unlocked, quest complete, milestone) | **`celebration` event-bus store** (`src/lib/stores/celebration.svelte.ts`) | Decoupled producers (any API call) and a single consumer (the overlay in the root layout). |
| **Offline outbox status** (pending count, syncing flag, online flag) | **`sync` store** (`src/lib/stores/sync.svelte.ts`) | Shown in the app shell ("3 en attente"), driven by SW/outbox events. |
| Per-component ephemeral UI (form inputs, open/closed modals, breathing animation phase, optimistic "tapped" flag on a row) | **`$state` runes inside the component** | Not shared; no store needed. |
| Derived view values (XP percent, money saved already computed server-side, but e.g. `xpPercent = intoLevel/needed`) | **`$derived`** | Pure computation off store/props. |
| Cross-cutting side effects (replay outbox when `online`, hydrate on mount) | **`$effect`** in the root `+layout.svelte` | Lifecycle-bound. |

> **Runes-first principle**: prefer `$state`/`$derived`/`$props`/`$effect`. Use a store ONLY for the three genuinely shared concerns above (`gameState`, `celebration`, `sync`). Everything else is local runes.

### 3.2 `gameState` store — `src/lib/stores/gameState.svelte.ts`

Implemented as a runes-based store object (Svelte 5 idiom): a module-level `$state` rune wrapped in a small API, plus `$derived` for `LevelInfo`. This is shareable across components because the rune lives at module scope.

```typescript
// src/lib/stores/gameState.svelte.ts
import { levelFromXp, PROGRESSION } from '$lib/config/progression';
import type { UserState, LevelInfo, ProgressDelta, Quest, HabitLog } from '$lib/types';

interface TodayHabit { habitId: number; streak: number; logStatus: HabitLog['status'] | null; }

interface GameStateShape {
  user: UserState;
  quests: Quest[];
  today: Record<number, TodayHabit>; // keyed by habitId
  globalStreak: number;
}

// Module-scoped rune = shared singleton across the app.
let gs = $state<GameStateShape>({
  user: { id: 1, total_xp: 0, coins: 0, prestige: 0, freezes: 0, last_active: null, created_at: '' },
  quests: [],
  today: {},
  globalStreak: 0
});

// Derived authoritative level info.
const level = $derived<LevelInfo>(() => {
  const li = levelFromXp(gs.user.total_xp);
  return {
    ...li,
    totalXp: gs.user.total_xp,
    prestige: gs.user.prestige,
    canPrestige: li.level >= PROGRESSION.PRESTIGE_LEVEL
  };
});

export const gameState = {
  // read-only getters (components read these)
  get user() { return gs.user; },
  get quests() { return gs.quests; },
  get today() { return gs.today; },
  get globalStreak() { return gs.globalStreak; },
  get level(): LevelInfo { return level; },
  get xpPercent(): number {
    const { intoLevel, needed } = level;
    return needed > 0 ? Math.min(100, Math.round((intoLevel / needed) * 100)) : 0;
  },

  /** Seed from SSR load() data or /api/sync/state. */
  hydrate(payload: { userState: UserState; quests: Quest[]; today: { habits: { habit: { id: number }; log: HabitLog | null; streak: number }[]; globalStreak: number } }) {
    gs.user = payload.userState;
    gs.quests = payload.quests;
    gs.globalStreak = payload.today.globalStreak;
    gs.today = Object.fromEntries(
      payload.today.habits.map((h) => [h.habit.id, { habitId: h.habit.id, streak: h.streak, logStatus: h.log?.status ?? null }])
    );
  },

  /** OPTIMISTIC: called the instant the user taps, before the network resolves. */
  optimisticLog(habitId: number, difficulty: number) {
    const cur = gs.today[habitId];
    if (cur && cur.logStatus === 'done') return; // already done -> no double
    const guessStreak = (cur?.streak ?? 0) + 1;
    const base = PROGRESSION.XP_PER_HABIT * difficulty;
    const bonus = Math.min(guessStreak * PROGRESSION.STREAK_BONUS_PER_DAY, PROGRESSION.STREAK_BONUS_CAP);
    const xp = Math.round(base * (1 + bonus));
    gs.user = { ...gs.user, total_xp: gs.user.total_xp + xp };
    gs.today = { ...gs.today, [habitId]: { habitId, streak: guessStreak, logStatus: 'done' } };
  },

  /** RECONCILE: replace optimistic guess with the server's authoritative delta. */
  reconcile(delta: ProgressDelta, habitId?: number) {
    gs.user = {
      ...gs.user,
      total_xp: delta.totalXp,
      coins: delta.coins,
      freezes: delta.freezes,
      prestige: delta.level.prestige
    };
    if (habitId != null) {
      gs.today = { ...gs.today, [habitId]: { habitId, streak: delta.streakDays, logStatus: 'done' } };
    }
    if (delta.completedQuests.length) {
      const byId = new Map(delta.completedQuests.map((q) => [q.id, q]));
      gs.quests = gs.quests.map((q) => byId.get(q.id) ?? q);
    }
  },

  /** ROLLBACK: if the network call ultimately fails AND wasn't queued offline. */
  rollbackLog(habitId: number, prev: TodayHabit | undefined, prevXp: number) {
    gs.user = { ...gs.user, total_xp: prevXp };
    if (prev) gs.today = { ...gs.today, [habitId]: prev };
    else { const { [habitId]: _drop, ...rest } = gs.today; gs.today = rest; }
  }
};
```

> Note: `.svelte.ts` extension is required for runes to compile outside components. Getters expose state read-only; mutations only via the named methods. Components import `gameState` and read e.g. `gameState.level.level`, `gameState.xpPercent` — these are reactive because they read the module-scoped rune.

### 3.3 Celebration event bus — `src/lib/stores/celebration.svelte.ts`

```typescript
// src/lib/stores/celebration.svelte.ts
export type CelebrationKind = 'levelUp' | 'achievement' | 'quest' | 'milestone' | 'coins';
export interface CelebrationEvent {
  id: string;          // crypto.randomUUID()
  kind: CelebrationKind;
  title: string;       // French
  detail?: string;     // French
  level?: number;      // for levelUp
}
export interface Toast { id: string; message: string; tone: 'info' | 'success' | 'warn'; }

let events = $state<CelebrationEvent[]>([]); // queue consumed by the overlay
let toasts = $state<Toast[]>([]);

export const celebration = {
  get events() { return events; },
  get toasts() { return toasts; },
  celebrate(e: Omit<CelebrationEvent, 'id'>) { events = [...events, { ...e, id: crypto.randomUUID() }]; },
  consume(id: string) { events = events.filter((x) => x.id !== id); },
  toast(message: string, tone: Toast['tone'] = 'info') {
    const t = { id: crypto.randomUUID(), message, tone };
    toasts = [...toasts, t];
    setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); }, 4000);
  }
};

/** Map a ProgressDelta into celebration events (French copy). Call after reconcile(). */
export function celebrateFromDelta(delta: import('$lib/types').ProgressDelta) {
  if (delta.leveledUp && delta.newLevel != null)
    celebration.celebrate({ kind: 'levelUp', level: delta.newLevel, title: `Niveau ${delta.newLevel} atteint !`, detail: 'Bravo, continue sur ta lancée.' });
  for (const a of delta.unlockedAchievements)
    celebration.celebrate({ kind: 'achievement', title: `Succès débloqué : ${a.name}`, detail: a.description ?? undefined });
  for (const q of delta.completedQuests)
    celebration.celebrate({ kind: 'quest', title: 'Quête terminée !', detail: q.description });
  if (delta.coinsGained > 0)
    celebration.toast(`+${delta.coinsGained} pièces`, 'success');
}
```

The root `+layout.svelte` renders a `<CelebrationOverlay>` (confetti + level-up modal) bound to `celebration.events` and a `<Toaster>` bound to `celebration.toasts`.

### 3.4 The tap flow wiring (in `HabitRow.svelte`) + fetch wrapper

```typescript
// src/lib/client/api.ts  — thin fetch wrapper that handles 401 + offline enqueue
import { goto } from '$app/navigation';
import { enqueueLog } from '$lib/client/outbox';
import type { ProgressDelta, HabitLog } from '$lib/types';

export async function postLog(habitId: number, body: { date: string; status?: 'done'; note?: string|null; clientId: string }):
  Promise<{ queued: true } | { queued: false; delta: ProgressDelta; log: HabitLog }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueueLog({ habitId, ...body });
    return { queued: true };
  }
  try {
    const res = await fetch(`/api/habits/${habitId}/log`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    if (res.status === 401) { await goto('/login'); throw new Error('unauth'); }
    if (!res.ok) {
      // Network reachable but server error: enqueue so we never lose a tap.
      await enqueueLog({ habitId, ...body });
      return { queued: true };
    }
    return { queued: false, ...(await res.json()) };
  } catch {
    // True network failure mid-flight.
    await enqueueLog({ habitId, ...body });
    return { queued: true };
  }
}
```

In `HabitRow.svelte` (runes; local optimistic flag + store update):
```svelte
<script lang="ts">
  import { gameState } from '$lib/stores/gameState.svelte';
  import { celebration, celebrateFromDelta } from '$lib/stores/celebration.svelte';
  import { sync } from '$lib/stores/sync.svelte';
  import { postLog } from '$lib/client/api';
  import { todayStr } from '$lib/client/clock';
  let { habit } = $props();
  let busy = $state(false);
  const done = $derived(gameState.today[habit.id]?.logStatus === 'done');

  async function validate() {
    if (done || busy) return;
    busy = true;
    const prev = gameState.today[habit.id];
    const prevXp = gameState.user.total_xp;
    gameState.optimisticLog(habit.id, habit.difficulty);   // instant UI
    const clientId = crypto.randomUUID();
    const r = await postLog(habit.id, { date: todayStr(), status: 'done', clientId });
    if (r.queued) { sync.markPending(); }                  // stays optimistic, badge shows "en attente"
    else {
      gameState.reconcile(r.delta, habit.id);              // authoritative
      celebrateFromDelta(r.delta);
    }
    busy = false;
  }
</script>
```

> Rollback (`gameState.rollbackLog`) is only used by non-loggable mutations (e.g. reward claim that fails). For habit logs we **never roll back** because any failure path enqueues offline — the tap is durable.

---

## 4. Offline-first: service worker + IndexedDB outbox

### 4.1 Coexistence with `@vite-pwa/sveltekit`

Use vite-pwa in **`strategies: 'injectManifest'`** mode with `srcDir: 'src'`, `filename: 'service-worker.ts'`. This means **we own the service worker source**; vite-pwa only (a) injects the precache manifest (`self.__WB_MANIFEST`) and (b) wires registration. We import Workbox precaching for the app shell and add **our own `fetch`/`sync`/`message` handlers** for the outbox. This avoids fighting an auto-generated SW: there is exactly one SW file (`src/service-worker.ts`) compiled by vite-pwa.

`vite.config.ts` (relevant part):
```typescript
SvelteKitPWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'service-worker.ts',
  registerType: 'autoUpdate',
  injectManifest: { globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff2}'] },
  manifest: { /* name 'HabitQuest', theme_color '#0b0f1a', display 'standalone', icons … */ }
})
```

### 4.2 Outbox storage — IndexedDB schema (`src/lib/client/outbox.ts`)

DB name `habitquest-outbox`, version 1, one object store:

```
store "logs"  (keyPath: "clientId")
  fields: clientId(string,UUID), habitId(number), date(string YYYY-MM-DD),
          status('done'), note(string|null), createdAt(number epoch ms),
          state('pending'|'syncing'|'synced'|'conflict'), attempts(number)
  index  "byState" on state
```

We use a tiny hand-rolled IDB wrapper (no `idb` lib needed, but `idb` is acceptable). API:

```typescript
// src/lib/client/outbox.ts
export interface OutboxLog {
  clientId: string; habitId: number; date: string;
  status: 'done'; note: string | null;
  createdAt: number; state: 'pending' | 'syncing' | 'synced' | 'conflict'; attempts: number;
}

export async function enqueueLog(input: { clientId: string; habitId: number; date: string; status?: 'done'; note?: string|null }): Promise<void>;
/** All non-synced logs (pending + conflict), oldest first. */
export async function pendingLogs(): Promise<OutboxLog[]>;
export async function countPending(): Promise<number>;
/** Replay every pending log to the server. Idempotent & safe to call repeatedly. */
export async function flushOutbox(): Promise<{ synced: number; conflicts: number; remaining: number }>;
/** Remove rows already marked 'synced' older than 24h (housekeeping). */
export async function pruneSynced(): Promise<void>;
```

### 4.3 `flushOutbox` implementation (the replay loop)

```typescript
export async function flushOutbox() {
  let synced = 0, conflicts = 0;
  const items = await pendingLogs();
  for (const item of items) {
    await setState(item.clientId, 'syncing');
    try {
      const res = await fetch(`/api/habits/${item.habitId}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: item.date, status: item.status, note: item.note, clientId: item.clientId })
      });
      if (res.status === 401) { await setState(item.clientId, 'pending'); break; } // need re-login; stop
      if (res.ok) {
        const { delta } = await res.json();
        await setState(item.clientId, 'synced');
        synced++;
        // Notify the page so gameState can reconcile (delta.xpGained may be 0 on dup).
        broadcast({ type: 'log-synced', clientId: item.clientId, habitId: item.habitId, delta });
      } else if (res.status === 409) {
        // Server rejected (e.g. clamped date out of range): mark conflict, keep for review.
        await bumpAttempts(item.clientId, 'conflict'); conflicts++;
        broadcast({ type: 'log-conflict', clientId: item.clientId, habitId: item.habitId });
      } else {
        await bumpAttempts(item.clientId, 'pending'); // transient 5xx: retry later
      }
    } catch {
      await setState(item.clientId, 'pending'); // offline again; stop trying this round
      break;
    }
  }
  await pruneSynced();
  const remaining = await countPending();
  return { synced, conflicts, remaining };
}
```

`broadcast(msg)` posts via a `BroadcastChannel('habitquest-sync')` so any open tab + the page can react.

### 4.4 Idempotency & conflict handling

- **Idempotency**: the server enforces `UNIQUE(habit_id, date)` and `applyHabitLog` is `INSERT ... ON CONFLICT DO NOTHING`. Replaying the same `clientId`/(habitId,date) twice grants XP once; the second returns `delta.xpGained === 0`. So duplicate flushes (e.g. SW retried + page also flushed) are harmless.
- **Conflict cases & resolution**:
  - *Duplicate same-day already logged online* → server returns 200 with `xpGained:0`; outbox marks `synced`; client `reconcile` is a no-op for XP (server values authoritative). No user-visible conflict.
  - *Date out of allowed backfill window* (`clampDate` would refuse, server returns `409 OUT_OF_RANGE`) → outbox row marked `conflict`; UI surfaces it in a "À revoir" list with a button to re-date to today or discard. (Stated default: this is rare; offline edits older than `MAX_BACKFILL_DAYS=2` are flagged, not silently dropped.)
  - *Re-login needed (401)* → flush halts, rows stay `pending`; after the user logs back in, `online`/`focus` triggers re-flush.
- **Server clamp** (`clampDate`, used in §1.3): `if (d > today) -> today; if (d < today - MAX_BACKFILL_DAYS) -> 409 OUT_OF_RANGE`. This keeps offline-captured "yesterday" logs valid while preventing abuse.

### 4.5 Pending vs synced in the UI

- `gameState.today[habitId].logStatus === 'done'` drives the checked state (set optimistically).
- A per-row **pending badge**: a row is "en attente" if there exists an outbox entry for `(habitId, today)` in state `pending|syncing`. The `sync` store keeps a `Set<string>` of pending keys (`${habitId}:${date}`) hydrated from `pendingLogs()` on boot and updated on enqueue/flush events. UI: synced = flamme pleine + check; pending = small cloud/loader glyph with title `'En attente de synchronisation'`; conflict = amber dot with title `'À revoir'`.

```typescript
// src/lib/stores/sync.svelte.ts
let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
let pendingCount = $state(0);
let pendingKeys = $state<Set<string>>(new Set());
let syncing = $state(false);
export const sync = {
  get online() { return online; }, get pendingCount() { return pendingCount; },
  get syncing() { return syncing; },
  isPending(habitId: number, date: string) { return pendingKeys.has(`${habitId}:${date}`); },
  setOnline(v: boolean) { online = v; },
  markPending() { pendingCount += 1; },
  async refresh() { const { countPending, pendingLogs } = await import('$lib/client/outbox');
    pendingCount = await countPending();
    pendingKeys = new Set((await pendingLogs()).map((l) => `${l.habitId}:${l.date}`)); },
  setSyncing(v: boolean) { syncing = v; }
};
```

### 4.6 End-to-end sync flow (step by step)

**A. User taps "valider" while OFFLINE**
1. `HabitRow.validate()` → `gameState.optimisticLog()` (XP bar moves instantly).
2. `postLog()` sees `!navigator.onLine` → `enqueueLog()` writes an IDB row `state:'pending'`.
3. `sync.markPending()` + `sync.refresh()` → row shows "en attente".
4. (Optional) register a one-shot Background Sync: `registration.sync.register('flush-outbox')` (guarded — not all browsers/PWAs support it; we also have the reconnect path B).

**B. Network returns (or app refocused)**
1. Root `+layout.svelte` `$effect` registered listeners: `window.addEventListener('online', onReconnect)`, `document.addEventListener('visibilitychange', …)`, and `BroadcastChannel('habitquest-sync')`.
2. `onReconnect()` → `sync.setOnline(true)`, `sync.setSyncing(true)`, `await flushOutbox()`.
3. For each replayed log the SW/page receives `{type:'log-synced', habitId, delta}` over the BroadcastChannel.
4. Page handler calls `gameState.reconcile(delta, habitId)` and `celebrateFromDelta(delta)` (so XP/level catch up to authoritative; duplicates contribute 0).
5. After the loop, call `GET /api/sync/state` once and `gameState.hydrate(...)` to guarantee the store exactly matches the server (covers quests/freeze grants advanced during the offline window). `sync.refresh()` updates badges; `sync.setSyncing(false)`.

**C. Background Sync fired by the SW (app closed)**
1. SW `self.addEventListener('sync', e => { if (e.tag==='flush-outbox') e.waitUntil(flushFromSW()); })`.
2. `flushFromSW()` reads the same IDB store and POSTs each pending log (the SW shares IndexedDB with the page; the fetch carries the `hq_session` cookie automatically since it's same-origin → cookies are sent).
3. On success it marks rows `synced` and `postMessage`/BroadcastChannel so that when a tab opens it reconciles. If the session cookie is expired (401), the SW leaves rows `pending` for the next foreground login.

**D. First load after being offline (fresh app open, still has pending rows)**
1. `+layout.svelte` `onMount`/`$effect`: `gameState.hydrate(data)` from `load()` (which already reflects any server-side state).
2. `sync.refresh()`; if `navigator.onLine` → `flushOutbox()` then re-`hydrate` from `/api/sync/state`.

### 4.7 Reversibility (`reverseHabitLog`) rule

A log is reversible (DELETE allowed) only if: `date === today()` **and** the granted XP has not been "consumed" by an irreversible downstream event in a different way. Stated default: we **always allow same-day un-tap** and simply subtract the exact XP/coins that this log granted (the engine recorded the grant amount alongside the log in a `grant_xp`/`grant_coins` column — add these to `habit_logs` via migration, defaulting 0). Quests that incremented are decremented; an already-**claimed** quest cannot be un-claimed → if reversal would drop a claimed quest below target, return `409 NOT_REVERSIBLE`. Achievements are never revoked. This keeps undo safe and bounded.

> Migration addition:
> ```sql
> ALTER TABLE habit_logs ADD COLUMN grant_xp INTEGER NOT NULL DEFAULT 0;
> ALTER TABLE habit_logs ADD COLUMN grant_coins INTEGER NOT NULL DEFAULT 0;
> ```

### 4.8 Service worker source — `src/service-worker.ts` (shape)

```typescript
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
declare let self: ServiceWorkerGlobalScope;

// 1. Precache app shell injected by vite-pwa.
precacheAndRoute(self.__WB_MANIFEST);

// 2. Outbox flush on Background Sync.
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'flush-outbox') event.waitUntil(flushFromSW());
});

// 3. Web Push display (daily reminder) — payload is French.
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'HabitQuest', body: 'N\'oublie pas tes habitudes du jour !' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, icon: '/icons/icon-192.png', badge: '/icons/badge.png', tag: 'daily-reminder'
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});

// 4. Navigation fallback: serve cached shell when offline (network-first for navigations).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/') as Promise<Response>));
  }
  // API GETs and mutations are NOT cached; they fail fast offline so the
  // outbox/optimistic path takes over. (We never cache /api/** responses.)
});

async function flushFromSW(): Promise<void> { /* opens 'habitquest-outbox' IDB, POSTs pending logs, marks synced, BroadcastChannel notifies */ }
```

Key coexistence guarantees:
- **One SW**, authored by us, manifest injected by vite-pwa (`injectManifest`).
- We never cache `/api/**` — offline writes go through the outbox, offline reads use the SSR-hydrated store + last `load()` data.
- `registerType: 'autoUpdate'` keeps the shell fresh; our outbox logic is additive.

---

## 5. File manifest (everything this subsystem creates/owns)

```
src/lib/types.ts
src/lib/server/auth.ts
src/lib/server/respond.ts
src/lib/server/schemas.ts                 # Zod request schemas
src/lib/server/engine.ts                  # applyHabitLog / reverseHabitLog / setCleanDate / recordRelapse
src/lib/server/clock.ts                   # today(), clampDate()
src/lib/config/recovery.ts                # HEALTH_TIMELINE, CLEAN_MILESTONES, RELAPSE_MESSAGES
src/lib/client/api.ts                     # postLog + fetch wrapper (401, offline enqueue)
src/lib/client/clock.ts                   # todayStr() (client tz)
src/lib/client/outbox.ts                  # IndexedDB outbox API
src/lib/stores/gameState.svelte.ts
src/lib/stores/celebration.svelte.ts
src/lib/stores/sync.svelte.ts
src/hooks.server.ts
src/app.d.ts                              # App.Locals.authed
src/service-worker.ts

src/routes/api/auth/login/+server.ts
src/routes/api/auth/logout/+server.ts
src/routes/api/habits/+server.ts
src/routes/api/habits/[id]/+server.ts
src/routes/api/habits/[id]/log/+server.ts
src/routes/api/quests/[id]/claim/+server.ts
src/routes/api/rewards/+server.ts
src/routes/api/rewards/[id]/+server.ts
src/routes/api/rewards/[id]/claim/+server.ts
src/routes/api/addictions/+server.ts
src/routes/api/addictions/[id]/+server.ts
src/routes/api/addictions/[id]/clean-date/+server.ts
src/routes/api/addictions/[id]/relapse/+server.ts
src/routes/api/triggers/+server.ts
src/routes/api/push/subscribe/+server.ts
src/routes/api/push/unsubscribe/+server.ts
src/routes/api/settings/+server.ts
src/routes/api/sync/state/+server.ts

src/routes/+layout.server.ts              # exposes locals.authed if needed
src/routes/+layout.svelte                 # hydrate gameState, mount sync listeners, CelebrationOverlay+Toaster
src/routes/+page.server.ts                # dashboard load() (SyncStateResponse-shaped)
src/routes/habits/+page.server.ts
src/routes/addictions/+page.server.ts
src/routes/shop/+page.server.ts
src/routes/login/+page.svelte             # public; form -> /api/auth/login
```

**Migrations added by this subsystem** (run in `db.ts` migration list): `push_subscriptions`, `settings` tables; `habit_logs.grant_xp`, `habit_logs.grant_coins` columns.

**Config additions to `src/lib/config/progression.ts`** (keeps §5 centralization): a `BOSS` sub-object `{ MAX_HP: 100, DMG_PER_DAY: 1 }`, and `MAX_BACKFILL_DAYS: 2`. All existing constants (BASE_XP 100, EXPONENT 1.5, XP_PER_HABIT 25, XP_BREAK_HABIT_DAY 30, streak +2%/cap +50%, PRESTIGE_LEVEL 50) are consumed unchanged by `engine.ts` and `gameState.optimisticLog`.

---

### Open defaults I chose (flagged for your sign-off)
- Timezone fixed to `Europe/Paris`; offline backfill window = 2 days.
- Session cookie 90-day expiry, HMAC key derived from `APP_PASSWORD` (password rotation invalidates sessions).
- Boss: linear 1 HP/clean-day over 100 HP.
- Rewards (including cosmetics) are one-shot claims.
- Daily reminder send is a server-side scheduler (outside this subsystem); only subscribe/unsubscribe contracts are specified here.
- Service worker strategy = vite-pwa `injectManifest` so there is exactly one SW file we own.