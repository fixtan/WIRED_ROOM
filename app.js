// app.js - Entry point, shared state, init, render loop
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { loadRoomGLB, loadObjectGLB, placeObject, buildRoom, createSkybox, createPortal, updateSkybox } from './js/room-loader.js';
import { loadPlayerAvatar, updateAvatar, disposeAvatar } from './js/avatar.js';
import { setupControls, update } from './js/controls.js';
import { loadConfig, showSetupWizard, buildRoomDataFromConfig } from './js/setup.js';
import { setupMenu } from './js/menu.js';
import { setupVR, updateVR, isVRActive } from './js/vr.js';
import { initVRHint, disposeVRHint } from './js/vr-ui.js';
import { setupEditor } from './js/editor.js';
import { setupMedia } from './js/media.js';
import { updateCorridor , prefetchPortalList } from './js/corridor.js';
import { createPortalEffect, updatePortalAnimations, clearAllPortalAnimations } from './js/portal-effect.js';
import { initPortalEditor } from './js/portal-editor.js';
import { PORTAL_COLORS } from './config.js';

// Patch Three.js for BVH accelerated raycasting
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ============================================================
// Shared State (passed to all modules)
// ============================================================
export const STATE = {
  // Config
  MOVE_SPEED: 2.5,
  MOUSE_SENSITIVITY: 0.002,
  PLAYER_HEIGHT: 1.6,
  PLAYER_RADIUS: 0.3,
  GRAVITY: 15.0,
  PORTAL_TRIGGER_DIST: 1.5,
  CAM_DISTANCE: 3.0,
  CAM_HEIGHT: 2.0,
  CAM_LERP: 0.1,

  // Three.js core
  camera: null,
  scene: null,
  renderer: null,

  // Player
  yaw: 0,
  pitch: 0,
  velocity: new THREE.Vector3(),
  onGround: true,
  isLocked: false,
  playerPos: new THREE.Vector3(),
  avatarYaw: 0,
  keys: {},

  // Room data
  roomData: null,

  // Collision
  colliders: [],
  colliderMeshes: [],
  portalMeshes: [],

  // Room objects (tracked for dispose)
  _roomObjects: [],

  // Clock
  clock: new THREE.Clock(),

  // Mode
  isPublicMode: false,
};

// ============================================================
// Default room definition
// ============================================================
const DEFAULT_ROOM = {
  name: "Default Room",
  spawn: [0, 0, 0],
  room: {
    width: 10, depth: 10, height: 3,
    floorColor: "#2a2a2a", wallColor: "#1a1a2e", ceilingColor: "#111122"
  },
  objects: [
    { type: "box", size: [1.2, 0.7, 0.6], pos: [3, 0.35, -3], color: "#3a2a1a", name: "desk" },
    { type: "box", size: [0.5, 0.9, 0.5], pos: [3, 0.45, -2], color: "#2a1a0a", name: "chair" },
    { type: "box", size: [1.5, 0.4, 0.4], pos: [-4, 0.2, -4], color: "#1a2a1a", name: "shelf" },
    { type: "box", size: [0.3, 1.8, 0.3], pos: [-4, 0.9, 3], color: "#4a3a1a", name: "lamp" },
    { type: "sphere", radius: 0.15, pos: [-4, 1.95, 3], color: "#ffeeaa", emissive: "#ffeeaa", name: "lampLight" },
  ],
  portals: []
};

// ============================================================
// Build roomData from public/manifest.json
// ============================================================
export function buildRoomDataFromManifest(manifest, prefix) {
  const P = prefix || './public/';
  return {
    name: manifest.name || 'Room',
    spawn: manifest.spawn || [0, 0, 3],
    room: {
      glb: P + (manifest.room?.glb || 'room.glb'),
      scale: manifest.room?.scale || 1,
      pos: manifest.room?.pos || [0, 0, 0],
      rot: manifest.room?.rot || [0, 0, 0],
      collision: true,
    },
    avatar: {
      vrm: manifest.avatar?.vrm ? P + manifest.avatar.vrm : './assets/avatar/avater1.vrm',
      scale: 1,
      mode: '3rd',
      animations: {
        idle: P + (manifest.avatar?.animations?.idle || 'idle.vrma'),
        walk: P + (manifest.avatar?.animations?.walk || 'walk.vrma'),
      },
    },
    sky: manifest.sky || { preset: 'night' },
    media: (manifest.media || []).map(m => ({
      ...m,
      file: m.file ? P + m.file : undefined,
      vrm: m.vrm ? P + m.vrm : undefined,
      pose: m.pose ? P + m.pose : undefined,
    })),
    objects: manifest.objects || [],
    portals: manifest.portals || [],
  };
}

