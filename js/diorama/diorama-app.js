import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { detectDeviceProfile } from './device-profile.js';
import { getActiveScene, loadScene, unloadScene } from './scene-registry.js?v=8';

const stage = document.getElementById('stage');
const laboratory = document.getElementById('laboratory');
const fallback = document.getElementById('fallback');
const enterButton = document.getElementById('enterButton');
const replayButton = document.getElementById('replayButton');
const controlsPanel = document.getElementById('controls');
const qualityLabel = document.getElementById('qualityLabel');
const performanceLabel = document.getElementById('performanceLabel');
const sceneStatus = document.getElementById('sceneStatus');
const introNote = document.getElementById('introNote');

const params = new URLSearchParams(window.location.search);
let sceneId = params.get('scene') || null;
const wantsAR = params.get('ar') === '1';
const profile = detectDeviceProfile();
qualityLabel.textContent = profile.forced ? `${profile.label} · manual` : profile.label;

let stopSession = null;

init().catch((error) => {
  console.error(error);
  showFallback('El dispositivo pasó al respaldo 2.5D');
});

async function init() {
  if (!sceneId) sceneId = await readActiveScene();

  if (profile.tier === 'fallback') {
    showFallback('Versión 2.5D activa');
    return;
  }

  if (wantsAR && await targetExists('./assets/targets/interiores.mind')) {
    introNote.textContent = 'Este modo usa la cámara y el marcador interior compilado.';
    enterButton.textContent = 'Iniciar lector interior';
    sceneStatus.classList.add('is-ready');
    enterButton.addEventListener('click', startAR, { once: true });
    return;
  }

  if (wantsAR) introNote.textContent = 'El marcador interior todavía no fue entregado. Se abrirá el laboratorio 3D.';
  await startDemo();
}

async function startDemo() {
  const isMultiplane = sceneId === 'women-circle-25d';
  const renderer = new THREE.WebGLRenderer({ antialias: profile.tier === 'high', alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(
    window.devicePixelRatio || 1,
    isMultiplane ? 1.35 : profile.pixelRatio
  ));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = profile.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x090405, isMultiplane ? .035 : .105);
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, .05, 30);
  camera.position.set(isMultiplane ? .15 : 3.25, isMultiplane ? 2.35 : 3.05, isMultiplane ? 4.75 : 4.55);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.set(0, isMultiplane ? .58 : .48, 0);
  orbit.enableDamping = true;
  orbit.dampingFactor = .055;
  orbit.minDistance = isMultiplane ? 3.2 : 2.4;
  orbit.maxDistance = isMultiplane ? 5.8 : 7;
  orbit.maxPolarAngle = Math.PI * .49;
  orbit.minAzimuthAngle = isMultiplane ? -.34 : -Infinity;
  orbit.maxAzimuthAngle = isMultiplane ? .34 : Infinity;
  orbit.autoRotate = !isMultiplane;
  orbit.autoRotateSpeed = .42;

  scene.add(new THREE.HemisphereLight(0xffe8d4, 0x12060a, isMultiplane ? .28 : 1.85));
  const key = new THREE.DirectionalLight(0xffd6bd, 2.3);
  key.position.set(-2.4, 4.3, 2.2);
  key.intensity = isMultiplane ? .38 : 2.3;
  key.castShadow = profile.shadows;
  if (profile.shadows) key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  const diorama = await loadScene(sceneId, { parent: scene, profile, mode: 'demo' });
  sceneStatus.classList.add('is-ready');

  enterButton.addEventListener('click', () => {
    laboratory.classList.add('is-entered');
    controlsPanel.hidden = false;
    orbit.autoRotate = false;
    diorama.replay();
  });
  replayButton.addEventListener('click', () => diorama.replay());

  let frames = 0;
  let sampleStarted = performance.now();
  renderer.setAnimationLoop((time) => {
    orbit.update();
    diorama.update(time);
    renderer.render(scene, camera);
    frames += 1;
    if (time - sampleStarted > 2200) {
      const fps = Math.round(frames * 1000 / (time - sampleStarted));
      performanceLabel.textContent = `${fps} fps · ${profile.label}`;
      frames = 0;
      sampleStarted = time;
    }
  });

  const resize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);

  stopSession = async () => {
    window.removeEventListener('resize', resize);
    renderer.setAnimationLoop(null);
    orbit.dispose();
    await unloadScene();
    renderer.dispose();
  };
}

async function startAR() {
  laboratory.classList.add('is-entered');
  controlsPanel.hidden = false;
  sceneStatus.textContent = 'Iniciando cámara…';
  sceneStatus.classList.remove('is-ready');
  const { startMindARSession } = await import('./mindar-session.js');
  stopSession = await startMindARSession({
    container: stage,
    targetUrl: './assets/targets/interiores.mind',
    targetIndex: 0,
    sceneId,
    profile,
    onStatus: (message) => {
      sceneStatus.textContent = message;
      sceneStatus.classList.toggle('is-ready', message === 'Ilustración reconocida');
    }
  });
  replayButton.addEventListener('click', () => getActiveScene()?.replay());
}

function showFallback(message) {
  stage.hidden = true;
  fallback.hidden = false;
  sceneStatus.textContent = message;
  sceneStatus.classList.add('is-ready');
  enterButton.addEventListener('click', () => {
    laboratory.classList.add('is-entered');
    controlsPanel.hidden = false;
    performanceLabel.textContent = 'Respaldo 2.5D · máxima compatibilidad';
  });
  replayButton.addEventListener('click', () => {
    fallback.animate(
      [{ opacity: .4, transform: 'scale(.94)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  });
}

async function targetExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

async function readActiveScene() {
  try {
    const response = await fetch('./content/scenes.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer el registro de escenas.');
    const manifest = await response.json();
    return manifest.activeScene || 'woman-fire';
  } catch {
    return 'woman-fire';
  }
}

window.addEventListener('pagehide', () => stopSession?.(), { once: true });
