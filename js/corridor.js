// corridor.js - Portal Plaza generator
// Replaces the old corridor with an open plaza using Kenney grass block GLB
// Portals arranged in a row, with return portal behind player
import * as THREE from 'three';
import { loadGLB } from './room-loader.js';
import { createPortalEffect } from './portal-effect.js';
import { createSkybox } from './room-loader.js';

const PORTAL_LIST_URL = 'https://raw.githubusercontent.com/fixtan/WIRED_ROOM/main/portal_list.json';
const GRASS_GLB_PATH = './assets/models/block-grass-overhang-low-long.glb';
const MAX_PORTALS = 6;
const PORTAL_SPACING = 3.5;  // distance between portals
const PORTAL_ROW_Z = -6;     // Z position of portal row (in front of player)
const RETURN_Z = 4;           // Z position of return portal (behind player)

let cachedPortalList = null;

// ============================================================
// State
// ============================================================
let group = null;
let decorations = [];
let hiddenObjects = [];
let savedColliders = null;
let savedColliderMeshes = null;
let savedSkyMesh = null;
let savedCloudMesh = null;
let savedBackground = null;
let active = false;
let stateRef = null;
let savedPortalMeshes = null;// portals
let currentPortalType = 'global';

export function isInCorridor() { return active; }

// ============================================================
// Prefetch portal list (call before XR session)
// ============================================================
export async function prefetchPortalList() {
  // 1. GitHub
  try {
    const res = await fetch(PORTAL_LIST_URL);
    if (res.ok) {
      cachedPortalList = await res.json();
      console.log('[PLAZA] Prefetched from GitHub:', cachedPortalList.length);
      return;
    }
  } catch (e) {
    console.warn('[PLAZA] GitHub fetch failed:', e);
  }

  // 2. Local fallback
  try {
    const res = await fetch('./portal_list.json');
    if (res.ok) {
      cachedPortalList = await res.json();
      console.log('[PLAZA] Loaded from local:', cachedPortalList.length);
    }
  } catch (e) {
    console.warn('[PLAZA] Local fetch also failed:', e);
  }
}

// ============================================================
// Enter plaza mode
// ============================================================
export async function enterCorridor(S, portalType = 'global') {
  console.log('[PLAZA] enterCorridor called, portalType:', portalType);
  if (active) return;
  stateRef = S;
  active = true;
  currentPortalType = portalType;

  // Hide room
  hideRoom(S);

  // Store and replace colliders
  savedColliders = [...S.colliders];
  savedColliderMeshes = [...S.colliderMeshes];
  S.colliders = [];
  S.colliderMeshes = [];

  // Save skybox state
  savedSkyMesh = S.skyMesh;
  savedCloudMesh = S.cloudMesh;
  savedBackground = S.scene.background?.clone();
  if (S.skyMesh) S.skyMesh.visible = false;
  if (S.cloudMesh) S.cloudMesh.visible = false;

  // Clear existing portals
  savedPortalMeshes = [...S.portalMeshes];
  S.portalMeshes = [];

  // Build plaza
  group = new THREE.Group();
  S.scene.add(group);

  await buildPlaza(S);

  // Set sky
  createSkybox(S, { preset: 'day' });

  // Hide room skybox
  if (S.skyMesh) S.skyMesh.visible = false;
  if (S.cloudMesh) S.cloudMesh.visible = false;

  // Teleport player
  S.playerPos.set(0, 0.5, 2);
  S.yaw = Math.PI;  // Face forward (toward portals)
  S.avatarYaw = 0;

  // Fetch portal list and place portals
  await placePortals(S, portalType);

  console.log('[PLAZA] Entered plaza');
}

