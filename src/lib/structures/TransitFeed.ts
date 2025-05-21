import type { Route } from './Route';
import type { Stop } from './Stop';
import type { Trip } from '$lib/structures/Trip';

type serializableFeed = {   timestamp: string;   routes: {    trips: {     stops: {      stop_id: string;      stop_time: string;     }[];     trip_id: string;     route_id: string;    }[];    route_id: string;    route_short_name: string;    route_long_name: string;    stops: Stop[];    shape: {     lat: number;     lon: number;    }[];   }[];   stops: {    [stop_id: string]: Stop;   };   feed_version: string; }

export function makeSerializable(feed: TransitFeed): serializableFeed {
    const cleanTrips = feed.routes.map(route => ({
        ...route,
        trips: route.trips.map(trip => ({
            ...trip,
            stops: trip.stops.map(s => ({
                stop_id: s.stop_id,
                stop_time: s.stop_time
                // Exclude stop_date (we’ll restore later)
            }))
        }))
    }));

    return {
        ...feed,
        timestamp: feed.timestamp.toISOString(),
        routes: cleanTrips
    };
}
export function rehydrateFeed(data: serializableFeed): TransitFeed {
    return {
        ...data,
        timestamp: new Date(data.timestamp),
        routes: data.routes.map((route): Route => ({
            ...route,
            trips: route.trips.map((trip): Trip => ({
                ...trip,
                stops: trip.stops.map((s: {stop_time: string, stop_id: string}) =>
                  {
                      const stop_date = (baseDate = new Date(), days = 0): Date => {
                          const [hh, mm, ss] = s.stop_time.split(":").map(Number);
                          const date = new Date(baseDate);
                          date.setHours(0, 0, 0, 0); // reset to midnight
                          date.setDate(date.getDate() + days + Math.floor(hh / 24)); // add extra days from hour overflow
                          date.setHours(hh % 24, mm, ss);
                          return date;
                      };
                      return {
                        ...s,
                        stop_date: stop_date,
                    }
                })
            }))
        }))
    };
}

export type TransitFeed = {
    routes: Route[];
    stops: {
    [stop_id: string]: Stop;
    };
    feed_version: string;
    timestamp: Date;
};