// room-loader.js - GLB room/object loading, skybox, primitives, portals
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================================
// Loader setup
// ============================================================
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
gltfLoader.setDRACOLoader(dracoLoader);

export function loadGLB(url, onProgress) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, onProgress || undefined, reject);
  });
}

// ============================================================
// Load GLB as room
// ============================================================
export async function loadRoomGLB(S, glbPath, roomConfig) {
  try {
    const gltf = await loadGLB(glbPath, S._onProgress);
    const model = gltf.scene;

    // Apply scale/position/rotation
    const s = roomConfig.scale || 1;
    model.scale.set(s, s, s);

    if (roomConfig.pos) {
      model.position.set(...roomConfig.pos);
    }
    if (roomConfig.rot) {
      model.rotation.set(
        THREE.MathUtils.degToRad(roomConfig.rot[0] || 0),
        THREE.MathUtils.degToRad(roomConfig.rot[1] || 0),
        THREE.MathUtils.degToRad(roomConfig.rot[2] || 0)
      );
    }

    // Shadows + metalness fix
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material.metalness > 0.5) {
          child.material.metalness = 0.3;
          child.material.roughness = Math.max(child.material.roughness, 0.4);
        }
      }
    });

    S.scene.add(model);

    // BVH collision meshes
    if (roomConfig.collision !== false) {
      model.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundsTree();
          S.colliderMeshes.push(child);
        }
      });
    }

    console.log(`[ROOM] GLB loaded: ${glbPath} (${S.colliderMeshes.length} BVH collision meshes)`);
    S.roomModel = model;  // Store reference for editor
  } catch (e) {
    console.error(`[ROOM] Failed to load GLB: ${glbPath}`, e);
    buildRoom(S, { width: 10, depth: 10, height: 3, floorColor: "#2a2a2a", wallColor: "#1a1a2e", ceilingColor: "#111122" });
  }
}

// ============================================================
// Load GLB as object/furniture
// ============================================================
export async function loadObjectGLB(S, obj) {
  try {
    const gltf = await loadGLB(obj.glb);
    const model = gltf.scene;

    const pos = obj.pos || [0, 0, 0];
    model.position.set(pos[0], pos[1], pos[2]);

    const s = obj.scale || 1;
    if (Array.isArray(s)) {
      model.scale.set(s[0], s[1], s[2]);
    } else {
      model.scale.set(s, s, s);
    }

    if (obj.rot) {
      model.rotation.set(
        THREE.MathUtils.degToRad(obj.rot[0] || 0),
        THREE.MathUtils.degToRad(obj.rot[1] || 0),
        THREE.MathUtils.degToRad(obj.rot[2] || 0)
      );
    }

    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    S.scene.add(model);

    if (obj.collision !== false) {
      const bbox = new THREE.Box3().setFromObject(model);
      S.colliders.push(bbox);
    }

    console.log(`[ROOM] Object loaded: ${obj.glb}`);
  } catch (e) {
    console.error(`[ROOM] Failed to load object: ${obj.glb}`, e);
  }
}

// ============================================================
// Place objects (primitives)
// ============================================================
export function placeObject(S, obj) {
  let mesh;
  const color = obj.color || '#888888';
  const matParams = { color, roughness: 0.6, metalness: 0.1 };
  if (obj.emissive) {
    matParams.emissive = obj.emissive;
    matParams.emissiveIntensity = 1.0;
  }
  const mat = new THREE.MeshStandardMaterial(matParams);

  if (obj.type === 'box') {
    const size = obj.size || [1, 1, 1];
    mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  } else if (obj.type === 'sphere') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(obj.radius || 0.5, 16, 16), mat);
  } else if (obj.type === 'cylinder') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(
      obj.radiusTop || 0.5, obj.radiusBottom || 0.5, obj.height || 1, 16
    ), mat);
  } else {
    return;
  }

  const pos = obj.pos || [0, 0, 0];
  mesh.position.set(pos[0], pos[1], pos[2]);

  if (obj.rot) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(obj.rot[0]),
      THREE.MathUtils.degToRad(obj.rot[1]),
      THREE.MathUtils.degToRad(obj.rot[2])
    );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  S.scene.add(mesh);

  if (obj.type === 'box') {
    const size = obj.size || [1, 1, 1];
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Vector3(size[0], size[1], size[2])
    );
    S.colliders.push(box);
  }
}

