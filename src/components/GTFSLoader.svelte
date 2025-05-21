<script lang="ts">
    import { onMount } from 'svelte';
    import { liveTransitFeed, loadFeed, transitFeedActions, transitFeedStore } from '$lib/stores/transitFeedStore';
    import JSZip from 'jszip';
    import Papa from 'papaparse';
    import gtfs_rt from 'gtfs-realtime-bindings';
    import appCaution from '$assets/app-caution.svg?raw';
    import type { Stop } from '$lib/structures/Stop';
    import type { Trip } from '$lib/structures/Trip';
    import type { Route } from '$lib/structures/Route';
    import type { LiveTrip } from '$lib/structures/LiveTrip';
    import type { Vehicle } from '$lib/structures/Vehicle';
    import type Long from 'long';

    let error: string | null = null;

    export function normalizeTimestamp(value: number | Long | undefined | null): number | undefined {
        if (typeof value === 'number') return value;
        if (value && typeof value.toNumber === 'function') return value.toNumber();
        return undefined;
    }

    async function processGTFSRT(): Promise<void> {
        const endpoint = import.meta.env.VITE_LIVE_DATA_SOURCE;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`Failed to fetch GTFS-RT: ${response.status}`);

        const buffer = await response.arrayBuffer();
        const feed = gtfs_rt.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

        const trips: LiveTrip[] = [];
        const vehicles: Vehicle[] = [];

        for (const entity of feed.entity) {
            // Process Trip Updates
            if (entity.tripUpdate && entity.tripUpdate.trip && entity.tripUpdate.trip.tripId) {
                const update = entity.tripUpdate;
                const trip_id = update.trip.tripId;
                const vehicle_id = update.vehicle?.id || '';
                const route_id = update.trip.routeId || '';
                const timestamp = new Date(normalizeTimestamp(update.timestamp) ?? Date.now());

                const stops = (update.stopTimeUpdate || []).map((st) => ({
                    stop_id: st.stopId || '',
                    stop_time: new Date((normalizeTimestamp(st.arrival?.time) || normalizeTimestamp(st.departure?.time) || 0) * 1000).toISOString(),
                    stop_date: () => new Date((normalizeTimestamp(st.arrival?.time) || normalizeTimestamp(st.departure?.time) || 0) * 1000)
                })).filter((val) => Object.hasOwn($transitFeedStore.stops, val.stop_id));
                const inputTripID = trip_id ?? '';
                trips.push({ trip_id: inputTripID, vehicle_id, route_id, stops, timestamp });
            }

            // Process Vehicle Positions
            if (entity.vehicle && entity.vehicle.vehicle && entity.vehicle.vehicle.id) {
                const v = entity.vehicle;
                vehicles.push({
                    vehicle_id: v.vehicle?.id || '',
                    vehicle_reg: v.vehicle?.label || '',
                    trip_id: v.trip?.tripId || '',
                    route_id: v.trip?.routeId || '',
                    latitude: v.position?.latitude || 0,
                    longitude: v.position?.longitude || 0,
                    bearing: v.position?.bearing || 0,
                    speed: v.position?.speed || 0,
                    next_stop_id: v.stopId || '',
                    timestamp: new Date((normalizeTimestamp(v.timestamp) || Date.now()) * 1000)
                });
            }
        }
        liveTransitFeed.set({
            trips: trips,
            vehicles: vehicles,
            feed_id: '',
            timestamp: new Date((normalizeTimestamp(feed.header.timestamp) || Date.now()) * 1000),
        })
    }

    async function loadGTFSData(): Promise<boolean> {
        error = null;
        transitFeedStore.set(await loadFeed());
        try {
            // 1. Get environment variables
            const staticDataSource = import.meta.env.VITE_STATIC_DATA_SOURCE;
            const versionSource = import.meta.env.VITE_STATIC_DATA_VERSION;

            if (!staticDataSource || !versionSource) {
                throw new Error('Missing required environment variables');
            }

            // 2. Get local version
            const localVersion = await transitFeedActions.getVersion();
            const versionResponse = await fetch(versionSource);
            if (!versionResponse.ok) {
                throw new Error('Failed to fetch version info');
            }

            const latestVersion = await versionResponse.text();

            // 3. Skip download if versions match
            if (localVersion === latestVersion) {
                console.log('GTFS data is up to date');
                return true;
            }

            // 4. Fetch and process new data
            const dataResponse = await fetch(staticDataSource);
            if (!dataResponse.ok) {
                throw new Error('Failed to fetch GTFS data');
            }

            const zipData = await dataResponse.arrayBuffer();
            const zip = await JSZip.loadAsync(zipData);
            const processTranslations = async (parsed: Papa.ParseResult<unknown>) => {
                const translationsMap: Map<string, { [lang: string]: string }> = new Map();
                for (const row of parsed.data as never[]) {
                    const { table_name, field_name, record_id, language, translation } = row;

                    if (table_name === 'stops' && field_name === 'stop_name') {
                        if (!translationsMap.has(record_id)) {
                            translationsMap.set(record_id, {});
                        }
                        translationsMap.get(record_id)![language] = translation;
                    }
                }
                return translationsMap;
            };
            const processStops = async (
              parsed: Papa.ParseResult<unknown>,
              translationsMap: Map<string, { [lang: string]: string }>):
              Promise<{ [stop_id: string]: Stop; }> => {
                const stops: { [stop_id: string]: Stop } = {};

                for (const row of parsed.data as {stop_id: string, stop_name: string, stop_lat: string, stop_lon: string}[]) {
                    const stop_id = row.stop_id;
                    const default_name = row.stop_name;
                    const stop_name: { [lang: string]: string } = { en: default_name };

                    if (translationsMap.has(stop_id)) {
                        Object.assign(stop_name, translationsMap.get(stop_id));
                    }

                    stops[stop_id] = {
                        stop_id,
                        stop_name,
                        stop_lat: parseFloat(row.stop_lat),
                        stop_lon: parseFloat(row.stop_lon)
                    };
                }

                return stops;
            };
            const processShapes = async (
              parsed: Papa.ParseResult<unknown>
            ): Promise<{ [shape_id: string]: { lat: number; lon: number; }[] }> => {
                const shapes: { [shape_id: string]: { lat: number; lon: number, seq: number }[] } = {};
                const finalShapes: { [shape_id: string]: { lat: number; lon: number}[] } = {};

                for (const row of parsed.data as {shape_id: string, shape_pt_lat: string, shape_pt_lon: string, shape_pt_sequence: string}[]) {
                    const shape_id = row.shape_id;
                    const lat = parseFloat(row.shape_pt_lat);
                    const lon = parseFloat(row.shape_pt_lon);
                    const seq = parseInt(row.shape_pt_sequence, 10);

                    if (!shape_id || isNaN(lat) || isNaN(lon) || isNaN(seq)) continue;

                    if (!shapes[shape_id]) {
                        shapes[shape_id] = [];
                    }

                    shapes[shape_id].push({ lat, lon, seq }); // temporarily include seq
                }

                // Now sort each shape array by sequence and strip the `seq`
                for (const shape_id in shapes) {
                    finalShapes[shape_id] = shapes[shape_id]
                      .sort((a, b) => a.seq - b.seq)
                      .map(({ lat, lon }) => ({ lat, lon }));
                }

                return finalShapes;
            };
            const processStopTimes = async (
              parsed: Papa.ParseResult<unknown>
            ): Promise<{
                [trip_id: string]: {
                    stop_id: string;
                    stop_time: string;
                    stop_date: (baseDate?: Date, days?: number) => Date;
                }[];
            }> => {
                const stopTimes: {
                    [trip_id: string]: {
                        stop_id: string;
                        stop_time: string;
                        sequence: number;
                    }[];
                } = {};

                for (const row of parsed.data as {trip_id: string, stop_id: string, arrival_time: string, departure_time: string, stop_sequence: string}[]) {
                    const trip_id = row.trip_id;
                    const stop_id = row.stop_id;
                    const arrival_time = row.arrival_time;
                    const departure_time = row.departure_time;
                    const stop_sequence = parseInt(row.stop_sequence, 10);

                    if (!trip_id || !stop_id || isNaN(stop_sequence)) continue;

                    const stop_time = arrival_time || departure_time || '';

                    if (!stop_time || stop_time == '') continue;

                    if (!stopTimes[trip_id]) stopTimes[trip_id] = [];

                    stopTimes[trip_id].push({ stop_id, stop_time, sequence: stop_sequence });
                }

                // Sort each trip’s stops by sequence
                const sortedStopTimes: {
                    [trip_id: string]: {
                        stop_id: string;
                        stop_time: string;
                        stop_date: (baseDate?: Date, days?: number) => Date;
                    }[];
                } = {};
                for (const trip_id in stopTimes) {
                    sortedStopTimes[trip_id] = stopTimes[trip_id]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map(({ stop_id, stop_time }) => {
                          const stop_date = (baseDate = new Date(), days = 0): Date => {
                              const [hh, mm, ss] = stop_time.split(":").map(Number);
                              const date = new Date(baseDate);
                              date.setHours(0, 0, 0, 0); // reset to midnight
                              date.setDate(date.getDate() + days + Math.floor(hh / 24)); // add extra days from hour overflow
                              date.setHours(hh % 24, mm, ss);
                              return date;
                          };
                          return {stop_id, stop_time, stop_date}
                      });
                }

                return sortedStopTimes;
            };

            const processTrips = async (
              parsed: Papa.ParseResult<unknown>,
              stopTimes: { [trip_id: string]: { stop_id: string; stop_time: string, stop_date: (baseDate?: Date, days?: number) => Date; }[] }
            ): Promise<{
                tripsByRoute: { [route_id: string]: Trip[] };
                shapeIdsByRoute: { [route_id: string]: string };
            }> => {
                const tripsByRoute: { [route_id: string]: Trip[] } = {};
                const shapeIdsByRoute: { [route_id: string]: string } = {};

                for (const row of parsed.data as { trip_id: string, route_id: string, shape_id: string }[]) {
                    const trip_id = row.trip_id;
                    const route_id = row.route_id;
                    const shape_id = row.shape_id;

                    if (!trip_id || !route_id) continue;

                    const stops = stopTimes[trip_id];
                    if (!stops) continue;

                    const trip: Trip = {
                        trip_id,
                        route_id,
                        stops,
                    };

                    if (!tripsByRoute[route_id]) {
                        tripsByRoute[route_id] = [];
                        shapeIdsByRoute[route_id] = shape_id;
                    }

                    tripsByRoute[route_id].push(trip);
                }

                return { tripsByRoute, shapeIdsByRoute };
            };
            const processRoutes = async (
              parsed: Papa.ParseResult<unknown>,
              tripsByRoute: { [route_id: string]: Trip[] },
              shapeIdsByRoute: { [route_id: string]: string },
              shapes: { [shape_id: string]: { lat: number; lon: number }[] },
              stopsMap: { [stop_id: string]: Stop }
            ): Promise<Route[]> => {
                const routes: Route[] = [];

                for (const row of parsed.data as { route_id: string, route_short_name: string, route_long_name: string }[]) {
                    const route_id = row.route_id;
                    const route_short_name = row.route_short_name || '';
                    const route_long_name = row.route_long_name || '';

                    const trips = tripsByRoute[route_id] || [];

                    // Gather all stop_ids from all trips
                    const stopIdSet = new Set<string>();
                    for (const trip of trips) {
                        for (const stop of trip.stops) {
                            stopIdSet.add(stop.stop_id);
                        }
                    }

                    // Convert to Stop[]
                    const stops: Stop[] = Array.from(stopIdSet)
                      .map((id) => stopsMap[id])
                      .filter(Boolean);

                    // Get the shape from shapeIdsByRoute
                    const shape_id = shapeIdsByRoute[route_id];
                    const shape = shapes[shape_id] || [];

                    routes.push({
                        route_id,
                        route_short_name,
                        route_long_name,
                        stops,
                        trips,
                        shape,
                    });
                }

                return routes;
            };

            // Process required files
            const processFile = async (filename: 'stops.txt' | 'routes.txt' | 'trips.txt' | 'stop_times.txt' | 'shapes.txt'): Promise<
              { stops: {[stop_id: string]: Stop;}, routes: Route[] } |
              {   tripsByRoute: {    [route_id: string]: Trip[];   };   shapeIdsByRoute: {    [route_id: string]: string;   }; } |
              {   [trip_id: string]: {    stop_id: string;    stop_time: string;   }[]; } |
              {   [shape_id: string]: {    lat: number;    lon: number;   }[]; } |
              { [stop_id: string]: Stop; } |
              undefined
            > => {
                const file = zip.file(filename);
                if (!file) throw new Error(`Missing required file: ${filename}`);
                const content = await file.async('text');
                const parsed = Papa.parse(content, {header: true, skipEmptyLines: true});
                if(filename === 'stops.txt') return processStops(parsed, await processTranslations(parsed));
                if(filename === 'shapes.txt') return processShapes(parsed);
                if(filename === 'stop_times.txt') return processStopTimes(parsed);
                if(filename === 'trips.txt') return processTrips(parsed, await processFile('stop_times.txt') as {   [trip_id: string]: {    stop_id: string;    stop_time: string;  stop_date: (baseDate?: Date, days?: number) => Date;}[]; });
                if(filename === 'routes.txt'){
                    const { tripsByRoute, shapeIdsByRoute } = await processFile('trips.txt') as {   tripsByRoute: {    [route_id: string]: Trip[];   };   shapeIdsByRoute: {    [route_id: string]: string;   }; };
                    const stops = await processFile('stops.txt') as {[stop_id: string]: Stop};
                    const shapes = await processFile('shapes.txt');
                    return {
                        stops: stops,
                        routes: await processRoutes(
                          parsed,
                          tripsByRoute,
                          shapeIdsByRoute,
                          shapes as {   [shape_id: string]: {    lat: number;    lon: number;   }[]; },
                          stops as  { [stop_id: string]: Stop; }
                        ) as Route[]
                    }
                }
            };

            const { stops, routes } = await processFile('routes.txt') as {stops: {[stop_id: string]: Stop}; routes: Route[]};
            transitFeedActions.updateStops(stops);
            transitFeedActions.updateRoutes(routes);


            // Update store
            transitFeedActions.updateVersion(latestVersion);
            transitFeedActions.updateTimestamp(new Date());
            await processGTFSRT();
            setInterval(processGTFSRT, 20000); // 20 second interval, shift this to a websocket or server-sent event to eliminate this process
            return true;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load GTFS data';
            console.error('GTFS load error:', err);
            return false;
        }
    }
    onMount(() => {
        loadGTFSData();
    });
</script>

{#if error}
    <div class="fixed top-2 left-1/2 transform -translate-x-1/2 z-40 pointer-events-none">
        <button
          class="pointer-events-auto"
          aria-label="Retry loading data"
          on:click={loadGTFSData}
        >
            {@html appCaution}
        </button>
    </div>

{/if}