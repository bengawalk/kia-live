# kia-live
KIA Live App
## Setup

- Install the required packages with the command `yarn` 
- Add a .env file
- Add the environment variable `VITE_MAPBOX_ACCESS_TOKEN` and populate it accordingly.
- Add the environment variables `VITE_LIVE_DATA_SOURCE`, `VITE_STATIC_DATA_SOURCE`, `VITE_STATIC_DATA_VERSION` to facilitate data ingest. CORS-enabled GTFS and GTFS-RT endpoints are expected.

## Developing

```bash
# Starting the server in a dev environment
yarn run dev

# or start the server and open the app in a new browser tab
yarn run dev -- --open
```

## Building

To create a production version of your app:

```bash
yarn run build
```

You can preview the production build with `yarn run preview`.

The app is intended to function as PWA.
