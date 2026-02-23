/**
 * Query + data processing. No UI. Call with form input; returns parsed rows or error.
 * Types (QueryInput, TapRow, FetchResult, Window.GoldilocksQuery) in globals.d.ts.
 */

const TAP_BASE = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";

const SELECT_COLS = [
  "pl_name", "hostname",
  "st_rad", "st_teff", "st_lum", "st_mass",
  "pl_rade", "pl_masse", "pl_orbsmax", "pl_orbper", "pl_orbeccen", "pl_orbincl"
].join(",");

const FROM = "ps";

const RANGES: [string, keyof QueryInput, keyof QueryInput][] = [
  ["st_rad", "st_rad_min", "st_rad_max"],
  ["st_teff", "st_teff_min", "st_teff_max"],
  ["pl_orbsmax", "pl_orbsmax_min", "pl_orbsmax_max"],
  ["pl_rade", "pl_rade_min", "pl_rade_max"],
  ["pl_masse", "pl_masse_min", "pl_masse_max"],
  ["pl_orbper", "pl_orbper_min", "pl_orbper_max"],
  ["pl_orbeccen", "pl_orbeccen_min", "pl_orbeccen_max"]
];

function buildWhere(input: QueryInput): string {
  const parts = ["default_flag = 1"];
  for (const [col, minKey, maxKey] of RANGES) {
    const minVal = input[minKey];
    const maxVal = input[maxKey];
    if (minVal === "" || minVal == null || maxVal === "" || maxVal == null) continue;
    const min = Number(minVal);
    const max = Number(maxVal);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      parts.push(`(${col} IS NOT NULL AND ${col} BETWEEN ${min} AND ${max})`);
    }
  }
  return parts.join(" AND ");
}

function buildQuery(input: QueryInput): string {
  return `SELECT ${SELECT_COLS} FROM ${FROM} WHERE ${buildWhere(input)}`;
}

const CORS_PROXY = "https://api.allorigins.win/raw?url=";

/** In-memory cache for successful results only; keyed by request. */
const resultCache = new Map<string, { ok: true; data: TapRow[] }>();

function networkErrorMsg(raw: string): string {
  if (raw === "Failed to fetch" || raw === "Network error" || /fetch|CORS|TypeError/i.test(raw)) {
    const isFile = typeof location !== "undefined" && location.protocol === "file:";
    if (isFile) {
      return "Could not reach the NASA Exoplanet Archive. Browsers block requests from file://. Run the app from a local server instead: in the project folder run \"npx serve .\", then open http://localhost:3000 in your browser.";
    }
    return "Could not reach the NASA Exoplanet Archive. The request may have been blocked (CORS) or the service is temporarily unavailable. Please try again in a moment.";
  }
  return raw;
}

async function fetchPlanets(input: QueryInput): Promise<FetchResult> {
  const query = buildQuery(input);
  const cacheKey = "q:" + query;
  const cached = resultCache.get(cacheKey);
  if (cached) return cached;

  const url = `${TAP_BASE}?query=${encodeURIComponent(query)}&format=json`;
  // Use CORS proxy for all origins: NASA TAP doesn't allow cross-origin from arbitrary sites (e.g. GitHub Pages).
  const target = CORS_PROXY + encodeURIComponent(url);

  function parseResponse(res: Response): Promise<FetchResult> {
    if (!res.ok) {
      const msg = res.status === 408
        ? "Request timed out (408). Try narrowing filters or try again."
        : "Request failed: " + res.status;
      return Promise.resolve({ ok: false, error: msg });
    }
    return res.json().then((raw: unknown) => {
      const data = Array.isArray(raw) ? raw : (raw as { data?: TapRow[]; results?: TapRow[] }).data ?? (raw as { results?: TapRow[] }).results ?? [];
      const result: FetchResult = { ok: true, data };
      resultCache.set(cacheKey, result);
      return result;
    });
  }

  async function doFetch(noCache: boolean): Promise<FetchResult> {
    const opts: RequestInit = noCache ? { cache: "no-store" } : {};
    const res = await fetch(target, opts);
    if (res.status === 408 && !noCache) {
      await new Promise((r) => setTimeout(r, 400));
      return doFetch(true);
    }
    return parseResponse(res);
  }

  try {
    return await doFetch(false);
  } catch (e: unknown) {
    const raw = (e as Error).message || "Network error";
    return { ok: false, error: networkErrorMsg(raw) };
  }
}

function fetchPlanetsByNames(names: string[]): Promise<FetchResult> {
  if (names.length === 0) return Promise.resolve({ ok: true, data: [] });
  const cacheKey = "n:" + [...names].sort().join(",");
  const cached = resultCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);

  const escaped = names.map((n) => "'" + String(n).replace(/'/g, "''") + "'");
  const inList = escaped.join(", ");
  const query = `SELECT ${SELECT_COLS} FROM ${FROM} WHERE default_flag = 1 AND pl_name IN (${inList})`;
  const url = `${TAP_BASE}?query=${encodeURIComponent(query)}&format=json`;
  const target = CORS_PROXY + encodeURIComponent(url);

  function parseResponse(res: Response): Promise<FetchResult> {
    if (!res.ok) {
      const msg = res.status === 408
        ? "Request timed out (408). Try again."
        : "Request failed: " + res.status;
      return Promise.resolve({ ok: false, error: msg });
    }
    return res.json().then((raw: unknown) => {
      const data = Array.isArray(raw) ? raw : (raw as { data?: TapRow[] }).data ?? [];
      const result: FetchResult = { ok: true, data };
      resultCache.set(cacheKey, result);
      return result;
    });
  }

  return fetch(target).then(parseResponse).catch((err: unknown) => {
    const raw = (err as Error).message || "Network error";
    return { ok: false as const, error: networkErrorMsg(raw) };
  });
}

window.GoldilocksQuery = { buildQuery, buildWhere, fetchPlanets, fetchPlanetsByNames };
