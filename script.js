
const API_URL =
  "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

// Format hours into readable labels.
function formatHour(hour) {
  return new Date(2026, 0, 1, hour)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      hour12: true
    });
}

// Fetch NYC noise complaint counts from the API.
async function loadNoiseData() {
  const status = document.getElementById("status");

  try {
    const startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 30);

    const dateString =
      startDate.toISOString().slice(0, 10);

    const url = new URL(API_URL);

    // Ask the database to group complaints by hour.
    url.searchParams.set(
      "$select",
      "date_extract_hh(created_date) as hour, " +
      "count(*) as total"
    );

    url.searchParams.set(
      "$where",
      `created_date >= '${dateString}T00:00:00' ` +
      "AND complaint_type like 'Noise%'"
    );

    url.searchParams.set(
      "$group",
      "date_extract_hh(created_date)"
    );

    url.searchParams.set("$order", "hour ASC");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const rawData = await response.json();

    // Ensure all 24 hours are represented.
    const hourlyData = Array.from(
      { length: 24 },
      (_, hour) => ({
        hour,
        total: 0
      })
    );

    rawData.forEach(row => {
      const hour = Number(row.hour);

      if (
        Number.isInteger(hour) &&
        hour >= 0 &&
        hour < 24
      ) {
        hourlyData[hour].total = Number(row.total);
      }
    });

    const total = d3.sum(
      hourlyData,
      d => d.total
    );

    if (total === 0) {
      status.textContent =
        "No complaints found for this period.";
      return;
    }

    status.textContent =
      `${total.toLocaleString()} noise complaints ` +
      "over the last 30 days";

    createChart(hourlyData);

  } catch (error) {
    console.error("NYC API error:", error);

    status.textContent =
      "Could not load NYC data. Check the console.";
  }
}

