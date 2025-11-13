import {
	LINE_COLLISION_STYLE,
	LINE_LABEL_STYLE,
	MAP_STYLES,
	POINT_LABEL_STYLE,
	POINT_LABEL_STYLE_OVERLAP,
	BUS_GLB_URL
} from '$lib/constants';
import mapboxgl, { type LayerSpecification } from 'mapbox-gl';
import mapLineLabelImage from '$assets/map-line-label.png';
import { pollUserLocation } from '$lib/services/location';
import { handleTap, handleTouchEnd, handleTouchStart } from '$lib/services/discovery';
import { browser } from '$app/environment';
import { initMetroMap, loadMetroLines, unloadMetroMap } from '$lib/services/metroMap';
import type * as THREE_NS from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

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


// 3D Bus Model Management using THREE.js
// Custom 3D Layer for bus rendering
class BusModel3DLayer {
	id: string;
	type = 'custom' as const;
	renderingMode = '3d' as const;
	private camera: THREE_NS.Camera | null = null;
	private scene: THREE_NS.Scene | null = null;
	private renderer: THREE_NS.WebGLRenderer | null = null;
	private busModel: THREE_NS.Object3D | null = null;
	public location: [number, number];
	public bearing: number;

	// ========== ADJUSTABLE PARAMETERS ==========
	// Tweak these values to fix orientation and scaling
	private config = {
		// Scale - linear interpolation matching text-size behavior
		// Text goes from 10px@zoom10 -> 14px@zoom14 -> 20px@zoom18
		// So we use similar linear interpolation for the bus
		scaleAtMinZoom: 0.0008,   // Scale at zoom 10 (smaller when far)
		scaleAtMidZoom: 0.0001,   // Scale at zoom 14 (medium)
		scaleAtMaxZoom: 0.00001,   // Scale at zoom 18 (smaller when close, maintains apparent size)
		minZoom: 10,               // Minimum zoom
		midZoom: 14,               // Middle reference zoom
		maxZoom: 18,               // Maximum zoom

		// Rotation (in degrees, will be converted to radians)
		rotationX: 90,  // Pitch: -90 = lay flat, 0 = standing up, 90 = upside down
		rotationY: 0,    // Yaw: additional rotation around vertical axis
		rotationZ: 180,    // Roll: tilt left/right

		// Bearing adjustment
		bearingOffset: 0,    // Add offset to bearing in degrees (0, 90, 180, 270)
		bearingMultiplier: 1, // 1 or -1 to flip bearing direction

		// Tilt for 3D effect
		tiltZDegrees: 0, // Forward/backward tilt in degrees (0 = no tilt)
		tiltXDegrees: 0,

		// Position offset relative to the coordinate point
		offsetX: 0,  // Longitude offset in mercator units (usually 0)
		offsetY: 0,  // Latitude offset in mercator units (usually 0)
		offsetZ: 2,  // Height offset in mercator units (0 = ground level)

		// Scale flip (useful if model is mirrored)
		scaleX: 1,   // 1 or -1
		scaleY: -1,  // 1 or -1 (Mapbox uses -1 for Y axis)
		scaleZ: 1    // 1 or -1
	};
	// ==========================================

	constructor(id: string, location: [number, number], bearing: number) {
		this.id = id;
		this.location = location;
		this.bearing = bearing;
	}

