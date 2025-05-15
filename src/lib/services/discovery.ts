import type { Stop } from '$lib/structures/Stop';
import type { Trip } from '$lib/structures/Trip';
import type { Route } from '$lib/structures/Route';
import type { TransitFeed } from '$lib/structures/TransitFeed';
import type { LiveTrip } from '$lib/structures/LiveTrip';
import type { GeoJSONSourceSpecification, MapMouseEvent } from 'mapbox-gl';
import { liveTransitFeed, transitFeedStore } from '$lib/stores/transitFeedStore';
import {
	airportDirection,
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
	getTravelRouteWithLocalStorage, type NavMode,
	removeRenderedCollisions,
	renderPendingCollisions,
	updateLayer,
	updateMarker
} from '$lib/services/map';
import { AIRPORT_LOCATION, MAP_STYLES } from '$lib/constants';
import { language } from '$lib/stores/language';

const tappableLayers = Object.keys(MAP_STYLES).filter((key) => MAP_STYLES[key].type === 0);
let markerTapped = false;

export function loadSampleData() {
	const stops: Stop[] = [
		{ stop_id: 'a_001', stop_name: { en: 'start of a' }, stop_lat: 12.872932, stop_lon: 77.54259 }, // 0
		{ stop_id: 'a_002', stop_name: { en: 'a 2' }, stop_lat: 12.772932, stop_lon: 77.54259 }, // 1
		{ stop_id: 'a_004', stop_name: { en: 'a 4' }, stop_lat: 12.672932, stop_lon: 77.54259 }, // 2
		{ stop_id: 'a_005', stop_name: { en: 'end of a' }, stop_lat: 12.572932, stop_lon: 77.24259 }, // 3
		{ stop_id: 'b_001', stop_name: { en: 'start of b' }, stop_lat: 12.872932, stop_lon: 77.34259 }, // 4
		{ stop_id: 'b_002', stop_name: { en: 'b 2' }, stop_lat: 12.872932, stop_lon: 77.44259 }, // 5
		{ stop_id: 'b_003', stop_name: { en: 'a/b 3' }, stop_lat: 12.72932, stop_lon: 77.54259 }, // 6
		{ stop_id: 'b_004', stop_name: { en: 'b 4' }, stop_lat: 12.872932, stop_lon: 77.64259 }, // 7
		{ stop_id: 'b_005', stop_name: { en: 'b 5' }, stop_lat: 12.872932, stop_lon: 77.74259 }, // 8
		{ stop_id: 'b_006', stop_name: { en: 'end of b' }, stop_lat: 12.872932, stop_lon: 77.84259 } // 9
	];
	const now = new Date();
	const trips: Trip[] = [
		{
			trip_id: 'au1',
			route_id: 'au',
			stops: [
				// 0
				{
					stop_id: 'a_001',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 5.6e6)).toString()
				},
				{
					stop_id: 'a_002',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 5.7e6)).toString()
				},
				{
					stop_id: 'b_003',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 5.8e6)).toString()
				},
				{
					stop_id: 'a_004',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 5.9e6)).toString()
				},
				{
					stop_id: 'a_005',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 6e6)).toString()
				}
			]
		},
		{
			trip_id: 'au2',
			route_id: 'au',
			stops: [
				// 1
				{
					stop_id: 'a_001',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.6e6)).toString()
				},
				{
					stop_id: 'a_002',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.7e6)).toString()
				},
				{
					stop_id: 'b_003',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.8e6)).toString()
				},
				{
					stop_id: 'a_004',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.9e6)).toString()
				},
				{
					stop_id: 'a_005',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 10e6)).toString()
				}
			]
		},
		{
			trip_id: 'ad1',
			route_id: 'ad',
			stops: [
				// 2
				{
					stop_id: 'a_005',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8.6e6)).toString()
				},
				{
					stop_id: 'a_004',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8.7e6)).toString()
				},
				{
					stop_id: 'b_003',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8.8e6)).toString()
				},
				{
					stop_id: 'a_002',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8.9e6)).toString()
				},
				{
					stop_id: 'a_001',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9e6)).toString()
				}
			]
		},
		{
			trip_id: 'bu1',
			route_id: 'bu',
			stops: [
				// 3
				{
					stop_id: 'b_001',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 7.6e6)).toString()
				},
				{
					stop_id: 'b_002',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 7.7e6)).toString()
				},
				{
					stop_id: 'b_003',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 7.8e6)).toString()
				},
				{
					stop_id: 'b_004',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 7.9e6)).toString()
				},
				{
					stop_id: 'b_005',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8e6)).toString()
				},
				{
					stop_id: 'b_006',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 8.1e6)).toString()
				}
			]
		},
		{
			trip_id: 'bd1',
			route_id: 'bd',
			stops: [
				// 4
				{
					stop_id: 'b_006',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.6e6)).toString()
				},
				{
					stop_id: 'b_005',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.7e6)).toString()
				},
				{
					stop_id: 'b_004',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.8e6)).toString()
				},
				{
					stop_id: 'b_003',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 9.9e6)).toString()
				},
				{
					stop_id: 'b_002',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 10e6)).toString()
				},
				{
					stop_id: 'b_001',
					stop_time: new Date(new Date(now).setTime(now.getTime() + 10.1e6)).toString()
				}
			]
		}
	];
	const routes: Route[] = [
		{
			route_id: 'au',
			route_short_name: 'KIA-A',
			route_long_name: 'A to A',
			stops: [stops[0], stops[1], stops[6], stops[2], stops[3]],
			trips: [trips[0], trips[1]],
			shape: [
				{ lat: stops[0].stop_lat, lon: stops[0].stop_lon },
				{ lat: stops[1].stop_lat, lon: stops[1].stop_lon },
				{ lat: stops[6].stop_lat, lon: stops[6].stop_lon },
				{ lat: stops[2].stop_lat, lon: stops[2].stop_lon },
				{ lat: stops[3].stop_lat, lon: stops[3].stop_lon }
			]
		},
		{
			route_id: 'ad',
			route_short_name: 'KIA-A',
			route_long_name: 'A to A',
			stops: [stops[3], stops[2], stops[6], stops[1], stops[0]],
			trips: [trips[2]],
			shape: [
				{ lat: stops[3].stop_lat, lon: stops[3].stop_lon },
				{ lat: stops[2].stop_lat, lon: stops[2].stop_lon },
				{ lat: stops[6].stop_lat, lon: stops[6].stop_lon },
				{ lat: stops[1].stop_lat, lon: stops[1].stop_lon },
				{ lat: stops[0].stop_lat, lon: stops[0].stop_lon }
			]
		},
		{
			route_id: 'bu',
			route_short_name: 'KIA-B',
			route_long_name: 'B to B',
			stops: [stops[4], stops[5], stops[6], stops[7], stops[8], stops[9]],
			trips: [trips[3]],
			shape: [
				{ lat: stops[4].stop_lat, lon: stops[4].stop_lon },
				{ lat: stops[5].stop_lat, lon: stops[5].stop_lon },
				{ lat: stops[6].stop_lat, lon: stops[6].stop_lon },
				{ lat: stops[7].stop_lat, lon: stops[7].stop_lon },
				{ lat: stops[8].stop_lat, lon: stops[8].stop_lon },
				{ lat: stops[9].stop_lat, lon: stops[9].stop_lon }
			]
		},
		{
			route_id: 'bd',
			route_short_name: 'KIA-B',
			route_long_name: 'B to B',
			stops: [stops[9], stops[8], stops[7], stops[6], stops[5], stops[4]],
			trips: [trips[4]],
			shape: [
				{ lat: stops[9].stop_lat, lon: stops[9].stop_lon },
				{ lat: stops[8].stop_lat, lon: stops[8].stop_lon },
				{ lat: stops[7].stop_lat, lon: stops[7].stop_lon },
				{ lat: stops[6].stop_lat, lon: stops[6].stop_lon },
				{ lat: stops[5].stop_lat, lon: stops[5].stop_lon },
				{ lat: stops[4].stop_lat, lon: stops[4].stop_lon }
			]
		}
	];
	const transitFeed: TransitFeed = {
		routes: routes,
		stops: stops.reduce(
			(acc, item) => {
				acc[item.stop_id] = item;
				return acc;
			},
			{} as Record<string, Stop>
		),
		feed_version: 'a/b/1',
		timestamp: now.toString()
	};
	transitFeedStore.set(transitFeed);
	// selected.set(transitFeed.routes[0].trips[0]);
	// highlightedStop.set(transitFeed.stops['b_003']);
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
	selectedTripID.set(currentBuses[direction][currentIndex].trip_id);
}

