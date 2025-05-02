<script lang="ts">
	import { messages }  from '$lib/stores/language';
	import { airportDirection, isPlanning } from '$lib/stores/buttons';
	import { sidebarWidth, isMobile, bottomSheetY, selected } from '$lib/stores/infoView';
</script>

<div
	class="absolute inset-x-0 grid grid-cols-3 items-end mt-auto mb-6 text-sm font-medium text-black z-40 px-6 pointer-events-none"
	style=
		"
			margin-left: {$selected === undefined ? '0' : $isMobile ? '0' : $sidebarWidth}px;
			bottom: calc({$selected === undefined ? '0' : $isMobile ? '100vh - '+ $bottomSheetY : '0'}px);
		"
>
	<!-- Left-aligned -->
	<button
		on:click={() => { airportDirection.set(!$airportDirection) }}
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
		on:click={() => {}}
		class="text-right justify-self-end pointer-events-auto w-fit px-2"
	>
		{$isPlanning ? "" : $messages.NextBus()}
	</button>
</div>

