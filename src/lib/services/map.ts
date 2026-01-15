import {
	BUS_PNG_URL,
	LINE_COLLISION_STYLE,
	LINE_LABEL_STYLE,
	MAP_STYLES,
	POINT_LABEL_STYLE,
	POINT_LABEL_STYLE_OVERLAP
} from '$lib/constants';
import maplibregl, { type LayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapLineLabelImage from '$assets/map-line-label.png';
import { pollUserLocation } from '$lib/services/location';
import { handleTap, handleTouchEnd, handleTouchStart } from '$lib/services/discovery';
import { browser } from '$app/environment';
import { initMetroMap, loadMetroLines, unloadMetroMap } from '$lib/services/metroMap';
import { busLayer, load3DBusModel, remove3DBusModel, setup3DBusZoomListener } from '$lib/services/3dbus';
import { writable } from 'svelte/store';

// Store to notify when OSRM route data is ready (triggers UI update)
export const routeUpdateTrigger = writable<string | null>(null);

let map: maplibregl.Map | undefined;

export type NavMode = 'walking' | 'driving-traffic' | 'cycling' | 'driving'
export function loadMap(mapContainer: HTMLElement | string): maplibregl.Map {
	map = new maplibregl.Map({
		container: mapContainer,
		style: {
			version: 8,
			sources: {
				'carto-positron': {
					type: 'raster',
					tiles: [
						'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
						'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
						'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
						'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
					],
					tileSize: 256,
					attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
				}
			},
			layers: [
				{
					id: 'carto-positron-layer',
					type: 'raster',
					source: 'carto-positron',
					minzoom: 0,
					maxzoom: 22
				}
			],
			glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
		},
		center: [77.6, 13.02], // Default to Bengaluru
		zoom: 10.9, // Default zoom level
		dragRotate: false, // Disable rotation
		attributionControl: false
	});
	map.addControl(new maplibregl.AttributionControl(), 'top-left');

	map.loadImage(mapLineLabelImage).then((image) => {
		if(image && image.data) {
			map!.addImage('LINE_LABEL', image.data, {
				content: [4, 4, 80, 30],
				stretchX: [[4, 80]],
				stretchY: [[4, 30]],
			});
		}
	}).catch((error) => {
		throw error;
	});
	// map.showLayers2DWireframe = true;
	// map.showCollisionBoxes = true;
	map.on(
		'load', () => {
			map?.on('click', handleTap);
			pollUserLocation();
			map?.on('touchstart', handleTouchStart);
			map?.on('touchmove', handleTouchEnd);
			map?.on('touchend', handleTouchEnd);
			map?.on('mousedown', handleTouchStart);
			map?.on('mousemove', handleTouchEnd);
			map?.on('move', handleTouchEnd);
			map?.on('mouseover', handleTouchEnd);
			map?.on('mouseup', handleTouchEnd);
			// map?.on('mouseup', handleTap);
			map?.touchZoomRotate.disableRotation();

			// // Add zoom event listener to update bus model scales
			// map?.on('zoom', updateAllBusScales);

			// Initialize and load metro lines and stops
			if (map) {
				initMetroMap(map);
				loadMetroLines();
			}
		}
	);

	// Note: Threebox layers (bus models) will be added dynamically when updateBusMarker is called
	return map;
}

export function unloadMap() {
	if(map != undefined){
		unloadMetroMap();
		map.remove();
		map = undefined;
	}
}

// Layer ordering constants - defines the z-index hierarchy
// Lower index = rendered first (bottom), higher index = rendered last (top)
const LAYER_ORDER = [
	'LINE',            // 0: Line geometries (routes)
	'LINE_LABEL',      // 1: Line labels
	'METRO_STOP',      // 2
	'METRO_STOP_LABEL',// 3
	'3D_BUS',          // 4: 3D bus models
	'STOP_CIRCLE',     // 5: Stop circles
	'STOP_SYMBOL',     // 6: Stop symbols/labels
	'BUS_LABEL'        // 7: Bus labels (top)
] as const;
// Get the layer type category for ordering
function getLayerCategory(layerId: string): typeof LAYER_ORDER[number] {
	if (layerId === '3d-buses') return '3D_BUS';
	if (layerId.startsWith('bus_label_')) return 'BUS_LABEL';
	if (layerId.startsWith('bus_click_')) return 'BUS_LABEL'; // Click layers same level as labels
	if (layerId.includes('CIRCLE') || layerId.includes("BUS_STOP")) {
		if (layerId.startsWith('symbol')) return 'STOP_SYMBOL';
		return 'STOP_CIRCLE';
	}
	if(layerId.includes('metro-stops')) {
		if(layerId.endsWith('labels')) return 'METRO_STOP_LABEL';
		return 'METRO_STOP';
	}
	if (layerId.startsWith('symbol_')) return 'LINE_LABEL';
	if (layerId.startsWith('collision_')) return 'LINE_LABEL';
	if (layerId.includes('LINE')) return 'LINE';
	return 'LINE'; // Default to bottom
}

// Enforce correct layer ordering
function enforceLayerOrder() {
	if (!map) return;
	const styles = map.getStyle();
	if (!styles) return;

	// Get all current layer IDs from style layers
	const allLayers = styles.layers || [];
	const ourLayers = allLayers
		.map(layer => layer.id)
		.filter(id =>
			id.includes('LINE') ||
			id.includes('CIRCLE') ||
			id.includes('BUS') ||
			id.startsWith('symbol_') ||
			id.includes('BUS_STOP') ||
			id.includes('metro-stops') ||
			id.startsWith('collision_') ||
			id.startsWith('bus_')
		);

	// Add custom layers (like 3d-buses) if they exist
	// Custom layers don't appear in getStyle().layers but can be checked with getLayer()
	if (map.getLayer('3d-buses')) {
		ourLayers.push('3d-buses');
	}

	// Sort layers by their category order
	const sortedLayers = ourLayers.sort((a, b) => {
		const catA = getLayerCategory(a);
		const catB = getLayerCategory(b);
		const indexA = LAYER_ORDER.indexOf(catA);
		const indexB = LAYER_ORDER.indexOf(catB);
		return indexA - indexB;
	});

	// Move layers to enforce order
	// Strategy: Move each layer to be just before the next higher category layer
	for (let i = 0; i < sortedLayers.length - 1; i++) {
		const currentLayer = sortedLayers[i];
		const nextLayer = sortedLayers[i + 1];

		if (map.getLayer(currentLayer) && map.getLayer(nextLayer)) {
			try {
				// Move nextLayer to come after currentLayer
				// This ensures nextLayer is positioned correctly relative to currentLayer
				map.moveLayer(nextLayer);
			} catch (e) {
				console.warn(`Could not reorder layer ${nextLayer}:`, e);
			}
		}
	}
}

// Collision layer functions
const pendingCollisionLayers: LayerSpecification[] = []; // pending layers to apply to map
const activeCollisionLayers: LayerSpecification[] = []; // collision layers active on map
// Add pending collision layers to the top of the layer stack
export function renderPendingCollisions() {
	if(!map) return;
	pendingCollisionLayers.forEach((val: LayerSpecification, i) => {
		if(!map!.getLayer(val.id)) map!.addLayer(val);
		activeCollisionLayers.push(val);
		delete pendingCollisionLayers[i];
	});
	enforceLayerOrder(); // Ensure correct order after adding collision layers
}
// Remove all existing collision layers (to re-add on top, or remove leftover ghost layers)
export function removeRenderedCollisions() {
	if(!map) return;
	activeCollisionLayers.forEach((val: LayerSpecification, i) => {
		if(map!.getLayer(val.id)) map!.removeLayer(val.id);
		delete activeCollisionLayers[i];
	});
}

// Helper function (collision layer points) - exported for metro map use
export function samplePointsAlongLineCollection(lineFeatureCollection: GeoJSON.FeatureCollection, spacingMeters = 50): GeoJSON.FeatureCollection {
	function haversineDistance(coord1: GeoJSON.Position, coord2: GeoJSON.Position) {
		const toRad = (deg: number) => (deg * Math.PI) / 180;
		const R = 6371000;
		const [lon1, lat1] = coord1;
		const [lon2, lat2] = coord2;
		const dLat = toRad(lat2 - lat1);
		const dLon = toRad(lon2 - lon1);
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) ** 2;
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		return R * c;
	}

	function interpolateCoord(coord1: GeoJSON.Position, coord2: GeoJSON.Position, t: number) {
		const lon = coord1[0] + (coord2[0] - coord1[0]) * t;
		const lat = coord1[1] + (coord2[1] - coord1[1]) * t;
		return [lon, lat];
	}

	const result = [];

	for (const feature of lineFeatureCollection.features) {
		if (feature.geometry.type !== 'LineString') continue;

		const coords = feature.geometry.coordinates;

		for (let i = 0; i < coords.length - 1; i++) {
			const start = coords[i];
			const end = coords[i + 1];
			const segmentLength = haversineDistance(start, end);
			const numPoints = Math.floor(segmentLength / spacingMeters);

			for (let j = 0; j <= numPoints; j++) {
				const t = j / numPoints;
				const interpolated = interpolateCoord(start, end, t);
				result.push({
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: interpolated
					},
					properties: {
						label: '.' // dummy label to trigger collision box
					}
				});
			}
		}
	}

	return {
		type: 'FeatureCollection',
		features: result as GeoJSON.Feature[]
	};
}

