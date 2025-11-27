import type { LayerSpecification } from 'mapbox-gl';
import mapLocationUser from '$assets/map-location-user.svg?raw';
import mapLocationInput from '$assets/map-location-input.svg?raw';
import mapBus from '$assets/map-bus.svg?raw';
import mapStop from '$assets/map-stop.svg?raw';
import mapBusLive from '$assets/map-bus-live.svg?raw';
import mapStopLive from '$assets/map-stop-live.svg?raw';
import busGlb from '$assets/bus3.glb?url';
import busPng from '$assets/bus2.png';

// type definitions used ONLY in this file

type ElementMapStyle = {
	type: 1;
	html: () => HTMLElement;
};
type LayerMapStyle = {
	type: 0;
	specification: LayerSpecification;
};

type MapStyle = ElementMapStyle | LayerMapStyle;

// helper services used ONLY in this file
function createMarkerElement(
	elementKey: keyof typeof MAP_STYLES,
	highlight: boolean = true,
): HTMLElement {
	if (MAP_STYLES[elementKey].type === 0) {
		throw Error;
	}

	const element = document.createElement('div');

	// if(!highlight) {
	// 	element.style.filter = " invert(1) brightness(60%);";
	// }
	element.innerHTML = highlight
		? SVG_ICONS[elementKey]
		: `<div style="filter: invert(1) brightness(0.3) invert(1);">${SVG_ICONS[elementKey]}</div>`; // Make the element "inactive"
	return element;
}

function createBusMarkerElement(
	highlight: boolean = true,
	textColor: string // IN HEX
): HTMLElement {
	// Note: Bus rendering now uses 3D models, this function is kept for backward compatibility
	// but should not be used for new bus markers
	const element = document.createElement('div');
	element.className = 'bus-marker-container-deprecated';
	element.innerHTML = `
<div class="relative inline-flex items-center justify-center">
  <span style="color: ${textColor}; font-size: 16px;">🚌</span>
</div>
	`;
	return element;
}

// constants

const SVG_ICONS: Record<keyof typeof MAP_STYLES, string> = {
	USER_LOCATION: mapLocationUser,
	INPUT_LOCATION: mapLocationInput,
	BUS: mapBus,
	BUS_LIVE: mapBusLive,
	BUS_STOP_LIVE: mapStopLive,
	BUS_STOP: mapStop
};

export const BUS_GLB_URL = busGlb;
export const BUS_PNG_URL = busPng;

export const AIRPORT_LOCATION: number[] = [13.199110535079635, 77.70822021568426];
export const AIRPORT_SOFTLOCK: number[] = [13.205024620008803, 77.70808412641674, 2.5]
// export const CITY_SOFTLOCK: number[] = [12.90683, 77.60127, 11.64]
export const DEFAULT_LOCATION: number[] = [12.977769, 77.572762];

export const LINE_LABEL_STYLE: LayerSpecification = {
	type: 'symbol',
	id: '',
	source: '',
	layout: {
		'symbol-placement': 'line-center',
		'text-field': ['get', 'label'],
		'text-font': ['IBM Plex Sans Regular'],
		'text-rotation-alignment': 'viewport',
		'icon-text-fit': 'both',
		'icon-rotation-alignment': 'viewport',
		'icon-image': ['get', 'image'],
		'icon-allow-overlap': true,
		'text-allow-overlap': true
	},
	paint: {
		'text-color': '#FFFFFF'
	}
};

export const LINE_COLLISION_STYLE: LayerSpecification = {
	id: '',
	type: 'symbol',
	source: '',
	layout: {
		'text-field': ['get', 'label'],
		'text-size': 12, // tweak for desired collision radius
		'text-allow-overlap': true,
		'symbol-placement': 'point'
	},
	paint: {
		'text-color': 'rgba(0, 0, 0, 0)' // fully transparent
	}
};