// ============================================================
// Exit plaza mode
// ============================================================
export async function exitCorridor(S, url) {
  if (!active) return;

  // Navigate to URL or return to room
  if (url && url !== '__return__') {
    const { isVRActive } = await import('./vr.js');
    if (isVRActive()) {
      const { loadExternalRoom } = await import('../app.js');
      cleanupPlaza(S);
      // await loadExternalRoom(S, url);
      await loadExternalRoom(S, url, currentPortalType); // portal識別
     } else {
      console.log('FADE: exitCorridor PC path', url);
      const fade = document.getElementById('scene-fade');
      fade.style.transition = 'none';
      fade.style.opacity = '0';
      fade.style.display = 'block';
      // Force to opacity 1 with transition
      requestAnimationFrame(() => {
        fade.style.transition = 'opacity 0.5s ease';
        fade.style.opacity = '1';
        fade.addEventListener('transitionend', () => {
          window.location.href = url + (url.includes('?') ? '&' : '?') + 'from=' + currentPortalType;// portal識別
        }, { once: true });
      });
      return; // prevent falling through
    }
    return;
  }

  // Return to room
  cleanupPlaza(S);
  showRoom(S);

  // Restore skybox
  if (savedSkyMesh) savedSkyMesh.visible = true;
  if (savedCloudMesh) savedCloudMesh.visible = true;
  if (savedBackground) S.scene.background = savedBackground;

  // Restore player position — return to the portal they entered from
  let spawned = false;
  if (currentPortalType && currentPortalType !== 'global') {
    const targetPortal = S.portalMeshes.find(
      pm => pm.userData.portalType === currentPortalType
    );
    if (targetPortal) {
      S.playerPos.set(
        targetPortal.position.x,
        targetPortal.position.y + 0.5,
        targetPortal.position.z
      );
      spawned = true;
      console.log(`[PLAZA] Returned to ${currentPortalType} portal:`, targetPortal.position);
    }
  }
  if (!spawned) {
    const spawn = S.roomData?.spawn || [0, 0, 3];
    S.playerPos.set(spawn[0], spawn[1], spawn[2]);
  }

  console.log('[PLAZA] Returned to room');
}

function cleanupPlaza(S) {
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

  S.colliders = savedColliders || [];
  S.colliderMeshes = savedColliderMeshes || [];
  //S.portalMeshes = [];
   S.portalMeshes = savedPortalMeshes || [];
  savedPortalMeshes = null;

  decorations = [];
  active = false;
}

export function forceShowRoom(S) {
  showRoom(S);
}