// GeoJSON Layer functions
// Update / Remove a GeoJSON Layer
export function updateLayer(
	layerType: keyof typeof MAP_STYLES | undefined,
	source: maplibregl.GeoJSONSourceSpecification | undefined,
	labelOverlap: boolean = false
): void {
	if(!map) {
		return;
	}
	if(!layerType) return;
	// Skip if the layer type is not GeoJSON
	if (MAP_STYLES[layerType].type !== 0) return;
	const symbolID = `symbol_${layerType}`; // Labels are in this symbol layer
	const collisionID = `collision_${layerType}`; // Lines have invisible collision layers to prevent label overlap
	const collisionSource = map.getSource(collisionID) as maplibregl.GeoJSONSource | undefined; // The collision source is a more high resolution version of the line
	const mapSource = map.getSource(layerType) as maplibregl.GeoJSONSource | undefined; // The source geojson
	const hasValidSourceData = source?.data !== undefined;
	const layerExists = map.getLayer(layerType) !== undefined;
	const layerSymbols = map.getLayer(symbolID) !== undefined;
	const layerCollision = map.getLayer(collisionID) !== undefined;

	if (!hasValidSourceData) {
		// Remove layer and source if data is invalid
		if (layerSymbols) map.removeLayer(symbolID);
		if (layerCollision) map.removeLayer(collisionID);
		if (layerExists) map.removeLayer(layerType);
		if (collisionSource) map.removeSource(collisionID);
		if (mapSource) map.removeSource(layerType);
		return;
	}
	if(MAP_STYLES[layerType].specification.type === 'line'){
		const collisionPoints: GeoJSON.FeatureCollection = samplePointsAlongLineCollection(source.data! as GeoJSON.FeatureCollection, 5)
		// If source exists, update collision data; otherwise add source
		if(collisionSource){
			collisionSource.setData(collisionPoints);
		} else {
			map.addSource(collisionID, {type: 'geojson', data: collisionPoints});
		}
		if(!layerCollision) {
			const styleLayer = {...LINE_COLLISION_STYLE} as LayerSpecification & { source: string };
			styleLayer.id = collisionID;
			styleLayer.source = collisionID;
			pendingCollisionLayers.push(styleLayer as LayerSpecification);
		}
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
	// If the symbol layer (labels) does not exist, add it
	if (!layerSymbols) {
		const baseSymbolLayer =
			MAP_STYLES[layerType].specification.type === 'line' ? LINE_LABEL_STYLE : labelOverlap ? POINT_LABEL_STYLE_OVERLAP : POINT_LABEL_STYLE;
		const symbolLayer = {...baseSymbolLayer} as LayerSpecification & { source: string };
		symbolLayer.id = symbolID;
		symbolLayer.paint = {
			"text-color": layerType.includes("GRAY") ? "#999999" : layerType.includes("BLUE") ? "#1967D3" : "#000000",
			'text-halo-color': '#ffffff',
			'text-halo-width': 2,
			'text-halo-blur': 1,
		};
		symbolLayer.source = layerType;
		map.addLayer(symbolLayer as LayerSpecification);
	}
	// Enforce consistent layer ordering
	enforceLayerOrder();
}


/**
 * 3D rendering is temporarily disabled for MapLibre GL
 * TODO: Implement threelibre (https://github.com/piemonSong/threelibre) for 3D bus models
 * For now, all buses render as 2D PNG markers
 */
function shouldUse2DFallback(): boolean {
	// Always use 2D markers with MapLibre GL (3D rendering disabled)
	return true;
}

// Marker storage
const markers: Record<keyof typeof MAP_STYLES, maplibregl.Marker> = {};

// Storage for 2D bus icon markers (fallback for low-end hardware)
const bus2DMarkers: Record<string, maplibregl.Marker> = {};
const adujstmentVal = -90;
/**
 * Create a 2D bus icon element using PNG image
 * Used as fallback on low-end hardware instead of 3D models
 * Bus image dimensions: 2946×1020 (aspect ratio 2.89:1 - width:height)
 */
function create2DBusIcon(bearing: number, isActive: boolean): HTMLElement {
	const container = document.createElement('div');
	container.className = 'bus-icon-2d-container';
	container.style.position = 'relative';
	container.style.display = 'inline-block';
	container.style.transformOrigin = 'center center';
	container.style.zIndex = '2'; // Ensure bus appears above bus stops and other markers

	// Use original high-resolution image (2946×1020) and scale via CSS
	// This maintains quality better than using a pre-scaled image
	// Original aspect ratio: 2946:1020 ≈ 2.89:1 (width is ~3x height)
	const img = document.createElement('img');
	img.src = BUS_PNG_URL;

	// Apply bearing offset to align image orientation with map bearing
	const adjustedBearing = bearing + adujstmentVal; // Offset due to image orientation

	// Scale down while maintaining aspect ratio
	// Width 100px → height will be ~35px (100/2.89 ≈ 35)
	img.style.width = '100px';
	img.style.height = 'auto'; // Maintains 2946:1020 aspect ratio
	img.style.display = 'block';
	img.style.transform = `rotate(${adjustedBearing}deg)`;
	img.style.transformOrigin = 'center center';
	img.style.pointerEvents = 'none'; // Prevent interaction issues
	img.style.imageRendering = 'high-quality'; // Better quality scaling
	img.style.userSelect = 'none';
	img.draggable = false;

	// Apply opacity for inactive state
	if (!isActive) {
		img.style.opacity = '0.6';
		img.style.filter = 'grayscale(50%)';
	}

	container.appendChild(img);
	return container;
}

/**
 * Update 2D bus marker (PNG fallback for low-end hardware)
 * Follows the same pattern as bus stops to prevent jitter
 */
function update2DBusMarker(
	modelId: string,
	coords: [number, number],
	bearing: number,
	isActive: boolean
): void {
	if (!map) return;

	const markerId = `bus2d_${modelId}`;

	// Check if marker exists
	if (bus2DMarkers[markerId]) {
		// Update existing marker position
		bus2DMarkers[markerId].setLngLat([coords[0], coords[1]]);

		// Apply bearing offset to align image orientation with map bearing
		const adjustedBearing = bearing + adujstmentVal; // Offset due to image orientation

		// Update rotation and state by modifying the existing element
		const element = bus2DMarkers[markerId].getElement();
		const img = element.querySelector('img');
		if (img) {
			img.style.transform = `rotate(${adjustedBearing}deg)`;

			// Update active/inactive state
			if (isActive) {
				img.style.opacity = '1';
				img.style.filter = 'none';
			} else {
				img.style.opacity = '0.6';
				img.style.filter = 'grayscale(50%)';
			}
		}
	} else {
		// Create new marker
		const element = create2DBusIcon(bearing, isActive);
		bus2DMarkers[markerId] = new maplibregl.Marker({
			element,
			anchor: 'center'
		}).setLngLat([coords[0], coords[1]]).addTo(map);
	}
}

/**
 * Remove 2D bus marker
 */
function remove2DBusMarker(modelId: string): void {
	const markerId = `bus2d_${modelId}`;
	if (bus2DMarkers[markerId]) {
		bus2DMarkers[markerId].remove();
		delete bus2DMarkers[markerId];
	}
}

export function updateBusMarker(
	layerType: keyof typeof MAP_STYLES,
	label: string,
	lat: number | undefined,
	lon: number | undefined,
	handleTap: null | (() => void) = null,
	bearing: number = 0 // Bearing in degrees (0 = north, 90 = east, etc.)
): void {
	if(!map || !layerType.includes("BUS")) return;

	// Use a shared model ID for all bus states (BUS, BUS_INACTIVE, BUS_LIVE, etc.)
	// This ensures we reuse the same model and only update lighting/labels
	const modelId = 'SHARED_BUS_MODEL';
	const labelLayerId = `bus_label_${layerType}`;
	const clickLayerId = `bus_click_${layerType}`;
	const sourceId = `bus_source_${layerType}`;

	// Check hardware capabilities and use appropriate rendering method
	const use2D = shouldUse2DFallback();

	// Only setup 3D layer if not using 2D fallback
	if (!use2D) {
		// Ensure the Threebox layer exists (add once, following threebox pattern)
		if (!map.getLayer('3d-buses')) {
			map.addLayer(busLayer);
			map.moveLayer('3d-buses'); // Move to top to ensure it renders above 2D layers

			// Setup zoom listener for 3D models
			setup3DBusZoomListener(modelId, map);
		}
	}

	// Clear the bus if no coordinates
	if(!lat || !lon) {
		if (use2D) {
			remove2DBusMarker(modelId);
		} else {
			remove3DBusModel(modelId);
		}
		if(map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
		if(map.getLayer(clickLayerId)) map.removeLayer(clickLayerId);
		if(map.getSource(sourceId)) map.removeSource(sourceId);
		return;
	}

	// Clear labels and sources for other bus layers, but keep the shared model
	const clearStyles = Object.entries(MAP_STYLES).filter(([key]) =>
		key.includes('BUS') && !key.includes('STOP') && key !== layerType
	);
	for(const [key] of clearStyles) {
		// Only remove labels/sources, NOT the model itself
		const oldLabelId = `bus_label_${key}`;
		const oldClickId = `bus_click_${key}`;
		const oldSourceId = `bus_source_${key}`;
		if(map.getLayer(oldLabelId)) map.removeLayer(oldLabelId);
		if(map.getLayer(oldClickId)) map.removeLayer(oldClickId);
		if(map.getSource(oldSourceId)) map.removeSource(oldSourceId);
	}

	// Determine color and active state based on layer type
	const labelColor = layerType.includes("LIVE") ? "#1967D3" : layerType.includes("INACTIVE") ? "#999999" : "#000000";
	const isActive = !layerType.includes("INACTIVE"); // BUS_INACTIVE = false, BUS = true

	if (use2D) {
		// Use 2D PNG fallback for low-end hardware
		update2DBusMarker(modelId, [lon, lat], bearing, isActive);
	} else {
		// Use 3D GLB model for capable hardware
		// @ts-expect-error threebox-plugin expects this in window.
		const tb = (window as unknown).tb;
		if (!tb) {
			console.warn('[updateBusMarker] Threebox not initialized yet, falling back to 2D');
			update2DBusMarker(modelId, [lon, lat], bearing, isActive);
			return;
		}

		load3DBusModel(modelId, [lon, lat], bearing, isActive, map);
	}

	// Calculate optimal label anchor based on bearing
	// We want the label to appear perpendicular to the bus direction
	// Normalize bearing to 0-360
	const normalizedBearing = ((bearing % 360) + 360) % 360;

	// Determine which side to place the label based on bearing direction
	type TextAnchorValue = 'top-right' | 'top-left' | 'top' | 'right' | 'bottom-right' | 'bottom' | 'bottom-left' | 'left' | 'center';
	let textAnchor: TextAnchorValue[];
	if (normalizedBearing >= 315 || normalizedBearing < 45) {
		// Bus facing North: label on right (East)
		textAnchor = ['left', 'top-left', 'bottom-left'];
	} else if (normalizedBearing >= 45 && normalizedBearing < 135) {
		// Bus facing East: label on bottom (South)
		textAnchor = ['top', 'top-left', 'top-right'];
	} else if (normalizedBearing >= 135 && normalizedBearing < 225) {
		// Bus facing South: label on left (West)
		textAnchor = ['right', 'top-right', 'bottom-right'];
	} else {
		// Bus facing West: label on top (North)
		textAnchor = ['bottom', 'bottom-left', 'bottom-right'];
	}

	// Create GeoJSON source for the label
	const sourceData: GeoJSON.Feature = {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [lon, lat]
		},
		properties: {
			label: label,
			bearing: bearing
		}
	};

	// Add or update source
	const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
	if(source) {
		source.setData(sourceData);
	} else {
		map.addSource(sourceId, {
			type: 'geojson',
			data: sourceData
		});
	}

	// Add invisible clickable circle layer over the bus for click detection
	if(!map.getLayer(clickLayerId)) {
		map.addLayer({
			id: clickLayerId,
			type: 'circle',
			source: sourceId,
			paint: {
				'circle-radius': [
					'interpolate',
					['linear'],
					['zoom'],
					10, 15,   // At zoom 10, radius 15px
					14, 20,   // At zoom 14, radius 20px
					18, 25    // At zoom 18, radius 25px
				],
				'circle-opacity': 0,  // Invisible
				'circle-stroke-opacity': 0
			}
		});
	}

	// Add symbol layer for the route label with directional anchor
	if(!map.getLayer(labelLayerId)) {
		map.addLayer({
			id: labelLayerId,
			type: 'symbol',
			source: sourceId,
			layout: {
				'text-field': ['get', 'label'],
				'text-font': ['IBM Plex Sans Bold', 'Arial Unicode MS Bold'],
				'text-size': [
					'interpolate',
					['linear'],
					['zoom'],
					10, 10,
					14, 14,
					18, 20
				],
				// Position label with directional anchor and radial offset
				'text-radial-offset': 2.5,
				'text-variable-anchor': textAnchor,
				'text-justify': 'center',
				'text-allow-overlap': true,
				'text-ignore-placement': false
			},
			paint: {
				'text-color': labelColor,
				'text-halo-color': '#ffffff',
				'text-halo-width': 2,
				'text-halo-blur': 1,
				'text-opacity': layerType.includes("INACTIVE") ? 0.6 : 1.0
			}
		});
	} else {
		// Update existing label layer with new anchor
		map.setLayoutProperty(labelLayerId, 'text-variable-anchor', textAnchor);
		map.setPaintProperty(labelLayerId, 'text-color', labelColor);
		map.setPaintProperty(labelLayerId, 'text-opacity', layerType.includes("INACTIVE") ? 0.6 : 1.0);
	}

	// Enforce consistent layer ordering across all layers
	enforceLayerOrder();

	// Handle tap/click events on both the invisible click layer and label layer
	if(handleTap) {
		// Click on the invisible circle over the bus
		map.off('click', clickLayerId, handleTap);
		map.on('click', clickLayerId, handleTap);

		// Click on the label
		map.off('click', labelLayerId, handleTap);
		map.on('click', labelLayerId, handleTap);
	}
}
export function updateMarker(
	layerType: keyof typeof MAP_STYLES,
	labels: [string | undefined, string | undefined],
	lat: number | undefined,
	lon: number | undefined,
	handleTap: null | (() => void) = null
): void {
	if(!map) {
		return;
	}

	// Skip if the layer type is not Marker
	if (MAP_STYLES[layerType].type !== 1) return;

	const symbolXID = `symbolx_${layerType}`;
	const symbolZID = `symbolz_${layerType}`;
	const mapSource = map.getSource(layerType) as maplibregl.GeoJSONSource | undefined;
	const markerExists = layerType in markers;
	const hasValidCoords = (lat != undefined && lon != undefined);
	const layerSymbolX = map.getLayer(symbolXID) !== undefined;
	const layerSymbolZ = map.getLayer(symbolZID) !== undefined;
	if(!hasValidCoords) {
		if(markerExists) {
			markers[layerType].remove();
			delete markers[layerType];
		}

		if(layerSymbolX) map.removeLayer(symbolXID);
		if(layerSymbolZ) map.removeLayer(symbolZID);
		if(mapSource) map.removeSource(layerType);
		return;
	}

	const sourceData: GeoJSON.GeoJSON = {
		type: 'Feature',
		geometry: {
			type: 'Point',
			coordinates: [lon, lat],
		},
		properties: {
			"labelX": labels[0] !== undefined ? labels[0] : "",
			"labelZ": labels[1] !== undefined ? labels[1] : "",
		},
	}

	if(mapSource) {
		mapSource.setData(sourceData);
	} else {
		map.addSource(layerType, {
			type: 'geojson',
			data: sourceData,
		});
	}
	if(markerExists) {
		markers[layerType].setLngLat([lon, lat]);
	} else {
		markers[layerType] = new maplibregl.Marker({
			element: MAP_STYLES[layerType].html(),
			anchor: layerType.includes("INPUT_LOCATION") ? "bottom" : "center",
			offset: [0, layerType.includes("INPUT_LOCATION") ? 0 : 2.5],
			draggable: false,
		}).setLngLat([lon, lat]).addTo(map);
	}
	markers[layerType].getElement().onclick = handleTap;
	if(!layerSymbolX) {
		const styleLayer = {...POINT_LABEL_STYLE_OVERLAP} as LayerSpecification & { source: string };
		styleLayer.id = symbolXID;
		styleLayer.paint = {
			"text-color": layerType.includes("INACTIVE") ? "#999999" : layerType.includes("LIVE") ? "#1967D3" : "#000000",
			'text-halo-color': '#ffffff',
			'text-halo-width': 2,
			'text-halo-blur': 1,
		};
		styleLayer.source = layerType;
		styleLayer.layout = {
			'text-field': ['get', 'labelX'],
			'text-font': ['IBM Plex Sans Regular'],
			'text-variable-anchor': ['top', 'left'],
			'text-radial-offset': 1.0,
			'text-justify': 'auto',
			'text-allow-overlap': true,
		};
		map.addLayer(styleLayer as LayerSpecification);
	}
	if(!layerSymbolZ) {
		const styleLayer = {...POINT_LABEL_STYLE_OVERLAP} as LayerSpecification & { source: string };
		styleLayer.id = symbolZID;
		styleLayer.paint = {
			"text-color": layerType.includes("INACTIVE") ? "#999999" : layerType.includes("LIVE") ? "#1967D3" : "#000000",
			'text-halo-color': '#ffffff',
			'text-halo-width': 2,
			'text-halo-blur': 1,};
		styleLayer.source = layerType;
		styleLayer.layout = {
			'text-field': ['get', 'labelZ'],
			// 'text-font': ['IBM Plex Sans'],
			'text-variable-anchor': ['bottom', 'right'],
			'text-radial-offset': 1.0,
			'text-justify': 'auto',
			'text-allow-overlap': true,
		};
		map.addLayer(styleLayer as LayerSpecification);
	}
}

function getCacheKey(from: [number, number], to: [number, number], mode: string) {
	return `nav_${mode}_${from.join(',')}_${to.join(',')}`;
}
const DB_NAME = 'travel-directions';
const STORE_NAME = 'nav';
async function getDB() {
	if(!browser) return undefined;
	const { openDB } = await import('idb');
	return await openDB(DB_NAME, 1, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME);
			}
		}
	});
}

