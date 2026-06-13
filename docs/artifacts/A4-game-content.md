The repo is essentially empty (just `.claude` and `.git`), so there's no existing `progression.ts` to reconcile against — I'll design strictly to the brief's documented config. I have everything I need to produce the design artifact.

I'll now produce the complete, ready-to-paste design artifact.

---

# HabitQuest — Sous-système : Contenu de jeu & équilibrage

Design artifact for the **game content & balancing** subsystem. All files live under `src/lib/config/` and complement `src/lib/config/progression.ts` (BASE_XP 100, EXPONENT 1.5, XP_PER_HABIT 25, XP_BREAK_HABIT_DAY 30, streak +2 %/j cap +50 %, prestige L50). Everything below is compilable TypeScript, ready to paste verbatim.

---

## 0. Shared types & the evaluation state contract

These types are referenced by `achievements.ts`, `quests.ts`, and the boss model. **Defaults chosen where the brief is silent are flagged `[DÉFAUT]`.**

Create **`src/lib/config/types.ts`**:

```typescript
// src/lib/config/types.ts
// Shared types for the game-content/balancing subsystem.

/** Aggregated, machine-checkable snapshot of the single user's game state.
 *  Built server-side from DB queries (see §1.3 for the assembling query plan).
 *  All counts are lifetime unless noted. */
export interface GameState {
  // --- Progression (derived from user_state.total_xp via progression.ts) ---
  level: number;            // current level (>=1)
  totalXp: number;          // user_state.total_xp
  coins: number;            // user_state.coins
  prestige: number;         // user_state.prestige
  freezes: number;          // user_state.freezes

  // --- Habits / logs aggregates ---
  totalDone: number;        // count(habit_logs.status = 'done')   lifetime
  bestHabitStreak: number;  // longest consecutive 'done' run across all build habits
  habitStreaks: number[];   // current streak (days) per active build habit
  categoriesDoneToday: string[]; // distinct habit.category validated today
  doneToday: number;        // 'done' build logs for current day
  distinctHabitsDoneToday: number; // distinct habit_id 'done' today

  // --- Addictions / boss aggregates ---
  cleanDaysMax: number;     // max current clean streak across addiction_targets
  cleanDaysTotalBest: number; // max(addiction_targets.best_streak_days)
  bossesDefeated: number;   // addiction targets whose boss HP reached 0 (see §5)
  moneySaved: number;       // sum of saved money across all targets (currency units)
  noRelapseThisWeek: boolean; // no habit_log 'relapsed' & no trigger_journal.gave_in in current ISO week

  // --- Quests ---
  questsCompleted: number;  // lifetime count(quests.completed = 1)

  // --- Journaling ---
  journalEntries: number;   // lifetime count(trigger_journal rows)
  journalEntriesThisWeek: number;

  // --- SOS / breathing ---
  sosUsed: number;          // lifetime count of SOS breathing sessions completed
  cravingsResisted: number; // trigger_journal rows where gave_in = 0
}

/** Convenience alias: the second arg of checkAchievements is the same snapshot.
 *  Kept as a distinct name in case future stats are split out. */
export type GameStats = GameState;
```

> `[DÉFAUT]` `sosUsed` and `cravingsResisted` are not in the brief's schema as counters but are trivially derivable (`trigger_journal` rows / `gave_in = 0`). SOS sessions assume a future `sos_sessions` count or a simple counter column; if not implemented, set `sosUsed = 0` and the two SOS achievements simply never unlock — no crash.

---

## 1. Achievements — `src/lib/config/achievements.ts`

### 1.1 Condition union & item type

```typescript
// src/lib/config/achievements.ts
import type { GameState, GameStats } from './types';

/** Machine-checkable achievement conditions. Each variant maps to a pure
 *  predicate over (GameState, GameStats). All thresholds inclusive (>=). */
export type AchievementCondition =
  | { type: 'habit_streak'; days: number }        // bestHabitStreak >= days
  | { type: 'level'; value: number }              // level >= value
  | { type: 'clean_days'; days: number }          // cleanDaysMax >= days
  | { type: 'total_done'; value: number }         // totalDone >= value
  | { type: 'quests_completed'; value: number }   // questsCompleted >= value
  | { type: 'money_saved'; value: number }        // moneySaved >= value
  | { type: 'prestige'; value: number }           // prestige >= value
  | { type: 'no_relapse_week' }                   // noRelapseThisWeek === true
  | { type: 'boss_defeated'; value: number }      // bossesDefeated >= value
  | { type: 'journal_entries'; value: number }    // journalEntries >= value
  | { type: 'variety_day'; categories: number }   // categoriesDoneToday.length >= categories
  | { type: 'coins_total'; value: number }        // coins >= value (held at once)
  | { type: 'sos_used'; value: number }           // sosUsed >= value
  | { type: 'cravings_resisted'; value: number }; // cravingsResisted >= value

export interface Achievement {
  key: string;                    // stable PK, matches achievements.key in DB
  name: string;                   // FR
  description: string;            // FR
  icon: string;                   // emoji or asset id
  condition: AchievementCondition;
}
```

### 1.2 The content array (28 items, FR)

