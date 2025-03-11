import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { setLanguageTag } from '$lib/paraglide/runtime';
import type { AvailableLanguageTag } from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';


// Default language
const defaultLanguage: AvailableLanguageTag = "en";

// Retrieve stored language or fallback to default (only in the browser)
// @ts-expect-error Using localStorage
const initialLanguage: AvailableLanguageTag = browser ? localStorage.getItem("language") ?? defaultLanguage : defaultLanguage;

// Svelte store for managing language
export const language = writable<AvailableLanguageTag>(initialLanguage);
export const messages = writable(m);

// Subscribe to store changes and update localStorage
language.subscribe((value) => {
	if (browser) {
		localStorage.setItem("language", value);
		setLanguageTag(value); // Update Paraglide runtime
	}
});
