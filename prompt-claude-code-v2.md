# Brief d'implémentation pour Claude Code — Évolution de HabitQuest

> Colle ce fichier entier comme premier message à Claude Code, **à la racine du dépôt HabitQuest**.
> Les sprites SVG seront ajoutés par moi dans `static/sprites/` (voir l'annexe « Contrat d'assets »).
> **L'app doit fonctionner même si ces fichiers ne sont pas encore là** (fallback emoji obligatoire).

---

## 0. Contexte (rappel)

HabitQuest est une PWA **personnelle, mono-utilisateur**, en **français**, qui transforme la construction d'habitudes et le sevrage d'addictions en jeu vidéo (XP, niveaux, séries/flammes, quêtes, succès, boutique, avatar évolutif, module « boss » pour les addictions).

Stack : **SvelteKit 2 · Svelte 5 (runes) · TypeScript strict · SQLite (better-sqlite3) · TailwindCSS v3 · PWA**. Tout le contenu FR est centralisé dans `src/lib/content/fr.ts`, et l'équilibrage dans `src/lib/config/`.

**Philosophie à respecter absolument (brief §7) :** rien n'est punitif. Une rechute / un dépassement est une donnée neutre, jamais une sanction ; on gèle la série, on met en avant la « meilleure série », ton bienveillant et **non médical**.

Il y a **trois chantiers**. Le chantier 1 est prioritaire. Lis l'ensemble avant de commencer, puis propose-moi un plan court et attends mon « go » avant de coder.

---

## 1. Règles transverses (valent pour les 3 chantiers)

- Respecte les patterns existants : Svelte 5 runes, TS strict, `src/lib/server/*` pour la logique serveur, config dans `src/lib/config/*`, microcopy FR dans `src/lib/content/fr.ts` et `src/lib/config/wellnessCopy.ts`.
- **Migrations SQLite rétro-compatibles** : passe par `src/lib/server/migrations.ts`. Ajoute des colonnes/tables avec valeurs par défaut sûres. **Ne casse jamais les données existantes** et ne supprime aucune colonne historique (mets-la de côté si besoin).
- Toute nouvelle valeur réglable va dans `src/lib/config/*` (pas de magie en dur dans les composants).
- `npm run check` (svelte-check + TS) doit passer à la fin, zéro erreur.
- Ne committe jamais `data/*.db`.
- Garde l'accessibilité existante (focus-visible, `prefers-reduced-motion` déjà géré — ne le casse pas).
- Travaille par chantier, avec un commit par étape logique et un message clair. À la fin de chaque chantier, fais le point avec moi.

---

## 2. CHANTIER 1 — Boss comportementaux (priorité)

**Objectif** : adapter le module « boss » aux addictions **comportementales** (scroll, réseaux, jeux vidéo…), tout en gardant les substances. Le comportemental doit être **mis en avant**.

### 2.1 Types d'addiction
- Dans `src/lib/content/fr.ts` (`ADDICTION_KINDS`) : garde les types existants (`tabac`, `alcool`, `sucre`, `ecrans`, `autre`) **mais** réordonne pour mettre le comportemental en premier et enrichis-le. Ajoute au moins : `reseaux` (Réseaux sociaux / scroll 📱), `jeux` (Jeux vidéo 🎮). Le **type par défaut** d'un nouveau boss doit être comportemental (ex. `reseaux`), et le placeholder du formulaire doit devenir « ex : Instagram ».
- Mets à jour `src/lib/config/healthTimelines.ts` : la frise `ecrans` existe déjà et reste valable. Ajoute une clé pour les **jeux vidéo** (mêmes repères motivants, non médicaux, ton bienveillant). Le sélecteur `timelineFor` doit gérer les nouvelles clés (fallback `autre` conservé).

### 2.2 Règles de « journée réussie » (cœur du chantier)
Aujourd'hui un boss se résume à une date « clean depuis » + rechute qui remet à zéro. Il faut un modèle de **règles combinables, configurables par boss** :

