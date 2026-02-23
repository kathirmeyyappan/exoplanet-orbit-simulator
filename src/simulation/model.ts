/**
 * Processing: raw TAP row → simulation state (Goldilocks, orbit, star, planet).
 * Scene only reads this object and calls update() / getPlanetPosition().
 */

/** 1 unit = 1 AU everywhere. */
export interface SimulationState {
  readonly plName: string;
  readonly hostName: string;
  readonly orbitAu: number;
  readonly planetRadiusRe: number;
  readonly hzInnerAu: number;
  readonly hzOuterAu: number;
  readonly inHabitableZone: boolean;
  /** 'in' = in HZ (green), 'too-close' = inside inner (red), 'too-far' = outside outer (blue) */
  readonly habitableZoneStatus: "in" | "too-close" | "too-far";
  readonly orbitalPeriodDays: number;
  readonly starRadius: number;
  readonly orbitRadius: number;
  readonly planetRadius: number;
  readonly hzInner: number;
  readonly hzOuter: number;
  readonly orbitEccentricity: number;
  readonly eccentricityKnown: boolean;
  getOrbitPoints(): Array<{ x: number; y: number; z: number }>;
  update(deltaTime: number): void;
  getPlanetPosition(): { x: number; y: number; z: number };
  getElapsedDays(): number;
  getElapsedYears(): number;
}

function get(row: Record<string, unknown>, key: string): unknown {
  return row[key] ?? row[key.toUpperCase()] ?? null;
}

function num(row: Record<string, unknown>, key: string, fallback: number): number {
  const v = get(row, key);
  return v != null && Number.isFinite(Number(v)) ? Number(v) : fallback;
}

/** HZ bounds (AU) from stellar luminosity. st_lum = log10(L/L_sun); flux ~ L/d^2 so distance ~ sqrt(L). */
function habitableZoneAU(stLum: number | null): { inner: number; outer: number } {
  if (stLum == null || !Number.isFinite(stLum)) return { inner: 0.75, outer: 1.77 };
  const L = Math.pow(10, stLum);
  return { inner: 0.75 * Math.sqrt(L), outer: 1.77 * Math.sqrt(L) };
}

/** Fixed scale: 1 unit = 1 AU. Star/planet radii exaggerated for visibility. */
const SUN_RADIUS_AU = 0.005;
const MIN_STAR_RADIUS = 0.012;
const MIN_PLANET_RADIUS = 0.008;

export function createSimulationFromRow(row: Record<string, unknown>): SimulationState {
  const plName = (get(row, "pl_name") as string) || "Planet";
  const hostName = (get(row, "hostname") as string) || "Star";
  const stRad = num(row, "st_rad", 1);
  const stLum = num(row, "st_lum", 0);
  const plOrbsmax = num(row, "pl_orbsmax", 1);
  const plOrbeccenRaw = get(row, "pl_orbeccen");
  const eccentricityKnown = plOrbeccenRaw != null && Number.isFinite(Number(plOrbeccenRaw));
  const plOrbeccen = num(row, "pl_orbeccen", 0);
  const plRade = num(row, "pl_rade", 1);
  const plOrbper = num(row, "pl_orbper", 365);

  const hzAu = habitableZoneAU(stLum);
  const inHz = plOrbsmax >= hzAu.inner && plOrbsmax <= hzAu.outer;
  const habitableZoneStatus: "in" | "too-close" | "too-far" =
    inHz ? "in" : plOrbsmax < hzAu.inner ? "too-close" : "too-far";

  const orbitEccentricity = Math.min(0.99, plOrbeccen);
  const orbitRadius = plOrbsmax;
  const hzInner = hzAu.inner;
  const hzOuter = hzAu.outer;
  const starRadius = Math.max(MIN_STAR_RADIUS, stRad * SUN_RADIUS_AU);
  const planetRadius = Math.max(MIN_PLANET_RADIUS, (plRade ?? 1) * 0.00004);

  const orbitalPeriodDays = plOrbper > 0 ? plOrbper : 365;
  let time = 0;

  function radiusAtAngle(t: number): number {
    return orbitRadius * (1 - orbitEccentricity * orbitEccentricity) / (1 + orbitEccentricity * Math.cos(t));
  }

  function positionAtTime(t: number): { x: number; y: number; z: number } {
    const r = radiusAtAngle(t);
    return {
      x: r * Math.cos(t),
      y: 0,
      z: r * Math.sin(t)
    };
  }

  const orbitPointsCache: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    orbitPointsCache.push(positionAtTime(t));
  }

  return {
    plName,
    hostName,
    orbitAu: plOrbsmax,
    planetRadiusRe: plRade,
    hzInnerAu: hzAu.inner,
    hzOuterAu: hzAu.outer,
    inHabitableZone: inHz,
    habitableZoneStatus,
    orbitalPeriodDays,
    starRadius,
    orbitRadius,
    planetRadius,
    hzInner,
    hzOuter,
    orbitEccentricity,
    eccentricityKnown,

    getOrbitPoints(): Array<{ x: number; y: number; z: number }> {
      return orbitPointsCache;
    },

    update(deltaTime: number): void {
      time += deltaTime;
    },

    getPlanetPosition(): { x: number; y: number; z: number } {
      return positionAtTime(time);
    },

    getElapsedDays(): number {
      return (time / (2 * Math.PI)) * orbitalPeriodDays;
    },

    getElapsedYears(): number {
      return this.getElapsedDays() / 365.25;
    }
  };
}
