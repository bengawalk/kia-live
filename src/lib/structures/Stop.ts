export type Stop = {
    stop_id: string;
    stop_name: {
        [lang_key: string]: string;
    };
    stop_lat: number;
    stop_lon: number;
};