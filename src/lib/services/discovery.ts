import type { Stop } from '$lib/structures/Stop';
import type { Trip } from '$lib/structures/Trip';
import type { Route } from '$lib/structures/Route';
import type { LiveTrip } from '$lib/structures/LiveTrip';
import {
	type GeoJSONSourceSpecification,
	type MapMouseEvent,
	type MapTouchEvent,
	type Map as MapboxMap,
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
import {
	currentLocation,
	type InputCoords,
	inputLocation,
	userLocation
} from '$lib/stores/location';
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
import { tick } from 'svelte';

const tappableLayers = Object.keys(MAP_STYLES).filter((key) => MAP_STYLES[key].type === 0);
let markerTapped = false;
let currentRefreshTimeout: NodeJS.Timeout | undefined = undefined;
let busMarkerInterval: NodeJS.Timeout | undefined = undefined;

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
}): Date {
	if (closestStop.stop_date().getTime() < Date.now()) {
		return closestStop.stop_date(undefined, 1);
	}
	return closestStop.stop_date();
}

export async function loadNextBuses() {
	console.log("LOADING NEXT BUSES")
	// Take data from transit feed stores, location stores, and generate next buses
	const loc = currentLocation();
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
	let timeoutTime = new Date().getTime() + 3600000; // 60 minutes after
	for (const trip of trips) {
		if (seenTripIds.has(trip.trip_id)) continue;
		seenTripIds.add(trip.trip_id);
		const routeFind = routes.find((value) => value.route_id === trip.route_id);
		const direction =
			routeFind === undefined
				? null
				: haversineDistance(
							routeFind.stops[0].stop_lat,
							routeFind.stops[0].stop_lon,
							AIRPORT_LOCATION[0],
							AIRPORT_LOCATION[1]
					  ) >
					  haversineDistance(
							routeFind.stops[routeFind.stops.length - 1].stop_lat,
							routeFind.stops[routeFind.stops.length - 1].stop_lon,
							AIRPORT_LOCATION[0],
							AIRPORT_LOCATION[1]
					  )
					? 'toAirport'
					: 'toCity';
		if (direction === null) continue;
		const nearbyStops = trip.stops.filter((t) => stopIds.includes(t.stop_id));
		if (nearbyStops.length == 0) {
			continue;
		}
		let closestStop = undefined;
		let closestDistance = undefined;
		for (const closeStop of nearbyStops) {
			const distance = await travelDistance(
				// to get the actual closest stop we use walking distance
				loc.latitude,
				loc.longitude,
				transitFeed.stops[closeStop.stop_id].stop_lat,
				transitFeed.stops[closeStop.stop_id].stop_lon
			);
			closestDistance = closestDistance !== undefined ? closestDistance : distance;
			closestStop = closestStop !== undefined ? closestStop : closeStop;
			if (distance < closestDistance) {
				closestStop = closeStop;
				closestDistance = distance;
			}
		}
		if (closestStop === undefined) {
			continue;
		}
		const travelTimeMS =
			(await travelTime(
				loc.latitude,
				loc.longitude,
				transitFeed.stops[closestStop.stop_id].stop_lat,
				transitFeed.stops[closestStop.stop_id].stop_lon
			)) * 1000;
		const arrivalToStop = Date.now() + travelTimeMS;
		if (arrivalToStop < timeoutTime) timeoutTime = arrivalToStop;
		if (
			getNextDeparture(closestStop).getTime() < // Filter out trips that have already passed or will pass before user can reach
			arrivalToStop + 300 * 1000
		)
			continue;
		if (nextTrips[direction].length == 0 || nextTripTimes[direction].length == 0) {
			nextTrips[direction].push(trip);
			nextTripTimes[direction].push(getNextDeparture(closestStop).getTime());
			continue;
		}
		// Fast exit if the number is too large
		if (
			nextTripTimes[direction].length === 10 &&
			getNextDeparture(closestStop).getTime() >=
				nextTripTimes[direction][nextTripTimes[direction].length - 1]
		)
			continue;

		// Binary search for correct insertion index
		let left = 0,
			right = nextTripTimes[direction].length;
		while (left < right) {
			const mid = (left + right) >> 1;
			if (nextTripTimes[direction][mid] < getNextDeparture(closestStop).getTime()) left = mid + 1;
			else right = mid;
		}

		// Insert and trim
		nextTripTimes[direction].splice(left, 0, getNextDeparture(closestStop).getTime());
		nextTrips[direction].splice(left, 0, trip);
		if (nextTripTimes[direction].length > 10) {
			nextTrips[direction].pop();
			nextTripTimes[direction].pop();
		}
	}
	for (const direction of ['toAirport', 'toCity']) {
		nextTrips[direction as 'toAirport' | 'toCity'] = nextTrips[
			direction as 'toAirport' | 'toCity'
		].sort((a, b) =>
			Object.hasOwn(a, 'vehicle_id') && !Object.hasOwn(b, 'vehicle_id')
				? -1
				: Object.hasOwn(b, 'vehicle_id') && !Object.hasOwn(a, 'vehicle_id')
					? 1
					: 0
		);
	}
	if (currentRefreshTimeout) clearTimeout(currentRefreshTimeout);
	currentRefreshTimeout = setTimeout(loadNextBuses, timeoutTime - Date.now());
	nextBuses.set(nextTrips);
	// console.log(nextTrips);
}

