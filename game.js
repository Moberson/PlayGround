import * as THREE from 'three';

const canvas = document.querySelector('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a77d5e');
scene.fog = new THREE.FogExp2('#9a7860', 0.0125);
const camera = new THREE.PerspectiveCamera(73, window.innerWidth / window.innerHeight, 0.08, 125);
camera.position.set(0, 1.68, 8);
scene.add(camera);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 55;
const world = new THREE.Group(); scene.add(world);
const enemies = [];
const enemyMeshes = [];
const tempColor = new THREE.Color();
let yaw = 0, pitch = 0, state = 'title', round = 0, cash = 160, health = 100, maxHealth = 100;
let ammo = 12, reserve = 48, magazineSize = 12, damage = 34, fireDelay = .32, lastShot = 0, reloadTimer = 0;
let spawned = 0, waveSize = 0, kills = 0, gameTime = 0, damageFlashTime = 0, hitMarkerTime = 0;
let spawnClock = 0, toastTimeout, muzzleTime = 0, moving = false;
let redDot = false, platingLevel = 0, triggerLevel = 0, damageLevel = 0, magLevel = 0;
const keys = new Set();
const touchMove = { x: 0, y: 0 };
let touchFiring = false;

const el = (id) => document.getElementById(id);
const screens = { title: el('title-screen'), pause: el('pause-screen'), shop: el('shop-screen'), gameover: el('gameover-screen') };
const hud = el('hud');
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
function syncTouchControls() { if (!isTouchDevice || state !== 'playing') touchFiring = false; el('touch-controls').classList.toggle('hidden', !isTouchDevice || state !== 'playing'); }
const mat = (color, roughness = .86, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const mats = {
  earth: mat('#5c5546'), earth2: mat('#69634f'), concrete: mat('#777565'), dark: mat('#29312b'), metal: mat('#444940', .52, { metalness: .48 }), rust: mat('#825a43'), light: mat('#d5c596', .4, { emissive: '#b08346', emissiveIntensity: .35 }),
  zombie: mat('#a1a182'), zombieDark: mat('#535747'), cloth: mat('#3d4940'), blood: mat('#713d32'), skin: mat('#a3a181'), gun: mat('#202722', .35, { metalness: .63 }), gunTrim: mat('#75806d', .42, { metalness: .55 }),
};

function box(parent, size, material, pos, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...pos); mesh.castShadow = cast; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent, radiusTop, radiusBottom, height, material, pos, segments = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function makeGround() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mats.earth); floor.rotation.x = -Math.PI / 2; floor.position.y = -.08; floor.receiveShadow = true; world.add(floor);
  const grid = new THREE.GridHelper(80, 48, '#988363', '#736650'); grid.position.y = -.065; grid.material.transparent = true; grid.material.opacity = .22; world.add(grid);
  // Cracked concrete pads and scattered ground debris.
  for (let i = 0; i < 13; i++) {
    const x = Math.sin(i * 19.7) * 17, z = Math.cos(i * 31.3) * 15;
    const slab = box(world, [2 + (i % 3), .07, 1.4 + (i % 2)], i % 2 ? mats.concrete : mats.earth2, [x, -.025, z], false);
    slab.rotation.y = i * 1.7;
  }
  for (let i = 0; i < 35; i++) {
    const x = Math.sin(i * 48.33) * 22, z = Math.cos(i * 17.13) * 22;
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    const debris = box(world, [.16 + (i % 4) * .1, .12 + (i % 3) * .1, .22], i % 4 === 0 ? mats.rust : mats.dark, [x, .02, z], true);
    debris.rotation.y = i * 4;
  }
}
function makeBarricade(x, z, width, height, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  box(group, [width, height, .5], mats.concrete, [0, height / 2, 0]);
  box(group, [width + .13, .12, .57], mats.rust, [0, height + .02, 0]);
  for (let i = 0; i < Math.floor(width / 1.2); i++) box(group, [.045, height * .8, .53], mats.dark, [-width / 2 + i * 1.2 + .4, height * .47, .015], false);
  return group;
}
function makeContainer(x, z, color, rotation = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; world.add(group);
  const bodyMat = mat(color, .76);
  box(group, [5.4, 2.65, 2.5], bodyMat, [0, 1.33, 0]);
  for (let i = 0; i < 11; i++) box(group, [.045, 2.55, .035], mats.dark, [-2.5 + i * .5, 1.34, 1.265], false);
  box(group, [5.45, .13, 2.56], mats.metal, [0, 2.7, 0]);
  return group;
}
function makeLamp(x, z) {
  cylinder(world, .1, .12, 4.7, mats.metal, [x, 2.35, z], 7);
  const arm = box(world, [.95, .08, .08], mats.metal, [x + .4, 4.55, z]); arm.rotation.z = -.1;
  box(world, [.48, .16, .3], mats.dark, [x + .78, 4.44, z]);
  const glow = new THREE.PointLight('#ffd18c', 19, 14, 2); glow.position.set(x + .72, 4.15, z); world.add(glow);
}
function makeWorld() {
  const hemi = new THREE.HemisphereLight('#e1c7a2', '#343b31', 2.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffcb96', 2.8); sun.position.set(-14, 26, 12); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -32; sun.shadow.camera.right = 32; sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32; sun.shadow.bias = -.0005; scene.add(sun);
  const fill = new THREE.DirectionalLight('#9ab7a0', .75); fill.position.set(12, 9, -17); scene.add(fill);
  const skyGlow = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 10), new THREE.MeshBasicMaterial({ color: '#e38a55' })); skyGlow.position.set(-28, 12, -48); scene.add(skyGlow);
  makeGround();
  makeContainer(-12, -8, '#65705c', -.12); makeContainer(12, -14, '#735d4d', .18); makeContainer(17, 7, '#596451', -.3); makeContainer(-17, 11, '#6d6654', .25);
  makeBarricade(-2, -15, 11, 1.35, .02); makeBarricade(1, 16, 13, 1.2, -.1); makeBarricade(-20, -1, 8, 1.5, Math.PI / 2); makeBarricade(21, -2, 8, 1.5, Math.PI / 2);
  // Floodlights, utility poles and a broken perimeter fence.
  makeLamp(-8, -11); makeLamp(10, 9); makeLamp(-21, 12);
  for (let i = 0; i < 9; i++) {
    const x = -24 + i * 6;
    cylinder(world, .12, .16, 4 + (i % 3) * .3, mats.dark, [x, 2, -24], 6);
    if (i < 8) { const wire = box(world, [6, .035, .035], mats.dark, [x + 3, 3.8, -24], false); wire.rotation.z = -.04; }
  }
  // A wrecked utility truck silhouette.
  const truck = new THREE.Group(); truck.position.set(5, 0, -8); truck.rotation.y = -.4; world.add(truck);
  box(truck, [4.5, 1.25, 2.1], mats.dark, [0, .95, 0]); box(truck, [1.9, 1.15, 1.95], mats.rust, [-.7, 2.08, 0]);
  box(truck, [1.65, .06, 1.7], mats.metal, [-.7, 2.68, 0]);
  for (const x of [-1.4, 1.3]) for (const z of [-1.08, 1.08]) { const wheel = cylinder(truck, .47, .47, .22, mats.dark, [x, .53, z], 12); wheel.rotation.x = Math.PI / 2; }
  for (let i = 0; i < 18; i++) {
    const x = Math.sin(i * 11.8) * 35, z = -29 - (i % 4) * 8;
    const h = 3 + (i % 5) * 1.3;
    box(world, [2 + (i % 3), h, 2], i % 2 ? mats.dark : mats.rust, [x, h / 2, z], false);
    box(world, [2.4 + (i % 3), .18, 2.4], mats.dark, [x, h + .05, z], false);
    if (i % 3 === 0) box(world, [.3, .7, .06], mats.light, [x - .5, h * .55, z + 1.04], false);
  }
}
makeWorld();

