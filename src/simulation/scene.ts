/**
 * Rendering only: reads state object, calls state.update() and state.getPlanetPosition(), draws.
 * No orbit/HZ math, no parsing. Expects THREE on window (script tag).
 */
declare const THREE: typeof import("three");

import type { SimulationState } from "./model.js";

// One orbit at "middle of green" radius ≈ 20 s at 60fps (2π in 1200 frames)
const DT = (2 * Math.PI) / 1200;
const DRAG_SENSITIVITY = 0.0005;
const ZOOM_SENSITIVITY = 0.0004;

/** Star color from effective temp (K): red → orange → yellow → white → blue. Default yellow if unknown. */
function teffToHex(teffK: number | null): number {
  const T = teffK != null && teffK > 0 ? Math.max(2000, Math.min(40000, teffK)) : 5778;
  // Key points: 2500 red, 4000 orange, 5800 yellow, 7500 white, 12000 blue-white, 25000 blue
  const keys = [
    { t: 2500, r: 1, g: 0.2, b: 0 },
    { t: 4000, r: 1, g: 0.5, b: 0 },
    { t: 5800, r: 1, g: 0.9, b: 0.4 },
    { t: 7500, r: 1, g: 0.95, b: 0.95 },
    { t: 12000, r: 0.8, g: 0.85, b: 1 },
    { t: 25000, r: 0.5, g: 0.6, b: 1 }
  ];
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t < T) i++;
  const a = keys[i];
  const b = keys[Math.min(i + 1, keys.length - 1)];
  const f = (T - a.t) / (b.t - a.t);
  const r = Math.round(255 * (a.r + f * (b.r - a.r)));
  const g = Math.round(255 * (a.g + f * (b.g - a.g)));
  const bl = Math.round(255 * (a.b + f * (b.b - a.b)));
  return (r << 16) | (g << 8) | bl;
}

export interface SceneOptions {
  onFrame?: () => void;
}

export function runScene(canvas: HTMLCanvasElement, state: SimulationState, options?: SceneOptions): void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  const systemScale = Math.max(state.hzOuter, state.orbitRadius, 0.08);
  const orbitExtent = state.orbitRadius * (1 + Math.min(0.99, state.orbitEccentricity));
  const fovHalfRad = (50 * Math.PI) / 180 / 2;
  const cameraPhiDefault = 1.15;
  const tiltFactor = Math.sin(cameraPhiDefault);
  const defaultCameraRadius = (orbitExtent * 1.05 * tiltFactor) / Math.tan(fovHalfRad);
  const minRadius = systemScale * 0.2;
  const maxRadius = Math.max(systemScale * 4, defaultCameraRadius * 2);
  let cameraRadius = defaultCameraRadius;
  let cameraTheta = Math.PI / 4;
  let cameraPhi = cameraPhiDefault;
  let isDragging = false;
  let lastY = 0;

  function updateCameraPosition(): void {
    cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi));
    cameraRadius = Math.max(minRadius, Math.min(maxRadius, cameraRadius));
    camera.position.set(
      cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta),
      cameraRadius * Math.cos(cameraPhi),
      cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta)
    );
    camera.lookAt(target);
  }

  canvas.addEventListener("mousedown", (e: MouseEvent) => {
    isDragging = true;
    lastY = e.clientY;
  });
  canvas.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    cameraPhi -= (e.clientY - lastY) * DRAG_SENSITIVITY;
    lastY = e.clientY;
    updateCameraPosition();
  });
  canvas.addEventListener("mouseup", () => { isDragging = false; });
  canvas.addEventListener("mouseleave", () => { isDragging = false; });
  canvas.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    cameraRadius *= 1 - e.deltaY * ZOOM_SENSITIVITY;
    updateCameraPosition();
  }, { passive: false });

  updateCameraPosition();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  const starColor = teffToHex(state.starTeffK);
  const starGeo = new THREE.SphereGeometry(state.starRadius, 32, 32);
  // Emissive = reads as self-luminous (no fake sphere). True bloom would need post-processing.
  const starMat = new THREE.MeshStandardMaterial({
    color: starColor,
    emissive: starColor,
    emissiveIntensity: 1.2
  });
  const star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // 3 concentric disks: red (center → inner HZ), green (HZ), blue (outer)
  const outerBlue = Math.max(
    state.hzOuter + (state.hzOuter - state.hzInner),
    orbitExtent * 1.05
  );
  const rotX = -Math.PI / 2;
  const segments = 64;
  const redGeo = new THREE.CircleGeometry(state.hzInner, segments);
  const redDisk = new THREE.Mesh(
    redGeo,
    new THREE.MeshBasicMaterial({ color: 0xcc4444, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  redDisk.rotation.x = rotX;
  scene.add(redDisk);

  const greenGeo = new THREE.RingGeometry(state.hzInner, state.hzOuter, segments);
  const greenDisk = new THREE.Mesh(
    greenGeo,
    new THREE.MeshBasicMaterial({ color: 0x00aa44, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  greenDisk.rotation.x = rotX;
  scene.add(greenDisk);

  const blueGeo = new THREE.RingGeometry(state.hzOuter, outerBlue, segments);
  const blueDisk = new THREE.Mesh(
    blueGeo,
    new THREE.MeshBasicMaterial({ color: 0x4488ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  );
  blueDisk.rotation.x = rotX;
  scene.add(blueDisk);

  const points = state.getOrbitPoints().map(p => new THREE.Vector3(p.x, p.y, p.z));
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(points);
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const orbitLine = new THREE.Line(orbitGeo, orbitMat);
  scene.add(orbitLine);

  const planetGeo = new THREE.SphereGeometry(state.planetRadius, 16, 16);
  const planetMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  const pos = state.getPlanetPosition();
  planet.position.set(pos.x, pos.y, pos.z);
  scene.add(planet);

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w && h) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  }

  function animate(): void {
    requestAnimationFrame(animate);
    state.update(DT);
    const p = state.getPlanetPosition();
    planet.position.set(p.x, p.y, p.z);
    options?.onFrame?.();
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", resize);
  resize();
  animate();
}
