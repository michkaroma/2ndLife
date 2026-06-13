Greenfield repo. I have the full spec and the balancing config. I'll now produce the complete design artifact for the "PWA finishing, push notifications, deployment, demo data" subsystem. This is a design-only task — no files to write.

I'll base assumptions about the api+state subsystem's offline outbox and DB access on the brief's schema and architecture, stating defaults explicitly where the brief is silent.

---

# HabitQuest — Subsystem Design: PWA Finishing, Push, Deployment & Demo Data

> Design artifact. Implement verbatim. All user-facing strings are FR. Stack is fixed: SvelteKit 2 + Svelte 5 runes, TS strict, Vite, Tailwind v3, better-sqlite3 v11, adapter-node, @vite-pwa/sveltekit, web-push.

## Cross-subsystem assumptions (defaults where the brief is silent)

These contracts are owned by the **api+state** and **data** subsystems; this subsystem consumes them. Stated explicitly so the engineer can wire them:

- **DB handle**: `src/lib/server/db.ts` exports `export const db: Database.Database` (better-sqlite3, synchronous, opened at `data/habitquest.db`, path overridable via `DB_PATH`). It runs migrations on import.
- **Offline outbox** (api+state subsystem): client mutations that fail offline are queued in **IndexedDB** under DB name `habitquest-outbox`, store `outbox` (keyPath `id` autoincrement), each record `{ id, url, method, body, ts }`. A client store `src/lib/stores/sync.ts` exposes `flushOutbox()` and a `$state` `pending` count. Mutations go through a helper `apiFetch(url, init)` that enqueues on network failure.
- **Auth**: a single password (`APP_PASSWORD`) gates the app; a signed session cookie (`SESSION_SECRET`) is set at `/login`. A `hooks.server.ts` redirects unauthenticated requests to `/login`, **excluding** `/login`, `/manifest.webmanifest`, the service worker, icons, and `/api/push/*` only where noted. Push subscription endpoints require a valid session (single user).
- **New table** owned here (added to the data subsystem's migrations): `push_subscriptions` (defined in §3).
- **Server config loader** owned here: `src/lib/server/env.ts` (defined in §4).

---

## 1. @vite-pwa/sveltekit configuration

### Recommendation: `injectManifest` (custom service worker)

Use **`strategies: 'injectManifest'`**, not `generateSW`. Justification:

- The app **already has** `src/service-worker.ts` in the architecture (§3 of brief) and needs **custom logic** Workbox's generateSW cannot express declaratively: (a) listening for `push` / `notificationclick`, (b) replaying the **IndexedDB offline outbox** on `sync` / on a custom message, (c) a navigation **offline fallback** to an app-shell page. generateSW only emits caching rules; the moment you need push + Background Sync + outbox replay, you must own the SW file anyway.
- injectManifest gives full control while still letting Workbox inject the precache manifest (`self.__WB_MANIFEST`) at build time. Best of both: hashed precache list + hand-written runtime/push logic.

### `vite.config.ts`

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'prompt', // we control update UX; no silent reload mid-action
      scope: '/',
      base: '/',
      injectManifest: {
        // Precache app shell + assets; SQLite/data never touched (server-side only).
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      manifest: {
        name: 'HabitQuest',
        short_name: 'HabitQuest',
        description:
          'Transforme tes bonnes habitudes et ta lutte contre les addictions en jeu vidéo : XP, niveaux, séries et récompenses.',
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#0f172a', // slate-900 — must match <meta name="theme-color">
        background_color: '#0b1120', // splash bg (slightly darker than theme)
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/?source=pwa',
        scope: '/',
        categories: ['health', 'lifestyle', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: "Valider une habitude",
            short_name: 'Aujourd’hui',
            description: "Aller directement à l’écran du jour",
            url: '/?source=shortcut',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          },
          {
            name: 'SOS envie',
            short_name: 'SOS',
            description: 'Lancer la respiration guidée',
            url: '/addictions?sos=1',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }]
          }
        ]
      },
      devOptions: {
        enabled: false, // SW off in dev to avoid stale-cache confusion on Windows
        type: 'module',
        navigateFallback: '/'
      }
    })
  ]
});
```

> Default chosen: `registerType: 'prompt'` so an update never silently reloads while the user is mid-validation; the update toast (FR copy) is in §1.5. `devOptions.enabled: false` because Windows dev + SW caching is a frequent source of confusion; enable temporarily only when debugging the SW itself.

### 1.2 `svelte.config.js` (adapter + SW awareness)

```js
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build', precompress: true }),
    // Disable SvelteKit's built-in SW handling: @vite-pwa owns it.
    serviceWorker: { register: false },
    csrf: { checkOrigin: true }
  }
};
export default config;
```

> Important: set `serviceWorker.register: false` so SvelteKit does not auto-register `src/service-worker.ts` itself — @vite-pwa registers it. Otherwise you get double registration.

### 1.3 App shell `<head>` (in `src/app.html`)

```html
<meta name="theme-color" content="#0f172a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="HabitQuest" />
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
<link rel="mask-icon" href="/icons/safari-pinned-tab.svg" color="#0f172a" />
```

(The `<link rel="manifest">` and registration script are injected by `@vite-pwa/sveltekit` — do not add them by hand.)

### 1.4 Custom `src/service-worker.ts` (injectManifest target)

TypeScript strict; uses Workbox runtime helpers. Strategy summary, then full file.

**Strategy:**
- **Precache app shell** via `self.__WB_MANIFEST` (`precacheAndRoute`). Includes built JS/CSS/icons.
- **Navigation requests** (`request.mode === 'navigate'`): **NetworkFirst** with a timeout, falling back to the precached app-shell entry `/` so the SPA boots offline; SvelteKit then renders cached client routes.
- **GET `/api/**`** read endpoints: **NetworkFirst** with a short `networkTimeoutSeconds`, cache name `api-cache`, so the dashboard shows last-known data offline.
- **Static images/fonts**: **CacheFirst** with expiration.
- **Mutations** (POST/PUT/PATCH/DELETE to `/api/**`): **never** intercepted by the SW. The outbox lives in the client (api+state subsystem). The SW only triggers a **replay signal**: on `sync` event (tag `outbox-sync`) and on a `message` `{type:'FLUSH_OUTBOX'}`, it posts a message to all clients so the page calls `flushOutbox()`. (Background Sync is best-effort on Android Chrome; the client also flushes on `online` and on focus.)
- **Push** + **notificationclick** handlers (payload contract in §3).
- **SKIP_WAITING** message handler for the update-prompt flow.

```ts
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

const SHELL_URL = '/'; // precached SPA entry, used as offline fallback

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navigations: try network, fall back to cached app shell when offline.
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'pages',
      networkTimeoutSeconds: 3,
      plugins: [new CacheableResponsePlugin({ statuses: [200] })]
    }),
    { denylist: [/^\/api\//, /^\/login/] } // never SPA-fallback the login page or API
  )
);

// Read API (GET only): show last-known data offline.
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 })
    ]
  }),
  'GET'
);

// Images / fonts.
registerRoute(
  ({ request }) => ['image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })
    ]
  })
);

// --- Offline outbox replay signal (client owns the IndexedDB outbox) ---
function tellClientsToFlush(): void {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((cs) => {
    for (const c of cs) c.postMessage({ type: 'FLUSH_OUTBOX' });
  });
}
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'outbox-sync') event.waitUntil(Promise.resolve(tellClientsToFlush()));
});

// --- Update prompt flow ---
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | undefined;
  if (data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (data?.type === 'FLUSH_OUTBOX') tellClientsToFlush();
});

// --- Web Push ---
interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}
self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {
    title: 'HabitQuest',
    body: 'Tu as des habitudes à valider aujourd’hui.'
  };
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as PushPayload) };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag ?? 'daily-reminder',
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: payload.url ?? '/?source=push' },
      lang: 'fr'
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data?.url as string) ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c) {
          c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
```

> Add Workbox deps: `workbox-precaching workbox-routing workbox-strategies workbox-expiration workbox-cacheable-response` (pulled in transitively by `@vite-pwa/sveltekit`, but list them in devDeps so TS types resolve). Add `"lib": ["esnext", "webworker", "dom"]` is not needed globally; the `/// <reference lib="webworker" />` at top scopes it.

### 1.5 Update prompt component (FR) — `src/lib/components/PwaUpdater.svelte`

```svelte
<script lang="ts">
  import { useRegisterSW } from 'virtual:pwa-register/svelte';

  const { needRefresh, updateServiceWorker, offlineReady } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for updates hourly.
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    }
  });
</script>

{#if $offlineReady}
  <div class="pwa-toast">Application prête à fonctionner hors-ligne.</div>
{/if}
{#if $needRefresh}
  <div class="pwa-toast">
    <span>Une nouvelle version est disponible.</span>
    <button onclick={() => updateServiceWorker(true)}>Mettre à jour</button>
    <button onclick={() => { $needRefresh = false; }}>Plus tard</button>
  </div>
{/if}
```

Mount once in `src/routes/+layout.svelte`. Add `"types": ["vite-plugin-pwa/svelte"]` (or `/// <reference types="vite-plugin-pwa/svelte" />` in `src/app.d.ts`) so `virtual:pwa-register/svelte` types resolve.

---

## 2. Icons

### 2.1 Exact files required in `static/icons/`

| File | Size | purpose | Used by |
|---|---|---|---|
| `static/icons/icon-192.png` | 192×192 | any | manifest, notifications |
| `static/icons/icon-512.png` | 512×512 | any | manifest, splash |
| `static/icons/maskable-192.png` | 192×192 | maskable | Android adaptive |
| `static/icons/maskable-512.png` | 512×512 | maskable | Android adaptive |
| `static/icons/apple-touch-icon.png` | 180×180 | — | iOS home screen |
| `static/icons/badge-72.png` | 72×72 | monochrome | notification badge (Android status bar) |
| `static/favicon.png` | 32×32 | — | browser tab |
| `static/icons/safari-pinned-tab.svg` | vector | — | Safari mask-icon |

> Maskable icons must keep the logo inside the **safe zone** (center ~80%, i.e. ~40% radius) so Android's circle/squircle masks don't crop it. The generator below adds ~20% padding for maskable variants and a full-bleed background.

### 2.2 Source asset

One source SVG at `assets/logo-source.svg` (not shipped; lives outside `static/`). Concrete placeholder content (dark slate bg + emerald flame "Q" mark, on-brand with `#0f172a` / emerald accents):

```svg
<!-- assets/logo-source.svg -->
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="96" fill="#0f172a"/>
  <path d="M256 96c-36 52-84 84-84 148a84 84 0 1 0 168 0c0-36-18-58-36-86-14 22-34 28-34 52a18 18 0 1 1-36 0c0-50 30-86 58-114z"
        fill="#34d399"/>
  <circle cx="256" cy="276" r="34" fill="#0f172a"/>
  <text x="256" y="300" font-family="Arial, sans-serif" font-size="80" font-weight="700"
        text-anchor="middle" fill="#34d399">Q</text>
</svg>
```

### 2.3 Windows-friendly generator (Node + sharp) — `scripts/icons.ts`

Run with `npm run icons`. Uses `sharp` (prebuilt binaries, installs cleanly on Windows). All paths are POSIX-style via `path.join`, so it works under PowerShell.

```ts
// scripts/icons.ts  —  run: npm run icons
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join('assets', 'logo-source.svg');
const OUT = join('static', 'icons');
mkdirSync(OUT, { recursive: true });
mkdirSync('static', { recursive: true });

const BG = '#0f172a'; // background_color family for full-bleed/maskable

const svg = readFileSync(SRC);

async function plain(size: number, file: string): Promise<void> {
  await sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: BG })
    .png()
    .toFile(join(OUT, file));
  console.log('  ✓', file);
}

// Maskable: render logo at 80% then pad 10% each side on a solid bg (safe zone).
async function maskable(size: number, file: string): Promise<void> {
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const logo = await sharp(svg, { density: 384 }).resize(inner, inner, { fit: 'contain', background: BG }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, top: pad, left: pad }])
    .png()
    .toFile(join(OUT, file));
  console.log('  ✓', file);
}

async function main(): Promise<void> {
  console.log('Generating PWA icons from', SRC);
  await plain(192, 'icon-192.png');
  await plain(512, 'icon-512.png');
  await plain(180, 'apple-touch-icon.png');
  await plain(72, 'badge-72.png');
  await maskable(192, 'maskable-192.png');
  await maskable(512, 'maskable-512.png');
  // favicon at static root
  await sharp(svg, { density: 384 }).resize(32, 32, { fit: 'contain', background: BG }).png().toFile(join('static', 'favicon.png'));
  console.log('  ✓ favicon.png');
  console.log('Done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- `safari-pinned-tab.svg`: copy `assets/logo-source.svg` to `static/icons/safari-pinned-tab.svg` manually (Safari wants a flat monochrome path; the placeholder is acceptable for personal use).
- Dev deps: `sharp` (devDependency), plus `tsx` to run TS scripts directly.
- `package.json`: `"icons": "tsx scripts/icons.ts"`.

> Alternative if `sharp` ever fails to install on this Windows machine: keep `static/icons/icon-512.svg` etc. and reference SVGs directly in the manifest with `"type": "image/svg+xml"`. Chrome accepts SVG manifest icons, but **iOS apple-touch-icon and the notification badge need raster PNG**, so sharp is the recommended path. Stated default: use sharp.

---

## 3. Web Push

### 3.1 VAPID key generation

```bash
npx web-push generate-vapid-keys
```

Outputs a `Public Key` and `Private Key`. Paste them into `.env` as `VAPID_PUBLIC` / `VAPID_PRIVATE`. The public key is **also** needed client-side; expose it via a tiny endpoint (§3.4) rather than baking it in at build time (keeps it in one place — the server env).

### 3.2 New table (added to data subsystem migrations)

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> Single user, but multiple devices (phone + desktop) → multiple rows. `endpoint` is unique so re-subscribing upserts.

### 3.3 Server push module — `src/lib/server/push.ts`

```ts
import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { db } from './db';
import { env } from './env';

webpush.setVapidDetails(`mailto:${env.VAPID_SUBJECT}`, env.VAPID_PUBLIC, env.VAPID_PRIVATE);

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const insertSub = db.prepare(
  `INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_agent)
   VALUES (@endpoint, @p256dh, @auth, @user_agent)
   ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
);
const deleteSub = db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`);
const allSubs = db.prepare<[], SubRow>(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`);
const deleteById = db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`);

export function saveSubscription(sub: WebPushSubscription, userAgent: string | null): void {
  insertSub.run({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    user_agent: userAgent
  });
}

export function removeSubscription(endpoint: string): void {
  deleteSub.run(endpoint);
}

/** Send a payload to every stored subscription; prune dead ones (404/410). */
export async function sendToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  const subs = allSubs.all();
  let sent = 0;
  let pruned = 0;
  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          deleteById.run(s.id);
          pruned++;
        }
      }
    })
  );
  return { sent, pruned };
}
```

### 3.4 Endpoints (SvelteKit routes)

**`GET /api/push/vapid`** → public key for the client.
```ts
// src/routes/api/push/vapid/+server.ts
import { json } from '@sveltejs/kit';
import { env } from '$lib/server/env';
export const GET = () => json({ publicKey: env.VAPID_PUBLIC });
```

**`POST /api/push/subscribe`** → store subscription.
```ts
// src/routes/api/push/subscribe/+server.ts
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { saveSubscription } from '$lib/server/push';
export const POST: RequestHandler = async ({ request }) => {
  const sub = await request.json();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw error(400, 'Abonnement invalide');
  saveSubscription(sub, request.headers.get('user-agent'));
  return json({ ok: true });
};
```

**`POST /api/push/unsubscribe`** → remove.
```ts
// src/routes/api/push/unsubscribe/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { removeSubscription } from '$lib/server/push';
export const POST: RequestHandler = async ({ request }) => {
  const { endpoint } = await request.json();
  if (endpoint) removeSubscription(endpoint);
  return json({ ok: true });
};
```

**`POST /api/push/test`** → send a test notification (gated by session).
```ts
// src/routes/api/push/test/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { sendToAll } from '$lib/server/push';
export const POST: RequestHandler = async () => {
  const r = await sendToAll({
    title: 'HabitQuest',
    body: 'Ceci est une notification de test. Tout fonctionne ! 🎉',
    url: '/'
  });
  return json(r);
};
```

### 3.5 Client subscribe flow — `src/lib/client/push.ts`

`urlBase64ToUint8Array` is the standard VAPID key decoder.

```ts
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushState = 'unsupported' | 'denied' | 'default' | 'subscribed';

