I've read the full spec. Now I'll produce the complete UI system & component library design artifact. This is a design-only task — I'll return the artifact as markdown text.

# HabitQuest — UI System & Component Library (Design Artifact)

Mobile-first, dark-default, sober satisfying motion. SvelteKit 2 + Svelte 5 runes, Tailwind v3 classic config. All user-facing strings in French. Engineer implements verbatim.

---

## 0. Stated defaults (where the brief is silent)

- **Avatar art**: no external asset pipeline. The avatar/créature is rendered as an inline SVG that swaps a small set of "stages" by level band (0–9, 10–24, 25–49, 50+/prestige). I specify the bands; the actual SVG glyphs are placeholder emoji-in-circle fallbacks so the engineer can ship before art exists.
- **Color mode**: dark only is shipped first; tokens are authored as CSS custom properties so a light theme is a later swap. `<html class="dark">` is hardcoded in `app.html`.
- **Icons**: habit/category icons are single emoji stored in `habits.icon`; no icon font dependency.
- **Swipe lib**: none. Pointer events + a tiny custom Svelte action `swipeable` (specified below). No `hammerjs`/`use-gesture`.
- **Confetti**: hand-rolled DOM-particle "confetti-lite", ~24 nodes, CSS-animated, auto-removed. No `canvas-confetti`.
- **Tween/spring**: use `svelte/motion` (`Tween`, `Spring` — Svelte 5 class form) which ships with Svelte; not a heavy dep.
- **Toast/overlay layer**: a single client store + one `<ToastHost>` / `<OverlayHost>` mounted once in `+layout.svelte`. This is the *only* genuinely shared cross-component client state, so it (and a tiny `userState` cache) are the only writable stores.
- **Currency naming (FR)**: pièces (coins), XP, série (streak), boss, économies (money saved).
- **Breakpoints**: design at 380px; `sm:` (640px) widens cards to a centered 480px column on tablet/desktop. App is locked to a max content width of `max-w-[480px] mx-auto`.

---

## 1. Design tokens

