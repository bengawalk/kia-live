<script lang="ts">
    import { transitFeedActions } from '$lib/stores/transitFeedStore';

    let isLoading = false;

    async function loadGTFSData() {
        isLoading = true;
        try {
            const response = await fetch('/api/gtfs/static');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Transform stops data
            const stopsDict = data.stops.reduce((acc: Record<string, any>, stop: any) => {
                acc[stop.stop_id] = {
                    stop_id: stop.stop_id,
                    stop_name: stop.stop_name,
                    stop_lat: parseFloat(stop.stop_lat),
                    stop_lon: parseFloat(stop.stop_lon)
                };
                return acc;
            }, {});

            // Update store
            transitFeedActions.updateRoutes(data.routes);
            transitFeedActions.updateStops(stopsDict);
            transitFeedActions.updateVersion(data.feed_version);
            transitFeedActions.updateTimestamp(new Date().toISOString());
        } catch (err) {
            console.error('GTFS load error:', err);     
            
        } finally {
            isLoading = false;
        }
    }
</script>