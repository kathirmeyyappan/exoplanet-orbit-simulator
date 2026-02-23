# Exoplanet Orbit Sim

Created as a part of BPRO 28800 final project.

3D orbit viz with habitable-zone (Goldilocks) display. Pick a planet and see its orbit and whether it sits inside the star’s habitable zone. Static site (TypeScript → `dist/`); runs in the browser, no backend. See **[docs/setup.md](docs/setup.md)** for local running instructions.

**Ways to pick a planet:** 

- **Examples** — preloaded list (solar system + a few exoplanets) in `preloaded-planets.json`; instant, no API. 
- **Suggestions** — preset categories that query the NASA Exoplanet Archive. (
- **Search** — custom filters against the archive. All requests go through a CORS proxy so the app works when deployed (e.g. GitHub Pages). Successful API results are cached in memory.

---

## Demo

https://github.com/user-attachments/assets/6309785d-c994-4e98-a910-86cbcda66e6c

---

## Data source and query

We query the **NASA Exoplanet Archive** TAP API (`ps` table, default composite rows). All distances and periods are in the archive’s standard units below.

### Columns we query (and what we use them for)

| Column | Meaning in archive | What we use it for |
|--------|--------------------|---------------------|
| **pl_name** | Planet name | Display label; e.g. "Kepler-1067 b". |
| **hostname** | Host star name | Display; e.g. "Kepler-1067". |
| **st_rad** | Star radius (R☉) | Star size in scene; info panel; HZ scaling. |
| **st_teff** | Star effective temperature (K) | Star color (red → blue) and temp legend. |
| **st_lum** | log₁₀(L/L☉) | Convert to L/L☉; habitable zone inner/outer (AU). |
| **st_mass** | Star mass (M☉) | Derive semi-major axis from period when needed; info panel. |
| **pl_rade** | Planet radius (Earth radii) | Planet size in scene; info panel. |
| **pl_masse** | Planet mass (Earth masses) | Info panel only. | 
| **pl_orbsmax** | Orbital semi-major axis (AU) | Orbit size, HZ in/out check, scale bar. Validated against period (Kepler III). |
| **pl_orbper** | Orbital period (days) | Orbit animation speed; period display; derive semi-major axis when missing or inconsistent. |
| **pl_orbeccen** | Orbital eccentricity (0–1) | Elliptical orbit shape; “unknown” if null. |
| **pl_orbincl** | Orbital inclination (deg) | Queried; reserved for future use. |

Search filters use the same physical quantities: we send min/max for `st_rad`, `st_teff`, `pl_orbsmax`, `pl_rade`, `pl_masse`, `pl_orbper`, `pl_orbeccen` to build the TAP `WHERE` clause.

**Preloaded planet info:** `preloaded-planets.json` holds a static list of planets (solar system eight + Proxima Cen b, Kepler-452 b, Kepler-186 f, 51 Pegasi b, HD 209458 b). Same row shape as the archive. The **Examples** tab loads this file so users can visualize without waiting on the API.

---

## Simulation calculations

### 1. Luminosity and habitable zone (HZ)

- **Luminosity:** `L/L☉ = 10^st_lum` (archive gives log₁₀(L/L☉)).
- **HZ bounds (AU):** Flux ∝ L/d² so distance ∝ √L. Inner and outer:
  - *d_inner* = 0.75 × √(L/L☉) AU  
  - *d_outer* = 1.77 × √(L/L☉) AU  
  If `st_lum` is missing we use 0.75–1.77 AU (Sun-like).

### 2. Semi-major axis when missing or inconsistent

- **Kepler III** (period *T* in years, star mass *M* in M☉, *a* in AU):
  - **a³ = T² × M**
  We always compute this **derived** *a*. We use the catalog **pl_orbsmax** only if it’s within a factor of 2 of the derived value; otherwise we use the derived value (avoids bad/placeholder catalog values like 1.0 for short-period planets).

### 3. Orbit geometry

- **Orbit radius:** Semi-major axis *a* in AU (catalog or derived above).
- **Ellipse in plane:** Radius at true anomaly θ, eccentricity *e* = **pl_orbeccen** (capped at 0.99):
  - **r = a(1 − e²) / (1 + e·cos θ)**
  Orbit is in the *xz* plane; we sample 65 points for the white orbit line.
- **Position:** *x* = *r* cos θ, *z* = *r* sin θ, *y* = 0.

### 4. Orbit animation (time and speed)

- **Kepler’s second law (equal areas in equal times):** Angular speed ∝ 1/*r*², so the planet **speeds up** when close to the star (periastron) and **slows down** when far (apastron). We use the **current** radius *r*(θ) at each step (not the semi-major axis), so elliptical orbits look physically correct.
- **Scaling:** One orbit at the *middle* of the green zone takes ~20 s. We advance the true anomaly θ by `deltaTime × (refRadius / orbitRadius) × (orbitRadius / r_current)² × √(1 − e²)` so the orbit period in animation time is unchanged.
- **Elapsed time:** Elapsed days = (*t* / 2π) × `orbitalPeriodDays`; years = days / 365.25.

### 5. Star and planet sizes in the scene

- **Scale:** 1 unit = 1 AU. Star and planet radii are scaled for visibility (not to scale with orbit).
- **Star radius (AU):** `max(MIN_STAR_RADIUS, st_rad × 0.005)`.
- **Planet radius (AU):** `max(MIN_PLANET_RADIUS, pl_rade × 0.00004)`.

### 6. Star color

- **teffToHex(st_teff):** Maps effective temperature (K) to RGB. Key points: 2500 K red → 4000 K orange → 5800 K yellow → 7500 K white → 12000 K blue-white → 25000 K blue. Used for the star mesh (emissive) and the “Star temp (K)” legend.

### 7. Habitable zone disks and status

- **Red disk:** 0 to inner HZ (too hot).
- **Green ring:** Inner to outer HZ (habitable).
- **Blue ring:** Outer HZ to a bit beyond (too far).
- **Status:** “In habitable zone” if orbit semi-major axis is between inner and outer HZ; otherwise “too close” or “too far”.