### 1.1 `tailwind.config.js` — `theme.extend` (paste verbatim)

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // base & surfaces (dark-first)
        bg:        'rgb(var(--c-bg) / <alpha-value>)',        // app background
        surface:   'rgb(var(--c-surface) / <alpha-value>)',   // cards layer 1
        surface2:  'rgb(var(--c-surface-2) / <alpha-value>)', // raised / inputs layer 2
        border:    'rgb(var(--c-border) / <alpha-value>)',
        // text
        text:      'rgb(var(--c-text) / <alpha-value>)',
        muted:     'rgb(var(--c-muted) / <alpha-value>)',
        // brand
        primary:   'rgb(var(--c-primary) / <alpha-value>)',
        'primary-700': 'rgb(var(--c-primary-700) / <alpha-value>)',
        accent:    'rgb(var(--c-accent) / <alpha-value>)',
        // semantic game tokens
        xp:        'rgb(var(--c-xp) / <alpha-value>)',
        flame:     'rgb(var(--c-flame) / <alpha-value>)',   // streak
        gold:      'rgb(var(--c-gold) / <alpha-value>)',    // coins
        health:    'rgb(var(--c-health) / <alpha-value>)',  // recovery green
        danger:    'rgb(var(--c-danger) / <alpha-value>)',
        boss:      'rgb(var(--c-boss) / <alpha-value>)',
      },
      borderRadius: {
        sm: '0.375rem',  // 6px
        DEFAULT: '0.625rem', // 10px
        lg: '0.875rem',  // 14px  (cards)
        xl: '1.25rem',   // 20px  (sheets/modals)
        '2xl': '1.75rem',// 28px  (overlays)
        pill: '9999px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // game numerals / level badge
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:  '0 1px 2px 0 rgb(0 0 0 / 0.30), 0 1px 1px -1px rgb(0 0 0 / 0.25)',
        raised:'0 4px 14px -4px rgb(0 0 0 / 0.45)',
        glow:  '0 0 0 1px rgb(var(--c-primary) / 0.35), 0 0 18px -2px rgb(var(--c-primary) / 0.45)',
      },
      transitionTimingFunction: {
        'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)', // satisfying ease-out
        'spring':   'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'flame-pulse': {
          '0%,100%': { transform: 'scale(1)',    opacity: '1' },
          '50%':     { transform: 'scale(1.12)', opacity: '0.92' },
        },
        'coin-pop': {
          '0%':   { transform: 'translateY(0) scale(1)' },
          '40%':  { transform: 'translateY(-2px) scale(1.18)' },
          '100%': { transform: 'translateY(0) scale(1)' },
        },
        'toast-in': {
          from: { transform: 'translateY(-120%)', opacity: '0' },
          to:   { transform: 'translateY(0)',      opacity: '1' },
        },
        'sheen': {
          '0%':   { transform: 'translateX(-120%)' },
          '100%': { transform: 'translateX(220%)' },
        },
        'ping-ring': {
          '0%':   { transform: 'scale(0.6)', opacity: '0.6' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
      },
      animation: {
        'flame-pulse': 'flame-pulse 1.6s ease-in-out infinite',
        'coin-pop':    'coin-pop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
        'toast-in':    'toast-in 0.32s cubic-bezier(0.22,1,0.36,1)',
        'sheen':       'sheen 1.1s ease-out',
        'ping-ring':   'ping-ring 0.7s ease-out',
      },
    },
  },
  plugins: [],
};
```

### 1.2 `src/app.css` — CSS custom properties + base + utilities (paste verbatim)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ---- Design tokens (dark default). Values are "R G B" for rgb()/alpha. ---- */
:root, .dark {
  --c-bg:         13 15 20;     /* #0D0F14  near-black blue */
  --c-surface:    23 26 34;     /* #171A22  card */
  --c-surface-2:  33 38 50;     /* #212632  raised/input */
  --c-border:     46 53 68;     /* #2E3544 */
  --c-text:       232 236 244;  /* #E8ECF4 */
  --c-muted:      147 156 175;  /* #939CAF */

  --c-primary:    109 124 255;  /* #6D7CFF  indigo */
  --c-primary-700:79 94 232;    /* #4F5EE8 */
  --c-accent:     45 212 191;   /* #2DD4BF  teal */

  --c-xp:         124 138 255;  /* #7C8AFF  (xp bar) */
  --c-flame:      255 138 61;   /* #FF8A3D  streak/flame */
  --c-gold:       247 195 64;   /* #F7C340  coins */
  --c-health:     52 199 123;   /* #34C77B  recovery green */
  --c-danger:     239 99 99;    /* #EF6363 */
  --c-boss:       224 76 92;    /* #E04C5C  boss red */

  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --nav-h: 64px;
}

@layer base {
  html { -webkit-tap-highlight-color: transparent; }
  body {
    @apply bg-bg text-text font-sans antialiased;
    overscroll-behavior-y: none;
  }
  /* native one-tap feel: no text selection on controls */
  button, [role='button'] { @apply select-none; touch-action: manipulation; }
  /* focus ring (keyboard) */
  :focus-visible { @apply outline-none ring-2 ring-primary/70 ring-offset-2 ring-offset-bg; }
}

@layer components {
  .card {
    @apply bg-surface border border-border rounded-lg shadow-card p-4;
  }
  .card-2 { @apply bg-surface2 border border-border rounded-lg; }

  .btn {
    @apply inline-flex items-center justify-center gap-2 rounded-DEFAULT
           px-4 h-11 text-sm font-medium select-none
           transition-[transform,background-color,opacity] duration-150 ease-out-soft
           active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none;
  }
  .btn-primary { @apply btn bg-primary text-white hover:bg-primary-700 shadow-card; }
  .btn-ghost   { @apply btn bg-transparent text-muted hover:text-text hover:bg-surface2; }
  .btn-danger  { @apply btn bg-danger/15 text-danger hover:bg-danger/25; }
  .btn-icon    { @apply btn h-11 w-11 p-0 rounded-pill; }

  .pill { @apply inline-flex items-center gap-1.5 rounded-pill px-2.5 h-7 text-xs font-medium; }

  .input {
    @apply card-2 w-full px-3 h-11 text-text placeholder:text-muted
           focus:ring-2 focus:ring-primary/60;
  }
  .label { @apply block text-xs font-medium text-muted mb-1.5; }

  /* layered progress track used by XpBar / BossHpBar */
  .track { @apply relative h-2.5 rounded-pill bg-surface2 overflow-hidden; }
  .track-fill { @apply absolute inset-y-0 left-0 rounded-pill; }
}

@layer utilities {
  .pb-safe { padding-bottom: calc(var(--safe-bottom) + 0.5rem); }
  .pt-safe { padding-top: calc(var(--safe-top) + 0.5rem); }
  .pb-nav  { padding-bottom: calc(var(--nav-h) + var(--safe-bottom)); } /* content above bottom nav */
  .no-scrollbar::-webkit-scrollbar { display: none; }
  .no-scrollbar { scrollbar-width: none; }
}

/* ---- Reduced motion: kill all decorative animation globally ---- */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 2. Global layout

### 2.1 Files

```
src/routes/+layout.svelte          # shell: header + <slot/> + BottomNav + hosts
src/routes/+layout.ts              # load: returns userState snapshot (SSR-safe)
src/lib/components/layout/AppHeader.svelte
src/lib/components/layout/BottomNav.svelte
src/lib/components/feedback/ToastHost.svelte
src/lib/components/feedback/OverlayHost.svelte
src/lib/stores/ui.svelte.ts        # toasts + overlays (shared client state)
src/lib/stores/userState.svelte.ts # cached level/xp/coins for header reactivity
```

### 2.2 `+layout.svelte` structure

```svelte
<script lang="ts">
  import AppHeader from '$lib/components/layout/AppHeader.svelte';
  import BottomNav from '$lib/components/layout/BottomNav.svelte';
  import ToastHost from '$lib/components/feedback/ToastHost.svelte';
  import OverlayHost from '$lib/components/feedback/OverlayHost.svelte';
  let { children, data } = $props();
</script>

<div class="min-h-dvh bg-bg flex flex-col mx-auto max-w-[480px]">
  <AppHeader user={data.user} />
  <main class="flex-1 px-4 pt-3 pb-nav">
    {@render children()}
  </main>
  <BottomNav />
</div>

<ToastHost />
<OverlayHost />
```

- `min-h-dvh` (dynamic viewport) avoids mobile URL-bar jump.
- `pb-nav` reserves bottom-nav + safe-area space so content never hides behind the bar.
- Header is **sticky**, not fixed, so it scrolls naturally on long pages but the XP bar stays at top via `sticky top-0 z-30` inside `AppHeader`.

### 2.3 Header (`AppHeader.svelte`)

Layout (single row, 56px tall + safe-top):

```
[ AvatarMini + LevelBadge ]      [ CoinPill ]        [ ⚙ settings ]
[ ───────────── XpBar (full width, compact) ───────────── ]
```

```svelte
<script lang="ts">
  import LevelBadge from '$lib/components/game/LevelBadge.svelte';
  import CoinPill from '$lib/components/game/CoinPill.svelte';
  import XpBar from '$lib/components/game/XpBar.svelte';
  import { levelFromXp } from '$lib/config/progression';
  let { user }: { user: { totalXp: number; coins: number; prestige: number } } = $props();
  const lvl = $derived(levelFromXp(user.totalXp));
</script>

