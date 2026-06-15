/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				// base & surfaces (dark-first)
				bg: 'rgb(var(--c-bg) / <alpha-value>)',
				surface: 'rgb(var(--c-surface) / <alpha-value>)',
				surface2: 'rgb(var(--c-surface-2) / <alpha-value>)',
				border: 'rgb(var(--c-border) / <alpha-value>)',
				// text (clé "ink" : "text" entrerait en collision avec le préfixe text-*)
				ink: 'rgb(var(--c-text) / <alpha-value>)',
				muted: 'rgb(var(--c-muted) / <alpha-value>)',
				// brand
				primary: 'rgb(var(--c-primary) / <alpha-value>)',
				'primary-700': 'rgb(var(--c-primary-700) / <alpha-value>)',
				accent: 'rgb(var(--c-accent) / <alpha-value>)',
				// semantic game tokens
				xp: 'rgb(var(--c-xp) / <alpha-value>)',
				flame: 'rgb(var(--c-flame) / <alpha-value>)',
				gold: 'rgb(var(--c-gold) / <alpha-value>)',
				health: 'rgb(var(--c-health) / <alpha-value>)',
				danger: 'rgb(var(--c-danger) / <alpha-value>)',
				boss: 'rgb(var(--c-boss) / <alpha-value>)'
			},
			borderRadius: {
				sm: '2px',
				DEFAULT: '4px',
				lg: '4px',
				xl: '6px',
				'2xl': '6px',
				pill: '9999px'
			},
			fontFamily: {
				sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
				display: ['"Press Start 2P"', 'monospace']
			},
			boxShadow: {
				// pixel-art depth shadow (right + bottom)
				card: '3px 3px 0 0 rgb(var(--c-border))',
				raised: '4px 4px 0 0 rgb(0 0 0 / 0.5)',
				glow: '0 0 0 2px rgb(var(--c-primary) / 0.6)',
				// pressed state (inset)
				pressed: 'inset 2px 2px 0 0 rgb(0 0 0 / 0.35)'
			},
			transitionTimingFunction: {
				'out-soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
				spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
			},
			keyframes: {
				'flame-pulse': {
					'0%,100%': { transform: 'scale(1)', opacity: '1' },
					'50%': { transform: 'scale(1.12)', opacity: '0.92' }
				},
				'coin-pop': {
					'0%': { transform: 'translateY(0) scale(1)' },
					'40%': { transform: 'translateY(-2px) scale(1.18)' },
					'100%': { transform: 'translateY(0) scale(1)' }
				},
				'toast-in': {
					from: { transform: 'translateY(-120%)', opacity: '0' },
					to: { transform: 'translateY(0)', opacity: '1' }
				},
				sheen: {
					'0%': { transform: 'translateX(-120%)' },
					'100%': { transform: 'translateX(220%)' }
				},
				'ping-ring': {
					'0%': { transform: 'scale(0.6)', opacity: '0.6' },
					'100%': { transform: 'scale(1.8)', opacity: '0' }
				},
				wiggle: {
					'0%,100%': { transform: 'rotate(-3deg)' },
					'50%': { transform: 'rotate(3deg)' }
				},
				victoryPop: {
					'0%': { transform: 'scale(0.3)', opacity: '0' },
					'60%': { transform: 'scale(1.15)' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				}
			},
			animation: {
				'flame-pulse': 'flame-pulse 1.6s ease-in-out infinite',
				'coin-pop': 'coin-pop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
				'toast-in': 'toast-in 0.32s cubic-bezier(0.22,1,0.36,1)',
				sheen: 'sheen 1.1s ease-out',
				'ping-ring': 'ping-ring 0.7s ease-out',
				wiggle: 'wiggle 2s ease-in-out infinite',
				'victory-pop': 'victoryPop 500ms cubic-bezier(.18,.89,.32,1.28)'
			}
		}
	},
	plugins: []
};