export async function getPushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return 'subscribed';
  return Notification.permission === 'granted' ? 'default' : 'default';
}

export async function enablePush(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';

  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await fetch('/api/push/vapid').then((r) => r.json());

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sub)
  });
  return 'subscribed';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint })
    });
    await sub.unsubscribe();
  }
}
```

UI: a toggle in a settings panel labeled **« Rappels quotidiens »** that calls `enablePush()`/`disablePush()` and shows FR status text (« Notifications activées », « Notifications refusées dans le navigateur », « Non supporté sur cet appareil »). **Trigger `enablePush()` only from a user tap** (browsers require a user gesture for the permission prompt) — never on load.

### 3.6 Daily reminder — recommendation: **`node-cron` inside the adapter-node server**

Two documented options; recommend in-process `node-cron`:

**Recommended — in-process scheduler.** Self-hosted single Node process → simplest, no external moving parts, no extra auth surface. Risk (job not firing if the process is down) is acceptable for a personal app and mitigated by systemd auto-restart (§5).

Wire it via a SvelteKit `init` hook so it starts exactly once with the server.

```ts
// src/hooks.server.ts  (add to existing hooks)
import cron from 'node-cron';
import type { ServerInit } from '@sveltejs/kit';
import { sendToAll } from '$lib/server/push';
import { env } from '$lib/server/env';
import { buildDailyReminder } from '$lib/server/reminder';