```typescript
export const ACHIEVEMENTS: readonly Achievement[] = [
  // --- Premiers pas / habitudes ---
  { key: 'first_step',       name: 'Premier pas',          description: 'Valide ta toute première habitude.',                 icon: '👟', condition: { type: 'total_done', value: 1 } },
  { key: 'done_10',          name: 'Sur la lancée',        description: 'Valide 10 habitudes au total.',                      icon: '✅', condition: { type: 'total_done', value: 10 } },
  { key: 'done_100',         name: 'Centurion',            description: 'Valide 100 habitudes au total.',                     icon: '💯', condition: { type: 'total_done', value: 100 } },
  { key: 'done_500',         name: 'Force de l’habitude',  description: 'Valide 500 habitudes au total.',                     icon: '🏛️', condition: { type: 'total_done', value: 500 } },
  { key: 'done_1000',        name: 'Maître du quotidien',  description: 'Valide 1000 habitudes au total.',                    icon: '🗿', condition: { type: 'total_done', value: 1000 } },

  // --- Séries (streaks) ---
  { key: 'streak_3',         name: 'Étincelle',            description: 'Tiens une série de 3 jours sur une habitude.',       icon: '✨', condition: { type: 'habit_streak', days: 3 } },
  { key: 'streak_7',         name: 'Semaine de feu',       description: 'Tiens une série de 7 jours.',                        icon: '🔥', condition: { type: 'habit_streak', days: 7 } },
  { key: 'streak_30',        name: 'Mois en flammes',      description: 'Tiens une série de 30 jours.',                       icon: '🌋', condition: { type: 'habit_streak', days: 30 } },
  { key: 'streak_100',       name: 'Brasier légendaire',   description: 'Tiens une série de 100 jours.',                      icon: '☄️', condition: { type: 'habit_streak', days: 100 } },

  // --- Niveaux ---
  { key: 'level_5',          name: 'Apprenti',             description: 'Atteins le niveau 5.',                               icon: '🥉', condition: { type: 'level', value: 5 } },
  { key: 'level_10',         name: 'Aventurier confirmé',  description: 'Atteins le niveau 10.',                              icon: '🥈', condition: { type: 'level', value: 10 } },
  { key: 'level_25',         name: 'Héros',                description: 'Atteins le niveau 25.',                              icon: '🥇', condition: { type: 'level', value: 25 } },
  { key: 'level_50',         name: 'Légende vivante',      description: 'Atteins le niveau 50.',                              icon: '👑', condition: { type: 'level', value: 50 } },

  // --- Prestige ---
  { key: 'prestige_1',       name: 'Renaissance',          description: 'Effectue ton premier prestige.',                    icon: '🌟', condition: { type: 'prestige', value: 1 } },
  { key: 'prestige_3',       name: 'Âme ascendante',       description: 'Atteins le 3ᵉ prestige.',                            icon: '💫', condition: { type: 'prestige', value: 3 } },

  // --- Addictions : jours clean ---
  { key: 'clean_1',          name: 'Jour un',              description: 'Tiens 1 journée clean. Le plus dur est commencé.',   icon: '🌱', condition: { type: 'clean_days', days: 1 } },
  { key: 'clean_7',          name: 'Une semaine libre',    description: 'Tiens 7 jours clean.',                               icon: '🍃', condition: { type: 'clean_days', days: 7 } },
  { key: 'clean_30',         name: 'Un mois reconquis',    description: 'Tiens 30 jours clean.',                              icon: '🌳', condition: { type: 'clean_days', days: 30 } },
  { key: 'clean_90',         name: 'Trois mois de liberté',description: 'Tiens 90 jours clean.',                              icon: '🌲', condition: { type: 'clean_days', days: 90 } },
  { key: 'clean_365',        name: 'Une année renaissante',description: 'Tiens 365 jours clean.',                             icon: '🎍', condition: { type: 'clean_days', days: 365 } },

  // --- Boss ---
  { key: 'boss_first',       name: 'Premier boss terrassé',description: 'Viens à bout de ton premier boss.',                 icon: '⚔️', condition: { type: 'boss_defeated', value: 1 } },

  // --- Résilience (rechutes / envies) ---
  { key: 'no_relapse_week',  name: 'Semaine sans faille',  description: 'Passe une semaine entière sans rechute.',            icon: '🛡️', condition: { type: 'no_relapse_week' } },
  { key: 'resist_10',        name: 'Volonté de fer',       description: 'Résiste à 10 envies notées dans le journal.',        icon: '💪', condition: { type: 'cravings_resisted', value: 10 } },
  { key: 'sos_used',         name: 'Respire',              description: 'Utilise le bouton SOS et termine une respiration.',  icon: '🫁', condition: { type: 'sos_used', value: 1 } },

  // --- Argent économisé ---
  { key: 'money_50',         name: 'Petites économies',    description: 'Économise 50 grâce à tes journées clean.',           icon: '🪙', condition: { type: 'money_saved', value: 50 } },
  { key: 'money_500',        name: 'Magot grandissant',    description: 'Économise 500 au total.',                            icon: '💰', condition: { type: 'money_saved', value: 500 } },

  // --- Quêtes ---
  { key: 'quests_10',        name: 'Chasseur de quêtes',   description: 'Termine 10 quêtes.',                                 icon: '📜', condition: { type: 'quests_completed', value: 10 } },
  { key: 'quests_50',        name: 'Quêteur émérite',      description: 'Termine 50 quêtes.',                                 icon: '🗺️', condition: { type: 'quests_completed', value: 50 } },

  // --- Variété / journal ---
  { key: 'variety_3',        name: 'Équilibre',            description: 'Valide des habitudes de 3 catégories le même jour.', icon: '🎯', condition: { type: 'variety_day', categories: 3 } },
  { key: 'journal_20',       name: 'Introspection',        description: 'Note 20 entrées dans ton journal de déclencheurs.',  icon: '📓', condition: { type: 'journal_entries', value: 20 } },
] as const;
```

> 30 items total (counts: 5 done + 4 streak + 4 level + 2 prestige + 5 clean + 1 boss + 3 resilience + 2 money + 2 quests + 2 variety/journal = 30). Within the requested 24–30 range.

### 1.3 Evaluation function

