// room-loader.js - GLB room/object loading, skybox, primitives, portals
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================================
// Loader setup
// ============================================================
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('./js/draco/');
gltfLoader.setDRACOLoader(dracoLoader);
export { dracoLoader };

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
// GLSL Shaders for Dynamic Skybox (Seamless 3D Clouds Version)
// ============================================================
const skyVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const skyFragmentShader = `
  uniform float uTime;
  uniform vec3 uTopColor;
  uniform vec3 uMidColor;
  uniform vec3 uBottomColor;
  uniform float uStarsIntensity;
  uniform float uGridIntensity;
  uniform vec3 uGridColor;

  // ── 新設の雲パラメータ ──
  uniform float uCloudsIntensity; // 1.0 で雲を表示
  uniform vec3 uCloudColor;       // 雲の色
  uniform float uCloudAlpha;      // 雲の不透明度

  varying vec3 vWorldPosition;

  // 2D ハッシュ
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // ── 【解決策】繋ぎ目を消し去るための3D疑似ランダムハッシュ ──
  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  // ── 完全シームレスな 3D Value Noise ──
  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float a = hash3(i + vec3(0.0, 0.0, 0.0));
    float b = hash3(i + vec3(1.0, 0.0, 0.0));
    float c = hash3(i + vec3(0.0, 1.0, 0.0));
    float d = hash3(i + vec3(1.0, 1.0, 0.0));
    float e = hash3(i + vec3(0.0, 0.0, 1.0));
    float f_ = hash3(i + vec3(1.0, 0.0, 1.0));
    float g = hash3(i + vec3(0.0, 1.0, 1.0));
    float h = hash3(i + vec3(1.0, 1.0, 1.0));

    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
               mix(mix(e, f_, u.x), mix(g, h, u.x), u.y), u.z);
  }

  void main() {
    // 球体の表面方向ベクトル（これが3D空間上のシームレスな座標になります）
    vec3 dir = normalize(vWorldPosition);

    // ── 1. 基本のグラデーション ──
    float height = dir.y;
    float wave = sin(uTime * 0.05) * 0.02;
    vec3 skyColor = mix(uMidColor, uTopColor, max(height + wave, 0.0));
    skyColor = mix(skyColor, uBottomColor, max(-height + wave, 0.0));

    float horizonMask = smoothstep(0.0, 0.4, 1.0 - abs(dir.y));

    // ── 2. 【新設】3Dプロシージャル・アニメ調の雲 (昼・夕方向け) ──
    if (uCloudsIntensity > 0.0 && dir.y > -0.1) {
      // 風の流れを作る（時間経過で3Dベクトルをシフト。どこまで回っても無限に繋がります）
      vec3 cloudPos = dir * 3.0 + vec3(uTime * 0.02, 0.0, uTime * 0.01);

      // 複数の周波数のノイズを重ねて（fBm）、もくもくした雲の質量を作る
      float n = noise3(cloudPos) * 0.5;
      n += noise3(cloudPos * 2.0) * 0.25;
      n += noise3(cloudPos * 4.0) * 0.125;

      // smoothstepの閾値を鋭く絞ることで、引き延ばされたボケを消し、
      // アニメの背景美術のような輪郭のくっきりした「ぽっかり浮かぶ雲」にする
      float cloudMask = smoothstep(0.38, 0.45, n);

      // 地平線付近で自然に消えるようにマスクをかける
      cloudMask *= smoothstep(-0.1, 0.15, dir.y);

      // 雲の影（立体感）を微かに表現するためのサブマスク
      float shadowMask = smoothstep(0.35, 0.42, n);
      vec3 finalCloudColor = mix(uCloudColor * 0.85, uCloudColor, shadowMask);

      // スカイカラーと合成
      skyColor = mix(skyColor, finalCloudColor, cloudMask * uCloudAlpha);
    }

    // ── 3. 星の描画 (夜空用) ──
    if (uStarsIntensity > 0.0 && dir.y > -0.1) {
      vec2 starUV = vec2(atan(dir.x, dir.z) * 50.0, dir.y * 70.0);
      vec2 ipos = floor(starUV);
      vec2 fpos = fract(starUV);

      float starHash = hash(ipos);
      if (starHash > 0.95) {
        vec2 offset = vec2(hash(ipos + 12.3), hash(ipos + 45.6));
        float r = length(fpos - offset);
        float star = smoothstep(0.09, 0.0, r);

        float blinkSpeed = 1.5 + starHash * 4.5;
        float twinkle = sin(uTime * blinkSpeed + starHash * 62.8) * 0.5 + 0.5;

        vec3 starColor = mix(vec3(0.7, 0.9, 1.0), vec3(1.0, 0.7, 0.9), hash(ipos + 78.9));
        starColor = mix(starColor, vec3(1.0, 1.0, 0.9), starHash);

        float horizonFade = smoothstep(-0.1, 0.2, dir.y);
        skyColor += starColor * (star * twinkle * 0.8) * horizonFade * uStarsIntensity;
      }
    }

    // ── 4. 流れ星の描画 ──
    if (uStarsIntensity > 0.0 && dir.y > 0.1) {
      float mTime = uTime * 0.4;
      float mCycle = fract(mTime);
      float mId = floor(mTime);
      float mHash = hash(vec2(mId, 99.73));

      if (mHash > 0.3) {
        float mAngle = mHash * 6.28318;
        float currentAngle = atan(dir.x, dir.z);
        float angleDiff = atan(sin(currentAngle - mAngle), cos(currentAngle - mAngle));

        float strokeX = angleDiff * 3.5;
        float strokeY = dir.y - 0.1;

        float meteorProgress = mix(0.8, -0.1, mCycle);
        float lineDist = abs(strokeY - (-strokeX + meteorProgress));

        float headMask = strokeY - meteorProgress;
        if (headMask > 0.0 && headMask < 0.3) {
          float intensity = smoothstep(0.012, 0.0, lineDist);
          intensity *= smoothstep(0.3, 0.0, headMask);
          intensity *= smoothstep(0.0, 0.1, mCycle) * smoothstep(1.0, 0.7, mCycle);

          vec3 meteorColor = mix(vec3(0.6, 0.9, 1.0), vec3(1.0, 0.7, 0.9), mHash);
          skyColor += meteorColor * intensity * 1.5 * uStarsIntensity;
        }
      }
    }

    // ── 5. デジタルグリッドの描画 (WIRED用) ──
    if (uGridIntensity > 0.0) {
      vec2 gridUV = vec2(atan(dir.x, dir.z) * 45.0, dir.y * 60.0);
      gridUV.y += uTime * 0.04;
      vec2 grid = abs(fract(gridUV - 0.5) - 0.5) / fwidth(gridUV);
      float gridPattern = 1.0 - min(min(grid.x, grid.y), 1.0);
      float pulse = mix(0.3, 1.0, sin(uTime * 1.5 + gridUV.y * 0.2) * 0.5 + 0.5);

      vec3 finalGrid = uGridColor * gridPattern * horizonMask * pulse * 0.25;
      skyColor += finalGrid * uGridIntensity;
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`;

