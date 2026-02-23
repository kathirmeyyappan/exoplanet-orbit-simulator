/**
 * Single-page app: simulation view is home. Search is a modal; selecting a planet closes modal and runs scene (via reload).
 */

import { createSimulationFromRow } from "./model.js";
import { runScene } from "./scene.js";

(function (): void {
  const disclaimerBtn = document.getElementById("disclaimer-btn");
  const disclaimerEl = document.getElementById("disclaimer");
  if (disclaimerBtn && disclaimerEl) {
    disclaimerBtn.addEventListener("click", () => disclaimerEl.classList.toggle("visible"));
  }

  const overlay = document.getElementById("search-overlay");
  const modal = document.getElementById("search-modal");
  const form = document.getElementById("query-form") as HTMLFormElement;
  const statusEl = document.getElementById("search-status") as HTMLParagraphElement;
  const resultsEl = document.getElementById("search-results") as HTMLUListElement;
  const closeBtn = document.getElementById("search-close");

  function openModal(): void {
    overlay?.classList.add("visible");
  }

  function closeModal(): void {
    overlay?.classList.remove("visible");
  }

  closeBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", (e: Event) => {
    if (e.target === overlay) closeModal();
  });
  modal?.addEventListener("click", (e: Event) => e.stopPropagation());

  function getInput(): QueryInput {
    const fd = new FormData(form);
    return {
      st_rad_min: (fd.get("st_rad_min") ?? "") as string,
      st_rad_max: (fd.get("st_rad_max") ?? "") as string,
      st_teff_min: (fd.get("st_teff_min") ?? "") as string,
      st_teff_max: (fd.get("st_teff_max") ?? "") as string,
      pl_orbsmax_min: (fd.get("pl_orbsmax_min") ?? "") as string,
      pl_orbsmax_max: (fd.get("pl_orbsmax_max") ?? "") as string,
      pl_rade_min: (fd.get("pl_rade_min") ?? "") as string,
      pl_rade_max: (fd.get("pl_rade_max") ?? "") as string,
      pl_masse_min: (fd.get("pl_masse_min") ?? "") as string,
      pl_masse_max: (fd.get("pl_masse_max") ?? "") as string,
      pl_orbper_min: (fd.get("pl_orbper_min") ?? "") as string,
      pl_orbper_max: (fd.get("pl_orbper_max") ?? "") as string
    };
  }

  function renderList(rows: TapRow[]): void {
    resultsEl.innerHTML = "";
    rows.forEach((row) => {
      const li = document.createElement("li");
      const name = row.pl_name ?? row.PL_NAME ?? "—";
      const host = row.hostname ?? row.HOSTNAME ?? "—";
      li.textContent = name + " (" + host + ")";
      li.addEventListener("click", () => {
        try {
          sessionStorage.setItem("goldilocks_planet", JSON.stringify(row));
          closeModal();
          window.location.reload();
        } catch (e) {
          statusEl.textContent = "Could not select: " + (e as Error).message;
        }
      });
      resultsEl.appendChild(li);
    });
  }

  form?.addEventListener("submit", async (e: Event) => {
    e.preventDefault();
    statusEl.textContent = "Loading…";
    resultsEl.innerHTML = "";
    const input = getInput();
    const out = await window.GoldilocksQuery.fetchPlanets(input);
    if (!out.ok) {
      let msg = (out as { error?: string }).error || "Could not load data.";
      if (msg === "Failed to fetch" || msg.includes("fetch")) {
        msg += " Open from a local server (e.g. npx serve .), not as a file.";
      }
      statusEl.textContent = "Error: " + msg;
      return;
    }
    const data = (out as { data?: TapRow[] }).data ?? [];
    if (data.length === 0) {
      statusEl.textContent = "No planets match. Widen filters.";
      return;
    }
    statusEl.textContent = data.length + " result(s). Click a row to visualize.";
    renderList(data);
  });

  const stored = sessionStorage.getItem("goldilocks_planet");
  const infoEl = document.getElementById("info") as HTMLDivElement;
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;

  if (!stored) {
    infoEl.innerHTML = 'No planet selected. <button type="button" id="open-search-btn">Search planets</button>';
    document.getElementById("open-search-btn")?.addEventListener("click", openModal);
    return;
  }

  let row: Record<string, unknown>;
  try {
    row = JSON.parse(stored) as Record<string, unknown>;
  } catch {
    infoEl.textContent = "Invalid stored data.";
    infoEl.innerHTML += ' <button type="button" id="open-search-btn">Search planets</button>';
    document.getElementById("open-search-btn")?.addEventListener("click", openModal);
    return;
  }

  const state = createSimulationFromRow(row);

  const lines = [
    "<b>" + state.plName + "</b> (" + state.hostName + ")",
    "Orbit: " + state.orbitAu.toFixed(3) + " AU",
    "Planet radius: " + (state.planetRadiusRe != null ? state.planetRadiusRe.toFixed(2) : "—") + " R⊕",
    "Eccentricity: " + (state.eccentricityKnown ? state.orbitEccentricity.toFixed(2) : "unknown"),
    "Goldilocks: " + state.hzInnerAu.toFixed(2) + " – " + state.hzOuterAu.toFixed(2) + " AU",
    (state.habitableZoneStatus === "in"
      ? '<b class="hz in-hz">In habitable zone</b>'
      : state.habitableZoneStatus === "too-close"
        ? '<b class="hz out-too-close">Outside habitable zone (too close)</b>'
        : '<b class="hz out-too-far">Outside habitable zone (too far)</b>')
  ];
  infoEl.innerHTML =
    '<div class="info-lines">' +
    lines.map((s) => '<div class="info-line">' + s + "</div>").join("") +
    '</div><button type="button" id="open-search-btn">Change planet</button>';

  document.getElementById("open-search-btn")?.addEventListener("click", openModal);

  const timerEl = document.getElementById("timer") as HTMLDivElement;
  runScene(canvas, state, {
    onFrame: () => {
      timerEl.innerHTML =
        "Period: " +
        state.orbitalPeriodDays.toFixed(1) +
        " days<br>Time: " +
        state.getElapsedDays().toFixed(1) +
        " days (" +
        state.getElapsedYears().toFixed(2) +
        " years)";
    }
  });
})();
