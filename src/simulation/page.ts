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
  const examplesListEl = document.getElementById("examples-list") as HTMLUListElement;
  const closeBtn = document.getElementById("search-close");

  function openModal(): void {
    overlay?.classList.add("visible");
    if (document.getElementById("tab-examples")?.classList.contains("active")) {
      statusEl.textContent = "Click a planet to visualize.";
      loadExamples()
        .then(renderExamples)
        .catch(() => {
          statusEl.textContent = "Could not load preloaded planets.";
        });
    }
  }

  function closeModal(): void {
    overlay?.classList.remove("visible");
  }

  closeBtn?.addEventListener("click", closeModal);
  overlay?.addEventListener("click", (e: Event) => {
    if (e.target === overlay) closeModal();
  });
  modal?.addEventListener("click", (e: Event) => e.stopPropagation());

  const emptyInput = (): QueryInput => ({
    st_rad_min: "", st_rad_max: "", st_teff_min: "", st_teff_max: "",
    pl_orbsmax_min: "", pl_orbsmax_max: "", pl_rade_min: "", pl_rade_max: "",
    pl_masse_min: "", pl_masse_max: "", pl_orbper_min: "", pl_orbper_max: "",
    pl_orbeccen_min: "", pl_orbeccen_max: ""
  });

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
      pl_orbper_max: (fd.get("pl_orbper_max") ?? "") as string,
      pl_orbeccen_min: (fd.get("pl_orbeccen_min") ?? "") as string,
      pl_orbeccen_max: (fd.get("pl_orbeccen_max") ?? "") as string
    };
  }

  const PRESETS: { name: string; names?: string[]; input?: QueryInput }[] = [
    {
      name: "Famous (Kepler, TRAPPIST, Proxima…)",
      names: ["Kepler-452 b", "Kepler-442 b", "Kepler-186 f", "TRAPPIST-1 e", "TRAPPIST-1 f", "Proxima Centauri b", "51 Pegasi b", "HD 209458 b"]
    },
    {
      name: "Highly elliptical orbits",
      input: { ...emptyInput(), pl_orbeccen_min: "0.5", pl_orbeccen_max: "1" }
    },
    {
      name: "Hot Jupiters",
      input: { ...emptyInput(), pl_rade_min: "8", pl_orbsmax_max: "0.1" }
    },
    {
      name: "Earth-sized (0.5–1.5 R⊕)",
      input: { ...emptyInput(), pl_rade_min: "0.5", pl_rade_max: "1.5" }
    }
  ];

  let examplesLoaded: TapRow[] | null = null;
  async function loadExamples(): Promise<TapRow[]> {
    if (examplesLoaded) return examplesLoaded;
    const res = await fetch("preloaded-planets.json");
    if (!res.ok) throw new Error("Could not load preloaded planets.");
    const data = (await res.json()) as TapRow[];
    examplesLoaded = Array.isArray(data) ? data : [];
    return examplesLoaded;
  }
  function renderExamples(rows: TapRow[]): void {
    if (!examplesListEl) return;
    examplesListEl.innerHTML = "";
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
      examplesListEl.appendChild(li);
    });
  }
  document.querySelectorAll(".modal-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = (btn as HTMLElement).dataset.tab;
      document.querySelectorAll(".modal-tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = document.getElementById("tab-" + tab);
      if (panel) panel.classList.add("active");
      if (tab === "examples") {
        statusEl.textContent = "Click a planet to visualize.";
        loadExamples()
          .then(renderExamples)
          .catch(() => {
            statusEl.textContent = "Could not load preloaded planets.";
          });
      }
    });
  });
  const gridEl = document.getElementById("suggestions-grid");
  PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = preset.name;
    btn.addEventListener("click", async () => {
      statusEl.textContent = "Loading…";
      resultsEl.innerHTML = "";
      const out = preset.names
        ? await window.GoldilocksQuery.fetchPlanetsByNames(preset.names)
        : await window.GoldilocksQuery.fetchPlanets(preset.input!);
      if (!out.ok) {
        statusEl.textContent = "Error: " + (out as { error: string }).error;
        return;
      }
      const data = (out as { data: TapRow[] }).data ?? [];
      if (data.length === 0) {
        statusEl.textContent = "No planets in this category.";
        return;
      }
      statusEl.textContent = data.length + " result(s). Click a row to visualize.";
      renderList(data);
    });
    gridEl?.appendChild(btn);
  });

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
      const msg = (out as { error?: string }).error || "Could not load data.";
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
    openModal();
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

  function updateScaleBar(maxAu: number): void {
    const NICE = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
    const maxVal = NICE.find((n) => n >= maxAu * 1.05) ?? NICE[NICE.length - 1];
    const step = maxVal / 5;
    const niceStep = NICE.find((n) => n >= step) ?? NICE[NICE.length - 1];
    const ticks: number[] = [0];
    for (let v = niceStep; v < maxVal - 1e-9; v += niceStep) ticks.push(v);
    if (ticks[ticks.length - 1] !== maxVal) ticks.push(maxVal);
    const formatAu = (v: number) =>
      v >= 1 ? (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)) : v >= 0.1 ? v.toFixed(1) : v.toFixed(2);
    const w = 200;
    const h = 44;
    const lineY = 10;
    const tickY2 = 18;
    const labelY = 32;
    let tickLines = "";
    let labels = "";
    ticks.forEach((v, i) => {
      const x = maxVal > 0 ? (v / maxVal) * w : 0;
      tickLines += `<line x1="${x}" y1="${lineY}" x2="${x}" y2="${tickY2}"/>`;
      const anchor = i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
      labels += `<text x="${x}" y="${labelY}" text-anchor="${anchor}">${formatAu(v)}</text>`;
    });
    const scaleEl = document.getElementById("scale");
    const scaleBar = scaleEl?.querySelector("#scale-bar") ?? document.getElementById("scale-bar");
    if (scaleBar) {
      scaleBar.innerHTML =
        `<line x1="0" y1="${lineY}" x2="${w}" y2="${lineY}" stroke="#fff" stroke-width="2"/>` +
        tickLines +
        labels;
    }
  }

  const maxDist = Math.max(state.hzOuter, state.orbitRadius);
  updateScaleBar(maxDist);

  function fmt(x: number | null, decimals: number): string {
    return x != null ? x.toFixed(decimals) : "—";
  }
  const lines = [
    "<b>" + state.plName + "</b> (" + state.hostName + ")",
    "Orbit: " + state.orbitAu.toFixed(3) + " AU",
    "Orbital period: " + state.orbitalPeriodDays.toFixed(1) + " days",
    "Planet radius: " + fmt(state.planetRadiusRe, 2) + " R⊕",
    "Planet mass: " + fmt(state.planetMassMe, 2) + " M⊕",
    "Orbit eccentricity: " + (state.eccentricityKnown ? state.orbitEccentricity.toFixed(2) : "unknown"),
    "—",
    "Star luminosity: " + fmt(state.starLuminosity, 3) + " L☉",
    "Star temp: " + fmt(state.starTeffK, 0) + " K",
    "Star radius: " + fmt(state.starRadiusRsun, 3) + " R☉",
    "Star mass: " + fmt(state.starMassMsun, 3) + " M☉",
    "—",
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
