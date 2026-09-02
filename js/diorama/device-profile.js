export function detectDeviceProfile() {
  const requested = new URLSearchParams(window.location.search).get('quality');
  if (['high', 'low', 'fallback'].includes(requested)) return profileFor(requested, true);

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
    || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });

  if (!gl) return profileFor('fallback', false);

  const memory = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const weak = memory <= 3 || cores <= 3;
  return profileFor(weak ? 'low' : 'high', false);
}

function profileFor(tier, forced) {
  const common = { tier, forced };
  if (tier === 'fallback') {
    return { ...common, label: 'Respaldo 2.5D', pixelRatio: 1, shadows: false, embers: 0, smoke: 0 };
  }
  if (tier === 'low') {
    return { ...common, label: '3D liviano', pixelRatio: 1.15, shadows: false, embers: 22, smoke: 3 };
  }
  return { ...common, label: '3D completo', pixelRatio: 1.75, shadows: true, embers: 72, smoke: 7 };
}