let started = false;
export const init: ServerInit = async () => {
  if (started || env.DISABLE_CRON) return;
  started = true;
  const [h, m] = env.PUSH_TIME.split(':'); // "20:00"
  // cron: "m h * * *" in the server's local TZ
  cron.schedule(`${Number(m)} ${Number(h)} * * *`, async () => {
    const payload = buildDailyReminder();
    if (payload) await sendToAll(payload);
  });
  console.log(`[cron] Rappel quotidien programmé à ${env.PUSH_TIME}`);
};
```

```ts
// src/lib/server/reminder.ts
import { db } from './db';
import type { PushPayload } from './push';

const todoToday = db.prepare<[string], { c: number }>(
  `SELECT COUNT(*) AS c FROM habits h
   WHERE h.archived = 0
     AND NOT EXISTS (
       SELECT 1 FROM habit_logs l WHERE l.habit_id = h.id AND l.date = ?
     )`
);

/** Returns null if nothing to remind (all habits already logged today). */
export function buildDailyReminder(): PushPayload | null {
  const today = new Date().toISOString().slice(0, 10);
  const remaining = todoToday.get(today)?.c ?? 0;
  if (remaining === 0) {
    return {
      title: 'HabitQuest',
      body: 'Bravo, tout est validé pour aujourd’hui. 🔥 Reviens demain !',
      url: '/'
    };
  }
  const word = remaining === 1 ? 'habitude' : 'habitudes';
  return {
    title: 'HabitQuest',
    body: `Il te reste ${remaining} ${word} à valider aujourd’hui. Un petit pas compte. 💪`,
    url: '/?source=push',
    tag: 'daily-reminder'
  };
}
```

> The reminder copy is deliberately **bienveillant** (§7 of brief): even when nothing is done, it encourages rather than shames.

**Documented alternative — external cron hitting `/api/cron/daily`.** If the user prefers OS-level scheduling, add this endpoint and protect it with a shared secret; do **not** enable `node-cron` simultaneously (set `DISABLE_CRON=1`).

```ts
// src/routes/api/cron/daily/+server.ts
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { sendToAll } from '$lib/server/push';
import { buildDailyReminder } from '$lib/server/reminder';
import { env } from '$lib/server/env';
export const POST: RequestHandler = async ({ request }) => {
  if (request.headers.get('x-cron-secret') !== env.CRON_SECRET) throw error(401, 'Non autorisé');
  const payload = buildDailyReminder();
  if (!payload) return json({ skipped: true });
  return json(await sendToAll(payload));
};
```
Windows dev cron equivalent / Linux prod crontab line:
```
0 20 * * *  curl -s -X POST https://habitquest.example.com/api/cron/daily -H "x-cron-secret: $CRON_SECRET" > /dev/null
```

> Decision: ship `node-cron` on by default (`DISABLE_CRON` unset). The `/api/cron/daily` endpoint and `CRON_SECRET` are included but inert unless the user opts into external cron. Note this route must be exempted from the auth redirect in `hooks.server.ts`.

Dependency: `node-cron` (+ `@types/node-cron`).

---

## 4. Environment config

### 4.1 `.env.example`

```dotenv
# --- Web Push (VAPID) — generate with: npx web-push generate-vapid-keys ---
VAPID_PUBLIC=remplace-moi
VAPID_PRIVATE=remplace-moi
VAPID_SUBJECT=michael.romary@bilansetbudgets.fr   # mailto utilisé par le contact VAPID