let displayingTripID: string = '';
let displayingStop: { style: string; stop_id: string; stop_time: number } = {
	style: '',
	stop_id: '',
	stop_time: 0
};
let displayingMarkerStyles: string[] = [];

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
	await cancelAnimateBusMarker();
	const selectedTrip = get(selectedTripID);
	if (!selectedTrip) {
		clearTripLayers(true);
		return;
	}
	const tripFind = buses.find((val) => val.trip_id === selectedTrip);
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
	const removeWalkLayer = highlighted !== undefined ? 'THIN_BLACK_LINE' : 'THIN_GRAY_LINE';
	const stopsLayer =
		highlighted === undefined
			? Object.hasOwn(currentTrip, 'vehicle_id')
				? 'WHITE_BLUE_CIRCLE'
				: 'WHITE_BLACK_CIRCLE'
			: 'WHITE_GRAY_CIRCLE';
	const removeStopsLayer = highlighted !== undefined ? 'WHITE_BLACK_CIRCLE' : 'WHITE_GRAY_CIRCLE';
	const removeLiveStopsLayer =
		highlighted !== undefined ? 'WHITE_BLUE_CIRCLE' : 'WHITE_GRAY_CIRCLE';
	const removeLineLayer = highlighted === undefined ? 'GRAY_LINE' : 'BLACK_LINE';
	const removeLiveLineLayer = highlighted === undefined ? 'GRAY_LINE' : 'BLUE_LINE';
	const lineLayer =
		highlighted !== undefined
			? 'GRAY_LINE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BLUE_LINE'
				: 'BLACK_LINE';
	let tripStopsHighlight: undefined | { stop: Stop; stop_time: Date } = undefined;
	removeRenderedCollisions();
	updateLayer(removeStopsLayer, undefined);
	updateLayer(removeLiveStopsLayer, undefined);
	updateLayer(removeLineLayer, undefined);
	updateLayer(removeLiveLineLayer, undefined);
	updateLayer(removeStopsLayer, undefined);
	updateLayer(removeWalkLayer, undefined);
	const vehicle = Object.hasOwn(currentTrip, 'vehicle_id')
		? get(liveTransitFeed).vehicles.find(
				(vehicle) => vehicle.vehicle_id === (currentTrip as LiveTrip).vehicle_id
			)
		: undefined;
	const vehicleEstimate = await getVehicleEstimate(currentTrip);
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
	// updateLayer(lineLayer, geoJSONFromRoute(currentRoute, currentTrip));
	// updateLayer('GRAY_LINE', geoJSONFromRoute(currentRoute, currentTrip));
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
	updateBusMarker(
		highlighted !== undefined &&
			(highlightTrip === undefined || highlightTrip.trip_id !== currentTrip.trip_id)
			? 'BUS_INACTIVE'
			: Object.hasOwn(currentTrip, 'vehicle_id')
				? 'BUS_LIVE'
				: 'BUS',
		currentRoute.route_short_name,
		vehicle ? vehicle.latitude : vehicleEstimate.lat,
		vehicle ? vehicle.longitude : vehicleEstimate.lon,
		() => {
			markerTapped = true;
			selected.set(currentTrip);
		}
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
}

