import { get } from 'svelte/store';
import { language } from '$lib/stores/language';
import { selectedMetroStation } from '$lib/stores/discovery';
import type mapboxgl from 'mapbox-gl';
import metroIconSvg from '$assets/metro-icon.svg';
import { samplePointsAlongLineCollection } from '$lib/services/map';

let map: mapboxgl.Map | undefined;
let metroLinesLoaded = false;
let metroStopsLoaded = false;

/**
 * Initialize metro map rendering
 * @param mapInstance - The Mapbox map instance
 */
export function initMetroMap(mapInstance: mapboxgl.Map) {
	map = mapInstance;
	// map.showLayers2DWireframe = true;
	// map.showCollisionBoxes = true;
}

/**
 * Load and render metro lines from lines.json
 */
export async function loadMetroLines() {
	if (!map || metroLinesLoaded) return;

	try {
		const response = await fetch('/metro/lines.json');
		if (!response.ok) {
			console.log('Metro lines not found, skipping metro rendering');
			return;
		}

		const linesData: GeoJSON.FeatureCollection = await response.json();
		console.log('Loading metro lines...');

		// Add source for metro lines
		if (!map.getSource('metro-lines')) {
			map.addSource('metro-lines', {
				type: 'geojson',
				data: linesData
			});
		}

		// Add line layer with colors from properties
		if (!map.getLayer('metro-lines-layer')) {
			map.addLayer({
				id: 'metro-lines-layer',
				type: 'line',
				source: 'metro-lines',
				layout: {
					'line-join': 'round',
					'line-cap': 'round'
				},
				paint: {
					'line-color': ['get', 'line_color'],
					'line-width': 3
				}
			});
		}

		// Sample points along lines for collision detection (same spacing as map.ts)
		const collisionPoints = samplePointsAlongLineCollection(linesData, 5); // Point every 5 meters

		// Add source for collision points
		if (!map.getSource('metro-lines-collision')) {
			map.addSource('metro-lines-collision', {
				type: 'geojson',
				data: collisionPoints
			});
		}

		// Add invisible collision layer for metro lines (prevents text overlap)
		// Following LINE_COLLISION_STYLE pattern from constants.ts
		if (!map.getLayer('metro-lines-collision')) {
			map.addLayer({
				id: 'metro-lines-collision',
				type: 'symbol',
				source: 'metro-lines-collision',
				layout: {
					'text-field': '|',
					'text-size': 12, // Same as LINE_COLLISION_STYLE
					'text-allow-overlap': true,
					'symbol-placement': 'point'
				},
				paint: {
					'text-color': 'rgba(0, 0, 0, 0)' // Fully transparent
				}
			});
		}

		// Add text labels along the lines
		if (!map.getLayer('metro-lines-labels')) {
			map.addLayer({
				id: 'metro-lines-labels',
				type: 'symbol',
				source: 'metro-lines',
				layout: {
					'text-field': ['get', 'name'],
					'text-font': ['IBM Plex Sans Regular'],
					'symbol-placement': 'line',
					'text-rotation-alignment': 'map',
					'text-pitch-alignment': 'viewport',
					'text-size': 11,
					'text-max-angle': 45,
					'text-padding': 2,
					'text-offset': [0, -1.2] // Offset to position text outside the line
				},
				paint: {
					'text-color': ['get', 'line_color'],
					'text-halo-color':[
						'case',
						['==', ['get', 'station_colors'], 'yellow'],
						'#555',
						['==', ['get', 'station_colors'], 'aqua'],
						'#666',
						['==', ['get', 'station_colors'], 'pink'],
						'#888',
						['==', ['get', 'station_colors'], 'orange'],
						'#999',
						['==', ['get', 'station_colors'], 'violet'],
						'#aaa',
						'#fff',
					],
					'text-halo-width': 2,
					'text-opacity': 0.8
				}
			});
		}

		metroLinesLoaded = true;
		console.log('Metro lines loaded successfully');

		// Load stops after lines are loaded
		await loadMetroStops();
	} catch (error) {
		console.error('Failed to load metro lines:', error);
	}
}

/**
 * Load and render metro stops from stops/index.json
 */
