import * as THREE from 'three';
import { addPaperEdges, createPaperMaterial } from '../paper-material.js?v=2';

const TEXT = [
  'LA CUMBRE DE LAS BRUJAS',
  'Laura Bolognesi',
  'página · fuego · memoria',
  'fragmento interior'
];

export async function createScene({ parent, profile }) {
  const root = new THREE.Group();
  root.name = 'woman-fire-diorama';
  parent.add(root);

  const paper = createPaperMaterial({ color: '#eee8dc', ink: '#765e54', snippets: TEXT, seed: 21, textOpacity: 0 });
  const printedPaper = createPaperMaterial({ color: '#e7dece', ink: '#6b5149', snippets: TEXT, seed: 26, textOpacity: .5 });
  const winePaper = createPaperMaterial({ color: '#8c5360', ink: '#2d1119', accent: '#7b1731', snippets: TEXT, seed: 32, textOpacity: .24 });
  const darkPaper = createPaperMaterial({ color: '#555d60', ink: '#d8c0a2', snippets: TEXT, seed: 44, textOpacity: 0 });
  const flamePaper = createPaperMaterial({ color: '#ff8a3d', ink: '#7f161d', accent: '#ff3d17', snippets: ['fuego', 'brasas', 'la noche'], seed: 53 });
  const pagePaper = createPaperMaterial({ color: '#cbb89d', ink: '#5b3a39', snippets: TEXT, seed: 68 });

  const page = mesh(new THREE.BoxGeometry(2.65, .055, 1.72, 1, 1, 1), pagePaper, 0x5a3833, .42);
  page.position.y = -.03;
  page.receiveShadow = profile.shadows;
  root.add(page);

  const spine = mesh(new THREE.BoxGeometry(.055, .075, 1.7), darkPaper, 0x321a1c, .58);
  spine.position.set(-1.29, .005, 0);
  root.add(spine);

  const women = createWomenCircle({ paper, printedPaper, winePaper, darkPaper, profile });
  root.add(women);

  const fire = createFire({ paper, darkPaper, flamePaper, profile });
  fire.group.position.set(0, .03, 0);
  fire.group.scale.setScalar(.9);
  root.add(fire.group);

  const popupFold = mesh(new THREE.BoxGeometry(1.95, .018, .035), winePaper, 0x4a2228, .45);
  popupFold.position.set(0, .018, -.42);
  root.add(popupFold);

  root.scale.set(1, .001, 1);
  root.rotation.x = -Math.PI * .48;
  let revealStarted = performance.now();

  const replay = () => {
    revealStarted = performance.now();
    root.scale.y = .001;
    root.rotation.x = -Math.PI * .48;
  };

  const update = (time) => {
    const elapsed = Math.max(0, (time - revealStarted) / 1550);
    const reveal = easeOutBack(Math.min(1, elapsed));
    root.scale.y = Math.max(.001, reveal);
    root.rotation.x = THREE.MathUtils.lerp(-Math.PI * .48, 0, easeInOut(Math.min(1, elapsed)));

    women.userData.update?.(time);
    fire.update(time);
  };

  const dispose = () => {
    root.traverse((object) => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else disposeMaterial(object.material);
    });
    root.removeFromParent();
  };

  return { root, update, replay, dispose };
}

function createWomenCircle({ paper, printedPaper, winePaper, darkPaper, profile }) {
  const circle = new THREE.Group();
  const figures = [];
  const count = 6;
  const radiusX = .87;
  const radiusZ = .57;

  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI * .5 + index * Math.PI * 2 / count;
    const figure = createStandingWoman({
      paper,
      printedPaper,
      winePaper,
      darkPaper,
      shadows: profile.shadows,
      variant: index
    });
    figure.position.set(Math.cos(angle) * radiusX, .035, Math.sin(angle) * radiusZ);
    figure.rotation.y = -Math.PI * .5 - angle;
    figure.scale.setScalar(.61);
    figure.userData.baseY = figure.position.y;
    figure.userData.phase = index * .62;
    figures.push(figure);
    circle.add(figure);
  }

  circle.updateMatrixWorld(true);
  figures.forEach((figure, index) => {
    const nextFigure = figures[(index + 1) % figures.length];
    figure.updateMatrix();
    nextFigure.updateMatrix();
    const start = new THREE.Vector3(.65, .76, .025).applyMatrix4(figure.matrix);
    const end = new THREE.Vector3(-.65, .76, .025).applyMatrix4(nextFigure.matrix);
    const joinedHands = foldedLimb(start, end, paper, .018, .025);
    joinedHands.name = `joined-hands-${index}`;
    circle.add(joinedHands);
  });

  circle.userData.update = (time) => {
    // Doce poses discretas forman un ciclo de tres segundos: stop-motion de papel.
    const pose = Math.floor(time / 250) % 12;
    const cycle = pose / 12 * Math.PI * 2;
    figures.forEach((figure, index) => {
      const sway = Math.sin(cycle + figure.userData.phase);
      const breath = Math.sin(cycle * 2 + figure.userData.phase * .45);
      figure.rotation.z = sway * .022;
      figure.position.y = figure.userData.baseY + Math.max(0, breath) * .008;
      figure.userData.pose?.(sway, breath, index);
    });
  };

  return circle;
}