// Silver 1911-inspired starting sidearm, built as a detailed first-person view model.
const pistolSteel = mat('#b8bdbe', .25, { metalness: .82 });
const pistolEdge = mat('#e0e1dc', .2, { metalness: .88 });
const pistolDarkSteel = mat('#34383a', .34, { metalness: .68 });
const pistolGrip = mat('#202223', .94);
const pistolGripRidge = mat('#373a3a', .9);
const gunRoot = new THREE.Group(); camera.add(gunRoot); gunRoot.position.set(.28, -.3, -.9); gunRoot.scale.setScalar(.78); gunRoot.rotation.y = -.08;

// Slide, frame, dust cover, and a long exposed barrel establish the classic 1911 profile.
box(gunRoot, [.225, .155, .68], pistolSteel, [0, .055, -.095]);
box(gunRoot, [.205, .075, .49], pistolSteel, [0, -.035, .055]);
box(gunRoot, [.19, .055, .31], pistolSteel, [0, -.075, -.235]);
const barrel = cylinder(gunRoot, .052, .052, .58, pistolDarkSteel, [0, .038, -.105], 12); barrel.rotation.x = Math.PI / 2;
const muzzleCollar = cylinder(gunRoot, .058, .058, .025, pistolEdge, [0, .038, -.405], 12); muzzleCollar.rotation.x = Math.PI / 2;