	async onAdd(mapInstance: mapboxgl.Map, _gl: WebGLRenderingContext) {
		// Use dynamic import for THREE.js to avoid SSR issues
		const THREE = await import('three');
		const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');

		// Create THREE.js scene
		this.camera = new THREE.Camera();
		this.scene = new THREE.Scene();

		// Add basic lighting (no modifications to brightness)
		const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
		directionalLight.position.set(0, 1, 0);
		this.scene.add(directionalLight);

		const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
		this.scene.add(ambientLight);

		// Load the GLB model
		const loader = new GLTFLoader();
		await new Promise<GLTF>((resolve, reject) => {
			loader.load(
				BUS_GLB_URL,
				(gltf: GLTF) => {
					this.busModel = gltf.scene;

					// Calculate bounding box to find model's center
					const box = new THREE.Box3().setFromObject(this.busModel);
					const center = new THREE.Vector3();
					box.getCenter(center);

					// Recenter the model by offsetting all children
					// This moves the pivot point to the geometric center
					this.busModel.position.set(-center.x, -center.y, -center.z);

					// Wrap in a group so rotations happen around the new centered origin
					const centeredGroup = new THREE.Group();
					centeredGroup.add(this.busModel);

					// Replace busModel reference with the centered group
					this.busModel = centeredGroup;

					// No material modifications - use textures as-is
					this.scene!.add(this.busModel);
					resolve(gltf);
				},
				undefined,
				reject
			);
		});

		// Create renderer from map's gl context
		this.renderer = new THREE.WebGLRenderer({
			canvas: mapInstance.getCanvas(),
			context: _gl,
			antialias: true,
			alpha: true,
			premultipliedAlpha: false
		});
		this.renderer.autoClear = false;
	}

	async render(_gl: WebGLRenderingContext, matrix: number[]) {
		if (!this.busModel || !map || !this.camera || !this.renderer) return;

		const THREE = await import('three');

		// Get map's transform for positioning with offset
		const mercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
			this.location,
			this.config.offsetZ
		);

		const zoom = map.getZoom();

		// Calculate linear interpolation matching text-size behavior
		// Text: zoom 10->10px, zoom 14->14px, zoom 18->20px
		// Bus: zoom 10->scaleAtMinZoom, zoom 14->scaleAtMidZoom, zoom 18->scaleAtMaxZoom
		const clampedZoom = Math.max(
			this.config.minZoom,
			Math.min(this.config.maxZoom, zoom)
		);

		let modelScale: number;
		if (clampedZoom <= this.config.midZoom) {
			// Interpolate between minZoom and midZoom
			const t = (clampedZoom - this.config.minZoom) / (this.config.midZoom - this.config.minZoom);
			modelScale = this.config.scaleAtMinZoom + t * (this.config.scaleAtMidZoom - this.config.scaleAtMinZoom);
		} else {
			// Interpolate between midZoom and maxZoom
			const t = (clampedZoom - this.config.midZoom) / (this.config.maxZoom - this.config.midZoom);
			modelScale = this.config.scaleAtMidZoom + t * (this.config.scaleAtMaxZoom - this.config.scaleAtMidZoom);
		}

		// Calculate bearing with config adjustments
		const adjustedBearing = (this.bearing * this.config.bearingMultiplier) + this.config.bearingOffset;
		const bearingRad = (adjustedBearing * Math.PI) / 180;

		// Convert config rotation degrees to radians
		const rotXRad = (this.config.rotationX * Math.PI) / 180;
		const rotYRad = (this.config.rotationY * Math.PI) / 180;
		const rotZRad = (this.config.rotationZ * Math.PI) / 180;
		const tiltXRad = (this.config.tiltXDegrees * Math.PI) / 180;
		const tiltZRad = (this.config.tiltZDegrees * Math.PI) / 180;

		// Apply transformations directly to the model
		// This ensures rotations are visible in all browsers
		this.busModel.rotation.set(0, 0, 0);
		this.busModel.position.set(0, 0, 0);
		this.busModel.scale.set(1, 1, 1);

		// Apply rotations in the correct order
		// THREE.js uses Euler angles: rotationX (pitch), rotationY (yaw), rotationZ (roll)
		this.busModel.rotation.order = 'XYZ';
		this.busModel.rotation.x = rotXRad + tiltXRad;  // Pitch + forward/backward tilt
		this.busModel.rotation.y = rotYRad + bearingRad;              // Yaw
		this.busModel.rotation.z = rotZRad + tiltZRad;  // Roll + bearing + rotational tilt

		// Apply scale
		this.busModel.scale.set(
			modelScale * this.config.scaleX,
			modelScale * this.config.scaleY,
			modelScale * this.config.scaleZ
		);