// ============================================================
// Update (per-frame animation)
// ============================================================
export function updateCorridor(S, dt) {
  if (!active) return;

  const t = S.clock.getElapsedTime();

  for (const deco of decorations) {
    if (deco.type === 'portalRing') {
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
// Build plaza geometry
// ============================================================
async function buildPlaza(S) {
  decorations = [];


  const skyGeo = new THREE.SphereGeometry(180, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({ color: '#55aaee', side: THREE.BackSide });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);

  // ── Load grass GLB as ground ──
  try {
    const gltf = await loadGLB(GRASS_GLB_PATH);
    const ground = gltf.scene;
    // Scale up to create a flat plaza surface
    ground.scale.set(12, 1, 12);
    ground.position.set(0, 0, -1);
    ground.traverse((child) => {
      if (child.isMesh) {
        child.receiveShadow = true;
      }
    });
    group.add(ground);

    // BVH collision for ground
    ground.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundsTree();
        S.colliderMeshes.push(child);
      }
    });

  } catch (e) {
    console.warn('[PLAZA] Failed to load grass GLB, using fallback plane');
    // Fallback: simple green plane
    const fallbackGeo = new THREE.PlaneGeometry(30, 20);
    const fallbackMat = new THREE.MeshStandardMaterial({
      color: '#4a8c3f', roughness: 0.9, metalness: 0.0,
    });
    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
    fallbackMesh.rotation.x = -Math.PI / 2;
    fallbackMesh.position.set(0, 0, -2);
    fallbackMesh.receiveShadow = true;
    group.add(fallbackMesh);
  }

  // ── Lighting ──
  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  group.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xffeedd, 2.0);
  sunLight.position.set(5, 10, 3);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  group.add(sunLight);

  const hemiLight = new THREE.HemisphereLight(0x88bbff, 0x445522, 0.6);
  group.add(hemiLight);


  // ── Preload door GLB ──
  try {
    const doorGltf = await loadGLB('./assets/models/door-rotate.glb');
    S._doorTemplate = doorGltf.scene;
    console.log('[PLAZA] Door model loaded');
  } catch (e) {
    console.warn('[PLAZA] Door model not found');
    S._doorTemplate = null;
  }



  // ── Decorations ──
  const decoItems = [
    { path: './assets/models/barrel.glb',       pos: [7.2, 0.5, 1.48], scale: 1.8 },
    { path: './assets/models/flowers-tall.glb', pos: [6.2, 0.5, 1.79], scale: 1.0 },
    { path: './assets/models/flowers.glb',      pos: [6.68, 0.5, 1.02], scale: 0.8 },
  ];
  for (const deco of decoItems) {
    try {
      const gltf = await loadGLB(deco.path);
      const model = gltf.scene;
      model.scale.setScalar(deco.scale);
      model.position.set(...deco.pos);
      group.add(model);
    } catch (e) {}
  }


  // ── Billboard (大型掲示板) ──
  const bbW = 5.5; // 幅
  const bbH = 3; // 高さ
  const frameT = 0.08;  // frame thickness
  const frameD = 0.05;  // frame depth
  const frameMat = new THREE.MeshStandardMaterial({ color: '#8B7355', roughness: 0.6 });

  // Board content
    const bbCanvas = document.createElement('canvas');
  bbCanvas.width = 1024;
  bbCanvas.height = 768;
  const bbCtx = bbCanvas.getContext('2d');

  // 背景
  bbCtx.fillStyle = 'rgba(10,10,10,0.9)';
  bbCtx.fillRect(0, 0, 1024, 768);
  bbCtx.strokeStyle = '#00ff88';
  bbCtx.lineWidth = 3;
  bbCtx.strokeRect(4, 4, 1016, 760);

  // タイトル
  bbCtx.fillStyle = '#00ffaa';
  bbCtx.font = 'bold 36px Courier New';
  bbCtx.textAlign = 'center';
  bbCtx.fillText('── けいじばん ──', 512, 70);

  // ポータルリスト
  const list = cachedPortalList || [];
  bbCtx.textAlign = 'left';
  bbCtx.font = '22px Courier New';
  let y = 120;
  /*
  for (const entry of list) {
    bbCtx.fillStyle = '#00ff88';
    bbCtx.fillText(`■ ${entry.name}`, 40, y);
    bbCtx.fillStyle = '#888888';
    bbCtx.font = '18px Courier New';
    bbCtx.fillText(entry.description || entry.url, 60, y + 28);
    if (entry.message) {
      bbCtx.fillStyle = '#aaaaaa';
      bbCtx.fillText(entry.message, 60, y + 52);
      y += 80;
    } else {
      y += 60;
    }
    bbCtx.font = '22px Courier New';
  }
  */

  const bbGeo = new THREE.PlaneGeometry(bbW, bbH);
  const bbMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(bbCanvas),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const bbGroup = new THREE.Group();

  // Board
  const bbMesh = new THREE.Mesh(bbGeo, bbMat);
  bbGroup.add(bbMesh);

  // Frame (top, bottom, left, right)
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(bbW + frameT*2, frameT, frameD), frameMat);
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(frameT, bbH, frameD), frameMat);
  hBar.clone().position.set(0, bbH/2, 0); // top
  bbGroup.add(hBar.clone().translateY(bbH/2));
  bbGroup.add(hBar.clone().translateY(-bbH/2));
  bbGroup.add(vBar.clone().translateX(-bbW/2));
  bbGroup.add(vBar.clone().translateX(bbW/2));

  // Legs
  const legH = 0.8;// leg height
  const legMat = new THREE.MeshStandardMaterial({ color: '#666666', roughness: 0.5 });
  const legGeo = new THREE.BoxGeometry(0.12, legH, 0.12);
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-bbW/2 + 0.3, -bbH/2 - legH/2, 0);
  bbGroup.add(legL);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(bbW/2 - 0.3, -bbH/2 - legH/2, 0);
  bbGroup.add(legR);

  // Position (正面向き)
  bbGroup.position.set(8, 2.8, -1); // ポジション
  bbGroup.rotation.y = -Math.PI / 2;  // プレイヤーの方を向く
  group.add(bbGroup);
}

