import type { LayerSpecification } from 'mapbox-gl';
import mapLocationUser from '../assets/map-location-user.svg?raw';
import mapLocationInput from '../assets/map-location-input.svg?raw';
import mapBus from '../assets/map-bus.svg?raw';
import mapStop from '../assets/map-stop.svg?raw';

// type definitions used ONLY in this file

type ElementMapStyle = {
	type: 1;
	html: () => HTMLElement;
}
type LayerMapStyle = {
	type: 0;
	specification: LayerSpecification;
}

type MapStyle = ElementMapStyle | LayerMapStyle;


// helper functions used ONLY in this file

function createMarkerElement(elementKey: keyof typeof MAP_STYLES): HTMLElement {
	if(MAP_STYLES[elementKey].type === 0) {
		throw Error;
	}

	const element = document.createElement('div');
	element.innerHTML = SVG_ICONS[elementKey];
	return element;
}

// constants

const SVG_ICONS: Record<keyof typeof MAP_STYLES, string> = {
	"USER_LOCATION": mapLocationUser,
	"USER_LOCATION_INACTIVE": mapLocationUser,
	"INPUT_LOCATION": mapLocationInput,
	"BUS": mapBus,
	"BUS_STOP": mapStop,
}

export const MAP_STYLES: Record<string, MapStyle> = {
	"BLACK_LINE": {
		"type": 0,
		"specification": {
			"id": "BLACK_LINE",
			"type": "line",
			"source": "BLACK_LINE",
			"paint": {
				"line-color": "#000000",
				"line-width": {
					"type": "exponential",
					"base": 1,
					"stops": [
						[10, 3],
						[14, 8],
						[18, 3]
					]
				}
			},
			"layout": {
				"line-join": "round",
				"line-cap": "round"
			}
		}
	},
	"GRAY_LINE": {
		"type": 0,
		"specification": {
			"id": "GRAY_LINE",
			"type": "line",
			"source": "GRAY_LINE",
			"paint": {
				"line-color": "#999999",
				"line-width": {
					"type": "exponential",
					"base": 1,
					"stops": [
						[10, 3],
						[14, 8],
						[18, 3]
					]
				}
			},
			"layout": {
				"line-join": "round",
				"line-cap": "round"
			}
		}
	},
	"THIN_LINE": {
		"type": 0,
		"specification": {
			"id": "THIN_LINE",
			"type": "line",
			"source": "THIN_LINE",
			"paint": {
				"line-color": "#000000",
				"line-width": {
					"type": "exponential",
					"base": 1,
					"stops": [
						[10, 1],
						[14, 1],
						[18, 1]
					]
				}
			},
			"layout": {
				"line-join": "round",
				"line-cap": "round"
			}
		}
	},
	"WHITE_BLACK_CIRCLE": {
		"type": 0,
		"specification": {
			"id": "WHITE_BLACK_CIRCLE",
			"type": "circle",
			"source": "WHITE_BLACK_CIRCLE",
			"paint": {
				"circle-radius": {
					"type": "exponential",
					"base": 1,
					"stops": [
						[10, 2],
						[14, 6],
						[18, 2]
					]
				},
				"circle-color": "#ffffff",
				"circle-stroke-color": "#000000",
				"circle-stroke-width": 2
			}
		}
	},
	"WHITE_GRAY_CIRCLE": {
		"type": 0,
		"specification": {
			"id": "WHITE_GRAY_CIRCLE",
			"type": "circle",
			"source": "WHITE_GRAY_CIRCLE",
			"paint": {
				"circle-radius": {
					"type": "exponential",
					"base": 1,
					"stops": [
						[10, 2],
						[14, 6],
						[18, 2]
					]
				},
				"circle-color": "#ffffff",
				"circle-stroke-color": "#999999",
				"circle-stroke-width": 2
			}
		}
	},
	"USER_LOCATION": {
		"type": 1,
		"html": () => createMarkerElement("USER_LOCATION")
	},
	"USER_LOCATION_INACTIVE": {
		"type": 1,
		"html": () => createMarkerElement("USER_LOCATION_INACTIVE")
	},
	"INPUT_LOCATION": {
		"type": 1,
		"html": () => createMarkerElement("INPUT_LOCATION")
	},
	"BUS_STOP": {
		"type": 1,
		"html": () => createMarkerElement("BUS_STOP")
	},
	"BUS": {
		"type": 1,
		"html": () => createMarkerElement("BUS")
	},
}