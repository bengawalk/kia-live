<script lang="ts">
	import { onMount } from 'svelte';
	import { language } from '$lib/stores/language';
	import { scrollableElement, isMobile } from '$lib/stores/infoView';
	import StationDepartureEntry from '$components/StationDepartureEntry.svelte';
	import metroIcon from '$assets/metro-icon.svg?raw';

	export let stationId: string;

	interface MetroStationData {
		stop_id: string;
		stop_name: string;
		stop_name_translations?: { kn?: string };
		location: { lat: number; lon: number };
		zone_id: string;
		color: string;
		departures: {
			weekday?: Array<{
				time: string;
				headsign: { en: string; kn: string };
				route_id: string;
				route_name: string;
				route_color: string;
				direction_id: number;
				trip_id: string;
			}>;
			sunday?: Array<{
				time: string;
				headsign: { en: string; kn: string };
				route_id: string;
				route_name: string;
				route_color: string;
				direction_id: number;
				trip_id: string;
			}>;
			holiday?: Array<{
				time: string;
				headsign: { en: string; kn: string };
				route_id: string;
				route_name: string;
				route_color: string;
				direction_id: number;
				trip_id: string;
			}>;
		};
	}

	let stationData: MetroStationData | null = null;
	let loading = true;
	let error = false;
	let currentTime = new Date();
	let scrollHeightStyle = '';

	// Filter state
	let selectedRoutes: Set<string> = new Set();
	let selectedDestinations: Set<string> = new Set();

	// Determine current service type based on day of week
	function getCurrentServiceType(): 'weekday' | 'sunday' | 'holiday' {
		const today = new Date();
		const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

		// Sunday
		if (dayOfWeek === 0) {
			return 'sunday';
		}

		// Saturday - check if it's 2nd or 4th Saturday (holiday)
		if (dayOfWeek === 6) {
			const date = today.getDate();
			const weekOfMonth = Math.ceil(date / 7);
			// 2nd and 4th Saturdays are holidays
			if (weekOfMonth === 2 || weekOfMonth === 4) {
				return 'holiday';
			}
			// All other Saturdays are weekdays
			return 'weekday';
		}

		// Monday-Friday
		return 'weekday';
	}

	async function loadStationData() {
		loading = true;
		error = false;

		try {
			const response = await fetch(`metro/stops/${stationId}.json`);
			if (!response.ok) {
				console.error(`Metro station data not found for ${stationId}`);
				error = true;
				return;
			}

			stationData = await response.json();
			console.log('Metro station data loaded:', stationData);
		} catch (err) {
			console.error('Failed to load metro station data:', err);
			error = true;
		} finally {
			loading = false;
		}
	}

	const updateScrollHeight = () => {
		const offset = ((window.innerHeight / 3) / 2) + 225;
		scrollHeightStyle = `height: calc(100vh - ${offset}px);`;
	};

	onMount(() => {
		loadStationData();
		updateScrollHeight();

		// Update current time every minute to refresh departure list
		const interval = setInterval(() => {
			currentTime = new Date();
		}, 60000); // 60000ms = 1 minute

		window.addEventListener('resize', updateScrollHeight);

		return () => {
			clearInterval(interval);
			window.removeEventListener('resize', updateScrollHeight);
		};
	});

	$: if (stationId) {
		loadStationData();
		// Reset filters when station changes
		selectedRoutes = new Set();
		selectedDestinations = new Set();
	}

	$: stationName = stationData
		? $language === 'kn' && stationData.stop_name_translations?.kn
			? stationData.stop_name_translations.kn
			: stationData.stop_name
		: '';

	$: serviceType = getCurrentServiceType();
	$: allDepartures = stationData?.departures[serviceType] || [];

	// Filter out terminus stations (where headsign matches station name)
	$: filteredDepartures = allDepartures.filter((dep) => {
		const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
		return headsign !== stationName;
	});

	// Get next 10 departures WITHOUT filters (core list for filter options)
	$: nextDeparturesUnfiltered = (() => {
		if (!filteredDepartures.length) return [];

		// Use currentTime to trigger reactivity
		const now = currentTime;
		const currentMinutes = now.getHours() * 60 + now.getMinutes();

		// Filter departures that haven't passed yet today
		const upcomingToday = filteredDepartures.filter((dep) => {
			const [hours, minutes] = dep.time.split(':').map(Number);
			const depMinutes = hours * 60 + minutes;
			return depMinutes >= currentMinutes;
		});

		// If we have enough upcoming departures today, return them
		if (upcomingToday.length >= 10) {
			return upcomingToday.slice(0, 10);
		}

		// Otherwise, add departures from the beginning of the schedule (next day)
		const remainingCount = 10 - upcomingToday.length;
		const nextDayDepartures = filteredDepartures.slice(0, remainingCount);

		return [...upcomingToday, ...nextDayDepartures].slice(0, 10);
	})();

	// Get next 10 departures WITH filters applied (actually displayed)
	$: nextDepartures = (() => {
		let deps = filteredDepartures;

		// Apply route filter
		if (selectedRoutes.size > 0) {
			deps = deps.filter((dep) => selectedRoutes.has(dep.route_name));
		}

		// Apply destination filter
		if (selectedDestinations.size > 0) {
			deps = deps.filter((dep) => {
				const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
				const key = `${dep.route_name}-${headsign}`;
				return selectedDestinations.has(key);
			});
		}

		if (!deps.length) return [];

		// Use currentTime to trigger reactivity
		const now = currentTime;
		const currentMinutes = now.getHours() * 60 + now.getMinutes();

		// Filter departures that haven't passed yet today
		const upcomingToday = deps.filter((dep) => {
			const [hours, minutes] = dep.time.split(':').map(Number);
			const depMinutes = hours * 60 + minutes;
			return depMinutes >= currentMinutes;
		});

		// If we have enough upcoming departures today, return them
		if (upcomingToday.length >= 10) {
			return upcomingToday.slice(0, 10);
		}

		// Otherwise, add departures from the beginning of the schedule (next day)
		const remainingCount = 10 - upcomingToday.length;
		const nextDayDepartures = deps.slice(0, remainingCount);

		return [...upcomingToday, ...nextDayDepartures].slice(0, 10);
	})();

	// Core filter list from unfiltered departures
	$: coreRoutes = new Set(
		nextDeparturesUnfiltered.map((dep) => dep.route_name)
	);

	$: coreDestinations = new Set(
		nextDeparturesUnfiltered.map((dep) => {
			const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
			return `${dep.route_name}-${headsign}`;
		})
	);

	// Build unique routes: core list + any additional from filtered results
	$: uniqueRoutes = (() => {
		const routeMap = new Map<string, { name: string; color: string }>();

		// Add core routes
		for (const dep of nextDeparturesUnfiltered) {
			if (!routeMap.has(dep.route_name)) {
				routeMap.set(dep.route_name, { name: dep.route_name, color: dep.route_color });
			}
		}

		// Add any additional routes from filtered results (non-core)
		for (const dep of nextDepartures) {
			if (!routeMap.has(dep.route_name)) {
				routeMap.set(dep.route_name, { name: dep.route_name, color: dep.route_color });
			}
		}

		return Array.from(routeMap.values());
	})();

	// Build unique destinations: core list + any additional from filtered results
	// Hide destinations that don't match selected route filter
	$: uniqueDestinations = (() => {
		const destMap = new Map<string, { route: string; destination: string; color: string; isCore: boolean }>();

		// Add core destinations
		for (const dep of nextDeparturesUnfiltered) {
			const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
			const key = `${dep.route_name}-${headsign}`;
			if (!destMap.has(key)) {
				destMap.set(key, {
					route: dep.route_name,
					destination: headsign,
					color: dep.route_color,
					isCore: true
				});
			}
		}

		// Add any additional destinations from filtered results (non-core)
		for (const dep of nextDepartures) {
			const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
			const key = `${dep.route_name}-${headsign}`;
			if (!destMap.has(key)) {
				destMap.set(key, {
					route: dep.route_name,
					destination: headsign,
					color: dep.route_color,
					isCore: false
				});
			}
		}

		// Filter based on selected routes (hide irrelevant destinations)
		let results = Array.from(destMap.values());
		if (selectedRoutes.size > 0) {
			results = results.filter(dest => selectedRoutes.has(dest.route));
		}

		// Remove non-core destinations that are no longer in nextDepartures
		const currentDepartureKeys = new Set(
			nextDepartures.map(dep => {
				const headsign = $language === 'kn' ? dep.headsign.kn : dep.headsign.en;
				return `${dep.route_name}-${headsign}`;
			})
		);

		results = results.filter(dest => {
			const key = `${dest.route}-${dest.destination}`;
			return dest.isCore || currentDepartureKeys.has(key);
		});

		return results;
	})();

	function toggleRouteFilter(routeName: string) {
		if (selectedRoutes.has(routeName)) {
			selectedRoutes.delete(routeName);
		} else {
			selectedRoutes.add(routeName);
		}
		selectedRoutes = selectedRoutes; // Trigger reactivity
	}

	function toggleDestinationFilter(key: string) {
		if (selectedDestinations.has(key)) {
			selectedDestinations.delete(key);
		} else {
			selectedDestinations.add(key);
		}
		selectedDestinations = selectedDestinations; // Trigger reactivity
	}
