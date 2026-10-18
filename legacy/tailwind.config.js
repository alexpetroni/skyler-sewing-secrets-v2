/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				// Warm saffron — drawn from the logo thread. Accent duty, not shouting.
				brand: {
					50: '#fdf8f2',
					100: '#faeedd',
					200: '#f4dabb',
					300: '#ecbf8e',
					400: '#e19f5e',
					500: '#d4863c',
					600: '#bd6f2c',
					700: '#9c5824',
					800: '#7d4622',
					900: '#663b1f',
					950: '#371d0e'
				},
				// Parchment ground — the calm the whole site sits on.
				ivory: {
					50: '#fdfbf7',
					100: '#faf6ee',
					200: '#f4ede1',
					300: '#ebe0cf',
					400: '#ddceb6'
				},
				// Espresso-charcoal — text and structure.
				charcoal: {
					50: '#f7f6f5',
					100: '#eae7e4',
					200: '#d5d0ca',
					300: '#b8b0a7',
					400: '#948a80',
					500: '#786d63',
					600: '#61574f',
					700: '#4e463f',
					800: '#38322d',
					900: '#241f1c',
					950: '#151210'
				},
				// Muted sage — the reassuring counterweight to the saffron.
				sage: {
					50: '#f4f7f4',
					100: '#e6ede6',
					200: '#cedbcf',
					300: '#abc0ad',
					400: '#82a085',
					500: '#618364',
					600: '#4b694e',
					700: '#3d5440',
					800: '#334436',
					900: '#2b382d',
					950: '#151d17'
				},
				// Champagne — hairlines and quiet emphasis.
				gold: {
					200: '#eee0c2',
					300: '#ddc687',
					400: '#c9a962',
					500: '#b8954a',
					600: '#a07b3a',
					700: '#836131'
				}
			},
			fontFamily: {
				sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				serif: ['Cormorant Garamond', 'ui-serif', 'Georgia', 'serif']
			},
			borderRadius: {
				'2xl': '1rem',
				'3xl': '1.5rem',
				shell: '2rem',
				core: '1.625rem',
				'shell-lg': '2.5rem',
				'core-lg': '2.125rem'
			},
			letterSpacing: {
				'extra-wide': '0.15em',
				eyebrow: '0.2em'
			},
			boxShadow: {
				// Diffused, warm, never harsh — light falling on paper.
				ambient: '0 1px 2px rgba(56,50,45,0.03), 0 10px 30px -14px rgba(56,50,45,0.12)',
				lift: '0 2px 4px rgba(56,50,45,0.03), 0 22px 48px -20px rgba(56,50,45,0.18)',
				float: '0 4px 8px rgba(56,50,45,0.03), 0 40px 80px -34px rgba(56,50,45,0.26)',
				island: '0 1px 2px rgba(56,50,45,0.04), 0 16px 40px -20px rgba(56,50,45,0.22)',
				bezel: 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.5)',
				'bezel-dark': 'inset 0 1px 0 rgba(255,255,255,0.14)'
			},
			transitionTimingFunction: {
				fluid: 'cubic-bezier(0.32, 0.72, 0, 1)',
				soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
				spring: 'cubic-bezier(0.34, 1.32, 0.64, 1)'
			},
			transitionDuration: {
				400: '400ms',
				600: '600ms',
				800: '800ms',
				1000: '1000ms'
			},
			maxWidth: {
				reading: '68ch'
			},
			keyframes: {
				'drift-in': {
					from: { opacity: '0', transform: 'translate3d(0, 2rem, 0)' },
					to: { opacity: '1', transform: 'translate3d(0, 0, 0)' }
				},
				breathe: {
					'0%, 100%': { opacity: '0.5', transform: 'scale(1)' },
					'50%': { opacity: '0.8', transform: 'scale(1.06)' }
				},
				marquee: {
					from: { transform: 'translate3d(0, 0, 0)' },
					to: { transform: 'translate3d(-50%, 0, 0)' }
				}
			},
			animation: {
				'drift-in': 'drift-in 800ms cubic-bezier(0.22, 1, 0.36, 1) both',
				breathe: 'breathe 14s cubic-bezier(0.45, 0, 0.55, 1) infinite',
				marquee: 'marquee 42s linear infinite'
			}
		}
	},
	plugins: [
		require('@tailwindcss/forms'),
		require('@tailwindcss/typography')
	]
};
