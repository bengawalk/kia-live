import type { Vehicle } from '$lib/structures/Vehicle';
import type { LiveTrip } from '$lib/structures/LiveTrip';

export type LiveTransitFeed = {
	feed_id: string;
	timestamp: Date;
	vehicles: Vehicle[];
	trips: LiveTrip[];
}