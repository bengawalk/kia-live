#!/usr/bin/env node

/**
 * GTFS Metro Departure Board Generator
 *
 * This script processes GTFS static data and generates optimized departure board
 * information for each stop, storing it in static/metro/stops/
 *
 * Output format: JSON files containing:
 * - Stop information (name, location, translations)
 * - Departures grouped by service type (weekday/weekend/holiday)
 * - Trip headsigns and scheduled times
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Configuration
const GTFS_PATH = path.join(__dirname, '../gtfs_output');
const OUTPUT_PATH = path.join(__dirname, '../static/metro/stops');

// Data structures
const stops = new Map();
const stopTimes = [];
const trips = new Map();
const routes = new Map();
const calendars = new Map();
const calendarDates = new Map();
const translations = new Map();
let headsignTranslations = new Map();

/**
 * Parse CSV file and return array of objects
 */
function parseCSV(filename) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(path.join(GTFS_PATH, filename))
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

/**
 * Convert time string (HH:MM:SS) to minutes since midnight
 */
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:MM format
 */
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Determine service type from calendar data
 */
function getServiceType(serviceId, calendar) {
    if (serviceId === 'sunday') return 'sunday';
    if (serviceId === 'holiday') return 'holiday';
    if (serviceId === 'weekday') return 'weekday';

    // Parse calendar to determine service type
    if (calendar) {
        const weekdayCount = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            .filter(day => calendar[day] === '1').length;
        const weekendCount = ['saturday', 'sunday']
            .filter(day => calendar[day] === '1').length;

        if (weekdayCount === 5 && weekendCount === 0) return 'weekday';
        if (weekdayCount === 0 && weekendCount === 2) return 'weekend';
        if (weekendCount === 1 && calendar.sunday === '1') return 'sunday';
        if (weekendCount === 1 && calendar.saturday === '1') return 'saturday';
    }

    return 'weekday'; // default
}

/**
 * Load and process all GTFS files
 */
async function loadGTFSData() {
    console.log('Loading GTFS data...');

    // Load stops
    const stopsData = await parseCSV('stops.txt');
    stopsData.forEach(stop => {
        stops.set(stop.stop_id, {
            stop_id: stop.stop_id,
            stop_name: stop.stop_name,
            stop_lat: parseFloat(stop.stop_lat),
            stop_lon: parseFloat(stop.stop_lon),
            zone_id: stop.zone_id
        });
    });
    console.log(`Loaded ${stops.size} stops`);

    // Load translations
    const translationsData = await parseCSV('translations.txt');
    translationsData.forEach(trans => {
        if (trans.table_name === 'stops' && trans.field_name === 'stop_name') {
            if (!translations.has(trans.record_id)) {
                translations.set(trans.record_id, {});
            }
            translations.get(trans.record_id)[trans.language] = trans.translation;
        }
    });
    console.log(`Loaded ${translations.size} stop translations`);

    // Load routes
    const routesData = await parseCSV('routes.txt');
    routesData.forEach(route => {
        routes.set(route.route_id, {
            route_id: route.route_id,
            route_short_name: route.route_short_name.replace('line', '').trim(),
            route_long_name: route.route_long_name,
            route_color: route.route_color,
            route_text_color: route.route_text_color.replace('line', '').trim()
        });
    });
    console.log(`Loaded ${routes.size} routes`);

    // Load calendar
    const calendarData = await parseCSV('calendar.txt');
    calendarData.forEach(cal => {
        calendars.set(cal.service_id, cal);
    });
    console.log(`Loaded ${calendars.size} calendar entries`);

    // Load calendar_dates
    const calendarDatesData = await parseCSV('calendar_dates.txt');
    calendarDatesData.forEach(calDate => {
        if (!calendarDates.has(calDate.date)) {
            calendarDates.set(calDate.date, []);
        }
        calendarDates.get(calDate.date).push(calDate);
    });
    console.log(`Loaded ${calendarDates.size} calendar date exceptions`);

    // Load trips
    const tripsData = await parseCSV('trips.txt');
    tripsData.forEach(trip => {
        trips.set(trip.trip_id, {
            trip_id: trip.trip_id,
            route_id: trip.route_id,
            service_id: trip.service_id,
            trip_headsign: trip.trip_headsign,
            direction_id: trip.direction_id,
            shape_id: trip.shape_id
        });
    });
    console.log(`Loaded ${trips.size} trips`);

    // Load stop_times
    const stopTimesData = await parseCSV('stop_times.txt');
    stopTimesData.forEach(st => {
        stopTimes.push({
            trip_id: st.trip_id,
            stop_id: st.stop_id,
            arrival_time: st.arrival_time,
            departure_time: st.departure_time,
            stop_sequence: parseInt(st.stop_sequence)
        });
    });
    console.log(`Loaded ${stopTimes.length} stop times`);

    // Build headsign translation map (headsigns are stop names)
    stops.forEach((stop, stopId) => {
        const stopName = stop.stop_name;
        const trans = translations.get(stopId);
        if (trans) {
            headsignTranslations.set(stopName, {
                en: stopName,
                ...trans
            });
        } else {
            headsignTranslations.set(stopName, {
                en: stopName
            });
        }
    });
    console.log(`Built ${headsignTranslations.size} headsign translations`);
}