function createStandingWoman({ paper, printedPaper, winePaper, darkPaper, shadows, variant }) {
  const woman = new THREE.Group();
  const skirt = createPleatedSkirt({ paper, printedPaper, variant });
  skirt.rotation.y = variant * .29;
  woman.add(skirt);

  const bodice = mesh(
    new THREE.CylinderGeometry(.135, .215, .43, 8, 1, false),
    paper,
    0x786158,
    .4
  );
  bodice.position.y = .91;
  bodice.rotation.y = Math.PI * .125;
  woman.add(bodice);

  const leftLapel = panel([
    [-.18, 1.1], [-.03, .89], [0, .73], [-.13, .9]
  ], .028, variant === 2 ? printedPaper : paper, 0x72574e, .58);
  leftLapel.position.z = .205;
  leftLapel.rotation.y = -.12;
  woman.add(leftLapel);

  const rightLapel = panel([
    [.18, 1.1], [.03, .89], [0, .73], [.13, .9]
  ], .028, variant === 4 ? printedPaper : paper, 0x72574e, .58);
  rightLapel.position.z = .205;
  rightLapel.rotation.y = .12;
  woman.add(rightLapel);

  const waistFold = panel([
    [-.22, .76], [0, .66], [.22, .76], [.08, .82], [0, .75], [-.08, .82]
  ], .046, variant % 3 === 0 ? winePaper : paper, 0x664a43, .54);
  waistFold.position.z = .2;
  woman.add(waistFold);

  const neck = mesh(
    new THREE.CylinderGeometry(.065, .075, .16, 6),
    paper,
    0x755e54,
    .42
  );
  neck.position.y = 1.2;
  woman.add(neck);

  const head = mesh(new THREE.DodecahedronGeometry(.145, 0), paper, 0x6d554c, .46);
  head.scale.set(.82, 1.12, .9);
  head.position.set(0, 1.38, 0);
  head.rotation.set(.03, -.12 + variant * .035, -.04);
  woman.add(head);

  const faceProfile = panel([
    [-.115, 1.31], [-.1, 1.46], [-.02, 1.53], [.11, 1.48],
    [.15, 1.42], [.205, 1.39], [.15, 1.355], [.16, 1.31],
    [.085, 1.255], [-.025, 1.25]
  ], .025, paper, 0x6d554c, .52);
  faceProfile.position.z = .14;
  woman.add(faceProfile);

  const hair = createLayeredHair({ darkPaper, variant });
  woman.add(hair);

  const leftArm = createArticulatedArm({
    side: -1,
    paper,
    printedPaper,
    printed: variant === 1
  });
  const rightArm = createArticulatedArm({
    side: 1,
    paper,
    printedPaper,
    printed: variant === 5
  });
  woman.add(leftArm, rightArm);

  const leftHand = mesh(new THREE.DodecahedronGeometry(.052, 0), paper, 0x755e54, .42);
  leftHand.position.set(-.65, .76, .025);
  woman.add(leftHand);

  const rightHand = mesh(new THREE.DodecahedronGeometry(.052, 0), paper, 0x755e54, .42);
  rightHand.position.set(.65, .76, .025);
  woman.add(rightHand);

  if (variant % 2 === 0) {
    const trailingPage = panel([
      [-.25, .65], [-.4, .5], [-.43, .08], [-.3, .18], [-.18, .61]
    ], .022, printedPaper, 0x80695c, .36);
    trailingPage.position.z = -.21;
    trailingPage.rotation.y = -.16;
    woman.add(trailingPage);
  }

  woman.userData.pose = (sway, breath) => {
    hair.rotation.z = sway * .016;
    skirt.rotation.y = variant * .29 + sway * .024;
    leftArm.rotation.z = breath * .004;
    rightArm.rotation.z = breath * -.004;
    head.rotation.z = -.04 + sway * .01;
  };

  woman.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = shadows;
    object.receiveShadow = shadows;
  });
  return woman;
}