// Sight blocks and slide serrations catch light as the weapon bobs with the player.
box(gunRoot, [.065, .035, .055], pistolDarkSteel, [0, .15, -.395]);
box(gunRoot, [.075, .04, .05], pistolDarkSteel, [0, .15, .205]);
box(gunRoot, [.025, .009, .032], pistolEdge, [0, .173, -.397]);
box(gunRoot, [.035, .009, .032], pistolEdge, [0, .173, .207]);
for (const side of [-1, 1]) {
  for (let i = 0; i < 4; i++) {
    const serration = box(gunRoot, [.009, .092, .012], pistolDarkSteel, [side * (.083 + i * .018), .055, .249], false);
    serration.rotation.z = side * -.08;
  }
}
// Ejection port and slide stop details on the visible side of the slide.
box(gunRoot, [.105, .055, .008], pistolDarkSteel, [-.005, .065, .249], false);
box(gunRoot, [.072, .012, .012], pistolEdge, [-.005, .085, .255], false);
const slideStop = cylinder(gunRoot, .018, .018, .018, pistolDarkSteel, [.105, -.035, .255], 10); slideStop.rotation.x = Math.PI / 2;

// Angled checkered grip panels, retaining screws, and a dark magazine base.
const grip = new THREE.Group(); grip.position.set(0, -.145, .105); grip.rotation.x = -.3; gunRoot.add(grip);
box(grip, [.18, .37, .16], pistolDarkSteel, [0, -.015, 0]);
box(grip, [.174, .315, .016], pistolGrip, [0, -.025, .09], false);
for (let i = 0; i < 7; i++) {
  const ridge = box(grip, [.142, .008, .004], pistolGripRidge, [0, -.14 + i * .038, .101], false);
  ridge.rotation.z = -.48;
}
for (const y of [-.135, .075]) {
  const screw = cylinder(grip, .014, .014, .008, pistolEdge, [0, y, .103], 12); screw.rotation.x = Math.PI / 2;
  const slot = box(grip, [.014, .0025, .003], pistolDarkSteel, [0, y, .109], false); slot.rotation.z = -.55;
}
box(gunRoot, [.19, .04, .17], pistolDarkSteel, [0, -.345, .14]);
box(gunRoot, [.195, .012, .16], pistolDarkSteel, [0, -.369, .14]);

