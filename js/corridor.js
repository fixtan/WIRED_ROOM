// corridor.js - Procedural crossroads corridor generator (WIRED aesthetic)
// Generates a cross-shaped corridor with portals at dead ends
// Fetches portal_list.json from GitHub for random destinations
import * as THREE from 'three';

const PORTAL_LIST_URL = 'https://raw.githubusercontent.com/fixtan/WIRED_ROOM/main/portal_list.json';

// ============================================================
// Dimensions
// ============================================================
const HUB = 8;
const CW = 4;           // corridor width
const CL = 20;          // corridor length
const CH = 4.5;         // corridor height
const WALL_T = 0.15;

const HALF_HUB = HUB / 2;
const HALF_CW = CW / 2;

// Corridor colors per direction
const DIR_COLORS = {
  north: '#00ffcc',
  east:  '#0088ff',
  west:  '#8844ff',
  south: '#ff4422',  // return
};

// ============================================================
// State
// ============================================================
let group = null;
let corridorColliders = [];
let decorations = [];
let hiddenObjects = [];
let savedColliders = null;
let savedColliderMeshes = null;
let active = false;
let stateRef = null;

export function isInCorridor() { return active; }

// ============================================================
// Textures
// ============================================================
function createGridTexture(gridSize, lineColor, bgColor, w = 512, h = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0a0a14');
  grad.addColorStop(0.5, '#06061a');
  grad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Scan lines
  ctx.strokeStyle = 'rgba(0,255,136,0.025)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 6) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }

  // Grid overlay
  ctx.strokeStyle = 'rgba(0,255,136,0.05)';
  for (let x = 0; x <= 512; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let y = 0; y <= 512; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ============================================================
// Enter corridor mode
// ============================================================
export async function enterCorridor(S) {
  if (active) return;
  stateRef = S;
  active = true;

  // Hide room
  hideRoom(S);

  // Store and replace colliders
  savedColliders = [...S.colliders];
  savedColliderMeshes = [...S.colliderMeshes];
  S.colliders = [];
  S.colliderMeshes = [];

  // Clear existing portals
  const savedPortals = [...S.portalMeshes];
  S.portalMeshes = [];

  // Build crossroads
  group = buildCrossroads();
  S.scene.add(group);

  // Apply corridor colliders
  S.colliders = corridorColliders;

  // Teleport player to hub center
  S.playerPos.set(0, 0, 2);
  S.yaw = Math.PI;  // Face north
  S.avatarYaw = 0;

  // Change background
  S.scene.background = new THREE.Color('#040410');

  // Fetch portal list and place portals
  await placePortals(S);

  console.log('[CORRIDOR] Entered crossroads');
}

// ============================================================
// Exit corridor mode
// ============================================================
export function exitCorridor(S, url) {
  if (!active) return;

  // Navigate to URL or return to room
  if (url && url !== '__return__') {
    window.location.href = url;
    return;
  }

  // Remove corridor
  if (group) {
    group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
    S.scene.remove(group);
    group = null;
  }

  // Restore colliders
  S.colliders = savedColliders || [];
  S.colliderMeshes = savedColliderMeshes || [];
  S.portalMeshes = [];
  corridorColliders = [];
  decorations = [];

  // Show room
  showRoom(S);

  // Restore background
  const skyPreset = S.roomData?.sky?.preset;
  const bgColors = { night: '#0a0a3a', sunset: '#cc4400', day: '#55aaee', wired: '#0a0a1a' };
  S.scene.background = new THREE.Color(bgColors[skyPreset] || '#1a1a2e');

  // Restore player position to spawn
  const spawn = S.roomData?.spawn || [0, 0, 3];
  S.playerPos.set(spawn[0], spawn[1], spawn[2]);

  active = false;
  console.log('[CORRIDOR] Returned to room');
}

// ============================================================
// Update (per-frame animation)
// ============================================================
export function updateCorridor(S, dt) {
  if (!active) return;

  const t = S.clock.getElapsedTime();

  for (const deco of decorations) {
    if (deco.type === 'hologram') {
      deco.mesh.rotation.y += dt * 0.5;
      deco.mesh.rotation.x = Math.sin(t * 0.3) * 0.2;
      deco.mesh.position.y = CH / 2 + Math.sin(t * 0.8) * 0.15;
    } else if (deco.type === 'ring') {
      deco.mesh.rotation.z += dt * 0.3;
    } else if (deco.type === 'ring2') {
      deco.mesh.rotation.z -= dt * 0.2;
      deco.mesh.rotation.x += dt * 0.15;
    } else if (deco.type === 'strip') {
      deco.mesh.material.opacity = 0.3 + 0.3 * Math.sin(t * 2 + deco.phase);
    } else if (deco.type === 'portalRing') {
      deco.progress += dt * 0.45;
      if (deco.progress > 1.0) deco.progress = 0.0;
      const s = deco.progress * 1.0;
      deco.mesh.scale.set(s, s, 1);
      deco.mesh.material.opacity = (1.0 - deco.progress) * 0.7;
    } else if (deco.type === 'particle') {
      const p = deco.data;
      p.age += dt;
      p.y += p.speedY * dt;
      if (p.age > p.maxAge || p.y > 2.0) {
        p.x = (Math.random() - 0.5) * 1.5;
        p.y = 0;
        p.z = (Math.random() - 0.5) * 1.5;
        p.age = 0;
      }
      deco.attr.setXYZ(deco.index, p.x, p.y, p.z);
      deco.attr.needsUpdate = true;
    }
  }
}

// ============================================================
// Build crossroads geometry
// ============================================================
function buildCrossroads() {
  const g = new THREE.Group();
  corridorColliders = [];
  decorations = [];

  // Materials
  const floorTex = createGridTexture(32, 'rgba(0,255,136,0.12)', '#080810');
  floorTex.repeat.set(6, 6);
  const wallTex = createWallTexture();
  wallTex.repeat.set(3, 1);
  const ceilTex = createGridTexture(64, 'rgba(0,80,255,0.06)', '#050510');
  ceilTex.repeat.set(6, 6);

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7, metalness: 0.3 });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.6, metalness: 0.15 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.9 });

  // ── Hub ──
  addFloor(g, floorMat, 0, 0, HUB, HUB);
  addCeiling(g, ceilMat, 0, 0, HUB, HUB);

  // ── Four arms ──
  const dirs = ['north', 'south', 'east', 'west'];
  for (const dir of dirs) {
    buildArm(g, dir, floorMat, wallMat, ceilMat);
  }

  // ── Hub walls (between openings) ──
  buildHubWalls(g, wallMat);

  // ── Decorations ──
  addCentralHologram(g);
  addGlowStrips(g);
  addLighting(g);

  return g;
}