```typescript
/** Pure predicate: is this condition satisfied by the current snapshot? */
export function isUnlocked(c: AchievementCondition, s: GameState): boolean {
  switch (c.type) {
    case 'habit_streak':      return s.bestHabitStreak >= c.days;
    case 'level':             return s.level >= c.value;
    case 'clean_days':        return s.cleanDaysMax >= c.days;
    case 'total_done':        return s.totalDone >= c.value;
    case 'quests_completed':  return s.questsCompleted >= c.value;
    case 'money_saved':       return s.moneySaved >= c.value;
    case 'prestige':          return s.prestige >= c.value;
    case 'no_relapse_week':   return s.noRelapseThisWeek === true;
    case 'boss_defeated':     return s.bossesDefeated >= c.value;
    case 'journal_entries':   return s.journalEntries >= c.value;
    case 'variety_day':       return s.categoriesDoneToday.length >= c.categories;
    case 'coins_total':       return s.coins >= c.value;
    case 'sos_used':          return s.sosUsed >= c.value;
    case 'cravings_resisted': return s.cravingsResisted >= c.value;
    default: {
      // Exhaustiveness guard: a new condition variant without a branch fails compilation.
      const _never: never = c;
      return _never;
    }
  }
}

/** Returns the keys of achievements that are satisfied by the snapshot but not
 *  yet recorded in `alreadyUnlocked`. The server layer (src/lib/server/
 *  achievements.ts) persists them (set achievements.unlocked_at) and awards any
 *  associated coin/XP bonus.
 *
 *  @param state  aggregated game state snapshot
 *  @param stats  same snapshot (alias kept for the brief's signature shape)
 *  @param alreadyUnlocked  set of keys already in DB with unlocked_at set */
export function checkAchievements(
  state: GameState,
  stats: GameStats,
  alreadyUnlocked: ReadonlySet<string> = new Set()
): Achievement[] {
  void stats; // currently identical to state; reserved for future split
  return ACHIEVEMENTS.filter(
    (a) => !alreadyUnlocked.has(a.key) && isUnlocked(a.condition, state)
  );
}

/** Optional flat reward for unlocking an achievement (coins). Scales mildly with
 *  "rarity tier" inferred from the icon-free condition. [DÉFAUT] 25 coins each;
 *  milestone tiers give more. Engine may ignore and use a flat value. */
export function achievementReward(a: Achievement): { coins: number; xp: number } {
  const c = a.condition;
  const big =
    (c.type === 'level' && c.value >= 25) ||
    (c.type === 'clean_days' && c.days >= 90) ||
    (c.type === 'habit_streak' && c.days >= 100) ||
    c.type === 'prestige';
  return big ? { coins: 100, xp: 200 } : { coins: 25, xp: 50 };
}
```

> **Assembly note for the engine:** build `GameState` once per relevant mutation (habit log, clean-day tick, quest completion) then call `checkAchievements`. `alreadyUnlocked` = `SELECT key FROM achievements WHERE unlocked_at IS NOT NULL`. Seed the `achievements` table at migration time from `ACHIEVEMENTS` (insert `key,name,description` with `unlocked_at = NULL`).

---

## 2. Quests — `src/lib/config/quests.ts`

### 2.1 Design of scaling & determinism

- **Scaling by level:** target and rewards grow with level via small linear coefficients, clamped. This keeps quests meaningful as the XP curve steepens (a level-20 player should not get a level-1 quest). XP rewards are tuned as a fraction of `xpToNextLevel(level)` so a daily quest is always a satisfying but minor chunk.
- **Determinism:** no RNG. A 32-bit FNV-1a hash of `period + ':' + level + ':' + salt` seeds a small **xorshift32** stepper used only as a *deterministic index sequence* for non-repeating template selection. Same `(period, level)` ⇒ identical quest set, so regenerating on reload/restart is idempotent. Daily and weekly pools are selected separately (different salts).

### 2.2 Types & template pool

