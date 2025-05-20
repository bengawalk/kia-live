<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import MapButtons from '$components/MapButtons.svelte'
	import { messages } from '$lib/stores/language';
	import { loadMap, unloadMap } from '$lib/services/map';
	import InfoView from '$components/InfoView.svelte';
	import GTFSLoader from '$components/GTFSLoader.svelte';

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

<div id="map" class="min-h-screen flex flex-col" bind:this={mapContainer}>

<!--	<LanguageSwitcher />-->
	<GTFSLoader />
	<MapButtons />
	<InfoView />
</div>
