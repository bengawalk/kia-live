<script lang="ts">
	import { messages }  from '$lib/stores/language';
	import { infoViewWidth, isMobile, infoViewY } from '$lib/stores/infoView';
	import {
		airportDirection,
		isPlanning,
		nextBuses,
		nextBusIndex,
		selected,
		selectedTripID
	} from '$lib/stores/discovery';
	import { cycleBus } from '$lib/services/discovery';
</script>

<div
	class="font-[IBM_Plex_Sans] absolute inset-x-0 grid grid-cols-3 items-end mt-auto mb-6 text-sm font-medium text-black z-40 px-6 pointer-events-none"
	style=
		"
			margin-left: {$selected === undefined ? '0' : $isMobile ? '0' : $infoViewWidth}px;
			bottom: calc({$selected === undefined ? '0' : $isMobile ? '100vh - '+ $infoViewY : '0'}px);
		"
>
	<!-- Left-aligned -->
	<button
		on:click={() => {
						nextBusIndex.set($nextBusIndex === -1 ? -1 : $nextBuses[$airportDirection ? 'toCity' : 'toAirport'].length >= $nextBusIndex ? $nextBuses[$airportDirection ? 'toCity' : 'toAirport'].length - 1 : $nextBusIndex);
			airportDirection.set(!$airportDirection);
			selectedTripID.set(undefined);
		}}
		class="text-left pointer-events-auto w-fit px-2"
	>
		{$airportDirection ? $messages.ToKIA() : $messages.FromKIA()}
	</button>

	<!-- Center-aligned -->
	<button
		on:click={() => {}}
		class="text-center text-neutral-400 justify-self-center pointer-events-auto w-fit px-2"
	>
		{$isPlanning ? $messages.Planning() : $messages.Plan()}
	</button>

	<!-- Right-aligned -->
	<button
		on:click={cycleBus}
		class="text-right justify-self-end pointer-events-auto w-fit px-2"
	>
		{$isPlanning ? "" : $messages.NextBus()}
	</button>
</div>