<header class="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border pt-safe">
  <div class="px-4 h-14 flex items-center justify-between gap-3">
    <a href="/" class="flex items-center gap-2" aria-label="Profil">
      <LevelBadge level={lvl.level} prestige={user.prestige} size="sm" />
    </a>
    <div class="flex items-center gap-2">
      <CoinPill amount={user.coins} />
      <a href="/reglages" class="btn-icon" aria-label="Réglages">⚙️</a>
    </div>
  </div>
  <div class="px-4 pb-2">
    <XpBar intoLevel={lvl.intoLevel} needed={lvl.needed} compact />
  </div>
</header>
```

### 2.4 Bottom tab bar (`BottomNav.svelte`)

Fixed, 4 tabs, mobile-first, safe-area aware. Active tab = primary color + filled icon + label.

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  const tabs = [
    { href: '/',           label: 'Accueil',     icon: '🏠' },
    { href: '/habitudes',  label: 'Habitudes',   icon: '✅' },
    { href: '/addictions', label: 'Addictions',  icon: '🛡️' },
    { href: '/boutique',   label: 'Boutique',    icon: '🪙' },
  ];
  const isActive = (href: string) =>
    href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
</script>

<nav class="fixed bottom-0 inset-x-0 z-40 mx-auto max-w-[480px]
            bg-surface/95 backdrop-blur-md border-t border-border pb-safe"
     style="height: calc(var(--nav-h) + var(--safe-bottom));">
  <ul class="h-[var(--nav-h)] grid grid-cols-4">
    {#each tabs as t}
      <li>
        <a href={t.href}
           class="h-full flex flex-col items-center justify-center gap-0.5 text-[11px]
                  transition-colors {isActive(t.href) ? 'text-primary' : 'text-muted'}"
           aria-current={isActive(t.href) ? 'page' : undefined}>
          <span class="text-xl leading-none {isActive(t.href) ? 'drop-shadow-[0_0_8px_rgb(var(--c-primary)/0.6)]' : ''}">{t.icon}</span>
          <span class="font-medium">{t.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
```

> Tab labels: **Accueil / Habitudes / Addictions / Boutique** (the brief listed "Dashboard / Habitudes / Addictions / Boutique"; FR "Dashboard" → **Accueil**, since dashboard route is `/`).

### 2.5 One-tap habit validation reachability

- The **Accueil** (`/`) dashboard is tab #1, so it is one tap away on launch.
- On the dashboard, the **first card** is `QuestList` summary + a **"Habitudes du jour"** section listing today's `HabitRow`s. Each `HabitRow` has a large (44×44 min touch target) round **done** button on the right.
- Validating = **one tap on that button** → optimistic XP/coin/streak update + toast. No navigation, no modal, no confirm. (Skip/relapse require an intentional gesture — swipe or long-press — so they are never accidental.)
- A persistent **FAB** is *not* used (would overlap bottom nav); instead the dashboard's habit list is the primary surface. Empty state on the dashboard shows a single big `btn-primary` "Créer ma première habitude".

---

## 3. Full component tree

Conventions for all components below:
- Svelte 5 runes: `let { ... }: Props = $props();`. Each spec gives the **exact `Props` TS interface**.
- Domain types referenced (defined in `src/lib/types.ts`):

```ts
export type HabitType = 'build' | 'break';
export type LogStatus = 'done' | 'skipped' | 'relapsed';

export interface Habit {
  id: number; name: string; type: HabitType;
  category: string | null; difficulty: 1 | 2 | 3;
  icon: string | null; archived: 0 | 1;
}
export interface HabitToday extends Habit {
  status: LogStatus | null; // today's log status, null = pending
  streak: number;           // consecutive 'done' days incl. today if done
}
export interface Quest {
  id: number; scope: 'daily' | 'weekly';
  description: string; target: number; progress: number;
  rewardXp: number; rewardCoins: number; completed: 0 | 1;
}
export interface BossState {
  id: number; name: string;
  hp: number; maxHp: number;       // maxHp derived from goal days
  cleanDays: number; bestStreakDays: number;
  moneySaved: number; moneyPerDay: number;
}
export interface Reward {
  id: number; name: string; cost: number;
  kind: 'cosmetic' | 'real'; claimed: boolean; affordable: boolean;
}
export interface Achievement { key: string; name: string; description: string; unlocked: boolean; }
```

### 3.1 Game / progression components — `src/lib/components/game/`

**`AvatarCard.svelte`** — hero card on dashboard.
```ts
interface Props {
  level: number;
  intoLevel: number;
  needed: number;
  coins: number;
  prestige: number;
  name?: string;            // user/creature name, default "Compagnon"
  topStreak?: number;       // best current streak across habits → drives flame ring
}
```
Behavior: large circular avatar (SVG stage by level band — see §0), `LevelBadge` overlapping bottom-right, name, embedded `XpBar` (non-compact), and a `StreakFlame` chip if `topStreak > 0`. Avatar gets a subtle `shadow-glow` ring whose intensity scales with level band. On level band change (via `$effect` watching `level`) plays a one-shot `animate-sheen` highlight across the avatar.

**`XpBar.svelte`**
```ts
interface Props {
  intoLevel: number;
  needed: number;
  compact?: boolean;        // header variant: thinner, no label
  animate?: boolean;        // default true; tween fill on value change
}
```
Behavior: `.track` + `.track-fill` colored `bg-xp`. Fill width = `intoLevel/needed`. Uses a `Tween` (svelte/motion, `easing: cubicOut`, `duration: 600`) on the percentage so XP gains animate smoothly. Non-compact shows `{intoLevel} / {needed} XP` right-aligned in `text-muted text-xs`. A faint `animate-sheen` pseudo-overlay runs once when fill increases. Respects reduced motion (Tween duration → 0 when `prefers-reduced-motion`, read via a `mediaQuery` helper).

**`LevelBadge.svelte`**
```ts
interface Props {
  level: number;
  prestige?: number;        // > 0 shows a star/roman-numeral ring
  size?: 'sm' | 'md' | 'lg';// sm=28px, md=40px, lg=56px
}
```
Behavior: hexagon/disc badge, `font-display` numeral, `bg-surface2` with `border-primary/40`. If `prestige>0`, render a gold ring + small "★{prestige}". `lg` used inside `LevelUpOverlay`.