		// Create transformation matrix for positioning
		const modelMatrix = new THREE.Matrix4()
			.makeTranslation(
				mercatorCoordinate.x + this.config.offsetX,
				mercatorCoordinate.y + this.config.offsetY,
				mercatorCoordinate.z
			);

		// Set camera projection matrix from Mapbox
		this.camera.projectionMatrix = new THREE.Matrix4()
			.fromArray(matrix)
			.multiply(modelMatrix);

		// Render the scene
		this.renderer.resetState();
		this.renderer.render(this.scene!, this.camera);
		map.triggerRepaint();
	}

	updatePosition(location: [number, number], bearing: number) {
		this.location = location;
		this.bearing = bearing;
		// Trigger map repaint to apply new position and bearing-based offsets
		if (map) {
			map.triggerRepaint();
		}
	}
}

// Update Marker function (keeping for non-bus markers)
const markers: Record<keyof typeof MAP_STYLES, mapboxgl.Marker> = {}; // Simulated marker layer
const bus3DLayers: Record<string, BusModel3DLayer> = {}; // 3D model layers

export function updateBusMarker(
	layerType: keyof typeof MAP_STYLES,
	label: string,
	lat: number | undefined,
	lon: number | undefined,
	handleTap: null | (() => void) = null,
	bearing: number = 0 // Bearing in degrees (0 = north, 90 = east, etc.)
): void {
	if(!map || !layerType.includes("BUS")) return;

	const modelLayerId = `bus_model_${layerType}`;
	const labelLayerId = `bus_label_${layerType}`;
	const clickLayerId = `bus_click_${layerType}`;
	const sourceId = `bus_source_${layerType}`;

	// Clear the bus if no coordinates
	if(!lat || !lon) {
		if(map.getLayer(modelLayerId)) map.removeLayer(modelLayerId);
		if(map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
		if(map.getLayer(clickLayerId)) map.removeLayer(clickLayerId);
		if(map.getSource(sourceId)) map.removeSource(sourceId);
		delete bus3DLayers[modelLayerId];
		return;
	}

	// Clear other bus layers
	const clearStyles = Object.entries(MAP_STYLES).filter(([key]) =>
		key.includes('BUS') && !key.includes('STOP') && key !== layerType
	);
	for(const [key] of clearStyles) {
		const oldModelId = `bus_model_${key}`;
		const oldLabelId = `bus_label_${key}`;
		const oldClickId = `bus_click_${key}`;
		const oldSourceId = `bus_source_${key}`;
		if(map.getLayer(oldModelId)) map.removeLayer(oldModelId);
		if(map.getLayer(oldLabelId)) map.removeLayer(oldLabelId);
		if(map.getLayer(oldClickId)) map.removeLayer(oldClickId);
		if(map.getSource(oldSourceId)) map.removeSource(oldSourceId);
		delete bus3DLayers[oldModelId];
	}

	// Determine color based on layer type
	const labelColor = layerType.includes("LIVE") ? "#1967D3" : layerType.includes("INACTIVE") ? "#999999" : "#000000";

	// Create or update 3D layer
	if (bus3DLayers[modelLayerId]) {
		// Update existing layer
		bus3DLayers[modelLayerId].updatePosition([lon, lat], bearing);
	} else {
		// Create new 3D layer
		const layer = new BusModel3DLayer(modelLayerId, [lon, lat], bearing);
		bus3DLayers[modelLayerId] = layer;

		// Add layer to map
		if (!map.getLayer(modelLayerId)) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			map.addLayer(layer as any);
		}
	}

	// Calculate optimal label anchor based on bearing
	// We want the label to appear perpendicular to the bus direction
	// Normalize bearing to 0-360
	const normalizedBearing = ((bearing % 360) + 360) % 360;

	// Determine which side to place the label based on bearing direction
	let textAnchor: string[];
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
				'text-variable-anchor': textAnchor as any,
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
