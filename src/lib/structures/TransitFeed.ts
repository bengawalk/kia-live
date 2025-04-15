import type { Route } from './Route';
import type { Stop } from './Stop';

export type TransitFeed = {
    routes: Route[];
    stops: {
    [stop_id: string]: Stop;
    };
    feed_version: string;
    timestamp: string;
};