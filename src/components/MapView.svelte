<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	// import mapboxgl from 'mapbox-gl';
	// import LanguageSwitcher from "$components/LanguageSwitcher.svelte";
	import { messages } from '$lib/stores/language';
	import { loadMap, unloadMap } from '$lib/services/map';

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

<div id="map" bind:this={mapContainer}>
<!--	<LanguageSwitcher />-->
</div>
