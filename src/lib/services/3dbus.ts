/**
 * 3D Bus Model Management using Threebox
 * This module handles all 3D rendering for buses on the map
 */

import { BUS_GLB_URL } from '$lib/constants';
// @ts-expect-error threebox does not have types
import type { IThreeboxObject } from 'threebox-plugin';
import type mapboxgl from 'mapbox-gl';

// ========== ADJUSTABLE PARAMETERS ==========
// Configuration for bus 3D model appearance
const BUS_3D_CONFIG = {
	// Scale - exponential scaling for constant screen size
	// Formula: scale(zoom) = scaleAtMidZoom * 2^(midZoom - zoom)
	// Adjust scaleAtMidZoom to control overall bus size on screen
	scaleAtMidZoom: 10.5,     // Reference scale at zoom 12 (adjust this to resize bus)
	minZoom: 10,             // Minimum zoom
	midZoom: 12,            // Middle reference zoom
	maxZoom: 20,            // Maximum zoom

	// Rotation (in degrees) - will be converted to radians
	rotationX: 90,          // Pitch: lay flat on map
	rotationY: -90,         // Yaw: additional rotation (added to bearing)
	rotationZ: 0,           // Roll: flip orientation

	// Height offset - raise slightly above ground to prevent z-fighting with line layers
	altitude: 0.02,            // Height above ground in meters (prevents lines showing through)

	// Tilt for 3D effect (in degrees) - will be converted to radians
	tiltXDegrees: 0,        // Left/right tilt
	tiltZDegrees: 0,        // Forward/backward tilt
};

// Global storage for Threebox bus models (following threebox example pattern)
const busModels: Record<string, IThreeboxObject> = {};

// Track models that are currently loading to prevent duplicates
const loadingModels: Set<string> = new Set();

// Track if zoom listener has been registered to prevent multiple registrations
let zoomListenerRegistered = false;

// Zoom update throttle
let zoomUpdate = 0;

// Create Threebox custom layer (following threebox-plugin documentation pattern)
export const busLayer = {
	id: '3d-buses',
	type: 'custom' as const,
	renderingMode: '3d' as const,

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
function calculateBusScale(map: mapboxgl.Map): number {
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

function calculateBusAltitude(): number {
	return 0;
}

/**
 * Load a bus model for a specific bus (following threebox pattern)
 * isActive: true for BUS (higher light intensity), false for BUS_INACTIVE (lower intensity)
 */
export function load3DBusModel(
	modelId: string,
	coords: [number, number],
	bearing: number,
	isActive: boolean = true,
	map: mapboxgl.Map
) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	if (!tb) {
		console.warn('[load3DBusModel] Threebox not initialized');
		return;
	}

	// If model already exists, just update position and lighting
	if (busModels[modelId]) {
		update3DBusModelPosition(modelId, coords, bearing, map);
		update3DBusModelLighting(modelId, isActive);
		return;
	}

	// RACE CONDITION FIX: Check if model is currently loading
	// If already loading, skip to prevent duplicate models
	if (loadingModels.has(modelId)) {
		console.log(`[load3DBusModel] Model ${modelId} is already loading, skipping duplicate request`);
		return;
	}

	// Mark model as loading
	loadingModels.add(modelId);

	// Calculate initial scale based on current zoom
	const initialScale = calculateBusScale(map);

	// Load using Threebox's loadObj method with URL
	const options = {
		obj: BUS_GLB_URL,
		type: 'gltf',
		scale: initialScale,
		units: 'meters',
		rotation: {
			x: 0,
			y: 0,
			z: 0,
		},
		anchor: 'auto',
		adjustment: {x: 0, y: 1, z: -0.6},
		bbox: true
	};

	tb.loadObj(options, (model: IThreeboxObject) => {
		// Remove from loading set
		loadingModels.delete(modelId);

		// Store model globally
		busModels[modelId] = model;
		model.setCoords([coords[0], coords[1], BUS_3D_CONFIG.altitude]);

		// Set initial lighting based on active state
		update3DBusModelLighting(modelId, isActive);

		tb.add(model);
	});
}

/**
 * Update bus model lighting intensity using Threebox lights
 * isActive: true for BUS (higher intensity), false for BUS_INACTIVE (lower intensity)
 */
function update3DBusModelLighting(modelId: string, isActive: boolean) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	if (!tb || !tb.lights) return;

	// Adjust the global Threebox lights intensity
	// BUS_INACTIVE: lower ambient light, BUS: higher ambient light
	const ambientIntensity = isActive ? 1.0 : 0.8;
	const directionalIntensity = isActive ? 0.8 : 0.6;

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

/**
 * Update model scales based on zoom level
 */
export function update3DBusModelScales(modelId: string, map: mapboxgl.Map) {
	const model = busModels[modelId];
	if(!model) return;
	const currentScale = calculateBusScale(map);
	const coords = model.coordinates;
	model.setCoords([coords[0], coords[1], calculateBusAltitude()]);
	if (model.scale) {
		model.scale.x = currentScale;
		model.scale.y = currentScale;
		model.scale.z = currentScale;
	}
}

/**
 * Update bus model position (following threebox pattern)
 */
function update3DBusModelPosition(modelId: string, coords: [number, number], bearing: number, map: mapboxgl.Map) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	const model = busModels[modelId];
	if (!model || !tb) return;

	// Calculate current scale based on zoom
	const currentScale = calculateBusScale(map);

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

/**
 * Remove bus model (following threebox pattern)
 */
export function remove3DBusModel(modelId: string) {
	// @ts-expect-error threebox-plugin expects this in window.
	const tb = (window as unknown).tb;
	const model = busModels[modelId];
	if (!model || !tb) return;

	tb.remove(model);
	delete busModels[modelId];

	// Also remove from loading set in case removal happens during load
	loadingModels.delete(modelId);
}

/**
 * Setup zoom listener for 3D bus models
 */
export function setup3DBusZoomListener(modelId: string, map: mapboxgl.Map) {
	if (zoomListenerRegistered) return;

	zoomListenerRegistered = true;
	map.on('zoom', () => {
		if(zoomUpdate < new Date().getTime()) {
			update3DBusModelScales(modelId, map);
			zoomUpdate = new Date().getTime() + 10;
		}
	});
}