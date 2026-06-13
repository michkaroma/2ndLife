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
- [ ] **Étape 7 — Module addictions** (boss, clean, argent, santé, SOS, journal).
- [ ] **Étape 8 — Finition PWA** (offline, Web Push).
- [ ] **Étape 9 — Finalisation** (README, déploiement, seed, revue).

## Conventions

- Code et commentaires : FR ou EN concis. **Strings UI : toujours FR.**
- Pas d'authentification complexe : un seul mot de passe (`APP_PASSWORD`) → cookie signé.
- Anti-farming : contrainte `UNIQUE(habit_id, date)` ; 1 validation max / habitude / jour.
- Rechutes : **jamais punitives** (voir §7 du brief) — données neutres, ton encourageant.
- Commit après chaque étape.
