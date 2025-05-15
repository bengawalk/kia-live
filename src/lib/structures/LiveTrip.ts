export type LiveTrip = {
    trip_id: string;
    vehicle_id: string;
    route_id: string;
    stops: {
        stop_id: string;
        stop_time: string;
    }[];
    timestamp: Date;
}