<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import mapboxgl from 'mapbox-gl';
	// import LanguageSwitcher from "$components/LanguageSwitcher.svelte";
	import { messages } from '$lib/stores/language';

	let mapContainer: HTMLElement | string;
	let map: mapboxgl.Map;
	onMount(() => {
		mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
		map = new mapboxgl.Map({
			container: mapContainer,
			style: 'mapbox://styles/mapbox/light-v11',
			center: [0, 0], // Default to center of the world
			zoom: 2, // Default zoom level
			dragRotate: false, // Disable rotation
			touchZoomRotate: false
		});
	});
	onDestroy(() => {
		if(map != undefined){ // svelte will throw errors without this
			map.remove();
		}
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
