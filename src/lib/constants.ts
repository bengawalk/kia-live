import type { LayerSpecification } from 'mapbox-gl';
import mapLocationUser from '$assets/map-location-user.svg?raw';
import mapLocationInput from '$assets/map-location-input.svg?raw';
import mapBus from '$assets/map-bus.svg?raw';
import mapStop from '$assets/map-stop.svg?raw';
import mapBusLive from '$assets/map-bus-live.svg?raw';
import mapStopLive from '$assets/map-stop-live.svg?raw';

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
	// Create the marker element and put a text box with a placeholder class for the routename to be populated
	// console.log("CREATING BUS MARKER EL WITH COLOR ", textColor);
	const element = document.createElement('div');
	 element.innerHTML = `
<div
  class="relative inline-flex h-[78px] w-[78px] items-center justify-center rounded-full border-[3px] bg-white text-[${textColor}] border-[${textColor}]"
  ${highlight ? 'style="filter: invert(1) brightness(0.3) invert(1);"' : ''}
>
  <!-- ICON -->
  <svg
    class="h-[31px] w-[31px] -translate-y-2"
    viewBox="0 0 31 31"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
  >
    <g transform="translate(-23.5 -20.5)">
      <path
        d="M30.0491 21.4583C29.5315 21.4582 29.0202 21.5771 28.5559 21.806C28.0918 22.0347 27.6865 22.3673 27.3713 22.7776L27.2317 22.9739L25.8586 25.0345C25.5359 25.5184 25.3441 26.0775 25.301 26.6575L25.2913 26.9261V35.1663C25.2911 35.6919 25.4896 36.1989 25.8469 36.5843C26.2039 36.9693 26.6936 37.2037 27.217 37.2435L27.3918 37.2503H27.9485L28.0657 37.5833C28.2925 38.2249 28.7085 38.7835 29.2581 39.1849C29.8075 39.5861 30.4658 39.8114 31.1458 39.8323C31.8258 39.8532 32.4965 39.6689 33.0696 39.3021C33.6427 38.9352 34.0919 38.4031 34.3577 37.7767L34.4407 37.5657L34.5657 37.2503H43.4495L43.5667 37.5833C43.7937 38.2245 44.2097 38.7818 44.759 39.1829C45.3084 39.584 45.9659 39.8104 46.6458 39.8314C47.3257 39.8523 47.9966 39.6667 48.5696 39.3001C49.0708 38.9794 49.4774 38.5331 49.7493 38.0071L49.8577 37.7767L49.9407 37.5657L50.0657 37.2503H50.6252C51.1507 37.2504 51.6569 37.0519 52.0422 36.6946C52.4276 36.3373 52.6639 35.8467 52.7034 35.3226L52.7083 35.1497V24.8333L52.7043 24.6722C52.6661 23.8696 52.342 23.105 51.7883 22.5179C51.1978 21.8917 50.3907 21.5147 49.5315 21.4642L49.5325 21.4632L49.3186 21.4583H30.0491ZM46.7502 34.6663C47.2253 34.6664 47.6809 34.8558 48.0168 35.1917C48.3527 35.5277 48.5413 35.9832 48.5413 36.4583C48.5413 36.9334 48.3527 37.3889 48.0168 37.7249C47.6809 38.0608 47.2253 38.2502 46.7502 38.2503C46.2751 38.2503 45.8187 38.0609 45.4827 37.7249C45.1469 37.3889 44.9583 36.9333 44.9583 36.4583C44.9583 35.9833 45.1469 35.5277 45.4827 35.1917C45.8187 34.8557 46.2751 34.6663 46.7502 34.6663ZM31.2502 34.6663C31.7253 34.6664 32.1809 34.8558 32.5168 35.1917C32.8527 35.5277 33.0413 35.9832 33.0413 36.4583C33.0413 36.9334 32.8527 37.3889 32.5168 37.7249C32.1809 38.0608 31.7253 38.2502 31.2502 38.2503C30.7751 38.2503 30.3187 38.0609 29.9827 37.7249C29.6469 37.3889 29.4583 36.9333 29.4583 36.4583C29.4583 35.9833 29.6469 35.5277 29.9827 35.1917C30.3187 34.8557 30.7751 34.6663 31.2502 34.6663ZM31.7502 29.2083H26.8752V26.9075C26.8752 26.5537 26.9797 26.2078 27.176 25.9134L28.5579 23.8392C28.7215 23.5939 28.9433 23.3923 29.2034 23.2532C29.4634 23.1142 29.7542 23.0413 30.0491 23.0413H31.7502V29.2083ZM49.4973 23.0491C49.8767 23.0841 50.2368 23.2394 50.5237 23.4944C50.8515 23.786 51.0611 24.1877 51.1125 24.6234L51.1145 24.638V24.6526L51.1243 24.803L51.1252 24.8187V27.9163H46.2502V23.0413H49.3333L49.4973 23.0491ZM44.6663 27.9163H39.7913V23.0413H44.6663V27.9163ZM38.2083 27.9163H33.3333V23.0413H38.2083V27.9163Z"
        fill="${textColor}" stroke="${textColor}"
      />
    </g>
  </svg>

  <!-- TEXT -->
  <span
    class="pointer-events-none absolute bottom-[8px] left-1/2 -translate-x-1/2 -translate-y-2 text-[14px] leading-none tracking-wide text-center w-32 font-[700]"
    id="routename-text"
  >
    
  </span>
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