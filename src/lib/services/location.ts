import { inputLocation, userLocation } from '$lib/stores/location';
import { DEFAULT_LOCATION } from '$lib/constants';
import { fitMapToPoints, updateMarker } from '$lib/services/map';
import { setMarkerTapped, toggleAirportDirection } from '$lib/services/discovery';
import { get } from 'svelte/store';
import { isPlanning } from '$lib/stores/discovery';

export function pollUserLocation() {
	let firstTime = true;
	navigator.geolocation.watchPosition((position: GeolocationPosition) => {
		userLocation.set(position)
		if(firstTime) fitMapToPoints([[position.coords.longitude, position.coords.latitude]]);
		firstTime = false;
	}, () => {
		console.log("Geolocation not available, using default location.");
		inputLocation.set({
			latitude: DEFAULT_LOCATION[0],
			longitude: DEFAULT_LOCATION[1]
		});
		fitMapToPoints([[DEFAULT_LOCATION[1], DEFAULT_LOCATION[0]]]);

	});
}

function locationUpdate() {
	const user = get(userLocation);
	const input = get(inputLocation);
	if(user !== undefined) {
		updateMarker(input === undefined ? 'USER_LOCATION_INACTIVE' : 'USER_LOCATION', [undefined, undefined], undefined, undefined)
		updateMarker(input === undefined ? 'USER_LOCATION' : 'USER_LOCATION_INACTIVE', [undefined, undefined], user.coords.latitude, user.coords.longitude);
		if(!input) updateMarker('INPUT_LOCATION', [undefined, undefined], undefined, undefined);
	}
	if(input !== undefined) updateMarker('INPUT_LOCATION', [undefined, undefined], input.latitude, input.longitude, () => {if(!get(isPlanning)) setMarkerTapped(); inputLocation.set(undefined);});

}
userLocation.subscribe(locationUpdate);
inputLocation.subscribe(locationUpdate);