export function toggleAirportDirection(
	direction: boolean | undefined = undefined,
	toggle: boolean = true
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
	selectedTripID.set(undefined);
	cycleBus();
}

nextBuses.subscribe(displayCurrentTrip);
selectedTripID.subscribe(displayCurrentTrip);
selected.subscribe(displayCurrentTrip);
airportDirection.subscribe(displayCurrentTrip);
inputLocation.subscribe(loadNextBuses);
userLocation.subscribe(loadNextBuses);
transitFeedStore.subscribe(loadNextBuses);
liveTransitFeed.subscribe(loadNextBuses);
inputLocation.subscribe(() => toggleAirportDirection(undefined, false));
userLocation.subscribe(() => toggleAirportDirection(undefined, false));

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
		cycleBus();
		clearTimeout(changeLocationTimeout);
		changeLocationTimeout = undefined;
		if (circleTimer) circleTimer.remove();
		circleTimer = undefined;
	}, 1500); // 1.5 second later change input location
}

// export function handleTouchMove(e: MapTouchEvent | MapMouseEvent) {
// 	if(changeLocationTimeout) {
// 		console.log('Touch cancelled change location removed');
// 		clearTimeout(changeLocationTimeout);
// 	}
// 	if(circleTimeout) {
// 		console.log('Touch cancelled circle timeout removed');
// 		clearTimeout(circleTimeout);
// 	}
// 	if(circleTimer) {
// 		console.log('Touch cancelled circle removed');
// 		circleTimer.remove();
// 	}
// }
export function handleTouchEnd(
	e:
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

async function findClosestStop(
	loc: InputCoords | GeolocationCoordinates,
	tripStops: {
		stop: Stop;
		stop_time: Date;
	}[]
) {
	console.log("FIND CLOSEST STOP")
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
	console.log(distances);
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
		const idx = nearestShapeIndex(shape, [s.stop_lat, s.stop_lon]);
		matchedStopShapeIndex[s.stop_id] = idx;
	}

	// 2) Match provided position to a shape point.
	const splitIndex = nearestShapeIndex(shape, position);

	// 3) Split shape at matched point.
	// Include the split vertex in both halves so they “touch”.
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
	// (works for both Trip and LiveTrip since args are optional for Trip)
	const now = new Date();
	let lastPastStopIndex: number | null = null;
	let nextUpcomingStopIndex: number | null = null;
	const days = trip.stops[trip.stops.length - 1].stop_date() < now ? 1 : 0;
	for (let i = 0; i < trip.stops.length; i++) {
		const sd = trip.stops[i].stop_date(undefined, days); // Trip: optional args, LiveTrip: no args
		if (sd <= now) lastPastStopIndex = i;
		if (sd > now && nextUpcomingStopIndex === null) {
			nextUpcomingStopIndex = i;
		}
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

// async function splitTrip(trip: Trip | LiveTrip, position: [number, number]) {
// 	const transitFeed = get(transitFeedStore);
// 	const shape = transitFeed.routes.find((v) => v.trips.map((t) => t.trip_id).includes(trip.trip_id))?.shape;
// 	const stops = trip.stops.map(v => transitFeed.stops[v.stop_id]);
// 	if (!shape) return undefined;
// 	/*
// 	 * 1. Match stops to shape points.
// 	 * 2. Match provided position to a shape point.
// 	 * 3. Split shape at matched point.
// 	 * 4. Split stops depending on which shape matches are in which split.
// 	 */
// }

function clamp01(x: number) {
	if (x < 0) return 0;
	if (x > 1) return 1;
	return x;
}

async function getVehicleEstimate(trip: Trip): Promise<{ lat: number; lon: number }> {
	const transitFeed = get(transitFeedStore);
	const days = trip.stops[trip.stops.length - 1].stop_date() < new Date() ? 1 : 0;
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

	// 1) Match stops to shape points
	const stopInfos = stops
		.map((s, idx) => {
			if (!s.stop) return null;
			const shapeIdx = nearestShapeIndex(shape, [s.stop.stop_lat, s.stop.stop_lon]);
			const when = s.stop_date(undefined, days); // use stop_date() for absolute Date
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
		const first = stopInfos[0];
		const p = shape[first.shapeIdx];
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

// async function getVehicleEstimate(trip: Trip) {
// 	const transitFeed = get(transitFeedStore)
// 	const shape = transitFeed.routes.find((v) => v.trips.map((t) => t.trip_id).includes(trip.trip_id))?.shape;
// 	const stops = trip.stops.map(v => ({stop_date: v.stop_date, time: v.stop_time, stop: transitFeed.stops[v.stop_id]}));
// 	if (!shape) return undefined;
// 	/*
// 	 * 1. Match stops to shape points.
// 	 * 2. Determine pass point of vehicle based on trip scheduled timings. If not matching with time.now continue, else return matched shape location.
// 	 * 4. Extract points between passed stop and upcoming stop.
// 	 * 5. Divide the time difference based on distance,
// 	 * 6. Assume location of vehicle based on current time, passed stop time, upcoming stop time. Location along the shape points, in an interpolated point between two points if necessary
// 	 */
// }

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
	if (busMarkerInterval) await cancelAnimateBusMarker();
	const currentBus = Object.hasOwn(trip, 'vehicle_id')
		? get(liveTransitFeed).vehicles.find((e) => (trip as LiveTrip).vehicle_id === e.vehicle_id)
		: undefined;
	const previousLiveLoc = currentBus
		? currentBus.previous_locations.length > 1
			? currentBus.previous_locations[currentBus.previous_locations.length - 2]
			: {
					latitude: currentBus.latitude,
					longitude: currentBus.longitude
				}
		: undefined;
	let currentLiveLoc:
		| {
				latitude: number;
				longitude: number;
		  }
		| undefined = currentBus
		? { latitude: currentBus.latitude, longitude: currentBus.longitude }
		: undefined;
	let previousAfterStop: GeoJSONSourceSpecification | undefined = undefined;
	let previousAfterShape: GeoJSONSourceSpecification | undefined = undefined;
	let updateLine: boolean = false;
	busMarkerInterval = setInterval(async () => {
		const end_days = trip.stops[trip.stops.length - 1].stop_date() < trip.stops[0].stop_date() && trip.stops[trip.stops.length - 1].stop_date() < new Date() ? 1 : 0;
		const start_days = trip.stops[0].stop_date() > trip.stops[trip.stops.length - 1].stop_date() && trip.stops[0].stop_date() > new Date() && end_days !== 0 ? -1 : 0;
		// console.log(`start${start_days},end${end_days}`);
		if(trip.stops[trip.stops.length - 1].stop_date(undefined, end_days) < new Date()) return; // Fast exit if trip has completed
		if(trip.stops[0].stop_date(undefined, start_days) > new Date()) return; // Fast exit if trip has not started yet
		const updates: {
			vehicle:
				| { lat: number; lon: number; label: string; layer: keyof typeof MAP_STYLES }
				| undefined;
			lines:
				| {
						before: GeoJSONSourceSpecification;
						after: GeoJSONSourceSpecification;
						layer: keyof typeof MAP_STYLES;
				  }
				| undefined;
			stops:
				| {
						before: GeoJSONSourceSpecification;
						after: GeoJSONSourceSpecification;
						layer: keyof typeof MAP_STYLES;
				  }
				| undefined;
		} = {
			vehicle: undefined,
			lines: undefined,
			stops: undefined
		};
		const s = get(selected);
		const route = get(transitFeedStore).routes.find((r) => r.route_id === trip.route_id);
		const stops = get(transitFeedStore).stops;
		if (!route) return;
		let showSelectedStop: boolean = false;
		if (!currentBus) {
			/* Update Static Vehicle
			 * Call getVehicleEstimate and splitTrip
			 * Save updates for marker layer and geojson for lines and points
			 */
			const location = await getVehicleEstimate(trip as Trip);
			updates.vehicle = {
				...location,
				label: route.route_short_name,
				layer:
					!s ||
					(s && Object.hasOwn(s, 'trip_id') && (s as Trip | LiveTrip).trip_id === trip.trip_id)
						? 'BUS'
						: 'BUS_INACTIVE'
			};
			const splitRes = await splitTrip(trip, [location.lat, location.lon]);
			splitRes.stopsBefore = splitRes.stopsBefore.filter((c) => c.stop_id !== closestStop.stop_id);
			splitRes.stopsAfter = splitRes.stopsAfter.filter((c) => c.stop_id !== closestStop.stop_id); // Filter out the closest stop
			if (s && Object.hasOwn(s, 'stop_id')) {
				showSelectedStop = (s as Stop).stop_id !== closestStop.stop_id;
				splitRes.stopsBefore = splitRes.stopsBefore.filter(
					(c) => c.stop_id !== (s as Stop).stop_id
				);
				splitRes.stopsAfter = splitRes.stopsAfter.filter((c) => c.stop_id !== (s as Stop).stop_id); // Filter out the selected stop
			}
			updates.lines = {
				layer: 'BLACK_LINE',
				before: geoJSONFromShape(splitRes.shapeBefore.map((r) => [r.lon, r.lat])),
				after: geoJSONFromShape(splitRes.shapeAfter.map((r) => [r.lon, r.lat]))
			};
			updates.stops = {
				layer: 'WHITE_BLACK_CIRCLE',
				before: geoJSONFromStops(
					splitRes.stopsBefore.map((v) => ({
						stop: stops[v.stop_id],
						stop_time: new Date(v.stop_date())
					}))
				),
				after: geoJSONFromStops(
					splitRes.stopsAfter.map((v) => ({
						stop: stops[v.stop_id],
						stop_time: new Date(v.stop_date())
					}))
				)
			};
		} else {
			const newLoc: {
				latitude: number;
				longitude: number;
				label: string;
				layer: keyof typeof MAP_STYLES;
			} = {
				latitude: currentBus.latitude,
				longitude: currentBus.longitude,
				label: route.route_short_name,
				layer:
					!s ||
					(s && Object.hasOwn(s, 'trip_id') && (s as Trip | LiveTrip).trip_id === trip.trip_id)
						? 'BUS_LIVE'
						: 'BUS_INACTIVE'
			};
			if (previousLiveLoc) {
				if (currentLiveLoc && currentBus) {
					const loc = moveTowards(
						[currentLiveLoc.latitude, currentLiveLoc.longitude],
						[currentBus.latitude, currentBus.longitude],
						100
					);
					newLoc.latitude = loc[0];
					newLoc.longitude = loc[1];
				} else {
					newLoc.latitude = previousLiveLoc.latitude;
					newLoc.longitude = previousLiveLoc.longitude;
					currentLiveLoc = { latitude: newLoc.latitude, longitude: newLoc.longitude };
				}
			} else if (currentBus) {
				const loc = moveTowards([currentBus.latitude, currentBus.longitude], [closestStop.stop_lat, closestStop.stop_lon], 50);
				newLoc.latitude = loc[0];
				newLoc.longitude = loc[1];
			}
			/* Update Live Vehicle
			 * Get current marker location
			 * If marker location is not equal to current position (or latest entry in previous positions) then based on timestamps update the marker location towards the latest location (maintaining a maximum of 40 sec delay on timestamps)
			 * If marker location is equal to current position, attempt to assume next position based on next stop time on trip, if within 50m of shape, use shape as guidance.
			 * Based on marker update location call splitTrip and save updates for marker layer and geojson for lines and points
			 */
			const splitRes = await splitTrip(trip, [newLoc.latitude, newLoc.longitude]);
			splitRes.stopsBefore = splitRes.stopsBefore.filter((c) => c.stop_id !== closestStop.stop_id);
			splitRes.stopsAfter = splitRes.stopsAfter.filter((c) => c.stop_id !== closestStop.stop_id); // Filter out the stops
			if (s && Object.hasOwn(s, 'stop_id')) {
				showSelectedStop = (s as Stop).stop_id !== closestStop.stop_id;
				splitRes.stopsBefore = splitRes.stopsBefore.filter(
					(c) => c.stop_id !== (s as Stop).stop_id
				);
				splitRes.stopsAfter = splitRes.stopsAfter.filter((c) => c.stop_id !== (s as Stop).stop_id); // Filter out the stops
			}
			updates.lines = {
				layer: 'BLUE_LINE',
				before: geoJSONFromShape(splitRes.shapeBefore.map((r) => [r.lon, r.lat])),
				after: geoJSONFromShape(splitRes.shapeAfter.map((r) => [r.lon, r.lat]))
			};
			updates.stops = {
				layer: 'WHITE_BLUE_CIRCLE',
				before: geoJSONFromStops(
					splitRes.stopsBefore.map((v) => ({
						stop: stops[v.stop_id],
						stop_time: new Date(v.stop_date())
					}))
				),
				after: geoJSONFromStops(
					splitRes.stopsAfter.map((v) => ({
						stop: stops[v.stop_id],
						stop_time: new Date(v.stop_date())
					}))
				)
			};
		}
		// console.log(updates);
		if (s) {
			// console.log('is selected!');
			if (previousAfterShape !== updates.lines.after)
				updateLayer(
					'GRAY_LINE',
					mergeGeoJSONSpecifications([updates.lines!.before, updates.lines!.after])
				);
			if (previousAfterStop !== updates.stops.after)
				updateLayer(
					'WHITE_GRAY_CIRCLE',
					mergeGeoJSONSpecifications([updates.stops!.before, updates.stops!.after])
				);
			if (!Object.hasOwn(s, 'trip_id') || (s as Trip | LiveTrip).trip_id !== trip.trip_id)
				updates.vehicle!.layer = 'BUS_INACTIVE';
			if (Object.hasOwn(s, 'stop_id') && showSelectedStop) {
				const tripStop = trip.stops.find((c) => c.stop_id === (s as Stop).stop_id);
				if (tripStop) {
					const geojson = geoJSONFromStops([
						{ stop: s as Stop, stop_time: new Date(tripStop.stop_date()) }
					]);
					updateLayer(updates.stops!.layer, geojson);
				}
			}
			updateBusMarker(
				updates.vehicle!.layer,
				updates.vehicle!.label,
				updates.vehicle!.lat,
				updates.vehicle!.lon
			);
		} else {
			// console.log('IS NOT SELECTED!');
			if (previousAfterShape !== updates.lines!.after && updateLine)
				updateLayer('GRAY_LINE', updates.lines.before);
			if (previousAfterStop !== updates.stops.after)
				updateLayer('WHITE_GRAY_CIRCLE', updates.stops.before);
			if (previousAfterShape !== updates.lines!.after && updateLine)
				updateLayer(updates.lines.layer, updates.lines.after);
			if (previousAfterStop !== updates.stops.after)
				updateLayer(updates.stops.layer, updates.stops.after);
			// console.log(`UPDATE LINES LAYER`, updates)
			updateLine = !updateLine;
			updateBusMarker(
				updates.vehicle!.layer,
				updates.vehicle!.label,
				updates.vehicle!.lat,
				updates.vehicle!.lon
			);
		}
		previousAfterStop = updates.stops.after;
		previousAfterShape = updates.lines.after;
		// Based on value of selected, update layers in map
	}, 100);
}
async function cancelAnimateBusMarker() {
	if(busMarkerInterval){
		clearInterval(busMarkerInterval);
		busMarkerInterval = undefined;
		await tick(); // Wait for map to reflect changes
	}
}
type LatLng = [lat: number, lon: number];
export function moveTowards(p1: LatLng, p2: LatLng, meters: number): LatLng {
	const R = 6371000; // Earth radius (m)
	const [lat1, lon1] = [toRad(p1[0]), toRad(p1[1])];
	const [lat2, lon2] = [toRad(p2[0]), toRad(p2[1])];

	// Distance p1->p2 (haversine)
	const d = 2 * R * Math.asin(Math.sqrt(
		Math.sin((lat2 - lat1) / 2) ** 2 +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
	));
	if (d === 0) return p1;

	// Clamp to p2 if overshooting
	const dist = Math.min(Math.max(meters, 0), d);
	if (dist === d) return p2;

	// Initial bearing p1->p2
	const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) -
		Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
	const brng = Math.atan2(y, x);

	// Destination point formula
	const δ = dist / R;
	const sinLat1 = Math.sin(lat1), cosLat1 = Math.cos(lat1);
	const sinδ = Math.sin(δ), cosδ = Math.cos(δ);

	const lat3 = Math.asin(sinLat1 * cosδ + cosLat1 * sinδ * Math.cos(brng));
	const lon3 = lon1 + Math.atan2(
		Math.sin(brng) * sinδ * cosLat1,
		cosδ - sinLat1 * Math.sin(lat3)
	);

	return [toDeg(lat3), normalizeLon(toDeg(lon3))];
}

// helpers
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;
const normalizeLon = (lon: number) =>
	((lon + 540) % 360) - 180; // -> [-180, 180)

// TODO: Add method for getting estimated vehicle location based on trip information
// TODO: Add method for splitting shape, stops into passed and upcoming
// TODO: Animating bus movement based on estimations