// Open trigger guard, curved trigger, beavertail, and exposed hammer.
const guardPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.085, -.045, .19), new THREE.Vector3(-.105, -.105, .19),
  new THREE.Vector3(-.095, -.19, .19), new THREE.Vector3(-.055, -.22, .19),
  new THREE.Vector3(.055, -.22, .19), new THREE.Vector3(.09, -.18, .19),
  new THREE.Vector3(.085, -.055, .19),
]);
const triggerGuard = new THREE.Mesh(new THREE.TubeGeometry(guardPath, 20, .012, 7, false), pistolSteel);
triggerGuard.castShadow = true; gunRoot.add(triggerGuard);
const trigger = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
  new THREE.Vector3(-.012, -.035, .205), new THREE.Vector3(-.018, -.09, .205),
  new THREE.Vector3(.005, -.13, .205), new THREE.Vector3(.028, -.135, .205),
]), 8, .009, 6, false), pistolDarkSteel);
gunRoot.add(trigger);
box(gunRoot, [.17, .045, .12], pistolSteel, [0, .095, .205]);
const hammer = box(gunRoot, [.075, .07, .045], pistolDarkSteel, [0, .145, .265]); hammer.rotation.x = -.25;
box(gunRoot, [.085, .025, .065], pistolSteel, [0, .155, .245]);
const safety = cylinder(gunRoot, .022, .022, .022, pistolEdge, [.112, .015, .225], 10); safety.rotation.x = Math.PI / 2;

const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.11, 8, 8), new THREE.MeshBasicMaterial({ color: '#ffd36e', transparent: true, opacity: 0 })); muzzle.position.set(0, .038, -.445); gunRoot.add(muzzle);
const muzzleLight = new THREE.PointLight('#ffb74f', 0, 3); muzzleLight.position.copy(muzzle.position); gunRoot.add(muzzleLight);

