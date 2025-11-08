import {
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
	});
	map.addControl(new mapboxgl.AttributionControl(), 'top-left');
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

			// Initialize and load metro lines and stops
			if (map) {
				initMetroMap(map);
				loadMetroLines();
			}
		}
	);
	return map;
}

export function unloadMap() {
	if(map != undefined){
		unloadMetroMap();
		map.remove();
		map = undefined;
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
		symbolLayer.paint = {"text-color": layerType.includes("GRAY") ? "#999999" : layerType.includes("BLUE") ? "#1967D3" : "#000000"};
		symbolLayer.source = layerType;
		map.addLayer(symbolLayer);
	}
	map.moveLayer(layerType);
	map.moveLayer(symbolID);
}


// Update Marker function
const markers: Record<keyof typeof MAP_STYLES, mapboxgl.Marker> = {}; // Simulated marker layer
export function updateBusMarker(
	layerType: keyof typeof MAP_STYLES,
	label: string,
	lat: number | undefined,
	lon: number | undefined,
	handleTap: null | (() => void) = null,
	bearing: number = 0 // Bearing in degrees (0 = north, 90 = east, etc.)
): void {
	if(!map || !layerType.includes("BUS")) return;
	if(!lat || !lon){ // Clear the marker
		updateMarker(layerType, [undefined, undefined], undefined, undefined);
		return;
	}
	const clearStyles = Object.entries(MAP_STYLES).filter(([key, value]) => key.includes('BUS') && !key.includes('STOP') && value.type === 1 && key !== layerType);
	for(const style of clearStyles) {
		// console.log('CLEARING STYLE ', style);
		updateMarker(style[0], [undefined, undefined], undefined, undefined);
	}
	updateMarker(layerType, [undefined, undefined], lat, lon, handleTap);

	// Update label text
	const labelEl = document.getElementById("routename-text");
	if(labelEl) labelEl.innerHTML = label;

	// Get current map zoom level for scaling
	const zoom = map?.getZoom() || 14;
	// Scale interpolation: zoom 10 = 0.5x, zoom 14 = 1x, zoom 18 = 2x
	const minZoom = 10;
	const maxZoom = 18;
	const minScale = 0.8;
	const maxScale = 2.0;
	const scale = minScale + ((zoom - minZoom) / (maxZoom - minZoom)) * (maxScale - minScale);
	const clampedScale = Math.max(minScale, Math.min(maxScale, scale));

	// Update bus image rotation, scaling, and apply filters
	const busImageEl = document.querySelector(".bus-image") as HTMLElement;
	if(busImageEl) {
		bearing -= 90;
		if(bearing < 0) bearing += 360;
		busImageEl.style.transform = `rotate(${bearing}deg) scale(${clampedScale})`;
		// Add brightness and vibrancy filters to make the bus more visible
		busImageEl.style.filter = `brightness(1.2) saturate(1.3) contrast(1.1)`;
	}

	// Interpolate label distance based on rotation and zoom
	// When horizontal (bearing = 90° or 270°), label is closer
	// When vertical (bearing = 0° or 180°), label is farther
	// Also adjust for zoom level (larger bus = more distance, smaller bus = less distance)
	const busLabelEl = document.querySelector(".bus-label") as HTMLElement;
	if(busLabelEl) {
		// Normalize bearing to 0-180 range for calculation
		const normalizedBearing = Math.abs((bearing % 180));

		// Base distances at zoom 14 (scale = 1.0)
		const baseDistHorizontal = 20; // Base distance when horizontal at 1x scale
		const baseDistVertical = 4;  // Max distance when vertical at 1x scale

		// Calculate bearing interpolation factor (0 = horizontal, 1 = vertical)
		const bearingFactor = Math.abs(Math.cos((normalizedBearing * Math.PI) / 180));

		// Calculate base distance for current bearing (before zoom adjustment)
		const baseDistance = baseDistHorizontal + (baseDistVertical - baseDistHorizontal) * bearingFactor;

		// Adjust distance based on zoom scale
		// At scale 0.5x (zoomed out), reduce distance by 50%
		// At scale 2.0x (zoomed in), increase distance by 100%
		const scaledDistance = (baseDistance * clampedScale) * 1.1;
		busLabelEl.style.marginTop = `${scaledDistance}px`;
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
	// console.log('LAYERS MARKERS', markers);
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
			// console.log('REMOVED MARKER ', layerType);
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
		// console.log('CREATED MARKER ', layerType);
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
		styleLayer.paint = {"text-color": layerType.includes("INACTIVE") ? "#999999" : layerType.includes("LIVE") ? "#1967D3" : "#000000"};
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
		styleLayer.paint = {"text-color": layerType.includes("INACTIVE") ? "#999999" : layerType.includes("LIVE") ? "#1967D3" : "#000000"};
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
	// console.log("returning cached response");
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
	// console.log("Failed to retrieve cache response");

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
