<script lang="ts">
	import { language } from '$lib/stores/language';

	export let departure: {
		time: string;
		headsign: { en: string; kn: string };
		route_id: string;
		route_name: string;
		route_color: string;
		direction_id: number;
		trip_id: string;
	};

	$: headsign = $language === 'kn' ? departure.headsign.kn : departure.headsign.en;
</script>

<div class="grid grid-cols-[80px_120px_1fr] gap-2 text-sm py-2 w-full items-center border-b border-neutral-800">
	<!-- Route badge with color -->
	<div class="flex items-center gap-2">
		<div
			class="px-2 py-1 rounded text-white text-xs font-medium text-center min-w-[60px]"
			style="background-color: #{departure.route_color};"
		>
			{departure.route_name.toUpperCase()}
		</div>
	</div>

	<!-- Departure time -->
	<div class="text-neutral-300 text-xs text-left">
		{headsign}
	</div>

	<!-- Headsign/Terminus -->
	<div class="text-neutral-300 text-right text-xs truncate">
		{departure.time}
	</div>
</div>