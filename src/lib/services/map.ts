import {
	BUS_GLB_URL,
	LINE_COLLISION_STYLE,
	LINE_LABEL_STYLE,
	MAP_STYLES,
	POINT_LABEL_STYLE,
	POINT_LABEL_STYLE_OVERLAP
} from '$lib/constants';
import mapboxgl, { type LayerSpecification } from 'mapbox-gl';
import mapLineLabelImage from '$assets/map-line-label.png';
import { pollUserLocation } from '$lib/services/location';
import { handleTap, handleTouchEnd, handleTouchStart } from '$lib/services/discovery';
import { browser } from '$app/environment';
import { initMetroMap, loadMetroLines, unloadMetroMap } from '$lib/services/metroMap';
// @ts-expect-error threebox does not have types
import type { IThreeboxObject } from 'threebox-plugin';
// @ts-expect-error threebox has no types
import { Threebox } from 'threebox-plugin';
import 'threebox-plugin/dist/threebox.css';

let map: mapboxgl.Map | undefined;

export type NavMode = 'walking' | 'driving-traffic' | 'cycling' | 'driving'
export function loadMap(mapContainer: HTMLElement | string): mapboxgl.Map {
	mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
	map = new mapboxgl.Map({
		container: mapContainer,
		style: 'mapbox://styles/aayushrai/cmaq8dtyu01nh01sk3havblmv', // KIA-Live style containing required fonts
		center: [77.6, 13.02], // Default to Bengaluru
		zoom: 10.9, // Default zoom level
		dragRotate: false, // Disable rotation
		attributionControl: false,
		logoPosition: "top-right",
		antialias: true // Enable antialiasing for 3D rendering
	});
	map.addControl(new mapboxgl.AttributionControl(), 'top-left');

	// Initialize Threebox immediately after map creation (following threebox-plugin documentation)
	// CRITICAL: Threebox library expects 'tb' to be globally accessible (window.tb)
	// The library's internal methods reference 'tb' directly (see AnimationManager.js line 254)
	// @ts-expect-error threebox-plugin expects this in window.
	(window as unknown).tb = new Threebox(
		map,
		map.getCanvas().getContext('webgl') as WebGLRenderingContext,
		{
			defaultLights: true,
			realSunlight: true,
			enableSelectingObjects: false,
			enableDraggingObjects: false,
			enableRotatingObjects: false,
			enableTooltips: false
		}
	);

	map.loadImage(mapLineLabelImage, (error, image) => {
		if(error) throw error;
		if(!image) return;
		map!.addImage('LINE_LABEL', image, {
			content: [4, 4, 80, 30],
			stretchX: [[4, 80]],
			stretchY: [[4, 30]],
		});
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
	source: mapboxgl.GeoJSONSourceSpecification | undefined,
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
	const collisionSource = map.getSource(collisionID) as mapboxgl.GeoJSONSource | undefined; // The collision source is a more high resolution version of the line
	const mapSource = map.getSource(layerType) as mapboxgl.GeoJSONSource | undefined; // The source geojson
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
			const styleLayer = {...LINE_COLLISION_STYLE};
			styleLayer.id = collisionID;
			styleLayer.source = collisionID;
			pendingCollisionLayers.push(styleLayer);
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
		const symbolLayer =
			MAP_STYLES[layerType].specification.type === 'line' ? LINE_LABEL_STYLE : labelOverlap ? POINT_LABEL_STYLE_OVERLAP : POINT_LABEL_STYLE;
		symbolLayer.id = symbolID;
		symbolLayer.paint = {
			"text-color": layerType.includes("GRAY") ? "#999999" : layerType.includes("BLUE") ? "#1967D3" : "#000000",
			'text-halo-color': '#ffffff',
			'text-halo-width': 2,
			'text-halo-blur': 1,
		};
		symbolLayer.source = layerType;
		map.addLayer(symbolLayer);
	}
	// Enforce consistent layer ordering
	enforceLayerOrder();
}


// 3D Bus Model Management using Threebox
// Following threebox-plugin pattern: models stored globally, accessible throughout code

// ========== ADJUSTABLE PARAMETERS ==========
// Configuration for bus 3D model appearance
const BUS_3D_CONFIG = {
	// Scale - exponential scaling for constant screen size
	// Formula: scale(zoom) = scaleAtMidZoom * 2^(midZoom - zoom)
	// Adjust scaleAtMidZoom to control overall bus size on screen
	scaleAtMidZoom: 60*1.9,     // Reference scale at zoom 12 (adjust this to resize bus)
	minZoom: 10,             // Minimum zoom
	midZoom: 12,            // Middle reference zoom
	maxZoom: 19,            // Maximum zoom

	// Calculated values (for reference, not used directly):
	// scaleAtMinZoom: 60 * 2^5 = 1920 (at zoom 7)
	// scaleAtMaxZoom: 60 * 2^-6 = 0.9375 (at zoom 18)
	scaleAtMinZoom: 0,      // Unused - kept for compatibility
	scaleAtMaxZoom: 0,      // Unused - kept for compatibility

	// Rotation (in degrees) - will be converted to radians
	rotationX: 90,          // Pitch: lay flat on map
	rotationY: 0,         // Yaw: additional rotation (added to bearing)
	rotationZ: 0,           // Roll: flip orientation

	// Height offset - raise slightly above ground to prevent z-fighting with line layers
	altitude: 3,            // Height above ground in meters (prevents lines showing through)

	// Tilt for 3D effect (in degrees) - will be converted to radians
	tiltXDegrees: 0,        // Left/right tilt
	tiltZDegrees: 0,        // Forward/backward tilt
};

// Global storage for Threebox bus models (following threebox example pattern)
const busModels: Record<string, IThreeboxObject> = {};

// Track if zoom listener has been registered to prevent multiple registrations
let zoomListenerRegistered = false;

// Create Threebox custom layer (following threebox-plugin documentation pattern)
// This is created ONCE and models are loaded inside onAdd
const busLayer = {
	id: '3d-buses',
	type: 'custom' as const,
	renderingMode: '3d' as const,

	// onAdd: function(_map: mapboxgl.Map, _gl: WebGLRenderingContext | WebGL2RenderingContext) {
	// 	// Layer is added, models will be loaded on demand via loadBusModel()
	// },

	render: function(_gl: WebGLRenderingContext, _matrix: number[]) {
		// Update Threebox on each render frame (following threebox pattern)
		// @ts-expect-error threebox-plugin uses window.tb for instance management
		const tb = (window as unknown).tb;
		if (tb) {
			tb.update();
		}
	}
};

// Calculate zoom-based scale matching text-size interpolation
function calculateBusScale(): number {
	if (!map) return BUS_3D_CONFIG.scaleAtMidZoom;

	const zoom = map.getZoom();
	const clampedZoom = Math.max(
		BUS_3D_CONFIG.minZoom,
		Math.min(BUS_3D_CONFIG.maxZoom, zoom)
	);

	// Exponential scale: maintains constant screen size
	// Formula: scale = baseScale * 2^(referenceZoom - currentZoom)
	// Using midZoom as reference: scale = scaleAtMidZoom * 2^(midZoom - zoom)
	return BUS_3D_CONFIG.scaleAtMidZoom * Math.pow(2, BUS_3D_CONFIG.midZoom - clampedZoom);
}

// Load a bus model for a specific bus (following threebox pattern)
// isActive: true for BUS (higher light intensity), false for BUS_INACTIVE (lower intensity)
function loadBusModel(modelId: string, coords: [number, number], bearing: number, isActive: boolean = true) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	if (!tb) {
		console.warn('[loadBusModel] Threebox not initialized');
		return;
	}

	// If model already exists, just update position and lighting
	if (busModels[modelId]) {
		updateBusModelPosition(modelId, coords, bearing);
		updateBusModelLighting(modelId, isActive);
		return;
	}

	// Calculate initial scale based on current zoom
	const initialScale = calculateBusScale();

	// Load using Threebox's loadObj method with URL
	// Use 'scene' units for consistent behavior across dev/prod builds
	const options = {
		obj: BUS_GLB_URL,
		type: 'gltf',
		scale: initialScale,
		units: 'scene',
		rotation: {
			x: 0,
			y: 0, // + bearing,
			z: 0,
		},
		anchor: 'auto',
		adjustment: {x: 0, y: -0.5, z: 0.5},
		bbox: true
	};

	tb.loadObj(options, (model: IThreeboxObject) => {

		// Store model globally
		busModels[modelId] = model;
		model.setCoords([coords[0], coords[1], BUS_3D_CONFIG.altitude]);

		// Set initial lighting based on active state
		updateBusModelLighting(modelId, isActive);

		tb.add(model);
	});
}

