/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				sans: ["'Inter'", "'SF Pro'", "'Segoe UI'", "'Helvetica Neue'", 'Arial', 'sans-serif']
			}
		}
	},
	plugins: []
}