- `mode` : `abstinence` (zéro, je n'y touche pas) **ou** `limit` (sous une limite de temps que je fixe).
- `daily_limit_minutes` : entier (utilisé si `mode = limit`, ex. 30).
- `no_use_before` : heure `HH:MM` optionnelle (règle « pas le matin » → ex. « pas avant 09:00 »). Activable indépendamment du mode.

Une **journée est réussie** si **toutes les règles activées** sont respectées. Les règles se combinent (« et/ou » côté config : l'utilisateur active celles qu'il veut).

**Saisie quotidienne (self-report, bienveillant)** : pour un boss comportemental, ajoute un check-in du jour « J'ai tenu aujourd'hui » qui, selon les règles actives, ouvre un mini-formulaire :
- si `limit` : champ « Temps passé aujourd'hui : ___ min » (comparé à `daily_limit_minutes`) ;
- si `no_use_before` : oui/non « As-tu réussi à ne pas y toucher avant {heure} ? ».
- Résultat : journée réussie → série +1, pièces (réutilise `COIN_ECONOMY.PER_CLEAN_DAY`), accumulation du temps repris. Journée ratée → **flux non punitif** : réutilise la copie et la mécanique de `RELAPSE`/gel de série existantes (`src/lib/components/boss/RelapseFlow.svelte`, `wellnessCopy.ts`), mise en avant de la « meilleure série ». **Aucune culpabilisation.**

**Important** : étends le système existant, ne le réécris pas. Garde le modèle « clean depuis » pour les boss en `abstinence` (substances comprises) ; le check-in journalier sert surtout aux boss avec `limit`/`no_use_before`. Reste cohérent avec la machinerie de séries/gel actuelle (`src/lib/server/streaks.ts`, `boss.ts`, table des addictions).

### 2.3 Indicateur de progression : « temps repris » (remplace l'argent pour le comportemental)
- Ajoute par boss : `baseline_minutes_per_day` (combien de temps tu y passais avant), `track_time` (bool), et **garde** `money_per_day` + `track_money` (bool). Défaut : un boss comportemental a `track_time = true` (et `track_money = false`) ; un boss substance a `track_money = true` (et `track_time = false`). Les deux peuvent être activés.
- **Calcul du temps repris** (estimation motivante, pas une mesure exacte) :
  - boss `abstinence` : `temps_repris ≈ baseline_minutes_per_day × jours_réussis` ;
  - boss `limit` : `temps_repris ≈ max(0, baseline_minutes_per_day − minutes_du_jour) ` cumulé sur les jours réussis (ou `baseline − limit` si pas de saisie fine).
- Crée `src/lib/config/timeEquivalents.ts` sur le modèle de `MONEY_EQUIVALENTS` (dans `wellnessCopy.ts`). Ex. de paliers motivants : un épisode de série 📺, un film 🎬, un livre lu 📚, une rando 🥾, un week-end libéré 🧳. (Adapte les seuils en minutes/heures.)
- Crée `src/lib/components/boss/TimeReclaimed.svelte` (calqué sur `MoneySaved.svelte`) qui affiche le temps repris + l'équivalent motivant atteint. **Garde `MoneySaved.svelte`** pour les boss substance.
- Le formulaire de création (`src/routes/addictions/+page.svelte`) doit s'adapter au type : pour un type comportemental, montrer « Minutes/jour avant » + la config des règles (mode, limite, « pas avant HH:MM ») ; pour une substance, garder « € / jour économisés ». Le panneau du boss (`BossPanel.svelte`) affiche `TimeReclaimed` ou `MoneySaved` selon `track_time`/`track_money`.

### 2.4 Critères d'acceptation chantier 1
- Je peux créer un boss « Instagram » de type Réseaux, mode `limit` à 30 min, règle « pas avant 09:00 », baseline 90 min/jour.
- Le check-in journalier marque la journée réussie/ratée sans jamais culpabiliser ; un dépassement propose le gel de série.
- Le panneau affiche « ~X h reprises » avec un équivalent motivant, **pas** d'euros.
- Un ancien boss substance (ex. Tabac) continue de fonctionner exactement comme avant (argent économisé inclus). Aucune donnée perdue.

---

## 3. CHANTIER 2 — Personnage chevalier + accessoires réellement portés

**Objectif** : l'avatar n'est plus un emoji mais un **chevalier en sprite SVG par couches**, et les accessoires achetés sont **visiblement portés** sur lui. On corrige aussi deux limitations : « acheter ≠ équiper » et « un seul cosmétique équipé à la fois ».

### 3.1 Système de rendu par couches
- L'avatar se compose, de l'arrière vers l'avant :
  1. **couche arrière** : accessoire `layer = back` (ailes, auréole) — si équipé ;
  2. **base** : le sprite du **stade de chevalier** courant ;
  3. **couche avant** : accessoire `layer = front` (casquette/heaume, lunettes, couronne) — si équipé.
- Toutes les images partagent le **même `viewBox` `0 0 64 64`** et la même position de tête, donc l'empilement = superposition par positionnement absolu, **sans offset manuel**. (Voir annexe.)
- Comme tous les accessoires sont dans la **même catégorie**, **un seul accessoire** est porté à la fois → une seule couche avant **ou** arrière selon l'accessoire. Pas de conflit casquette/couronne à gérer.
- Rendu : charge les sprites via `<img src="/sprites/…">` (isolation garantie, pas de collision d'`id`/classe entre SVG) avec `image-rendering: pixelated`. **Fallback obligatoire** : si le fichier n'existe pas / `onerror`, retombe sur l'emoji actuel du stade (et l'emoji de l'accessoire pour la pastille), pour que l'app reste utilisable avant que j'aie ajouté les sprites.

### 3.2 Mapping assetId → fichier
- Ajoute un résolveur (ex. `src/lib/config/sprites.ts`) qui mappe les `assetId` existants vers un chemin :
  - `avatar:egg`, `avatar:hatchling`, … `avatar:ascended` → `/sprites/knight/stage-1-….svg` … `stage-9-….svg` (1 par stade, dans l'ordre de `AVATAR_STAGES`).
  - `acc:cap` → `/sprites/accessory/cap.svg`, `acc:glasses` → `glasses.svg`, `acc:crown` → `crown.svg`, `acc:wings` → `wings.svg`, `acc:halo` → `halo.svg`.
- Ajoute aussi un champ `layer: 'front' | 'back'` par accessoire dans `src/lib/config/shop.ts` (ailes & auréole = `back` ; casquette, lunettes, couronne = `front`).

### 3.3 Reframe « chevalier » des stades
- Dans `src/lib/config/avatar.ts`, garde la structure et les `minLevel`, mais reconvertis les 9 stades en **progression de chevalier** (noms + descriptions FR éditables). Proposition :
  1. Recrue · 2. Écuyer · 3. Apprenti d'armes · 4. Chevalier novice · 5. Chevalier · 6. Gardien · 7. Champion · 8. Paladin · 9. Légende.
- Les **humeurs** (`AVATAR_MOODS`) restent gérées en **CSS (auras/halo)** — pas de sprite supplémentaire. Garde `overlayEmoji` comme fallback léger.
- Réécris `src/lib/components/game/AvatarCard.svelte` pour rendre : couche arrière + base + couche avant + aura d'humeur (CSS) + halo de prestige (CSS) + cadre (`badge_frame`) en **anneau CSS** autour du conteneur (pas de sprite pour les cadres). Mets à jour tous les usages (`src/routes/+page.svelte`, `boutique/+page.svelte`).

### 3.4 Équipement par catégorie + clarté acheter/équiper
- Remplace l'unique `equipped_cosmetic_id` par **un emplacement équipé par catégorie** (`theme`, `avatar_skin`, `accessory`, `badge_frame`). Choisis l'implémentation (colonnes `equipped_theme_id`, `equipped_skin_id`, `equipped_accessory_id`, `equipped_frame_id`, **ou** petite table `equipped_cosmetics(category, reward_id)`). **Migration** : reverse l'ancien `equipped_cosmetic_id` dans le bon emplacement selon la catégorie du cosmétique.
- Mets à jour `setEquippedCosmetic`, le chargement dans `+layout.server.ts` (il doit exposer l'accessoire/skin/thème/cadre équipés), et l'endpoint `api/rewards/[id]/equip`. Équiper une couronne ne doit **plus** déséquiper le thème.
- **Acheter ≠ équiper** : après un achat (`api/rewards/[id]/claim`), **équipe automatiquement** le cosmétique acheté dans sa catégorie (comportement attendu par l'utilisateur), et garde un bouton « Équipé ✓ / Équiper » clair sur chaque carte de la boutique (`RewardCard.svelte`, `ShopGrid.svelte`), avec un état visuellement évident.

### 3.5 Skins (phase 2, léger)
- Les `avatar_skin` (ninja, mage…) **ne sont pas prioritaires** ici (ils restyleraient tout le corps → trop de sprites). Pour l'instant : applique un **léger filtre de teinte CSS** sur la base selon le skin équipé (ou laisse un TODO documenté). Ne bloque pas le chantier là-dessus.

### 3.6 Critères d'acceptation chantier 2
- J'achète des lunettes → elles sont **immédiatement portées** sur le chevalier (sur les yeux), et la boutique affiche « Équipé ✓ ».
- Je peux avoir **en même temps** un thème actif **et** un accessoire porté **et** un cadre.
- Si les fichiers sprites ne sont pas encore là, l'app affiche les emojis sans planter.
- `equipped_cosmetic_id` historique est correctement migré.

---

## 4. CHANTIER 3 — Reskin rétro 8-bit (coloré, mi-teinte, épuré, lisible)

**Objectif** : un style **jeu de chevalier rétro**, coloré mais pas criard, **ni trop sombre ni trop clair**, qui reste **épuré et très lisible**. La cohérence visuelle UI ↔ sprites passe par une **palette commune**.

### 4.1 Palette (source de vérité : Sweetie-16)
Utilise la palette pixel **Sweetie-16** comme base de design tokens :
```
#1a1c2c #5d275d #b13e53 #ef7d57 #ffcd75 #a7f070 #38b764 #257179
#29366f #3b5dc9 #41a6f6 #73eff7 #f4f4f4 #94b0c2 #566c86 #333c57
```
Retheme les variables CSS de `src/app.css` (`:root/.dark`) vers une déclinaison **mi-teinte et lisible**, par ex. (à ajuster pour le contraste) : fond `#333c57`/`#29366f` (bleu crépuscule moyen), surfaces `#566c86`/`#94b0c2`, texte clair `#f4f4f4`, muted `#94b0c2`, primary `#3b5dc9`/`#41a6f6`, accent `#73eff7`, xp `#41a6f6`, flame `#ef7d57`, gold `#ffcd75`, health `#38b764`, danger `#b13e53`, boss `#b13e53`. **Vérifie les contrastes** (texte lisible partout, viser AA). Garde le système de tokens existant (les thèmes de la boutique restent des variantes de palette — décline-les en versions rétro, sans surinvestir).

### 4.2 Typo
- Ajoute une **police pixel** (ex. « Press Start 2P » ou « Silkscreen ») **réservée aux titres, au niveau et aux chiffres de jeu** (XP, pièces, jours, HP). **Le corps de texte reste en sans lisible** (Inter ou équivalent) — priorité à la lisibilité (chantier « épuré et lisible »). Configure-la dans `tailwind.config.js` (`fontFamily.display`) et applique-la avec parcimonie.

### 4.3 Accents rétro UI (sans sacrifier la lisibilité)
- Bordures « pixel » nettes (2px), coins peu/pas arrondis pour les éléments de jeu (réduis `borderRadius` sur cartes/boutons clés), boutons « chunky » avec ombre basse façon 3D pixel.
- Barres XP / HP / progression en **segments pixel** (style barre de jeu) plutôt que dégradés lisses.
- `image-rendering: pixelated` sur les sprites ; `shape-rendering: crispEdges` si tu inlines des SVG.
- Garde de l'air et une hiérarchie claire : rétro **oui**, surchargé **non**.

### 4.4 Critères d'acceptation chantier 3
- L'app a une identité rétro colorée cohérente avec les sprites, **lisible** (contraste OK), police pixel uniquement sur titres/chiffres.
- `prefers-reduced-motion` toujours respecté ; rien n'est devenu illisible.

---

## 5. Ordre conseillé & livraison
1. Migrations + modèle de données (chantiers 1 & 2) d'abord, avec valeurs par défaut.
2. Chantier 1 (boss comportementaux) bout en bout.
3. Chantier 2 (sprites par couches + équipement par catégorie + fallback emoji).
4. Chantier 3 (reskin).
À la fin : `npm run check` vert, mets à jour `README.md` / `CLAUDE.md` si pertinent, et adapte `scripts/seed.ts` si le schéma change. Donne-moi un récap des migrations et des fichiers ajoutés/sprites attendus.

---

## 6. Annexe — Contrat d'assets (sprites SVG)

Je génère ces fichiers ailleurs et je les déposerai aux chemins ci-dessous. **Câble-les sur ce contrat ; prévois le fallback emoji si absents.**

- **Canevas commun** : tous les SVG utilisent `viewBox="0 0 64 64"`, fond **transparent**, et la **tête du personnage est toujours à la même position** (centre x≈32, sommet y≈6, bas de tête y≈24, ligne des yeux y≈14–18). C'est ce qui fait que les accessoires se superposent pile.
- **Bases (9 stades, ordre = `AVATAR_STAGES`)** :
  `static/sprites/knight/stage-1-recrue.svg` … `stage-9-legende.svg`
- **Accessoires (catégorie unique, 1 porté à la fois)** :
  `static/sprites/accessory/cap.svg` (front), `glasses.svg` (front), `crown.svg` (front), `wings.svg` (back), `halo.svg` (back)
- **Couches** : `back` = rendu **derrière** la base ; `front` = **devant** la base.
- **(Optionnel)** petites icônes UI rétro : `static/sprites/ui/coin.svg`, `flame.svg`, `heart.svg`, `shield.svg`. Si présentes, tu peux les utiliser pour pièces/flamme/HP ; sinon garde les emojis.
- Les cadres (`badge_frame`) et les humeurs **ne sont pas des sprites** : anneau/aura en **CSS**.
