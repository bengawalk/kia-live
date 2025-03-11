import { createI18n } from "@inlang/paraglide-sveltekit";
import * as runtime from "$lib/paraglide/runtime";
import { language } from "$lib/stores/language";

// Create i18n instance (initialized with the store value)
let currentLanguage: runtime.AvailableLanguageTag;
language.subscribe((lang) => {
	currentLanguage = lang;
});

// @ts-expect-error we assign it on page load, so it is fine.
export const i18n = createI18n(runtime, { defaultLanguageTag: currentLanguage });