function makeEnemy(x, z) {
  const group = new THREE.Group(); group.position.set(x, 0, z); world.add(group);
  const skinMat = mat(['#93957a', '#777f6a', '#aaa087', '#747b69'][Math.floor(Math.random() * 4)], .95);
  const shirtMat = mat(Math.random() > .5 ? '#465146' : '#544b3d', .95);
  const torso = new THREE.Group(); torso.position.y = 1.02; group.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(.61, .72, .36), shirtMat); chest.position.y = .03; chest.castShadow = true; chest.userData.enemy = group; torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.235, 10, 8), skinMat); head.position.set(0, .57, -.015); head.scale.set(.88, 1.12, .9); head.castShadow = true; head.userData.enemy = group; torso.add(head);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(.19, .07, .19), mats.blood); jaw.position.set(0, .4, -.16); torso.add(jaw);
  const armPivots = [], legPivots = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .39, .26, 0); torso.add(arm); armPivots.push(arm);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(.2, .53, .22), shirtMat); upper.position.set(0, -.19, 0); upper.castShadow = true; arm.add(upper);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(.17, .2, .17), skinMat); hand.position.set(0, -.51, -.02); hand.castShadow = true; hand.userData.enemy = group; arm.add(hand);
    const leg = new THREE.Group(); leg.position.set(side * .17, .69, 0); group.add(leg); legPivots.push(leg);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(.24, .55, .27), mats.zombieDark); thigh.position.y = -.27; thigh.castShadow = true; thigh.userData.enemy = group; leg.add(thigh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.24, .14, .35), mats.dark); foot.position.set(0, -.56, -.055); foot.castShadow = true; leg.add(foot);
  }
  group.userData = { torso, armPivots, legPivots, hp: round < 4 ? 72 : 72 + round * 7, speed: .66 + Math.min(round, 9) * .055, attack: 0, phase: Math.random() * 6, dead: false };
  group.traverse(o => { if (o.isMesh && o.userData.enemy === group) enemyMeshes.push(o); });
  enemies.push(group); return group;
}
function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2;
  const radius = 19 + Math.random() * 5;
  const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  makeEnemy(x, z);
}
function updateEnemyCount() { el('enemy-count').textContent = String(enemies.filter(e => !e.userData.dead).length).padStart(2, '0'); }
function updateHud() {
  el('round-value').textContent = String(round).padStart(2, '0');
  el('cash-value').textContent = String(cash).padStart(3, '0');
  el('health-value').textContent = Math.max(0, Math.ceil(health));
  el('health-fill').style.width = `${Math.max(0, health / maxHealth * 100)}%`;
  el('health-fill').style.background = health < 30 ? '#f2754c' : '';
  el('ammo-value').textContent = String(ammo).padStart(2, '0');
  el('reserve-value').textContent = String(reserve).padStart(2, '0');
  el('wave-progress').style.width = waveSize ? `${Math.min(100, kills / waveSize * 100)}%` : '0%';
  updateEnemyCount();
}
function toast(message) {
  const node = el('toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove('show'), 1900);
}
function startRound() {
  round++; state = 'playing'; spawned = 0; kills = 0; waveSize = 4 + round * 2; spawnClock = 0.1;
  ammo = magazineSize; reserve += 12 + Math.min(round * 2, 14); health = Math.min(maxHealth, health + 12);
  enemies.splice(0).forEach(e => world.remove(e));
  enemyMeshes.length = 0;
  el('wave-status').textContent = `THREATS INBOUND // ${waveSize} HOSTILES`;
  el('objective-title').textContent = 'STAY ALIVE'; el('objective-copy').textContent = 'Clear the perimeter.';
  Object.values(screens).forEach(s => s.classList.remove('visible'));
  hud.classList.remove('hidden');
  syncTouchControls();
  updateHud(); requestLock();
}
function requestLock() { if (!isTouchDevice && document.pointerLockElement !== canvas) canvas.requestPointerLock?.(); }
function finishRound() {
  state = 'shop'; document.exitPointerLock?.(); el('touch-controls').classList.add('hidden');
  cash += 75 + round * 10; reserve += 8;
  el('wave-status').textContent = 'PERIMETER SECURE';
  el('objective-title').textContent = 'ZONE SECURE'; el('objective-copy').textContent = 'Choose an upgrade.';
  el('next-round').textContent = String(round + 1).padStart(2, '0');
  renderShop(); updateHud(); screens.shop.classList.add('visible');
}
function gameOver() {
  state = 'over'; document.exitPointerLock?.(); el('touch-controls').classList.add('hidden'); screens.gameover.classList.add('visible');
  el('final-stats').textContent = `You held the line through ${round} round${round === 1 ? '' : 's'} and eliminated ${eliminated} hostiles.`;
}
let eliminated = 0;
function resetGame() {
  enemies.splice(0).forEach(e => world.remove(e));
  for (let i = enemyMeshes.length - 1; i >= 0; i--) enemyMeshes.pop();
  round = 0; cash = 160; health = maxHealth = 100; ammo = 12; reserve = 48; magazineSize = 12; damage = 34; fireDelay = .32; eliminated = 0;
  redDot = false; platingLevel = triggerLevel = damageLevel = magLevel = 0;
  camera.position.set(0, 1.68, 8); yaw = 0; pitch = 0; updateHud(); startRound();
}

const upgrades = [
  { id: 'damage', name: 'HOLLOW POINT', icon: '⌁', description: 'Harder-hitting rounds. +18 damage per shot.', cost: 85, level: () => damageLevel, max: 3, apply: () => { damageLevel++; damage += 18; } },
  { id: 'mag', name: 'EXTENDED MAG', icon: '▥', description: 'More room in the mag. +6 capacity & refill.', cost: 70, level: () => magLevel, max: 3, apply: () => { magLevel++; magazineSize += 6; ammo = magazineSize; } },
  { id: 'trigger', name: 'HAIR TRIGGER', icon: '»', description: 'A tuned trigger group. Fire 18% faster.', cost: 95, level: () => triggerLevel, max: 3, apply: () => { triggerLevel++; fireDelay *= .82; } },
  { id: 'reddot', name: 'RED DOT SIGHT', icon: '⊙', description: 'A clean sight picture. Tighter shot spread.', cost: 110, once: true, owned: () => redDot, apply: () => { redDot = true; el('crosshair').classList.add('precise'); } },
  { id: 'armor', name: 'CERAMIC PLATES', icon: '⬡', description: '+25 max health and restore 35 health.', cost: 100, level: () => platingLevel, max: 3, apply: () => { platingLevel++; maxHealth += 25; health = Math.min(maxHealth, health + 35); } },
  { id: 'medkit', name: 'FIELD DRESSING', icon: '+', description: 'Restore 55 health. One-time use each visit.', cost: 55, apply: () => { health = Math.min(maxHealth, health + 55); } },
];
function renderShop() {
  el('shop-cash').textContent = String(cash).padStart(3, '0');
  const list = el('upgrade-list'); list.innerHTML = '';
  for (const item of upgrades) {
    const level = item.level?.() || 0, owned = item.owned?.() || false;
    const locked = (item.max && level >= item.max) || owned;
    const card = document.createElement('article'); card.className = `upgrade-card${locked ? ' purchased' : ''}`;
    card.innerHTML = `<span class="upgrade-icon">${item.icon}</span><h3>${item.name}</h3><p>${item.description}</p><span class="card-tag">${item.once ? (owned ? 'INSTALLED' : 'ATTACHMENT') : item.max ? `LEVEL ${level}/${item.max}` : 'SUPPORT'}</span><button type="button" ${cash < item.cost || locked ? 'disabled' : ''}>${locked ? 'OWNED' : `$${item.cost}  +`}</button>`;
    card.querySelector('button').addEventListener('click', () => {
      if (cash < item.cost || locked) return;
      cash -= item.cost; item.apply(); renderShop(); updateHud(); toast(`${item.name} // INSTALLED`);
    });
    list.append(card);
  }
}

function reload() {
  if (state !== 'playing' || reloadTimer > 0 || ammo >= magazineSize || reserve <= 0) return;
  reloadTimer = 1.05; toast('RELOADING');
}
function shoot() {
  if (state !== 'playing' || reloadTimer > 0 || performance.now() / 1000 - lastShot < fireDelay) return;
  if (ammo <= 0) { reload(); return; }
  lastShot = performance.now() / 1000; ammo--; muzzleTime = .075;
  muzzle.material.opacity = .95; muzzleLight.intensity = 5.5;
  const oldX = gunRoot.position.x, oldY = gunRoot.position.y;
  gunRoot.position.x += .018; gunRoot.position.y -= .025;
  setTimeout(() => { gunRoot.position.x = oldX; gunRoot.position.y = oldY; }, 65);
  const spread = redDot ? .0025 : .008;
  const target = new THREE.Vector2((Math.random() - .5) * spread, (Math.random() - .5) * spread);
  raycaster.setFromCamera(target, camera);
  const hits = raycaster.intersectObjects(enemyMeshes, false);
  if (hits.length) {
    const enemy = hits[0].object.userData.enemy;
    if (enemy && !enemy.userData.dead) {
      enemy.userData.hp -= damage;
      hitMarkerTime = .22; el('hit-marker').classList.remove('active'); void el('hit-marker').offsetWidth; el('hit-marker').classList.add('active');
      if (enemy.userData.hp <= 0) killEnemy(enemy);
    }
  }
  updateHud();
}
function killEnemy(enemy) {
  if (enemy.userData.dead) return;
  enemy.userData.dead = true; enemy.userData.deathTime = 0;
  cash += 25; eliminated++; kills++; reserve = Math.min(120, reserve + 2);
  updateHud();
  // Low groan is synthesized, not an external asset.
  playHitSound();
}
let audioContext;
function playHitSound() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(115, audioContext.currentTime); osc.frequency.exponentialRampToValueAtTime(42, audioContext.currentTime + .12);
    gain.gain.setValueAtTime(.055, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .12);
    osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .13);
  } catch (_) { /* Audio is optional. */ }
}
function damagePlayer(amount) {
  health -= amount; damageFlashTime = .22; el('damage-flash').classList.add('active');
  updateHud(); if (health <= 0) { health = 0; updateHud(); gameOver(); }
}