// ============================================================
// Build room geometry (procedural fallback)
// ============================================================
export function buildRoom(S, r) {
  const w = r.width || 10;
  const d = r.depth || 10;
  const h = r.height || 3;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: r.floorColor || '#2a2a2a', roughness: 0.8, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  S.scene.add(floor);

  // Ceiling
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: r.ceilingColor || '#111122', roughness: 0.9 })
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  S.scene.add(ceil);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: r.wallColor || '#1a1a2e', roughness: 0.7, metalness: 0.05 });

  const wallData = [
    { size: [w, h], pos: [0, h / 2, -d / 2], rot: [0, 0, 0] },
    { size: [w, h], pos: [0, h / 2, d / 2], rot: [0, Math.PI, 0] },
    { size: [d, h], pos: [-w / 2, h / 2, 0], rot: [0, Math.PI / 2, 0] },
    { size: [d, h], pos: [w / 2, h / 2, 0], rot: [0, -Math.PI / 2, 0] },
  ];

  for (const wd of wallData) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(wd.size[0], wd.size[1]), wallMat);
    wall.position.set(...wd.pos);
    wall.rotation.set(...wd.rot);
    S.scene.add(wall);

    const thickness = 0.2;
    const isXWall = wd.rot[1] === Math.PI / 2 || wd.rot[1] === -Math.PI / 2;
    const colSize = isXWall
      ? new THREE.Vector3(thickness, wd.size[1], wd.size[0])
      : new THREE.Vector3(wd.size[0], wd.size[1], thickness);
    S.colliders.push(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...wd.pos), colSize));
  }
}

// ============================================================
// Skybox presets
// ============================================================
export const SKY_PRESETS = {
  night: {
    name: 'Night',
    topColor: '#050520', midColor: '#0a0a3a', bottomColor: '#1a0a1a',
    stars: true, moon: true, rotSpeed: 0.003,
    bgColor: '#0a0a3a',
  },
  sunset: {
    name: 'Sunset',
    topColor: '#0a0a3a', midColor: '#cc4400', bottomColor: '#ffaa33',
    stars: false, moon: false, rotSpeed: 0.005,
    clouds: true, cloudColor: 'rgba(60,20,10,0.3)',
    bgColor: '#cc4400',
  },
  day: {
    name: 'Day',
    topColor: '#1a6bcc', midColor: '#55aaee', bottomColor: '#aaddff',
    stars: false, moon: false, rotSpeed: 0.002,
    clouds: true, cloudColor: 'rgba(255,255,255,0.6)',
    bgColor: '#55aaee',
  },
  wired: {
    name: 'WIRED',
    topColor: '#000000', midColor: '#0a0a1a', bottomColor: '#001100',
    stars: true, moon: false, rotSpeed: 0.008,
    grid: true,
    bgColor: '#0a0a1a',
  },
};