export async function loadNextBuses() {
	// Take data from transit feed stores, location stores, and generate next buses
	const loc = currentLocation();
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
	);
	const nextTrips: { toCity: (Trip | LiveTrip)[]; toAirport: (Trip | LiveTrip)[] } = {
		toAirport: [],
		toCity: []
	};
	const nextTripTimes: { toCity: number[]; toAirport: number[] } = { toAirport: [], toCity: [] }; // Array for quickly inserting at correct index
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
			const distance = await travelDistance( // to get the actual closest stop we use walking distance
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
		if((Date.parse(closestStop?.stop_time) // Filter out trips that have already passed or will pass before user can reach
			 < Date.now() + await travelTime(
				loc.latitude,
				loc.longitude,
				transitFeed.stops[closestStop.stop_id].stop_lat,
				transitFeed.stops[closestStop.stop_id].stop_lon)
			+ 300))
			continue;
		if (nextTrips[direction].length == 0 || nextTripTimes[direction].length == 0) {
			nextTrips[direction].push(trip);
			nextTripTimes[direction].push(Date.parse(closestStop?.stop_time));
			continue;
		}
		// Fast exit if the number is too large
		if (
			nextTripTimes[direction].length === 10 &&
			Date.parse(closestStop?.stop_time) >=
				nextTripTimes[direction][nextTripTimes[direction].length - 1]
		)
			continue;

		// Binary search for correct insertion index
		let left = 0,
			right = nextTripTimes[direction].length;
		while (left < right) {
			const mid = (left + right) >> 1;
			if (nextTripTimes[direction][mid] < Date.parse(closestStop?.stop_time)) left = mid + 1;
			else right = mid;
		}

		// Insert and trim
		nextTripTimes[direction].splice(left, 0, Date.parse(closestStop?.stop_time));
		nextTrips[direction].splice(left, 0, trip);
		if (nextTripTimes[direction].length > 10) {
			nextTrips[direction].pop();
			nextTripTimes[direction].pop();
		}
	}
	nextBuses.set(nextTrips);
}
let displayingTrip: string = '';
export async function displayCurrentTrip() {
	// Take currently selected trip id, filter next buses, if id not in next buses list, get bus at nextBusIndex from next buses list
	// display relevant markers and layers on map
	clearTripLayers(true);
	const direction = get(airportDirection) ? 'toAirport' : 'toCity';
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
	const highlightLiveTrip =
		highlighted !== undefined && Object.hasOwn(highlighted, 'vehicle_id')
			? (highlighted as LiveTrip)
			: undefined;
	const buses = get(nextBuses)[direction];
	const index = get(nextBusIndex);
	const selectedTrip = get(selectedTripID);
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
	if (currentTrip.trip_id !== displayingTrip) {
		clearTripLayers();
	}
	displayingTrip = currentTrip.trip_id;
	const loc = currentLocation();
	const boundCoordinates: [number, number][] = [[loc.longitude, loc.latitude]];
	type TripStopList = { stop: Stop; stop_time: Date }[];
	const tripStops: TripStopList = currentRoute.stops.map((value, index) => {
		return { stop: value, stop_time: new Date(currentTrip.stops[index].stop_time) };
	});
	const closestStop = await findClosestStop(loc, tripStops);
	boundCoordinates.push([closestStop.stop.stop_lon, closestStop.stop.stop_lat]);
	let tripStopsFiltered = tripStops.filter(
		(value) => value.stop.stop_id !== closestStop.stop.stop_id
	);
	const walkLayer = highlighted === undefined ? 'THIN_BLACK_LINE' : 'THIN_GRAY_LINE';
	const removeWalkLayer = highlighted !== undefined ? 'THIN_BLACK_LINE' : 'THIN_GRAY_LINE';
	const stopsLayer = highlighted === undefined ? 'WHITE_BLACK_CIRCLE' : 'WHITE_GRAY_CIRCLE';
	const removeStopsLayer = highlighted !== undefined ? 'WHITE_BLACK_CIRCLE' : 'WHITE_GRAY_CIRCLE';
	const removeLineLayer =
		highlighted === undefined &&
		(highlightTrip === undefined || highlightTrip.trip_id !== currentTrip.trip_id)
			? 'GRAY_LINE'
			: 'BLACK_LINE';
	const lineLayer =
		highlighted !== undefined &&
		(highlightTrip === undefined || highlightTrip.trip_id !== currentTrip.trip_id)
			? 'GRAY_LINE'
			: 'BLACK_LINE';
	let tripStopsHighlight: undefined | { stop: Stop; stop_time: Date } = undefined;
	removeRenderedCollisions();
	updateLayer(removeStopsLayer, undefined);
	updateLayer(removeLineLayer, undefined);
	updateLayer(removeWalkLayer, undefined);
	updateLayer(lineLayer, geoJSONFromShape(currentRoute, currentTrip));
	if (highlightStop !== undefined && highlightStop.stop_id !== closestStop.stop.stop_id) {
		tripStopsHighlight = tripStopsFiltered.find(
			(val) => val.stop.stop_id === highlightStop.stop_id
		);
		tripStopsFiltered = tripStopsFiltered.filter((value) => value !== tripStopsHighlight);
		if (tripStopsHighlight !== undefined)
			updateLayer('WHITE_BLACK_CIRCLE', geoJSONFromStops([tripStopsHighlight]));
	}
	updateLayer(stopsLayer, geoJSONFromStops(tripStopsFiltered));
	updateLayer(walkLayer, await geoJsonWalkLineFromPoints(loc.latitude, loc.longitude, closestStop.stop.stop_lat, closestStop.stop.stop_lon));
	updateMarker(
		highlighted !== undefined &&
			(highlightStop === undefined || closestStop.stop.stop_id !== highlightStop.stop_id)
			? 'BUS_STOP_INACTIVE'
			: 'BUS_STOP',
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
	if (Object.hasOwn(currentTrip, 'vehicle_id')) {
		const vehicle = get(liveTransitFeed).vehicles.find(
			(vehicle) => vehicle.vehicle_id === (currentTrip as LiveTrip).vehicle_id
		);
		if (vehicle !== undefined) {
			boundCoordinates.push([vehicle.longitude, vehicle.latitude]);
			updateMarker(
				highlighted !== undefined &&
					(highlightLiveTrip === undefined || highlightLiveTrip.trip_id !== currentTrip.trip_id)
					? 'BUS_INACTIVE'
					: 'BUS',
				[currentRoute.route_short_name, undefined],
				vehicle.latitude,
				vehicle.longitude,
				() => {
					markerTapped = true;
					selected.set(currentTrip);
				}
			);
		}
	}
	renderPendingCollisions();
	fitMapToPoints(boundCoordinates);
	highlightedStop.set(closestStop.stop);
}

nextBuses.subscribe(displayCurrentTrip);
nextBusIndex.subscribe(displayCurrentTrip);
selectedTripID.subscribe(displayCurrentTrip);
selected.subscribe(displayCurrentTrip);
inputLocation.subscribe(displayCurrentTrip);
userLocation.subscribe(displayCurrentTrip);
airportDirection.subscribe(displayCurrentTrip);
inputLocation.subscribe(loadNextBuses);
userLocation.subscribe(loadNextBuses);
transitFeedStore.subscribe(loadNextBuses);
liveTransitFeed.subscribe(loadNextBuses);

export function handleTap(e: MapMouseEvent) {
	if (markerTapped) {
		markerTapped = false;
		return;
	}
	const features = e.target
		.queryRenderedFeatures(e.point)
		.filter((feature) => feature.layer !== undefined && tappableLayers.includes(feature.layer.id));
	const point = e.lngLat;
	if (get(selected) !== undefined) {
		selected.set(undefined);
		return;
	}
	if (features === undefined || features.length === 0) {
		inputLocation.set({ latitude: point.lat, longitude: point.lng });
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
	route: Route,
	trip: Trip | LiveTrip | undefined = undefined
): GeoJSONSourceSpecification {
	const shape = route.shape;
	const geojson: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: {
					type: 'LineString',
					coordinates: shape.map(({ lat, lon }) => [lon, lat])
				},
				properties: {
					route_id: route.route_id,
					trip_id: trip !== undefined ? trip.trip_id : '',
					live: trip !== undefined ? Object.hasOwn(trip, 'vehicle_id') : false
				}
			}
		]
	};
	return { type: 'geojson', data: geojson };
}
async function geoJsonWalkLineFromPoints(lat1: number, lng1: number, lat2: number, lng2: number): Promise<GeoJSONSourceSpecification> {
	const geojson: GeoJSON.FeatureCollection = {
		type: 'FeatureCollection',
		features: [
			{
				type: 'Feature',
				geometry: (await getTravelRouteWithLocalStorage([lng1, lat1], [lng2, lat2]))['routes'][0]['geometry'],
				properties: {}
			}
		]
	}
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
	return { type: 'geojson', data: geojson };
}

