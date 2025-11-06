<script lang="ts">
	import { messages }  from '$lib/stores/language';
	import { infoViewWidth, isMobile, infoViewY } from '$lib/stores/infoView';
	import {
		airportDirection,
		isPlanning,
		selected,
		nextBuses,
		nextBusIndex
	} from '$lib/stores/discovery';
	import { cycleBus, toggleAirportDirection } from '$lib/services/discovery';

	// Reactive variables for circle indicators
	$: direction = ($airportDirection ? 'toAirport' : 'toCity') as 'toAirport' | 'toCity';
	$: busCount = $nextBuses[direction].length;
	$: currentIndex = $nextBusIndex;

	// Debug logging
	$: console.log('MapButtons Debug:', { direction, busCount, currentIndex, isPlanning: $isPlanning, nextBuses: $nextBuses });
</script>

<div
	class="font-[IBM_Plex_Sans] absolute inset-x-0 grid grid-cols-3 items-end mt-auto mb-6 text-sm font-medium text-black z-1 px-6 pointer-events-none"
	style=
		"
			margin-left: {$selected === undefined ? '0' : $isMobile ? '0' : $infoViewWidth}px;
			bottom: calc({$selected === undefined ? '0' : $isMobile ? '100vh - '+ $infoViewY : '0'}px);
		"
>
	<!-- Left-aligned Airport Direction button-->
	<div class="flex flex-col items-start">
		<button
			on:click={() => toggleAirportDirection()}
			class="text-left pointer-events-auto w-fit px-5"
		>
			{$airportDirection ? $messages.ToKIA() : $messages.FromKIA()}
		</button>
		<!-- Spacer to maintain consistent height with Next Bus column -->
		<div class="h-[18px]"></div>
	</div>

	<!-- Center-aligned Plan button -->
	<button
		on:click={() => {}}
		class="text-center text-neutral-400 justify-self-center pointer-events-auto w-fit px-5 opacity-0 pointer-events-none self-start"
	>
		{$isPlanning ? $messages.Planning() : $messages.Plan()}
	</button>

	<!-- Right-aligned Next Bus button with circle indicators -->
	<div class="flex flex-col items-center justify-self-end">
		<button
			on:click={cycleBus}
			class="text-right pointer-events-auto w-full px-5"
		>
			{$isPlanning ? "" : $messages.NextBus()}
		</button>

		<!-- Circle indicators container - always present to maintain height -->
		<div class="flex gap-1 justify-center pointer-events-none h-[18px] items-center w-full">
			{#if !$isPlanning && busCount > 0}
				{#each Array(busCount) as _, i}
					<div
						class="rounded-full transition-all duration-200 border-2"
						class:bg-black={i === currentIndex}
						class:bg-transparent={i !== currentIndex}
						class:border-black={true}
						style="width: {Math.max(6, Math.min(10, 40 / busCount))}px; height: {Math.max(6, Math.min(10, 40 / busCount))}px;">
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

