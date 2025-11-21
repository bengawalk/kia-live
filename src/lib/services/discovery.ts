import type { Stop } from '$lib/structures/Stop';
import type { Trip } from '$lib/structures/Trip';
import type { Route } from '$lib/structures/Route';
import type { LiveTrip } from '$lib/structures/LiveTrip';
import {
	type GeoJSONSourceSpecification,
	type Map as MapboxMap,
	type MapMouseEvent,
	type MapTouchEvent,
	type PointLike
} from 'mapbox-gl';
import { liveTransitFeed, transitFeedStore } from '$lib/stores/transitFeedStore';
import {
	airportDirection,
	displayingTrip,
	highlightedStop,
	nextBuses,
	nextBusIndex,
	selected,
	selectedTripID
} from '$lib/stores/discovery';
import { get } from 'svelte/store';
import { currentLocation, type InputCoords, inputLocation, userLocation } from '$lib/stores/location';
import {
	fitMapToPoints,
	getTravelRoute,
	type NavMode,
	removeRenderedCollisions,
	renderPendingCollisions,
	updateBusMarker,
	updateLayer,
	updateMarker
} from '$lib/services/map';
import { AIRPORT_LOCATION, AIRPORT_SOFTLOCK, DEFAULT_LOCATION, MAP_STYLES } from '$lib/constants';
import { language } from '$lib/stores/language';

const tappableLayers = Object.keys(MAP_STYLES).filter((key) => MAP_STYLES[key].type === 0);
let markerTapped = false;
let currentRefreshTimeout: NodeJS.Timeout | undefined = undefined;
let busMarkerInterval: NodeJS.Timeout | undefined = undefined;
let lastLoadNextBusesTime = 0;
let lastLoadNextBusesLocation: { lat: number; lon: number } | undefined = undefined;

// Public function for non-location-based triggers (feed updates, timers)
async function loadNextBuses() {
	await loadNextBusesInternal();
}

// Throttled wrapper for user location changes only
async function loadNextBusesThrottled() {
	const now = Date.now();
	const loc = currentLocation();

	// Check time throttle (60 seconds = 60000ms)
	const timeSinceLastLoad = now - lastLoadNextBusesTime;

	if (timeSinceLastLoad < 60000) {
		// Check distance throttle (50 meters)
		if (lastLoadNextBusesLocation) {
			const distance = haversineDistance(
				loc.latitude,
				loc.longitude,
				lastLoadNextBusesLocation.lat,
				lastLoadNextBusesLocation.lon
			);
			if (distance < 50) {
				console.log('skipping nextBuses load')
				return;
			}
		}
	}
	console.log('starting nextBuses load')
	// Passed throttling checks - proceed with load
	await loadNextBusesInternal();
	console.log('finished nextBuses load')
}

export function setMarkerTapped() {
	markerTapped = true;
	setTimeout(() => (markerTapped = false), 100);
}

export function cycleBus() {
	let currentIndex = get(nextBusIndex);
	currentIndex += 1;
	const direction = get(airportDirection) ? 'toAirport' : 'toCity';
	const currentBuses = get(nextBuses);
	if (currentIndex >= currentBuses[direction].length) {
		currentIndex = 0;
	}
	selected.set(undefined);
	nextBusIndex.set(currentIndex);
	if (currentBuses[direction].length > 0)
		selectedTripID.set(currentBuses[direction][currentIndex].trip_id);
}

function getNextDeparture(closestStop: {
	stop_id?: string;
	stop_time?: string;
	stop_date: (baseDate?: Date, days?: number) => Date;
}, isLiveTrip: boolean = false): Date {
	if (closestStop.stop_date().getTime() < Date.now() && !isLiveTrip) {
		return closestStop.stop_date(undefined, 1);
	}
	return closestStop.stop_date();
}

async function loadNextBusesInternal() {
	console.log("LOADING NEXT BUSES")
	// Take data from transit feed stores, location stores, and generate next buses
	const loc = currentLocation();

	// Update last load location for throttling
	lastLoadNextBusesLocation = { lat: loc.latitude, lon: loc.longitude };
	lastLoadNextBusesTime = Date.now();
	// console.log(loc);
	const transitFeed = get(transitFeedStore);
	const liveFeed = get(liveTransitFeed);
	const stops = await filterLocationsByRange(
		loc.latitude,
		loc.longitude,
		Object.values(transitFeed.stops),
		0.5
	); // We get stops nearest to location
	const stopIds = stops.map((stop) => stop.stop_id); // We take stop ids for matching trip times
	const seenTripIds = new Set<string>();
	const routes = transitFeed.routes.filter((route) => {
		// Filter routes to only ones that go by the stops
		for (const stop of route.stops) {
			if (stopIds.includes(stop.stop_id)) {
				return true;
			}
		}
		return false;
	});
	const staticTrips = routes.flatMap((value) => value.trips); // Get the static trip objects
	const staticTripIds = staticTrips.map((value) => value.trip_id); // Get trip ids to filter matching live trips
	const liveTrips = liveFeed.trips.filter((value) => staticTripIds.includes(value.trip_id));
	const trips = Array.from(
		new Map([...staticTrips, ...liveTrips].map((item) => [item.trip_id, item])).values()
	).sort((a, b) => (Object.hasOwn(a, 'vehicle_id') && !Object.hasOwn(b, 'vehicle_id') ? -1 : 1));
	const nextTrips: { toCity: (Trip | LiveTrip)[]; toAirport: (Trip | LiveTrip)[] } = {
		toAirport: [],
		toCity: []
	};
	const nextTripTimes: { toCity: number[]; toAirport: number[] } = { toAirport: [], toCity: [] }; // Array for quickly inserting at correct index
	let earliestNextBusTime = new Date().getTime() + 3600000; // Track earliest bus for smart refresh scheduling

	// Cache: Pre-calculate route directions to avoid repeated haversine calculations
	const routeDirections = new Map<string, 'toAirport' | 'toCity'>();
	for (const route of routes) {
		const direction = haversineDistance(
			route.stops[0].stop_lat,
			route.stops[0].stop_lon,
			AIRPORT_LOCATION[0],
			AIRPORT_LOCATION[1]
		) >
		haversineDistance(
			route.stops[route.stops.length - 1].stop_lat,
			route.stops[route.stops.length - 1].stop_lon,
			AIRPORT_LOCATION[0],
			AIRPORT_LOCATION[1]
		)
			? 'toAirport'
			: 'toCity';
		routeDirections.set(route.route_id, direction);
	}

	// Cache: Pre-calculate travel times/distances for all nearby stops in parallel
	const stopTravelInfo = new Map<string, { distance: number; travelTime: number }>();
	const uniqueStopIds = new Set<string>();
	for (const trip of trips) {
		const nearbyStops = trip.stops.filter((t) => stopIds.includes(t.stop_id));
		for (const stop of nearbyStops) {
			uniqueStopIds.add(stop.stop_id);
		}
	}

	// Batch all travel calculations in parallel
	const travelPromises = Array.from(uniqueStopIds).map(async (stopId) => {
		const stop = transitFeed.stops[stopId];
		const distance = await travelDistance(
			loc.latitude,
			loc.longitude,
			stop.stop_lat,
			stop.stop_lon
		);
		const time = await travelTime(
			loc.latitude,
			loc.longitude,
			stop.stop_lat,
			stop.stop_lon
		);
		return { stopId, distance, travelTime: time };
	});

	const travelResults = await Promise.all(travelPromises);
	for (const result of travelResults) {
		stopTravelInfo.set(result.stopId, { distance: result.distance, travelTime: result.travelTime });
	}

	for (const trip of trips) {
		if (seenTripIds.has(trip.trip_id) && !Object.hasOwn(trip, 'vehicle_id')) continue;
		seenTripIds.add(trip.trip_id);

		const direction = routeDirections.get(trip.route_id);
		if (!direction) continue;

		const nearbyStops = trip.stops.filter((t) => stopIds.includes(t.stop_id));
		if (nearbyStops.length == 0) {
			continue;
		}

		// Find closest stop using pre-calculated distances
		let closestStop = nearbyStops[0];
		let closestDistance = stopTravelInfo.get(closestStop.stop_id)?.distance ?? Infinity;

		for (let i = 1; i < nearbyStops.length; i++) {
			const distance = stopTravelInfo.get(nearbyStops[i].stop_id)?.distance ?? Infinity;
			if (distance < closestDistance) {
				closestStop = nearbyStops[i];
				closestDistance = distance;
			}
		}

		const travelInfo = stopTravelInfo.get(closestStop.stop_id);
		if (!travelInfo) continue;

		const travelTimeMS = travelInfo.travelTime * 1000;
		const arrivalToStop = Date.now() + travelTimeMS;
		const nextDepartureTime = getNextDeparture(closestStop, Object.hasOwn(trip, 'vehicle_id'));
		const nextDepartureTimeMs = nextDepartureTime.getTime();

		// Track earliest bus departure for smart refresh scheduling
		if (nextDepartureTimeMs < earliestNextBusTime) {
			earliestNextBusTime = nextDepartureTimeMs;
		}

		if (
			nextDepartureTime < // Filter out trips that have already passed or will pass before user can reach, keep a 30 second delay in case the user is tracking the bus to get on.
			new Date(arrivalToStop - (30 * 1000))
		) {
			continue;
		}
		if (nextTrips[direction].length == 0 || nextTripTimes[direction].length == 0) {
			nextTrips[direction].push(trip);
			nextTripTimes[direction].push(nextDepartureTimeMs);
			continue;
		}
		// Fast exit if the number is too large
		if (
			nextTripTimes[direction].length === 10 &&
			nextDepartureTimeMs >=
				nextTripTimes[direction][nextTripTimes[direction].length - 1]
		)
			continue;

		// Binary search for correct insertion index
		let left = 0,
			right = nextTripTimes[direction].length;
		while (left < right) {
			const mid = (left + right) >> 1;
			if (nextTripTimes[direction][mid] < nextDepartureTimeMs) left = mid + 1;
			else right = mid;
		}

		// Insert and trim to max 10 (we'll filter to 4 later based on live/static priority)
		nextTripTimes[direction].splice(left, 0, nextDepartureTimeMs);
		nextTrips[direction].splice(left, 0, trip);
		if (nextTripTimes[direction].length > 10) {
			nextTrips[direction].pop();
			nextTripTimes[direction].pop();
		}
	}

	// Now apply the priority logic: prefer live trips, but use static if needed
	for (const direction of ['toAirport', 'toCity']) {
		const allTrips = nextTrips[direction as 'toAirport' | 'toCity'];

		// Separate live and static trips while preserving time order
		const liveTrips = allTrips.filter((t) => Object.hasOwn(t, 'vehicle_id'));
		const staticTrips = allTrips.filter((t) => !Object.hasOwn(t, 'vehicle_id'));

		// If we have 4+ live trips, use only live trips (up to 4)
		if (liveTrips.length >= 4) {
			nextTrips[direction as 'toAirport' | 'toCity'] = liveTrips.slice(0, 4);
		} else {
			// Otherwise, use all live trips + enough static trips to reach 4 total
			const needed = 4 - liveTrips.length;
			nextTrips[direction as 'toAirport' | 'toCity'] = [
				...liveTrips,
				...staticTrips.slice(0, needed)
			].sort((a, b) => {
				// First, prioritize live buses over static buses
				const aIsLive = Object.hasOwn(a, 'vehicle_id');
				const bIsLive = Object.hasOwn(b, 'vehicle_id');
				if (aIsLive && !bIsLive) return -1;
				if (!aIsLive && bIsLive) return 1;

				// If both are live or both are static, sort by time
				const aTime = a.stops.find(s => stopIds.includes(s.stop_id))?.stop_date().getTime() || 0;
				const bTime = b.stops.find(s => stopIds.includes(s.stop_id))?.stop_date().getTime() || 0;
				return aTime - bTime;
			});
		}
	}

	// Schedule smart refresh: trigger when earliest bus departs (buses change), but ensure at least every minute
	if (currentRefreshTimeout) clearTimeout(currentRefreshTimeout);
	const timeUntilEarliestBus = earliestNextBusTime - Date.now();
	const refreshDelay = Math.max(Math.min(timeUntilEarliestBus, 60000), 10000); // Between 10s and 60s
	currentRefreshTimeout = setTimeout(loadNextBuses, refreshDelay);

	nextBuses.set(nextTrips);
	console.log("DONE LOADING NEXT BUSES")
}