// ============================================================
// Portal placement
// ============================================================
async function placePortals(S, portalType = 'global') {

  console.log('[PLAZA] placePortals called, portalType:', portalType);
  let portalList = [];

  if (portalType === 'friend' || portalType === 'works') {
    const jsonFile = portalType === 'friend'
      ? './public/portal_list_private.json'
      : './public/portal_list_works.json';
    const storageKey = portalType === 'friend'
      ? 'friend_portal_list'
      : 'works_portal_list';

    // Try public file first (public mode)
    try {
      const res = await fetch(jsonFile);
      if (res.ok) {
        portalList = await res.json();
      }
    } catch (e) { /* ignore */ }
    // Fallback: build from localStorage (edit mode)
    if (portalList.length === 0) {
      try {
        portalList = JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch (e) { /* ignore */ }
    }
    // Filter out empty URLs
    portalList = portalList.filter(p => p.url);
    console.log(`[PLAZA] ${portalType} portals loaded:`, portalList.length);

  } else {
    // Global portals from GitHub
    portalList = cachedPortalList || [];
    if (portalList.length === 0) {
      try {
        const res = await fetch(PORTAL_LIST_URL);
        if (res.ok) portalList = await res.json();
      } catch (e) {
        console.warn('[PLAZA] Failed to fetch portal list:', e);
      }
    }
  }

  // Filter out self
  const selfUrl = window.location.href.replace(/\/?$/, '/');
  portalList = portalList.filter(p => p.url.replace(/\/?$/, '/') !== selfUrl);

  // Shuffle and pick
  const shuffled = portalList.sort(() => Math.random() - 0.5).slice(0, MAX_PORTALS);
  const colorMap = { global: '#00ff88', friend: '#4488ff', works: '#ffaa00' };
  const color = colorMap[portalType] || '#00ff88';

  const totalWidth = (shuffled.length - 1) * PORTAL_SPACING;
  const startX = -totalWidth / 2;

  for (let i = 0; i < shuffled.length; i++) {
    const portal = shuffled[i];
    const x = startX + i * PORTAL_SPACING;
    createPortalPoint(S, [x, 0.5, PORTAL_ROW_Z], portal.name, portal.url, portal.description || '', color, false, portal.image || '');
  }

  // Return portal
  createPortalPoint(S, [0, 0.5, RETURN_Z], '← RETURN', '__return__', 'Back to your room', '#ff4422', true);
}

// ============================================================
// Create individual portal point with effect + label
// ============================================================
function createPortalPoint(S, pos, label, url, description, color, isReturn, imageUrl) {
  const portalGroup = new THREE.Group();
  portalGroup.position.set(pos[0], pos[1], pos[2]);

  // WavyRing effect
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

  // Label sprite (text fallback, replaced by banner if imageUrl exists)
  const labelSprite = createLabelSprite(label, description, color);
  labelSprite.position.set(0, 2.5, 0);
  labelSprite.scale.set(3, 1.0, 1);
  portalGroup.add(labelSprite);

  // Banner image (async load, replaces text label on success)
  if (imageUrl && !isReturn) {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(imageUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height; // e.g. 480/120 = 4
      const bannerMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const bannerSprite = new THREE.Sprite(bannerMat);
      bannerSprite.position.copy(labelSprite.position);
      bannerSprite.scale.set(3, 3 / aspect, 1);
      portalGroup.remove(labelSprite);
      labelSprite.material.map.dispose();
      labelSprite.material.dispose();
      portalGroup.add(bannerSprite);
    }, undefined, (err) => {
      console.warn('[PLAZA] Banner load failed, keeping text label:', imageUrl, err);
    });
  }

  // Set portal data for E-key interaction
  portalGroup.userData = { url, label };
  S.portalMeshes.push(portalGroup);

  // Door model
  if (stateRef?._doorTemplate) {
    const door = stateRef._doorTemplate.clone();
    door.scale.set(2.0, 2.0, 1.0);
    door.position.set(0, 0, isReturn ? 0.5 : -0.5);
    door.rotation.y = isReturn ? 0 : Math.PI;
    portalGroup.add(door);
  }

  group.add(portalGroup);
}

// ============================================================
// Label sprite
// ============================================================
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
    if (child.visible && child !== S.avatarGroup) {
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