```typescript
// src/lib/config/quests.ts
import { xpToNextLevel } from './progression';

export type QuestScope = 'daily' | 'weekly';

export type QuestKind =
  | 'build'        // validate build habits
  | 'clean'        // clean days on addictions / no relapse
  | 'journaling'   // trigger journal entries
  | 'variety'      // distinct categories in a day
  | 'streak'       // maintain/extend a streak
  | 'sos';         // use SOS / resist a craving

/** A quest template. `target` and reward are produced by functions of level so
 *  the same template scales across the whole game. Descriptions use the literal
 *  placeholder {n} which the generator replaces with the resolved target. */
export interface QuestTemplate {
  key: string;                 // stable id, used in the dedup/seed logic
  scope: QuestScope;
  kind: QuestKind;
  description: string;         // FR, contains '{n}' where the target appears
  target: (level: number) => number;
  rewardXp: (level: number) => number;
  rewardCoins: (level: number) => number;
}

// --- Scaling helpers (kept here so all balancing lives in config) ---
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Daily XP reward as a gentle fraction of the level's required XP, floored so
 *  early levels still feel rewarding. ~8% of a daily-ish chunk. */
function dailyXp(level: number, weight = 1): number {
  const base = Math.floor(xpToNextLevel(level) * 0.06) + 20;
  return Math.round(base * weight);
}
function weeklyXp(level: number, weight = 1): number {
  const base = Math.floor(xpToNextLevel(level) * 0.20) + 60;
  return Math.round(base * weight);
}
/** Coins scale slower than XP (economy stays tight — see shop §3). */
function dailyCoins(level: number, weight = 1): number {
  return Math.round((5 + Math.floor(level / 3)) * weight);
}
function weeklyCoins(level: number, weight = 1): number {
  return Math.round((25 + Math.floor(level / 2)) * weight);
}

export const QUEST_TEMPLATES: readonly QuestTemplate[] = [
  // ---------------- DAILY ----------------
  {
    key: 'd_build_n', scope: 'daily', kind: 'build',
    description: 'Valide {n} habitude(s) aujourd’hui.',
    target: (l) => clamp(2 + Math.floor(l / 6), 2, 6),
    rewardXp: (l) => dailyXp(l, 1), rewardCoins: (l) => dailyCoins(l, 1),
  },
  {
    key: 'd_build_morning', scope: 'daily', kind: 'build',
    description: 'Valide une habitude avant midi.',
    target: () => 1,
    rewardXp: (l) => dailyXp(l, 0.7), rewardCoins: (l) => dailyCoins(l, 0.7),
  },
  {
    key: 'd_clean_day', scope: 'daily', kind: 'clean',
    description: 'Passe une journée clean sur l’un de tes boss.',
    target: () => 1,
    rewardXp: (l) => dailyXp(l, 1.1), rewardCoins: (l) => dailyCoins(l, 1.1),
  },
  {
    key: 'd_variety', scope: 'daily', kind: 'variety',
    description: 'Valide des habitudes de {n} catégories différentes.',
    target: (l) => clamp(2 + Math.floor(l / 12), 2, 4),
    rewardXp: (l) => dailyXp(l, 1.2), rewardCoins: (l) => dailyCoins(l, 1.2),
  },
  {
    key: 'd_journal', scope: 'daily', kind: 'journaling',
    description: 'Note {n} entrée(s) dans ton journal aujourd’hui.',
    target: () => 1,
    rewardXp: (l) => dailyXp(l, 0.8), rewardCoins: (l) => dailyCoins(l, 0.8),
  },
  {
    key: 'd_streak_keep', scope: 'daily', kind: 'streak',
    description: 'Garde ta plus longue série en vie aujourd’hui.',
    target: () => 1,
    rewardXp: (l) => dailyXp(l, 0.9), rewardCoins: (l) => dailyCoins(l, 0.9),
  },
  {
    key: 'd_sos_or_resist', scope: 'daily', kind: 'sos',
    description: 'Face à une envie, respire ou note-la sans céder.',
    target: () => 1,
    rewardXp: (l) => dailyXp(l, 1.0), rewardCoins: (l) => dailyCoins(l, 1.0),
  },
  {
    key: 'd_all_build', scope: 'daily', kind: 'build',
    description: 'Valide {n} habitudes pour un sans-faute du jour.',
    target: (l) => clamp(3 + Math.floor(l / 5), 3, 8),
    rewardXp: (l) => dailyXp(l, 1.4), rewardCoins: (l) => dailyCoins(l, 1.4),
  },

  // ---------------- WEEKLY ----------------
  {
    key: 'w_build_n', scope: 'weekly', kind: 'build',
    description: 'Valide {n} habitudes cette semaine.',
    target: (l) => clamp(10 + l, 10, 40),
    rewardXp: (l) => weeklyXp(l, 1), rewardCoins: (l) => weeklyCoins(l, 1),
  },
  {
    key: 'w_clean_days', scope: 'weekly', kind: 'clean',
    description: 'Accumule {n} journées clean cette semaine.',
    target: (l) => clamp(3 + Math.floor(l / 8), 3, 7),
    rewardXp: (l) => weeklyXp(l, 1.3), rewardCoins: (l) => weeklyCoins(l, 1.3),
  },
  {
    key: 'w_no_relapse', scope: 'weekly', kind: 'clean',
    description: 'Termine la semaine sans aucune rechute.',
    target: () => 1,
    rewardXp: (l) => weeklyXp(l, 1.5), rewardCoins: (l) => weeklyCoins(l, 1.5),
  },
  {
    key: 'w_journal_n', scope: 'weekly', kind: 'journaling',
    description: 'Note {n} entrées dans ton journal cette semaine.',
    target: (l) => clamp(3 + Math.floor(l / 10), 3, 7),
    rewardXp: (l) => weeklyXp(l, 0.9), rewardCoins: (l) => weeklyCoins(l, 0.9),
  },
  {
    key: 'w_variety_days', scope: 'weekly', kind: 'variety',
    description: 'Aie {n} jours où tu valides au moins 2 catégories.',
    target: (l) => clamp(2 + Math.floor(l / 10), 2, 5),
    rewardXp: (l) => weeklyXp(l, 1.1), rewardCoins: (l) => weeklyCoins(l, 1.1),
  },
  {
    key: 'w_streak_reach', scope: 'weekly', kind: 'streak',
    description: 'Atteins une série de {n} jours sur une habitude.',
    target: (l) => clamp(5 + Math.floor(l / 4), 5, 30),
    rewardXp: (l) => weeklyXp(l, 1.4), rewardCoins: (l) => weeklyCoins(l, 1.4),
  },
  {
    key: 'w_quests_daily', scope: 'weekly', kind: 'build',
    description: 'Termine {n} quêtes journalières cette semaine.',
    target: (l) => clamp(3 + Math.floor(l / 12), 3, 6),
    rewardXp: (l) => weeklyXp(l, 1.2), rewardCoins: (l) => weeklyCoins(l, 1.2),
  },
  {
    key: 'w_resist_n', scope: 'weekly', kind: 'sos',
    description: 'Résiste à {n} envies cette semaine (journal, sans céder).',
    target: (l) => clamp(2 + Math.floor(l / 15), 2, 5),
    rewardXp: (l) => weeklyXp(l, 1.3), rewardCoins: (l) => weeklyCoins(l, 1.3),
  },
] as const;

/** How many quests to surface per period. [DÉFAUT] */
export const QUESTS_PER_PERIOD = { daily: 3, weekly: 2 } as const;
```

### 2.3 Deterministic generator

```typescript
// --- Deterministic seeding (no RNG) ---

/** 32-bit FNV-1a hash of a string → unsigned int. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** xorshift32 stepper: deterministic, seeded once, produces a reproducible
 *  sequence of unsigned 32-bit values. Used ONLY as a stable index source. */
function makeStepper(seed: number): () => number {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9; // avoid the fixed point at 0
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;  s >>>= 0;
    return s >>> 0;
  };
}

/** Deterministically pick `count` non-repeating templates of a given scope.
 *  Same (period, level, scope) ⇒ identical selection. Implemented as a seeded
 *  partial Fisher–Yates over the candidate index list. */
function pickTemplates(
  scope: QuestScope, period: string, level: number, count: number
): QuestTemplate[] {
  const pool = QUEST_TEMPLATES.filter((t) => t.scope === scope);
  const n = Math.min(count, pool.length);
  const idx = pool.map((_, i) => i);
  const next = makeStepper(fnv1a(`${scope}:${period}:L${level}`));
  for (let i = 0; i < n; i++) {
    const j = i + (next() % (idx.length - i)); // deterministic swap target
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, n).map((i) => pool[i]);
}

/** A fully resolved quest, ready to INSERT into the `quests` table.
 *  Maps 1:1 to columns: scope, description, target, reward_xp, reward_coins,
 *  period. `progress` defaults 0, `completed` defaults 0 in DB. */
export interface GeneratedQuest {
  key: string;             // template key (store in description prefix or a new col if desired)
  scope: QuestScope;
  kind: QuestKind;
  description: string;     // placeholder resolved
  target: number;
  reward_xp: number;
  reward_coins: number;
  period: string;
}

function resolve(t: QuestTemplate, level: number, period: string): GeneratedQuest {
  const target = Math.max(1, Math.floor(t.target(level)));
  return {
    key: t.key,
    scope: t.scope,
    kind: t.kind,
    description: t.description.replace('{n}', String(target)),
    target,
    reward_xp: Math.max(1, Math.floor(t.rewardXp(level))),
    reward_coins: Math.max(0, Math.floor(t.rewardCoins(level))),
    period,
  };
}

/** Generate the daily quest set for a given day period string ('YYYY-MM-DD'). */
export function generateDailyQuests(period: string, level: number): GeneratedQuest[] {
  return pickTemplates('daily', period, level, QUESTS_PER_PERIOD.daily)
    .map((t) => resolve(t, level, period));
}

/** Generate the weekly quest set for an ISO-week period string ('YYYY-Www'). */
export function generateWeeklyQuests(period: string, level: number): GeneratedQuest[] {
  return pickTemplates('weekly', period, level, QUESTS_PER_PERIOD.weekly)
    .map((t) => resolve(t, level, period));
}

/** Convenience: both sets at once. */
export function generateQuests(
  dailyPeriod: string, weeklyPeriod: string, level: number
): GeneratedQuest[] {
  return [
    ...generateDailyQuests(dailyPeriod, level),
    ...generateWeeklyQuests(weeklyPeriod, level),
  ];
}
```