**`CoinPill.svelte`**
```ts
interface Props {
  amount: number;
  delta?: number;           // optional recent gain → triggers coin-pop + "+N" float
}
```
Behavior: `.pill bg-gold/15 text-gold`, coin glyph 🪙 + formatted amount (thin-space thousands: `1 250`). When `delta` changes to a positive value (`$effect`), the glyph plays `animate-coin-pop` and a small `+{delta}` span floats up and fades (CSS keyframe, 600ms) then resets. Number itself counts up via a `Tween` (integer rounding).

**`StreakFlame.svelte`**
```ts
interface Props {
  days: number;
  size?: 'sm' | 'md';
  showLabel?: boolean;      // "{days} j"
}
```
Behavior: flame emoji/SVG in `text-flame`. Idle = static. If `days >= 3` the flame gets `animate-flame-pulse`; intensity (drop-shadow glow) scales in 3 tiers: 3–6, 7–29, 30+. `0` days → muted gray flame, no pulse. Label "{days} j".

### 3.2 Habits — `src/lib/components/habits/`

**`HabitRow.svelte`** — core one-tap row. Most behavior-rich component.
```ts
interface Props {
  habit: HabitToday;
  ondone: (id: number) => void;       // optimistic: parent updates store, fires API
  onskip: (id: number) => void;
  onrelapse: (id: number) => void;    // for type 'break'
  onundo?: (id: number) => void;      // undo last action (toast action)
}
```
Behavior:
- Layout: `[icon] [name + streak chip] ........ [action button]`. Min height 56px, full row tappable target on the right button only.
- **One-tap done**: right button is a 44×44 round outline → on tap, optimistically flips to filled `bg-primary` with a check, fires `onordone`, plays `animate-ping-ring` behind it + `StreakFlame` increments. Row dims/strikes name softly (`text-muted line-through/none` — keep gentle, no harsh red).
- **Already done today** (`status==='done'`): button is filled/disabled-looking; tapping again does nothing (anti-farming mirrors `UNIQUE(habit_id,date)`); long-press offers "Annuler" (undo) via `onundo`.
- **Swipe gesture** (custom `swipeable` action, §5.4): swipe-left reveals secondary actions. For `type:'build'` → **"Passer"** (skip, neutral gray). For `type:'break'` → **"Rechute"** (relapse). Relapse styling is **deliberately non-punitive**: amber/`bg-surface2`, label "J'ai cédé", never red full-bleed; on commit shows an encouraging toast ("On note, on repart. 💪").
- **Long-press** (500ms) opens the same skip/relapse action sheet for accessibility (gesture alternative).
- All mutations are **optimistic**: parent flips local store immediately, then POSTs; on API failure a toast with "Réessayer" reverts.

**`HabitForm.svelte`** — create/edit (used in a Modal or `/habitudes/nouvelle`).
```ts
interface Props {
  habit?: Habit;                       // present = edit mode
  onsubmit: (data: HabitInput) => void;
  oncancel: () => void;
  submitting?: boolean;
}
// HabitInput = Omit<Habit,'id'|'archived'>
```
Behavior: fields — Nom (`input`), Type segmented control **"À construire" / "À arrêter"**, Catégorie (`input` w/ datalist of existing), Difficulté (3-segment 1–3 with XP preview "≈ {XP_PER_HABIT × diff} XP"), Icône (emoji picker grid of ~24 presets). Submit = `btn-primary` "Enregistrer", cancel = `btn-ghost`. Inline validation: name required, French error "Donne un nom à ton habitude."

### 3.3 Quests — `src/lib/components/quests/`

**`QuestList.svelte`**
```ts
interface Props {
  quests: Quest[];
  onclaim: (id: number) => void;
  title?: string;           // default "Quêtes du jour"
}
```
Behavior: section header with count "{done}/{total}", grid of `QuestCard`. Empty → `EmptyState` "Aucune quête active." (renewed each period server-side).

**`QuestCard.svelte`**
```ts
interface Props {
  quest: Quest;
  onclaim: (id: number) => void;
}
```
Behavior: `.card` with scope badge (`pill`: "Jour" / "Semaine"), description, a thin progress track (`progress/target`), reward row (`+{rewardXp} XP`, `+{rewardCoins} 🪙`). States: in-progress (track), **completable** (`progress>=target && !completed`) → glowing `btn-primary` "Réclamer" (pulses subtly); **claimed** (`completed`) → dimmed with check + "Réclamée". Claim fires `onclaim`, triggers `CoinPill` delta + XP bar tween at app level.

### 3.4 Addictions / boss — `src/lib/components/addictions/`

**`BossPanel.svelte`**
```ts
interface Props {
  boss: BossState;
  onsos: () => void;        // opens SosModal
}
```
Behavior: `.card` with `border-boss/30`. Header: boss name + `BossHpBar`. Body grid: `StreakFlame days={boss.cleanDays}` ("clean"), `MoneySaved`, "Record : {bestStreakDays} j" (always show best to reinforce non-punitive framing). Prominent `btn` (boss-tinted) **"SOS envie"** → `onsos`. Each clean day "damages" boss → HP descends.

**`BossHpBar.svelte`**
```ts
interface Props {
  hp: number; maxHp: number;
  label?: string;           // default name
}
```
Behavior: `.track` taller (h-3), `.track-fill bg-boss` width = `hp/maxHp`, with a subtle damage flash (`animate-sheen` in white/30) when `hp` drops. Shows "{remaining} jours pour vaincre {name}". When `hp<=0` → bar turns `bg-health`, label "Vaincu ! 🎉".

**`MoneySaved.svelte`**
```ts
interface Props {
  amount: number;           // euros
  perDay?: number;
  currency?: string;        // default '€'
}
```
Behavior: big `font-display text-health` counter, count-up `Tween` on mount/update. Subtitle "{perDay} {currency}/jour économisés". Format with FR locale (`1 234,50 €`).

