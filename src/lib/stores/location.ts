import { get, writable } from 'svelte/store';
import { DEFAULT_LOCATION } from '$lib/constants';

export type InputCoords = {latitude: number; longitude: number };
export const userLocation = writable<GeolocationPosition | undefined>();
export const inputLocation = writable<undefined | InputCoords>();
export function currentLocation(): InputCoords | GeolocationCoordinates {
	const i = get(inputLocation);
	const u = get(userLocation);
	const uc: GeolocationCoordinates | InputCoords = u !== undefined ? u.coords : {latitude: DEFAULT_LOCATION[0], longitude: DEFAULT_LOCATION[1]};
	return i !== undefined ? i : uc;
}