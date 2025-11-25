import { svelteTesting } from '@testing-library/svelte/vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { storybookTest } from '@storybook/experimental-addon-test/vitest-plugin';
import { VitePWA } from 'vite-plugin-pwa';
const dirname =
	typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// Read version from package.json for cache busting
const packageJson = JSON.parse(readFileSync(path.join(dirname, 'package.json'), 'utf-8'));
const version = packageJson.version;

// More info at: https://storybook.js.org/docs/writing-tests/test-addon
export default defineConfig({
	plugins: [
		sveltekit(),
		VitePWA({
			devOptions: {
				enabled: true,
				type: 'module'
			},
			registerType: 'autoUpdate',
			includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-192x192.png', 'icon-512x512.png'],
			workbox: {
				maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit for large JS bundles
				cleanupOutdatedCaches: true, // Remove old caches automatically
				skipWaiting: true, // Force new service worker to activate immediately
				clientsClaim: true, // Take control of all clients immediately
				runtimeCaching: [
					{
						// Cache JS/CSS with network-first strategy to ensure fresh code
						urlPattern: /^https?.*\.(js|css)$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'assets-cache',
							expiration: {
								maxEntries: 50,
								maxAgeSeconds: 60 * 60 // 1 hour
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					},
					{
						// Cache images/fonts with cache-first strategy
						urlPattern: /^https?.*\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|otf|glb)$/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'media-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
							},
							cacheableResponse: {
								statuses: [0, 200]
							}
						}
					}
				]
			},
			manifest: {
				name: 'KIA-Live',
				short_name: 'KIA Live',
				description: 'Live bus tracking and finder for KIA buses in Bengaluru.',
				theme_color: '#ffffff',
				display: 'standalone',
				orientation: 'portrait',
				scope: '/',
				start_url: `/?v=${version}`, // Add version to force manifest update
				icons: [
					{
						src: 'icon-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					},
					{
						src: 'icon-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				]
			}
		}),
		tailwindcss(),
		paraglide({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
	],
	build: {
		// Generate unique filenames for cache busting
		rollupOptions: {
			output: {
				// Add hash to chunk filenames for automatic cache invalidation
				chunkFileNames: 'chunks/[name]-[hash].js',
				entryFileNames: 'entries/[name]-[hash].js',
				assetFileNames: 'assets/[name]-[hash].[ext]'
			}
		}
	},
	define: {
		'process.env': {}
	},
	server: {
		host: true
	},
	test: {
		workspace: [
			{
				extends: './vite.config.ts',
				plugins: [svelteTesting()],
				test: {
					name: 'client',
					environment: 'jsdom',
					clearMocks: true,
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: true,
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/writing-tests/test-addon#storybooktest
					storybookTest({
						configDir: path.join(dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					browser: {
						enabled: true,
						headless: true,
						provider: 'playwright',
						instances: [
							{
								browser: 'chromium'
							}
						]
					},
					setupFiles: ['.storybook/vitest.setup.ts']
				}
			}
		]
	}
});
