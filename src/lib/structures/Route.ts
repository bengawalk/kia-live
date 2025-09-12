import type { Trip } from '$lib/structures/Trip';
import type { Stop } from '$lib/structures/Stop';

export type Route = {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    stops: Stop[];
    trips: Trip[];
    shape: {
        lat: number;
        lon: number;
    }[];
};
