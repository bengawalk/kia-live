import { inputLocation, userLocation } from '$lib/stores/location';
import { DEFAULT_LOCATION } from '$lib/constants';
import { updateMarker } from '$lib/services/map';
import { get } from 'svelte/store';

export function pollUserLocation() {
	navigator.geolocation.watchPosition((position: GeolocationPosition) => {
		userLocation.set(position)
	}, () => {
		console.log("Geolocation not available, using default location.");
		inputLocation.set({
			latitude: DEFAULT_LOCATION[0],
			longitude: DEFAULT_LOCATION[1]
		})
	});
}

function locationUpdate() {
	const user = get(userLocation);
	const input = get(inputLocation);
	if(user !== undefined) {
		updateMarker(input === undefined ? 'USER_LOCATION_INACTIVE' : 'USER_LOCATION', [undefined, undefined], undefined, undefined)
		updateMarker(input === undefined ? 'USER_LOCATION' : 'USER_LOCATION_INACTIVE', [undefined, undefined], user.coords.latitude, user.coords.longitude);
	}
	if(input !== undefined) updateMarker('INPUT_LOCATION', [undefined, undefined], input.latitude, input.longitude, () => inputLocation.set(undefined))
}
userLocation.subscribe(locationUpdate);
inputLocation.subscribe(locationUpdate);