**`HealthTimeline.svelte`**
```ts
interface Props {
  cleanDays: number;
  milestones?: HealthMilestone[]; // default = TABAC_MILESTONES below
}
// interface HealthMilestone { day: number; title: string; body: string; }
```
Behavior: vertical timeline; each milestone node is `health`-green & filled if `cleanDays>=day`, else muted/outline. Current (next) milestone highlighted with a progress hint "Dans {day-cleanDays} jours". Generic, encouraging copy (see §6 content). The reached node nearest top auto-scrolls into view.

**`TriggerJournalForm.svelte`**
```ts
interface Props {
  targetId: number;
  onsubmit: (entry: TriggerInput) => void;
  oncancel?: () => void;
}
// TriggerInput { targetId:number; trigger:string; craving:number; note:string; gaveIn:boolean; }
```
Behavior: Déclencheur (`input` + datalist of common FR triggers: "Stress", "Ennui", "Soirée", "Café", "Après repas", "Émotion"), **Intensité de l'envie** slider 1–10 (color shifts green→amber→danger), Note (textarea), toggle **"J'ai cédé"** (neutral, not shaming). Submit "Enregistrer". Encouraging helper text: "Noter une envie, c'est déjà une victoire."

**`TriggerTrends.svelte`**
```ts
interface Props {
  entries: TriggerEntry[];  // last N
}
```
Behavior: simple CSS bar charts (no chart lib): (1) top triggers by count, (2) average craving by trigger, (3) "résisté vs cédé" ratio donut (conic-gradient). All `health`/`flame` tinted, captions in FR. If `<3` entries → `EmptyState` "Note quelques envies pour voir tes tendances."

**`CircularBreathing.svelte`** — coherence-breathing animation (inside SOS).
```ts
interface Props {
  pattern?: [number, number, number]; // inhale, hold, exhale seconds; default [4,0,6] (5.5/min coherence)
  cycles?: number;          // default 6 (~1 min)
  onfinish?: () => void;
}
```
Behavior: a single circle that scales 1→1.6 over `inhale`, holds, shrinks over `exhale`, looping `cycles` times. Phase label updates: **"Inspire" / "Retiens" / "Expire"**. Ring colored `accent`/`health`. Driven by a `Tween` (or CSS animation with `animation-duration` set from pattern). A subtle count "{n}/{cycles}". On reduced-motion: circle does NOT pulse; instead show a numeric countdown per phase. Calls `onfinish`.

**`SosModal.svelte`**
```ts
interface Props {
  open: boolean;
  onclose: () => void;
  bossName?: string;
}
```
Behavior: full-height sheet (`Modal` variant `sheet`). Three calm sections: (1) `CircularBreathing`, (2) rotating **message motivant** (array §6, picks random), (3) a **mini-jeu de distraction** — a simple "tap the moving dot 10×" or "respire 1 min" tile (specify: tap-target game using `$state` counter, 60s, no scoreboard pressure). Footer: "Ça va mieux" (`btn-primary`, closes) + discreet "Noter ce qui s'est passé" → opens `TriggerJournalForm`. No red, no timer pressure; tone reassuring.

### 3.5 Rewards / shop — `src/lib/components/shop/`

**`ShopGrid.svelte`**
```ts
interface Props {
  rewards: Reward[];
  coins: number;
  onbuy: (id: number) => void;
}
```
Behavior: 2-col grid (`grid-cols-2 gap-3`), section split **"Cosmétiques"** / **"Mes récompenses"** (kind). Header shows balance via `CoinPill`.

**`RewardCard.svelte`**
```ts
interface Props {
  reward: Reward;
  affordable: boolean;
  onbuy: (id: number) => void;
}
```
Behavior: `.card` centered: emoji/preview, name, cost `pill bg-gold/15`. Button: affordable & unclaimed → `btn-primary` "Acheter"; not affordable → disabled "Manque {n} 🪙"; claimed → `pill bg-health/15` "Obtenue ✓". Buy → confirm via `ConfirmDialog` for `kind:'real'` only ("Échanger {cost} pièces contre « {name} » ?"), cosmetics buy instantly with coin-spend animation.

### 3.6 Feedback primitives — `src/lib/components/feedback/`

**`Modal.svelte`**
```ts
interface Props {
  open: boolean;
  onclose: () => void;
  title?: string;
  variant?: 'center' | 'sheet'; // sheet = bottom, center = dialog
  dismissible?: boolean;        // default true (backdrop/esc close)
  children: import('svelte').Snippet;
  footer?: import('svelte').Snippet;
}
```
Behavior: backdrop `bg-black/60 backdrop-blur-sm` (fade), panel `rounded-xl bg-surface border-border`. `sheet` slides up from bottom (`fly y:100%`), `center` scales+fades (`scale 0.96→1`). Traps focus, ESC closes if dismissible, restores focus on close, body scroll-lock. Mounted via portal (`{#if open}` at host) — see `OverlayHost`.

**`ConfirmDialog.svelte`**
```ts
interface Props {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;   // default "Confirmer"
  cancelLabel?: string;    // default "Annuler"
  tone?: 'default' | 'danger';
  onconfirm: () => void;
  oncancel: () => void;
}
```
Behavior: thin wrapper over `Modal variant="center"`. `danger` tone uses `btn-danger` confirm. Used for: relapse-from-menu, archive habit, prestige reset, buy real reward.

**`Toast.svelte`** + **`ToastHost.svelte`**
```ts
// Toast.svelte
interface Props {
  toast: ToastItem;
  ondismiss: (id: string) => void;
}
// ToastItem (in ui store)
interface ToastItem {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'flame' | 'gold' | 'danger';
  icon?: string;
  action?: { label: string; run: () => void }; // e.g. "Annuler"
  duration?: number;       // ms, default 3200
}
```
Behavior: `ToastHost` reads `ui.toasts` store, stacks max 3 at top (under header) using `animate-toast-in` + `fly`/`fade` out, auto-dismiss timer (paused on hover/focus). Tone sets accent stripe color. Action button (e.g. **"Annuler"** for undo, **"Réessayer"** on failure).