// Update bus model lighting intensity using Threebox lights
// isActive: true for BUS (higher intensity), false for BUS_INACTIVE (lower intensity)
function updateBusModelLighting(modelId: string, isActive: boolean) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	if (!tb || !tb.lights) return;

	// Adjust the global Threebox lights intensity
	// BUS_INACTIVE: lower ambient light, BUS: higher ambient light
	const ambientIntensity = isActive ? 2.0 : 1.2;
	const directionalIntensity = isActive ? 1.6 : 0.8;

	// Threebox has ambient and directional lights
	if (tb.lights.ambientLight) {
		tb.lights.ambientLight.intensity = ambientIntensity;
		tb.lights.ambientLight.color.set('#fbeecf');
	}

	if (tb.lights.dirLightBack) {
		tb.lights.dirLightBack.intensity = directionalIntensity;
		tb.lights.dirLightBack.color.set('#faecd9');
	}

	if (tb.lights.dirLightFront) {
		tb.lights.dirLightFront.intensity = directionalIntensity;
		tb.lights.dirLightFront.color.set('#FFF');
	}

}

function calculateBusAltitude(): number {
	const modelScale = calculateBusScale();
	return modelScale * 6.1;
}

function updateBusModelScales(modelId: string) {
	const model = busModels[modelId];
	if(!model) return;
	const currentScale = calculateBusScale();
	const coords = model.coordinates;
	model.setCoords([coords[0], coords[1], calculateBusAltitude()]);
	if (model.scale) {
		model.scale.x = currentScale;
		model.scale.y = currentScale;
		model.scale.z = currentScale;
	}
}

