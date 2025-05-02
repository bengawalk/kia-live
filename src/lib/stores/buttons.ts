import { writable } from 'svelte/store';

export const isPlanning = writable<boolean>(false);
export const airportDirection = writable<boolean>(true); // False = to city, True = to airport
export const nextBusIndex = writable<number>(0);
export const selectedBusID = writable<string | undefined>();