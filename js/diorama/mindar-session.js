import * as THREE from 'three';
import { MindARThree } from 'mindar-image-three';
import { loadScene, unloadScene } from './scene-registry.js';

export async function startMindARSession({ container, targetUrl, targetIndex = 0, sceneId, profile, onStatus }) {
  const isMultiplane = sceneId === 'women-circle-25d';
  const mindar = new MindARThree({
    container,
    imageTargetSrc: targetUrl,
    filterMinCF: .04,
    filterBeta: 20,
    warmupTolerance: 3,
    missTolerance: 8,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no'
  });

  const { renderer, scene, camera } = mindar;
  renderer.setPixelRatio(Math.min(
    window.devicePixelRatio || 1,
    isMultiplane ? 1.25 : profile.pixelRatio
  ));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = profile.shadows;

  scene.add(new THREE.HemisphereLight(0xffe7d4, 0x120509, isMultiplane ? .24 : 1.75));
  const anchor = mindar.addAnchor(targetIndex);
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(isMultiplane ? .4 : .62);
  wrapper.rotation.x = Math.PI * .5;
  wrapper.position.z = .02;
  anchor.group.add(wrapper);
  const active = await loadScene(sceneId, { parent: wrapper, profile, mode: 'ar' });

  anchor.onTargetFound = () => {
    onStatus?.('Ilustración reconocida');
    active.replay();
  };
  anchor.onTargetLost = () => onStatus?.('Buscando la ilustración');

  await mindar.start();
  renderer.setAnimationLoop((time) => {
    active.update(time);
    renderer.render(scene, camera);
  });

  return async () => {
    renderer.setAnimationLoop(null);
    await unloadScene();
    wrapper.removeFromParent();
    mindar.stop();
  };
}