// Build the NYC skyline visualization.
function createChart(data) {
  const container = d3.select("#noise-chart");
  container.selectAll("*").remove();

  const width = 1000;
  const height = 440;

  const margin = {
    top: 40,
    right: 20,
    bottom: 55,
    left: 75
  };

  const svg = container.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "New York noise complaints represented " +
      "by a skyline of 24 buildings"
    );

  // Horizontal positions for the 24 buildings.
  const x = d3.scaleBand()
    .domain(data.map(d => d.hour))
    .range([
      margin.left,
      width - margin.right
    ])
    .padding(0.12);

  // Building heights based on complaint totals.
  const y = d3.scaleLinear()
    .domain([
      0,
      d3.max(data, d => d.total) || 1
    ])
    .nice()
    .range([
      height - margin.bottom,
      margin.top
    ]);

  const baseline = y(0);

  // Background grid lines.
  svg.append("g")
    .selectAll("line")
    .data(y.ticks(5))
    .join("line")
    .attr("x1", margin.left)
    .attr("x2", width - margin.right)
    .attr("y1", d => y(d))
    .attr("y2", d => y(d))
    .attr("stroke", "#344158")
    .attr("stroke-opacity", 0.5);

  // Create a group for each building.
  const buildings = svg
    .selectAll(".building")
    .data(data)
    .join("g")
    .attr("class", "building")
    .attr(
      "transform",
      d => `translate(${x(d.hour)},0)`
    )
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      d => `${formatHour(d.hour)}: ` +
        `${d.total} noise complaints`
    );

  // Draw building bodies.
  buildings.append("rect")
    .attr("class", "building-body")
    .attr("width", x.bandwidth())
    .attr("y", baseline)
    .attr("height", 0)
    .attr("fill", "#344e73");

  // Rooftop shapes.
  buildings.append("path")
    .attr("class", "building-roof")
    .attr("fill", "#344e73")
    .attr("d", (d, i) => {
      const w = x.bandwidth();
      const top = y(d.total);

      if (d.total === 0) {
        return "";
      }

      if (i % 4 === 0) {
        // Pointed rooftop
        return `M 0 ${top}
                L ${w / 2} ${top - 9}
                L ${w} ${top} Z`;
      }

      if (i % 4 === 1) {
        // Stepped rooftop
        return `M ${w * 0.25} ${top}
                L ${w * 0.25} ${top - 9}
                L ${w * 0.75} ${top - 9}
                L ${w * 0.75} ${top} Z`;
      }

      if (i % 4 === 2) {
        // Antenna
        return `M ${w / 2 - 1} ${top}
                L ${w / 2 - 1} ${top - 15}
                L ${w / 2 + 1} ${top - 15}
                L ${w / 2 + 1} ${top} Z`;
      }

      return "";
    });

  // Add windows to each building.
  const windowGroups = buildings
    .append("g")
    .attr("class", "building-windows")
    .attr("opacity", 0);

  windowGroups.each(function(d, i) {
    const group = d3.select(this);

    const buildingHeight =
      baseline - y(d.total);

    const buildingWidth = x.bandwidth();

    const rows = Math.max(
      0,
      Math.floor((buildingHeight - 10) / 13)
    );

    const cols = Math.max(
      1,
      Math.floor((buildingWidth - 8) / 9)
    );

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {

        const lit =
          (row * 7 + col * 11 + i * 3) % 5 !== 0;

        group.append("rect")
          .attr("x", 5 + col * 9)
          .attr(
            "y",
            y(d.total) + 10 + row * 13
          )
          .attr("width", 3.5)
          .attr("height", 5)
          .attr(
            "fill",
            lit ? "#e6bb78" : "#182a43"
          )
          .attr(
            "opacity",
            lit ? 0.75 : 0.6
          );
      }
    }
  });

  // Animate the buildings upward.
  buildings.select(".building-body")
    .transition()
    .duration(950)
    .delay((_, i) => i * 28)
    .attr("y", d => y(d.total))
    .attr(
      "height",
      d => baseline - y(d.total)
    );

  // Fade in the windows.
  windowGroups
    .transition()
    .delay(1150)
    .duration(450)
    .attr("opacity", 1);

  // Hour labels underneath the skyline.
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

  // Complaint totals on the left.
  svg.append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      `translate(${margin.left},0)`
    )
    .call(
      d3.axisLeft(y)
        .ticks(5)
        .tickFormat(d3.format("~s"))
    );

  // Axis title.
  svg.append("text")
    .attr("x", 15)
    .attr("y", 20)
    .attr("fill", "#a5b3c8")
    .attr("font-size", 13)
    .text("Noise complaints");

  // Create slider controls.
  const controls = container
    .append("div")
    .attr("class", "timeline-controls");

  const hourLabel = controls
    .append("p")
    .attr("class", "hour-label");

  const slider = controls
    .append("input")
    .attr("type", "range")
    .attr("min", 0)
    .attr("max", 23)
    .attr("step", 1)
    .attr("value", 22)
    .attr(
      "aria-label",
      "Select hour of day"
    );

  // Highlight a selected building.
  function selectHour(hour) {
    const selected = data[hour];

    buildings.select(".building-body")
      .attr("fill", d =>
        d.hour === hour
          ? "#efaa55"
          : "#344e73"
      );

    buildings.select(".building-roof")
      .attr("fill", d =>
        d.hour === hour
          ? "#efaa55"
          : "#344e73"
      );

    hourLabel.text(
      `${formatHour(hour)} — ` +
      `${selected.total.toLocaleString()} complaints`
    );

    slider.property("value", hour);

    showDetails(selected);
  }

  // Move slider to select an hour.
  slider.on("input", function() {
    selectHour(Number(this.value));
  });

  // Select an hour by clicking a building.
  buildings.on("click", (_, d) => {
    selectHour(d.hour);
  });

  // Select an hour by hovering.
  buildings.on("mouseover", (_, d) => {
    selectHour(d.hour);
  });

  // Keyboard support.
  buildings.on("keydown", (event, d) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      selectHour(d.hour);
    }
  });

  // Default selected hour: 10 PM.
  selectHour(22);
}

// Display information about the selected hour.
function showDetails(d) {
  document.getElementById(
    "chart-detail"
  ).textContent =
    `${formatHour(d.hour)} — ` +
    `${d.total.toLocaleString()} noise complaints`;
}

// Start the application.
loadNoiseData();
