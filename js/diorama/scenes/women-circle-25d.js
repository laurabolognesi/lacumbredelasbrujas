import * as THREE from 'three';

const ASSET_ROOT = './assets/diorama/women-circle-25d';
const CARD_WIDTH = 1.86;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const CARD_CENTER_Y = .88;
const PAGE_WIDTH = 2.4;
const PAGE_DEPTH = 3.2;

export async function createScene({ parent, profile, mode }) {
  const root = new THREE.Group();
  root.name = 'women-circle-25d';
  parent.add(root);

  const textures = await loadTextures();
  const materials = [];
  const page = createPage({ texture: textures.page, mode, profile, materials });
  root.add(page);

  if (mode === 'ar') root.add(createDarkSurround(materials));

  const popup = new THREE.Group();
  popup.name = 'multiplane-popup';
  popup.position.z = .12;
  root.add(popup);

  const back = createCard(textures.back, -.055, materials);
  const fire = createCard(textures.fire, .012, materials);
  const front = createCard(textures.front, .075, materials);
  const glow = createCard(textures.glow, -.004, materials, {
    blending: THREE.AdditiveBlending,
    opacity: .72,
    depthWrite: false,
    castShadow: false
  });
  popup.add(back, glow, fire, front);

  const fireLight = new THREE.PointLight(0xff5a21, profile.tier === 'low' ? 3.2 : 5.2, 3.2, 1.7);
  fireLight.name = 'paper-fire-light';
  fireLight.position.set(0, .52, .2);
  fireLight.castShadow = profile.shadows;
  if (profile.shadows) {
    fireLight.shadow.mapSize.set(512, 512);
    fireLight.shadow.bias = -.002;
    fireLight.shadow.normalBias = .03;
  }
  root.add(fireLight);

  const embers = createEmbers(profile.embers, materials);
  embers.position.set(0, .63, .19);
  root.add(embers);

  const smoke = createSmoke(profile.smoke, materials);
  smoke.position.set(0, .82, .16);
  root.add(smoke);

  let revealStarted = performance.now();
  const replay = () => {
    revealStarted = performance.now();
    popup.rotation.x = -Math.PI * .495;
    popup.scale.set(1, .001, 1);
    popup.visible = true;
  };
  replay();

  const update = (time) => {
    const elapsed = Math.max(0, (time - revealStarted) / 1450);
    const reveal = easeOutBack(Math.min(1, elapsed));
    popup.rotation.x = THREE.MathUtils.lerp(-Math.PI * .495, 0, easeInOut(Math.min(1, elapsed)));
    popup.scale.y = Math.max(.001, reveal);

    // Twelve discrete poses create a restrained paper stop-motion rhythm.
    const pose = Math.floor(time / 250) % 12;
    const phase = pose / 12 * Math.PI * 2;
    back.position.x = Math.sin(phase) * .008;
    back.rotation.z = Math.sin(phase) * .006;
    front.position.x = Math.sin(phase + .65) * -.011;
    front.rotation.z = Math.sin(phase + .65) * -.008;

    const flame = .94 + Math.sin(phase * 2.5) * .055;
    fire.scale.set(1 / flame, flame, 1);
    fire.material.opacity = .9 + Math.sin(phase * 3) * .08;
    glow.scale.setScalar(.98 + Math.sin(phase * 2) * .035);
    glow.material.opacity = .48 + Math.sin(phase * 3.2) * .13;
    fireLight.intensity = (profile.tier === 'low' ? 3.2 : 5.2) * (1 + Math.sin(phase * 2.7) * .12);

    updateEmbers(embers, time);
    updateSmoke(smoke, time);
  };

  const dispose = () => {
    root.traverse((object) => object.geometry?.dispose?.());
    materials.forEach((material) => material.dispose());
    Object.values(textures).forEach((texture) => texture.dispose());
    root.removeFromParent();
  };

  return {
    root,
    update,
    replay,
    dispose,
    view: {
      kind: 'multiplane',
      maxOrbit: .34
    }
  };
}

async function loadTextures() {
  const loader = new THREE.TextureLoader();
  const load = (name, colorSpace = THREE.SRGBColorSpace) => new Promise((resolve, reject) => {
    loader.load(
      `${ASSET_ROOT}/${name}?v=2`,
      (texture) => {
        texture.colorSpace = colorSpace;
        texture.anisotropy = 4;
        resolve(texture);
      },
      undefined,
      reject
    );
  });

  const [back, fire, front, glow, page] = await Promise.all([
    load('circle-back-v1.png'),
    load('circle-fire-v1.png'),
    load('circle-front-v1.png'),
    load('circle-fire-glow-v1.png'),
    load('book-page-reference-v1.jpg')
  ]);
  return { back, fire, front, glow, page };
}

