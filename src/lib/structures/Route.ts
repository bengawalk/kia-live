export type Route = {
    route_id: string;
    route_short_name: string;
    route_long_name: string;
    stops: string[];
    trips: {
        [trip_id: string]: string;
    }[];
    shape: {
        lat: number;
        lon: number;
    }[];
};