// ============================================================
// Arm builder
// ============================================================
function buildArm(g, dir, floorMat, wallMat, ceilMat) {
  const end = HALF_HUB + CL;
  const mid = HALF_HUB + CL / 2;

  if (dir === 'north') {
    addFloor(g, floorMat, 0, -mid, CW, CL);
    addCeiling(g, ceilMat, 0, -mid, CW, CL);
    addWallBox(g, wallMat, -HALF_CW, -mid, WALL_T, CH, CL);  // left
    addWallBox(g, wallMat, HALF_CW, -mid, WALL_T, CH, CL);   // right
    addWallBox(g, wallMat, 0, -end, CW + WALL_T, CH, WALL_T); // end
  } else if (dir === 'south') {
    addFloor(g, floorMat, 0, mid, CW, CL);
    addCeiling(g, ceilMat, 0, mid, CW, CL);
    addWallBox(g, wallMat, -HALF_CW, mid, WALL_T, CH, CL);
    addWallBox(g, wallMat, HALF_CW, mid, WALL_T, CH, CL);
    addWallBox(g, wallMat, 0, end, CW + WALL_T, CH, WALL_T);
  } else if (dir === 'east') {
    addFloor(g, floorMat, mid, 0, CL, CW);
    addCeiling(g, ceilMat, mid, 0, CL, CW);
    addWallBox(g, wallMat, mid, -HALF_CW, CL, CH, WALL_T);  // top
    addWallBox(g, wallMat, mid, HALF_CW, CL, CH, WALL_T);   // bottom
    addWallBox(g, wallMat, end, 0, WALL_T, CH, CW + WALL_T);
  } else if (dir === 'west') {
    addFloor(g, floorMat, -mid, 0, CL, CW);
    addCeiling(g, ceilMat, -mid, 0, CL, CW);
    addWallBox(g, wallMat, -mid, -HALF_CW, CL, CH, WALL_T);
    addWallBox(g, wallMat, -mid, HALF_CW, CL, CH, WALL_T);
    addWallBox(g, wallMat, -end, 0, WALL_T, CH, CW + WALL_T);
  }
}