let displayingTripID: string = '';
let displayingStop: { style: string; stop_id: string; stop_time: number } = {
	style: '',
	stop_id: '',
	stop_time: 0
};
let displayingMarkerStyles: string[] = [];

// Remember last display signature to avoid redundant re-renders
let lastDisplaySignature: string = '';
// Remember last known live marker position, bearing, and timestamp to avoid restarting animations
let liveMarkerMemory: { tripId: string; lat: number; lon: number; bearing: number; lastTs?: number } | undefined =
	undefined;
// Track which trip owns the running animation interval
let busMarkerTripId: string | undefined = undefined;

export async function displayCurrentTrip() {
	// Take currently selected trip id, filter next buses, if id not in next buses list, get bus at nextBusIndex from next buses list
	// display relevant markers and layers on map
	displayingMarkerStyles = [];
	// Get the route direction
	const direction = get(airportDirection) ? 'toAirport' : 'toCity';
	// Get the selected item, this will affect the state of our styles
	const highlighted = get(selected);
	// Get the selected stop, if a stop is selected
	const highlightStop =
		highlighted !== undefined && Object.hasOwn(highlighted, 'stop_id')
			? (highlighted as Stop)
			: undefined;
	const highlightTrip =
		highlighted !== undefined &&
		Object.hasOwn(highlighted, 'trip_id') &&
		!Object.hasOwn(highlighted, 'vehicle_id')
			? (highlighted as Trip)
			: undefined;
	// Get the highlighted LIVE trip, if a live trip is selected
	// const highlightLiveTrip =
	// 	highlighted !== undefined && Object.hasOwn(highlighted, 'vehicle_id')
	// 		? (highlighted as LiveTrip)
	// 		: undefined;
	const buses = get(nextBuses)[direction];
	const index = get(nextBusIndex);
	// Only cancel existing animation if the trip changes; otherwise preserve animation continuity
	const selectedTrip = get(selectedTripID);
	if (!selectedTrip) {
		clearTripLayers(true);
		return;
	}
	const tripFind = buses.find((val) => val.trip_id === selectedTrip);
	// If the selected/displaying trip is no longer in nextBuses, find its new index or reset gracefully
	if (!tripFind) {
		if (buses.length > 0) {
			// Try to keep the same index if it's still valid, otherwise clamp to valid range
			const newIndex = Math.min(Math.max(index, 0), buses.length - 1);
			// Only update if the index changed OR if we need to select a bus
			if (index !== newIndex || !selectedTrip) {
				nextBusIndex.set(newIndex);
			}
			selectedTripID.set(buses[newIndex].trip_id);
			return; // Will re-render with the new selection
		}
	}
	const currentTrip =
		tripFind !== undefined ? tripFind : buses.length > index ? buses[index] : null;
	if (currentTrip == null) {
		clearTripLayers();
		return;
	}
	const routeFind = get(transitFeedStore).routes.find(
		(route) => route.route_id === currentTrip.route_id
	);
	const currentRoute = routeFind !== undefined ? routeFind : null;
	if (currentRoute == null) {
		clearTripLayers();
		return;
	}
	if (currentTrip.trip_id !== displayingTripID) {
		clearTripLayers();
		await cancelAnimateBusMarker();
	}

	const loc = currentLocation();
	const boundCoordinates: [number, number][] = [[loc.longitude, loc.latitude]];
	type TripStopList = { stop: Stop; stop_time: Date }[];
	const tripStopIDS = currentTrip.stops.map((stop) => stop.stop_id);
	const days = Object.hasOwn(currentTrip, 'vehicle_id')
		? 0
		: currentTrip.stops[currentTrip.stops.length - 1].stop_date() < new Date()
			? 1
			: 0;
	const tripStops: TripStopList = currentRoute.stops
		.filter((val) => tripStopIDS.includes(val.stop_id))
		.map((value, index) => {
			return {
				stop: value,
				stop_time: new Date(currentTrip.stops[index].stop_date(undefined, days))
			};
		});
	const closestStop = await findClosestStop(loc, tripStops);
	boundCoordinates.push([closestStop.stop.stop_lon, closestStop.stop.stop_lat]);
	// let tripStopsFiltered = tripStops.filter(
	// 	(value) => value.stop.stop_id !== closestStop.stop.stop_id
	// );
	const walkLayer = highlighted === undefined ? 'THIN_BLACK_LINE' : 'THIN_GRAY_LINE';
	const stopsLayer =
		highlighted === undefined
			? Object.hasOwn(currentTrip, 'vehicle_id')
				? 'WHITE_BLUE_CIRCLE'
				: 'WHITE_BLACK_CIRCLE'
			: 'WHITE_GRAY_CIRCLE';
	const lineLayer =
		highlighted !== undefined
			? 'GRAY_LINE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BLUE_LINE'
				: 'BLACK_LINE';
	let tripStopsHighlight: undefined | { stop: Stop; stop_time: Date } = undefined;
	// Defer clearing layers until we know there are changes to display
	const vehicle = Object.hasOwn(currentTrip, 'vehicle_id')
		? get(liveTransitFeed).vehicles.find(
				(vehicle) => vehicle.vehicle_id === (currentTrip as LiveTrip).vehicle_id
			)
		: undefined;
	const vehicleEstimate = await getVehicleEstimate(currentTrip);

	// Build a lightweight signature to decide if we need to update layers/markers
	const highlightedSel = get(selected);
	const selKey =
		highlightedSel === undefined
			? 'none'
			: Object.hasOwn(highlightedSel as object, 'stop_id')
				? `stop:${(highlightedSel as Stop).stop_id}`
				: Object.hasOwn(highlightedSel as object, 'trip_id')
					? `trip:${(highlightedSel as Trip | LiveTrip).trip_id}`
					: 'other';
	const latestLiveTs = vehicle?.previous_locations?.length
		? new Date(vehicle.previous_locations[vehicle.previous_locations.length - 1].timestamp).getTime()
		: 0;
	const nextStaticTime = tripStops.find((v) => v.stop_time.getTime() > Date.now())?.stop_time.getTime() || 0;
	const displaySignature = `${currentTrip.trip_id}|${direction}|${selKey}|$${
		Object.hasOwn(currentTrip, 'vehicle_id') ? `live:${latestLiveTs}` : `static:${nextStaticTime}`
	}|${closestStop.stop.stop_id}|${closestStop.stop_time.getTime()}`;

	if (displaySignature === lastDisplaySignature) {
		// No changes to render; ensure marker remains at last known memory for live trips
		if (Object.hasOwn(currentTrip, 'vehicle_id') && liveMarkerMemory && liveMarkerMemory.tripId === currentTrip.trip_id) {
			updateBusMarker(
				Object.hasOwn(currentTrip, 'vehicle_id') ? 'BUS_LIVE' : 'BUS',
				get(transitFeedStore).routes.find((r) => r.route_id === currentTrip.route_id)?.route_short_name ?? '',
				liveMarkerMemory.lat,
				liveMarkerMemory.lon,
				() => {
					markerTapped = true;
					selected.set(currentTrip);
				},
				liveMarkerMemory.bearing
			);
		}
		// Skip clearing or re-drawing layers to avoid flicker/clears
		return;
	}
	const splitRes = await splitTrip(
		currentTrip,
		vehicle ? [vehicle.latitude, vehicle.longitude] : [vehicleEstimate.lat, vehicleEstimate.lon]
	);
	let stopsBefore = splitRes.stopsBefore
		.filter((v) => v.stop_id !== closestStop.stop.stop_id)
		.map((v) => ({
			stop: currentRoute.stops.find((va) => va.stop_id === v.stop_id)!,
			stop_time: new Date(v.stop_date(undefined, days))
		}));
	let stopsAfter = splitRes.stopsAfter
		.filter((v) => v.stop_id !== closestStop.stop.stop_id)
		.map((v) => ({
			stop: currentRoute.stops.find((va) => va.stop_id === v.stop_id)!,
			stop_time: new Date(v.stop_date(undefined, days))
		}));
	const geoJSONShapeAfter = geoJSONFromShape(splitRes.shapeAfter.map((v) => [v.lon, v.lat]));
	const geoJSONShapeBefore = geoJSONFromShape(splitRes.shapeBefore.map((v) => [v.lon, v.lat]));
	updateLayer(lineLayer, geoJSONShapeAfter);
	updateLayer(
		'GRAY_LINE',
		lineLayer === 'GRAY_LINE'
			? mergeGeoJSONSpecifications([geoJSONShapeBefore, geoJSONShapeAfter])
			: geoJSONShapeBefore
	);
	if (highlightStop !== undefined && highlightStop.stop_id !== closestStop.stop.stop_id) {
		tripStopsHighlight = [...stopsBefore, ...stopsAfter].find(
			(val) => val.stop.stop_id === highlightStop.stop_id
		);
		if (tripStopsHighlight !== undefined) {
			stopsBefore = stopsBefore.filter(
				// @ts-expect-error we already check for it being undefined
				(value) => value.stop.stop_id !== tripStopsHighlight.stop!.stop_id
			);
			stopsAfter = stopsAfter.filter(
				// @ts-expect-error we already check for it being undefined
				(value) => value.stop.stop_id !== tripStopsHighlight.stop!.stop_id
			);
			updateLayer(
				Object.hasOwn(currentTrip, 'vehicle_id') ? 'WHITE_BLUE_CIRCLE' : 'WHITE_BLACK_CIRCLE',
				geoJSONFromStops([tripStopsHighlight])
			);
			boundCoordinates.push([tripStopsHighlight.stop.stop_lon, tripStopsHighlight.stop.stop_lat]);
		}
	}
	updateLayer(stopsLayer, geoJSONFromStops(stopsAfter));
	updateLayer(
		'WHITE_GRAY_CIRCLE',
		stopsLayer === 'WHITE_GRAY_CIRCLE'
			? mergeGeoJSONSpecifications([geoJSONFromStops(stopsBefore), geoJSONFromStops(stopsAfter)])
			: geoJSONFromStops(stopsBefore)
	);
	// if(!highlighted) updateLayer('WHITE_GRAY_CIRCLE', geoJSONFromStops(tripStopsFiltered));
	updateLayer(
		walkLayer,
		await geoJsonWalkLineFromPoints(
			loc.latitude,
			loc.longitude,
			closestStop.stop.stop_lat,
			closestStop.stop.stop_lon
		)
	);
	const busStopStyle =
		highlighted !== undefined &&
		(highlightStop === undefined || closestStop.stop.stop_id !== highlightStop.stop_id)
			? 'BUS_STOP_INACTIVE'
			: vehicle
				? 'BUS_STOP_LIVE'
				: 'BUS_STOP';
	if (
		(displayingStop.stop_id !== closestStop.stop.stop_id &&
			displayingStop.stop_time !== closestStop.stop_time.getTime()) ||
		displayingTripID !== currentTrip.trip_id ||
		displayingStop.style !== busStopStyle
	) {
		updateMarker(
			busStopStyle,
			[
				closestStop.stop.stop_name[get(language)],
				closestStop.stop_time.toLocaleString(undefined, {
					hour12: false,
					minute: '2-digit',
					hour: '2-digit'
				})
			],
			closestStop.stop.stop_lat,
			closestStop.stop.stop_lon,
			() => {
				markerTapped = true;
				selected.set(closestStop.stop);
			}
		);
	}
	displayingMarkerStyles.push(busStopStyle);
	boundCoordinates.push(
		vehicle ? [vehicle.longitude, vehicle.latitude] : [vehicleEstimate.lon, vehicleEstimate.lat]
	);
	updateMarker(
		highlighted !== undefined &&
			(highlightTrip === undefined || highlightTrip.trip_id !== currentTrip.trip_id)
			? 'BUS_INACTIVE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BUS_LIVE'
				: 'BUS',
		[undefined, undefined],
		undefined,
		undefined
	);
	// Ensure bus highlight only when this trip is selected
	const liveLoc = vehicle ? vehicle.previous_locations.length > 1 ? vehicle.previous_locations[vehicle.previous_locations.length - 2] : vehicle.previous_locations[vehicle.previous_locations.length - 1] : undefined;
	const bearing = liveLoc ? liveLoc.bearing : vehicle ? vehicle.bearing : 0;
	updateBusMarker(
		highlighted !== undefined && highlightTrip !== undefined && highlightTrip.trip_id === currentTrip.trip_id
			? (Object.hasOwn(currentTrip, 'vehicle_id') ? 'BUS_LIVE' : 'BUS')
			: highlighted !== undefined
			? 'BUS_INACTIVE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BUS_LIVE'
				: 'BUS',
		currentRoute.route_short_name,
		liveLoc ? liveLoc.latitude : vehicleEstimate.lat,
		liveLoc ? liveLoc.longitude : vehicleEstimate.lon,
		() => {
			markerTapped = true;
			selected.set(currentTrip);
		},
		bearing
	);
	displayingMarkerStyles.push(
		highlighted !== undefined &&
			(highlightTrip === undefined || highlightTrip.trip_id !== currentTrip.trip_id)
			? 'BUS_INACTIVE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BUS_LIVE'
				: 'BUS'
	);
	clearTripLayers(true);
	renderPendingCollisions();
	if (displayingTripID !== currentTrip.trip_id) fitMapToPoints(boundCoordinates);
	displayingTripID = currentTrip.trip_id;
	displayingStop = {
		style: busStopStyle,
		stop_id: closestStop.stop.stop_id,
		stop_time: closestStop.stop_time.getTime()
	};
	displayingTrip.set(currentTrip);
	highlightedStop.set(closestStop.stop);
	await animateBusMarker(currentTrip, closestStop.stop);

	// Save the current display signature as last rendered
	lastDisplaySignature = displaySignature;
}

