# CLAUDE.md — HabitQuest

Notes de projet pour les sessions Claude Code futures. Lis ce fichier en premier.

## Objectif

Application web **personnelle, mono-utilisateur**, de gamification d'habitudes et de
sevrage d'addictions (XP, niveaux, séries, quêtes, succès, boutique, module « boss »).
PWA installable, hors-ligne, notifications. Auto-hébergée. **UI en français.**

Le brief complet d'origine fait foi : voir `docs/brief.md` (copie) ou le document fourni
par l'utilisateur. Le blueprint d'implémentation détaillé est dans `docs/BLUEPRINT.md`.

## Stack

- **SvelteKit 2 + Svelte 5 (runes : `$state`/`$derived`/`$props`/`$effect`)** + TypeScript strict
- **SQLite** via `better-sqlite3` (synchrone), un seul fichier `data/habitquest.db`
- **TailwindCSS v3** (config dans `tailwind.config.js`)
- **PWA** via `@vite-pwa/sveltekit`
- **Notifications** via `web-push` (VAPID)
- **Build/déploiement** via `@sveltejs/adapter-node` (auto-hébergement)

## Architecture (cible)

```
src/
  lib/
    config/        progression.ts (⭐ tout l'équilibrage), achievements, quests, shop, avatar, healthTimelines
    server/        db.ts (connexion + migrations + accès), progression.ts, quests.ts, achievements.ts
    components/     AvatarCard, XpBar, HabitRow, QuestList, BossPanel, SosModal, CircularBreathing…
    stores/         état réactif client (gameState, toasts/célébrations)
    types.ts        types partagés
  routes/
    +page.svelte    tableau de bord
    habits/         gestion des habitudes
    addictions/     module boss + journal de déclencheurs
    shop/           boutique
    api/            endpoints (log, quest, push…)
  hooks.server.ts   garde d'accès (APP_PASSWORD → cookie session)
  service-worker.ts (étape 8)
data/habitquest.db  base SQLite (ignorée par git)
static/             icônes PWA
scripts/            seed.ts (données de démo), generate-icons.ts
```

> ⭐ **Règle d'or** : tous les nombres d'équilibrage du jeu vivent dans
> `src/lib/config/progression.ts` (et les fichiers `config/*` associés pour le contenu).

## Commandes

| But | Commande |
|---|---|
| Dév | `npm run dev` |
| Type-check | `npm run check` |
| Build prod | `npm run build` |
| Lancer prod | `npm run start` (après build) |
| Générer clés VAPID | `npm run vapid` |
| Données de démo | `npm run seed` |
| Générer icônes PWA | `npm run icons` |

## État d'avancement