export const POINT_LABEL_STYLE: LayerSpecification = {
	type: 'symbol',
	id: '',
	source: '',
	layout: {
		'text-field': ['get', 'label'],
		'text-font': ['IBM Plex Sans Regular'],
		'text-variable-anchor': ['left', 'top'],
		'text-radial-offset': 0.85,
		'text-justify': 'auto',
		'text-allow-overlap': false
	}
};
export const POINT_LABEL_STYLE_OVERLAP: LayerSpecification = {
	type: 'symbol',
	id: '',
	source: '',
	layout: {
		'text-field': ['get', 'label'],
		'text-font': ['IBM Plex Sans Regular'],
		'text-variable-anchor': ['left', 'top'],
		'text-radial-offset': 0.85,
		'text-justify': 'auto',
		'text-allow-overlap': true
	}
};
export const MAP_STYLES: Record<string, MapStyle> = {
	BLUE_LINE: {
		type: 0,
		specification: {
			id: 'BLUE_LINE',
			type: 'line',
			source: 'BLUE_LINE',
			paint: {
				'line-color': '#1967D3',
				'line-width': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 3],
						[14, 8],
						[18, 3]
					]
				}
			},
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			}
		}
	},
	BLACK_LINE: {
		type: 0,
		specification: {
			id: 'BLACK_LINE',
			type: 'line',
			source: 'BLACK_LINE',
			paint: {
				'line-color': '#000000',
				'line-width': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 3],
						[14, 8],
						[18, 3]
					]
				}
			},
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			}
		}
	},
	GRAY_LINE: {
		type: 0,
		specification: {
			id: 'GRAY_LINE',
			type: 'line',
			source: 'GRAY_LINE',
			paint: {
				'line-color': '#999999',
				'line-width': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 3],
						[14, 8],
						[18, 3]
					]
				}
			},
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			}
		}
	},
	THIN_GRAY_LINE: {
		type: 0,
		specification: {
			id: 'THIN_GRAY_LINE',
			type: 'line',
			source: 'THIN_GRAY_LINE',
			paint: {
				'line-color': '#999999',
				'line-width': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 1],
						[14, 1],
						[18, 1]
					]
				}
			},
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			}
		}
	},
	THIN_BLACK_LINE: {
		type: 0,
		specification: {
			id: 'THIN_BLACK_LINE',
			type: 'line',
			source: 'THIN_BLACK_LINE',
			paint: {
				'line-color': '#000000',
				'line-width': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 1],
						[14, 1],
						[18, 1]
					]
				}
			},
			layout: {
				'line-join': 'round',
				'line-cap': 'round'
			}
		}
	},
	WHITE_BLUE_CIRCLE: {
		type: 0,
		specification: {
			id: 'WHITE_BLUE_CIRCLE',
			type: 'circle',
			source: 'WHITE_BLUE_CIRCLE',
			paint: {
				'circle-radius': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 2],
						[14, 6],
						[18, 2]
					]
				},
				'circle-color': '#ffffff',
				'circle-stroke-color': '#1967D3',
				'circle-stroke-width': 2
			}
		}
	},
	WHITE_BLACK_CIRCLE: {
		type: 0,
		specification: {
			id: 'WHITE_BLACK_CIRCLE',
			type: 'circle',
			source: 'WHITE_BLACK_CIRCLE',
			paint: {
				'circle-radius': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 2],
						[14, 6],
						[18, 2]
					]
				},
				'circle-color': '#ffffff',
				'circle-stroke-color': '#000000',
				'circle-stroke-width': 2
			}
		}
	},
	WHITE_GRAY_CIRCLE: {
		type: 0,
		specification: {
			id: 'WHITE_GRAY_CIRCLE',
			type: 'circle',
			source: 'WHITE_GRAY_CIRCLE',
			paint: {
				'circle-radius': {
					type: 'exponential',
					base: 1,
					stops: [
						[10, 2],
						[14, 6],
						[18, 2]
					]
				},
				'circle-color': '#ffffff',
				'circle-stroke-color': '#999999',
				'circle-stroke-width': 2
			}
		}
	},
	USER_LOCATION: {
		type: 1,
		html: () => createMarkerElement('USER_LOCATION')
	},
	USER_LOCATION_INACTIVE: {
		type: 1,
		html: () => createMarkerElement('USER_LOCATION', false)
	},
	INPUT_LOCATION: {
		type: 1,
		html: () => createMarkerElement('INPUT_LOCATION')
	},
	BUS_STOP_LIVE: {
		type: 1,
		html: () => createMarkerElement('BUS_STOP_LIVE')
	},
	BUS_STOP: {
		type: 1,
		html: () => createMarkerElement('BUS_STOP')
	},
	BUS_STOP_INACTIVE: {
		type: 1,
		html: () => createMarkerElement('BUS_STOP', false)
	},
	BUS_LIVE: {type: 1,
	html: () => createBusMarkerElement(false, '#1967D3')
	},
	BUS: {
		type: 1,
		html: () => createBusMarkerElement(false, '#000')
	},
	BUS_INACTIVE: {
		type: 1,
		html: () => createBusMarkerElement(true, '#999999')
	}
};