function toggleAirportDirectionInternal(
	direction: boolean | undefined = undefined,
	toggle: boolean = true,
	shouldCycleBus: boolean = true
) {
	const current = currentLocation();
	const airportDir = toggle ? get(airportDirection) : !get(airportDirection);
	if (
		haversineDistance(
			current.latitude,
			current.longitude,
			AIRPORT_SOFTLOCK[0],
			AIRPORT_SOFTLOCK[1]
		) <=
		AIRPORT_SOFTLOCK[2] * 1000
	)
		direction = false;
	const finalCon = direction === undefined ? !airportDir : direction;
	const previousDirection = get(airportDirection);

	// Only update if direction actually changed or if explicitly toggling
	if (previousDirection !== finalCon || toggle) {
		airportDirection.set(finalCon);
		const busIndex = get(nextBusIndex);
		const buses = get(nextBuses);
		nextBusIndex.set(
			busIndex === -1
				? -1
				: buses[finalCon ? 'toCity' : 'toAirport'].length >= busIndex
					? buses[finalCon ? 'toCity' : 'toAirport'].length - 1
					: busIndex
		);

		// Only cycle bus if requested (for manual toggles, not location updates)
		if (shouldCycleBus) {
			selectedTripID.set(undefined);
			cycleBus();
		}
	}
}

