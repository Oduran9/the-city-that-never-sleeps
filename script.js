const API_URL =
  "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

const BOROUGHS = [
  "MANHATTAN",
  "BROOKLYN",
  "QUEENS",
  "BRONX",
  "STATEN ISLAND"
];

const BOROUGH_NAMES = {
  ALL: "All NYC",
  MANHATTAN: "Manhattan",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  BRONX: "The Bronx",
  "STATEN ISLAND": "Staten Island"
};

let allData = [];
let currentBorough = "ALL";
let selectedHour = 22;
let selectedDays = 30;
let skylineRequest = null;
let chart = null;

// Make filters available to the map.
window.NYCStory = {
  getState: () => ({
    borough: currentBorough,
    hour: selectedHour,
    days: selectedDays,
    range: getDateRange()
  })
};

// Convert hour to AM/PM.
function formatHour(hour) {
  return new Date(2026, 0, 1, hour)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true
    });
}

// Format dates in YYYY-MM-DD.
function dateString(date) {
  return date.toISOString().slice(0, 10);
}

// Use NYC's calendar date instead of the
// visitor's local computer time zone.
function getDateRange() {
  const todayNYC = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const part = type =>
    todayNYC.find(p => p.type === type).value;

  const end = new Date(Date.UTC(
    Number(part("year")),
    Number(part("month")) - 1,
    Number(part("day"))
  ));

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - selectedDays);

  return {
    start: dateString(start),
    end: dateString(end)
  };
}

// Tell the map when filters change.
function notifyMap() {
  window.dispatchEvent(
    new CustomEvent("nyc:filters-changed")
  );
}

// Fetch totals by borough and hour.
async function loadNoiseData() {
  const status = document.getElementById("status");

  if (skylineRequest) skylineRequest.abort();

  const controller = new AbortController();
  skylineRequest = controller;

  const range = getDateRange();

  status.textContent =
    `Loading ${selectedDays} days of NYC data...`;

  try {
    const url = new URL(API_URL);

    url.searchParams.set(
      "$select",
      "borough, date_extract_hh(created_date) as hour, " +
      "count(*) as total"
    );

    url.searchParams.set(
      "$where",
      `created_date >= '${range.start}T00:00:00' ` +
      `AND created_date < '${range.end}T00:00:00' ` +
      "AND complaint_type like 'Noise%' " +
      "AND borough in (" +
      BOROUGHS.map(b => `'${b}'`).join(",") +
      ")"
    );

    url.searchParams.set(
      "$group",
      "borough, date_extract_hh(created_date)"
    );

    url.searchParams.set(
      "$order",
      "borough ASC, hour ASC"
    );

    url.searchParams.set("$limit", "200");

    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const rawData = await response.json();

    if (skylineRequest !== controller) return;

    allData = rawData.map(row => ({
      borough: row.borough,
      hour: Number(row.hour),
      total: Number(row.total)
    }));

    if (!allData.length) {
      status.textContent =
        "No complaints found for the selected period.";
      return;
    }

    status.textContent =
      `Reporting period: ${range.start} through ` +
      `${new Date(
        new Date(range.end + "T00:00:00Z").getTime()
        - 86400000
      ).toISOString().slice(0, 10)} ` +
      `(${selectedDays} completed days)`;

    updateVisualization();

  } catch (error) {
    if (error.name === "AbortError") return;

    console.error("NYC API error:", error);
    status.textContent =
      "Could not load NYC data. Check the console.";
  }
}

// Get hourly counts for the selected borough.
function getHourlyData(borough) {
  const hourly = Array.from(
    { length: 24 },
    (_, hour) => ({ hour, total: 0 })
  );

  allData.forEach(row => {
    const matches =
      borough === "ALL" || row.borough === borough;

    if (
      matches &&
      Number.isInteger(row.hour) &&
      row.hour >= 0 &&
      row.hour < 24
    ) {
      hourly[row.hour].total += row.total;
    }
  });

  return hourly;
}

