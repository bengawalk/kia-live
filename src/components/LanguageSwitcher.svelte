<script lang="ts">
	import { language, messages } from '$lib/stores/language';
	import { availableLanguageTags, languageTag, setLanguageTag } from '$lib/paraglide/runtime';
	import * as m from '$lib/paraglide/messages';

	let currentLanguage = languageTag();

	function cycleLanguage() {
		currentLanguage = languageTag();
		const currentIndex = availableLanguageTags.indexOf(currentLanguage);
		const nextIndex = (currentIndex + 1) % availableLanguageTags.length;
		const newLanguage = availableLanguageTags[nextIndex];
		language.set(newLanguage);
		messages.set(m);
		setLanguageTag(newLanguage);
	}
</script>

<style>
    .language-switcher {
        position: absolute;
        top: 1rem;
        right: 1rem;
        z-index: 1;
        background: transparent;
        border: none;
        font-size: 14px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .language-label {
        font-size: 14px;
        font-weight: bold;
        color: black;
    }
</style>

<button class="language-switcher" on:click={cycleLanguage}>
	<span class="language-label">{$messages.LanguageLabel()}</span>
</button>
