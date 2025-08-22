import { writable } from 'svelte/store';
import type { Stop } from '$lib/structures/Stop';
import type { Trip } from '$lib/structures/Trip';
import type { LiveTrip } from '$lib/structures/LiveTrip';

export const isPlanning = writable<boolean>(false);
export const airportDirection = writable<boolean>(true); // False = to city, True = to airport
export const nextBusIndex = writable<number>(-1);
export const nextBuses = writable<{toCity: (Trip | LiveTrip)[], toAirport: (Trip | LiveTrip)[]}>({toCity: [], toAirport: []});
export const selectedTripID = writable<string | undefined>();
export const highlightedStop = writable<Stop | undefined>();
export const selected = writable<Stop | Trip | LiveTrip | undefined>();
export const connected = writable<boolean>(false);