import { writable } from 'svelte/store';
import type { Trip } from '$lib/structures/Trip';
import type { Stop } from '$lib/structures/Stop';
import type { LiveTrip } from '$lib/structures/LiveTrip';

export const isMobile = writable<boolean>(false);
export const sidebarWidth = writable<number>(400);
export const bottomSheetY = writable<number>(0);
export const selected = writable<Stop | Trip | LiveTrip | undefined>();