import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			gifenc: resolve(__dirname, 'src/lib/gifenc-shim.js'),
			'p5-svelte': resolve(__dirname, 'src/lib/p5-svelte/index.js')
		}
	},
	ssr: {
		noExternal: ['p5', 'gifenc']
	}
});
