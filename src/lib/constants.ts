import type { LayerSpecification } from 'mapbox-gl';

type ElementMapStyle = {
	type: 1;
	html: HTMLElement;
}
type LayerMapStyle = {
	type: 0;
	specification: LayerSpecification;
}

type MapStyle = ElementMapStyle | LayerMapStyle;
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
		"type": 1
	},
	"USER_LOCATION_INACTIVE": {
		"type": 1
	},
	"INPUT_LOCATION": {
		"type": 1
	},
	"BUS_STOP": {
		"type": 1
	},
	"BUS": {
		"type": 1
	},
	"ROUTE_LABEL": {
		"type": 1
	},
}