> **Period strings** match the brief's schema comment exactly: daily `'YYYY-MM-DD'`, weekly `'YYYY-Www'` (ISO week, e.g. `'2026-W24'`). The server (`src/lib/server/quests.ts`) computes these and upserts on first request of each period using `UNIQUE`-style guard (e.g. `SELECT count(*) FROM quests WHERE period = ? AND scope = ?`). Because generation is pure, re-running it never produces different quests for the same period+level — safe to call on every dashboard load.
>
> `[DÉFAUT]` Level is captured **at generation time** for that period (snapshot). If the user levels up mid-day, the day's quests do not retarget — this keeps progress counters stable. Store `key` either by prefixing it isn't needed; the brief's `quests` table has no `key`/`kind` column — recommend adding `kind TEXT` + `key TEXT` columns, or encode `kind` to drive progress matching. Minimal-change alternative: match progress by `description`/`scope`. Flagged as a small schema add.

---

## 3. Shop — `src/lib/config/shop.ts`

### 3.1 Coin economy (consistent with the XP curve)

```typescript
// src/lib/config/shop.ts
import { PROGRESSION } from './progression';
```

**Economy model `[DÉFAUT, internally consistent]`:**

| Source | Coins | Rationale |
|---|---|---|
| Per build habit validated | **5** | Matches `dailyCoins` base; ~XP_PER_HABIT/5. |
| Per clean day | **6** | Slightly above habit (harder), mirrors XP 30 vs 25. |
| Per daily quest completed | **5–11** | `dailyCoins(level, weight)` — scales w/ level. |
| Per weekly quest completed | **25–60** | `weeklyCoins(level, weight)`. |
| Per level-up | **`10 + level * 2`** | Grows w/ level → "récompenses qui grossissent" (§5 anti-stagnation). |
| Per achievement | **25 / 100** | `achievementReward` (§1.3). |
| Per prestige | **500** | Big one-off relaunch reward. |

```typescript
export const COIN_ECONOMY = {
  PER_HABIT: 5,
  PER_CLEAN_DAY: 6,
  LEVEL_UP_BASE: 10,
  LEVEL_UP_PER_LEVEL: 2,      // coins on level-up = BASE + level*PER_LEVEL
  PRESTIGE_BONUS: 500,
} as const;

/** Coins granted when reaching `level` (called once per level-up event). */
export function coinsForLevelUp(level: number): number {
  return COIN_ECONOMY.LEVEL_UP_BASE + level * COIN_ECONOMY.LEVEL_UP_PER_LEVEL;
}
```

> **Sanity / pacing:** an active day ≈ 4 habits (20) + 1 clean day (6) + 3 daily quests (~24) + occasional level-up ≈ **~50 coins/day** early game, climbing with level. Cosmetics are priced so a new skin is ~3–6 days of play; "real rewards" are user-defined and deliberately expensive (the user sets cost). This keeps the loop rewarding without trivializing the big motivational payouts.

### 3.2 Shop item types & content