function clearTripLayers(onlyMarkers: boolean = false) {
	removeRenderedCollisions();
	for (const style of Object.keys(MAP_STYLES)) {
		if (style.toUpperCase().includes('LOCATION')) continue;
		if (MAP_STYLES[style].type == 1)
			updateMarker(style, [undefined, undefined], undefined, undefined);
		if (MAP_STYLES[style].type == 0 && !onlyMarkers) updateLayer(style, undefined);
	}
}

async function travelTime(lat1: number, lng1: number, lat2: number, lng2: number, mode: NavMode='walking') {
	const from: [number, number] = [lng1, lat1];
	const to: [number, number] = [lng2, lat2];
	const data = await getTravelRouteWithLocalStorage(from, to, mode);
	if (data['routes'] === undefined || data['routes'].length === 0)
		return -1;
	return data['routes'][0]['duration'] as number;
}

async function travelDistance(lat1: number, lng1: number, lat2: number, lng2: number, mode: NavMode='walking') {
	const from: [number, number] = [lng1, lat1];
	const to: [number, number] = [lng2, lat2];
	const data = await getTravelRouteWithLocalStorage(from, to, mode);
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
	return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
}

async function findClosestStop(loc: InputCoords | GeolocationCoordinates, tripStops: { stop: Stop; stop_time: Date }[]) {
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

	return distances.reduce((min, curr) =>
		curr.distance < min.distance ? curr : min
	).tripStop;
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
	const withinRange = distances.filter((loc) => loc.distance <= (rangeKm*1000));

	// Step 3: Return based on number of matching locations
	if (withinRange.length <= 1) {
		return distances
			.sort((a, b) => a.distance - b.distance)
			.slice(0, 5)
			.map(({ distance: _, ...rest }) => rest); // remove distance field
	}

	return withinRange.map(({ distance: _, ...rest }) => rest);
}