// ============================================================
// Hub walls (with corridor openings)
// ============================================================
function buildHubWalls(g, wallMat) {
  const seg = (HUB - CW) / 2; // segment length on each side of opening

  // North face (z = -HALF_HUB)
  addWallBox(g, wallMat, -(HALF_HUB + HALF_CW) / 2, -HALF_HUB, seg, CH, WALL_T);
  addWallBox(g, wallMat, (HALF_HUB + HALF_CW) / 2, -HALF_HUB, seg, CH, WALL_T);
  // South face
  addWallBox(g, wallMat, -(HALF_HUB + HALF_CW) / 2, HALF_HUB, seg, CH, WALL_T);
  addWallBox(g, wallMat, (HALF_HUB + HALF_CW) / 2, HALF_HUB, seg, CH, WALL_T);
  // East face (x = +HALF_HUB)
  addWallBox(g, wallMat, HALF_HUB, -(HALF_HUB + HALF_CW) / 2, WALL_T, CH, seg);
  addWallBox(g, wallMat, HALF_HUB, (HALF_HUB + HALF_CW) / 2, WALL_T, CH, seg);
  // West face
  addWallBox(g, wallMat, -HALF_HUB, -(HALF_HUB + HALF_CW) / 2, WALL_T, CH, seg);
  addWallBox(g, wallMat, -HALF_HUB, (HALF_HUB + HALF_CW) / 2, WALL_T, CH, seg);
}

// ============================================================
// Geometry helpers
// ============================================================
function addFloor(g, mat, cx, cz, w, d) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  g.add(mesh);
}

function addCeiling(g, mat, cx, cz, w, d) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(cx, CH, cz);
  g.add(mesh);
}

function addWallBox(g, mat, cx, cz, sx, sy, sz) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, sy / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  corridorColliders.push(new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(cx, sy / 2, cz),
    new THREE.Vector3(sx, sy, sz)
  ));
}

// ============================================================
// Central holographic structure
// ============================================================
function addCentralHologram(g) {
  // Wireframe icosahedron
  const icoGeo = new THREE.IcosahedronGeometry(0.9, 1);
  const icoMat = new THREE.MeshBasicMaterial({
    color: '#00ff88', wireframe: true, transparent: true, opacity: 0.5,
  });
  const ico = new THREE.Mesh(icoGeo, icoMat);
  ico.position.set(0, CH / 2, 0);
  g.add(ico);
  decorations.push({ mesh: ico, type: 'hologram' });

  // Orbital rings
  const ringGeo = new THREE.TorusGeometry(1.4, 0.015, 8, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#00ffaa', transparent: true, opacity: 0.35,
  });

  const ring1 = new THREE.Mesh(ringGeo, ringMat);
  ring1.position.set(0, CH / 2, 0);
  ring1.rotation.x = Math.PI / 2;
  g.add(ring1);
  decorations.push({ mesh: ring1, type: 'ring' });

  const ring2 = new THREE.Mesh(ringGeo.clone(), ringMat.clone());
  ring2.position.set(0, CH / 2, 0);
  ring2.rotation.set(Math.PI / 3, Math.PI / 5, 0);
  g.add(ring2);
  decorations.push({ mesh: ring2, type: 'ring2' });

  // Glow sphere (inner)
  const glowGeo = new THREE.SphereGeometry(0.3, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: '#00ff88', transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, CH / 2, 0);
  g.add(glow);
}

