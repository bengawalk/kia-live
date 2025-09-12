<script lang="ts">
	import TripStopEntry from '$components/TripStopEntry.svelte';
	import type { LiveTrip } from '$lib/structures/LiveTrip';
	import type { Trip } from '$lib/structures/Trip';
	import infoBus from '$assets/info-bus.svg?raw';
	import { transitFeedStore, liveTransitFeed } from '$lib/stores/transitFeedStore';
	import type { Stop } from '$lib/structures/Stop';
	import { scrollableElement } from '$lib/stores/infoView';
	import { isMobile } from '$lib/stores/infoView';
	import { onMount } from 'svelte';

	// Prop
	export let trip: Trip | LiveTrip;

	// Constants
	const route = $transitFeedStore.routes.find((value) => value.route_id === trip.route_id);
	const routename = route ? route.route_short_name : trip.route_id;
	const stops: [Stop, Date, boolean | undefined][] = [];
	const now = new Date();
	const isLiveTrip = Object.hasOwn(trip, 'vehicle_id');
	$liveTransitFeed; // update on live transit feed change
	const staticTrip = route ? route.trips.find((value) => value.trip_id === trip.trip_id) : undefined;


	// Variables
	let currentStop: string | undefined = undefined;
	let scrollHeightStyle = '';
	// Processing
	for(const currStop of trip.stops) {
		// Assuming stop_time or livetrip equivalent stores in {YYYY}-{MM}-{DD}T{HH}:{MM}:{SS}.000{+5:30} or other Date compatible format
		let datetime = currStop.stop_date();
		const currStopID = currStop.stop_id;
		const currStaticStop = isLiveTrip && staticTrip ? staticTrip.stops.find((value) => value.stop_id === currStopID) : undefined;
		const onTime = currStaticStop && currentStop === undefined ? currStaticStop.stop_date() <= datetime : undefined;
		stops.push([$transitFeedStore.stops[currStopID], datetime, onTime]);
		if(now > datetime || currentStop !== undefined) {
			continue;
		}
		currentStop = currStopID;
	}

	const updateScrollHeight = () => {
		const offset = ((window.innerHeight / 3) / 2) + 225;
		scrollHeightStyle = `height: calc(100vh - ${offset}px);`;
	};

	onMount(() => {
		updateScrollHeight();
		window.addEventListener('resize', updateScrollHeight);
		return () => window.removeEventListener('resize', updateScrollHeight);
	});
</script>

<section class="text-sm flex flex-col gap-2 p-6 mx-auto max-w-none bg-transparent w-[346px] max-md:p-4 max-md:w-full max-md:max-w-[991px] max-sm:p-3 max-sm:max-w-screen-sm">
	<!-- Bus header with icon and number -->
	<div class="flex justify-between items-center w-full">
		<div class="flex gap-1 items-center">
			<div>
				{@html infoBus}
			</div>
			<span class=" text-white">{routename}</span>
		</div>
		<div class="text-right text-white"></div>
	</div>
	<div class="overflow-y-scroll scrollbar-hide"
			 style={$isMobile ? scrollHeightStyle : undefined}
			 bind:this={$scrollableElement}>
	<!-- Bus stops -->
	{#each stops as stop}
		<TripStopEntry stop={stop[0]} time={stop[1]} isCurrent={stop[0].stop_id === currentStop} onTime={stop[2]} />
	{/each}
	</div>
</section>
