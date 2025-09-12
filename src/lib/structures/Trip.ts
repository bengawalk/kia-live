export type Trip = {
    trip_id: string;
    route_id: string;
    stops: {
        stop_id: string;
        stop_time: string;
        stop_date: (baseDate?: Date, days?: number) => Date;
    }[];
}