// ============================================================
// Glow strips along corridor edges
// ============================================================
function addGlowStrips(g) {
  const stripH = 0.04;
  let phase = 0;

  const makeStrip = (pos, sx, sz, color) => {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, stripH, sz), mat);
    mesh.position.set(...pos);
    g.add(mesh);
    decorations.push({ mesh, type: 'strip', phase: phase++ * 0.7 });
  };

  const arms = [
    { dir: 'north', color: DIR_COLORS.north },
    { dir: 'south', color: DIR_COLORS.south },
    { dir: 'east',  color: DIR_COLORS.east },
    { dir: 'west',  color: DIR_COLORS.west },
  ];

  for (const arm of arms) {
    const mid = HALF_HUB + CL / 2;
    const c = arm.color;

    if (arm.dir === 'north') {
      makeStrip([-HALF_CW, 0.02, -mid], 0.06, CL, c);  // floor left
      makeStrip([HALF_CW, 0.02, -mid], 0.06, CL, c);   // floor right
      makeStrip([-HALF_CW, CH - 0.02, -mid], 0.06, CL, c);
      makeStrip([HALF_CW, CH - 0.02, -mid], 0.06, CL, c);
    } else if (arm.dir === 'south') {
      makeStrip([-HALF_CW, 0.02, mid], 0.06, CL, c);
      makeStrip([HALF_CW, 0.02, mid], 0.06, CL, c);
      makeStrip([-HALF_CW, CH - 0.02, mid], 0.06, CL, c);
      makeStrip([HALF_CW, CH - 0.02, mid], 0.06, CL, c);
    } else if (arm.dir === 'east') {
      makeStrip([mid, 0.02, -HALF_CW], CL, 0.06, c);
      makeStrip([mid, 0.02, HALF_CW], CL, 0.06, c);
      makeStrip([mid, CH - 0.02, -HALF_CW], CL, 0.06, c);
      makeStrip([mid, CH - 0.02, HALF_CW], CL, 0.06, c);
    } else if (arm.dir === 'west') {
      makeStrip([-mid, 0.02, -HALF_CW], CL, 0.06, c);
      makeStrip([-mid, 0.02, HALF_CW], CL, 0.06, c);
      makeStrip([-mid, CH - 0.02, -HALF_CW], CL, 0.06, c);
      makeStrip([-mid, CH - 0.02, HALF_CW], CL, 0.06, c);
    }
  }
}

// ============================================================
// Lighting
// ============================================================
function addLighting(g) {
  // Hub center light
  const center = new THREE.PointLight(0x00ff88, 8.0, 30);
  center.position.set(0, CH - 0.3, 0);
  g.add(center);

  // Corridor mid-point lights
  const halfDist = HALF_HUB + CL / 2;
  const midLights = [
    [0, CH - 0.3, -halfDist],
    [0, CH - 0.3, halfDist],
    [halfDist, CH - 0.3, 0],
    [-halfDist, CH - 0.3, 0],
  ];
  for (const p of midLights) {
    const light = new THREE.PointLight(0x00ff88, 4.0, 20);
    light.position.set(...p);
    g.add(light);
  }

  // Arm end lights (colored per direction)
  const endDist = HALF_HUB + CL - 3;
  const armLights = [
    { pos: [0, CH - 0.3, -endDist], color: DIR_COLORS.north },
    { pos: [0, CH - 0.3, endDist],  color: DIR_COLORS.south },
    { pos: [endDist, CH - 0.3, 0],  color: DIR_COLORS.east },
    { pos: [-endDist, CH - 0.3, 0], color: DIR_COLORS.west },
  ];
  for (const al of armLights) {
    const light = new THREE.PointLight(new THREE.Color(al.color), 5.0, 15);
    light.position.set(...al.pos);
    g.add(light);
  }

  // Ambient
  g.add(new THREE.AmbientLight(0x112233, 0.8));
}

