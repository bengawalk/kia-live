# kia-live
KIA Live App - A Progressive Web Application for live bus tracking and finding KIA buses in Bengaluru.

## Overview

KIA-Live provides real-time transit information by consuming GTFS (General Transit Feed Specification) static data and GTFS-RT (GTFS Realtime) data via WebSocket. The application is built with SvelteKit 2 and functions as a PWA for offline capability. The backend service ingests BMTC website information to provide GTFS static and GTFS-RT data.

### Data Flow & Architecture

**Backend Service:**
- Data is provided by a backend service via GTFS feed and GTFS-RT WebSocket feed
- Backend repository: [kia-live-serverside](https://github.com/bengawalk/kia-live-serverside)

**FAQ:**
- **Source of Truth (for the backend)**: BMTC (Bangalore Metropolitan Transport Corporation) via their Namma BMTC website
- **Realtime Data**: Only static trips that match realtime vehicles are available in our webapp as realtime trips, they are matched by the scheduled start time
- **Static Data Fallback**: Static/schedule trips are shown when realtime trips are no longer available for the location
- **Dynamic Static Data**: Static/schedule data varies based on time of day and historical realtime data, adhering to the scheduled start times provided by the source

## Credits
- *Pravar Choudhary* for the initial designs, iconography, and user flow.
- *Ajith Kumar* for the bus model and image.
- *[Aayush](https://github.com/croyla)* for the project plan and data flow.
- *[Adnan](https://github.com/adnansalik) and [Aayush](https://github.com/croyla)* for the front-end code and design implementation.
- *[Shikha](https://github.com/trinityinblue) and [Aayush](https://github.com/croyla)* for the back-end code and data flow implementation.

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



For further discussions feel free to join the [bengawalk discord server](https://discord.gg/NM3yVpZyu6)
