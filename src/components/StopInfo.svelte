<script lang="ts">
	import type { Stop } from '$lib/structures/Stop';
	import type { Trip } from '$lib/structures/Trip';
	import type { LiveTrip } from '$lib/structures/LiveTrip';
	import { language } from '$lib/stores/language';
	import { liveTransitFeed, transitFeedStore } from '$lib/stores/transitFeedStore';
	import StopTripEntry from '$components/StopTripEntry.svelte';
	import infoStop from '$assets/info-stop.svg?raw';
	import { scrollableElement } from '$lib/stores/infoView';

	export let stop: Stop;

	const routes = $transitFeedStore.routes.filter(value => value.stops.includes(stop) /* && value.stops[value.stops.length - 1] !== stop */); // Uncomment to remove terminating routes
	const routeIds = routes.map(route => route.route_id);
	const staticTrips = routes.flatMap(value => value.trips);
	const liveTrips = $liveTransitFeed ? $liveTransitFeed.trips.filter(value => routeIds.includes(value.route_id)) : [];
	const totalTrips = [...liveTrips, ...staticTrips];
	const tripArrivals = new Map<string, Date>();

	for (const trip of totalTrips) {
		if (!trip.stops.length) continue;
		const last = trip.stops[trip.stops.length - 1];
		const date = last.stop_date(); // today by default
		if(date < new Date())
			date.setDate(date.getDate() + 1);

		tripArrivals.set(trip.trip_id, date);
	}
	const sortedTrips = totalTrips.sort((a, b) =>
		tripArrivals.get(a.trip_id).getTime() - tripArrivals.get(b.trip_id).getTime());
	const allTrips = Array.from(
		sortedTrips.reduce((map, item) =>
			(!map.has(item.trip_id) || ('vehicle_id' in item && !('vehicle_id' in map.get(item.trip_id)!)))
				? map.set(item.trip_id, item)
				: map, new Map<string, Trip | LiveTrip>()
		).values()
	).slice(0, 10);


</script>

<section class="flex flex-col gap-2 p-6 mx-auto max-w-none bg-transparent w-[346px] max-md:p-4 max-md:w-full max-md:max-w-[991px] max-sm:p-3 max-sm:max-w-screen-sm">
	<!-- Stop header with icon and name -->
	<div class="flex justify-between items-center w-full">
		<div class="flex gap-1 items-center">
			<div>
				{@html infoStop}
			</div>
			<span class="text-sm text-white max-md:text-sm max-sm:text-xs">{Object.hasOwn(stop.stop_name, $language) ? stop.stop_name[$language] : stop.stop_name['en']}</span>
		</div>
		<div class="text-sm text-right text-white max-md:text-sm max-sm:text-xs"></div>
	</div>
	<!-- Header -->
	<div class="grid grid-cols-3 text-[10px] text-neutral-400 uppercase mt-2">
		<div>Bus number</div>
		<div class="text-right">Departure</div>
		<div class="text-right">ETA</div>
	</div>
	<div class="overflow-y-scroll scrollbar-hide"
			 style="
	height: calc(100vh - {((window.innerHeight / 3) / 2) + 250}px);
	" bind:this={$scrollableElement}>
	<!-- Trips -->
	{#each allTrips as e}
		<StopTripEntry trip={e} selectedStop={stop.stop_id} />
	{/each}
	</div>
</section>