// Public wrapper for non-location-based triggers
export function toggleAirportDirection(
	direction: boolean | undefined = undefined,
	toggle: boolean = true
) {
	toggleAirportDirectionInternal(direction, toggle, true);
}

// Throttled wrapper for user location changes only
// This should ONLY update direction if near airport, NOT cycle buses
function toggleAirportDirectionThrottled() {
	const now = Date.now();
	const loc = currentLocation();

	// Use same throttling logic as loadNextBuses
	const timeSinceLastLoad = now - lastLoadNextBusesTime;
	if (timeSinceLastLoad < 60000) {
		if (lastLoadNextBusesLocation) {
			const distance = haversineDistance(
				loc.latitude,
				loc.longitude,
				lastLoadNextBusesLocation.lat,
				lastLoadNextBusesLocation.lon
			);
			if (distance < 50) {
				// Too soon and too close - skip
				return;
			}
		}
	}

	// Check if direction needs updating based on airport proximity
	// Do NOT cycle buses - just update direction if needed
	toggleAirportDirectionInternal(undefined, false, false);
}

nextBuses.subscribe(displayCurrentTrip);
selectedTripID.subscribe(displayCurrentTrip);
selected.subscribe(displayCurrentTrip);
// airportDirection.subscribe(displayCurrentTrip);
inputLocation.subscribe(loadNextBuses);
userLocation.subscribe(loadNextBusesThrottled); // Throttled for user location changes
transitFeedStore.subscribe(loadNextBuses);
liveTransitFeed.subscribe(loadNextBuses);
inputLocation.subscribe(() => toggleAirportDirection(undefined, false));
userLocation.subscribe(toggleAirportDirectionThrottled); // Throttled for user location changes

let changeLocationTimeout: NodeJS.Timeout | undefined = undefined;
let circleTimer: HTMLElement | undefined = undefined;
let circleTimeout: NodeJS.Timeout | undefined = undefined;
let locationChanged = false;

export function handleTouchStart(e: MapTouchEvent | MapMouseEvent) {
	if (changeLocationTimeout || circleTimer || circleTimeout) {
		return;
	}
	if (e.originalEvent instanceof MouseEvent) {
		if ((e.originalEvent as MouseEvent).button !== 0) return; // Ensure left mouse click
	}
	circleTimeout = setTimeout(() => {
		circleTimer = document.createElement('div');
		circleTimer.innerHTML = `
		      <svg class="w-8 h-8 -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="45" class="text-gray-200"
                stroke="currentColor" stroke-width="10" fill="none"></circle>
        <circle cx="50" cy="50" r="40" pathLength="100"
                class="text-black"
                stroke="currentColor" stroke-width="15" stroke-linecap="round" fill="none"
                stroke-dasharray="100" stroke-dashoffset="100">
          <animate attributeName="stroke-dashoffset" from="100" to="0" dur="1s" fill="freeze"></animate>
        </circle>
      </svg>
		`;
		document.getElementById('map')?.appendChild(circleTimer);
		circleTimer.className =
			'fixed left-0 top-0 -translate-x-1/2 -translate-y-1/2 pointer-events-none';
		circleTimer.style.left = `${e.point.x + 25}px`;
		circleTimer.style.top = `${e.point.y - 25}px`;
		circleTimer.style.zIndex = '100';
		clearTimeout(circleTimeout);
		circleTimeout = undefined;
	}, 500);

	changeLocationTimeout = setTimeout(() => {
		inputLocation.set({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
		locationChanged = true;
		// cycleBus();
		clearTimeout(changeLocationTimeout);
		changeLocationTimeout = undefined;
		if (circleTimer) circleTimer.remove();
		circleTimer = undefined;
	}, 1500); // 1.5 second later change input location
}

export function handleTouchEnd(
	_:
		| MapTouchEvent
		| MapMouseEvent
		| ({ type: 'move'; target: MapboxMap } & {
				originalEvent?: MouseEvent | TouchEvent | WheelEvent | undefined;
		  })
) {
	if (changeLocationTimeout) {
		clearTimeout(changeLocationTimeout);
		changeLocationTimeout = undefined;
	}
	if (circleTimeout) {
		clearTimeout(circleTimeout);
		circleTimeout = undefined;
	}
	if (circleTimer) {
		circleTimer.remove();
		circleTimer.style.visibility = 'hidden';
		circleTimer = undefined;
	}
}

export function handleTap(e: MapMouseEvent) {
	if (markerTapped) {
		markerTapped = false;
		return;
	}
	const inputLoc = get(inputLocation);
	if (
		!locationChanged &&
		inputLoc &&
		haversineDistance(e.lngLat.lat, e.lngLat.lng, inputLoc.latitude, inputLoc.longitude) <= 75
	) {
		if (!get(userLocation))
			inputLocation.set({ latitude: DEFAULT_LOCATION[0], longitude: DEFAULT_LOCATION[1] });
		else inputLocation.set(undefined);
		return;
	}
	locationChanged = false;
	const r = 6;
	const bbox: [PointLike, PointLike] = [
		[e.point.x - r, e.point.y - r],
		[e.point.x + r, e.point.y + r]
	];
	const features = e.target
		.queryRenderedFeatures(bbox)
		.filter((feature) => feature.layer !== undefined && tappableLayers.includes(feature.layer.id));
	// const point = e.lngLat;
	if (get(selected) !== undefined) {
		selected.set(undefined);
		return;
	}
	const transitFeed = get(transitFeedStore);
	const liveFeed = get(liveTransitFeed);
	let tapped: Trip | LiveTrip | Stop | undefined = undefined;
	for (const feature of features) {
		if (feature.properties === null) continue;
		if (Object.hasOwn(feature.properties, 'stop_id')) {
			tapped = transitFeed.stops[feature.properties.stop_id];
			break;
		}
		if (Object.hasOwn(feature.properties, 'route_id')) {
			if (
				Object.hasOwn(feature.properties, 'trip_id') &&
				Object.hasOwn(feature.properties, 'live')
			) {
				if (feature.properties['live'] === true)
					tapped = liveFeed.trips.find((value) => value.trip_id === feature.properties?.trip_id);
				else
					tapped = transitFeed.routes
						.find((value) => value.route_id === feature.properties?.route_id)
						?.trips?.find((value) => value.trip_id === feature.properties?.trip_id);
			}
		}
	}
	selected.set(tapped);
}

function geoJSONFromShape(
	shape: [number, number][],
	route?: Route,
	trip?: Trip | LiveTrip
): GeoJSONSourceSpecification {
	const geojson: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: shape
				},
				properties: {
					route_id: route !== undefined ? route.route_id : '',
					trip_id: trip !== undefined ? trip.trip_id : '',
					live: trip !== undefined ? Object.hasOwn(trip, 'vehicle_id') : false
				}
			}
		]
	};
	return { type: 'geojson', data: geojson };
}