// Request queue for throttling OSRM API calls
class RequestQueue {
	private queue: Array<() => Promise<void>> = [];
	private activeRequests = 0;
	private maxConcurrent = 3; // Maximum concurrent requests
	private minDelay = 150; // Minimum delay between requests in ms
	private lastRequestTime = 0;

	async add<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					// Enforce minimum delay between requests
					const now = Date.now();
					const timeSinceLastRequest = now - this.lastRequestTime;
					if (timeSinceLastRequest < this.minDelay) {
						await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastRequest));
					}
					this.lastRequestTime = Date.now();

					const result = await fn();
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.activeRequests--;
					this.processQueue();
				}
			});
			this.processQueue();
		});
	}

	private processQueue() {
		while (this.activeRequests < this.maxConcurrent && this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				this.activeRequests++;
				task();
			}
		}
	}
}

const requestQueue = new RequestQueue();

// Haversine distance calculation for fallback
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000; // Earth radius in meters
	const dLat = (lat2 - lat1) * (Math.PI / 180);
	const dLng = (lng2 - lng1) * (Math.PI / 180);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Create haversine-based route data
function createHaversineRoute(from: [number, number], to: [number, number]): any {
	const distance = haversineDistance(from[1], from[0], to[1], to[0]);
	// Estimate walking time: assume 1.4 m/s (5 km/h) walking speed
	const duration = distance / 1.4;

	return {
		routes: [{
			distance: distance,
			duration: duration,
			geometry: {
				type: 'LineString',
				coordinates: [from, to]
			}
		}],
		_source: 'haversine' // Mark as haversine for debugging
	};
}