// ============================================================
// Portal placement (fetch + display)
// ============================================================
async function placePortals(S) {
  // Fetch portal list
  let portalList = [];
  try {
    const res = await fetch(PORTAL_LIST_URL);
    if (res.ok) portalList = await res.json();
  } catch (e) {
    console.warn('[CORRIDOR] Failed to fetch portal list:', e);
  }

  // Filter out self (current domain)
  const selfUrl = window.location.origin;
  portalList = portalList.filter(p => !p.url.startsWith(selfUrl));

  // Shuffle and pick up to 3
  const shuffled = portalList.sort(() => Math.random() - 0.5).slice(0, 3);

  // Dead end positions: north, east, west get random portals; south = return
  const endDist = HALF_HUB + CL - 2;
  const slots = [
    { pos: [0, 0.02, -endDist], dir: 'north', color: DIR_COLORS.north },
    { pos: [endDist, 0.02, 0],  dir: 'east',  color: DIR_COLORS.east },
    { pos: [-endDist, 0.02, 0], dir: 'west',  color: DIR_COLORS.west },
  ];

  // Place random portals
  for (let i = 0; i < slots.length; i++) {
    if (i < shuffled.length) {
      const portal = shuffled[i];
      createPortalPoint(S, slots[i].pos, portal.name, portal.url, portal.description || '', slots[i].color);
    }
  }

  // Return portal (south)
  createPortalPoint(S, [0, 0.02, endDist], '← RETURN', '__return__', 'Back to your room', DIR_COLORS.south);
}

function createPortalPoint(S, pos, label, url, description, color) {
  const portalGroup = new THREE.Group();
  portalGroup.position.set(pos[0], pos[1], pos[2]);

  // WavyRing effect (3 expanding rings)
  const ringGeo = new THREE.RingGeometry(0.96, 1.0, 48);
  const offsets = [0.0, 0.33, 0.66];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(0.01, 0.01, 1);
    portalGroup.add(ring);
    decorations.push({ mesh: ring, type: 'portalRing', progress: offsets[i] });
  }

  // Particles
  const pCount = 12;
  const positions = new Float32Array(pCount * 3);
  const particles = [];
  for (let i = 0; i < pCount; i++) {
    const p = {
      x: (Math.random() - 0.5) * 1.5,
      y: Math.random() * 2.0,
      z: (Math.random() - 0.5) * 1.5,
      speedY: 0.15 + Math.random() * 0.25,
      age: Math.random() * 2, maxAge: 2 + Math.random() * 2,
    };
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    particles.push(p);
  }
  const pGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  pGeo.setAttribute('position', posAttr);
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color, size: 0.06, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  portalGroup.add(points);

  for (let i = 0; i < particles.length; i++) {
    decorations.push({ type: 'particle', data: particles[i], attr: posAttr, index: i });
  }

  // Label sprite
  const labelSprite = createLabelSprite(label, description, color);
  labelSprite.position.set(0, 2.5, 0);
  labelSprite.scale.set(3, 1.0, 1);
  portalGroup.add(labelSprite);

  // Set portal data for E-key interaction
  portalGroup.userData = { url, label };
  S.portalMeshes.push(portalGroup);

  group.add(portalGroup);
}

function createLabelSprite(label, description, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 512, 160);

  // Border
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 508, 156);

  // Label
  ctx.fillStyle = color;
  ctx.font = 'bold 32px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(label, 256, 60);

  // Description
  if (description) {
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '20px Courier New';
    ctx.fillText(description, 256, 110);
  }

  // Press E
  ctx.fillStyle = '#666666';
  ctx.font = '16px Courier New';
  ctx.fillText('[E] ENTER', 256, 145);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  return new THREE.Sprite(mat);
}

// ============================================================
// Room hide/show
// ============================================================
function hideRoom(S) {
  hiddenObjects = [];
  for (const child of S.scene.children) {
    if (child.visible) {
      hiddenObjects.push(child);
      child.visible = false;
    }
  }
}

function showRoom(S) {
  for (const obj of hiddenObjects) {
    obj.visible = true;
  }
  hiddenObjects = [];
}