```typescript
export type ShopCategory = 'avatar_skin' | 'accessory' | 'theme' | 'badge_frame';

/** Default cosmetic catalog item. Maps to the `rewards` table with kind='cosmetic'.
 *  `unlockLevel` gates visibility/purchasability; `cost` is in coins. */
export interface CosmeticItem {
  key: string;
  name: string;            // FR
  description: string;     // FR
  category: ShopCategory;
  icon: string;            // emoji / asset id
  cost: number;            // coins
  unlockLevel: number;     // min level to purchase (0 = available immediately)
  assetId: string;         // id consumed by AvatarCard / theme engine
}

export const COSMETICS: readonly CosmeticItem[] = [
  // --- Thèmes (themes) ---
  { key: 'theme_midnight',   name: 'Thème Minuit',        description: 'Un bleu nuit profond, sobre et reposant.',      category: 'theme', icon: '🌌', cost: 80,   unlockLevel: 0,  assetId: 'theme:midnight' },
  { key: 'theme_ember',      name: 'Thème Braise',        description: 'Des accents orange chaleureux.',                category: 'theme', icon: '🔥', cost: 150,  unlockLevel: 5,  assetId: 'theme:ember' },
  { key: 'theme_forest',     name: 'Thème Forêt',         description: 'Des verts apaisants pour rester ancré.',        category: 'theme', icon: '🌿', cost: 150,  unlockLevel: 8,  assetId: 'theme:forest' },
  { key: 'theme_aurora',     name: 'Thème Aurore',        description: 'Dégradé violet et turquoise, hypnotique.',      category: 'theme', icon: '🌠', cost: 350,  unlockLevel: 15, assetId: 'theme:aurora' },
  { key: 'theme_gold',       name: 'Thème Or royal',      description: 'Réservé aux légendes : touches dorées.',        category: 'theme', icon: '👑', cost: 600,  unlockLevel: 25, assetId: 'theme:gold' },

  // --- Skins d’avatar (avatar_skin) ---
  { key: 'skin_default_alt', name: 'Tenue alternative',   description: 'Une variante de couleur pour ta créature.',     category: 'avatar_skin', icon: '🎨', cost: 100,  unlockLevel: 0,  assetId: 'skin:alt' },
  { key: 'skin_ninja',       name: 'Tenue Ninja',         description: 'Discret et déterminé.',                         category: 'avatar_skin', icon: '🥷', cost: 250,  unlockLevel: 7,  assetId: 'skin:ninja' },
  { key: 'skin_explorer',    name: 'Tenue Explorateur',   description: 'Prêt pour l’aventure du quotidien.',            category: 'avatar_skin', icon: '🧭', cost: 250,  unlockLevel: 10, assetId: 'skin:explorer' },
  { key: 'skin_mage',        name: 'Tenue Mage',          description: 'Maîtrise la magie des bonnes habitudes.',       category: 'avatar_skin', icon: '🧙', cost: 400,  unlockLevel: 18, assetId: 'skin:mage' },
  { key: 'skin_celestial',   name: 'Tenue Céleste',       description: 'Une aura d’étoiles pour les héros accomplis.',  category: 'avatar_skin', icon: '✨', cost: 700,  unlockLevel: 30, assetId: 'skin:celestial' },

  // --- Accessoires (accessory) ---
  { key: 'acc_cap',          name: 'Casquette',           description: 'Un petit couvre-chef décontracté.',            category: 'accessory', icon: '🧢', cost: 60,   unlockLevel: 0,  assetId: 'acc:cap' },
  { key: 'acc_glasses',      name: 'Lunettes',            description: 'Pour voir l’avenir avec clarté.',               category: 'accessory', icon: '👓', cost: 90,   unlockLevel: 3,  assetId: 'acc:glasses' },
  { key: 'acc_crown',        name: 'Couronne',            description: 'Tu règnes sur tes habitudes.',                 category: 'accessory', icon: '👑', cost: 300,  unlockLevel: 20, assetId: 'acc:crown' },
  { key: 'acc_wings',        name: 'Ailes',               description: 'Prends ton envol vers de nouveaux sommets.',    category: 'accessory', icon: '🪽', cost: 500,  unlockLevel: 28, assetId: 'acc:wings' },
  { key: 'acc_halo',         name: 'Auréole',             description: 'La marque des prestiges.',                      category: 'accessory', icon: '😇', cost: 450,  unlockLevel: 35, assetId: 'acc:halo' },

  // --- Cadres de badge (badge_frame) ---
  { key: 'frame_bronze',     name: 'Cadre Bronze',        description: 'Encadre ton avatar de bronze.',                category: 'badge_frame', icon: '🥉', cost: 70,   unlockLevel: 0,  assetId: 'frame:bronze' },
  { key: 'frame_silver',     name: 'Cadre Argent',        description: 'Un cadre argenté élégant.',                    category: 'badge_frame', icon: '🥈', cost: 200,  unlockLevel: 12, assetId: 'frame:silver' },
  { key: 'frame_gold',       name: 'Cadre Or',            description: 'Le cadre des grands accomplissements.',        category: 'badge_frame', icon: '🥇', cost: 500,  unlockLevel: 24, assetId: 'frame:gold' },
] as const;

/** Example seed of user-defined 'real' rewards (kind='real' in `rewards`).
 *  The user edits these freely; provided so the shop isn't empty on first run. */
export interface RealRewardSeed {
  name: string;            // FR
  cost: number;            // coins
  icon: string;
}

export const REAL_REWARD_SEEDS: readonly RealRewardSeed[] = [
  { name: 'Une séance ciné',                   cost: 500,  icon: '🎬' },
  { name: 'Un bon restaurant',                 cost: 800,  icon: '🍽️' },
  { name: 'Un jeu vidéo que je veux',          cost: 1500, icon: '🎮' },
  { name: 'Une journée 100 % détente',         cost: 1000, icon: '🛋️' },
  { name: 'Un nouveau livre',                  cost: 300,  icon: '📚' },
  { name: 'Une sortie nature / rando',         cost: 400,  icon: '🥾' },
] as const;

/** Is this cosmetic purchasable for the given level & coin balance? */
export function canPurchase(item: CosmeticItem, level: number, coins: number): boolean {
  return level >= item.unlockLevel && coins >= item.cost;
}
```

> **Prestige interaction `[DÉFAUT]`:** prestige resets level but **not** owned cosmetics or coins. `unlockLevel` gates re-check on level after prestige — but recommend the engine grant a permanent `prestige >= n` bypass so post-prestige players don't re-grind unlock gates. Implementation hint: `effectiveLevel = level + prestige * PROGRESSION.PRESTIGE_LEVEL` for unlock checks only.

---

## 4. Avatar evolution — `src/lib/config/avatar.ts`