export async function loadMetroStops() {
	if (!map || metroStopsLoaded) return;

	try {
		const response = await fetch('/metro/stops/index.json');
		if (!response.ok) {
			console.log('Metro stops not found, skipping stops rendering');
			return;
		}

		const stopsData = await response.json();
		console.log('Loading metro stops...');

		// Get current language
		const currentLang = get(language);

		// Convert stops to GeoJSON FeatureCollection
		const stopsGeoJSON: GeoJSON.FeatureCollection = {
			type: 'FeatureCollection',
			features: stopsData.map((stop: any) => ({
				type: 'Feature',
				geometry: {
					type: 'Point',
					coordinates: [stop.location.lon, stop.location.lat]
				},
				properties: {
					stop_id: stop.stop_id,
					stop_name: stop.stop_name,
					stop_name_kn: stop.stop_name_translations?.kn || stop.stop_name,
					color: stop.color
				}
			}))
		};

		// Load metro station icon from assets using map.loadImage
		await new Promise<void>((resolve, reject) => {
			map!.loadImage(metroIconSvg, (error, image) => {
				if (error) {
					console.error('Failed to load metro icon:', error);
					createFallbackMetroIcon().then(resolve).catch(reject);
					return;
				}
				if (!image) {
					createFallbackMetroIcon().then(resolve).catch(reject);
					return;
				}
				if (!map!.hasImage('metro-station-icon')) {
					map!.addImage('metro-station-icon', image);
				}
				resolve();
			});
		});

		// Add source for metro stops
		if (!map.getSource('metro-stops')) {
			map.addSource('metro-stops', {
				type: 'geojson',
				data: stopsGeoJSON
			});
		}

		// Add symbol layer for metro stops
		if (!map.getLayer('metro-stops-layer')) {
			map.addLayer({
				id: 'metro-stops-layer',
				type: 'symbol',
				source: 'metro-stops',
				minzoom: 12,
				layout: {
					'icon-image': 'metro-station-icon',
					'icon-size': [
						'interpolate',
						['linear'],
						['zoom'],
						12, 0.4,
						16, 0.7
					],
					'icon-allow-overlap': true,
					'icon-ignore-placement': true,
					'icon-padding': 0
				},
				paint: {
					'icon-opacity': [
						'interpolate',
						['linear'],
						['zoom'],
						12, 0,
						12.5, 1
					]
				}
			});
		}

		// Add text labels for metro stops
		// Following POINT_LABEL_STYLE pattern from constants.ts
		if (!map.getLayer('metro-stops-labels')) {
			map.addLayer({
				id: 'metro-stops-labels',
				type: 'symbol',
				source: 'metro-stops',
				minzoom: 13,
				layout: {
					'text-field': currentLang === 'kn'
						? ['get', 'stop_name_kn']
						: ['get', 'stop_name'],
					'text-font': ['IBM Plex Sans Regular'],
					'text-variable-anchor': ['top', 'left', 'bottom', 'right'],
					'text-radial-offset': 2, // Following POINT_LABEL_STYLE
					'text-justify': 'auto',
					'text-size': [
						'interpolate',
						['linear'],
						['zoom'],
						13, 10,
						16, 12
					],
					'text-allow-overlap': false, // Following POINT_LABEL_STYLE
					'icon-allow-overlap': true
				},
				paint: {
					'text-color': ['get', 'color'],
					'text-halo-color': [
						'case',
						['==', ['get', 'station_colors'], 'yellow'],
						'#555',
						['==', ['get', 'station_colors'], 'aqua'],
						'#666',
						['==', ['get', 'station_colors'], 'pink'],
						'#888',
						['==', ['get', 'station_colors'], 'orange'],
						'#999',
						['==', ['get', 'station_colors'], 'violet'],
						'#aaa',
						'#fff',
					],
					'text-halo-width': 0.8,
					'text-opacity': [
						'interpolate',
						['linear'],
						['zoom'],
						13, 0,
						13.5, 1
					]
				}
			});
		}

		// Add click handler for metro station icons
		map.on('click', 'metro-stops-layer', (e) => {
			if (e.features && e.features.length > 0) {
				const feature = e.features[0];
				const stationId = feature.properties?.stop_id;
				if (stationId) {
					selectedMetroStation.set(stationId);
					console.log('Selected metro station:', stationId);
				}
			}
		});

		// Clear selection when clicking away from metro stations
		map.on('click', (e) => {
			const features = map!.queryRenderedFeatures(e.point, {
				layers: ['metro-stops-layer']
			});

			// If no metro station was clicked, clear the selection
			if (features.length === 0) {
				selectedMetroStation.set('');
			}
		});

		// Change cursor to pointer when hovering over metro stops
		map.on('mouseenter', 'metro-stops-layer', () => {
			map!.getCanvas().style.cursor = 'pointer';
		});

		map.on('mouseleave', 'metro-stops-layer', () => {
			map!.getCanvas().style.cursor = '';
		});

		metroStopsLoaded = true;
		console.log('Metro stops loaded successfully');
	} catch (error) {
		console.error('Failed to load metro stops:', error);
	}
}

/**
 * Create a fallback metro icon using canvas
 */
async function createFallbackMetroIcon() {
	if (!map) return;

	const size = 48;
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');

	if (!ctx) return;

	// Draw a simple metro station icon (M in a circle)
	ctx.fillStyle = '#000'; // Blue background
	ctx.beginPath();
	ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
	ctx.fill();

	// Draw white border
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = 3;
	ctx.stroke();

	// Draw "M" for Metro
	ctx.fillStyle = '#ffffff';
	ctx.font = 'bold 24px IBM Plex Sans, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('M', size / 2, size / 2);

	// Convert canvas to image and add to map
	if (!map.hasImage('metro-station-icon')) {
		map.addImage('metro-station-icon', ctx.getImageData(0, 0, size, size) as any);
	}
}

/**
 * Update metro stop labels when language changes
 */
export function updateMetroLanguage() {
	if (!map || !metroStopsLoaded) return;

	const currentLang = get(language);

	// Update the text-field property of the labels layer
	if (map.getLayer('metro-stops-labels')) {
		map.setLayoutProperty(
			'metro-stops-labels',
			'text-field',
			currentLang === 'kn'
				? ['get', 'stop_name_kn']
				: ['get', 'stop_name']
		);
	}
}

/**
 * Cleanup metro layers
 */
export function unloadMetroMap() {
	if (!map) return;

	const layers = ['metro-stops-labels', 'metro-stops-layer', 'metro-lines-labels', 'metro-lines-collision', 'metro-lines-layer'];
	const sources = ['metro-stops', 'metro-lines', 'metro-lines-collision'];

	layers.forEach(layer => {
		if (map!.getLayer(layer)) {
			map!.removeLayer(layer);
		}
	});

	sources.forEach(source => {
		if (map!.getSource(source)) {
			map!.removeSource(source);
		}
	});

	if (map.hasImage('metro-station-icon')) {
		map.removeImage('metro-station-icon');
	}

	metroLinesLoaded = false;
	metroStopsLoaded = false;
	map = undefined;
}