// Core OSRM fetch function
async function fetchOSRM(
	from: [number, number],
	to: [number, number],
	mode: NavMode
): Promise<any> {
	if (!browser) throw new Error('Browser only');

	// Map mode to OSRM profile
	const profileMap: Record<NavMode, string> = {
		'walking': 'foot',
		'driving': 'car',
		'driving-traffic': 'car',
		'cycling': 'bike'
	};
	const profile = profileMap[mode] || 'foot';

	// Use request queue to throttle API calls
	return await requestQueue.add(async () => {
		const url = `https://router.project-osrm.org/route/v1/${profile}/${from.join(',')};${to.join(',')}?overview=full&geometries=geojson`;
		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`OSRM routing request failed: ${response.status}`);
		}
		return await response.json();
	});
}

// Background OSRM fetch (fire-and-forget)
async function fetchOSRMInBackground(
	from: [number, number],
	to: [number, number],
	mode: NavMode,
	key: string
): Promise<void> {
	try {
		const data = await fetchOSRM(from, to, mode);

		// Mark as OSRM data
		data._source = 'osrm';

		// Update cache with OSRM data
		const db = await getDB();
		if (db) {
			await db.put(STORE_NAME, data, key);
			console.log(`[Routing] OSRM data ready for ${key}, triggering UI update`);

			// Trigger UI update by notifying subscribers
			routeUpdateTrigger.set(key);
		}
	} catch (error) {
		// Silent failure - haversine data is already in use
		console.warn('[Routing] Background OSRM fetch failed, keeping haversine data:', error);
	}
}