**`AchievementToast.svelte`** — richer than plain toast, for badge unlocks.
```ts
interface Props {
  achievement: Achievement;
  onclose: () => void;
}
```
Behavior: wide card sliding from top with `animate-toast-in`, gold border + `animate-sheen` sweep, "🏆 Succès débloqué", `name`, `description`. Tap to dismiss; auto after 4s. Optionally light confetti-lite burst (§4). Triggered through the ui store (`ui.pushAchievement`).

**`LevelUpOverlay.svelte`** — celebration.
```ts
interface Props {
  open: boolean;
  level: number;
  rewards?: { coins?: number; unlocked?: string[] }; // e.g. cosmetics unlocked
  onclose: () => void;
}
```
Behavior: full-screen `bg-bg/80 backdrop-blur-md`, centered `LevelBadge size="lg"` that scales-in (`scale 0.4→1` spring) with radiating `animate-ping-ring`, headline **"Niveau {level} !"**, sub "Continue comme ça.", reward chips (`+{coins} 🪙`, "Nouveau cosmétique débloqué"). Confetti-lite burst on open. Dismiss by tap anywhere or auto after 3.5s. Reduced-motion: no confetti, no spring overshoot — straight fade + static badge.

### 3.7 Generic — `src/lib/components/ui/`

**`EmptyState.svelte`**
```ts
interface Props {
  icon?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onaction?: () => void;
}
```
Behavior: centered, muted, big emoji, title, optional `btn-primary` action. Used on empty habits/quests/shop/trends.

**`SegmentedControl.svelte`** (used by HabitForm, difficulty, etc.)
```ts
interface Props {
  options: { value: string; label: string }[];
  value: string;
  onchange: (v: string) => void;
  ariaLabel?: string;
}
```
Behavior: pill track, sliding active indicator (`bg-primary`, animated via shared layout — translate the indicator with CSS transition).

### 3.8 Component dependency map

```
+layout.svelte
 ├─ AppHeader ── LevelBadge, CoinPill, XpBar
 ├─ BottomNav
 ├─ ToastHost ── Toast, AchievementToast
 └─ OverlayHost ── Modal, ConfirmDialog, LevelUpOverlay, SosModal

/ (Accueil)
 ├─ AvatarCard ── XpBar, LevelBadge, StreakFlame
 ├─ QuestList ── QuestCard
 ├─ HabitRow (today's list) ── StreakFlame   [swipeable action]
 └─ BossPanel (compact) ── BossHpBar, MoneySaved, StreakFlame

/habitudes ── HabitRow, HabitForm(Modal), EmptyState, SegmentedControl
/addictions ── BossPanel, BossHpBar, MoneySaved, HealthTimeline,
               TriggerJournalForm, TriggerTrends, SosModal ── CircularBreathing
/boutique ── ShopGrid ── RewardCard, CoinPill, ConfirmDialog
```

---

## 4. Animations (Svelte transitions / CSS only)

All durations chosen "sober": 150–650ms, ease-out. Every effect guarded by `prefers-reduced-motion` (global CSS kill-switch in §1.2 + JS `reducedMotion()` helper for tween durations).

Helper (`src/lib/motion.ts`):
```ts
export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' &&
  matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dur = (ms: number) => (reducedMotion() ? 0 : ms);
```