async function geoJsonWalkLineFromPoints(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): Promise<GeoJSONSourceSpecification> {
	const geojson: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: (await getTravelRoute([lng1, lat1], [lng2, lat2]))['routes'][0]['geometry'],
				properties: {}
			}
		]
	};
	return { type: 'geojson', data: geojson };
}

function geoJSONFromStops(stops: { stop: Stop; stop_time: Date }[]): GeoJSONSourceSpecification {
	const geojson: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: stops.map((val) => ({
			type: 'Feature',
			geometry: {
				type: 'Point',
				coordinates: [val.stop.stop_lon, val.stop.stop_lat]
			},
			properties: {
				label: val.stop_time.toLocaleString(undefined, {
					hour12: false,
					minute: '2-digit',
					hour: '2-digit'
				}),
				stop_id: val.stop.stop_id
			}
		}))
	};
	// console.log(geojson);
	return { type: 'geojson', data: geojson };
}

function clearTripLayers(cleanupMarkers: boolean = false) {
	removeRenderedCollisions();
	for (const style of Object.keys(MAP_STYLES)) {
		if (style.toUpperCase().includes('LOCATION')) continue;
		if (MAP_STYLES[style].type == 1 && (!cleanupMarkers || !displayingMarkerStyles.includes(style)))
			updateMarker(style, [undefined, undefined], undefined, undefined);
		if (MAP_STYLES[style].type == 0 && !cleanupMarkers) updateLayer(style, undefined);
	}
}

async function travelTime(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
	mode: NavMode = 'walking'
) {
	const from: [number, number] = [lng1, lat1];
	const to: [number, number] = [lng2, lat2];
	const data = await getTravelRoute(from, to, mode);
	if (data['routes'] === undefined || data['routes'].length === 0) return -1;
	return data['routes'][0]['duration'] as number;
}

async function travelDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
	mode: NavMode = 'walking'
) {
	const from: [number, number] = [lng1, lat1];
	const to: [number, number] = [lng2, lat2];
	const data = await getTravelRoute(from, to, mode);
	if (data['routes'] === undefined || data['routes'].length === 0)
		return haversineDistance(lat1, lng1, lat2, lng2);
	return data['routes'][0]['distance'] as number;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371; // Earth radius in km
	const dLat = (lat2 - lat1) * (Math.PI / 180);
	const dLng = (lng2 - lng1) * (Math.PI / 180);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000; // meters
}

// Calculate bearing (direction) from point 1 to point 2 in degrees (0 = north, 90 = east)
function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const dLng = (lng2 - lng1) * (Math.PI / 180);
	const lat1Rad = lat1 * (Math.PI / 180);
	const lat2Rad = lat2 * (Math.PI / 180);

	const y = Math.sin(dLng) * Math.cos(lat2Rad);
	const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
			  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

	let bearing = Math.atan2(y, x) * (180 / Math.PI);
	// Normalize to 0-360 range
	bearing = (bearing + 360) % 360;
	return bearing;
}

// Get bearing for static trip by looking at next shape point ahead
function getBearingForStaticTrip(trip: Trip, currentLat: number, currentLon: number): number {
	const transitFeed = get(transitFeedStore);
	const route = transitFeed.routes.find((r: Route) => r.trips.some((t) => t.trip_id === trip.trip_id));
	const shape = route?.shape;

	if (!shape || shape.length < 2) return 0;

	// Find closest shape point to current position
	const currentShapeIdx = nearestShapeIndex(shape, [currentLat, currentLon]);

	// Look ahead for next shape point (or use next point if at end)
	const nextIdx = Math.min(currentShapeIdx + 1, shape.length - 1);

	// If we're at the last point, look back to previous point for direction
	if (currentShapeIdx === shape.length - 1 && shape.length > 1) {
		const prevPoint = shape[shape.length - 2];
		const currentPoint = shape[shape.length - 1];
		return calculateBearing(prevPoint.lat, prevPoint.lon, currentPoint.lat, currentPoint.lon);
	}

	// Calculate bearing from current position to next shape point
	const nextPoint = shape[nextIdx];
	return calculateBearing(currentLat, currentLon, nextPoint.lat, nextPoint.lon);
}

async function findClosestStop(
	loc: InputCoords | GeolocationCoordinates,
	tripStops: {
		stop: Stop;
		stop_time: Date;
	}[]
) {
	// console.log("FIND CLOSEST STOP")
	const distances = await Promise.all(
		tripStops.map(async (tripStop) => {
			const distance = await travelDistance(
				loc.latitude,
				loc.longitude,
				tripStop.stop.stop_lat,
				tripStop.stop.stop_lon
			);
			return { tripStop, distance };
		})
	);
	// console.log(distances);
	return distances.reduce((min, curr) => (curr.distance < min.distance ? curr : min)).tripStop;
}

async function filterLocationsByRange(
	masterLat: number,
	masterLng: number,
	locations: Stop[],
	rangeKm: number
): Promise<Stop[]> {
	// Step 1: Calculate all distances asynchronously
	const distances = await Promise.all(
		locations.map(async (loc) => {
			const distance = haversineDistance(masterLat, masterLng, loc.stop_lat, loc.stop_lon); // Using haversineDistance for rough estimates
			return { ...loc, distance };
		})
	);

	// Step 2: Filter within range
	const withinRange = distances.filter((loc) => loc.distance <= rangeKm * 1000);

	// Step 3: Return based on number of matching locations
	if (withinRange.length <= 1) {
		return distances
			.sort((a, b) => a.distance - b.distance)
			.slice(0, 5)
			.map(({ distance: _, ...rest }) => rest); // remove distance field
	}

	return withinRange.map(({ distance: _, ...rest }) => rest);
}

function nearestShapeIndex(shape: { lat: number; lon: number }[], coord: [number, number]): number {
	let bestIdx = 0;
	let bestDist = Infinity;
	for (let i = 0; i < shape.length; i++) {
		const d = haversineDistance(shape[i].lat, shape[i].lon, coord[0], coord[1]);
		if (d < bestDist) {
			bestDist = d;
			bestIdx = i;
		}
	}
	return bestIdx;
}

type SplitTripResult = {
	splitIndex: number; // index in shape where we split
	shapeBefore: { lat: number; lon: number }[];
	shapeAfter: { lat: number; lon: number }[];
	stopsBefore: Trip['stops']; // in original trip order
	stopsAfter: Trip['stops'];
	matchedStopShapeIndex: Record<string, number>; // stop_id -> shape index
	lastPastStopIndex: number | null; // by stop_date() vs now
	nextUpcomingStopIndex: number | null; // by stop_date() vs now
};