function createPleatedSkirt({ paper, printedPaper, variant }) {
  const segments = 14;
  const positions = [];
  const geometry = new THREE.BufferGeometry();

  for (let index = 0; index < segments; index += 1) {
    const angleA = index / segments * Math.PI * 2;
    const angleB = (index + 1) / segments * Math.PI * 2;
    const bottomRadiusA = index % 2 ? .275 : .38;
    const bottomRadiusB = (index + 1) % 2 ? .275 : .38;
    const topRadiusA = index % 2 ? .115 : .15;
    const topRadiusB = (index + 1) % 2 ? .115 : .15;
    const bottomA = [Math.cos(angleA) * bottomRadiusA, .05, Math.sin(angleA) * bottomRadiusA];
    const bottomB = [Math.cos(angleB) * bottomRadiusB, .05, Math.sin(angleB) * bottomRadiusB];
    const topA = [Math.cos(angleA) * topRadiusA, .74, Math.sin(angleA) * topRadiusA];
    const topB = [Math.cos(angleB) * topRadiusB, .74, Math.sin(angleB) * topRadiusB];
    positions.push(...bottomA, ...bottomB, ...topB, ...bottomA, ...topB, ...topA);
    geometry.addGroup(index * 6, 6, (index + variant) % 6 === 0 ? 1 : 0);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return mesh(geometry, [paper, printedPaper], 0x80695c, .48);
}

function createLayeredHair({ darkPaper, variant }) {
  const hair = new THREE.Group();
  const crownBack = panel([
    [-.24, 1.42], [-.18, 1.56], [.02, 1.62], [.22, 1.53],
    [.25, 1.42], [.04, 1.47], [-.12, 1.45]
  ], .055, darkPaper, 0x22282a, .72);
  crownBack.position.z = -.055;
  crownBack.rotation.y = .09;
  hair.add(crownBack);

  const crownFront = panel([
    [-.21, 1.48], [-.02, 1.64], [.22, 1.54], [.08, 1.47], [-.1, 1.46]
  ], .045, darkPaper, 0x202629, .78);
  crownFront.position.z = .115;
  crownFront.rotation.y = -.08 + variant * .012;
  hair.add(crownFront);

  const ribbons = [
    [[-.23, 1.47], [-.36, 1.27], [-.34, .96], [-.24, 1.08], [-.18, 1.37]],
    [[-.14, 1.53], [-.27, 1.31], [-.25, .87], [-.13, 1.06], [-.06, 1.43]],
    [[.02, 1.54], [.16, 1.37], [.2, .98], [.1, 1.13], [-.04, 1.45]],
    [[.11, 1.5], [.28, 1.34], [.31, 1.08], [.19, 1.16], [.04, 1.43]],
    [[-.22, 1.5], [-.02, 1.61], [.21, 1.52], [.06, 1.46], [-.12, 1.45]]
  ];

  ribbons.forEach((points, index) => {
    const ribbon = panel(points, .025 + index * .004, darkPaper, 0x202629, .68);
    ribbon.position.z = -.1 + index * .045;
    ribbon.rotation.y = (index - 2) * .065;
    ribbon.rotation.z = (variant % 3 - 1) * .012 * index;
    hair.add(ribbon);
  });
  return hair;
}

function createArticulatedArm({ side, paper, printedPaper, printed }) {
  const arm = new THREE.Group();
  const material = printed ? printedPaper : paper;
  const shoulder = new THREE.Vector3(.18 * side, 1.03, 0);
  const elbow = new THREE.Vector3(.39 * side, .91 + (side > 0 ? .01 : -.015), .035);
  const hand = new THREE.Vector3(.65 * side, .76, .025);
  const upper = foldedLimb(shoulder, elbow, paper, .07, .085);
  const forearm = foldedLimb(elbow, hand, material, .045, .065);
  arm.add(upper, forearm);

  const sleeve = panel(side < 0 ? [
    [-.16, 1.08], [-.28, 1.02], [-.43, .91], [-.36, .83], [-.19, .91]
  ] : [
    [.16, 1.08], [.28, 1.02], [.43, .91], [.36, .83], [.19, .91]
  ], .04, paper, 0x755e54, .5);
  sleeve.position.z = .06;
  arm.add(sleeve);
  return arm;
}

function panel(points, depth, material, edgeColor, edgeOpacity) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1
  });
  geometry.translate(0, 0, -depth * .5);
  geometry.computeVertexNormals();
  return mesh(geometry, material, edgeColor, edgeOpacity);
}

function foldedLimb(start, end, material, radiusTop = .042, radiusBottom = .058) {
  const direction = end.clone().sub(start);
  const limb = mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, direction.length(), 5, 1, false),
    material,
    0x755e54,
    .48
  );
  limb.position.copy(start).add(end).multiplyScalar(.5);
  limb.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize()
  );
  return limb;
}

