I have the full spec. Now I'll design the complete subsystem artifact. Let me verify the data model details for the addiction module to keep my SQL and signatures consistent.

The brief is comprehensive. I have everything I need: the `addiction_targets` and `trigger_journal` schemas, the progression config (BASE_XP 100, EXPONENT 1.5, XP_BREAK_HABIT_DAY 30, streak bonus +2%/day cap +50%), the relapse philosophy (§7), and the stack. I'll now produce the complete design artifact.

# HabitQuest — Sous-système « Boss d'addiction » + UX bien-être & contenu FR

> Artefact de conception prêt à implémenter. Stack : SvelteKit 2 / Svelte 5 runes, TS strict, better-sqlite3 v11 (synchrone), Tailwind v3. Tout le contenu utilisateur est en français. Aucun fichier n'est créé ici — l'ingénieur recopie verbatim.

**Hypothèses / défauts choisis (le brief est silencieux) :**
- HP du boss = `target_streak_days` (jours nécessaires pour « tuer » l'addiction). Défaut configurable par boss, suggestion 90 jours, plancher 7, plafond 365.
- 1 dégât = 1 jour clean. HP restant = `max(0, target − jours_clean)`.
- Le boss est « vaincu » quand `jours_clean >= target`. On ne supprime pas la cible : elle passe en état `vaincu` et reste un trophée.
- Animation de respiration : pilotée par `requestAnimationFrame` + horloge `performance.now()` (pas `setInterval`, pour éviter la dérive). Défaut 5 min, inspire 5 s / expire 5 s (6 respirations/min, cohérence cardiaque).
- Mini-jeu : « Souffle de calme » — éclatement de bulles minuté, zéro asset, pur SVG/CSS.
- Tendances du journal : SVG inline, aucune lib de graphe.
- Toutes les dates « jours clean » se calculent en jours calendaires locaux (minuit local), pas en heures glissantes, pour rester cohérent avec `habit_logs` qui est en `YYYY-MM-DD`.

---

## 0. Fichiers livrés par ce sous-système

```
src/lib/config/healthTimelines.ts          # §3 frises santé FR (contenu complet)
src/lib/config/bossConfig.ts               # §1 réglages boss
src/lib/config/wellnessCopy.ts             # §4/§8 microcopy FR (SOS, rechute)
src/lib/server/boss.ts                     # §1/§2 calculs serveur (HP, argent, dégâts)
src/lib/server/triggerStats.ts             # §7 agrégations journal
src/lib/components/boss/BossPanel.svelte           # §1
src/lib/components/boss/MoneySaved.svelte          # §2
src/lib/components/boss/HealthTimeline.svelte      # §3
src/lib/components/sos/SosButton.svelte            # §4
src/lib/components/sos/SosSheet.svelte             # §4 écran de choix
src/lib/components/sos/BreathingExercise.svelte    # §5
src/lib/components/sos/BubbleGame.svelte           # §6
src/lib/components/sos/MotivationCard.svelte       # §4
src/lib/components/boss/TriggerTrends.svelte       # §7
src/lib/components/boss/RelapseFlow.svelte         # §8
src/routes/addictions/+page.svelte                 # page conteneur
src/routes/api/addictions/relapse/+server.ts       # §8 endpoint
src/routes/api/addictions/clean/+server.ts         # §1 reset clean_since
```

---

## 1. Mécaniques du boss + layout

### 1.1 Modèle dérivé (aucun nouveau stockage requis)

Le brief stocke `addiction_targets(clean_since, money_per_day, best_streak_days)`. On ajoute **un seul champ optionnel** pour la cible de HP (sinon on utilise le défaut) :

```sql
-- Migration additive (idempotente) à ajouter dans db.ts après le schéma §4 :
ALTER TABLE addiction_targets ADD COLUMN target_streak_days INTEGER NOT NULL DEFAULT 90;
ALTER TABLE addiction_targets ADD COLUMN icon TEXT;       -- emoji du boss, ex '🚬'
ALTER TABLE addiction_targets ADD COLUMN kind TEXT;       -- 'tabac'|'alcool'|'sucre'|'ecrans'|'autre' -> clé frise santé
ALTER TABLE addiction_targets ADD COLUMN defeated_at TEXT; -- horodatage de victoire (trophée)
```

> Pour rendre `ALTER … ADD COLUMN` idempotent dans `db.ts`, encapsule dans un `try/catch` sur `SqliteError` code `SQLITE_ERROR` (colonne déjà existante) — better-sqlite3 lève synchroniquement.

### 1.2 Types et signatures serveur — `src/lib/server/boss.ts`

```typescript
import { BOSS } from '$lib/config/bossConfig';

export type AddictionKind = 'tabac' | 'alcool' | 'sucre' | 'ecrans' | 'autre';

export interface AddictionTargetRow {
  id: number;
  name: string;
  clean_since: string | null;        // 'YYYY-MM-DD' ou ISO
  money_per_day: number;
  best_streak_days: number;
  target_streak_days: number;
  icon: string | null;
  kind: AddictionKind | null;
  defeated_at: string | null;
}

export interface BossState {
  id: number;
  name: string;
  icon: string;                       // fallback BOSS.DEFAULT_ICON
  kind: AddictionKind;                // fallback 'autre'
  cleanDays: number;                  // jours clean (>= 0)
  targetDays: number;                 // HP max
  hpRemaining: number;                // max(0, target - cleanDays)
  hpFraction: number;                 // hpRemaining / targetDays, clampé [0,1]
  damageDealtToday: number;           // 1 si la journée d'aujourd'hui compte, sinon 0
  bestStreakDays: number;
  defeated: boolean;                  // cleanDays >= targetDays
  tier: BossTier;                     // palier visuel (voir 1.5)
  moneySaved: number;                 // §2
  nextMilestoneDays: number | null;   // prochain palier (7/14/30/90/180/365…)
}

export type BossTier = 'colossal' | 'affaibli' | 'vacillant' | 'agonisant' | 'vaincu';

/** Jours calendaires locaux entre clean_since (inclus) et aujourd'hui (inclus). */
export function cleanDaysFrom(cleanSince: string | null, now = new Date()): number {
  if (!cleanSince) return 0;
  const start = new Date(cleanSince + (cleanSince.length === 10 ? 'T00:00:00' : ''));
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const nowMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((nowMid.getTime() - startMid.getTime()) / 86_400_000);
  return Math.max(0, diff); // jour 0 = premier jour clean
}

/** Argent économisé = jours clean * money_per_day (§2). */
export function moneySaved(cleanDays: number, moneyPerDay: number): number {
  return Math.round(Math.max(0, cleanDays) * Math.max(0, moneyPerDay) * 100) / 100;
}

const MILESTONES = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730] as const;
export function nextMilestone(cleanDays: number): number | null {
  return MILESTONES.find((m) => m > cleanDays) ?? null;
}

export function bossTier(hpFraction: number, defeated: boolean): BossTier {
  if (defeated) return 'vaincu';
  if (hpFraction > 0.66) return 'colossal';
  if (hpFraction > 0.40) return 'affaibli';
  if (hpFraction > 0.15) return 'vacillant';
  return 'agonisant';
}

export function computeBossState(row: AddictionTargetRow, now = new Date()): BossState {
  const cleanDays = cleanDaysFrom(row.clean_since, now);
  const targetDays = Math.max(BOSS.MIN_TARGET, Math.min(BOSS.MAX_TARGET, row.target_streak_days));
  const hpRemaining = Math.max(0, targetDays - cleanDays);
  const hpFraction = targetDays > 0 ? Math.min(1, Math.max(0, hpRemaining / targetDays)) : 0;
  const defeated = cleanDays >= targetDays || row.defeated_at != null;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? BOSS.DEFAULT_ICON,
    kind: row.kind ?? 'autre',
    cleanDays,
    targetDays,
    hpRemaining,
    hpFraction,
    damageDealtToday: cleanDays > 0 ? 1 : 0,
    bestStreakDays: Math.max(row.best_streak_days, cleanDays),
    defeated,
    tier: bossTier(hpFraction, defeated),
    moneySaved: moneySaved(cleanDays, row.money_per_day),
    nextMilestoneDays: defeated ? null : nextMilestone(cleanDays)
  };
}
```

### 1.3 Config — `src/lib/config/bossConfig.ts`

```typescript
export const BOSS = {
  DEFAULT_TARGET: 90,
  MIN_TARGET: 7,
  MAX_TARGET: 365,
  DEFAULT_ICON: '👾',
  // Dégâts quotidiens = XP_BREAK_HABIT_DAY (cohérence avec progression.ts).
  // Le boss ne crée pas d'XP en double : l'XP vient de habit_logs 'break'/clean,
  // le boss n'est qu'une VISUALISATION du même streak.
  XP_PER_CLEAN_DAY: 30,            // = PROGRESSION.XP_BREAK_HABIT_DAY (rappel, ne pas dupliquer le crédit)
  // Paliers célébrés (jours) -> labels FR
  MILESTONES: [
    { days: 1,   label: 'Premier jour' },
    { days: 3,   label: '3 jours' },
    { days: 7,   label: '1 semaine' },
    { days: 14,  label: '2 semaines' },
    { days: 30,  label: '1 mois' },
    { days: 90,  label: '3 mois' },
    { days: 180, label: '6 mois' },
    { days: 365, label: '1 an' }
  ]
} as const;
```

### 1.4 Plusieurs boss simultanés

- La page `addictions/+page.svelte` charge `computeBossState` pour **chaque** ligne de `addiction_targets`.
- Affichage en **liste verticale empilée** (mobile-first), un `BossPanel` par boss. Pas de carrousel : tout est scrollable, un coup d'œil suffit.
- Les boss `vaincu` sont regroupés en bas dans une section repliée « 🏆 Boss vaincus (N) ».
- État côté client : un `$state` local dans la page contient `bosses: BossState[]`. Pas de store global nécessaire (donnée propre à cette route). Le SOS, lui, est global (voir §4).

### 1.5 Layout d'un `BossPanel` + visuels

```
┌────────────────────────────────────────────┐
│  [👾 grand emoji, animé selon tier]          │
│  Cigarette  ·  Boss niveau « Vacillant »     │
│                                              │
│  ████████████░░░░░░░░░░  HP 38 / 90          │  <- barre HP rouge->vert
│  Il te reste 38 jours pour le terrasser      │
│                                              │
│  🔥 52 jours clean   ·   ⚔️ -1 PV aujourd'hui │
│  🏆 Meilleure série : 70 j                    │
│                                              │
│  💶 312,00 € économisés   [voir détail ↓]     │
│  🩺 Prochain palier santé : 1 an (voir frise) │
│                                              │
│  [ 🆘 J'ai une envie ]   [ J'ai rechuté ]     │
└────────────────────────────────────────────┘
```

**Règles visuelles (Tailwind, thème sombre) :**
- Barre HP : largeur = `hpFraction * 100%`, couleur interpolée. Classe dynamique par tier :
  - `colossal` → `bg-rose-600`, emoji `animate-pulse` lent + `scale-100`
  - `affaibli` → `bg-orange-500`, léger `opacity-90`
  - `vacillant` → `bg-amber-400`, emoji `grayscale-[0.2]` + petit tremblement (`animate-[wiggle_2s_ease-in-out_infinite]`)
  - `agonisant` → `bg-lime-500`, emoji `grayscale-[0.5] opacity-70`, barre `animate-pulse`
  - `vaincu` → barre pleine `bg-emerald-500`, emoji `grayscale opacity-40`, badge 🏆
- La barre HP **descend** (transition `width 600ms ease-out`) — visuellement « on inflige des dégâts ».
- `damageDealtToday` affiche un badge `⚔️ -1 PV aujourd'hui` (vert) si le jour compte.

**Keyframes Tailwind à ajouter dans `tailwind.config.js`** :
```js
// theme.extend.keyframes
wiggle: { '0%,100%': { transform: 'rotate(-3deg)' }, '50%': { transform: 'rotate(3deg)' } },
victoryPop: { '0%': { transform: 'scale(0.3)', opacity: '0' }, '60%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
// theme.extend.animation
'victory-pop': 'victoryPop 500ms cubic-bezier(.18,.89,.32,1.28)'
```

### 1.6 Célébration de victoire (boss vaincu)

Déclenchée client-side quand `defeated` passe de `false`→`true` (détecté via `$effect` qui compare une valeur précédente). Au franchissement :
1. Overlay plein écran `victory-pop`, emoji du boss qui « explose » (confettis CSS = ~24 `<span>` positionnés en absolu avec `animate-bounce`/translate aléatoire — aucun asset).
2. Titre : **« BOSS VAINCU ! »**
3. Sous-titre dynamique : **« Tu as tenu {targetDays} jours sans {name}. {moneySaved} € économisés. »**
4. Bouton **« Continuer l'aventure »** : POST `/api/addictions/clean` avec `{ action: 'mark_defeated' }` → écrit `defeated_at = datetime('now')`, met à jour `best_streak_days = max(best_streak_days, cleanDays)`.
5. Option proposée : **« Viser plus loin (+90 jours) »** → augmente `target_streak_days` et **conserve** `clean_since` (le boss « ressuscite plus fort », relance l'objectif sans perdre la série). Microcopy : *« Ce boss était trop faible pour toi. Un nouveau, plus coriace, apparaît. »*

L'XP n'est jamais créée par le boss : la victoire est purement narrative (l'XP a déjà été versée jour par jour via le moteur de progression). On peut verser un **bonus de pièces** one-shot via la table `rewards`/`user_state.coins` : défaut `targetDays` pièces (ex. 90 jours → +90 pièces). À noter dans `bossConfig` :
```typescript
// dans BOSS
VICTORY_COIN_BONUS_PER_TARGET_DAY: 1,  // pièces = targetDays * 1
```

---

## 2. Argent économisé

### 2.1 Formule exacte

```
moneySaved = max(0, joursClean) * max(0, money_per_day)
joursClean = floor((minuit_local_aujourd'hui − minuit_local(clean_since)) / 1 jour)
```
Implémentée par `moneySaved(cleanDays, moneyPerDay)` (§1.2), arrondie à 2 décimales. Formatage FR via :
```typescript
new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)
// -> "312,00 €"
```
> Devise `EUR` par défaut ; si tu veux la rendre configurable, ajoute `currency TEXT DEFAULT 'EUR'` à `addiction_targets` et passe-la au formatter.

### 2.2 Idée d'accumulation visuelle — `MoneySaved.svelte`

- **Compteur animé** : le montant « monte » de 0 → valeur courante au montage via un tween manuel runes :
```typescript
let display = $state(0);
$effect(() => {
  const target = moneyValue;          // prop
  const start = performance.now();
  const from = display;
  const dur = 900;
  let raf = requestAnimationFrame(function tick(t) {
    const k = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - k, 3); // easeOutCubic
    display = from + (target - from) * eased;
    if (k < 1) raf = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(raf);
});
```
- **Métaphore « tirelire / pile de pièces »** : SVG inline d'un bocal qui se remplit. Niveau de remplissage = `min(1, moneySaved / objectifVisuel)` où `objectifVisuel` est le prochain « cap rond » (`Math.pow(10, …)` ou paliers 50/100/250/500/1000 €). Le liquide doré (`<rect>` avec `y`/`height` animés) monte.
- **Équivalences concrètes et motivantes** (FR, optionnel sous le montant) : convertir en « objets désirables » configurables :
```typescript
// petit helper d'affichage, pas de stockage
export const MONEY_EQUIVALENTS = [
  { seuil: 15,  label: 'un resto 🍽️' },
  { seuil: 60,  label: 'un jeu vidéo 🎮' },
  { seuil: 150, label: 'une paire de chaussures 👟' },
  { seuil: 400, label: 'un week-end 🧳' },
  { seuil: 900, label: 'un billet d\'avion ✈️' }
];
// Affiche le plus grand seuil <= moneySaved : "Soit déjà un week-end 🧳 !"
```

---

## 3. Frises de récupération santé — `src/lib/config/healthTimelines.ts`

> Ton : chaleureux, encourageant, **non clinique**. Formulations prudentes (« souvent rapporté », « beaucoup de personnes constatent »). Aucune promesse médicale chiffrée alarmante.

```typescript
// src/lib/config/healthTimelines.ts
// Frises de récupération santé, par type d'addiction.
// Ton volontairement bienveillant et non médical : ce sont des repères
// de motivation, pas des affirmations cliniques.

export interface HealthMilestone {
  afterLabel: string;   // libellé FR lisible, ex '24 heures'
  afterSeconds: number; // délai depuis clean_since, en secondes
  title: string;        // titre court FR
  message: string;      // message chaleureux FR
}

export type HealthTimelineKey = 'tabac' | 'alcool' | 'sucre' | 'ecrans' | 'autre';

const MIN = 60;
const HEURE = 60 * MIN;
const JOUR = 24 * HEURE;
const SEMAINE = 7 * JOUR;
const MOIS = 30 * JOUR;
const AN = 365 * JOUR;

export const HEALTH_TIMELINES: Record<HealthTimelineKey, HealthMilestone[]> = {
  tabac: [
    {
      afterLabel: '20 minutes',
      afterSeconds: 20 * MIN,
      title: 'Le corps se détend',
      message:
        'Quelques minutes seulement, et beaucoup de personnes constatent déjà un léger mieux. Ton corps a commencé à se rééquilibrer. Joli début.'
    },
    {
      afterLabel: '8 heures',
      afterSeconds: 8 * HEURE,
      title: 'Un souffle plus clair',
      message:
        'Après quelques heures, on rapporte souvent une respiration qui paraît plus légère. Continue, ça travaille pour toi.'
    },
    {
      afterLabel: '24 heures',
      afterSeconds: JOUR,
      title: 'Une journée entière !',
      message:
        'Une journée complète sans tabac, c’est une vraie victoire. Beaucoup décrivent une sensation de fierté qui fait du bien.'
    },
    {
      afterLabel: '48 heures',
      afterSeconds: 2 * JOUR,
      title: 'Les sens se réveillent',
      message:
        'Au bout de deux jours, certaines personnes redécouvrent le goût et les odeurs. Reste à l’écoute de ces petits plaisirs retrouvés.'
    },
    {
      afterLabel: '72 heures',
      afterSeconds: 3 * JOUR,
      title: 'Plus d’énergie',
      message:
        'Trois jours : le plus dur des envies passe souvent par là. Beaucoup se sentent ensuite plus légers et plus énergiques.'
    },
    {
      afterLabel: '2 semaines',
      afterSeconds: 2 * SEMAINE,
      title: 'Le quotidien plus facile',
      message:
        'Après deux semaines, bouger et respirer paraît souvent plus simple. Tu construis quelque chose de solide.'
    },
    {
      afterLabel: '1 mois',
      afterSeconds: MOIS,
      title: 'Un mois de gagné',
      message:
        'Un mois entier. Beaucoup remarquent une toux qui s’apaise et un teint plus frais. Tu peux être vraiment fier.'
    },
    {
      afterLabel: '3 mois',
      afterSeconds: 3 * MOIS,
      title: 'Le souffle au top',
      message:
        'Trois mois : on rapporte souvent une nette amélioration du souffle au quotidien. La forme revient peu à peu.'
    },
    {
      afterLabel: '1 an',
      afterSeconds: AN,
      title: 'Une année de liberté',
      message:
        'Une année complète ! C’est un cap énorme, célébré par beaucoup comme un vrai tournant. Bravo, sincèrement.'
    }
  ],

  alcool: [
    {
      afterLabel: '24 heures',
      afterSeconds: JOUR,
      title: 'Le corps souffle',
      message:
        'Une journée sans alcool, et le corps commence à se reposer. Beaucoup décrivent une hydratation qui revient et une tête plus claire.'
    },
    {
      afterLabel: '48 heures',
      afterSeconds: 2 * JOUR,
      title: 'Esprit plus net',
      message:
        'Au bout de deux jours, on rapporte souvent des idées plus claires. Profite de cette netteté retrouvée.'
    },
    {
      afterLabel: '72 heures',
      afterSeconds: 3 * JOUR,
      title: 'Le sommeil s’installe',
      message:
        'Trois jours : beaucoup de personnes constatent un sommeil qui redevient peu à peu plus réparateur.'
    },
    {
      afterLabel: '1 semaine',
      afterSeconds: SEMAINE,
      title: 'Une semaine, déjà',
      message:
        'Une semaine entière ! On rapporte souvent un meilleur sommeil et plus d’énergie le matin. Continue sur ta lancée.'
    },
    {
      afterLabel: '2 semaines',
      afterSeconds: 2 * SEMAINE,
      title: 'La forme revient',
      message:
        'Deux semaines : beaucoup décrivent une meilleure hydratation de la peau et une humeur plus stable. Ça paie.'
    },
    {
      afterLabel: '1 mois',
      afterSeconds: MOIS,
      title: 'Un mois lumineux',
      message:
        'Un mois sans alcool. Beaucoup parlent d’un teint plus frais, d’un meilleur sommeil et d’un vrai regain d’énergie.'
    },
    {
      afterLabel: '3 mois',
      afterSeconds: 3 * MOIS,
      title: 'Une nouvelle habitude',
      message:
        'Trois mois : ce qui semblait difficile devient ta nouvelle normalité. Beaucoup se sentent plus en maîtrise de leurs choix.'
    },
    {
      afterLabel: '6 mois',
      afterSeconds: 6 * MOIS,
      title: 'Un demi-cap',
      message:
        'Six mois, c’est un cap rare et précieux. On rapporte souvent une énergie et une sérénité durables. Magnifique.'
    },
    {
      afterLabel: '1 an',
      afterSeconds: AN,
      title: 'Une année entière',
      message:
        'Un an ! Un accomplissement immense, vécu par beaucoup comme une vraie renaissance. Tu peux être très fier de toi.'
    }
  ],

  sucre: [
    {
      afterLabel: '24 heures',
      afterSeconds: JOUR,
      title: 'Premier jour posé',
      message:
        'Une journée sans excès de sucre. Les premières envies sont les plus fortes : tu viens d’en traverser une belle part.'
    },
    {
      afterLabel: '3 jours',
      afterSeconds: 3 * JOUR,
      title: 'Les envies s’apaisent',
      message:
        'Trois jours : beaucoup de personnes constatent que l’envie de sucré devient moins insistante. Tiens bon, ça s’adoucit.'
    },
    {
      afterLabel: '1 semaine',
      afterSeconds: SEMAINE,
      title: 'Plus stable',
      message:
        'Une semaine : on rapporte souvent moins de coups de barre dans la journée et une énergie plus régulière.'
    },
    {
      afterLabel: '2 semaines',
      afterSeconds: 2 * SEMAINE,
      title: 'Le goût se rééduque',
      message:
        'Deux semaines : beaucoup redécouvrent le goût naturel des aliments, et trouvent certaines choses « trop sucrées » désormais.'
    },
    {
      afterLabel: '1 mois',
      afterSeconds: MOIS,
      title: 'Un mois plus léger',
      message:
        'Un mois : on rapporte souvent une énergie plus stable et une relation plus apaisée avec le sucré. Beau travail.'
    },
    {
      afterLabel: '3 mois',
      afterSeconds: 3 * MOIS,
      title: 'Nouvelle habitude ancrée',
      message:
        'Trois mois : tes nouveaux réflexes deviennent naturels. Beaucoup se sentent plus libres face aux tentations.'
    }
  ],

  ecrans: [
    {
      afterLabel: '1 heure',
      afterSeconds: HEURE,
      title: 'Une heure pour toi',
      message:
        'Une heure sans scroller, c’est déjà du temps repris. Beaucoup ressentent un petit soulagement de poser le téléphone.'
    },
    {
      afterLabel: '24 heures',
      afterSeconds: JOUR,
      title: 'Une journée présente',
      message:
        'Une journée avec moins d’écrans. On rapporte souvent une attention plus calme et des moments mieux savourés.'
    },
    {
      afterLabel: '3 jours',
      afterSeconds: 3 * JOUR,
      title: 'L’esprit respire',
      message:
        'Trois jours : beaucoup décrivent moins de besoin compulsif de vérifier leur téléphone. L’esprit se pose.'
    },
    {
      afterLabel: '1 semaine',
      afterSeconds: SEMAINE,
      title: 'Du temps retrouvé',
      message:
        'Une semaine : on rapporte souvent du temps libéré pour de vraies envies, et un sommeil plus tranquille le soir.'
    },
    {
      afterLabel: '2 semaines',
      afterSeconds: 2 * SEMAINE,
      title: 'Plus concentré',
      message:
        'Deux semaines : beaucoup constatent une concentration qui revient et une attention plus longue sur ce qui compte.'
    },
    {
      afterLabel: '1 mois',
      afterSeconds: MOIS,
      title: 'Un mois recentré',
      message:
        'Un mois : on rapporte souvent une relation plus sereine aux écrans et plus de présence dans le quotidien. Bravo.'
    }
  ],

  autre: [
    {
      afterLabel: '24 heures',
      afterSeconds: JOUR,
      title: 'Le premier jour',
      message:
        'Un jour entier, c’est un vrai début. Le plus dur est souvent de commencer : c’est fait. Sois fier de ce pas.'
    },
    {
      afterLabel: '3 jours',
      afterSeconds: 3 * JOUR,
      title: 'Ça s’apaise',
      message:
        'Trois jours : beaucoup de personnes constatent que les envies les plus fortes commencent à s’espacer. Tiens bon.'
    },
    {
      afterLabel: '1 semaine',
      afterSeconds: SEMAINE,
      title: 'Une semaine de gagnée',
      message:
        'Une semaine complète ! On rapporte souvent un regain de confiance à ce stade. Tu prouves que tu en es capable.'
    },
    {
      afterLabel: '2 semaines',
      afterSeconds: 2 * SEMAINE,
      title: 'Sur la bonne voie',
      message:
        'Deux semaines : tes nouveaux réflexes commencent à s’installer. Chaque jour ajoute une brique solide.'
    },
    {
      afterLabel: '1 mois',
      afterSeconds: MOIS,
      title: 'Un mois, bravo',
      message:
        'Un mois entier. Beaucoup décrivent une vraie fierté et une habitude qui devient plus naturelle. Continue.'
    },
    {
      afterLabel: '3 mois',
      afterSeconds: 3 * MOIS,
      title: 'Solidement ancré',
      message:
        'Trois mois : ce qui était un effort devient ta nouvelle normalité. Tu as transformé ton quotidien.'
    },
    {
      afterLabel: '1 an',
      afterSeconds: AN,
      title: 'Une année entière',
      message:
        'Une année complète ! Un cap immense. Prends un instant pour mesurer le chemin parcouru. Chapeau.'
    }
  ]
};

/** Sélecteur tolérant (kind null/inconnu -> 'autre'). */
export function timelineFor(kind: string | null | undefined): HealthMilestone[] {
  if (kind && kind in HEALTH_TIMELINES) return HEALTH_TIMELINES[kind as HealthTimelineKey];
  return HEALTH_TIMELINES.autre;
}
```

### 3.1 Rendu — `HealthTimeline.svelte`

- Props : `kind: HealthTimelineKey`, `cleanSince: string | null`.
- Calcule `elapsedSeconds = (Date.now() - clean_since)/1000`.
- Pour chaque jalon : `reached = elapsedSeconds >= afterSeconds`.
- Rendu en **frise verticale** (timeline) : pastille ✅ verte si atteint, ⏳ grisée sinon. Le premier jalon non atteint est mis en avant (« Prochaine étape : … ») avec un mini-décompte FR (`Intl.RelativeTimeFormat('fr')` ou « dans 3 jours »).

---

## 4. Flux SOS

### 4.1 Placement du déclencheur

- **Bouton SOS flottant global** (FAB) présent sur **toute** la zone `/addictions` (et idéalement le dashboard) : rond, `fixed bottom-20 right-4 z-40`, rouge doux, label `🆘`, `aria-label="J'ai une envie, besoin d'aide"`. Toujours atteignable en un tap (cohérent §8 mobile-first).
- Aussi un bouton inline **« 🆘 J'ai une envie »** dans chaque `BossPanel` (contextuel à un boss).
- État partagé via **un store** (seul cas justifié de store cross-composant) :
```typescript
// src/lib/stores/sos.ts
import { writable } from 'svelte/store';
export const sosOpen = writable<{ open: boolean; targetId: number | null }>({ open: false, targetId: null });
export function openSos(targetId: number | null = null) { sosOpen.set({ open: true, targetId }); }
export function closeSos() { sosOpen.set({ open: false, targetId: null }); }
```

### 4.2 Écran de choix — `SosSheet.svelte`

Bottom-sheet plein écran (overlay sombre, slide-up). En-tête bienveillant (microcopy en §4.4), puis **3 grosses tuiles** :

| Tuile | Icône | Action |
|---|---|---|
| **Respirer** | 🫁 | Monte `BreathingExercise.svelte` (§5). |
| **Se distraire** | 🎮 | Monte `BubbleGame.svelte` (§6). |
| **Se motiver** | 💪 | Monte `MotivationCard.svelte` : message aléatoire + rappels concrets. |

Pied de page : lien discret **« Finalement, j'ai cédé… »** → ouvre le `RelapseFlow` (§8) sans drame. Et bouton **« Ça va mieux, je ferme »** → `closeSos()`.

### 4.3 « Se motiver » — `MotivationCard.svelte`

Affiche, pour le boss ciblé (si `targetId`) :
- Le nombre de **jours clean** et la **meilleure série** (« Tu as déjà tenu 70 jours. Tu sais que tu en es capable. »).
- L'**argent économisé** + équivalence (§2.2).
- Le **prochain jalon santé** (§3).
- Un **message d'encouragement aléatoire** tiré de `wellnessCopy.MOTIVATION` (§4.4).
- Rappel d'action : *« Une envie dure rarement plus de 5 minutes. Respire, bois un verre d'eau, change de pièce. »*

### 4.4 Microcopy SOS — `src/lib/config/wellnessCopy.ts` (extrait, FR)

```typescript
// src/lib/config/wellnessCopy.ts
export const SOS = {
  sheetTitle: 'Respire, tu n’es pas seul·e dans ce moment',
  sheetIntro:
    'Une envie, c’est une vague : elle monte, puis elle redescend. Choisis ce qui t’aide là, maintenant.',
  choiceBreathe: 'Respirer',
  choiceBreatheHint: 'Un exercice guidé pour calmer le corps',
  choiceDistract: 'Se distraire',
  choiceDistractHint: 'Un petit jeu pour laisser passer la vague',
  choiceMotivate: 'Se motiver',
  choiceMotivateHint: 'Rappelle-toi pourquoi tu fais ça',
  footerRelapse: 'Finalement, j’ai cédé…',
  footerClose: 'Ça va mieux, je ferme',
  cravingPassed: 'Bravo. Tu viens de laisser passer une envie. C’est exactement comme ça qu’on avance.'
} as const;

export const MOTIVATION: string[] = [
  'Tu as déjà fait le plus dur : commencer. Ne lâche pas maintenant.',
  'Cette envie va passer, que tu cèdes ou non. Autant la laisser passer.',
  'Pense à toi dans une heure, fier d’avoir tenu.',
  'Chaque envie surmontée rend la suivante un peu plus facile.',
  'Tu vaux mieux que ce moment difficile. Il va passer.',
  'Bois un grand verre d’eau, respire à fond, change de pièce. Juste ça.',
  'Ta meilleure série, c’est la preuve que tu en es capable. Recommence ici.',
  'Personne ne te regarde, personne ne te juge. Fais-le pour toi.'
] as const;
```

---

## 5. Respiration (cohérence cardiaque) — machine à états

### 5.1 Config de timing

```typescript
// dans wellnessCopy.ts ou breathingConfig.ts
export interface BreathingConfig {
  inhaleMs: number;
  holdInMs: number;   // pause poumons pleins (0 = pas de pause)
  exhaleMs: number;
  holdOutMs: number;  // pause poumons vides
  totalDurationMs: number;
  haptics: boolean;
}

export const BREATHING_DEFAULT: BreathingConfig = {
  inhaleMs: 5000,    // 5 s
  holdInMs: 0,       // cohérence cardiaque classique = pas de pause
  exhaleMs: 5000,    // 5 s  -> 6 respirations/min
  holdOutMs: 0,
  totalDurationMs: 5 * 60 * 1000, // 5 min (défaut). Alt: 3 min = 180000
  haptics: true
};

// Variantes proposées dans l'UI (boutons) :
export const BREATHING_PRESETS = [
  { label: '3 min', totalDurationMs: 180000 },
  { label: '5 min', totalDurationMs: 300000 },
  { label: '1 min (express)', totalDurationMs: 60000 }
];
```

### 5.2 Machine à états

États : `idle → inhale → (holdIn) → exhale → (holdOut) → inhale … → done`.

```
        start()
 idle ───────────▶ inhale
                     │ après inhaleMs
                     ▼
                  holdIn        (sauté si holdInMs === 0)
                     │ après holdInMs
                     ▼
                  exhale
                     │ après exhaleMs
                     ▼
                  holdOut       (sauté si holdOutMs === 0)
                     │ après holdOutMs
                     ▼
              [cycle++] ──── si tempsÉcoulé >= total ──▶ done
                     │ sinon
                     └───────────────────────▶ inhale
```

### 5.3 Implémentation runes (anti-dérive via `performance.now()`)

```typescript
type Phase = 'idle' | 'inhale' | 'holdIn' | 'exhale' | 'holdOut' | 'done';

let phase = $state<Phase>('idle');
let cycles = $state(0);
let phaseProgress = $state(0);      // 0..1 dans la phase courante (pour l'animation)
let elapsedMs = $state(0);
let running = $state(false);

// cue texte dérivé
const cue = $derived(
  phase === 'inhale' ? 'Inspire' :
  phase === 'exhale' ? 'Expire' :
  phase === 'holdIn' || phase === 'holdOut' ? 'Pause' :
  phase === 'done' ? 'Terminé' : 'Prêt ?'
);

// échelle du cercle dérivée : inspire 0.5->1, expire 1->0.5, pause = stable
const circleScale = $derived(
  phase === 'inhale' ? 0.5 + 0.5 * phaseProgress :
  phase === 'exhale' ? 1.0 - 0.5 * phaseProgress :
  phase === 'holdIn' ? 1.0 :
  phase === 'holdOut' ? 0.5 : 0.5
);

const cfg = BREATHING_DEFAULT; // ou prop
const order: Phase[] = ['inhale', 'holdIn', 'exhale', 'holdOut'];
function durOf(p: Phase): number {
  return p === 'inhale' ? cfg.inhaleMs : p === 'holdIn' ? cfg.holdInMs
       : p === 'exhale' ? cfg.exhaleMs : cfg.holdOutMs;
}

let raf = 0, phaseStart = 0, runStart = 0, idx = 0;

function start() {
  if (running) return;
  running = true; cycles = 0; elapsedMs = 0; idx = 0;
  runStart = performance.now();
  enter('inhale');
  raf = requestAnimationFrame(loop);
}

function enter(p: Phase) {
  phase = p; phaseStart = performance.now(); phaseProgress = 0;
  buzz(p); // haptique
}

function nextPhase() {
  // avance dans l'ordre en sautant les phases de durée 0
  do { idx = (idx + 1) % order.length; } while (durOf(order[idx]) === 0 && idx !== 0);
  if (idx === 0) cycles += 1;              // on a bouclé -> 1 respiration complète
  if (durOf(order[idx]) === 0) { // sécurité : si tout 0 sauf inhale/exhale
    idx = order.indexOf(order[idx]);
  }
  enter(order[idx]);
}

function loop(t: number) {
  if (!running) return;
  elapsedMs = t - runStart;
  if (elapsedMs >= cfg.totalDurationMs) { finish(); return; }
  const d = durOf(phase);
  phaseProgress = d > 0 ? Math.min(1, (t - phaseStart) / d) : 1;
  if (phaseProgress >= 1) nextPhase();
  raf = requestAnimationFrame(loop);
}

function finish() { running = false; phase = 'done'; cancelAnimationFrame(raf); buzz('done'); }
function stop()   { running = false; phase = 'idle'; cancelAnimationFrame(raf); }

function buzz(p: Phase) {
  if (!cfg.haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
  if (p === 'inhale') navigator.vibrate(40);
  else if (p === 'exhale') navigator.vibrate([20, 20]);
  else if (p === 'done') navigator.vibrate([60, 40, 60]);
}

$effect(() => () => cancelAnimationFrame(raf)); // cleanup au démontage
```

### 5.4 Visuel + cues

- **Cercle SVG** : `<circle>` central dont `transform: scale(circleScale)` (transition douce ou pilotée par `phaseProgress` — ici directe car rAF). Couleur : bleu apaisant en inspire, vert en expire.
- **Cue texte** au centre : `cue` (« Inspire » / « Expire » / « Pause »).
- **Compteur de cycles** : « Respiration {cycles} » + temps restant `mm:ss` = `(totalDurationMs - elapsedMs)`.
- Anneau de progression autour du cercle = `elapsedMs / totalDurationMs`.
- Boutons : presets 1/3/5 min, `Démarrer`/`Arrêter`. À `done` : message `SOS.cravingPassed` + bouton « C'est passé, je ferme ».
- `prefers-reduced-motion` : si activé, remplacer le scale animé par un simple fondu de couleur + texte (accessibilité).

---

## 6. Mini-jeu de distraction — « Souffle de calme » (éclate-bulles minuté)

### 6.1 Choix et justification

Un jeu **à faible enjeu, non addictif, apaisant** : on **ne peut pas perdre**, pas de score à battre obsessionnel, pas de Game Over agressif. But thérapeutique : **occuper les mains et l'attention** ~60–90 s, le temps que la vague d'envie redescende (principe de « surf de l'envie »). Tap répétitif satisfaisant + retour visuel/haptique = dérivatif sain. Implémentable **sans aucun asset** (bulles = `<div>`/SVG cercles, dégradés CSS).

### 6.2 Règles

- Des **bulles** apparaissent à intervalles aléatoires à des positions aléatoires, montent lentement vers le haut et grossissent légèrement.
- L'utilisateur **tape une bulle pour l'éclater** : petite animation pop + léger `navigator.vibrate(15)`, +1 au compteur « bulles éclatées ».
- Une bulle non éclatée qui atteint le haut **disparaît sans pénalité** (aucune punition).
- **Condition de fin (« victoire »)** : tenir **60 secondes** (configurable) OU éclater **30 bulles** — au premier atteint. Pas d'échec possible.
- À la fin : message doux *« Tu as laissé passer la vague. 🌊 »* + bouton fermer / rejouer.

### 6.3 Config + squelette

```typescript
export const BUBBLE_GAME = {
  durationMs: 60000,
  targetPops: 30,
  spawnEveryMs: [500, 1200] as const, // intervalle aléatoire
  riseSpeedPxPerSec: [25, 55] as const,
  bubbleSizePx: [36, 72] as const,
  palette: ['#60a5fa', '#34d399', '#a78bfa', '#f472b6', '#fbbf24']
} as const;
```

```typescript
// état runes
interface Bubble { id: number; x: number; y: number; size: number; speed: number; color: string; }
let bubbles = $state<Bubble[]>([]);
let popped = $state(0);
let elapsedMs = $state(0);
let running = $state(false);
const won = $derived(popped >= BUBBLE_GAME.targetPops || elapsedMs >= BUBBLE_GAME.durationMs);

// boucle rAF : déplace les bulles vers le haut (y -= speed*dt), retire celles y<-size,
// spawn une nouvelle bulle quand le timer de spawn aléatoire expire.
// pop(id): bubbles = bubbles.filter(b=>b.id!==id); popped++; navigator.vibrate?.(15);
// quand `won` devient vrai -> running=false, message final.
```

- Conteneur `relative overflow-hidden` plein écran sheet. Chaque bulle = `<button>` rond positionné `absolute`, `transition`-free (positions pilotées par rAF). Accessible : `aria-label="Éclater une bulle"`.
- Respecte `prefers-reduced-motion` : ralentir la montée et désactiver le grossissement.

---

## 7. Tendances du journal de déclencheurs

### 7.1 Agrégations — `src/lib/server/triggerStats.ts`

```typescript
import type Database from 'better-sqlite3';

export interface TriggerCount   { trigger: string; count: number; gaveInCount: number; }
export interface HourBucket      { hour: number; count: number; }        // 0..23
export interface DayPoint        { date: string; total: number; gaveIn: number; }
export interface TriggerStats {
  totalEntries: number;
  avgCraving: number;             // moyenne 1..10 (0 si aucune donnée)
  gaveInRate: number;             // 0..1 sur la fenêtre
  byTrigger: TriggerCount[];      // trié count desc, top 8
  byHour: HourBucket[];           // 24 buckets, 0 inclus
  cravingByDay: DayPoint[];       // pour sparkline (n derniers jours)
  gaveInByDay: DayPoint[];        // taux de cession par jour
}

/**
 * Agrège le journal d'un boss (ou tous si targetId null) sur les `days` derniers jours.
 * SQLite stocke `date` en datetime('now') -> on parse l'heure via strftime.
 */
export function getTriggerStats(
  db: Database.Database,
  targetId: number | null,
  days = 30
): TriggerStats {
  const where = targetId == null ? '1=1' : 'target_id = @targetId';
  const since = `-${days} days`;

  const base = db.prepare(`
    SELECT COUNT(*) AS n,
           COALESCE(AVG(craving), 0) AS avgC,
           COALESCE(AVG(gave_in), 0) AS rate
    FROM trigger_journal
    WHERE ${where} AND date >= datetime('now', @since)
  `).get({ targetId, since }) as { n: number; avgC: number; rate: number };

  const byTrigger = db.prepare(`
    SELECT COALESCE(NULLIF(trigger,''),'(non précisé)') AS trigger,
           COUNT(*) AS count,
           SUM(gave_in) AS gaveInCount
    FROM trigger_journal
    WHERE ${where} AND date >= datetime('now', @since)
    GROUP BY trigger ORDER BY count DESC LIMIT 8
  `).all({ targetId, since }) as TriggerCount[];

  const byHourRaw = db.prepare(`
    SELECT CAST(strftime('%H', date) AS INTEGER) AS hour, COUNT(*) AS count
    FROM trigger_journal
    WHERE ${where} AND date >= datetime('now', @since)
    GROUP BY hour
  `).all({ targetId, since }) as HourBucket[];
  const byHour: HourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h, count: byHourRaw.find((r) => r.hour === h)?.count ?? 0
  }));

  const byDay = db.prepare(`
    SELECT strftime('%Y-%m-%d', date) AS date,
           COUNT(*) AS total,
           SUM(gave_in) AS gaveIn,
           COALESCE(AVG(craving),0) AS avgCraving
    FROM trigger_journal
    WHERE ${where} AND date >= datetime('now', @since)
    GROUP BY date ORDER BY date ASC
  `).all({ targetId, since }) as (DayPoint & { avgCraving: number })[];

  return {
    totalEntries: base.n,
    avgCraving: Math.round(base.avgC * 10) / 10,
    gaveInRate: Math.round(base.rate * 100) / 100,
    byTrigger,
    byHour,
    cravingByDay: byDay.map((d) => ({ date: d.date, total: Math.round(d.avgCraving * 10) / 10, gaveIn: d.gaveIn })),
    gaveInByDay: byDay.map((d) => ({ date: d.date, total: d.total, gaveIn: d.gaveIn }))
  };
}
```

### 7.2 Rendu sans lib — `TriggerTrends.svelte`

Quatre blocs, tous en SVG/CSS inline :

1. **Top déclencheurs (barres horizontales)** : pour chaque `byTrigger`, une `<div>` dont la largeur = `count / maxCount * 100%`, label + `count`, et une sous-barre rouge pour `gaveInCount`. Titre FR : « Tes déclencheurs les plus fréquents ».
2. **Envie moyenne (jauge)** : `avgCraving / 10` → barre + chiffre « 6,2 / 10 ». Couleur dégradée vert→rouge.
3. **Par heure de la journée (24 barres verticales)** : mini histogramme, hauteur = `count/max`. Met en évidence l'heure max (« Tes envies arrivent souvent vers 21 h »). Calcul du pic côté composant.
4. **Évolution (sparkline SVG)** : deux sparklines — envie moyenne/jour et taux de cession/jour. Une `<polyline points="…">` calculée :
```typescript
function sparkPoints(values: number[], w = 240, h = 48, max = Math.max(1, ...values)): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
}
```
Légende FR : « Ton envie moyenne baisse cette semaine 📉 » (calculé : comparer moyenne 1ère vs 2nde moitié de la fenêtre). Si aucune donnée : message doux « Pas encore assez de notes pour dégager une tendance. Continue à noter, sans pression. »

---

## 8. Gestion bienveillante des rechutes (§7)

### 8.1 Endpoint — `src/routes/api/addictions/relapse/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// POST { targetId: number; useFreeze: boolean; trigger?: string; craving?: number; note?: string }
export async function POST({ request }) {
  const { targetId, useFreeze, trigger, craving, note } = await request.json();
  const tx = db.transaction(() => {
    const row = db.prepare('SELECT * FROM addiction_targets WHERE id = ?').get(targetId) as any;
    if (!row) throw new Error('target introuvable');

    // 1. Met à jour la meilleure série AVANT tout reset.
    const prevClean = /* cleanDaysFrom(row.clean_since) */ 0; // calculé via boss.ts
    const newBest = Math.max(row.best_streak_days, prevClean);

    // 2. Journalise la rechute (donnée neutre).
    db.prepare(`INSERT INTO trigger_journal (target_id, trigger, craving, note, gave_in)
                VALUES (?, ?, ?, ?, 1)`).run(targetId, trigger ?? null, craving ?? null, note ?? null);

    let usedFreeze = false;
    if (useFreeze) {
      const u = db.prepare('SELECT freezes FROM user_state WHERE id = 1').get() as { freezes: number };
      if (u.freezes > 0) {
        db.prepare('UPDATE user_state SET freezes = freezes - 1 WHERE id = 1').run();
        usedFreeze = true; // gel : on NE réinitialise PAS clean_since
      }
    }
    if (!usedFreeze) {
      // reset doux : nouveau départ aujourd'hui, best_streak conservé
      db.prepare(`UPDATE addiction_targets SET clean_since = date('now'), best_streak_days = ? WHERE id = ?`)
        .run(newBest, targetId);
    } else {
      db.prepare(`UPDATE addiction_targets SET best_streak_days = ? WHERE id = ?`).run(newBest, targetId);
    }
    return { usedFreeze, bestStreakDays: newBest };
  });
  return json(tx());
}
```

> Principe clé : **`best_streak_days` n'est jamais réduit**. Un gel protège `clean_since`. Sans gel, on repart à `date('now')` mais la meilleure série reste affichée et célébrée. Aucune suppression de boss, aucun « 0 » humiliant en gros.

### 8.2 Flux UI — `RelapseFlow.svelte` (machine légère)

```
intro → (choix gel?) → confirm → done
```
- **Pas** de rouge agressif, pas de « ÉCHEC ». Fond neutre/doux, ton bienveillant.
- Étape 1 (intro) : message rassurant + bouton « Continuer ».
- Étape 2 : si `freezes > 0`, proposer le **gel de série**. Sinon, expliquer le redémarrage en douceur.
- Étape 3 (optionnel) : mini-formulaire « Qu'est-ce qui a déclenché ? » (réutilise le journal — déclencheur, envie 1-10, note). Tout est **facultatif** (« Tu peux passer »).
- Étape 4 (done) : recentrage sur la **meilleure série** + invitation à repartir maintenant.

### 8.3 Microcopy FR exacte — à ajouter dans `wellnessCopy.ts`

```typescript
export const RELAPSE = {
  // Lien d'entrée (depuis SOS ou BossPanel)
  triggerLink: 'J’ai rechuté',

  // Étape intro — neutre, déculpabilisante
  introTitle: 'Une rechute, ça arrive. Ça ne efface rien.',
  introBody:
    'Ce n’est pas un échec, c’est une information. Tu n’es pas revenu·e à zéro : tout le chemin parcouru reste à toi. On note, et on repart.',
  introCta: 'Continuer',

  // Choix du gel
  freezeTitle: 'Tu as un gel de série disponible',
  freezeBody:
    'Un gel protège ta série pour cette fois. Ta progression continue comme si de rien n’était. À utiliser quand tu en as besoin, sans culpabilité.',
  freezeUse: 'Utiliser un gel ❄️',
  freezeSkip: 'Non, je repars de zéro sereinement',
  freezeNone:
    'Tu n’as pas de gel disponible pour l’instant (tu en reçois un chaque semaine). Ce n’est pas grave : on repart en douceur.',

  // Confirmation sans gel
  resetTitle: 'On repart d’un nouveau premier jour',
  resetBody:
    'Un nouveau départ, ce n’est pas une punition. C’est juste aujourd’hui qui recommence. Tu sais déjà comment faire.',

  // Mini-journal optionnel
  noteTitle: 'Envie d’en dire un mot ? (facultatif)',
  noteHintTrigger: 'Qu’est-ce qui a déclenché l’envie ?',
  noteHintCraving: 'Intensité de l’envie (1 à 10)',
  noteHintNote: 'Une note pour toi-même',
  noteSkip: 'Passer',
  noteSave: 'Enregistrer',

  // Écran final — met en avant la meilleure série
  doneTitle: 'C’est noté. On continue ensemble.',
  // {best} interpolé côté composant
  doneBestStreak: 'Ta meilleure série reste ta preuve : {best} jours. Tu peux refaire au moins ça.',
  doneFrozen: 'Ta série est protégée. Rien ne change, continue comme avant. ❄️',
  doneReset: 'Jour 1 commence maintenant. Le plus dur — décider de continuer — est déjà fait.',
  doneCta: 'Je repars maintenant 💪',

  // Toast léger après enregistrement (jamais alarmant)
  toast: 'Rechute enregistrée. Cap sur le prochain jour clean.'
} as const;
```

### 8.4 Règles d'affichage anti-honte (récapitulatif pour l'ingénieur)
- Jamais de couleur d'alerte plein écran pour une rechute ; palette neutre/chaude.
- Toujours afficher **« Meilleure série : N j »** à côté du compteur courant dans `BossPanel` (déjà prévu §1.5).
- Le compteur clean qui retombe à 0 doit utiliser une transition douce, pas un flash rouge.
- Le gel (`❄️`) est mis en avant comme un **droit normal**, pas un aveu de faiblesse.

---

## Récapitulatif des défauts retenus (là où le brief est muet)
- HP boss = `target_streak_days` (défaut 90, min 7, max 365) ; 1 jour clean = 1 PV.
- Boss vaincu = conservé en trophée (`defeated_at`), bonus pièces one-shot = `targetDays`, option « viser plus loin » qui garde la série.
- Devise EUR, format `Intl fr-FR`.
- Respiration : 5 s/5 s (6 resp/min), pause 0, durée défaut 5 min, presets 1/3/5 min, haptique on, anti-dérive `performance.now()`.
- Mini-jeu : éclate-bulles 60 s / 30 bulles, sans échec possible, sans asset.
- Tendances journal : fenêtre 30 jours par défaut, SVG inline.
- Clé de frise santé = champ `kind` (`tabac|alcool|sucre|ecrans|autre`), fallback `autre`.
- Aucune création d'XP par le module boss (évite le double-comptage avec le moteur de progression §5 du brief) ; le boss visualise le même streak `XP_BREAK_HABIT_DAY=30`.

Tout le contenu utilisateur ci-dessus est en français et prêt à coller. Les chemins de fichiers sont absolus à la racine `src/` du projet `habitquest`.