
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
let chart = null;

// Format an hour like 0 -> 12 AM, 22 -> 10 PM.
function formatHour(hour) {
  return new Date(2026, 0, 1, hour)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true
    });
}

// Create a date string for NYC data queries.
function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// Get counts by borough and hour from NYC Open Data.
async function loadNoiseData() {
  const status = document.getElementById("status");

  try {
    const today = new Date();

    // Last 30 completed calendar days, ending yesterday.
    const end = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const start = new Date(end);
    start.setDate(start.getDate() - 30);

    const startDate = dateString(start);
    const endDate = dateString(end);

    const url = new URL(API_URL);

    url.searchParams.set(
      "$select",
      "borough, date_extract_hh(created_date) as hour, " +
      "count(*) as total"
    );

    url.searchParams.set(
      "$where",
      `created_date >= '${startDate}T00:00:00' ` +
      `AND created_date < '${endDate}T00:00:00' ` +
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

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API error ${response.status}: ${errorText}`
      );
    }

    const rawData = await response.json();

    // Convert API strings to numbers.
    allData = rawData.map(row => ({
      borough: row.borough,
      hour: Number(row.hour),
      total: Number(row.total)
    }));

    if (!allData.length) {
      status.textContent =
        "No noise complaints were found for this period.";
      return;
    }

    status.textContent =
      `Showing noise complaints from ` +
      `${startDate} through ${dateString(
        new Date(end.getTime() - 86400000)
      )}`;

    updateVisualization();

  } catch (error) {
    console.error("NYC Open Data API error:", error);

    status.textContent =
      "Failed to load NYC data. " +
      "Check the browser console for details.";
  }
}

// Get the 24 hourly values for the chosen borough.
function getHourlyData(borough) {
  const hourly = Array.from(
    { length: 24 },
    (_, hour) => ({ hour, total: 0 })
  );

  allData.forEach(row => {
    const validBorough =
      borough === "ALL" || row.borough === borough;

    if (
      validBorough &&
      Number.isInteger(row.hour) &&
      row.hour >= 0 &&
      row.hour < 24
    ) {
      hourly[row.hour].total += row.total;
    }
  });

  return hourly;
}

// Update selected borough, statistics, and chart.
function updateVisualization() {
  const data = getHourlyData(currentBorough);

  const total = d3.sum(data, d => d.total);

  const peak = data.reduce(
    (max, item) =>
      item.total > max.total ? item : max,
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
  ).textContent = total > 0
    ? formatHour(peak.hour)
    : "—";

  if (!chart) {
    chart = createChart();
  }

  // Recalculate heights and transition to new data.
  chart.update(data);

  updateSelectedHour(data);
}

// Update highlighted building and displayed data.
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

  if (chart) {
    chart.highlight(selectedHour);
  }
}

// Construct the skyline chart.
function createChart() {
  const width = 1000;
  const height = 440;

  const margin = {
    top: 40,
    right: 20,
    bottom: 55,
    left: 75
  };

  const container = d3.select("#noise-chart");
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "NYC skyline chart of hourly noise complaint counts"
    );

  const x = d3.scaleBand()
    .domain(d3.range(24))
    .range([margin.left, width - margin.right])
    .padding(0.12);

  const y = d3.scaleLinear()
    .range([height - margin.bottom, margin.top]);

  const baseline = height - margin.bottom;

  const grid = svg.append("g");
  const buildingsLayer = svg.append("g");

  const yAxis = svg.append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      `translate(${margin.left},0)`
    );

  svg.append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      `translate(0,${baseline})`
    )
    .call(
      d3.axisBottom(x)
        .tickValues([
          0, 3, 6, 9,
          12, 15, 18, 21
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

  // Draw different rooftop shapes.
  function roofPath(d, index) {
    if (d.total === 0) return "";

    const w = x.bandwidth();
    const top = y(d.total);

    if (index % 4 === 0) {
      return `M 0 ${top}
              L ${w / 2} ${top - 9}
              L ${w} ${top} Z`;
    }

    if (index % 4 === 1) {
      return `M ${w * 0.25} ${top}
              L ${w * 0.25} ${top - 9}
              L ${w * 0.75} ${top - 9}
              L ${w * 0.75} ${top} Z`;
    }

    if (index % 4 === 2) {
      return `M ${w / 2 - 1} ${top}
              L ${w / 2 - 1} ${top - 15}
              L ${w / 2 + 1} ${top - 15}
              L ${w / 2 + 1} ${top} Z`;
    }

    return "";
  }

  // Draw illuminated windows.
  function drawWindows(group, d) {
    const layer = d3.select(group);
    layer.selectAll("*").remove();

    const h = baseline - y(d.total);
    const w = x.bandwidth();

    const rows = Math.max(
      0,
      Math.floor((h - 10) / 13)
    );

    const cols = Math.max(
      1,
      Math.floor((w - 8) / 9)
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

  function update(data) {
    currentData = data;

    y.domain([
      0,
      d3.max(data, d => d.total) || 1
    ]).nice();

    const t = svg.transition()
      .duration(750)
      .ease(d3.easeCubicInOut);

    // Update horizontal grid.
    const ticks = y.ticks(5);

    grid.selectAll("line")
      .data(ticks)
      .join("line")
      .attr("stroke", "#344158")
      .attr("stroke-opacity", 0.5)
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .transition(t)
      .attr("y1", d => y(d))
      .attr("y2", d => y(d));

    yAxis.transition(t)
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
      .transition(t)
      .attr("y", d => y(d.total))
      .attr("height", d => baseline - y(d.total));

    buildings.select(".building-roof")
      .transition(t)
      .attr("d", (d, i) => roofPath(d, i));

    // Hide windows during the resize animation.
    buildings.select(".building-windows")
      .attr("opacity", 0);

    t.end().then(() => {
      buildings.select(".building-windows")
        .each(function(d) {
          drawWindows(this, d);
        })
        .transition()
        .duration(300)
        .attr("opacity", 1);
    }).catch(() => {
      // A newer borough selection interrupted animation.
    });

    buildings.on("click", (_, d) => {
      selectedHour = d.hour;
      updateSelectedHour(currentData);
    });

    buildings.on("mouseover", (_, d) => {
      selectedHour = d.hour;
      updateSelectedHour(currentData);
    });

    buildings.on("keydown", (event, d) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        selectedHour = d.hour;
        updateSelectedHour(currentData);
      }
    });

    highlight(selectedHour);
  }

  return { update, highlight };
}

// Borough button events.
document.querySelectorAll(".borough-btn")
  .forEach(button => {
    button.addEventListener("click", () => {
      if (!allData.length) return;

      currentBorough = button.dataset.borough;

      document.querySelectorAll(".borough-btn")
        .forEach(btn => {
          btn.classList.toggle(
            "active",
            btn === button
          );
        });

      updateVisualization();
    });
  });

// Slider interaction.
document.getElementById("time-slider")
  .addEventListener("input", event => {
    selectedHour = Number(event.target.value);

    if (allData.length) {
      updateSelectedHour(
        getHourlyData(currentBorough)
      );
    }
  });

// Start the application.
loadNoiseData();