// ============================================================
// Skybox Creation
// ============================================================
export function createSkybox(S, skyConfig) {
  const config = skyConfig || {};

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

  // グリッドカラーの解決
  let gridColor = new THREE.Color('#ff6699');
  if (preset.name === 'WIRED') {
    gridColor.set('#00ff44');
  }

  // ── プリセットの雲設定をシェーダー用に最適化 ──
  let cColor = new THREE.Color('#ffffff'); // Day用の白雲
  let cAlpha = 0.7;                        // アニメっぽく少しハッキリめに

  if (preset.name === 'Sunset') {
    cColor.set('#f3a17b');                 // 夕焼けに染まったパステルオレンジの雲に変更
    cAlpha = 0.6;
  }

  // Uniformsの定義
  const uniforms = {
    uTime: { value: 0.0 },
    uTopColor: { value: new THREE.Color(preset.topColor) },
    uMidColor: { value: new THREE.Color(preset.midColor) },
    uBottomColor: { value: new THREE.Color(preset.bottomColor) },
    uStarsIntensity: { value: preset.stars ? 1.0 : 0.0 },
    uGridIntensity: { value: preset.grid ? 1.0 : 0.0 },
    uGridColor: { value: gridColor },
    // 雲制御用の一元化
    uCloudsIntensity: { value: preset.clouds ? 1.0 : 0.0 },
    uCloudColor: { value: cColor },
    uCloudAlpha: { value: cAlpha }
  };

  const skyGeo = new THREE.SphereGeometry(400, 64, 64);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    uniforms: uniforms,
    side: THREE.BackSide,
    depthWrite: false
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  S.scene.add(skyMesh);
  S.scene.background = new THREE.Color(preset.bgColor);

  S.skyMaterial = skyMat;
  S.skyMesh = skyMesh;
  S.skyRotSpeed = preset.rotSpeed;

  // ※ 古い Canvas ベースの別メッシュ (S.cloudMesh) 生成処理は完全に削除しました
}

// ============================================================
// Skybox animation
// ============================================================
export function updateSkybox(S, dt) {
  if (S.skyMaterial && S.skyMaterial.uniforms) {
    S.skyMaterial.uniforms.uTime.value += dt;
  }
  if (S.skyMesh && S.skyRotSpeed) {
    S.skyMesh.rotation.y += S.skyRotSpeed * dt;
  }
  // ※ S.cloudMesh の回転処理も不要になったため削除しました
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
