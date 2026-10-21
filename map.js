
// THE CITY THAT NEVER SLEEPS
// Interactive NYC geographic visualization

const MAP_API =
  "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

// Center coordinates for NYC and each borough.
const MAP_AREAS = {
  ALL: {
    name: "All NYC",
    center: [40.7128, -74.0060],
    zoom: 10
  },
  MANHATTAN: {
    name: "Manhattan",
    center: [40.7831, -73.9712],
    zoom: 12
  },
  BROOKLYN: {
    name: "Brooklyn",
    center: [40.6782, -73.9442],
    zoom: 12
  },
  QUEENS: {
    name: "Queens",
    center: [40.7282, -73.7949],
    zoom: 11
  },
  BRONX: {
    name: "The Bronx",
    center: [40.8448, -73.8648],
    zoom: 12
  },
  "STATEN ISLAND": {
    name: "Staten Island",
    center: [40.5795, -74.1502],
    zoom: 12
  }
};

// Initialize Leaflet.
const nycMap = L.map("nyc-map", {
  scrollWheelZoom: false
}).setView([40.7128, -74.0060], 10);


/* DARK NYC MAP BACKGROUND — CARTO */


/* TEMPORARY MAP BACKGROUND TEST */

L.tileLayer(
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19
  }
).addTo(nycMap);



// Layer containing our noise complaint points.
const noiseMarkers = L.layerGroup().addTo(nycMap);

let mapController = null;
let mapTimer = null;
let lastBorough = "ALL";

// Read the latest shared settings.
function mapState() {
  return window.NYCStory.getState();
}

// Update the label above the map.
function updateMapHeading() {
  const state = mapState();
  const area = MAP_AREAS[state.borough];

  document.getElementById(
    "map-selection"
  ).textContent =
    `${area.name} / ${state.days} Days / ` +
    formatHour(state.hour);
}

// Build the map API filter.
function buildMapFilter(state) {
  const range = state.range;

  let filter =
    `created_date >= '${range.start}T00:00:00' ` +
    `AND created_date < '${range.end}T00:00:00' ` +
    "AND complaint_type like 'Noise%' " +
    "AND latitude IS NOT NULL " +
    "AND longitude IS NOT NULL " +
    "AND borough in (" +
    BOROUGHS.map(b => `'${b}'`).join(",") +
    ")";

  // Match the selected hour on the skyline.
  filter +=
    ` AND date_extract_hh(created_date) = ` +
    state.hour;

  // Filter by borough.
  if (state.borough !== "ALL") {
    filter +=
      ` AND borough = '${state.borough}'`;
  }

  return filter;
}

// Create a safe popup for one complaint.
function createPopup(record) {
  const popup = document.createElement("div");

  const title = document.createElement("strong");
  title.textContent =
    record.complaint_type || "Noise complaint";

  const borough = document.createElement("p");
  borough.textContent =
    record.borough || "Unknown borough";

  const date = document.createElement("p");
  date.textContent = record.created_date
    ? record.created_date.replace("T", " ")
    : "Unknown date";

  const detail = document.createElement("p");
  detail.textContent = record.descriptor || "";

  popup.append(title, borough, date, detail);

  return popup;
}

// Put a noise complaint marker on the map.
function addMarker(record) {
  const lat = Number(record.latitude);
  const lng = Number(record.longitude);

  // Reject missing or invalid coordinates.
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < 40.45 ||
    lat > 40.95 ||
    lng < -74.30 ||
    lng > -73.65
  ) {
    return false;
  }


const marker = L.circleMarker(
  [lat, lng],
  {
    radius: 7,
    color: "#ffffff",
    weight: 2,
    opacity: 1,
    fillColor: "#d03420",
    fillOpacity: 1
  }
);


  marker.bindPopup(createPopup(record));
  marker.addTo(noiseMarkers);

  return true;
}

// Retrieve complaint locations from NYC Open Data.
async function loadMapData() {
  const state = mapState();
  const status = document.getElementById("map-status");

  updateMapHeading();

  if (mapController) {
    mapController.abort();
  }

  const controller = new AbortController();
  mapController = controller;

  status.textContent =
    "Loading complaint locations from NYC Open Data...";

  const url = new URL(MAP_API);

  url.searchParams.set(
    "$select",
    "created_date,complaint_type,descriptor," +
    "borough,latitude,longitude"
  );

  url.searchParams.set(
    "$where",
    buildMapFilter(state)
  );

  url.searchParams.set(
    "$order",
    "created_date DESC"
  );

  // Limit the number of plotted records.
  url.searchParams.set("$limit", "300");

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Map API returned ${response.status}`
      );
    }

    const records = await response.json();

    // Don't display results from an old request.
    if (mapController !== controller) return;

    noiseMarkers.clearLayers();

    let plotted = 0;

    records.forEach(record => {
      if (addMarker(record)) {
        plotted++;
      }
    });

    // Recenter when the selected borough changes.
    if (lastBorough !== state.borough) {
      const area = MAP_AREAS[state.borough];

      nycMap.flyTo(
        area.center,
        area.zoom,
        { duration: 0.7 }
      );

      lastBorough = state.borough;
    }

    status.textContent =
      `${plotted.toLocaleString()} recent matching ` +
      "complaint locations displayed. " +
      "Maximum 300 records; not a complete map.";

    nycMap.invalidateSize();

  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("Map API error:", error);

    status.textContent =
      "Unable to load complaint locations. " +
      "Check the browser console.";
  }
}

// Debounce requests when slider moves quickly.
function scheduleMapUpdate() {
  updateMapHeading();

  clearTimeout(mapTimer);

  if (mapController) {
    mapController.abort();
  }

  mapTimer = setTimeout(loadMapData, 450);
}

// Listen for all existing skyline filter changes.
window.addEventListener(
  "nyc:filters-changed",
  scheduleMapUpdate
);

// Reset the geographical view.
document.getElementById("reset-map")
  .addEventListener("click", () => {
    nycMap.flyTo(
      MAP_AREAS.ALL.center,
      MAP_AREAS.ALL.zoom,
      { duration: 0.7 }
    );
  });

// Start loading the map.
loadMapData();