function createFire({ paper, darkPaper, flamePaper, profile }) {
  const group = new THREE.Group();
  const flames = [];
  const smoke = [];

  for (let index = 0; index < 5; index += 1) {
    const log = mesh(new THREE.CylinderGeometry(.075, .075, .72, 6), index % 2 ? darkPaper : paper, 0x361a19, .72);
    log.rotation.z = Math.PI * .5;
    log.rotation.y = index * 1.18;
    log.position.y = .12 + (index % 2) * .025;
    log.castShadow = profile.shadows;
    group.add(log);
  }

  const flameHeights = profile.tier === 'low' ? [.58, .44, .33] : [.68, .54, .45, .35, .29];
  flameHeights.forEach((height, index) => {
    const flame = mesh(new THREE.ConeGeometry(.18 - index * .014, height, 5, 1, false), flamePaper, 0x8f241d, .38);
    flame.position.set((index - 2) * .09, .27 + height * .38, (index % 2 - .5) * .12);
    flame.rotation.y = index * .72;
    flame.userData.phase = index * 1.37;
    flame.userData.baseY = flame.position.y;
    flames.push(flame);
    group.add(flame);
  });

  const emberGeometry = new THREE.BufferGeometry();
  const emberPositions = new Float32Array(profile.embers * 3);
  const emberSeeds = new Float32Array(profile.embers * 4);
  for (let index = 0; index < profile.embers; index += 1) {
    emberSeeds[index * 4] = (Math.random() - .5) * .54;
    emberSeeds[index * 4 + 1] = Math.random();
    emberSeeds[index * 4 + 2] = (Math.random() - .5) * .42;
    emberSeeds[index * 4 + 3] = Math.random() * 2.6;
  }
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const embers = new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({ color: 0xffb25e, size: .035, transparent: true, opacity: .84, depthWrite: false })
  );
  group.add(embers);

  for (let index = 0; index < profile.smoke; index += 1) {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(.13 + index * .012, 0),
      new THREE.MeshBasicMaterial({ color: 0x9f8d87, transparent: true, opacity: .1, depthWrite: false })
    );
    puff.userData.phase = index / Math.max(1, profile.smoke);
    smoke.push(puff);
    group.add(puff);
  }

  const light = new THREE.PointLight(0xff5f28, profile.tier === 'high' ? 3.2 : 2.2, 3.1, 2);
  light.position.set(0, .55, .15);
  light.castShadow = profile.shadows;
  if (profile.shadows) light.shadow.mapSize.set(512, 512);
  group.add(light);

  const update = (time) => {
    const seconds = time * .001;
    flames.forEach((flame) => {
      const pulse = 1 + Math.sin(seconds * 5.2 + flame.userData.phase) * .11;
      flame.scale.set(1 / pulse, pulse, 1 / pulse);
      flame.position.y = flame.userData.baseY + Math.sin(seconds * 4 + flame.userData.phase) * .018;
      flame.rotation.z = Math.sin(seconds * 3.3 + flame.userData.phase) * .08;
    });
    light.intensity = (profile.tier === 'high' ? 3.1 : 2.1) + Math.sin(seconds * 8.4) * .42;

    const positions = embers.geometry.attributes.position.array;
    for (let index = 0; index < profile.embers; index += 1) {
      const offset = index * 3;
      const seed = index * 4;
      const travel = (seconds * (.17 + emberSeeds[seed + 1] * .22) + emberSeeds[seed + 3]) % 1;
      positions[offset] = emberSeeds[seed] + Math.sin(seconds * 2.1 + index) * .035;
      positions[offset + 1] = .34 + travel * 1.12;
      positions[offset + 2] = emberSeeds[seed + 2];
    }
    embers.geometry.attributes.position.needsUpdate = true;

    smoke.forEach((puff, index) => {
      const travel = (seconds * .12 + puff.userData.phase) % 1;
      puff.position.set(Math.sin(seconds + index) * .11, .55 + travel * 1.22, Math.cos(seconds * .7 + index) * .08);
      puff.scale.setScalar(.55 + travel * 1.7);
      puff.material.opacity = Math.sin(Math.PI * travel) * .105;
    });
  };

  return { group, update };
}

function mesh(geometry, material, edgeColor, edgeOpacity) {
  return addPaperEdges(new THREE.Mesh(geometry, material), edgeColor, edgeOpacity);
}

function disposeMaterial(material) {
  if (!material) return;
  material.map?.dispose?.();
  material.dispose?.();
}

function easeInOut(value) {
  return value < .5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}