// ============================================================
// Skybox
// ============================================================
export function createSkybox(S, skyConfig) {
  const config = skyConfig || {};

  // Resolve preset or use custom config
  let preset;
  if (config.preset && SKY_PRESETS[config.preset]) {
    preset = { ...SKY_PRESETS[config.preset], ...config };
  } else if (config.type === 'color') {
    S.scene.background = new THREE.Color(config.color || '#1a1a2e');
    return;
  } else if (config.type === 'none') {
    S.scene.background = new THREE.Color('#000000');
    return;
  } else {
    // Default or custom gradient
    preset = {
      topColor: config.topColor || '#050520',
      midColor: config.midColor || '#0a0a3a',
      bottomColor: config.bottomColor || '#1a0a1a',
      stars: config.stars !== undefined ? config.stars : true,
      moon: config.moon !== undefined ? config.moon : true,
      rotSpeed: config.rotSpeed || 0.003,
      clouds: config.clouds || false,
      cloudColor: config.cloudColor || 'rgba(255,255,255,0.4)',
      grid: config.grid || false,
      bgColor: config.midColor || '#0a0a3a',
    };
  }

  // ── Main sky sphere ──
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 512;
  skyCanvas.height = 512;
  const ctx = skyCanvas.getContext('2d');

  // Gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, preset.topColor);
  gradient.addColorStop(0.45, preset.midColor);
  gradient.addColorStop(1, preset.bottomColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  // Stars
  if (preset.stars) {
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 280;
      const r = Math.random() * 0.1 ;
      ctx.globalAlpha = Math.random() * 0.05 ;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Moon
  if (preset.moon) {
    ctx.fillStyle = '#eeeedd';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(380, 70, 18, 0, Math.PI * 2);
    ctx.fill();
    // Moon glow
    const moonGrad = ctx.createRadialGradient(380, 70, 18, 380, 70, 50);
    moonGrad.addColorStop(0, 'rgba(200,200,180,0.15)');
    moonGrad.addColorStop(1, 'rgba(200,200,180,0)');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(380, 70, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Grid overlay (WIRED style)
  if (preset.grid) {
    ctx.strokeStyle = 'rgba(0,255,0,0.07)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 512; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
  }

  const skyGeo = new THREE.SphereGeometry(200, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(skyCanvas),
    side: THREE.BackSide,
  });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  S.scene.add(skyMesh);
  S.scene.background = new THREE.Color(preset.bgColor);

  // Store for animation
  S.skyMesh = skyMesh;
  S.skyRotSpeed = preset.rotSpeed;

  // ── Cloud layer (separate sphere, slower rotation) ──
  if (preset.clouds) {
    const cloudCanvas = document.createElement('canvas');
    cloudCanvas.width = 512;
    cloudCanvas.height = 256;
    const cctx = cloudCanvas.getContext('2d');

    // Draw procedural clouds
    cctx.clearRect(0, 0, 512, 256);
    const cloudCount = 20 + Math.floor(Math.random() * 15);
    for (let i = 0; i < cloudCount; i++) {
      const cx = Math.random() * 512;
      const cy = 40 + Math.random() * 160;
      const w = 30 + Math.random() * 80;
      const h = 10 + Math.random() * 25;

      cctx.fillStyle = preset.cloudColor;
      cctx.beginPath();
      cctx.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      cctx.fill();

      // Sub-puffs
      for (let j = 0; j < 3; j++) {
        const px = cx + (Math.random() - 0.5) * w;
        const py = cy + (Math.random() - 0.5) * h;
        const pr = 8 + Math.random() * 20;
        cctx.beginPath();
        cctx.arc(px, py, pr, 0, Math.PI * 2);
        cctx.fill();
      }
    }

    const cloudGeo = new THREE.SphereGeometry(195, 32, 16);
    const cloudMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cloudCanvas),
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    S.scene.add(cloudMesh);
    S.cloudMesh = cloudMesh;
  }
}

// ============================================================
// Skybox animation (call from render loop)
// ============================================================
export function updateSkybox(S, dt) {
  if (S.skyMesh && S.skyRotSpeed) {
    S.skyMesh.rotation.y += S.skyRotSpeed * dt;
  }
  if (S.cloudMesh) {
    S.cloudMesh.rotation.y += (S.skyRotSpeed || 0.003) * dt * 0.6;
  }
}

// ============================================================
// Portals
// ============================================================
export function createPortal(S, portal) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#00ff88', emissive: '#00ff44', emissiveIntensity: 0.8,
    transparent: true, opacity: 0.6, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.0), mat);
  const pos = portal.pos || [0, 1, 0];
  mesh.position.set(pos[0], pos[1], pos[2]);

  if (portal.rot) {
    mesh.rotation.set(
      THREE.MathUtils.degToRad(portal.rot[0]),
      THREE.MathUtils.degToRad(portal.rot[1]),
      THREE.MathUtils.degToRad(portal.rot[2])
    );
  }

  mesh.userData = { url: portal.url, label: portal.label || portal.url };
  S.scene.add(mesh);
  S.portalMeshes.push(mesh);

  if (portal.label) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#00ff88';
    ctx.font = '20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(portal.label, 128, 40);
    const spriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(pos[0], pos[1] + 1.3, pos[2]);
    sprite.scale.set(2, 0.5, 1);
    S.scene.add(sprite);
  }
}