// Update displayed statistics and skyline.
function updateVisualization() {
  if (!allData.length) return;

  const data = getHourlyData(currentBorough);

  const total = d3.sum(data, d => d.total);

  const peak = data.reduce(
    (best, d) => d.total > best.total ? d : best,
    data[0]
  );

  document.getElementById(
    "selected-borough"
  ).textContent = BOROUGH_NAMES[currentBorough];

  document.getElementById(
    "total-complaints"
  ).textContent = total.toLocaleString();

  document.getElementById(
    "peak-hour"
  ).textContent =
    total ? formatHour(peak.hour) : "—";

  if (!chart) chart = createChart();

  chart.update(data);
  updateSelectedHour(data);
}

// Update hour label and highlighted building.
function updateSelectedHour(data) {
  const selected = data[selectedHour];

  document.getElementById(
    "hour-label"
  ).textContent = formatHour(selectedHour);

  document.getElementById(
    "chart-detail"
  ).textContent =
    `${BOROUGH_NAMES[currentBorough]} at ` +
    `${formatHour(selectedHour)}: ` +
    `${selected.total.toLocaleString()} complaints`;

  document.getElementById(
    "time-slider"
  ).value = selectedHour;

  if (chart) chart.highlight(selectedHour);
}

// Create the animated skyscraper chart.
function createChart() {
  const width = 1000;
  const height = 440;

  const margin = {
    top: 40,
    right: 20,
    bottom: 55,
    left: 75
  };

  const baseline = height - margin.bottom;

  const container = d3.select("#noise-chart");
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Skyscrapers representing hourly NYC noise reports"
    );

  const x = d3.scaleBand()
    .domain(d3.range(24))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .range([baseline, margin.top]);

  const grid = svg.append("g");
  const buildingsLayer = svg.append("g");

  const yAxis = svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${margin.left},0)`);

  // Horizontal hour labels.
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${baseline})`)
    .call(
      d3.axisBottom(x)
        .tickValues([
          0, 3, 6, 9, 12, 15, 18, 21
        ])
        .tickFormat(formatHour)
    );

  svg.append("text")
    .attr("x", 15)
    .attr("y", 20)
    .attr("fill", "#a5b3c8")
    .attr("font-size", 13)
    .text("Noise complaints");

  let currentData = [];

  // Different rooftop styles.
  function roofPath(d) {
    if (d.total === 0) return "";

    const w = x.bandwidth();
    const top = y(d.total);
    const i = d.hour;

    if (i % 4 === 0) {
      return `M 0 ${top}
              L ${w / 2} ${top - 9}
              L ${w} ${top} Z`;
    }

    if (i % 4 === 1) {
      return `M ${w * .25} ${top}
              L ${w * .25} ${top - 9}
              L ${w * .75} ${top - 9}
              L ${w * .75} ${top} Z`;
    }

    if (i % 4 === 2) {
      return `M ${w / 2 - 1} ${top}
              L ${w / 2 - 1} ${top - 15}
              L ${w / 2 + 1} ${top - 15}
              L ${w / 2 + 1} ${top} Z`;
    }

    return "";
  }

  // Illuminate individual windows.
  function drawWindows(group, d) {
    const layer = d3.select(group);
    layer.selectAll("*").remove();

    const buildingHeight = baseline - y(d.total);
    const buildingWidth = x.bandwidth();

    const rows = Math.max(
      0, Math.floor((buildingHeight - 10) / 13)
    );

    const cols = Math.max(
      1, Math.floor((buildingWidth - 8) / 9)
    );

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const lit =
          (row * 7 + col * 11 + d.hour * 3) % 5 !== 0;

        layer.append("rect")
          .attr("x", 5 + col * 9)
          .attr("y", y(d.total) + 10 + row * 13)
          .attr("width", 3.5)
          .attr("height", 5)
          .attr(
            "fill",
            lit ? "#e6bb78" : "#182a43"
          )
          .attr("opacity", lit ? 0.75 : 0.6);
      }
    }
  }

  // Highlight the chosen hour.
  function highlight(hour) {
    buildingsLayer.selectAll(".building")
      .select(".building-body")
      .attr("fill", d =>
        d.hour === hour ? "#efaa55" : "#344e73"
      );

    buildingsLayer.selectAll(".building")
      .select(".building-roof")
      .attr("fill", d =>
        d.hour === hour ? "#efaa55" : "#344e73"
      );
  }

  // Update all 24 buildings.
  function update(data) {
    currentData = data;

    y.domain([
      0,
      d3.max(data, d => d.total) || 1
    ]).nice();

    const transition = svg.transition()
      .duration(750)
      .ease(d3.easeCubicInOut);

    grid.selectAll("line")
      .data(y.ticks(5))
      .join("line")
      .attr("stroke", "#344158")
      .attr("stroke-opacity", 0.5)
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .transition(transition)
      .attr("y1", d => y(d))
      .attr("y2", d => y(d));

    yAxis.transition(transition)
      .call(
        d3.axisLeft(y)
          .ticks(5)
          .tickFormat(d3.format("~s"))
      );

    const buildings = buildingsLayer
      .selectAll(".building")
      .data(data, d => d.hour)
      .join(enter => {
        const g = enter.append("g")
          .attr("class", "building")
          .attr(
            "transform",
            d => `translate(${x(d.hour)},0)`
          )
          .attr("tabindex", 0)
          .attr("role", "button");

        g.append("rect")
          .attr("class", "building-body")
          .attr("width", x.bandwidth())
          .attr("y", baseline)
          .attr("height", 0);

        g.append("path")
          .attr("class", "building-roof");

        g.append("g")
          .attr("class", "building-windows");

        return g;
      });

    buildings.attr(
      "aria-label",
      d => `${formatHour(d.hour)}: ` +
        `${d.total.toLocaleString()} complaints`
    );

    buildings.select(".building-body")
      .interrupt()
      .transition()
      .duration(750)
      .attr("y", d => y(d.total))
      .attr("height", d => baseline - y(d.total));

    buildings.select(".building-roof")
      .interrupt()
      .transition()
      .duration(750)
      .attr("d", roofPath);

    buildings.select(".building-windows")
      .interrupt()
      .attr("opacity", 0);

    // Rebuild windows once buildings finish resizing.
    setTimeout(() => {
      if (currentData !== data) return;

      buildings.select(".building-windows")
        .each(function(d) {
          drawWindows(this, d);
        })
        .transition()
        .duration(250)
        .attr("opacity", 1);
    }, 780);

    // Clicking a building selects its hour.
    function selectBuilding(d) {
      selectedHour = d.hour;
      updateSelectedHour(currentData);
      notifyMap();
    }

    buildings.on("click", (_, d) => {
      selectBuilding(d);
    });

    buildings.on("mouseover", (_, d) => {
      selectBuilding(d);
    });

    buildings.on("keydown", (event, d) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        selectBuilding(d);
      }
    });

    highlight(selectedHour);
  }

  return { update, highlight };
}

// BOROUGH SELECTOR
document.querySelectorAll(".borough-btn")
  .forEach(button => {
    button.addEventListener("click", () => {
      currentBorough = button.dataset.borough;

      document.querySelectorAll(".borough-btn")
        .forEach(btn => {
          btn.classList.toggle(
            "active",
            btn === button
          );
        });

      updateVisualization();
      notifyMap();
    });
  });

// TIME PERIOD SELECTOR
document.querySelectorAll(".period-btn")
  .forEach(button => {
    button.addEventListener("click", () => {
      selectedDays = Number(button.dataset.days);

      document.querySelectorAll(".period-btn")
        .forEach(btn => {
          btn.classList.toggle(
            "active",
            btn === button
          );
        });

      // Both visualizations get the new time period.
      notifyMap();
      loadNoiseData();
    });
  });

// HOUR SLIDER
document.getElementById("time-slider")
  .addEventListener("input", event => {
    selectedHour = Number(event.target.value);

    if (allData.length) {
      updateSelectedHour(
        getHourlyData(currentBorough)
      );
    }

    notifyMap();
  });

// Load initial NYC data.
loadNoiseData();