/**
 * Generate departure board data for each stop
 */
function generateDepartureBoardData() {
    console.log('\nGenerating departure board data...');

    const stopDepartures = new Map();

    // Initialize departure data for each stop
    stops.forEach((stop, stopId) => {
        stopDepartures.set(stopId, {
            stop_id: stopId,
            stop_name: stop.stop_name,
            stop_name_translations: translations.get(stopId) || {},
            location: {
                lat: stop.stop_lat,
                lon: stop.stop_lon
            },
            zone_id: stop.zone_id,
            routes: new Set(), // Track which routes pass through this stop
            departures: {
                weekday: [],
                sunday: [],
                holiday: []
            }
        });
    });

    // Process each stop_time entry
    stopTimes.forEach(st => {
        const trip = trips.get(st.trip_id);
        if (!trip) return;

        const route = routes.get(trip.route_id);
        if (!route) return;

        const calendar = calendars.get(trip.service_id);
        const serviceType = getServiceType(trip.service_id, calendar);

        const stopData = stopDepartures.get(st.stop_id);
        if (!stopData) return;

        const departureTime = st.departure_time || st.arrival_time;
        const departureMinutes = timeToMinutes(departureTime);

        // Get headsign translations (headsigns are stop names)
        const headsignTrans = headsignTranslations.get(trip.trip_headsign) || { en: trip.trip_headsign };

        // Track which routes pass through this stop
        stopData.routes.add(route.route_short_name.toLowerCase());

        // Add departure
        stopData.departures[serviceType].push({
            time: minutesToTime(departureMinutes),
            minutes: departureMinutes,
            headsign: headsignTrans,
            route_id: route.route_id,
            route_name: route.route_short_name,
            route_color: route.route_color,
            direction_id: parseInt(trip.direction_id),
            trip_id: trip.trip_id
        });
    });

    // Sort departures by time for each stop and service type
    // Also convert route Set to color string
    stopDepartures.forEach((stopData, stopId) => {
        ['weekday', 'sunday', 'holiday'].forEach(serviceType => {
            stopData.departures[serviceType].sort((a, b) => a.minutes - b.minutes);

            // Remove 'minutes' field from output (used only for sorting)
            stopData.departures[serviceType] = stopData.departures[serviceType].map(dep => {
                const { minutes, ...rest } = dep;
                return rest;
            });
        });

        // Convert routes Set to color string (e.g., "purple-green" or "purple")
        const routeArray = Array.from(stopData.routes).sort(); // Sort for consistent order
        stopData.color = routeArray.join('-');
        delete stopData.routes; // Remove the Set, we only need the color string
    });

    return stopDepartures;
}

/**
 * Write departure data to files
 */
function writeDepartureFiles(stopDepartures) {
    console.log('\nWriting departure files...');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_PATH)) {
        fs.mkdirSync(OUTPUT_PATH, { recursive: true });
    }

    // Write individual stop files
    let filesWritten = 0;
    stopDepartures.forEach((stopData, stopId) => {
        const filename = path.join(OUTPUT_PATH, `${stopId}.json`);
        fs.writeFileSync(filename, JSON.stringify(stopData, null, 2));
        filesWritten++;
    });

    console.log(`Wrote ${filesWritten} stop departure files to ${OUTPUT_PATH}`);

    // Write index file with all stop metadata
    const index = Array.from(stopDepartures.values()).map(stop => ({
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        stop_name_translations: stop.stop_name_translations,
        location: stop.location,
        zone_id: stop.zone_id,
        color: stop.color
    }));

    const indexPath = path.join(OUTPUT_PATH, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`Wrote index file: ${indexPath}`);

    // Write summary statistics
    const stats = {
        total_stops: stopDepartures.size,
        generation_date: new Date().toISOString(),
        gtfs_source: GTFS_PATH,
        stops_with_departures: Array.from(stopDepartures.values()).filter(
            s => s.departures.weekday.length > 0 ||
                 s.departures.sunday.length > 0 ||
                 s.departures.holiday.length > 0
        ).length
    };

    const statsPath = path.join(OUTPUT_PATH, 'stats.json');
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    console.log(`Wrote statistics file: ${statsPath}`);
}

/**
 * Main execution
 */
async function main() {
    try {
        console.log('=== GTFS Metro Departure Board Generator ===\n');

        await loadGTFSData();
        const stopDepartures = generateDepartureBoardData();
        writeDepartureFiles(stopDepartures);

        console.log('\n=== Generation Complete ===');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

// Run the script
main();