</script>

<section
	class="flex flex-col gap-2 p-6 mx-auto max-w-none bg-transparent w-[346px] max-md:p-4 max-md:w-full max-md:max-w-[991px] max-sm:p-3 max-sm:max-w-screen-sm"
>
	<!-- Station header with icon and name -->
	<div class="flex justify-between items-center w-full mb-2">
		<div class="flex gap-2 items-center">
			<div class="w-7 h-7 [&>svg]:w-full [&>svg]:h-full">
				{@html metroIcon}
			</div>
			<span class="text-sm text-white max-md:text-sm max-sm:text-xs">{stationName}</span>
		</div>
	</div>

	{#if loading}
		<div class="text-neutral-400 text-sm">Loading station information...</div>
	{:else if error}
		<div class="text-red-400 text-sm">Failed to load station information</div>
	{:else if !stationData}
		<div class="text-neutral-400 text-sm">No station data available</div>
	{:else}
		<!-- Route filter (only show if multiple routes) -->
		{#if uniqueRoutes.length > 1}
			<div class="flex flex-wrap gap-2 mt-2">
				{#each uniqueRoutes as route}
					<button
						on:click={() => toggleRouteFilter(route.name)}
						class="px-3 py-1 rounded text-xs font-medium transition-opacity"
						class:opacity-100={selectedRoutes.size === 0 || selectedRoutes.has(route.name)}
						class:opacity-40={selectedRoutes.size > 0 && !selectedRoutes.has(route.name)}
						style="background-color: #{route.color}; color: white;"
					>
						{route.name.toUpperCase()}
					</button>
				{/each}
			</div>
		{/if}
		<span class="text-[10.8px] font-light text-neutral-400 italic">(!) Metro timings are estimated on publicly available sources.</span>
		<!-- Destination filter (only show if multiple destinations) -->
		{#if uniqueDestinations.length > 1}
			<div class="flex flex-wrap gap-2 mt-2">
				{#each uniqueDestinations as dest}
					{@const key = `${dest.route}-${dest.destination}`}
					<button
						on:click={() => toggleDestinationFilter(key)}
						class="px-2 py-1 rounded text-xs transition-opacity flex items-center gap-1"
						class:opacity-100={selectedDestinations.size === 0 || selectedDestinations.has(key)}
						class:opacity-40={selectedDestinations.size > 0 && !selectedDestinations.has(key)}
						class:bg-neutral-800={true}
						class:text-white={true}
					>
						<span class="w-2 h-2 rounded-full" style="background-color: #{dest.color};"></span>
						<span>{dest.destination}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Header -->
		<div class="grid grid-cols-[80px_120px_1fr] gap-2 text-[10px] text-neutral-400 uppercase mt-2">
			<div class="text-center">Line</div>
			<div class="text-left">Destination</div>
			<div class="text-right">Departure</div>
		</div>

		<!-- Scrollable departures list -->
		<div
			class="overflow-y-scroll scrollbar-hide"
			style={$isMobile ? scrollHeightStyle : undefined}
			bind:this={$scrollableElement}
		>
			{#if nextDepartures.length === 0}
				<div class="text-neutral-400 text-sm py-4">No upcoming departures</div>
			{:else}
				{#each nextDepartures as departure}
					<StationDepartureEntry {departure} />
				{/each}
			{/if}
		</div>
	{/if}
</section>