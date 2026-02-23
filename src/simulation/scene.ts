/**
 * Rendering only: reads state object, calls state.update() and state.getPlanetPosition(), draws.
 * No orbit/HZ math, no parsing. Expects THREE on window (script tag).
 */
declare const THREE: typeof import("three");

import type { SimulationState } from "./model.js";

const DT = 0.005;
const DRAG_SENSITIVITY = 0.0005;
const ZOOM_SENSITIVITY = 0.0004;

export interface SceneOptions {
  onFrame?: () => void;
}

export function runScene(canvas: HTMLCanvasElement, state: SimulationState, options?: SceneOptions): void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.01, 1000);
  const target = new THREE.Vector3(0, 0, 0);
  const systemScale = Math.max(state.hzOuter, state.orbitRadius, 2);
  const minRadius = systemScale * 0.5;
  const maxRadius = systemScale * 4;
  let cameraRadius = systemScale * 1.5;
  let cameraTheta = Math.PI / 4;
  let cameraPhi = Math.PI / 4;
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

  const starGeo = new THREE.SphereGeometry(state.starRadius, 32, 32);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  const star = new THREE.Mesh(starGeo, starMat);
  scene.add(star);

  // 3 concentric disks: red (center → inner), green (inner → outer), blue (outer → outer+)
  const outerBlue = state.hzOuter + (state.hzOuter - state.hzInner);
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