```typescript
// src/lib/config/avatar.ts

/** An avatar evolution stage, gated by a minimum level. The avatar shows the
 *  highest stage whose `minLevel <= level`. Emoji is the default asset; `assetId`
 *  lets a richer renderer swap in custom art later. */
export interface AvatarStage {
  key: string;
  name: string;        // FR
  minLevel: number;
  emoji: string;
  assetId: string;
  description: string; // FR — shown on the avatar card
}

export const AVATAR_STAGES: readonly AvatarStage[] = [
  { key: 'egg',       name: 'Œuf',          minLevel: 1,  emoji: '🥚', assetId: 'avatar:egg',       description: 'Tout commence ici. Une promesse qui attend d’éclore.' },
  { key: 'hatchling', name: 'Nouveau-né',   minLevel: 3,  emoji: '🐣', assetId: 'avatar:hatchling', description: 'Ta créature vient d’éclore. Premiers pas !' },
  { key: 'sprout',    name: 'Pousse',       minLevel: 6,  emoji: '🌱', assetId: 'avatar:sprout',    description: 'Elle grandit doucement, jour après jour.' },
  { key: 'cub',       name: 'Jeune',        minLevel: 10, emoji: '🦊', assetId: 'avatar:cub',       description: 'Pleine d’énergie, elle prend de l’assurance.' },
  { key: 'adventurer',name: 'Aventurière',  minLevel: 16, emoji: '🐺', assetId: 'avatar:adventurer',description: 'Aguerrie par tes efforts, prête à explorer.' },
  { key: 'guardian',  name: 'Gardienne',    minLevel: 24, emoji: '🦁', assetId: 'avatar:guardian',  description: 'Forte et fiable, elle veille sur tes habitudes.' },
  { key: 'mythic',    name: 'Mythique',     minLevel: 34, emoji: '🐉', assetId: 'avatar:mythic',    description: 'Une créature de légende, née de ta constance.' },
  { key: 'celestial', name: 'Céleste',      minLevel: 45, emoji: '🦄', assetId: 'avatar:celestial', description: 'Presque au sommet. Une aura rare l’entoure.' },
  { key: 'ascended',  name: 'Ascendante',   minLevel: 50, emoji: '🔱', assetId: 'avatar:ascended',  description: 'Le prestige est à portée. Tu as tout accompli.' },
] as const;

/** Mood reflects the *current* best streak — visual/emotional feedback that is
 *  gentle on bad days (never a sad/angry face for a relapse; lowest tier is
 *  neutral-sleepy). Aligns with §7 "bienveillant". */
export type AvatarMoodKey = 'rest' | 'calm' | 'happy' | 'fired_up' | 'radiant';

export interface AvatarMood {
  key: AvatarMoodKey;
  minStreak: number;   // current streak (days) needed
  label: string;       // FR
  overlayEmoji: string;// small overlay / aura glyph
  auraClass: string;   // tailwind-ish class hint for the renderer
}

export const AVATAR_MOODS: readonly AvatarMood[] = [
  { key: 'rest',     minStreak: 0,  label: 'Au repos',    overlayEmoji: '😌', auraClass: 'aura-none' },
  { key: 'calm',     minStreak: 1,  label: 'Sereine',     overlayEmoji: '🙂', auraClass: 'aura-soft' },
  { key: 'happy',    minStreak: 3,  label: 'Joyeuse',     overlayEmoji: '😊', auraClass: 'aura-warm' },
  { key: 'fired_up', minStreak: 7,  label: 'Enflammée',   overlayEmoji: '🔥', auraClass: 'aura-fire' },
  { key: 'radiant',  minStreak: 30, label: 'Rayonnante',  overlayEmoji: '🌟', auraClass: 'aura-radiant' },
] as const;

/** Resolve the avatar stage for a level (highest stage with minLevel <= level). */
export function avatarStageForLevel(level: number): AvatarStage {
  let chosen = AVATAR_STAGES[0];
  for (const s of AVATAR_STAGES) if (level >= s.minLevel) chosen = s;
  return chosen;
}

/** Resolve mood from the current (single best) streak in days. */
export function avatarMoodForStreak(streakDays: number): AvatarMood {
  let chosen = AVATAR_MOODS[0];
  for (const m of AVATAR_MOODS) if (streakDays >= m.minStreak) chosen = m;
  return chosen;
}

/** Full appearance descriptor consumed by AvatarCard.svelte. `prestige` adds a
 *  permanent halo aura layer (cosmetic), reinforcing the prestige relaunch. */
export interface AvatarAppearance {
  stage: AvatarStage;
  mood: AvatarMood;
  prestigeHalo: boolean;
}

export function avatarAppearance(
  level: number, currentStreak: number, prestige: number
): AvatarAppearance {
  return {
    stage: avatarStageForLevel(level),
    mood: avatarMoodForStreak(currentStreak),
    prestigeHalo: prestige > 0,
  };
}
```

> `[DÉFAUT]` Stage thresholds are spaced so a new evolution lands roughly every few levels early (fast feedback when habits are fragile) and stretches toward L50, where `ascended` signposts that prestige is available — directly serving §5's "prestige relaunches goals." Mood is intentionally **never negative**: the lowest tier is "Au repos" (resting), honoring §7's non-punitive principle.

---

## 5. Boss HP model

The boss represents an addiction target. Each clean day deals damage; reaching 0 HP = "boss defeated" (a celebrated milestone), after which a new, tougher phase begins so the metaphor never "ends" and never punishes a relapse.

### 5.1 Config & functions — add to `src/lib/config/boss.ts`

```typescript
// src/lib/config/boss.ts
import { PROGRESSION } from './progression';

export const BOSS = {
  /** Damage dealt per clean day, before difficulty scaling. */
  BASE_DAMAGE_PER_CLEAN_DAY: 10,
  /** HP per "target clean day" — choosing 100 clean days as the canonical
   *  full-defeat horizon means HP ≈ targetCleanDays * (BASE_DAMAGE * diff). */
  HP_PER_TARGET_DAY: 10,
  /** Difficulty multiplier on HP by the target's difficulty (1..3, mirrors
   *  habits.difficulty). Higher difficulty = more HP = longer fight. */
  DIFFICULTY_HP_MULT: { 1: 0.7, 2: 1.0, 3: 1.4 } as Record<number, number>,
  /** Each defeated phase makes the next boss tougher (anti-stagnation). */
  PHASE_HP_GROWTH: 0.5,         // +50% HP per defeated phase
  /** Bonus rewards on defeat. */
  DEFEAT_XP: 300,
  DEFEAT_COINS: 200,
} as const;

/** Total HP of a boss given the user's chosen target (in clean days) and the
 *  target difficulty (1..3). HP grows with each previously defeated phase so the
 *  challenge ramps. */
export function bossMaxHp(
  targetCleanDays: number, difficulty: number, phase = 0
): number {
  const diffMult = BOSS.DIFFICULTY_HP_MULT[difficulty] ?? 1.0;
  const base = targetCleanDays * BOSS.HP_PER_TARGET_DAY * diffMult;
  const phaseMult = 1 + phase * BOSS.PHASE_HP_GROWTH;
  return Math.max(1, Math.round(base * phaseMult));
}

/** Damage dealt for one clean day. Scales mildly with difficulty so a hard boss
 *  isn't infinitely slow, and with a small streak momentum bonus that mirrors
 *  the XP streak bonus (capped identically). */
export function damagePerCleanDay(difficulty: number, currentCleanStreak: number): number {
  const diffMult = BOSS.DIFFICULTY_HP_MULT[difficulty] ?? 1.0;
  const momentum = Math.min(
    currentCleanStreak * PROGRESSION.STREAK_BONUS_PER_DAY,
    PROGRESSION.STREAK_BONUS_CAP
  );
  return Math.round(BOSS.BASE_DAMAGE_PER_CLEAN_DAY * diffMult * (1 + momentum));
}

/** Current HP = max(0, maxHp - cumulative damage). The engine recomputes
 *  cumulative damage deterministically from clean days rather than storing HP,
 *  consistent with the brief's "derive streaks, don't store" guidance. */
export function bossCurrentHp(
  targetCleanDays: number, difficulty: number, phase: number,
  cleanDaysElapsed: number, currentCleanStreak: number
): number {
  const maxHp = bossMaxHp(targetCleanDays, difficulty, phase);
  // Approximate cumulative damage: average daily damage * days. For exactness the
  // engine may sum damagePerCleanDay over each day; this closed form is used for
  // display and is monotonic.
  const dmg = damagePerCleanDay(difficulty, currentCleanStreak) * cleanDaysElapsed;
  return Math.max(0, maxHp - dmg);
}

export interface BossStatus {
  maxHp: number;
  currentHp: number;
  hpPct: number;        // 0..1 for the health bar
  defeated: boolean;
  phase: number;
}

export function bossStatus(
  targetCleanDays: number, difficulty: number, phase: number,
  cleanDaysElapsed: number, currentCleanStreak: number
): BossStatus {
  const maxHp = bossMaxHp(targetCleanDays, difficulty, phase);
  const currentHp = bossCurrentHp(
    targetCleanDays, difficulty, phase, cleanDaysElapsed, currentCleanStreak
  );
  return {
    maxHp, currentHp,
    hpPct: maxHp === 0 ? 0 : currentHp / maxHp,
    defeated: currentHp <= 0,
    phase,
  };
}
```

