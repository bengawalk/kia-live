import { writable } from 'svelte/store';

export const isMobile = writable<boolean>(false);
export const infoViewWidth = writable<number>(400);
export const infoViewY = writable<number>(0);
