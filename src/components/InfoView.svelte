<script lang="ts">
	import type { Stop } from '$lib/structures/Stop';
	import { onMount } from 'svelte';
	import { infoViewY, isMobile, infoViewWidth, scrollableElement } from '$lib/stores/infoView';
	import { selected, selectedMetroStation } from '$lib/stores/discovery';
	import StopInfo from '$components/StopInfo.svelte';
	import type { Trip } from '$lib/structures/Trip';
	import type { LiveTrip } from '$lib/structures/LiveTrip';
	import TripInfo from '$components/TripInfo.svelte';
	import MetroStationInfo from '$components/MetroStationInfo.svelte';
	import { updateBus3DConfig } from '$lib/services/map';

	let dragStartY = 0;
	let currentY = 0;
	let heightRatio = 2 / 3;
	let allStations: string[] = [];
	let rotations: [number, number, number] = [0, 0, 0];

	function handleResize() {
		isMobile.set(window.innerWidth < 800);
	}

	onMount(() => {
		infoViewY.set(window.innerHeight * heightRatio);
		handleResize();
		window.addEventListener('resize', handleResize);

		// Load metro station list
		(async () => {
			try {
				const stationIndex = await fetch('metro/stops/index.json');
				const stationJSON = await stationIndex.json();
				allStations = stationJSON.map((station: any) => station.stop_id);
			} catch (error) {
				console.error('Failed to load metro station index:', error);
			}
		})();

		return () => window.removeEventListener('resize', handleResize);
	});

	function startDrag(e: TouchEvent | MouseEvent) {
		const y = (e as TouchEvent).touches?.[0]?.clientY ?? (e as MouseEvent).clientY;
		const x = (e as TouchEvent).touches?.[0]?.clientX ?? (e as MouseEvent).clientX;
		if ($scrollableElement && $scrollableElement.scrollHeight > $scrollableElement.clientHeight && document.elementsFromPoint(x, y).includes($scrollableElement)) {
			// Allow scrolling to happen inside scrollable
			return;
		}
		dragStartY = y;
		document.addEventListener('touchmove', drag, { passive: false });
		document.addEventListener('touchend', endDrag);
		document.addEventListener('mousemove', drag);
		document.addEventListener('mouseup', endDrag);
	}

	function drag(e: TouchEvent | MouseEvent) {
		e.preventDefault();
		currentY = (e as TouchEvent).touches?.[0]?.clientY ?? (e as MouseEvent).clientY;
		const delta = currentY - dragStartY;
		const screenHeight = window.innerHeight;
		infoViewY.set(Math.min(screenHeight * 2 / 3, Math.max(screenHeight / 3, screenHeight * heightRatio + delta)));
	}

	function endDrag() {
		const screenHeight = window.innerHeight;
		const midpoint = (screenHeight / 3 + screenHeight * 2 / 3) / 2;
		heightRatio = $infoViewY > midpoint ? 2 / 3 : 1 / 3;
		infoViewY.set(screenHeight * heightRatio);

		document.removeEventListener('touchmove', drag);
		document.removeEventListener('touchend', endDrag);
		document.removeEventListener('mousemove', drag);
		document.removeEventListener('mouseup', endDrag);
	}

	$: selectedTrip = $selected as Trip | LiveTrip;
	$: selectedStop = $selected as Stop;
	$: hasSelectedMetro = allStations.includes($selectedMetroStation);
	// console.log(hasSelectedMetro);
	function updateObjX(x) {
		x = x.target.value as number;
		updateBus3DConfig(x, rotations[1], rotations[2]);
		rotations[0] = x;
	}
	function updateObjY(y) {
		y = y.target.value as number;
		updateBus3DConfig(rotations[0], y, rotations[2]);
		rotations[1] = y;
	}
	function updateObjZ(z) {
		z = z.target.value as number;
		updateBus3DConfig(rotations[0], rotations[1], z);
		rotations[2] = z;
	}

</script>

{#if $selected !== undefined || hasSelectedMetro}
	{#if $isMobile}
		<!-- Bottom Sheet Mode -->
		<div
			class="font-[IBM_Plex_Sans] fixed bottom-0 w-full bg-black text-white px-6 py-8 transition-transform duration-300 z-1"
			style="
				height: calc(100vh - {$infoViewY}px);
			"
			role="dialog"
			aria-hidden=true
			on:touchstart={startDrag}
			on:mousedown={startDrag}
		>
			{#if $selected !== undefined && !hasSelectedMetro}
			<!-- Scrollable content wrapper -->
				{#if Object.hasOwn($selected, 'stop_id')}
					<StopInfo stop={selectedStop} />
				{/if}
				{#if Object.hasOwn($selected, 'trip_id')}
					<TripInfo trip={selectedTrip} />
				{/if}
			{/if}
			{#if hasSelectedMetro}
				<MetroStationInfo stationId={$selectedMetroStation} />
			{/if}
		</div>
	{:else}
		<!-- Sidebar Mode -->
		<div class="font-[IBM_Plex_Sans] fixed left-0 top-0 h-full w-[{$infoViewWidth}px] bg-black text-white px-6 py-8 shadow-lg z-1 overflow-y-auto">
			<div>
				<input type="range" min="0" max="360" value="0" class="slider" id="x" on:input={updateObjX}>
				<input type="range" min="0" max="360" value="0" class="slider" id="y" on:input={updateObjY}>
				<input type="range" min="0" max="360" value="0" class="slider" id="z" on:input={updateObjZ}>
			</div>
			{#if $selected !== undefined && !hasSelectedMetro}
				{#if Object.hasOwn($selected, 'stop_id')} <!-- Selected is a stop -->
					<StopInfo stop = {selectedStop} />
				{/if}
				{#if Object.hasOwn($selected, 'trip_id')} <!-- Selected is a trip -->
					<TripInfo trip = {selectedTrip} />
				{/if}
			{/if}
			{#if hasSelectedMetro}
				<MetroStationInfo stationId={$selectedMetroStation} />
			{/if}
		</div>
	{/if}
{/if}
