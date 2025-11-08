import { get, writable } from 'svelte/store';
import { DEFAULT_LOCATION } from '$lib/constants';

export type InputCoords = {latitude: number; longitude: number };
export const userLocation = writable<GeolocationPosition | undefined>();
export const inputLocation = writable<undefined | InputCoords>();

// Track last known user location to avoid falling back to default
let lastKnownUserLocation: GeolocationCoordinates | undefined = undefined;

// Subscribe to userLocation to track the last valid location
userLocation.subscribe((loc) => {
	if (loc !== undefined) {
		lastKnownUserLocation = loc.coords;
	}
});

export function currentLocation(): InputCoords | GeolocationCoordinates {
	const i = get(inputLocation);
	const u = get(userLocation);

	let result: InputCoords | GeolocationCoordinates;

	if (i !== undefined) {
		result = i;
	} else {
		// Priority: inputLocation > current userLocation > last known userLocation > DEFAULT_LOCATION

		result =
			u !== undefined
				? u.coords
				: lastKnownUserLocation !== undefined
					? lastKnownUserLocation
					: { latitude: DEFAULT_LOCATION[0], longitude: DEFAULT_LOCATION[1] };
	}

	return result;
}