// ============================================================
// Progress bar helpers
// ============================================================
let _stageBase = 0;
let _stageRange = 0;
const _loadingEls = {};

function initProgressBar() {
  _loadingEls.section = document.getElementById('loading-section');
  _loadingEls.status = document.getElementById('loading-status');
  _loadingEls.bar = document.getElementById('loading-bar-inner');
  _loadingEls.percent = document.getElementById('loading-percent');
  _loadingEls.clickToEnter = document.getElementById('click-to-enter');
}

function showProgressBar() {
  _loadingEls.section.style.display = 'block';
  _loadingEls.clickToEnter.style.display = 'none';
}

function hideProgressBar() {
  updateBar(100);
  _loadingEls.status.textContent = 'Ready';
  setTimeout(() => {
    _loadingEls.section.style.display = 'none';
    _loadingEls.clickToEnter.style.display = 'block';
  }, 400);
}

function setStage(base, range, label) {
  _stageBase = base;
  _stageRange = range;
  _loadingEls.status.textContent = label;
  updateBar(base);
}

function updateBar(percent) {
  const p = Math.min(Math.round(percent), 100);
  _loadingEls.bar.style.width = p + '%';
  _loadingEls.percent.textContent = p + '%';
}

function onProgressCallback(event) {
  if (event.total > 0) {
    const ratio = event.loaded / event.total;
    updateBar(_stageBase + _stageRange * ratio);
  }
}

// ============================================================
// Dispose current room content
// ============================================================
export function disposeRoom(S) {
  // Dispose tracked room objects
  for (const obj of S._roomObjects) {
    if (obj.parent) obj.parent.remove(obj);
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }
  S._roomObjects = [];

  // Clear colliders
  S.colliders = [];
  S.colliderMeshes = [];
  S.portalMeshes = [];

  // Dispose VR hint UI
  disposeVRHint();

  // Clear portal animations
  clearAllPortalAnimations();

  // Clear skybox references
  S.skyMesh = null;
  S.cloudMesh = null;
  S.roomModel = null;

  console.log('[ROOM] Disposed current room');
}

// ============================================================
// Load room content (reusable — called from init and loadExternalRoom)
// ============================================================
export async function loadRoom(S, roomData, showProgress) {
  S.roomData = roomData;
  S._onProgress = onProgressCallback;

  // Display room name
  document.getElementById('room-name').textContent = roomData.name || '';
  document.title = `${roomData.name || 'ROOM'} - WIRED ROOM`;

  if (showProgress) {
    showProgressBar();
  }

  // Skybox
  setStage(0, 5, 'Creating skybox...');
  createSkybox(S, roomData.sky);
  _trackSceneAdditions(S);

  // Lights
  setupLights(S);
  _trackSceneAdditions(S);

  // Build room: GLB or procedural
  setStage(5, 35, 'Loading room...');
  if (roomData.room?.glb) {
    await loadRoomGLB(S, roomData.room.glb, roomData.room);
  } else {
    buildRoom(S, roomData.room || DEFAULT_ROOM.room);
  }
  _trackSceneAdditions(S);

  // Place objects
  setStage(40, 5, 'Placing objects...');
  for (const obj of (roomData.objects || [])) {
    if (obj.glb) {
      await loadObjectGLB(S, obj);
    } else {
      placeObject(S, obj);
    }
  }
  _trackSceneAdditions(S);

  // Place portals
  for (const portal of (roomData.portals || [])) {
    createPortal(S, portal);
  }
  _trackSceneAdditions(S);

  // Load VRM avatar
  setStage(45, 40, 'Loading avatar...');
  if (roomData.avatar) {
    await loadPlayerAvatar(S, roomData.avatar);
  }
  _trackSceneAdditions(S);

  // Spawn
  const spawn = roomData.spawn || [0, 0, 0];
  S.playerPos.set(spawn[0], spawn[1], spawn[2]);

  // Media (public mode)
  setStage(85, 15, 'Loading media...');
  if (roomData.media && roomData.media.length > 0) {
    await loadManifestMedia(S);
    _trackSceneAdditions(S);
  }

  if (showProgress) {
    hideProgressBar();
  }

  console.log(`[ROOM] Room loaded: ${roomData.name}`);
}

