export type Vehicle = {
    vehicle_id: string;
    vehicle_reg: string;
    trip_id: string;
    route_id: string;
    latitude: number;
    longitude: number;
    bearing: number;
    speed: number;
    next_stop_id: string;
    timestamp: string; // or Date if you're parsing it into a Date object
};  