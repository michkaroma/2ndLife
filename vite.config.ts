import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

// NOTE: la configuration PWA complète (icônes, service worker, offline outbox)
// est affinée à l'étape 8 du brief. Configuration de base ici pour que la stack
// PWA soit présente dès l'étape 1.
export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'HabitQuest',
				short_name: 'HabitQuest',
				description: "Gamifie tes bonnes habitudes et ton sevrage",
				lang: 'fr',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				orientation: 'portrait',
				background_color: '#0b0f17',
				theme_color: '#0b0f17',
				icons: []
			},
			devOptions: {
				enabled: false
			}
		})
	]
});