// Track objects added to scene during load (for dispose)
let _lastTrackedCount = 0;
function _trackSceneAdditions(S) {
  const children = S.scene.children;
  for (let i = _lastTrackedCount; i < children.length; i++) {
    const child = children[i];
    // Don't track persistent objects (camera, cameraGroup, avatarGroup)
    if (child === S.camera || child === S.cameraGroup || child === S.avatarGroup) continue;
    S._roomObjects.push(child);
  }
  _lastTrackedCount = children.length;
}

// ============================================================
// Load external room (SPA mode for VR portal navigation)
// ============================================================
export async function loadExternalRoom(S, url) {
  // fade scene
  const fade = document.getElementById('scene-fade');

  // Fade out
  fade.classList.add('active');
  await new Promise(r => setTimeout(r, 400));

  // Ensure URL ends with /
  const baseUrl = url.endsWith('/') ? url : url + '/';

  // CORS check
  try {
    const res = await fetch(baseUrl + 'public/manifest.json', { method: 'HEAD', mode: 'cors' });
    if (!res.ok) throw new Error('Not found');
  } catch (e) {
    console.warn('[ROOM] CORS check failed:', baseUrl, e);
    fade.classList.remove('active');  // ← 追加
    const promptEl = document.getElementById('portal-prompt');
    promptEl.style.display = 'block';
    promptEl.textContent = 'This room does not support VR portal. Remove headset to visit.';
    setTimeout(() => { promptEl.style.display = 'none'; }, 4000);
    return false;
  }

  // Fetch manifest
  let manifest;
  try {
    const res = await fetch(baseUrl + 'public/manifest.json', { mode: 'cors' });
    manifest = await res.json();
  } catch (e) {
    console.error('[ROOM] Failed to fetch manifest:', e);
    fade.classList.remove('active');  // ← 追加
    return false;
  }

  // Dispose current room
  disposeAvatar(S);
  disposeRoom(S);

  // Reset tracking
  _lastTrackedCount = S.scene.children.length;

  // Build room data with external URL prefix
  const roomData = buildRoomDataFromManifest(manifest, baseUrl + 'public/');

  // Load new room
  await loadRoom(S, roomData, false);

  // Fade in
  fade.classList.remove('active');

  return true;
}

// ============================================================
// Init (one-time setup)
// ============================================================
async function init() {
  const S = STATE;

  // portal editor UI
  initPortalEditor();

  // Init progress bar elements
  initProgressBar();

  // ── Check for public/manifest.json (public mode) ──
  let manifest = null;
  try {
    const res = await fetch('./public/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch (e) { /* no manifest = edit mode */ }

  if (manifest) {
    S.isPublicMode = true;
    S.roomData = buildRoomDataFromManifest(manifest);
    console.log('[ROOM] Public mode: loaded manifest.json');
  } else {
    S.isPublicMode = false;
    let config = loadConfig();
    if (!config) {
      config = await showSetupWizard();
    }
    if (config) {
      S.roomData = await buildRoomDataFromConfig(config);
    } else {
      S.roomData = DEFAULT_ROOM;
    }
  }
  if (!S.roomData) S.roomData = DEFAULT_ROOM;

  // Show click-to-start screen
  const startScreen = document.getElementById('click-to-start');
  startScreen.style.display = 'flex';
  startScreen.querySelector('h2').textContent = S.roomData.name || 'ROOM';

  // Scene
  S.scene = new THREE.Scene();
  S.scene.background = new THREE.Color('#1a1a2e');

  // Camera
  S.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 500);
  const spawn = S.roomData.spawn || [0, 0, 0];
  S.playerPos.set(spawn[0], spawn[1], spawn[2]);
  S.camera.position.set(spawn[0], spawn[1] + S.CAM_HEIGHT, spawn[2] + S.CAM_DISTANCE);

  // Renderer
  S.renderer = new THREE.WebGLRenderer({ antialias: true });
  S.renderer.setSize(window.innerWidth, window.innerHeight);
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  S.renderer.shadowMap.enabled = true;
  S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.2;
  document.body.appendChild(S.renderer.domElement);

  // Track persistent objects before room load
  _lastTrackedCount = S.scene.children.length;

  // ── Load room content ──
  await loadRoom(S, S.roomData, true);

  // ── One-time setups (controls, menu, editor, VR) ──
  setupControls(S);
  setupMenu(S);
  setupEditor(S);
  await setupMedia(S);
  await prefetchPortalList();// ポータルリストをキャッシュ
  setupVR(S);
  initVRHint(S.scene);  // VR hint UI

  // Edit/Public mode toggle KEY [/]
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Slash') {
      S.isPublicMode = !S.isPublicMode;
      const mode = S.isPublicMode ? 'PUBLIC' : 'EDIT';
      document.getElementById('room-name').textContent =
        `${S.roomData.name || 'ROOM'} [${mode}]`;
      console.log(`[ROOM] Mode: ${mode}`);
    }
  });

  window.addEventListener('resize', () => onResize(S));

  // Start render loop
  animate();
}