function update(dt, elapsed) {
  if (state !== 'playing') return;
  if (touchFiring) shoot();
  gameTime += dt;
  if (spawned < waveSize) {
    spawnClock -= dt;
    if (spawnClock <= 0) { spawnEnemy(); spawned++; spawnClock = Math.max(.45, 1.15 - round * .035); updateEnemyCount(); }
  }
  if (reloadTimer > 0) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) { const needed = magazineSize - ammo, moved = Math.min(needed, reserve); ammo += moved; reserve -= moved; updateHud(); }
  }
  if (damageFlashTime > 0) { damageFlashTime -= dt; if (damageFlashTime <= 0) el('damage-flash').classList.remove('active'); }
  if (muzzleTime > 0) { muzzleTime -= dt; if (muzzleTime <= 0) { muzzle.material.opacity = 0; muzzleLight.intensity = 0; } }
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(forward); if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right); if (keys.has('KeyA')) move.sub(right);
  if (touchMove.y) move.addScaledVector(forward, -touchMove.y);
  if (touchMove.x) move.addScaledVector(right, touchMove.x);
  moving = move.lengthSq() > 0;
  if (moving) {
    move.normalize().multiplyScalar((keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.7 : 4.7) * dt);
    camera.position.add(move); camera.position.x = THREE.MathUtils.clamp(camera.position.x, -23, 23); camera.position.z = THREE.MathUtils.clamp(camera.position.z, -23, 23);
  }
  camera.position.y = 1.68 + (moving ? Math.sin(elapsed * 10) * .026 : 0);
  gunRoot.position.x = .32 + (moving ? Math.sin(elapsed * 7) * .012 : 0);
  gunRoot.position.y = -.31 + (moving ? Math.abs(Math.cos(elapsed * 10)) * .012 : 0);
  let alive = 0;
  for (const enemy of enemies) {
    const data = enemy.userData;
    if (data.dead) {
      data.deathTime += dt; enemy.rotation.z = THREE.MathUtils.lerp(enemy.rotation.z, 1.25, dt * 5); enemy.position.y -= dt * .3;
      if (data.deathTime > 1.8) { world.remove(enemy); enemies.splice(enemies.indexOf(enemy), 1); }
      continue;
    }
    alive++;
    const dx = camera.position.x - enemy.position.x, dz = camera.position.z - enemy.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 1.15) {
      enemy.position.x += dx / distance * data.speed * dt;
      enemy.position.z += dz / distance * data.speed * dt;
    } else {
      data.attack -= dt;
      if (data.attack <= 0) { data.attack = 1.05; damagePlayer(7 + Math.floor(round / 3)); }
    }
    enemy.rotation.y = Math.atan2(-dx, -dz);
    const gait = elapsed * 6.2 + data.phase;
    data.legPivots[0].rotation.x = Math.sin(gait) * .48; data.legPivots[1].rotation.x = -Math.sin(gait) * .48;
    data.armPivots[0].rotation.x = -.35 + Math.sin(gait + Math.PI) * .3;
    data.armPivots[1].rotation.x = -.35 + Math.sin(gait) * .3;
    data.torso.rotation.z = Math.sin(gait * .5) * .035;
  }
  el('enemy-count').textContent = String(alive).padStart(2, '0');
  el('wave-progress').style.width = `${Math.min(100, kills / waveSize * 100)}%`;
  if (spawned >= waveSize && alive === 0) finishRound();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .04), elapsed = clock.elapsedTime;
  update(dt, elapsed);
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
});
document.addEventListener('keydown', (event) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Escape') {
    if (state === 'playing' && (isTouchDevice || document.pointerLockElement === canvas)) { state = 'paused'; syncTouchControls(); screens.pause.classList.add('visible'); }
    else if (state === 'paused') { state = 'playing'; screens.pause.classList.remove('visible'); syncTouchControls(); requestLock(); }
  }
  if (event.code === 'KeyR') reload();
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
const movePad = el('move-pad'), moveKnob = movePad.querySelector('span');
let movePointer = null, lookPointer = null, lastLookX = 0, lastLookY = 0;
function updateMovePad(event) {
  const rect = movePad.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = (event.clientX - cx) / (rect.width * .34), dy = (event.clientY - cy) / (rect.height * .34);
  const mag = Math.hypot(dx, dy); if (mag > 1) { dx /= mag; dy /= mag; }
  touchMove.x = Math.abs(dx) < .12 ? 0 : dx; touchMove.y = Math.abs(dy) < .12 ? 0 : dy;
  moveKnob.style.transform = `translate(${dx * 27}px, ${dy * 27}px)`;
}
movePad.addEventListener('pointerdown', event => { event.preventDefault(); movePointer = event.pointerId; movePad.setPointerCapture(event.pointerId); updateMovePad(event); });
movePad.addEventListener('pointermove', event => { if (event.pointerId === movePointer) updateMovePad(event); });
function releaseMove(event) { if (event.pointerId !== movePointer) return; movePointer = null; touchMove.x = touchMove.y = 0; moveKnob.style.transform = ''; }
movePad.addEventListener('pointerup', releaseMove); movePad.addEventListener('pointercancel', releaseMove);
el('fire-touch').addEventListener('pointerdown', event => { event.preventDefault(); touchFiring = true; el('fire-touch').setPointerCapture(event.pointerId); shoot(); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) el('fire-touch').addEventListener(name, () => { touchFiring = false; });
el('reload-touch').addEventListener('pointerdown', event => { event.preventDefault(); reload(); });
el('touch-look').addEventListener('pointerdown', event => { if (state !== 'playing') return; lookPointer = event.pointerId; lastLookX = event.clientX; lastLookY = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); });
el('touch-look').addEventListener('pointermove', event => {
  if (event.pointerId !== lookPointer || state !== 'playing') return;
  yaw -= (event.clientX - lastLookX) * .006; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastLookY) * .006, -1.2, 1.2);
  lastLookX = event.clientX; lastLookY = event.clientY; camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch;
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) el('touch-look').addEventListener(name, () => { lookPointer = null; });
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || state !== 'playing') return;
  yaw -= event.movementX * .0022; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .0022, -1.35, 1.35);
  camera.rotation.order = 'YXZ'; camera.rotation.y = yaw; camera.rotation.x = pitch;
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  el('lock-prompt').classList.toggle('hidden', isTouchDevice || locked || state !== 'playing');
  if (!isTouchDevice && !locked && state === 'playing') { state = 'paused'; screens.pause.classList.add('visible'); }
});
canvas.addEventListener('mousedown', (event) => {
  if (isTouchDevice || event.button !== 0) return;
  if (state === 'playing' && document.pointerLockElement === canvas) shoot();
  else if (state === 'playing') requestLock();
});
el('start-button').addEventListener('click', () => { screens.title.classList.remove('visible'); resetGame(); });
el('resume-button').addEventListener('click', () => { screens.pause.classList.remove('visible'); state = 'playing'; syncTouchControls(); requestLock(); });
el('pause-touch').addEventListener('pointerdown', event => { event.preventDefault(); if (state !== 'playing') return; state = 'paused'; syncTouchControls(); screens.pause.classList.add('visible'); });
el('next-round-button').addEventListener('click', startRound);
el('restart-button').addEventListener('click', () => { screens.gameover.classList.remove('visible'); resetGame(); });
el('crosshair').classList.toggle('precise', redDot);
