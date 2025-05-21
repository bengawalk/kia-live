import { writable } from 'svelte/store';
import { type Route } from '$lib/structures/Route'
import { type Stop } from '$lib/structures/Stop'
import { makeSerializable, rehydrateFeed, type  TransitFeed } from '$lib/structures/TransitFeed';
import type { LiveTransitFeed } from '$lib/structures/LiveTransitFeed';
import { browser } from '$app/environment';


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
const DB_NAME = 'transit-store';
const STORE_NAME = 'feed';

// Save to DB on every change
export async function saveFeed(feed: TransitFeed) {
    if(!browser) return;
    const { openDB } = await import('idb');
    const db = await openDB(DB_NAME, 1, {
        upgrade(db) {
            db.createObjectStore(STORE_NAME);
        }
    });
    await db.put(STORE_NAME, makeSerializable(feed), 'latest');
}

// Load from DB if available, else initial transit feed
export async function loadFeed(): Promise<TransitFeed> {
    if(!browser) return initialTransitFeed;
    const { openDB } = await import('idb');
    const db = await openDB(DB_NAME, 1);
    const val = await db.get(STORE_NAME, 'latest');
    return rehydrateFeed(val) ?? initialTransitFeed;
}
// Create the writable store
export const transitFeedStore = writable<TransitFeed>(initialTransitFeed);
export const liveTransitFeed = writable<LiveTransitFeed>(initialLiveFeed);

transitFeedStore.subscribe(saveFeed);

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