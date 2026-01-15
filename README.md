# kia-live
KIA Live App - A Progressive Web Application for live bus tracking and finding KIA buses in Bengaluru.

## Overview

KIA-Live provides real-time transit information by consuming GTFS (General Transit Feed Specification) static data and GTFS-RT (GTFS Realtime) data via WebSocket. The application is built with SvelteKit 2 and functions as a PWA for offline capability.

### Data Flow & Architecture

**Backend Service:**
- Data is provided by a backend service via GTFS feed and GTFS-RT WebSocket feed
- Backend repository: [kia-live-serverside](https://github.com/bengawalk/kia-live-serverside)

**FAQ:**
- **Source of Truth (for the backend)**: BMTC (Bangalore Metropolitan Transport Corporation) via their Namma BMTC web application
- **Realtime Data**: Only static trips that match realtime vehicles are available in our webapp as realtime trips
- **Static Data Fallback**: Static/schedule trips are shown when realtime trips are no longer available for the location
- **Dynamic Static Data**: Static/schedule data varies based on time of day and historical realtime data

## Local Setup

- Install the required packages with the command `yarn`
- Add a .env file
- Add the environment variables `VITE_LIVE_DATA_SOURCE`, `VITE_STATIC_DATA_SOURCE`, `VITE_STATIC_DATA_VERSION` to facilitate data ingest. CORS-enabled GTFS and GTFS-RT endpoints are expected.

## Developing

```bash
# Starting the server in a dev environment
yarn run dev

# or start the server and open the app in a new browser tab
yarn run dev -- --open
```

## Building

To create a production version of the app:

```bash
yarn run build
```

You can preview the production build with `yarn run preview`.

The app is intended to function as PWA.
