import { writable } from 'svelte/store';
import { type Route } from '$lib/structures/Route'
import { type Stop } from '$lib/structures/Stop'
import { type  TransitFeed} from '$lib/structures/TransitFeed'


// Initialize with default empty values
const initialTransitFeed: TransitFeed = {
    routes: [],
    stops: {},
    feed_version: '',
    timestamp: ''
};

// Create the writable store
export const transitFeedStore = writable<TransitFeed>(initialTransitFeed);

// Helper functions for common operations
export const transitFeedActions = {
    updateRoutes: (routes: Route[]) => {
        transitFeedStore.update(current => ({
            ...current,
            routes
        }));
    },
    updateStops: (stops: { [stop_id: string]: Stop }) => {
        transitFeedStore.update(current => ({
            ...current,
            stops
        }));
    },
    updateVersion: (version: string) => {
        transitFeedStore.update(current => ({
            ...current,
            feed_version: version
        }));
    },
    updateTimestamp: (timestamp: string) => {
        transitFeedStore.update(current => ({
            ...current,
            timestamp
        }));
    },
    reset: () => {
        transitFeedStore.set(initialTransitFeed);
    }
};