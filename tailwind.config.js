/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	darkMode: 'class',
	theme: {
		extend: {
			// Les tokens de design complets sont définis à l'étape 4 (tableau de bord).
			// Palette sombre de base ci-dessous.
			colors: {
				bg: '#0b0f17',
				surface: '#141a26',
				'surface-2': '#1c2434',
				border: '#2a3346',
				primary: '#6d8bff',
				accent: '#a78bfa',
				xp: '#38bdf8',
				flame: '#fb923c',
				coin: '#fbbf24',
				health: '#34d399',
				danger: '#f87171',
				boss: '#ef4444'
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif']
			}
		}
	},
	plugins: []
};