// Two-pass routing with priority support
// priority: 'high' = wait for OSRM (for rendering), 'low' = haversine first (for ranking)
export async function getTravelRoute(
	from: [number, number],
	to: [number, number],
	mode: NavMode='walking',
	priority: 'high' | 'low' = 'low'
) {
	const key = getCacheKey(from, to, mode);
	if(!browser) return null;
	const db = await getDB();
	if(!db) return null;

	// Check cache first
	const cached = await db.get(STORE_NAME, key);
	if (cached) {
		// If we have OSRM data, return it
		if (cached._source === 'osrm') {
			return cached;
		}

		// If high priority and we only have haversine, fetch OSRM now (blocking)
		if (priority === 'high') {
			console.log(`[Routing] High priority - fetching OSRM immediately for ${key}`);
			try {
				const osrmData = await fetchOSRM(from, to, mode);
				osrmData._source = 'osrm';
				await db.put(STORE_NAME, osrmData, key);
				routeUpdateTrigger.set(key);
				return osrmData;
			} catch (error) {
				console.warn('[Routing] OSRM fetch failed, using haversine:', error);
				return cached; // Fall back to haversine
			}
		}

		// Low priority with haversine: trigger background fetch and return haversine
		if (cached._source === 'haversine') {
			fetchOSRMInBackground(from, to, mode, key).catch(() => {
				// Ignore errors in background fetch
			});
		}
		return cached;
	}

	// No cache - decide based on priority
	if (priority === 'high') {
		// High priority: try OSRM first, fall back to haversine
		console.log(`[Routing] High priority - fetching OSRM (no cache) for ${key}`);
		try {
			const osrmData = await fetchOSRM(from, to, mode);
			osrmData._source = 'osrm';
			await db.put(STORE_NAME, osrmData, key);
			return osrmData;
		} catch (error) {
			console.warn('[Routing] OSRM fetch failed, using haversine:', error);
			const haversineData = createHaversineRoute(from, to);
			await db.put(STORE_NAME, haversineData, key);
			return haversineData;
		}
	}

	// Low priority: haversine first, OSRM in background
	const haversineData = createHaversineRoute(from, to);
	await db.put(STORE_NAME, haversineData, key);

	// Trigger OSRM fetch in background (non-blocking)
	fetchOSRMInBackground(from, to, mode, key).catch(() => {
		// Ignore errors - haversine data is already cached and working
	});

	return haversineData;
}

export function fitMapToPoints(coordinates: [number, number][], padding = 80) {
	if (coordinates.length === 0) return;
	if (map === undefined) return;

	let minLng = coordinates[0][0], maxLng = coordinates[0][0];
	let minLat = coordinates[0][1], maxLat = coordinates[0][1];

	for (const [lng, lat] of coordinates) {
		if (lng < minLng) minLng = lng;
		if (lng > maxLng) maxLng = lng;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}

	map.fitBounds(
		[
			[minLng, minLat],
			[maxLng, maxLat]
		],
		{
			padding,
			duration: 1000,
			maxZoom: 16
		}
	);
}
