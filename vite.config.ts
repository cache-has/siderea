import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
	plugins: [
		wasm(),
		topLevelAwait(),
		sveltekit(),
		// Generate bundle analysis report (open build/stats.html after build)
		visualizer({
			filename: 'build/stats.html',
			gzipSize: true,
			template: 'treemap'
		})
	],
	build: {
		target: 'esnext',
		rollupOptions: {
			output: {
				// Split Three.js into its own chunk for better caching —
				// Three.js rarely changes, so it stays cached across deploys.
				manualChunks(id) {
					if (id.includes('node_modules/three/')) {
						return 'three';
					}
				}
			}
		}
	},
	optimizeDeps: {
		esbuildOptions: {
			target: 'esnext'
		}
	},
	server: {
		proxy: {
			'/api/horizons': {
				target: 'https://ssd.jpl.nasa.gov',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/horizons/, '/api/horizons.api'),
			},
			'/api/exoplanets': {
				target: 'https://exoplanetarchive.ipac.caltech.edu',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api\/exoplanets/, '/TAP/sync'),
			}
		}
	}
});