// ============================================================
// Lights
// ============================================================
function setupLights(S) {
  const isGLBRoom = !!S.roomData.room?.glb;

  const ambient = new THREE.AmbientLight(0xffffff, isGLBRoom ? 1.5 : 0.6);
  S.scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffeedd, isGLBRoom ? 2.0 : 0.8);
  dirLight.position.set(5, 8, 3);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 30;
  dirLight.shadow.camera.left = -10;
  dirLight.shadow.camera.right = 10;
  dirLight.shadow.camera.top = 10;
  dirLight.shadow.camera.bottom = -10;
  S.scene.add(dirLight);

  if (isGLBRoom) {
    const fillLight = new THREE.DirectionalLight(0x8899bb, 0.6);
    fillLight.position.set(-3, 4, -2);
    S.scene.add(fillLight);

    const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x443322, 0.5);
    S.scene.add(hemiLight);
  } else {
    const pointLight = new THREE.PointLight(0x00ff88, 0.5, 12);
    pointLight.position.set(0, 2.5, 0);
    S.scene.add(pointLight);
  }
}

// ============================================================
// Load media from manifest (public mode)
// ============================================================
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

const _pubVrmLoader = new GLTFLoader();
_pubVrmLoader.register((p) => new VRMLoaderPlugin(p));
_pubVrmLoader.register((p) => new VRMAnimationLoaderPlugin(p));

function _loadGLTF(url) {
  return new Promise((resolve, reject) => _pubVrmLoader.load(url, resolve, undefined, reject));
}