// Update bus model position (following threebox pattern)
function updateBusModelPosition(modelId: string, coords: [number, number], bearing: number) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	const model = busModels[modelId];
	if (!model || !tb) return;

	// Calculate current scale based on zoom
	const currentScale = calculateBusScale();

	// Update position using setCoords (following threebox pattern)
	model.setCoords([coords[0], coords[1], calculateBusAltitude()]);

	// Update rotation using Threebox API (setRotation uses DEGREES)
	if (model.setRotation) {
		model.setRotation({
			x: BUS_3D_CONFIG.rotationX + BUS_3D_CONFIG.tiltXDegrees,
			y: BUS_3D_CONFIG.rotationY + -bearing,
			z: BUS_3D_CONFIG.rotationZ,
		});
	}

	// Update scale using Threebox API or direct property
	if (model.scale) {
		model.scale.x = currentScale;
		model.scale.y = currentScale;
		model.scale.z = currentScale;
	}
}

let zoomUpdate = 0;

// Remove bus model (following threebox pattern)
function removeBusModel(modelId: string) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	const model = busModels[modelId];
	if (!model || !tb) return;

	tb.remove(model);
	delete busModels[modelId];
}

// Marker storage
const markers: Record<keyof typeof MAP_STYLES, mapboxgl.Marker> = {};

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

	// Ensure the Threebox layer exists (add once, following threebox pattern)
	if (!map.getLayer('3d-buses')) {
		map.addLayer(busLayer);
		map.moveLayer('3d-buses'); // Move to top to ensure it renders above 2D layers

		// Register zoom listener ONCE when layer is first added
		if (!zoomListenerRegistered) {
			zoomListenerRegistered = true;
			map.on('zoom', () => {
				if(zoomUpdate < new Date().getTime()) {
					updateBusModelScales(modelId);
					zoomUpdate = new Date().getTime() + 10;
				}
			});
		}
	}

	// Clear the bus if no coordinates
	if(!lat || !lon) {
		removeBusModel(modelId);
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

	// Load or update bus model (following threebox pattern)
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	if (!tb) {
		console.warn('[updateBusMarker] Threebox not initialized yet');
		return;
	}

	loadBusModel(modelId, [lon, lat], bearing, isActive);

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
	const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
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
	const mapSource = map.getSource(layerType) as mapboxgl.GeoJSONSource | undefined;
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
		markers[layerType].setLngLat({lon: lon, lat: lat});
	} else {
		markers[layerType] = new mapboxgl.Marker({
			element: MAP_STYLES[layerType].html(),
			anchor: layerType.includes("INPUT_LOCATION") ? "bottom" : "center",
			offset: [0, layerType.includes("INPUT_LOCATION") ? 0 : 2.5],
			draggable: false,
		}).setLngLat({lat: lat, lon: lon}).addTo(map);
	}
	markers[layerType].getElement().onclick = handleTap;
	if(!layerSymbolX) {
		const styleLayer = {...POINT_LABEL_STYLE_OVERLAP};
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
		map.addLayer(styleLayer);
	}
	if(!layerSymbolZ) {
		const styleLayer = {...POINT_LABEL_STYLE_OVERLAP};
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
		map.addLayer(styleLayer);
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
export async function getTravelRoute(from: [number, number], to: [number, number], mode: NavMode='walking') {
	const key = getCacheKey(from, to, mode);
	if(!browser) return null;
	const db = await getDB();
	if(!db) return null;
	const cached = await db.get(STORE_NAME, key);
	if (cached) return cached;

	const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${from.join(',')};${to.join(',')}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
	const response = await fetch(url);

	if (!response.ok) throw new Error(`Mapbox request failed: ${response.status}`);
	const data = await response.json();

	await db.put(STORE_NAME, data, key);
	return data;
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
