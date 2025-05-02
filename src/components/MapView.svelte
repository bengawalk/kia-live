<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// import LanguageSwitcher from "$components/LanguageSwitcher.svelte";
	import MapButtons from '$components/MapButtons.svelte'
	import { messages } from '$lib/stores/language';
	import { loadMap, unloadMap } from '$lib/services/map';
	import InfoView from '$components/InfoView.svelte';

	let mapContainer: HTMLElement | string;
	// let map: mapboxgl.Map | undefined;

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

<div id="map" class="min-h-screen flex flex-col " bind:this={mapContainer}>

<!--	<LanguageSwitcher />-->
	<MapButtons />
	<InfoView />
</div>