- [x] **Étape 1 — Setup** : SvelteKit + TS + Tailwind + SQLite (deps) + PWA. Build & check OK.
- [x] **Étape 2 — Couche données** : schéma + migrations + `db.ts` + `types.ts` + `streaks.ts`. Check OK, schéma vérifié.
- [x] **Étape 3 — Boucle principale** : CRUD habitudes + écran « Aujourd'hui » + validation 1 tap + auth (cookie HMAC). Vérifié (login/CRUD/validation/idempotence, check + dev).
- [x] **Étape 4 — Progression** : tableau de bord (AvatarCard évolutif, en-tête niveau/XP/pièces, BottomNav), tokens de design, overlay montée de niveau + toasts. Build & rendu vérifiés. NB : couleur `ink` (pas `text`, collision préfixe `text-`).
- [x] **Étape 5 — Quêtes + succès** : génération déterministe (config/quests), progression recalculée par agrégats SQL (server/quests), succès (config+server/achievements) débloqués via logHabit, réclamation de quêtes, vitrine des succès dans /reglages. Vérifié.
- [x] **Étape 6 — Avatar + boutique** : avatar évolutif (étape 4) + cosmétique équipé en overlay ; boutique (18 cosmétiques + 6 récompenses réelles, seedShop si vide), achat/équipement/échange, ajout de récompense perso. Vérifié.
- [x] **Étape 7 — Module addictions** : boss + barre HP (HP = jours cibles), compteur clean, argent économisé (compteur animé + équivalences), frise santé par type, SOS (respiration cohérence cardiaque + mini-jeu bulles + motivation), journal de déclencheurs + tendances SVG, rechute bienveillante (gel/reset, meilleure série préservée). Vérifié (rendu + logique rechute).
- [x] **Étape 8 — Finition PWA** : injectManifest (service-worker.ts custom : precache + offline + push + relais outbox), outbox IndexedDB + synchro à la reconnexion, Web Push (VAPID, env.ts/push.ts/reminder.ts), rappel quotidien node-cron + /api/cron/daily, icônes (generate-icons + sharp), bascule push dans /reglages. check 0 + build injectManifest OK.
- [x] **Étape 9 — Finalisation** : README complet (déploiement Caddy/nginx/systemd), `.env.example`, `scripts/seed.ts` (profil démo ≈ niveau 10, 15/30 succès), revue de code adversariale (10 correctifs : exploit de farm de pièces tap/un-tap, bypass mdp vide, secret de session, dates UTC du journal, outbox poison, etc.). check 0 + build OK.
- [x] **Étape 11 — 3 features** (migration v2 idempotente, testée fresh + upgrade v1→v2) :
  - **Tâches ponctuelles** (`one_time_tasks`) : CRUD + complétion/réouverture (XP créditée une fois, réversible, anti-farm niveau), section dédiée sur le tableau de bord (`components/tasks/*`). XP dans `progression.ts` (`ONE_TIME_TASK_XP`), pièces dans `shop.ts`.
  - **Objectifs hebdomadaires** (`habits.frequency_type`/`weekly_quota`) : XP par check-in + bonus de quota via registre idempotent `weekly_goal_awards` (mémorise le quota d'octroi → relever le quota ne reprend jamais un bonus mérité), série hebdo en semaines (`streaks.weeklyStatus`). Affichage X/N dans `HabitRow`, choix de fréquence dans `HabitForm`. `weekBounds` centralisé dans `db.ts` (quests + achievements l'importent).
  - **L'Armurerie** (modale au clic sur l'avatar) : renommage (`user_state.player_name`, `/api/character`), équip/déséquip par catégorie (slots existants ; DELETE sur `/api/rewards/[id]/equip`). Visuel extrait dans `AvatarSprite.svelte` (réutilisé par AvatarCard + preview). NB : seul l'accessoire est rendu en sprite ; thème/tenue/cadre restent data-only (en attente du layering SVG complet).
  - Revue adversariale (3 relecteurs) : 1 correctif appliqué (claw-back non-punitif sur hausse de quota). check 0 + build OK.
- [x] **Étape 12 — Fuseau horaire + dates fiables ; fix bug du vide ; prestige branché** :
  - **Fuseau horaire** : réglage `timezone` (chaîne IANA, défaut `Europe/Paris`) stocké dans `settings` (pas de migration). `getTimezone()`/`setTimezone()` (cache module `_tz`, validation via `Intl`). `localDate`/`localDateTime` calculent « maintenant » dans ce fuseau via `formatToParts`. Endpoint `POST /api/settings/timezone` + section « Fuseau horaire » dans `/reglages` (champ pré-rempli depuis le navigateur). Cron du rappel programmé avec `{ timezone }` (lu au démarrage ; reschedule à chaud repoussé au prompt 2).
  - **Dates UTC-pures** : `addDays(date, n)` (arithmétique UTC sur chaîne). `previousDate`/`nextDate`/`weekBounds` (db.ts) et `weeklyStatus`/`weeklyStreakBefore` (streaks.ts, `shiftDays` supprimé) découplés de `localDate`. **Règle d'or : `localDate`/`localDateTime` ne prennent qu'un instant réel (`now`) ; toute arithmétique calendaire passe par `addDays`.**
  - **Bug du vide** : `w_no_relapse` (quests.ts) gardée par `hasTrackedAbstinence` (≥1 boss non archivé OU ≥1 habitude `break` non archivée) → plus de pré-validation sur base vide. Abstinence passive non pénalisée.
  - **Prestige** : `prestige()` crédite `COIN_ECONOMY.PRESTIGE_BONUS` (500 pièces) dans sa transaction. `POST /api/prestige` (guard `NOT_ELIGIBLE` < niveau 50, débloque `prestige_1`/`prestige_3`). Section « Prestige » dans `/reglages` (visible ≥ niv. 50) + `ConfirmDialog` + `invalidateAll()` + toast `gold`. check 0 + build OK.

## Conventions

- Code et commentaires : FR ou EN concis. **Strings UI : toujours FR.**
- Pas d'authentification complexe : un seul mot de passe (`APP_PASSWORD`) → cookie signé.
- Anti-farming : contrainte `UNIQUE(habit_id, date)` ; 1 validation max / habitude / jour.
- Rechutes : **jamais punitives** (voir §7 du brief) — données neutres, ton encourageant.
- **Dates** : `localDate`/`localDateTime` réservées à « maintenant » (fuseau `getTimezone()`). Pour décaler/comparer des dates calendaires, utiliser `addDays` (UTC pur) — jamais une `Date` locale repassée à `localDate`.
- Commit après chaque étape.
