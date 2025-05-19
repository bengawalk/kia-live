<script lang="ts">
    import { onMount } from 'svelte';
    import { transitFeedActions,transitFeedStore } from '$lib/stores/transitFeedStore';
    import JSZip from 'jszip';

    let isLoading = false;
    let error: string | null = null;

    async function loadGTFSData(): Promise<boolean> {
        isLoading = true;
        error = null;
        
        try {
            // 1. Get environment variables
            const staticDataSource = import.meta.env.VITE_STATIC_DATA_SOURCE;
            const versionSource = import.meta.env.VITE_STATIC_DATA_VERSION;

            if (!staticDataSource || !versionSource) {
                throw new Error('Missing required environment variables');
            }

            // 2. Get local version
            const localVersion = await transitFeedActions.getVersion();
            const versionResponse = await fetch(versionSource);
            if (!versionResponse.ok) {
                throw new Error('Failed to fetch version info');
            }

            const latestVersion = await versionResponse.text();

            // 3. Skip download if versions match
            if (localVersion === latestVersion) {
                console.log('GTFS data is up to date');
                return true;
            }

            // 4. Fetch and process new data
            const dataResponse = await fetch(staticDataSource);
            if (!dataResponse.ok) {
                throw new Error('Failed to fetch GTFS data');
            }

            const zipData = await dataResponse.arrayBuffer();
            const zip = await JSZip.loadAsync(zipData);

            // Process required files
            const processFile = async (filename: string) => {
                const file = zip.file(filename);
                if (!file) throw new Error(`Missing required file: ${filename}`);
                const content = await file.async('text');
                // return parseFile(content);
            };

            const [stops, routes] = await Promise.all([
                processFile('stops.txt'),
                processFile('routes.txt')
            ]);


            // Update store
            transitFeedActions.updateVersion(latestVersion);
            transitFeedActions.updateTimestamp(new Date().toISOString());
            return true;
        } catch (err) {
            error = err instanceof Error ? err.message : 'Failed to load GTFS data';
            console.error('GTFS load error:', err);
            return false;
        } finally {
            isLoading = false;
        }
    }
</script>

{#if isLoading}
    <div class="loading-indicator">Loading transit data...</div>
{:else if error}
    <div class="error-message">
        Error loading transit data: {error}
        <button on:click={loadGTFSData}>Retry</button>
    </div>
{/if}