async function loadManifestMedia(S) {
  const media = S.roomData.media || [];

  for (const item of media) {
    try {
      if (item.type === 'image' && item.file) {
        const tex = await new Promise((resolve) => {
          new THREE.TextureLoader().load(item.file, resolve);
        });
        const aspect = tex.image.width / tex.image.height;
        const h = 1.2;
        const geo = new THREE.PlaneGeometry(h * aspect, h);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        mat.toneMapped = false;  // ← これ追加
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...(item.pos || [0, 1.5, 0]));
        mesh.rotation.set(
          THREE.MathUtils.degToRad(item.rot?.[0] || 0),
          THREE.MathUtils.degToRad(item.rot?.[1] || 0),
          THREE.MathUtils.degToRad(item.rot?.[2] || 0)
        );
        mesh.scale.setScalar(item.scale || 1);
        S.scene.add(mesh);

      } else if (item.type === 'video' && item.file) {
        const video = document.createElement('video');
        video.src = item.file;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.play();
        await new Promise((resolve) => {
          video.addEventListener('loadedmetadata', resolve, { once: true });
        });
        const aspect = video.videoWidth / video.videoHeight;
        const h = 1.2;
        const tex = new THREE.VideoTexture(video);
        const geo = new THREE.PlaneGeometry(h * aspect, h);
        const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
        mat.toneMapped = false;  // ← これ追加
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...(item.pos || [0, 1.5, 0]));
        mesh.rotation.set(
          THREE.MathUtils.degToRad(item.rot?.[0] || 0),
          THREE.MathUtils.degToRad(item.rot?.[1] || 0),
          THREE.MathUtils.degToRad(item.rot?.[2] || 0)
        );
        mesh.scale.setScalar(item.scale || 1);
        S.scene.add(mesh);

      } else if (item.type === 'figurine' && item.vrm) {
        const gltf = await _loadGLTF(item.vrm);
        const vrm = gltf.userData.vrm;
        if (!vrm) continue;
        VRMUtils.removeUnnecessaryVertices(vrm.scene);
        VRMUtils.combineSkeletons(vrm.scene);
        const group = new THREE.Group();
        group.add(vrm.scene);
        group.position.set(...(item.pos || [0, 0, 0]));
        group.rotation.set(
          THREE.MathUtils.degToRad(item.rot?.[0] || 0),
          THREE.MathUtils.degToRad(item.rot?.[1] || 0),
          THREE.MathUtils.degToRad(item.rot?.[2] || 0)
        );
        group.scale.setScalar(item.scale || 1);
        S.scene.add(group);

        // Apply pose
        if (item.pose) {
          try {
            const poseGltf = await _loadGLTF(item.pose);
            const vrmAnim = poseGltf.userData.vrmAnimations?.[0];
            if (vrmAnim) {
              const _warn = console.warn;
              console.warn = () => {};
              const clip = createVRMAnimationClip(vrmAnim, vrm);
              console.warn = _warn;
              const mixer = new THREE.AnimationMixer(vrm.scene);
              const action = mixer.clipAction(clip);
              action.play();
              mixer.update(0.016);
              action.paused = true;
              vrm.update(0);
            }
          } catch (e) { console.warn('[PUBLIC] Pose load failed:', e); }
        }

      } else if (item.type === 'credit') {
        const cd = item.creditData || {};
        let lines = [`── ${cd.name || 'Room'} ──`];
        if (cd.author) lines.push(`Room by: ${cd.author}`);
        if (cd.license) lines.push(`License: ${cd.license}`);
        if (cd.creditList) {
          lines.push('');
          lines = lines.concat(cd.creditList.split('\n').filter(l => l.trim()));
        }
        const canvas = document.createElement('canvas');
        const lineHeight = 28, padding = 30;
        canvas.width = 512;
        canvas.height = Math.max(256, lines.length * lineHeight + padding * 2);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(10,10,10,0.9)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
        ctx.fillStyle = '#00ff88';
        ctx.font = '18px Courier New';
        ctx.textAlign = 'left';
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('──')) {
            ctx.fillStyle = '#00ffaa';
            ctx.font = 'bold 20px Courier New';
            ctx.textAlign = 'center';
            ctx.fillText(line, canvas.width / 2, padding + i * lineHeight);
            ctx.textAlign = 'left';
            ctx.font = '18px Courier New';
            ctx.fillStyle = '#00ff88';
          } else {
            ctx.fillText(line, padding, padding + i * lineHeight);
          }
        }
        const aspect = canvas.width / canvas.height;
        const h = 1.5;
        const geo = new THREE.PlaneGeometry(h * aspect, h);
        const mat = new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, transparent: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(...(item.pos || [0, 1.5, -2]));
        mesh.rotation.y = THREE.MathUtils.degToRad(item.rot?.[1] || 0);
        mesh.scale.setScalar(item.scale || 1);
        S.scene.add(mesh);
      } else if (item.type === 'portal') {
        const portalType = item.portalType || 'global';
        const { group } = createPortalEffect(portalType);
        group.position.set(...(item.pos || [0, 0, 0]));
        group.userData = { url: item.url || '', label: item.label || 'Portal', portalType };
        S.scene.add(group);
        S.portalMeshes.push(group);
      }

    } catch (e) {
      console.warn(`[PUBLIC] Failed to load media:`, item, e);
    }
  }

  console.log(`[PUBLIC] Loaded ${media.length} media items`);
}

// ============================================================
// Render loop (uses setAnimationLoop for WebXR compatibility)
// ============================================================
function animate() {
  STATE.renderer.setAnimationLoop((time, frame) => {
    const dt = Math.min(STATE.clock.getDelta(), 0.05);

    if (isVRActive()) {
      updateVR(STATE, dt);
    } else {
      update(STATE, dt);
    }

    updatePortalAnimations(dt);
    updateCorridor(STATE, dt);
    updateSkybox(STATE, dt);
    STATE.renderer.render(STATE.scene, STATE.camera);
  });
}

function onResize(S) {
  S.camera.aspect = window.innerWidth / window.innerHeight;
  S.camera.updateProjectionMatrix();
  S.renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// Start
// ============================================================
init();
