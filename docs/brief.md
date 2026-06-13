# Brief pour Claude Code — Application de gamification d'habitudes (« HabitQuest »)

> **À toi, Claude Code :** ce document est la spécification complète du projet. Lis-le en entier avant de commencer. Travaille **par étapes** (voir §9), fais un `git commit` après chaque étape, et garde **tous les nombres d'équilibrage du jeu dans un seul fichier de config** (§5). Si un point te bloque, pose-moi la question ; sinon, applique des valeurs par défaut raisonnables et continue.

---

## 1. Objectif

Application web personnelle, mono-utilisateur, pour **prendre de bonnes habitudes** et **arrêter des addictions**, sous forme de jeu vidéo (XP, niveaux, séries, récompenses).

- **Usage strictement personnel**, jamais commercialisé, pas de store, pas de multi-utilisateur.
- Hébergée sur mon propre **serveur** + **nom de domaine**.
- Format : **PWA installable** (un site web qui s'ajoute à l'écran d'accueil d'Android comme une vraie app, fonctionne hors-ligne, envoie des notifications).

---

## 2. Stack technique imposée

- **Framework** : SvelteKit + TypeScript (front + routes API dans un seul projet).
- **Base de données** : SQLite via `better-sqlite3` (un seul fichier, zéro config serveur).
- **Style** : TailwindCSS.
- **PWA** : `@vite-pwa/sveltekit` (service worker, manifest, mode hors-ligne).
- **Notifications** : `web-push` (Web Push API + VAPID).
- **Adaptateur de build** : `@sveltejs/adapter-node` (je m'auto-héberge).

> Alternative possible si je le demande : remplacer SvelteKit par **React + Vite + Express**. Par défaut, reste sur SvelteKit.

Pas d'authentification complexe : un seul utilisateur. Tu peux te contenter d'un mot de passe simple stocké en variable d'environnement pour protéger l'accès public.

---

## 3. Architecture du projet

```
habitquest/
├─ CLAUDE.md                 # notes de projet pour les sessions futures
├─ README.md                 # comment lancer et déployer
├─ package.json
├─ svelte.config.js
├─ vite.config.ts
├─ tailwind.config.js
├─ .env.example              # VAPID_PUBLIC, VAPID_PRIVATE, APP_PASSWORD…
├─ data/
│  └─ habitquest.db          # base SQLite (persistée, ignorée par git)
├─ src/
│  ├─ lib/
│  │  ├─ config/
│  │  │  └─ progression.ts   # ⭐ TOUS les réglages d'équilibrage ici
│  │  ├─ server/
│  │  │  ├─ db.ts            # connexion + migrations
│  │  │  ├─ progression.ts   # moteur XP / niveaux / séries
│  │  │  ├─ quests.ts        # génération / rotation des quêtes
│  │  │  └─ achievements.ts  # déblocage des succès
│  │  ├─ components/         # AvatarCard, XpBar, HabitRow, QuestList, BossPanel…
│  │  └─ stores/             # état réactif côté client
│  ├─ routes/
│  │  ├─ +page.svelte        # tableau de bord (dashboard)
│  │  ├─ habits/             # gestion des habitudes
│  │  ├─ addictions/         # module "boss" + journal de déclencheurs
│  │  ├─ shop/               # boutique de récompenses
│  │  └─ api/                # endpoints (log, quest, push…)
│  └─ service-worker.ts
└─ static/                   # icônes PWA, manifest
```

---

## 4. Modèle de données (SQLite)

```sql
-- Utilisateur unique : une seule ligne
CREATE TABLE user_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  total_xp      INTEGER NOT NULL DEFAULT 0,
  coins         INTEGER NOT NULL DEFAULT 0,
  prestige      INTEGER NOT NULL DEFAULT 0,
  freezes       INTEGER NOT NULL DEFAULT 1,   -- "gels" de série disponibles
  last_active   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE habits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('build','break')), -- créer / arrêter
  category    TEXT,
  difficulty  INTEGER NOT NULL DEFAULT 1,   -- multiplicateur d'XP (1..3)
  icon        TEXT,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE habit_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id  INTEGER NOT NULL REFERENCES habits(id),
  date      TEXT NOT NULL,    -- 'YYYY-MM-DD'
  status    TEXT NOT NULL CHECK (status IN ('done','skipped','relapsed')),
  note      TEXT,
  UNIQUE(habit_id, date)      -- anti-farming : 1 validation max par habitude par jour
);

CREATE TABLE quests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scope        TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
  description  TEXT NOT NULL,
  target       INTEGER NOT NULL,
  progress     INTEGER NOT NULL DEFAULT 0,
  reward_xp    INTEGER NOT NULL,
  reward_coins INTEGER NOT NULL DEFAULT 0,
  period       TEXT NOT NULL,  -- ex '2026-06-13' (daily) ou '2026-W24' (weekly)
  completed    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE achievements (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  unlocked_at TEXT
);

CREATE TABLE rewards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  cost       INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('cosmetic','real')), -- cosmétique ou vraie récompense
  claimed_at TEXT
);

CREATE TABLE addiction_targets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL,
  clean_since      TEXT,             -- date de début "clean" (donne la série directement)
  money_per_day    REAL DEFAULT 0,   -- pour calculer l'argent économisé
  best_streak_days INTEGER DEFAULT 0
);

CREATE TABLE trigger_journal (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id  INTEGER REFERENCES addiction_targets(id),
  date       TEXT NOT NULL DEFAULT (datetime('now')),
  trigger    TEXT,
  craving    INTEGER,               -- intensité de l'envie, 1 à 10
  note       TEXT,
  gave_in    INTEGER NOT NULL DEFAULT 0
);
```

> **Séries (streaks)** : calcule-les à partir de `habit_logs` (jours consécutifs avec `done`) plutôt que de les stocker. Pour les addictions, la série « clean » se déduit de `clean_since`.

---

## 5. ⭐ Système de progression (le cœur du projet)

**Exigence** : la progression ne doit être **ni trop rapide** (sinon ennui), **ni stagnante** (sinon abandon). La difficulté doit **augmenter progressivement**.

### Fichier de config (tous les réglages ici)

```typescript
// src/lib/config/progression.ts

export const PROGRESSION = {
  // --- Courbe de niveaux ---
  // XP nécessaire pour passer du niveau L au niveau L+1.
  BASE_XP: 100,
  EXPONENT: 1.5, // 1.0 = linéaire (monotone) | 1.5 = doux (recommandé) | 2.0 = raide

  // --- XP gagné ---
  XP_PER_HABIT: 25,        // habitude "à construire" validée
  XP_BREAK_HABIT_DAY: 30,  // journée "clean" sur une addiction

  // --- Bonus de série ---
  STREAK_BONUS_PER_DAY: 0.02, // +2 % d'XP par jour consécutif
  STREAK_BONUS_CAP: 0.5,      // plafonné à +50 %

  // --- Filet de sécurité (anti-spirale de honte) ---
  FREEZES_PER_WEEK: 1,        // "gels" de série offerts chaque semaine

  // --- Prestige (anti-stagnation en fin de partie) ---
  PRESTIGE_LEVEL: 50,         // niveau à partir duquel le prestige est possible
} as const;

/** XP requis pour passer du niveau `level` au niveau suivant. */
export function xpToNextLevel(level: number): number {
  return Math.floor(PROGRESSION.BASE_XP * Math.pow(level, PROGRESSION.EXPONENT));
}

/** XP cumulé total nécessaire pour atteindre un niveau donné. */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNextLevel(l);
  return total;
}

/** Déduit le niveau et la progression interne à partir de l'XP total. */
export function levelFromXp(totalXp: number): {
  level: number;
  intoLevel: number;   // XP accumulé dans le niveau courant
  needed: number;      // XP nécessaire pour finir le niveau courant
} {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  return { level, intoLevel: remaining, needed: xpToNextLevel(level) };
}

/** XP effectif d'une action, bonus de série inclus. */
export function xpWithStreak(baseXp: number, streakDays: number): number {
  const bonus = Math.min(
    streakDays * PROGRESSION.STREAK_BONUS_PER_DAY,
    PROGRESSION.STREAK_BONUS_CAP
  );
  return Math.round(baseXp * (1 + bonus));
}
```

### Ce que cette courbe produit (avec les valeurs par défaut)

| Passage | XP requis |
|---|---|
| Niveau 1 → 2 | 100 |
| Niveau 4 → 5 | 800 |
| Niveau 10 → 11 | ~3 160 |
| Niveau 20 → 21 | ~8 940 |

Premiers niveaux rapides (récompense forte quand l'habitude est fragile), puis ralentissement **progressif et doux**, jamais brutal.

### Anti-stagnation (à implémenter)

1. **Récompenses qui grossissent** avec le niveau (montants de pièces, déblocages cosmétiques).
2. **Quêtes qui tournent** chaque jour / semaine pour casser la routine (§6).
3. **Prestige** : au-delà de `PRESTIGE_LEVEL`, l'utilisateur peut réinitialiser son niveau contre un bonus permanent (badge, multiplicateur cosmétique, +1 `prestige`), ce qui relance des objectifs.

### Anti-farming

La contrainte `UNIQUE(habit_id, date)` garantit qu'une habitude ne rapporte qu'une fois par jour. Pas de spam.

---

## 6. Fonctionnalités

**Boucle principale (indispensable)**
- CRUD d'habitudes : créer / modifier / archiver, type *à construire* ou *à arrêter*, catégorie, difficulté, icône.
- Écran « Aujourd'hui » : liste des habitudes du jour, validation en un tap.
- Gain d'XP / pièces, montée de niveau avec animation de célébration.
- Séries (jours consécutifs) façon « flamme », visibles par habitude et globalement.

**Engagement**
- Quêtes journalières et hebdomadaires générées automatiquement et **renouvelées** à chaque période (ex. « valide 3 habitudes aujourd'hui », « 5 jours clean cette semaine »). Récompense en XP/pièces.
- Succès / badges aux jalons (7, 30, 100 jours ; premier niveau 10 ; etc.).

**Récompenses**
- Boutique : cosmétiques pour l'avatar **et** « vraies » récompenses définies par l'utilisateur (ex. « 500 pièces = sortie ciné »).
- Avatar / créature qui évolue visuellement avec le niveau et les bonnes habitudes.

**Module addictions (« boss »)**
- Compteur de temps « clean » avec paliers célébrés.
- **Argent économisé** qui s'accumule visuellement (`money_per_day`).
- **Frise de récupération santé** (ex. tabac : jalons « après X jours, … »). Garde ces messages génériques et encourageants.
- Métaphore du **boss** : chaque jour clean inflige des dégâts à l'addiction (barre de vie du boss qui descend).
- **Bouton SOS** en cas d'envie : lance un exercice de **respiration guidée** (animation cohérence cardiaque), un message motivant et un mini-jeu de distraction simple.
- **Journal de déclencheurs** : noter le déclencheur, l'intensité de l'envie (1-10), si on a cédé. Affiche ensuite des tendances simples.

**Tableau de bord**
- Niveau, barre d'XP, pièces, séries en cours, quêtes du jour, état du/des boss.

---

## 7. ⚠️ Gestion bienveillante des rechutes (principe de design)

Les rechutes ne doivent **jamais** être traitées comme une punition brutale (pas de grand « ÉCHEC » rouge, pas de remise à zéro humiliante d'une série de 90 jours). Concrètement :

- Une rechute est une **donnée neutre** : on enregistre, on repart, on met en avant la **progression globale** (« meilleure série : 90 j ») plutôt que la perte.
- **Gels de série** (`freezes`) : permettent de protéger une série lors d'un jour manqué, pour éviter la spirale de honte.
- Ton de l'app toujours **encourageant**, jamais culpabilisant. L'objectif est que l'utilisateur ait envie de revenir, **même un mauvais jour**.

---

## 8. Direction UI / UX

- Mobile-first (c'est une app de poche), sombre par défaut, lisible, animations de récompense satisfaisantes mais sobres.
- L'action principale (valider une habitude) doit être atteignable **en un tap** depuis l'écran d'accueil de l'app.
- PWA : manifest complet (nom, icônes, couleur de thème), installable, et **fonctionnelle hors-ligne** (les validations se synchronisent au retour du réseau).

---

## 9. Ordre de construction (procède étape par étape, commit à chaque fin d'étape)

1. **Setup** : SvelteKit + TS + Tailwind + SQLite + PWA. `git init`, `CLAUDE.md`, `README.md`, `.env.example`. L'app démarre avec `npm run dev`.
2. **Couche données** : schéma (§4) + migrations + fonctions d'accès dans `db.ts`.
3. **Boucle principale** : CRUD habitudes + écran « Aujourd'hui » + validation.
4. **Moteur de progression** (§5) : XP, niveaux, pièces, séries, branchés sur la config. Tableau de bord avec barre d'XP.
5. **Quêtes + succès** : génération/rotation + déblocage des badges.
6. **Avatar + boutique** de récompenses.
7. **Module addictions** : boss, compteur clean, argent économisé, frise santé, bouton SOS + respiration, journal de déclencheurs.
8. **Finition PWA** : installable, hors-ligne, **notifications Web Push** (rappel quotidien).
9. **Final** : `README` complet, notes de déploiement (§10), données de démo pour tester.

---

## 10. Déploiement (notes pour mon serveur)

- Build : `npm run build`, lancement du serveur Node (`adapter-node`).
- **HTTPS obligatoire** : une PWA et le Web Push exigent du HTTPS. Place l'app derrière **nginx** ou **Caddy** (Caddy gère le certificat TLS automatiquement) sur mon nom de domaine.
- Persiste le fichier SQLite (`data/habitquest.db`) sur le disque (volume ou dossier dédié), pas dans le dépôt git.
- Génère une paire de clés **VAPID** pour `web-push` et mets-les en variables d'environnement (`VAPID_PUBLIC`, `VAPID_PRIVATE`). Indique-moi la commande pour les générer.
- Protège l'accès public avec `APP_PASSWORD` (variable d'environnement).
- Fournis dans le README les commandes exactes pour lancer en production (service systemd optionnel).

---

## 11. Livrables attendus

- Le projet complet, fonctionnel en local (`npm run dev`) puis buildable pour la prod.
- Un `README.md` clair : installation, lancement, déploiement, génération des clés VAPID.
- Tous les paramètres d'équilibrage centralisés dans `src/lib/config/progression.ts`, faciles à modifier.
- Un `CLAUDE.md` qui résume l'architecture et l'état d'avancement pour les sessions suivantes.
