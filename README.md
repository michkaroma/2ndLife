# HabitQuest 🎮

Application web **personnelle** de gamification d'habitudes et de sevrage d'addictions :
XP, niveaux, séries, quêtes, succès, boutique de récompenses et un module « boss » pour
combattre les addictions. **PWA installable**, fonctionnelle hors-ligne, avec notifications.

> Usage strictement personnel, mono-utilisateur, auto-hébergé. Interface en français.

## Stack

SvelteKit 2 · Svelte 5 (runes) · TypeScript · SQLite (`better-sqlite3`) · TailwindCSS ·
PWA (`@vite-pwa/sveltekit`) · Web Push (`web-push`) · `@sveltejs/adapter-node`.

## Démarrage rapide

```bash
npm install
cp .env.example .env        # puis éditer .env (voir ci-dessous)
npm run dev                 # http://localhost:5173
```

> Sous Windows PowerShell : `Copy-Item .env.example .env`

### Variables d'environnement (`.env`)

| Variable | Rôle |
|---|---|
| `APP_PASSWORD` | Mot de passe d'accès à l'app |
| `SESSION_SECRET` | Secret de signature du cookie de session |
| `VAPID_PUBLIC` / `VAPID_PRIVATE` | Clés Web Push (voir ci-dessous) |
| `VAPID_SUBJECT` | `mailto:` de contact pour le push |
| `ORIGIN` | URL publique (prod, requise par adapter-node) |
| `PUSH_TIME` | Heure du rappel quotidien `HH:MM` (optionnel) |

### Générer les clés VAPID (notifications push)

```bash
npm run vapid
```

Copie la clé publique dans `VAPID_PUBLIC` et la privée dans `VAPID_PRIVATE`.

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run check` | Vérification TypeScript / Svelte |
| `npm run build` | Build de production (`adapter-node`) |
| `npm run start` | Lance le serveur de prod (après `build`) |
| `npm run seed` | Insère des données de démo |
| `npm run icons` | (Re)génère les icônes PWA |
| `npm run vapid` | Génère une paire de clés VAPID |

## Déploiement

Notes complètes (Caddy / nginx / systemd, persistance SQLite, HTTPS) ajoutées à l'étape 9.
En bref : `npm run build` puis `npm run start` derrière un reverse proxy HTTPS
(**HTTPS obligatoire** pour la PWA et le Web Push).

---

État d'avancement détaillé : voir [`CLAUDE.md`](CLAUDE.md).
