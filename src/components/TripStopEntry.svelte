<script lang="ts">
	import type { Stop } from '$lib/structures/Stop';
	import { language } from '$lib/stores/language';
	import { selected } from '$lib/stores/discovery';
	import { highlightedStop } from '$lib/stores/discovery';

	export let stop: Stop;
	export let time: Date;
	export let isCurrent: boolean;
	export let onTime: boolean | undefined;
	const textOpacity: "100" | "40" = Date.now() > time.getTime() ? "40" : "100";
	const timeColor: "white" | "red" | "green" = onTime !== undefined ? onTime ? "green" : "red" : "white";
	const timeColorWhite = timeColor === "white";
	const langstring = $language as string;
	const formatOptions: Intl.DateTimeFormatOptions =
		{
			year: undefined,
			weekday: undefined,
			month: undefined,
			day: undefined,
			hour: '2-digit',
			minute: '2-digit',
			second: undefined,
			hour12: false
		};
</script>

<div class="flex justify-between items-center w-full opacity-{textOpacity}">
	<button on:click={() => selected.set(stop)} class="flex gap-1 items-center appearance-none bg-transparent border-none cursor-pointer p-0 m-0 w-full text-left">
		{#if isCurrent}
			<div>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="circle-icon">
					<g clip-path="url(#clip0_3_130)">
						<circle cx="9" cy="9" r="3" fill="white"></circle>
					</g>
					<defs>
						<clipPath id="clip0_3_130">
							<rect width="18" height="18" fill="white" transform="matrix(-1 0 0 1 18 0)"></rect>
						</clipPath>
					</defs>
				</svg>
			</div>
		{/if}
		<span class="text-white {$highlightedStop === stop ? 'font-bold' : ''} ">{Object.hasOwn(stop.stop_name, langstring) ? stop.stop_name[langstring] : stop.stop_name['en']}</span>
	</button>
	<div class=" text-right text-{timeColor}{timeColorWhite ? '' : '-300'} ">{time.toLocaleString(undefined, formatOptions)}</div>
</div>