async function splitTrip(
	trip: Trip | LiveTrip,
	position: [number, number]
): Promise<SplitTripResult> {
	const transitFeed = get(transitFeedStore);
	const route = transitFeed.routes.find((r: Route) =>
		r.trips.some((t: Trip) => t.trip_id === trip.trip_id)
	);
	const shape = route?.shape;
	if (!shape || shape.length === 0) throw Error(`Expected to find shape for trip ${trip.trip_id}`);

	const stopsOrdered: Stop[] = (trip.stops || [])
		.map((st) => transitFeed.stops[st.stop_id])
		.filter(Boolean);
	if (stopsOrdered.length === 0) {
		// We can still split the shape by position even if there are no stops found
	}

	// 1) Match stops to shape points
	const matchedStopShapeIndex: Record<string, number> = {};
	for (let i = 0; i < stopsOrdered.length; i++) {
		const s = stopsOrdered[i];
		matchedStopShapeIndex[s.stop_id] = nearestShapeIndex(shape, [s.stop_lat, s.stop_lon]);
	}

	// 2) Match provided position to a shape point.
	const splitIndex = nearestShapeIndex(shape, position);

	// 3) Split shape at matched point.
	// Include the split vertex in both halves so they "touch".
	const shapeBefore = shape.slice(0, splitIndex + 1);
	const shapeAfter = shape.slice(splitIndex);

	// 4) Split stops depending on which shape matches are in which split.
	// Keep original trip stop order.
	const stopsBefore = trip.stops.filter((st) => {
		const idx = matchedStopShapeIndex[st.stop_id];
		return idx !== undefined && idx <= splitIndex;
	});
	const stopsAfter = trip.stops.filter((st) => {
		const idx = matchedStopShapeIndex[st.stop_id];
		return idx !== undefined && idx > splitIndex;
	});

	// Use stop_date() to classify last past & next upcoming stops relative to "now"
	// Properly handle midnight trips by calculating the correct days offset per stop
	const now = new Date();
	let lastPastStopIndex: number | null = null;
	let nextUpcomingStopIndex: number | null = null;
	
	// Check if trip crosses midnight by comparing first and last stop times
	const firstStopDate = trip.stops[0].stop_date(undefined, 0);
	const lastStopDate = trip.stops[trip.stops.length - 1].stop_date(undefined, 0);
	const tripCrossesMidnight = firstStopDate > lastStopDate;
	
	for (let i = 0; i < trip.stops.length; i++) {
		let sd: Date;
		if (Object.hasOwn(trip, 'vehicle_id')) {
			// LiveTrip doesn't take parameters for stop_date
			sd = trip.stops[i].stop_date();
		} else {
			// Trip takes optional parameters - calculate days offset for this specific stop
			let days = 0;
			if (tripCrossesMidnight) {
				// Determine if this stop is "before midnight" or "after midnight" based on stop time
				const stopHour = parseInt(trip.stops[i].stop_time.split(':')[0]);
				const isStopAfterMidnight = stopHour >= 0 && stopHour < 12;
				
				// If now is past midnight (0-11 AM) and this stop is before midnight (12+ PM), use days=-1
				if (now.getHours() >= 0 && now.getHours() < 12 && !isStopAfterMidnight) {
					days = -1;
				}
				// If now is before midnight (12+ PM) and this stop is after midnight (0-11 AM), use days=1
				else if (now.getHours() >= 12 && isStopAfterMidnight) {
					days = 1;
				}
			}
			sd = trip.stops[i].stop_date(undefined, days);
		}
		if (sd <= now) lastPastStopIndex = i;
		if (sd > now && nextUpcomingStopIndex === null) {
			nextUpcomingStopIndex = i;
		}
	}

	// If the trip has not started yet, ensure "before" sections are empty
	if (lastPastStopIndex === null) {
		return {
			splitIndex: 0,
			shapeBefore: [],
			shapeAfter: shape,
			stopsBefore: [],
			stopsAfter: trip.stops,
			matchedStopShapeIndex,
			lastPastStopIndex,
			nextUpcomingStopIndex
		};
	}

	return {
		splitIndex,
		shapeBefore,
		shapeAfter,
		stopsBefore,
		stopsAfter,
		matchedStopShapeIndex,
		lastPastStopIndex,
		nextUpcomingStopIndex
	};
}

function clamp01(x: number) {
	if (x < 0) return 0;
	if (x > 1) return 1;
	return x;
}

async function getVehicleEstimate(trip: Trip): Promise<{ lat: number; lon: number }> {
	const transitFeed = get(transitFeedStore);
	
	const shape = transitFeed.routes.find((v: Route) =>
		v.trips.some((t) => t.trip_id === trip.trip_id)
	)?.shape;

	const stops = trip.stops.map((v) => ({
		stop_date: v.stop_date,
		time: v.stop_time,
		stop: transitFeed.stops[v.stop_id]
	}));

	if (!shape || shape.length === 0) throw Error(`Expected to find shape for trip ${trip.trip_id}`);
	if (!stops.length) throw Error(`Expected to find stops for trip ${trip.trip_id}`);

	// Check if trip crosses midnight
	const firstStopDate = trip.stops[0].stop_date(undefined, 0);
	const lastStopDate = trip.stops[trip.stops.length - 1].stop_date(undefined, 0);
	const tripCrossesMidnight = firstStopDate > lastStopDate;

	// 1) Match stops to shape points
	const stopInfos = stops
		.map((s, idx) => {
			if (!s.stop) return null;
			const shapeIdx = nearestShapeIndex(shape, [s.stop.stop_lat, s.stop.stop_lon]);
			
			// Calculate days offset for this specific stop
			let days = 0;
			if (tripCrossesMidnight) {
				// const stopDate = s.stop_date(undefined, 0);
				const now = new Date();
				
				// Determine if this stop is "before midnight" or "after midnight" based on stop time
				// Stops with hours >= 0 and < 12 are considered "after midnight" (next day)
				// Stops with hours >= 12 are considered "before midnight" (same day)
				const stopHour = parseInt(s.time.split(':')[0]);
				const isStopAfterMidnight = stopHour >= 0 && stopHour < 12;
				
				// If now is past midnight (0-11 AM) and this stop is before midnight (12+ PM), use days=-1
				if (now.getHours() >= 0 && now.getHours() < 12 && !isStopAfterMidnight) {
					days = -1;
				}
				// If now is before midnight (12+ PM) and this stop is after midnight (0-11 AM), use days=1
				else if (now.getHours() >= 12 && isStopAfterMidnight) {
					days = 1;
				}
			}
			
			const when = s.stop_date(undefined, days);
			return {
				i: idx,
				stop_id: s.stop.stop_id,
				shapeIdx,
				when
			};
		})
		.filter(Boolean) as { i: number; stop_id: string; shapeIdx: number; when: Date }[];

	if (!stopInfos.length)
		throw new Error(
			`Expected to construct stopInfo list for trip ${trip.trip_id}, got empty list instead.`
		);

	// Ensure chronological order by their scheduled Date (in case input isn't strictly sorted)
	stopInfos.sort((a, b) => a.when.getTime() - b.when.getTime());

	const now = new Date();
	const EXACT_MATCH_EPS = 15 * 1000; // 15s window

	// 2) Determine pass point based on schedule. If exact match, return the matched shape location.
	for (const s of stopInfos) {
		if (Math.abs(s.when.getTime() - now.getTime()) <= EXACT_MATCH_EPS) {
			const p = shape[s.shapeIdx];
			return { lat: p.lat, lon: p.lon };
		}
	}

	// Find last passed stop and next upcoming stop
	let lastIdx = -1;
	for (let i = 0; i < stopInfos.length; i++) {
		if (stopInfos[i].when.getTime() <= now.getTime()) lastIdx = i;
		else break;
	}

	// Edge cases: before first stop or after last stop
	if (lastIdx < 0) {
		const p = shape[0];
		return { lat: p.lat, lon: p.lon };
	}
	if (lastIdx >= stopInfos.length - 1) {
		const last = stopInfos[stopInfos.length - 1];
		const p = shape[last.shapeIdx];
		return { lat: p.lat, lon: p.lon };
	}

	const passed = stopInfos[lastIdx];
	const upcoming = stopInfos[lastIdx + 1];

	// 4) Extract points between passed and upcoming (in shape order).
	let startIdx = passed.shapeIdx;
	let endIdx = upcoming.shapeIdx;

	// Handle potential reverse ordering due to snapping noise
	let forward = true;
	if (startIdx > endIdx) {
		forward = false;
		[startIdx, endIdx] = [endIdx, startIdx];
	}

	// If both map to the same vertex, just return that vertex
	if (startIdx === endIdx) {
		const p = shape[startIdx];
		return { lat: p.lat, lon: p.lon };
	}

	const segPoints = shape.slice(startIdx, endIdx + 1);
	if (!forward) segPoints.reverse();

	// 5) Divide time difference based on distance
	// Compute cumulative distances along segPoints
	const dists: number[] = [0];
	for (let i = 0; i < segPoints.length - 1; i++) {
		const a = segPoints[i];
		const b = segPoints[i + 1];
		dists.push(dists[dists.length - 1] + haversineDistance(a.lat, a.lon, b.lat, b.lon));
	}
	const totalDist = dists[dists.length - 1];

	// If zero distance (degenerate), just return start
	if (totalDist <= 0) {
		const p0 = segPoints[0];
		return { lat: p0.lat, lon: p0.lon };
	}

	const t0 = passed.when.getTime();
	const t1 = upcoming.when.getTime();
	const ratio = clamp01((now.getTime() - t0) / (t1 - t0));
	const targetDist = ratio * totalDist;

	// 6) Interpolate along the shape to the target distance
	let k = 0;
	while (k < dists.length - 1 && dists[k + 1] < targetDist) k++;

	const segLen = dists[k + 1] - dists[k];
	if (segLen <= 0) {
		const p = segPoints[k];
		return { lat: p.lat, lon: p.lon };
	}

	const alpha = (targetDist - dists[k]) / segLen;
	const A = segPoints[k];
	const B = segPoints[k + 1];

	const lat = A.lat + alpha * (B.lat - A.lat);
	const lon = A.lon + alpha * (B.lon - A.lon);

	return { lat: lat, lon: lon };
}