# --- Accès (mono-utilisateur) ---
APP_PASSWORD=change-moi-en-un-mot-de-passe-fort
SESSION_SECRET=chaine-aleatoire-longue-32+caracteres   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# --- Réseau / déploiement ---
ORIGIN=https://habitquest.example.com   # requis par adapter-node derrière un proxy
PORT=3000
HOST=127.0.0.1

# --- Rappels push ---
PUSH_TIME=20:00          # heure locale du rappel quotidien (HH:MM, 24h)
# DISABLE_CRON=1         # décommente si tu utilises un cron externe
CRON_SECRET=             # requis uniquement pour /api/cron/daily (cron externe)

# --- Base de données ---
DB_PATH=./data/habitquest.db
```

### 4.2 Server-side config loader — `src/lib/server/env.ts`

Validate at startup; fail fast with FR error if a required var is missing. Uses SvelteKit's `$env/dynamic/private` so values are read at **runtime** (adapter-node), not baked at build — essential for VAPID/secret rotation without rebuild.

```ts
import { env as dyn } from '$env/dynamic/private';

function required(name: string): string {
  const v = dyn[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

export const env = {
  VAPID_PUBLIC: required('VAPID_PUBLIC'),
  VAPID_PRIVATE: required('VAPID_PRIVATE'),
  VAPID_SUBJECT: dyn.VAPID_SUBJECT ?? 'mailto:admin@localhost',
  APP_PASSWORD: required('APP_PASSWORD'),
  SESSION_SECRET: required('SESSION_SECRET'),
  ORIGIN: dyn.ORIGIN ?? 'http://localhost:5173',
  PUSH_TIME: dyn.PUSH_TIME ?? '20:00',
  DISABLE_CRON: dyn.DISABLE_CRON === '1',
  CRON_SECRET: dyn.CRON_SECRET ?? '',
  DB_PATH: dyn.DB_PATH ?? './data/habitquest.db'
} as const;
```

> `VAPID_SUBJECT` is used as `mailto:${env.VAPID_SUBJECT}` in `push.ts`; if the value already starts with `mailto:`, strip duplication — simpler default: store the bare email and always prefix. Adjust `push.ts` accordingly (the §3.3 code prefixes `mailto:`; so put a bare email in `.env`). adapter-node reads `PORT`/`HOST`/`ORIGIN` natively — they don't need to be re-read here except `ORIGIN` for building absolute URLs in push payloads if ever needed.

---

## 5. README.md outline

```markdown
# HabitQuest 🎮🔥

App PWA personnelle, mono-utilisateur, pour bâtir de bonnes habitudes et vaincre des addictions sous forme de jeu (XP, niveaux, séries, récompenses). SvelteKit + SQLite, auto-hébergée.

## Prérequis
- Node.js ≥ 20
- (Prod) un nom de domaine + Caddy ou nginx pour le HTTPS

## 1. Installation
```bash
git clone <repo> habitquest
cd habitquest
npm install
cp .env.example .env        # Windows PowerShell : Copy-Item .env.example .env
```

## 2. Configurer l'environnement
- Générer les clés VAPID :
  ```bash
  npx web-push generate-vapid-keys
  ```
  Copier `Public Key` → `VAPID_PUBLIC`, `Private Key` → `VAPID_PRIVATE` dans `.env`.
- Générer un secret de session :
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  → `SESSION_SECRET`.
- Définir `APP_PASSWORD` et `ORIGIN`.

## 3. Icônes (une fois)
```bash
npm run icons        # génère static/icons/* depuis assets/logo-source.svg
```

## 4. Données de démo (optionnel)
```bash
npm run seed         # remplit data/habitquest.db avec un profil de démonstration
```

## 5. Développement
```bash
npm run dev          # http://localhost:5173
```

## 6. Build & lancement production
```bash
npm run build
node build           # ou : npm start
```
Variables lues au runtime : `PORT`, `HOST`, `ORIGIN`, plus celles du `.env`.

## 7. Scripts npm
| Script | Effet |
|---|---|
| `npm run dev` | serveur de dev Vite |
| `npm run build` | build production (adapter-node → `build/`) |
| `npm start` | lance `node build` |
| `npm run icons` | génère les icônes PWA |
| `npm run seed` | injecte les données de démo |
| `npm run check` | svelte-check (TS strict) |

## 8. Déploiement (auto-hébergé, HTTPS obligatoire)
> Le Web Push et l'installation PWA exigent HTTPS. On lance Node en local (127.0.0.1:3000) derrière un reverse proxy qui gère TLS.

### Lancer le serveur Node
```bash
npm run build
HOST=127.0.0.1 PORT=3000 ORIGIN=https://habitquest.example.com node build
```

### Option A — Caddy (TLS automatique, recommandé)
`/etc/caddy/Caddyfile` :
```
habitquest.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```
`sudo systemctl reload caddy` — Caddy obtient et renouvelle le certificat seul.

### Option B — nginx (+ certbot pour TLS)
```nginx
server {
    listen 443 ssl http2;
    server_name habitquest.example.com;

    ssl_certificate     /etc/letsencrypt/live/habitquest.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/habitquest.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
    }
}
server {
    listen 80;
    server_name habitquest.example.com;
    return 301 https://$host$request_uri;
}
```
> `ORIGIN` doit correspondre exactement à l'URL HTTPS, sinon les POST échouent (protection CSRF d'adapter-node).

### Persistance SQLite
La base vit dans `data/habitquest.db` (ignorée par git). En prod, place ce dossier sur un disque persistant et sauvegarde-le. Définir `DB_PATH` si tu déplaces le fichier. **Ne jamais** committer ce fichier.

### systemd (optionnel)
`/etc/systemd/system/habitquest.service` :
```ini
[Unit]
Description=HabitQuest (SvelteKit/Node)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/habitquest
EnvironmentFile=/opt/habitquest/.env
Environment=HOST=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/node build
Restart=always
RestartSec=5
User=habitquest

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now habitquest
sudo systemctl status habitquest
```

## 9. Notifications
- Activer dans l'app via le réglage « Rappels quotidiens » (un tap → demande la permission).
- Le rappel part chaque jour à `PUSH_TIME` (par défaut 20:00) via un planificateur interne (`node-cron`).
- Pour utiliser un cron externe à la place : `DISABLE_CRON=1` + appel POST de `/api/cron/daily` avec l'en-tête `x-cron-secret: $CRON_SECRET`.

## 10. Sécurité / vie privée
App mono-utilisateur, jamais publique sans `APP_PASSWORD`. Aucune donnée envoyée à un tiers (sauf le service de push du navigateur).
```

---

## 6. CLAUDE.md outline

```markdown
# CLAUDE.md — HabitQuest

App PWA perso (mono-utilisateur) de gamification d'habitudes + sevrage d'addictions.
Lire `brief-claude-code-habitquest.md` pour la spec complète. UI en FRANÇAIS.

## Stack (imposée — ne pas dévier)
SvelteKit 2 + Svelte 5 (runes : $state/$derived/$props/$effect ; store seulement pour l'état partagé) ·
TypeScript strict · Vite · TailwindCSS v3 (tailwind.config.js) ·
better-sqlite3 v11 (synchrone) · @sveltejs/adapter-node · @vite-pwa/sveltekit (injectManifest) · web-push (VAPID).

## Architecture
- `src/lib/config/progression.ts` — ⭐ TOUS les nombres d'équilibrage (BASE_XP 100, EXPONENT 1.5, XP_PER_HABIT 25, XP_BREAK_HABIT_DAY 30, streak +2%/j cap +50%, prestige L50). Ne pas disperser les constantes.
- `src/lib/server/db.ts` — connexion SQLite + migrations (exécutées à l'import). Expose `db`.
- `src/lib/server/progression.ts` — moteur XP / niveaux / séries.
- `src/lib/server/quests.ts` — génération/rotation quêtes.
- `src/lib/server/achievements.ts` — déblocage succès.
- `src/lib/server/push.ts` · `reminder.ts` · `env.ts` — push, rappel quotidien, config runtime.
- `src/service-worker.ts` — SW custom (precache + runtime cache + push + relais outbox).
- `src/lib/stores/sync.ts` — outbox hors-ligne (IndexedDB), `flushOutbox()`, `pending`.
- `src/routes/api/**` — endpoints (log, quest, push/*, cron/daily).
- `scripts/icons.ts` (npm run icons) · `scripts/seed.ts` (npm run seed).

## Conventions
- Dates : `YYYY-MM-DD` local. Séries calculées depuis `habit_logs`, pas stockées.
- Rechutes = donnée neutre, ton bienveillant (§7 du brief). Jamais de remise à zéro humiliante.
- Strings user = FR. Identifiants/commentaires = EN ok.
- Mutations passent par `apiFetch()` → outbox si offline. SW ne touche jamais les POST.
- Config lue au runtime via `$env/dynamic/private` (rotation sans rebuild).

## Modèle de données
7 tables du brief (§4) + `push_subscriptions` (endpoint UNIQUE, p256dh, auth).

## État d'avancement (mettre à jour à chaque session)
- [ ] Étape 1 — Setup (SvelteKit/TS/Tailwind/SQLite/PWA, dev démarre)
- [ ] Étape 2 — Couche données (schéma + migrations + db.ts)
- [ ] Étape 3 — Boucle principale (CRUD habitudes + écran Aujourd'hui)
- [ ] Étape 4 — Moteur progression (XP/niveaux/pièces/séries + dashboard)
- [ ] Étape 5 — Quêtes + succès
- [ ] Étape 6 — Avatar + boutique
- [ ] Étape 7 — Module addictions (boss/clean/argent/santé/SOS/journal)
- [ ] Étape 8 — Finition PWA + Web Push (rappel quotidien)  ← ce sous-système
- [ ] Étape 9 — README + déploiement + données de démo

## Pièges connus
- `serviceWorker.register: false` dans svelte.config.js (sinon double registration avec @vite-pwa).
- `ORIGIN` doit matcher l'URL HTTPS en prod (CSRF adapter-node).
- `devOptions.enabled: false` pour le SW en dev (cache obsolète sur Windows).
- Permission push : seulement sur tap utilisateur.
- node-cron démarre via le hook `init` une seule fois (garde `started`).
```

---

## 7. Demo seed — `scripts/seed.ts` (`npm run seed`)

Idempotent: wraps everything in a transaction, clears the gamified tables first, recomputes dates **relative to today** so streaks are always "current" whenever you run it. All content FR. Uses the shared `db` and `progression` config so XP totals stay consistent.

### 7.1 Data plan (precise)

**Anchor:** `today = local date`. Helper `daysAgo(n)` → `YYYY-MM-DD`.

**Habits (6):** mix of build/break, varied difficulty/category/icon.

| id | name (FR) | type | category | difficulty | icon |
|---|---|---|---|---|---|
| 1 | Boire 2 L d'eau | build | Santé | 1 | 💧 |
| 2 | 30 min de sport | build | Forme | 2 | 🏋️ |
| 3 | Lecture 20 min | build | Esprit | 1 | 📖 |
| 4 | Méditation | build | Bien-être | 2 | 🧘 |
| 5 | Pas de sucre raffiné | break | Alimentation | 3 | 🍩 |
| 6 | Coucher avant 23h | build | Sommeil | 2 | 🌙 |

**Habit logs (~30 days), engineered streaks + gaps:**
- **Habit 1 (eau)** — `done` every day from `daysAgo(29)` to `daysAgo(0)` → **30-day current streak** (the showcase flame).
- **Habit 2 (sport)** — `done` on a 3-on/1-off cadence across 30 days; ensure the **last 8 days are consecutive `done`** → current streak 8, with earlier gaps visible in history.
- **Habit 3 (lecture)** — `done` daily `daysAgo(13)`→`daysAgo(0)` → **14-day streak**; nothing before (started 2 weeks ago).
- **Habit 4 (méditation)** — `done` `daysAgo(20)`→`daysAgo(6)`, then a **gap** at `daysAgo(5)` and `daysAgo(4)` (a `skipped` row at `daysAgo(5)` to demonstrate a **freeze-protected** miss), then `done` `daysAgo(3)`→`daysAgo(0)` → current streak 4, best historical longer.
- **Habit 5 (sucre, break)** — mostly `done` `daysAgo(29)`→`daysAgo(0)` **except** a `relapsed` row at `daysAgo(11)` (demonstrates **bienveillant relapse handling**: streak resets there, current streak = 11, no shame UI). 
- **Habit 6 (coucher)** — `done` on ~70% of the last 30 days, irregular, current streak 3.

Insert rule: only insert rows that exist (don't insert `done` for every day of every habit). Status values strictly in `('done','skipped','relapsed')`.

**addiction_targets (2):**

| id | name | clean_since | money_per_day | best_streak_days |
|---|---|---|---|---|
| 1 | Cigarette | `daysAgo(73)` | 12.50 | 73 |
| 2 | Sucre / grignotage | `daysAgo(11)` | 4.00 | 41 |

> Target 1: 73 days clean → ~912.50 € saved, mature boss nearly defeated. Target 2: recently restarted (best 41 > current 11) → demonstrates the "meilleure série" framing over loss.

**quests (5)** — daily + weekly, some completed. `period`: daily = `today`; weekly = ISO week of today, format `YYYY-Www`.

| scope | description (FR) | target | progress | reward_xp | reward_coins | completed |
|---|---|---|---|---|---|---|
| daily | Valide 3 habitudes aujourd'hui | 3 | 3 | 60 | 15 | 1 |
| daily | Note une entrée dans ton journal | 1 | 0 | 30 | 10 | 0 |
| daily | Reste clean sur une addiction | 1 | 1 | 40 | 10 | 1 |
| weekly | Atteins 5 jours clean cette semaine | 5 | 4 | 150 | 50 | 0 |
| weekly | Valide 15 habitudes cette semaine | 15 | 15 | 200 | 75 | 1 |

**achievements (seed all keys; unlock a subset)** — `unlocked_at` set for unlocked, NULL otherwise.

| key | name (FR) | description (FR) | unlocked_at |
|---|---|---|---|
| first_step | Premier pas | Valide ta toute première habitude. | `daysAgo(29)` |
| streak_7 | Série de 7 | Tiens une série de 7 jours. | `daysAgo(22)` |
| streak_30 | Série de 30 | Tiens une série de 30 jours. | `daysAgo(0)` |
| streak_100 | Centurion | Tiens une série de 100 jours. | NULL |
| level_10 | Niveau 10 | Atteins le niveau 10. | `daysAgo(8)` |
| clean_30 | Un mois clean | 30 jours clean sur une addiction. | `daysAgo(43)` |
| clean_90 | Trois mois clean | 90 jours clean sur une addiction. | NULL |
| boss_slayer | Pourfendeur | Vaincs ton premier boss. | NULL |
| night_owl_reformed | Lève-tôt | 7 jours de coucher avant 23h. | NULL |

**rewards (shop, 5)** — mix cosmetic + real; one already claimed.

| name (FR) | cost | kind | claimed_at |
|---|---|---|---|
| Thème "Aurore" pour l'avatar | 200 | cosmetic | NULL |
| Couronne dorée | 500 | cosmetic | `daysAgo(15)` |
| Compagnon : petit dragon | 800 | cosmetic | NULL |
| Sortie ciné 🎬 | 500 | real | NULL |
| Soirée jeu vidéo (2h sans culpabilité) | 300 | real | `daysAgo(5)` |

**trigger_journal (5)** — varied craving/gave_in, FR triggers, tied to targets.

| target_id | date | trigger | craving | note | gave_in |
|---|---|---|---|---|---|
| 1 | `daysAgo(20)` | Café du matin | 7 | "Réflexe avec le café, j'ai tenu en respirant." | 0 |
| 1 | `daysAgo(12)` | Stress au travail | 9 | "Grosse envie après une réunion difficile." | 0 |
| 1 | `daysAgo(4)` | Soirée entre amis | 6 | "Tentation sociale, j'ai bu un verre d'eau à la place." | 0 |
| 2 | `daysAgo(11)` | Ennui le soir | 8 | "J'ai cédé, mais je note et je repars demain." | 1 |
| 2 | `daysAgo(2)` | Fatigue après-midi | 5 | "Envie de sucré, remplacée par un fruit." | 0 |

**user_state (single row):** compute a coherent total. Sum the seeded `done`/clean XP roughly to land the user around **level 12–14** with some coins. Concrete values to insert (don't over-engineer — set directly): `total_xp = 9200`, `coins = 640`, `prestige = 0`, `freezes = 2`, `last_active = today`, `created_at = daysAgo(73)`. 

> `total_xp = 9200` → with BASE_XP 100 / EXPONENT 1.5 this lands around L13 (`totalXpForLevel(13)≈7700`, `(14)≈9700`), matching the `level_10` achievement being unlocked and giving a believable mid-game profile. `coins 640` is enough to afford some shop items but not all. `freezes 2` shows the freeze mechanic has stock.

### 7.2 Exact script

```ts
// scripts/seed.ts  —  run: npm run seed
import { db } from '../src/lib/server/db';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function isoWeek(): string {
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
const today = daysAgo(0);
const week = isoWeek();

const seed = db.transaction(() => {
  // 0. Reset (children first for FKs)
  db.exec(`
    DELETE FROM trigger_journal;
    DELETE FROM habit_logs;
    DELETE FROM quests;
    DELETE FROM rewards;
    DELETE FROM achievements;
    DELETE FROM addiction_targets;
    DELETE FROM habits;
    DELETE FROM user_state;
    DELETE FROM sqlite_sequence WHERE name IN
      ('habits','habit_logs','quests','rewards','addiction_targets','trigger_journal');
  `);

  // 1. user_state
  db.prepare(
    `INSERT INTO user_state (id, total_xp, coins, prestige, freezes, last_active, created_at)
     VALUES (1, 9200, 640, 0, 2, ?, ?)`
  ).run(today, daysAgo(73));

  // 2. habits
  const insHabit = db.prepare(
    `INSERT INTO habits (id, name, type, category, difficulty, icon, archived, created_at)
     VALUES (@id,@name,@type,@category,@difficulty,@icon,0,@created_at)`
  );
  const habits = [
    { id: 1, name: "Boire 2 L d'eau", type: 'build', category: 'Santé', difficulty: 1, icon: '💧', created_at: daysAgo(29) },
    { id: 2, name: '30 min de sport', type: 'build', category: 'Forme', difficulty: 2, icon: '🏋️', created_at: daysAgo(30) },
    { id: 3, name: 'Lecture 20 min', type: 'build', category: 'Esprit', difficulty: 1, icon: '📖', created_at: daysAgo(13) },
    { id: 4, name: 'Méditation', type: 'build', category: 'Bien-être', difficulty: 2, icon: '🧘', created_at: daysAgo(20) },
    { id: 5, name: 'Pas de sucre raffiné', type: 'break', category: 'Alimentation', difficulty: 3, icon: '🍩', created_at: daysAgo(29) },
    { id: 6, name: 'Coucher avant 23h', type: 'build', category: 'Sommeil', difficulty: 2, icon: '🌙', created_at: daysAgo(30) }
  ];
  habits.forEach((h) => insHabit.run(h));

  // 3. habit_logs
  const insLog = db.prepare(
    `INSERT OR IGNORE INTO habit_logs (habit_id, date, status, note) VALUES (?, ?, ?, ?)`
  );
  // Habit 1: 30-day perfect streak
  for (let n = 29; n >= 0; n--) insLog.run(1, daysAgo(n), 'done', null);
  // Habit 2: 3-on/1-off, but last 8 days consecutive
  for (let n = 29; n >= 8; n--) { if ((29 - n) % 4 !== 3) insLog.run(2, daysAgo(n), 'done', null); }
  for (let n = 7; n >= 0; n--) insLog.run(2, daysAgo(n), 'done', null);
  // Habit 3: 14-day streak
  for (let n = 13; n >= 0; n--) insLog.run(3, daysAgo(n), 'done', null);
  // Habit 4: streak with a freeze-protected gap
  for (let n = 20; n >= 6; n--) insLog.run(4, daysAgo(n), 'done', null);
  insLog.run(4, daysAgo(5), 'skipped', 'Journée chargée — série protégée par un gel.');
  for (let n = 3; n >= 0; n--) insLog.run(4, daysAgo(n), 'done', null);
  // Habit 5 (break): clean except a relapse at daysAgo(11)
  for (let n = 29; n >= 0; n--) {
    if (n === 11) insLog.run(5, daysAgo(11), 'relapsed', 'Rechute notée. On repart, sans se juger.');
    else insLog.run(5, daysAgo(n), 'done', null);
  }
  // Habit 6: ~70% irregular, last 3 consecutive
  const skip6 = new Set([29, 27, 24, 23, 19, 16, 12, 9, 6]);
  for (let n = 29; n >= 0; n--) if (!skip6.has(n)) insLog.run(6, daysAgo(n), 'done', null);

  // 4. addiction_targets
  const insTarget = db.prepare(
    `INSERT INTO addiction_targets (id, name, clean_since, money_per_day, best_streak_days)
     VALUES (?,?,?,?,?)`
  );
  insTarget.run(1, 'Cigarette', daysAgo(73), 12.5, 73);
  insTarget.run(2, 'Sucre / grignotage', daysAgo(11), 4.0, 41);

  // 5. quests
  const insQuest = db.prepare(
    `INSERT INTO quests (scope, description, target, progress, reward_xp, reward_coins, period, completed)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  insQuest.run('daily', 'Valide 3 habitudes aujourd’hui', 3, 3, 60, 15, today, 1);
  insQuest.run('daily', 'Note une entrée dans ton journal', 1, 0, 30, 10, today, 0);
  insQuest.run('daily', 'Reste clean sur une addiction', 1, 1, 40, 10, today, 1);
  insQuest.run('weekly', 'Atteins 5 jours clean cette semaine', 5, 4, 150, 50, week, 0);
  insQuest.run('weekly', 'Valide 15 habitudes cette semaine', 15, 15, 200, 75, week, 1);

  // 6. achievements
  const insAch = db.prepare(
    `INSERT INTO achievements (key, name, description, unlocked_at) VALUES (?,?,?,?)`
  );
  insAch.run('first_step', 'Premier pas', 'Valide ta toute première habitude.', daysAgo(29));
  insAch.run('streak_7', 'Série de 7', 'Tiens une série de 7 jours.', daysAgo(22));
  insAch.run('streak_30', 'Série de 30', 'Tiens une série de 30 jours.', daysAgo(0));
  insAch.run('streak_100', 'Centurion', 'Tiens une série de 100 jours.', null);
  insAch.run('level_10', 'Niveau 10', 'Atteins le niveau 10.', daysAgo(8));
  insAch.run('clean_30', 'Un mois clean', '30 jours clean sur une addiction.', daysAgo(43));
  insAch.run('clean_90', 'Trois mois clean', '90 jours clean sur une addiction.', null);
  insAch.run('boss_slayer', 'Pourfendeur', 'Vaincs ton premier boss.', null);
  insAch.run('night_owl_reformed', 'Lève-tôt', '7 jours de coucher avant 23h.', null);

  // 7. rewards
  const insReward = db.prepare(
    `INSERT INTO rewards (name, cost, kind, claimed_at) VALUES (?,?,?,?)`
  );
  insReward.run('Thème "Aurore" pour l’avatar', 200, 'cosmetic', null);
  insReward.run('Couronne dorée', 500, 'cosmetic', daysAgo(15));
  insReward.run('Compagnon : petit dragon', 800, 'cosmetic', null);
  insReward.run('Sortie ciné 🎬', 500, 'real', null);
  insReward.run('Soirée jeu vidéo (2h sans culpabilité)', 300, 'real', daysAgo(5));

  // 8. trigger_journal
  const insTrig = db.prepare(
    `INSERT INTO trigger_journal (target_id, date, trigger, craving, note, gave_in) VALUES (?,?,?,?,?,?)`
  );
  insTrig.run(1, daysAgo(20), 'Café du matin', 7, "Réflexe avec le café, j’ai tenu en respirant.", 0);
  insTrig.run(1, daysAgo(12), 'Stress au travail', 9, 'Grosse envie après une réunion difficile.', 0);
  insTrig.run(1, daysAgo(4), 'Soirée entre amis', 6, "Tentation sociale, j’ai bu un verre d’eau à la place.", 0);
  insTrig.run(2, daysAgo(11), 'Ennui le soir', 8, 'J’ai cédé, mais je note et je repars demain.', 1);
  insTrig.run(2, daysAgo(2), 'Fatigue après-midi', 5, 'Envie de sucré, remplacée par un fruit.', 0);
});

seed();
console.log('✅ Données de démo insérées dans data/habitquest.db');
```

`package.json`: `"seed": "tsx scripts/seed.ts"`. (Requires `tsx` devDep; works on Windows PowerShell.)

> Note on `trigger_journal.date`: the schema default is `datetime('now')` (timestamp), but we insert `YYYY-MM-DD` for clean ordering; the column is `TEXT`, so both are valid. If the journal UI shows time-of-day, switch the seed to full ISO timestamps — stated default: date-only is sufficient for trend display.

---

## Implementation notes / dependencies to add

- **devDependencies**: `sharp`, `tsx`, `@types/node-cron`, and the `workbox-*` packages listed in §1.4 (for SW type resolution).
- **dependencies**: `web-push`, `node-cron`, `better-sqlite3`, `@sveltejs/adapter-node`, `@vite-pwa/sveltekit`.
- **`.gitignore`** must include: `data/`, `.env`, `build/`, `node_modules/`, `static/icons/` is *generated* but commit it anyway so prod builds don't require sharp — stated default: **commit generated icons**, ignore only `data/` and `.env`.
- **Auth exemptions** in `hooks.server.ts`: allow without session → `/login`, `/manifest.webmanifest`, `/service-worker.js`, `/icons/*`, `/favicon.png`. The `/api/push/*` routes **require** session (single user, prevents public subscription spam); `/api/cron/daily` is exempt but guarded by `CRON_SECRET`.

Relevant paths (all under repo root `C:\Users\micha\OneDrive - Bilans et budgets\Documents\GitHub\2ndLife`):
`vite.config.ts`, `svelte.config.js`, `src/app.html`, `src/service-worker.ts`, `src/hooks.server.ts`, `src/lib/components/PwaUpdater.svelte`, `src/lib/server/push.ts`, `src/lib/server/reminder.ts`, `src/lib/server/env.ts`, `src/lib/client/push.ts`, `src/routes/api/push/{vapid,subscribe,unsubscribe,test}/+server.ts`, `src/routes/api/cron/daily/+server.ts`, `scripts/icons.ts`, `scripts/seed.ts`, `assets/logo-source.svg`, `static/icons/*`, `.env.example`, `README.md`, `CLAUDE.md`.