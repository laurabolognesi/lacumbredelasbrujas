const sceneLoaders = {
  'woman-fire': () => import('./scenes/woman-fire.js?v=7'),
  'women-circle-25d': () => import('./scenes/women-circle-25d.js?v=1')
};

let activeScene = null;

export async function loadScene(sceneId, context) {
  await unloadScene();
  const loader = sceneLoaders[sceneId];
  if (!loader) throw new Error(`Escena no registrada: ${sceneId}`);
  const module = await loader();
  activeScene = await module.createScene(context);
  return activeScene;
}

export async function unloadScene() {
  if (!activeScene) return;
  activeScene.dispose?.();
  activeScene = null;
}

export function getActiveScene() {
  return activeScene;
}
