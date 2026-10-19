
const API_URL =
  "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

async function loadNoiseData() {
  const status = document.getElementById("status");
  const results = document.getElementById("results");

  try {
    const url = new URL(API_URL);

    url.searchParams.set(
      "$where",
      "complaint_type like 'Noise%'"
    );

    url.searchParams.set("$order", "created_date DESC");
    url.searchParams.set("$limit", "20");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    status.textContent =
      `Loaded ${data.length} recent noise complaints`;

    results.replaceChildren();

    data.forEach(complaint => {
      const item = document.createElement("div");
      item.className = "complaint";

      const title = document.createElement("strong");
      title.textContent =
        complaint.complaint_type || "Unknown noise type";

      const details = document.createElement("p");
      details.textContent =
        `${complaint.borough || "Unknown borough"} — ` +
        `${complaint.created_date || "Unknown date"}`;

      item.append(title, details);
      results.appendChild(item);
    });

  } catch (error) {
    status.textContent = "Failed to load NYC data.";
    console.error(error);
  }
}

loadNoiseData();
