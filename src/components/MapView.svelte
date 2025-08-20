<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import MapButtons from '$components/MapButtons.svelte'
	import { messages } from '$lib/stores/language';
	import { loadMap, unloadMap } from '$lib/services/map';
	import InfoView from '$components/InfoView.svelte';
	import GTFSLoader from '$components/GTFSLoader.svelte';
	import SearchBar from '$components/SearchBar.svelte';
	import LanguageSwitcher from '$components/LanguageSwitcher.svelte';

	let mapContainer: HTMLElement | string;

	onMount(() => {
		// map =
			loadMap(mapContainer);

	});
	onDestroy(() => {
		unloadMap();
	});
</script>

<svelte:head>
	<title>{$messages.Title()}</title>
</svelte:head>

<style>
    #map {
        width: 100%;
        height: 100vh;
    }
</style>

<div id="map" class="max-h-dvh flex flex-col" bind:this={mapContainer}>

<!--	<LanguageSwitcher />-->
	<GTFSLoader />
	<SearchBar />
	<MapButtons />
	<InfoView />
</div>
