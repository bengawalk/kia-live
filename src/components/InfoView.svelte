<script lang="ts">
	import type { Stop } from '$lib/structures/Stop';
	import { onMount } from 'svelte';
	import { infoViewY, isMobile, infoViewWidth, scrollableElement } from '$lib/stores/infoView';
	import { selected } from '$lib/stores/discovery';
	import StopInfo from '$components/StopInfo.svelte';
	import type { Trip } from '$lib/structures/Trip';
	import type { LiveTrip } from '$lib/structures/LiveTrip';
	import TripInfo from '$components/TripInfo.svelte';

	let dragStartY = 0;
	let currentY = 0;
	let heightRatio = 2 / 3;

	function handleResize() {
		isMobile.set(window.innerWidth < 800);
	}

	onMount(() => {
		infoViewY.set(window.innerHeight * heightRatio);
		handleResize();
		window.addEventListener('resize', handleResize);
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
</script>

{#if $selected !== undefined}
	{#if $isMobile}
		<!-- Bottom Sheet Mode -->
		<div
			class="font-[IBM_Plex_Sans] fixed bottom-0 w-full bg-black text-white px-6 py-8 transition-transform duration-300 z-40"
			style="
				height: calc(100vh - {$infoViewY}px);
			"
			role="dialog"
			aria-hidden=true
			on:touchstart={startDrag}
			on:mousedown={startDrag}
		>
			<!-- Scrollable content wrapper -->
				{#if Object.hasOwn($selected, 'stop_id')}
					<StopInfo stop={selectedStop} />
				{/if}
				{#if Object.hasOwn($selected, 'trip_id')}
					<TripInfo trip={selectedTrip} />
				{/if}
		</div>
	{:else}
		<!-- Sidebar Mode -->
		<div class="font-[IBM_Plex_Sans] fixed left-0 top-0 h-full w-[{$infoViewWidth}px] bg-black text-white px-6 py-8 shadow-lg z-40 overflow-y-auto">
			{#if Object.hasOwn($selected, 'stop_id')} <!-- Selected is a stop -->
				<StopInfo stop = {selectedStop} />
			{/if}
			{#if Object.hasOwn($selected, 'trip_id')} <!-- Selected is a trip -->
				<TripInfo trip = {selectedTrip} />
			{/if}
		</div>
	{/if}
{/if}
