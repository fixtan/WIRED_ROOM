// app.js - Entry point, shared state, init, render loop
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { loadRoomGLB, loadObjectGLB, placeObject, buildRoom, createSkybox, createPortal, updateSkybox } from './js/room-loader.js';
import { loadPlayerAvatar, updateAvatar } from './js/avatar.js';
import { setupControls, update } from './js/controls.js';
import { loadConfig, showSetupWizard, buildRoomDataFromConfig } from './js/setup.js';
import { setupMenu } from './js/menu.js';
import { setupVR, updateVR, isVRActive } from './js/vr.js';
import { setupEditor } from './js/editor.js';
import { setupMedia, updatePortalAnimations } from './js/media.js';

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
function buildRoomDataFromManifest(manifest) {
  const P = './public/'; // prefix for all manifest file references
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
// Init
// ============================================================
async function init() {
  const S = STATE;

  // ── Check for public/manifest.json (public mode) ──
  let manifest = null;
  try {
    const res = await fetch('./public/manifest.json');
    if (res.ok) manifest = await res.json();
  } catch (e) { /* no manifest = edit mode */ }

  if (manifest) {
    // Public mode: build roomData from manifest
    S.isPublicMode = true;
    S.roomData = buildRoomDataFromManifest(manifest);
    console.log('[ROOM] Public mode: loaded manifest.json');
  } else {
    // Edit mode: use localStorage config or show wizard
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

  // Display room name
  document.getElementById('room-name').textContent = S.roomData.name || '';
  document.title = `${S.roomData.name || 'ROOM'} - WIRED ROOM`;

  // Show click-to-start screen
  const startScreen = document.getElementById('click-to-start');
  startScreen.style.display = 'flex';
  startScreen.querySelector('h2').textContent = S.roomData.name || 'ROOM';

  // Display room name
  document.getElementById('room-name').textContent = S.roomData.name || '';

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

  // Skybox
  createSkybox(S, S.roomData.sky);

  // Lights
  setupLights(S);

  // Build room: GLB or procedural
  if (S.roomData.room?.glb) {
    await loadRoomGLB(S, S.roomData.room.glb, S.roomData.room);
  } else {
    buildRoom(S, S.roomData.room || DEFAULT_ROOM.room);
  }

  // Place objects
  for (const obj of (S.roomData.objects || [])) {
    if (obj.glb) {
      await loadObjectGLB(S, obj);
    } else {
      placeObject(S, obj);
    }
  }

  // Place portals
  for (const portal of (S.roomData.portals || [])) {
    createPortal(S, portal);
  }

  // Load VRM avatar
  if (S.roomData.avatar) {
    await loadPlayerAvatar(S, S.roomData.avatar);
  }

  // Controls
  setupControls(S);
  setupMenu(S);
  setupEditor(S);
  await setupMedia(S);
  if (S.isPublicMode) {
    // Public mode: also load media from manifest
    await loadManifestMedia(S);
  }
  setupVR(S);


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
        VRMUtils.removeUnnecessaryJoints(vrm.scene);
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
              const clip = createVRMAnimationClip(vrmAnim, vrm);
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
        // Simple credit board placeholder (no config in public mode)
        // Could be enhanced later
      }
    } catch (e) {
      console.warn(`[PUBLIC] Failed to load media:`, item, e);
    }
  }

  console.log(`[PUBLIC] Loaded ${media.length} media items`);
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
// Render loop (uses setAnimationLoop for WebXR compatibility)
// ============================================================
function animate() {
  // setAnimationLoop is required for WebXR
  STATE.renderer.setAnimationLoop((time, frame) => {
    const dt = Math.min(STATE.clock.getDelta(), 0.05);

    if (isVRActive()) {
      updateVR(STATE, dt);
    } else {
      update(STATE, dt);
    }

    updatePortalAnimations(dt);
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