function createCard(texture, z, materials, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: options.alphaTest ?? .035,
    side: THREE.DoubleSide,
    depthWrite: options.depthWrite ?? true,
    opacity: options.opacity ?? 1,
    blending: options.blending ?? THREE.NormalBlending,
    toneMapped: false
  });
  materials.push(material);

  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
    material
  );
  card.position.set(0, CARD_CENTER_Y, z);
  card.castShadow = options.castShadow ?? true;
  card.renderOrder = options.blending === THREE.AdditiveBlending ? 4 : 2;
  return card;
}

function createPage({ texture, mode, profile, materials }) {
  let material;
  if (mode === 'ar') {
    material = new THREE.ShadowMaterial({
      color: 0x160806,
      opacity: profile.shadows ? .48 : 0,
      transparent: true,
      depthWrite: false
    });
  } else {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: .96,
      metalness: 0,
      color: 0xffffff
    });
  }
  materials.push(material);
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(PAGE_WIDTH, PAGE_DEPTH),
    material
  );
  page.name = mode === 'ar' ? 'transparent-shadow-catcher' : 'scanned-book-page';
  page.rotation.x = -Math.PI * .5;
  page.position.y = -.012;
  page.receiveShadow = profile.shadows;
  page.renderOrder = 0;
  return page;
}

function createDarkSurround(materials) {
  const outer = new THREE.Shape();
  outer.moveTo(-12, -12);
  outer.lineTo(12, -12);
  outer.lineTo(12, 12);
  outer.lineTo(-12, 12);
  outer.closePath();

  const opening = new THREE.Path();
  opening.moveTo(-PAGE_WIDTH * .5, -PAGE_DEPTH * .5);
  opening.lineTo(-PAGE_WIDTH * .5, PAGE_DEPTH * .5);
  opening.lineTo(PAGE_WIDTH * .5, PAGE_DEPTH * .5);
  opening.lineTo(PAGE_WIDTH * .5, -PAGE_DEPTH * .5);
  opening.closePath();
  outer.holes.push(opening);

  const material = new THREE.MeshBasicMaterial({
    color: 0x020102,
    transparent: true,
    opacity: .88,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  materials.push(material);
  const surround = new THREE.Mesh(new THREE.ShapeGeometry(outer), material);
  surround.name = 'tracked-page-dark-surround';
  surround.rotation.x = -Math.PI * .5;
  surround.position.y = -.025;
  surround.renderOrder = -1;
  return surround;
}

function createEmbers(count, materials) {
  const safeCount = Math.max(0, count || 0);
  const positions = new Float32Array(safeCount * 3);
  const phases = new Float32Array(safeCount);
  for (let index = 0; index < safeCount; index += 1) {
    positions[index * 3] = (Math.random() - .5) * .34;
    positions[index * 3 + 1] = Math.random() * .72;
    positions[index * 3 + 2] = (Math.random() - .5) * .08;
    phases[index] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.userData.phases = phases;
  const material = new THREE.PointsMaterial({
    color: 0xff7a32,
    size: .018,
    transparent: true,
    opacity: .86,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  materials.push(material);
  const points = new THREE.Points(geometry, material);
  points.userData.basePositions = positions.slice();
  return points;
}

function updateEmbers(embers, time) {
  const attribute = embers.geometry.getAttribute('position');
  const base = embers.userData.basePositions;
  const phases = embers.geometry.userData.phases;
  for (let index = 0; index < attribute.count; index += 1) {
    const travel = ((time * .00017 + phases[index]) % 1);
    attribute.setX(index, base[index * 3] + Math.sin(time * .002 + index) * .025);
    attribute.setY(index, travel * .82);
  }
  attribute.needsUpdate = true;
}

function createSmoke(count, materials) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(.28, .46);
  for (let index = 0; index < Math.max(0, count || 0); index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x806a63,
      transparent: true,
      opacity: .09,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide
    });
    materials.push(material);
    const puff = new THREE.Mesh(geometry.clone(), material);
    puff.position.set((Math.random() - .5) * .18, index * .16, index * -.008);
    puff.rotation.z = Math.random() * Math.PI;
    puff.userData.phase = index / Math.max(1, count);
    group.add(puff);
  }
  geometry.dispose();
  return group;
}

function updateSmoke(smoke, time) {
  smoke.children.forEach((puff, index) => {
    const travel = (time * .00007 + puff.userData.phase) % 1;
    puff.position.y = travel * 1.15;
    puff.position.x = Math.sin(time * .0008 + index) * .11;
    puff.scale.setScalar(.45 + travel * .9);
    puff.material.opacity = Math.sin(travel * Math.PI) * .085;
  });
}

function easeInOut(value) {
  return value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}
