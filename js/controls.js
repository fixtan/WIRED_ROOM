// controls.js - Keyboard, mouse, collision detection, movement, camera, portals
import * as THREE from 'three';
import { updateAvatar } from './avatar.js';

// ============================================================
// Collision detection (hybrid: Box3 + Raycaster)
// ============================================================
const raycaster = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3();
const _rayDown = new THREE.Vector3(0, -1, 0);
const _rayDirs = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(1, 0, 1).normalize(),
  new THREE.Vector3(-1, 0, 1).normalize(),
  new THREE.Vector3(1, 0, -1).normalize(),
  new THREE.Vector3(-1, 0, -1).normalize(),
];
const _floorRaycaster = new THREE.Raycaster();

// Pre-allocated objects for checkCollision (avoid per-frame GC)
const _playerBox = new THREE.Box3();
const _boxCenter = new THREE.Vector3();
const _boxSize = new THREE.Vector3();

export function checkCollision(S, newPos) {
  raycaster.far = S.PLAYER_RADIUS + 0.5;
  _floorRaycaster.far = S.PLAYER_HEIGHT + 1.0;

  // 1. Box3 colliders (primitives)
  if (S.colliders.length > 0) {
    _boxCenter.set(newPos.x, newPos.y - S.PLAYER_HEIGHT / 2, newPos.z);
    _boxSize.set(S.PLAYER_RADIUS * 2, S.PLAYER_HEIGHT, S.PLAYER_RADIUS * 2);
    _playerBox.setFromCenterAndSize(_boxCenter, _boxSize);
    for (const box of S.colliders) {
      if (_playerBox.intersectsBox(box)) return true;
    }
  }

  // 2. Raycaster colliders (GLB meshes)
  if (S.colliderMeshes.length > 0) {
    // Wall check at waist height
    _rayOrigin.set(newPos.x, newPos.y - S.PLAYER_HEIGHT * 0.5, newPos.z);
    for (const dir of _rayDirs) {
      raycaster.set(_rayOrigin, dir);
      const hits = raycaster.intersectObjects(S.colliderMeshes, false);
      if (hits.length > 0 && hits[0].distance < S.PLAYER_RADIUS) return true;
    }

    // Wall check at knee height
    _rayOrigin.set(newPos.x, newPos.y - S.PLAYER_HEIGHT * 0.8, newPos.z);
    for (const dir of _rayDirs) {
      raycaster.set(_rayOrigin, dir);
      const hits = raycaster.intersectObjects(S.colliderMeshes, false);
      if (hits.length > 0 && hits[0].distance < S.PLAYER_RADIUS) return true;
    }

    // 3. Floor check
    _rayOrigin.set(newPos.x, newPos.y, newPos.z);
    _floorRaycaster.set(_rayOrigin, _rayDown);
    const floorHits = _floorRaycaster.intersectObjects(S.colliderMeshes, false);
    if (floorHits.length === 0) return true;
  }

  return false;
}

// ============================================================
// Controls setup
// ============================================================
export function setupControls(S) {
  // Click to start / pointer lock
  const startScreen = document.getElementById('click-to-start');
  startScreen.addEventListener('click', () => {
    startScreen.style.display = 'none';
    document.body.requestPointerLock();
  });

  document.addEventListener('pointerlockchange', () => {
    S.isLocked = !!document.pointerLockElement;
  });

  // Re-lock on canvas click
  S.renderer.domElement.addEventListener('click', () => {
    if (!S.isLocked) {
      document.body.requestPointerLock();
    }
  });

  // Mouse
  document.addEventListener('mousemove', (e) => {
    if (!S.isLocked) return;
    S.yaw -= e.movementX * S.MOUSE_SENSITIVITY;
    S.pitch -= e.movementY * S.MOUSE_SENSITIVITY;
    S.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, S.pitch));
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    S.keys[e.code] = true;
    if (e.code === 'KeyE') tryPortalInteract();
  });
  document.addEventListener('keyup', (e) => {
    S.keys[e.code] = false;
  });
}

