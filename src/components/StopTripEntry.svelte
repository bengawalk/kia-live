<script lang="ts">
	import type { Trip } from '$lib/structures/Trip';
	import type { LiveTrip } from '$lib/structures/LiveTrip';
	import { transitFeedStore } from '$lib/stores/transitFeedStore';
	import { selected } from '$lib/stores/discovery';

	export let trip: Trip | LiveTrip;
	export let selectedStop: string;


	const isLiveTrip = Object.hasOwn(trip, 'vehicle_id');
	const route = $transitFeedStore.routes.find((value) => value.route_id === trip.route_id);
	const routename = route ? route.route_short_name : trip.route_id;
	const staticTrip = route ? route.trips.find((value) => value.trip_id === trip.trip_id) : undefined;
	const currentStaticStopEntry = isLiveTrip && staticTrip ? staticTrip.stops.find((value) => value.stop_id === selectedStop) : undefined
	const staticStopTime = currentStaticStopEntry ? currentStaticStopEntry.stop_date() : undefined;
	const currentStopEntry = trip.stops.find((value) => value.stop_id === selectedStop);
	const isLastStop = currentStopEntry ? currentStopEntry.stop_id === trip.stops[trip.stops.length - 1].stop_id : undefined;
	const stopTime = !currentStopEntry ? undefined : currentStopEntry.stop_date();
	const departureOnTime = isLiveTrip && stopTime && staticStopTime ? staticStopTime >= stopTime : undefined;
	const arrivalOnTime = isLiveTrip && staticTrip ? staticTrip.stops[staticTrip.stops.length - 1].stop_date() >= trip.stops[trip.stops.length - 1].stop_date() : undefined
	const formatOptions: Intl.DateTimeFormatOptions =
		{
			year: undefined,
			weekday: undefined,
			month: undefined,
			day: undefined,
			hour: '2-digit',
			minute: '2-digit',
			second: undefined,
			hour12: false,
		};
	const departure = isLastStop ? '-' : new Date(stopTime ? stopTime : trip.stops[0].stop_date()).toLocaleString(undefined, formatOptions);
	const eta = new Date(trip.stops[trip.stops.length - 1].stop_date()).toLocaleString(undefined, formatOptions);
</script>

<div class="grid grid-cols-3 text-sm py-1 w-full">
	<button class="text-white appearance-none bg-transparent border-none cursor-pointer p-0 m-0 w-full text-left" on:click={() => selected.set(trip)}>{routename}{isLiveTrip ? " •" : ""}</button>
	<div class="text-right {!isLiveTrip ? 'text-neutral-400' : departureOnTime ? 'text-green-300' : 'text-red-300'}">{departure}</div>
	<div class="text-right {!isLiveTrip ? 'text-neutral-400' : arrivalOnTime ? 'text-green-300' : 'text-red-300'}">{eta}</div>
</div>
