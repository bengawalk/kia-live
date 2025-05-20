import { writable } from 'svelte/store';
import { type Route } from '$lib/structures/Route'
import { type Stop } from '$lib/structures/Stop'
import { type  TransitFeed} from '$lib/structures/TransitFeed'
import type { LiveTransitFeed } from '$lib/structures/LiveTransitFeed';


// Initialize with default empty values
const initialTransitFeed: TransitFeed = {
    routes: [],
    stops: {},
    feed_version: '',
    timestamp: new Date(),
};
const initialLiveFeed: LiveTransitFeed = {
    feed_id: "",
    timestamp: new Date(),
    trips: [],
    vehicles: []
}
// Create the writable store
export const transitFeedStore = writable<TransitFeed>(initialTransitFeed);
export const liveTransitFeed = writable<LiveTransitFeed>(initialLiveFeed);

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
    getVersion: async (): Promise<string> => {
        return new Promise((resolve) => {
            const unsubscribe = transitFeedStore.subscribe(store => {
                resolve(store.feed_version);
            });
            unsubscribe();
        });
    },
    updateTimestamp: (timestamp: Date) => {
        transitFeedStore.update(current => ({
            ...current,
            timestamp
        }));
    },
    reset: () => {
        transitFeedStore.set(initialTransitFeed);
    }
};