function mergeGeoJSONSpecifications(
	jsons: GeoJSONSourceSpecification[]
): GeoJSONSourceSpecification {
	const features = jsons.flatMap((j) => (j.data as GeoJSON.FeatureCollection).features);
	return {
		type: 'geojson',
		data: {
			type: 'FeatureCollection',
			features: features
		}
	};
}

async function animateBusMarker(trip: Trip | LiveTrip, closestStop: Stop) {
	// Change location every 50 ms, for live trips make assumptions of next positions
	// If an animation is already running for this trip, do not restart it (prevents re-animation on re-renders)
	if (busMarkerInterval && busMarkerTripId === trip.trip_id) return;
	// If an animation is running for a different trip, cancel it
	if (busMarkerInterval && busMarkerTripId !== trip.trip_id) await cancelAnimateBusMarker();
	busMarkerTripId = trip.trip_id;

	// Helper to clamp values between min and max
	const clamp = (x: number, min: number, max: number) => (x < min ? min : x > max ? max : x);

	// Cache route for label and shape updates
	const transitFeed = get(transitFeedStore);
	const route = transitFeed.routes.find((r: Route) => r.route_id === trip.route_id);
	const routeShortName = route?.route_short_name ?? '';

	// Helper for computing style names consistent with displayCurrentTrip
	function computeStyles() {
		const highlighted = get(selected);
		const highlightStop =
			highlighted !== undefined && Object.hasOwn(highlighted, 'stop_id')
				? (highlighted as Stop)
		: undefined;
		const highlightTrip =
			highlighted !== undefined &&
			Object.hasOwn(highlighted, 'trip_id') &&
			!Object.hasOwn(highlighted, 'vehicle_id')
				? (highlighted as Trip)
				: undefined;

		const isLive = Object.hasOwn(trip, 'vehicle_id');
		const lineLayer = highlighted !== undefined ? 'GRAY_LINE' : isLive ? 'BLUE_LINE' : 'BLACK_LINE';
		const stopsLayer =
			highlighted === undefined ? (isLive ? 'WHITE_BLUE_CIRCLE' : 'WHITE_BLACK_CIRCLE') : 'WHITE_GRAY_CIRCLE';
		if (stopsLayer === 'WHITE_GRAY_CIRCLE') {
			const highlighted = get(selected);
			if (!highlighted || !Object.hasOwn(highlighted, 'stop_id')) {
				updateLayer('WHITE_BLUE_CIRCLE', undefined);
				updateLayer('WHITE_BLACK_CIRCLE', undefined);
			}
			updateLayer('BLACK_LINE', undefined);
			updateLayer('BLUE_LINE', undefined);
		}

		const busStyle =
			highlighted !== undefined && (highlightStop !== undefined || (highlightTrip && highlightTrip.trip_id !== trip.trip_id))
				? 'BUS_INACTIVE'
				: isLive
					? 'BUS_LIVE'
					: 'BUS';

		return { lineLayer, stopsLayer, busStyle } as const;
	}

	// Animation state
	let fromLat = 0;
	let fromLon = 0;
	let toLat = 0;
	let toLon = 0;
	let animStart = 0;
	let animDuration = 0; // ms
	let haveActiveAnimation = false;

	// Control cadence for geojson shape updates (every ~4s max)
	let lastGeojsonUpdate = 0;

	// Live bus tracking state
	let lastLiveTimestampMs: number | undefined = undefined;

	// For static trip estimation cadence
	let lastEstimate: { lat: number; lon: number } | undefined = undefined;
	let lastEstimateTime = 0;

	// Cache the bus style to prevent flickering (only update on selection changes)
	let cachedBusStyle: 'BUS' | 'BUS_LIVE' | 'BUS_INACTIVE' = Object.hasOwn(trip, 'vehicle_id') ? 'BUS_LIVE' : 'BUS';
	let lastSelectionState: string = 'none';

	const FRAMERATE_MS = 100; // smooth enough without being heavy
	const GEOJSON_UPDATE_MS = 4000; // update line layers every 4s
	const ESTIMATE_INTERVAL_MS = 200; // refresh estimates every 1s for smoother marker animation
	let WAIT_MS = 500;

	busMarkerInterval = setInterval(async () => {
		// Check if selection state changed - if so, update cached bus style
		const highlighted = get(selected);
		const currentSelectionState = highlighted === undefined
			? 'none'
			: Object.hasOwn(highlighted as object, 'stop_id')
				? `stop:${(highlighted as Stop).stop_id}`
				: Object.hasOwn(highlighted as object, 'trip_id')
					? `trip:${(highlighted as Trip | LiveTrip).trip_id}`
					: 'other';

		if (currentSelectionState !== lastSelectionState) {
			// Selection changed - recalculate bus style
			const { busStyle } = computeStyles();
			cachedBusStyle = busStyle;
			lastSelectionState = currentSelectionState;
		}

		// Determine whether this is a live trip
		const isLive = Object.hasOwn(trip, 'vehicle_id');

		if (isLive) {
			const liveBus = get(liveTransitFeed).vehicles.find(
				(e) => (trip as LiveTrip).vehicle_id === e.vehicle_id
			);

			if (liveBus) {
				const hist = liveBus.previous_locations || [];
				const latest = hist.length > 0 ? hist[hist.length - 1] : undefined;
				const prev = hist.length > 1 ? hist[hist.length - 2] : undefined;
				if(WAIT_MS > 0) {
					WAIT_MS -= FRAMERATE_MS;
					return;
				}
				const latestTs = latest ? new Date(latest.timestamp).getTime() : undefined;
				// If we have a new latest point, set up a fresh animation from prev -> latest
				if (
					latest && prev && (lastLiveTimestampMs === undefined || latestTs! > lastLiveTimestampMs)
				) {
					fromLat = prev.latitude;
					fromLon = prev.longitude;
					toLat = latest.latitude;
					toLon = latest.longitude;
					const dist = haversineDistance(fromLat, fromLon, toLat, toLon); // meters
					animDuration = clamp(dist, 400, 3000); // ~1ms per meter, clamped
					animStart = Date.now();
					haveActiveAnimation = true;
					lastLiveTimestampMs = latestTs;

					// Update line (and if needed, circle) layers immediately to the latest location
					try {
						const split = await splitTrip(trip, [toLat, toLon]);
						const { lineLayer, stopsLayer } = computeStyles();
						const geoAfter = geoJSONFromShape(split.shapeAfter.map((v) => [v.lon, v.lat]));
						const geoBefore = geoJSONFromShape(split.shapeBefore.map((v) => [v.lon, v.lat]));
						// Ensure lines are drawn before circles by updating lines first
						if(stopsLayer !== 'WHITE_GRAY_CIRCLE') updateLayer(lineLayer, geoAfter);
						updateLayer('GRAY_LINE', stopsLayer === 'WHITE_GRAY_CIRCLE' ? mergeGeoJSONSpecifications([geoBefore, geoAfter]) : geoBefore);

						// If style requires, also update circles so they stay above lines with correct color
						if (route) {
							const days = Object.hasOwn(trip, 'vehicle_id')
								? 0
								: (trip as Trip).stops[(trip as Trip).stops.length - 1].stop_date() < new Date()
									? 1
									: 0;
							const stopsAfter = split.stopsAfter.map((v) => ({
								stop: route.stops.find((va) => va.stop_id === v.stop_id)!,
								stop_time: new Date(v.stop_date(undefined, days))
							})).filter((v) => v.stop.stop_id != closestStop.stop_id);
							const stopsBefore = split.stopsBefore.map((v) => ({
								stop: route.stops.find((va) => va.stop_id === v.stop_id)!,
								stop_time: new Date(v.stop_date(undefined, days))
							})).filter((v) => v.stop.stop_id != closestStop.stop_id);
							const _sel1 = get(selected);
							const selectedStop = _sel1 && Object.hasOwn(_sel1 as object, 'stop_id') ? (_sel1 as Stop) : undefined;
							if(stopsLayer !== 'WHITE_GRAY_CIRCLE')
								updateLayer(stopsLayer, geoJSONFromStops(stopsAfter));
							else updateLayer(isLive ? 'WHITE_BLUE_CIRCLE' : 'WHITE_BLACK_CIRCLE', geoJSONFromStops([...stopsBefore, ...stopsAfter].filter((v) => selectedStop && v.stop.stop_id === selectedStop.stop_id)));
							updateLayer(
								'WHITE_GRAY_CIRCLE',
								stopsLayer === 'WHITE_GRAY_CIRCLE'
									? mergeGeoJSONSpecifications([
										geoJSONFromStops(
											stopsBefore.filter(
												(v) => !selectedStop || (selectedStop && selectedStop.stop_id !== v.stop.stop_id))),
										geoJSONFromStops(
											stopsAfter.filter(
												(v) => !selectedStop || (selectedStop && selectedStop.stop_id !== v.stop.stop_id)))])
									: geoJSONFromStops(stopsBefore)
							);
						}
						if (stopsLayer === 'WHITE_GRAY_CIRCLE') {
							const highlighted = get(selected);
							if (!highlighted || !Object.hasOwn(highlighted, 'stop_id')) {
								updateLayer('WHITE_BLUE_CIRCLE', undefined);
								updateLayer('WHITE_BLACK_CIRCLE', undefined);
							}
							updateLayer('BLACK_LINE', undefined);
							updateLayer('BLUE_LINE', undefined);
						}
						lastGeojsonUpdate = Date.now();
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
					} catch (_) {
						// ignore split errors; marker animation still proceeds
					}
				}

				// Compute current interpolated position
				let curLat = liveBus.latitude;
				let curLon = liveBus.longitude;
				if (haveActiveAnimation) {
					const t = clamp((Date.now() - animStart) / (animDuration || 1), 0, 1);
					curLat = fromLat + (toLat - fromLat) * t;
					curLon = fromLon + (toLon - fromLon) * t;
					if (t >= 1) haveActiveAnimation = false;
				}

				// Use cached bus style to prevent flickering
				// Get bearing from current vehicle or latest location
				const bearing = latest ? latest.bearing : liveBus.bearing;
				updateBusMarker(cachedBusStyle, routeShortName, curLat, curLon, () => {
					markerTapped = true;
					selected.set(trip);
				}, bearing);

				// Remember last live marker position and bearing
				liveMarkerMemory = { tripId: (trip as LiveTrip).trip_id, lat: curLat, lon: curLon, bearing, lastTs: lastLiveTimestampMs };
			}
		} else {
			// Static trip: continuously animate marker using scheduled estimate.
			const now = Date.now();
			if (!lastEstimate || now - lastEstimateTime >= ESTIMATE_INTERVAL_MS) {
				try {
					const newEstimate = await getVehicleEstimate(trip as Trip);
					if (lastEstimate) {
						// set up animation from last -> new
						fromLat = lastEstimate.lat;
						fromLon = lastEstimate.lon;
						toLat = newEstimate.lat;
						toLon = newEstimate.lon;
						const dist = haversineDistance(fromLat, fromLon, toLat, toLon);
						animDuration = clamp(dist, 400, 3000);
						animStart = now;
						haveActiveAnimation = true;
					}
					lastEstimate = newEstimate;
					lastEstimateTime = now;
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				} catch (_) {
					// ignore estimate errors
				}
			}

			// Update line layers at most every 4 seconds using the latest estimate
			if (lastEstimate && now - lastGeojsonUpdate >= GEOJSON_UPDATE_MS) {
				try {
					const split = await splitTrip(trip, [lastEstimate.lat, lastEstimate.lon]);
					const { lineLayer, stopsLayer } = computeStyles();
					const geoAfter = geoJSONFromShape(split.shapeAfter.map((v) => [v.lon, v.lat]));
					const geoBefore = geoJSONFromShape(split.shapeBefore.map((v) => [v.lon, v.lat]));
					if(stopsLayer !== 'WHITE_GRAY_CIRCLE') updateLayer(lineLayer, geoAfter);
					updateLayer('GRAY_LINE', stopsLayer === 'WHITE_GRAY_CIRCLE' ? mergeGeoJSONSpecifications([geoBefore, geoAfter]) : geoBefore);

					if (route) {
						const days = Object.hasOwn(trip, 'vehicle_id')
							? 0
							: (trip as Trip).stops[(trip as Trip).stops.length - 1].stop_date() < new Date()
								? 1
								: 0;
						const stopsAfter = split.stopsAfter.map((v) => ({
							stop: route.stops.find((va) => va.stop_id === v.stop_id)!,
							stop_time: new Date(v.stop_date(undefined, days))
						})).filter((v) => v.stop.stop_id != closestStop.stop_id);
						const stopsBefore = split.stopsBefore.map((v) => ({
							stop: route.stops.find((va) => va.stop_id === v.stop_id)!,
							stop_time: new Date(v.stop_date(undefined, days))
						})).filter((v) => v.stop.stop_id != closestStop.stop_id);
						const _sel2 = get(selected);
						const selectedStop = _sel2 && Object.hasOwn(_sel2 as object, 'stop_id') ? (_sel2 as Stop) : undefined;
						if(stopsLayer !== 'WHITE_GRAY_CIRCLE')
							updateLayer(stopsLayer, geoJSONFromStops(stopsAfter));
						else updateLayer(isLive ? 'WHITE_BLUE_CIRCLE' : 'WHITE_BLACK_CIRCLE', geoJSONFromStops([...stopsBefore, ...stopsAfter].filter((v) => selectedStop && v.stop.stop_id === selectedStop.stop_id)));
						updateLayer(
							'WHITE_GRAY_CIRCLE',
							stopsLayer === 'WHITE_GRAY_CIRCLE'
								? mergeGeoJSONSpecifications([
									geoJSONFromStops(
										stopsBefore.filter(
											(v) => !selectedStop || (selectedStop && selectedStop.stop_id !== v.stop.stop_id))),
									geoJSONFromStops(
										stopsAfter.filter(
											(v) => !selectedStop || (selectedStop && selectedStop.stop_id !== v.stop.stop_id)))])
								: geoJSONFromStops(stopsBefore)
						);
					}
					if (stopsLayer === 'WHITE_GRAY_CIRCLE') {
						const highlighted = get(selected);
						if (!highlighted || !Object.hasOwn(highlighted, 'stop_id')) {
							updateLayer('WHITE_BLUE_CIRCLE', undefined);
							updateLayer('WHITE_BLACK_CIRCLE', undefined);
						}
						updateLayer('BLACK_LINE', undefined);
						updateLayer('BLUE_LINE', undefined);
					}
					lastGeojsonUpdate = now;
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				} catch (_) {
					// ignore split errors
				}
			}

			// Interpolate and paint marker
			let curLat: number;
			let curLon: number;
			if (haveActiveAnimation && lastEstimate) {
				const t = clamp((Date.now() - animStart) / (animDuration || 1), 0, 1);
				curLat = fromLat + (toLat - fromLat) * t;
				curLon = fromLon + (toLon - fromLon) * t;
				if (t >= 1) haveActiveAnimation = false;
			} else if (lastEstimate) {
				curLat = lastEstimate.lat;
				curLon = lastEstimate.lon;
			} else {
				// Fallback to closest stop while we wait for first estimate
				curLat = closestStop.stop_lat;
				curLon = closestStop.stop_lon;
			}
			// Use cached bus style to prevent flickering
			// Calculate bearing to next shape point for static trips
			const bearing = getBearingForStaticTrip(trip as Trip, curLat, curLon);
			updateBusMarker(cachedBusStyle, routeShortName, curLat, curLon, () => {
				markerTapped = true;
				selected.set(trip);
			}, bearing);
		}
	}, FRAMERATE_MS);
}
async function cancelAnimateBusMarker() {
	if(busMarkerInterval){
		clearInterval(busMarkerInterval);
		busMarkerInterval = undefined;
		// await tick(); // Wait for map to reflect changes
	}
}