import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		paths: {
			base: process.argv.includes('dev') ? '' : process.env.BASE_PATH || ''
		},
		adapter: adapter({
			fallback: '404.html'
		}),
		prerender: {
			entries: ['*']
		},
		alias: {
			$components: './src/components',
			$lang: './project.inlang'
		}
	}
};

export default config;