1. **Level-up overlay** — `LevelUpOverlay`. Backdrop `fade` (200ms). Badge enters with `Spring` scale (`stiffness:0.12, damping:0.5`) from 0.4→1 (slight overshoot). Two `animate-ping-ring` divs behind badge (staggered 0/150ms). Confetti-lite burst (#6). Headline `fly` up 12px + fade (250ms, delay 120ms). Reduced-motion: badge static at scale 1, just backdrop fade, no rings/confetti.

2. **XP bar fill tween** — `XpBar`. `Tween` of fill percentage, `duration: dur(600)`, `easing: cubicOut`. On increase, a `.sheen` highlight (`animate-sheen` once, `bg-gradient-to-r from-transparent via-white/25 to-transparent`) sweeps the filled portion. On level-up, bar fills to 100%, brief 120ms hold, then resets to new `intoLevel/needed` (caller orchestrates).

3. **Coin tick** — `CoinPill`. Displayed number is a `Tween<number>` (`duration: dur(500)`, rounded each frame). On positive `delta`: glyph `animate-coin-pop` (0.45s spring keyframe) + a `+{delta}` span absolutely positioned that floats up 16px and fades (CSS `coin-float` keyframe, 600ms) then removed.

4. **Flame pulse** — `StreakFlame`. `animate-flame-pulse` (1.6s infinite) only when `days>=3`; glow drop-shadow tier by streak. Static otherwise. Pure CSS keyframe → automatically frozen by reduced-motion kill-switch.

5. **Achievement toast slide** — `AchievementToast`. Enters `animate-toast-in` (translateY −120%→0 + fade, 320ms ease-out-soft); gold `animate-sheen` sweep once after entry (300ms delay). Exits with Svelte `fly={{ y:-40, duration: dur(220) }}` + `fade`. Stacking handled by host (gap + reflow).

6. **Confetti-lite** — `src/lib/components/feedback/confetti.ts` (function, not component):
```ts
export function confettiLite(anchor: HTMLElement, count = 24): void;
```
Creates `count` small absolutely-positioned `<i>` nodes (4–8px, colors from `--c-primary/--c-gold/--c-flame/--c-health`), random x-spread + gravity via a single CSS keyframe `confetti-fall` (translate + rotate, 900–1300ms randomized via inline `animation-duration`/`--dx`), appended to a fixed overlay, removed on `animationend`. No canvas, no rAF loop, no dep. Early-returns (no-op) when `reducedMotion()`. Used by `LevelUpOverlay` and optionally `AchievementToast`.

7. **HabitRow done** — round button: check icon `scale 0.6→1` (150ms spring), `animate-ping-ring` behind it once, row background brief `bg-health/10` flash (200ms) then settle. Skip/relapse swipe: action panel reveals via translateX (pointer-driven, no transition while dragging; snap-back/commit uses 180ms ease-out-soft transition).

8. **Modal / sheet** — backdrop `fade dur(200)`; `center` panel `scale:{ start:0.96, duration: dur(220) }`+fade; `sheet` panel `fly:{ y: '100%', duration: dur(260), easing: cubicOut }`.

9. **QuestCard claimable pulse** — when completable, the "Réclamer" button has a soft `box-shadow` pulse (custom 2.4s keyframe, low-amplitude) to draw the eye without nagging. Frozen under reduced-motion.

10. **SegmentedControl indicator** — active pill indicator translateX with `transition: transform 180ms cubic-bezier(.22,1,.36,1)`.

Add the supporting keyframes to `tailwind.config.js` (already includes `flame-pulse`, `coin-pop`, `toast-in`, `sheen`, `ping-ring`); also add to `app.css` `@layer utilities` the non-Tailwind ones:

```css
@keyframes coin-float { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-16px); } }
@keyframes confetti-fall {
  to { transform: translate(var(--dx,0), 60vh) rotate(720deg); opacity: 0; }
}
@keyframes claim-pulse {
  0%,100% { box-shadow: 0 0 0 0 rgb(var(--c-primary)/0.0); }
  50%     { box-shadow: 0 0 0 6px rgb(var(--c-primary)/0.12); }
}
.animate-claim-pulse { animation: claim-pulse 2.4s ease-in-out infinite; }
.animate-coin-float  { animation: coin-float 0.6s ease-out forwards; }
```

---

## 5. Shared client state, gestures, content

### 5.1 `src/lib/stores/ui.svelte.ts` — the single shared UI store (runes-in-module)

```ts
// Genuinely shared cross-component client state → allowed as a module store.
import type { ToastItem } from '$lib/types';
import type { Achievement } from '$lib/types';

class UiStore {
  toasts = $state<ToastItem[]>([]);
  levelUp = $state<{ level: number; coins?: number; unlocked?: string[] } | null>(null);
  achievementQueue = $state<Achievement[]>([]);
  sosOpen = $state(false);

  toast(t: Omit<ToastItem, 'id'>) {
    const id = crypto.randomUUID();
    this.toasts.push({ id, duration: 3200, tone: 'info', ...t });
  }
  dismiss(id: string) { this.toasts = this.toasts.filter(x => x.id !== id); }
  celebrateLevel(level: number, coins?: number, unlocked?: string[]) {
    this.levelUp = { level, coins, unlocked };
  }
  pushAchievement(a: Achievement) { this.achievementQueue.push(a); }
  openSos() { this.sosOpen = true; }
  closeSos() { this.sosOpen = false; }
}
export const ui = new UiStore();
```
`OverlayHost` renders `LevelUpOverlay` from `ui.levelUp`, `SosModal` from `ui.sosOpen`; `ToastHost` renders `ui.toasts` + dequeues `ui.achievementQueue` one-at-a-time.

### 5.2 `src/lib/stores/userState.svelte.ts` — cached header state
```ts
class UserState {
  totalXp = $state(0);
  coins = $state(0);
  prestige = $state(0);
  coinDelta = $state(0); // last gain, drives CoinPill animation
  hydrate(s: { totalXp: number; coins: number; prestige: number }) {
    this.totalXp = s.totalXp; this.coins = s.coins; this.prestige = s.prestige;
  }
  applyGain(xp: number, coins: number) {
    this.totalXp += xp; this.coins += coins; this.coinDelta = coins;
  }
}
export const userState = new UserState();
```
This is the second (and last) writable store, justified because header + dashboard + multiple pages all reflect live XP/coins after an optimistic action.

### 5.3 Optimistic flow (reference, used by HabitRow/QuestCard)
1. Component calls parent handler → parent mutates local `$state` list + `userState.applyGain(...)` immediately.
2. POST to `/api/...`. On 200: reconcile with server-authoritative values (re-hydrate `userState`); if level changed → `ui.celebrateLevel(...)`; new achievements → `ui.pushAchievement(...)`.
3. On error: revert local state, `ui.toast({ tone:'danger', message:'Action non enregistrée.', action:{ label:'Réessayer', run } })`.

### 5.4 `swipeable` action — `src/lib/actions/swipeable.ts`
```ts
interface SwipeOpts {
  onswipeleft?: () => void;
  onlongpress?: () => void;
  threshold?: number;   // px, default 64
  longPressMs?: number; // default 500
}
export function swipeable(node: HTMLElement, opts: SwipeOpts): { update(o: SwipeOpts): void; destroy(): void };
```
Pointer-events based: tracks `pointerdown→move→up`, exposes drag offset via a CSS var `--swipe-x` on the node (so HabitRow can translate its action panel live), commits `onswipeleft` past `threshold`, starts a long-press timer cancelled on move/up. Touch-action set to `pan-y` so vertical scroll still works. No external gesture lib.

### 5.5 Ready-to-paste FR content arrays — `src/lib/content/fr.ts`

```ts
// Health recovery timeline (tabac, generic & encouraging — brief §6/§7).
export const TABAC_MILESTONES = [
  { day: 0,   title: '20 minutes',  body: 'Ton rythme cardiaque commence déjà à se normaliser.' },
  { day: 1,   title: '24 heures',   body: 'Le monoxyde de carbone est éliminé de ton corps.' },
  { day: 2,   title: '48 heures',   body: 'Le goût et l’odorat reviennent peu à peu.' },
  { day: 3,   title: '72 heures',   body: 'Respirer devient plus facile, tu as plus d’énergie.' },
  { day: 14,  title: '2 semaines',  body: 'Ta circulation s’améliore, bouger est plus simple.' },
  { day: 30,  title: '1 mois',      body: 'Tes poumons se nettoient, tu tousses moins.' },
  { day: 90,  title: '3 mois',      body: 'Ta capacité respiratoire a nettement progressé.' },
  { day: 365, title: '1 an',        body: 'Ton risque cardiaque a déjà été réduit de moitié.' },
] as const;

// SOS — messages motivants (random pick).
export const SOS_MESSAGES = [
  'Cette envie va passer. Elle dure rarement plus de quelques minutes.',
  'Tu as déjà tenu jusqu’ici. Une minute de plus, c’est une victoire.',
  'Respire. Tu es plus fort que cette envie.',
  'Pense à pourquoi tu as commencé. Ça en vaut la peine.',
  'Un jour clean de plus, c’est de l’argent et de la santé gagnés.',
  'Ce n’est pas grave de trouver ça dur. C’est normal, et tu gères.',
] as const;

// Relapse / skip toasts — neutral, jamais culpabilisant (brief §7).
export const RELAPSE_TOASTS = [
  'On note, on repart. Demain est un nouveau jour. 💪',
  'Une rechute, c’est une donnée, pas un échec.',
  'Ta meilleure série reste un acquis. On continue.',
] as const;

// Generic encouragement after a done action.
export const DONE_TOASTS = [
  'Bien joué ! 🔥',
  'Encore une de faite.',
  'La série continue.',
] as const;

// Common triggers datalist (journal).
export const COMMON_TRIGGERS = [
  'Stress', 'Ennui', 'Soirée', 'Café', 'Après le repas',
  'Émotion forte', 'Fatigue', 'Habitude', 'Entourage',
] as const;

// Difficulty labels.
export const DIFFICULTY_LABELS = ['Facile', 'Moyen', 'Difficile'] as const;

// Habit type segmented control.
export const HABIT_TYPE_OPTIONS = [
  { value: 'build', label: 'À construire' },
  { value: 'break', label: 'À arrêter' },
] as const;

// Empty states.
export const EMPTY = {
  habits:  { icon: '🌱', title: 'Aucune habitude', body: 'Crée ta première habitude pour commencer.', action: 'Créer une habitude' },
  quests:  { icon: '📜', title: 'Aucune quête active', body: 'De nouvelles quêtes arrivent demain.' },
  shop:    { icon: '🪙', title: 'Boutique vide', body: 'Ajoute une récompense à débloquer.', action: 'Ajouter une récompense' },
  trends:  { icon: '📊', title: 'Pas encore de tendances', body: 'Note quelques envies pour les voir apparaître.' },
  addictions: { icon: '🛡️', title: 'Aucun objectif', body: 'Définis une addiction à vaincre.', action: 'Ajouter un objectif' },
} as const;
```

### 5.6 Achievement names (FR, ready-to-paste) — `src/lib/content/achievements.ts`
Aligned to brief §6 milestones (7/30/100 days, first L10, etc.) and progression config (L50 prestige).
```ts
export const ACHIEVEMENTS = [
  { key: 'streak_7',     name: 'Première flamme',     description: '7 jours de série.' },
  { key: 'streak_30',    name: 'Marathonien',         description: '30 jours de série.' },
  { key: 'streak_100',   name: 'Inarrêtable',         description: '100 jours de série.' },
  { key: 'level_10',     name: 'Aventurier',          description: 'Atteins le niveau 10.' },
  { key: 'level_25',     name: 'Vétéran',             description: 'Atteins le niveau 25.' },
  { key: 'prestige_1',   name: 'Renaissance',         description: 'Premier prestige (niveau 50).' },
  { key: 'first_boss',   name: 'Chasseur de boss',    description: 'Vaincs ta première addiction.' },
  { key: 'clean_30',     name: 'Un mois clean',       description: '30 jours sans rechute.' },
  { key: 'quests_10',    name: 'Quêteur',             description: 'Réclame 10 quêtes.' },
  { key: 'saved_100',    name: 'Épargnant',           description: '100 € économisés.' },
  { key: 'sos_used',     name: 'Garde le cap',        description: 'Utilise le SOS et tiens bon.' },
  { key: 'comeback',     name: 'Retour gagnant',      description: 'Reviens après un jour manqué.' },
] as const;
```

---

## 6. Page composition cheatsheet (so the engineer wires components correctly)

- **`/` (Accueil/dashboard)**: `AvatarCard` → `QuestList` (daily summary) → "Habitudes du jour" `HabitRow` list (one-tap) → compact `BossPanel`(s). Header always shows level/coins/XP. `OverlayHost`/`ToastHost` handle level-up, achievements, SOS globally.
- **`/habitudes`**: list of all (non-archived) `HabitRow` (manage mode shows edit/archive on swipe), `+` opens `HabitForm` in centered `Modal`. `EmptyState` when none.
- **`/addictions`**: per-target `BossPanel` + `BossHpBar`, `MoneySaved`, `HealthTimeline`, `TriggerJournalForm`, `TriggerTrends`. SOS reachable from each `BossPanel` and surfaces `SosModal`(→`CircularBreathing`).
- **`/boutique`**: `ShopGrid`→`RewardCard`s; real rewards confirm via `ConfirmDialog`.

All four are one tab tap apart via `BottomNav`; the primary action (valider une habitude) lives on tab #1 and needs exactly one tap.

---

This artifact is implementation-ready: every component has an exact file path, an exact `$props` TypeScript interface, defined behavior; tokens are paste-ready for `tailwind.config.js` and `app.css`; animations are specified as concrete Svelte/CSS techniques with reduced-motion handling; all user-facing copy is in French and centralized in `src/lib/content/`.