<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import mapboxgl, {

		type GeoJSONSourceSpecification
	} from 'mapbox-gl';
	// import LanguageSwitcher from "$components/LanguageSwitcher.svelte";
	import { messages } from '$lib/stores/language';
	import { MAP_STYLES } from '$lib/constants';

	let mapContainer: HTMLElement | string;
	let map: mapboxgl.Map;
	export function updateLayer(
		layerType: keyof typeof MAP_STYLES,
		source: GeoJSONSourceSpecification | null | undefined
	): void {
		// Skip if the layer type is not GeoJSON
		if (MAP_STYLES[layerType].type !== 0) return;

		const mapSource = map.getSource(layerType) as mapboxgl.GeoJSONSource | undefined;
		const hasValidSourceData = source?.data !== undefined;
		const layerExists = map.getLayer(layerType) !== undefined;

		if (!hasValidSourceData) {
			// Remove layer and source if data is invalid
			if (layerExists) map.removeLayer(layerType);
			if (mapSource) map.removeSource(layerType);
			return;
		}

		// If source exists, update data; otherwise add source
		if (mapSource) {
			mapSource.setData(source.data!);
		} else {
			map.addSource(layerType, source);
		}

		// If layer does not exist, add it
		if (!layerExists) {
			map.addLayer(MAP_STYLES[layerType].specification);
		}
	}

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
