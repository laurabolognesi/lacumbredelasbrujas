import * as THREE from 'three';

export function createPaperMaterial({
  color = '#d6c3a7',
  ink = '#4a2b2e',
  accent = null,
  snippets = ['LA CUMBRE DE LAS BRUJAS', 'fuego · memoria · mujeres'],
  seed = 17,
  textOpacity = .68
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = mulberry32(seed);

  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalAlpha = .18;
  for (let i = 0; i < 520; i += 1) {
    const tone = random() > .5 ? 255 : 55;
    context.strokeStyle = `rgb(${tone} ${tone} ${tone})`;
    context.lineWidth = random() * 1.1;
    context.beginPath();
    const x = random() * 512;
    const y = random() * 512;
    context.moveTo(x, y);
    context.lineTo(x + (random() - .5) * 44, y + (random() - .5) * 8);
    context.stroke();
  }

  if (textOpacity > 0 && snippets.length) {
    context.globalAlpha = textOpacity;
    context.fillStyle = ink;
    context.font = '18px Georgia, serif';
    context.textBaseline = 'top';
    for (let line = 0; line < 16; line += 1) {
      const phrase = snippets[line % snippets.length];
      context.save();
      context.translate(-18 + (line % 3) * 11, 18 + line * 32);
      context.rotate((random() - .5) * .035);
      context.fillText(`${phrase}  ·  ${phrase}`, 0, 0);
      context.restore();
    }
  }

  if (accent) {
    const wash = context.createRadialGradient(310, 290, 8, 310, 290, 270);
    wash.addColorStop(0, `${accent}cc`);
    wash.addColorStop(1, `${accent}00`);
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = wash;
    context.fillRect(0, 0, 512, 512);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 2;

  return new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: .88,
    metalness: 0,
    side: THREE.DoubleSide
  });
}

export function addPaperEdges(mesh, color = 0x4b2b2a, opacity = .5) {
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry, 18),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  mesh.add(edges);
  return mesh;
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6D2B79F5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