function tryPortalInteract() {
  const promptEl = document.getElementById('portal-prompt');
  if (promptEl.dataset.url) {
    const url = promptEl.dataset.url;
    if (window.self !== window.top) {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }
}

// ============================================================
// Portal proximity check
// ============================================================
// Pre-allocated vectors for portal proximity (avoid per-frame GC)
const _playerPosXZ = new THREE.Vector3();
const _portalPos = new THREE.Vector3();

function checkPortalProximity(S) {
  const promptEl = document.getElementById('portal-prompt');
  let nearestPortal = null;
  let nearestDist = S.PORTAL_TRIGGER_DIST;

  _playerPosXZ.set(S.playerPos.x, 0, S.playerPos.z);

  for (const pm of S.portalMeshes) {
    _portalPos.set(pm.position.x, 0, pm.position.z);
    const dist = _playerPosXZ.distanceTo(_portalPos);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestPortal = pm;
    }
  }

  if (nearestPortal) {
    promptEl.style.display = 'block';
    promptEl.textContent = `[E] ${nearestPortal.userData.label}`;
    promptEl.dataset.url = nearestPortal.userData.url;
  } else {
    promptEl.style.display = 'none';
    promptEl.dataset.url = '';
  }

  // Animate portal meshes
  const t = S.clock.getElapsedTime();
  for (const pm of S.portalMeshes) {
    if (!pm.material) continue;  // ← Group (WavyRing portals) はスキップ
    pm.material.opacity = 0.4 + 0.2 * Math.sin(t * 3);
    pm.material.emissiveIntensity = 0.5 + 0.3 * Math.sin(t * 2);
  }
}

// ============================================================
// Update (called every frame)
// ============================================================
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();

// Pre-allocated vectors for update() (avoid per-frame GC)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _moveDir = new THREE.Vector3();
const _testPos = new THREE.Vector3();

export function update(S, dt) {
  if (!S.isLocked) return;

  // Movement direction relative to CAMERA yaw
  _forward.set(0, 0, -1);
  _forward.applyAxisAngle(_yAxis, S.yaw);
  _right.set(1, 0, 0);
  _right.applyAxisAngle(_yAxis, S.yaw);

  _moveDir.set(0, 0, 0);
  if (S.keys['KeyW'] || S.keys['ArrowUp']) _moveDir.add(_forward);
  if (S.keys['KeyS'] || S.keys['ArrowDown']) _moveDir.sub(_forward);
  if (S.keys['KeyD'] || S.keys['ArrowRight']) _moveDir.add(_right);
  if (S.keys['KeyA'] || S.keys['ArrowLeft']) _moveDir.sub(_right);

  const isNowMoving = _moveDir.length() > 0.001;

  if (isNowMoving) {
    _moveDir.normalize().multiplyScalar(S.MOVE_SPEED * dt);

    // Avatar faces movement direction
    const targetYaw = Math.atan2(_moveDir.x, _moveDir.z) + Math.PI;
    let diff = targetYaw - S.avatarYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    S.avatarYaw += diff * 0.15;
  }

  // Collision check
  _testPos.set(S.playerPos.x + _moveDir.x, S.playerPos.y + S.PLAYER_HEIGHT, S.playerPos.z);
  if (!checkCollision(S, _testPos)) S.playerPos.x += _moveDir.x;

  _testPos.set(S.playerPos.x, S.playerPos.y + S.PLAYER_HEIGHT, S.playerPos.z + _moveDir.z);
  if (!checkCollision(S, _testPos)) S.playerPos.z += _moveDir.z;

  // Gravity
  if (!S.onGround) S.velocity.y -= S.GRAVITY * dt;
  S.playerPos.y += S.velocity.y * dt;
  if (S.playerPos.y <= 0) {
    S.playerPos.y = 0;
    S.velocity.y = 0;
    S.onGround = true;
  }

  // 3rd person camera
  _camTarget.set(S.playerPos.x, S.playerPos.y + S.PLAYER_HEIGHT * 0.85, S.playerPos.z);

  const camOffsetX = Math.sin(S.yaw) * S.CAM_DISTANCE;
  const camOffsetZ = Math.cos(S.yaw) * S.CAM_DISTANCE;
  const camY = S.playerPos.y + S.CAM_HEIGHT + Math.sin(-S.pitch) * 1.5;

  _camDesired.set(
    S.playerPos.x + camOffsetX,
    camY,
    S.playerPos.z + camOffsetZ
  );

  S.camera.position.lerp(_camDesired, S.CAM_LERP);
  S.camera.lookAt(_camTarget);

  // Portals
  checkPortalProximity(S);

  // Avatar
  updateAvatar(S, dt, isNowMoving);
}