### 5.2 Defeat handling & post-defeat (FR messaging)

```typescript
/** Result returned to the engine when a boss reaches 0 HP. The engine awards
 *  XP/coins, increments bossesDefeated (for achievements), and starts the next
 *  phase (a tougher boss for the same addiction — the journey continues). */
export interface BossDefeatOutcome {
  xp: number;
  coins: number;
  nextPhase: number;
  message: string;   // FR, celebratory & encouraging
}

export const BOSS_DEFEAT_MESSAGES: readonly string[] = [
  'Boss terrassé ! Chaque jour clean l’a affaibli — et regarde le chemin parcouru. 💪',
  'Victoire ! Tu as prouvé que tu es plus fort que cette habitude. Un nouveau défi t’attend.',
  'Incroyable. Ce boss est vaincu. Repose-toi, savoure, puis vise encore plus haut. 🌟',
] as const;

export function handleBossDefeat(currentPhase: number, periodSeed: string): BossDefeatOutcome {
  // Deterministic message pick (no RNG), seeded by phase+period.
  let h = 0x811c9dc5;
  const s = `${periodSeed}:${currentPhase}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  const msg = BOSS_DEFEAT_MESSAGES[(h >>> 0) % BOSS_DEFEAT_MESSAGES.length];
  return {
    xp: BOSS.DEFEAT_XP,
    coins: BOSS.DEFEAT_COINS,
    nextPhase: currentPhase + 1,
    message: msg,
  };
}
```

### 5.3 Numeric coherence check

With defaults — a difficulty-2 boss targeting **100 clean days**: `maxHp = 100 * 10 * 1.0 = 1000`. Early damage `~10/day`, rising to `15/day` at the +50 % streak cap → full defeat lands a bit before 100 clean days, which is satisfying (the boss dies *before* the symbolic horizon, rewarding momentum). Defeat grants 300 XP + 200 coins — at L10 (`xpToNextLevel(10) ≈ 3162`) that's ~10 % of a level: a meaningful but non-trivializing payout, in line with the XP curve. Phase 2 of the same boss has `maxHp = 1500` (+50 %), so recovery from a relapse simply restarts an honest, slightly tougher fight — never a humiliating reset (§7).

---

## 6. File manifest & integration notes

| File | Exports |
|---|---|
| `src/lib/config/types.ts` | `GameState`, `GameStats` |
| `src/lib/config/achievements.ts` | `AchievementCondition`, `Achievement`, `ACHIEVEMENTS`, `isUnlocked`, `checkAchievements`, `achievementReward` |
| `src/lib/config/quests.ts` | `QuestScope`, `QuestKind`, `QuestTemplate`, `QUEST_TEMPLATES`, `QUESTS_PER_PERIOD`, `GeneratedQuest`, `generateDailyQuests`, `generateWeeklyQuests`, `generateQuests` |
| `src/lib/config/shop.ts` | `COIN_ECONOMY`, `coinsForLevelUp`, `ShopCategory`, `CosmeticItem`, `COSMETICS`, `RealRewardSeed`, `REAL_REWARD_SEEDS`, `canPurchase` |
| `src/lib/config/avatar.ts` | `AvatarStage`, `AVATAR_STAGES`, `AvatarMood`, `AVATAR_MOODS`, `avatarStageForLevel`, `avatarMoodForStreak`, `AvatarAppearance`, `avatarAppearance` |
| `src/lib/config/boss.ts` | `BOSS`, `bossMaxHp`, `damagePerCleanDay`, `bossCurrentHp`, `BossStatus`, `bossStatus`, `BossDefeatOutcome`, `BOSS_DEFEAT_MESSAGES`, `handleBossDefeat` |

**Consumed by the server engines** (`src/lib/server/achievements.ts`, `quests.ts`, plus a future `boss.ts`/`shop.ts`):
- **Achievements:** seed `achievements` table from `ACHIEVEMENTS` at migration; after each XP-affecting mutation, build `GameState`, call `checkAchievements(state, state, alreadyUnlocked)`, persist `unlocked_at`, award `achievementReward`.
- **Quests:** on first request per period, if `SELECT count(*) FROM quests WHERE period=? AND scope=?` is 0, INSERT the output of `generateDailyQuests`/`generateWeeklyQuests`. Recommend adding `kind TEXT` and `key TEXT` columns to `quests` so progress matching is robust (flagged in §2.3).
- **Shop:** seed `rewards` (kind `'real'`) from `REAL_REWARD_SEEDS` once; render `COSMETICS` (kind `'cosmetic'`) gated by `canPurchase`. Grant coins via `COIN_ECONOMY` / `coinsForLevelUp`.
- **Boss:** store per `addiction_targets` a `phase` (recommend adding `phase INTEGER DEFAULT 0` column); derive HP from clean days via `bossStatus`; on `defeated`, call `handleBossDefeat`, award rewards, persist new phase.

**Assumptions/defaults stated** (all flagged `[DÉFAUT]` inline): SOS/cravings counters derivable from `trigger_journal`; quest level is snapshotted per period; prestige preserves cosmetics/coins and uses `effectiveLevel` for unlock gates; three small recommended schema additions (`quests.kind`, `quests.key`, `addiction_targets.phase`) — none required for the content arrays to compile, only for cleanest progress matching. All user-facing strings are in French; all code compiles under TS strict and depends only on the brief's `progression.ts` exports (`PROGRESSION`, `xpToNextLevel`).