// avatar.js - VRM avatar loading, animation, position update
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

// ============================================================
// VRM Loader setup
// ============================================================
const vrmLoader = new GLTFLoader();
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));
vrmLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function loadVRM(url, onProgress) {
  return new Promise((resolve, reject) => {
    vrmLoader.load(url, resolve, onProgress || undefined, reject);
  });
}

// ============================================================
// Avatar state (module-local)
// ============================================================
let playerVrm = null;
let playerMixer = null;
let playerGroup = null;
let playerIsMoving = false;
let currentAnimId = '';
let currentAction = null;
const vrmAnims = {};

// ============================================================
// Load VRM avatar
// ============================================================
export async function loadPlayerAvatar(S, avatarConfig) {
  if (!avatarConfig?.vrm) return;

  try {
    const gltf = await loadVRM(avatarConfig.vrm, S._onProgress);
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      console.error('[ROOM] No VRM data found in:', avatarConfig.vrm);
      return;
    }

    // Optimize
    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.combineSkeletons(vrm.scene);

    // Setup
    playerVrm = vrm;
    playerMixer = new THREE.AnimationMixer(vrm.scene);

    // Create group for positioning
    playerGroup = new THREE.Group();

    // 追加
    S.avatarGroup = playerGroup;

    const scale = avatarConfig.scale || 1;
    vrm.scene.scale.set(scale, scale, scale);
    playerGroup.add(vrm.scene);
    S.scene.add(playerGroup);

    // Position at spawn
    const spawn = S.roomData.spawn || [0, 0, 0];
    playerGroup.position.set(spawn[0], spawn[1], spawn[2]);

    console.log(`[ROOM] VRM avatar loaded: ${avatarConfig.vrm}`);

    // Load animations
    if (avatarConfig.animations) {
      for (const [id, url] of Object.entries(avatarConfig.animations)) {
        try {
          const animGltf = await loadVRM(url);
          const vrmAnim = animGltf.userData.vrmAnimations?.[0];
          if (vrmAnim) {
            const _warn = console.warn;
            console.warn = () => {};
            vrmAnims[id] = createVRMAnimationClip(vrmAnim, vrm);
            console.warn = _warn;
            console.log(`[ROOM] Animation loaded: ${id}`);
          }
        } catch (e) {
          console.warn(`[ROOM] Failed to load animation ${id}:`, e);
        }
      }

      // Play idle by default
      if (vrmAnims.idle) {
        playAvatarAnim('idle');
      }
    }
  } catch (e) {
    console.error('[ROOM] Failed to load VRM:', e);
  }
}

// ============================================================
// Animation playback
// ============================================================
function playAvatarAnim(animId, fadeDuration = 0.3) {
  if (!playerMixer || !vrmAnims[animId] || currentAnimId === animId) return;

  const clip = vrmAnims[animId];
  const newAction = playerMixer.clipAction(clip);
  newAction.setLoop(THREE.LoopRepeat, Infinity);
  newAction.clampWhenFinished = false;
  newAction.reset();

  if (currentAction && currentAction !== newAction) {
    currentAction.fadeOut(fadeDuration);
    newAction.fadeIn(fadeDuration).play();
  } else {
    playerMixer.stopAllAction();
    newAction.fadeIn(fadeDuration).play();
  }

  currentAction = newAction;
  currentAnimId = animId;
}

// ============================================================
// Update avatar (called every frame from controls.js)
// ============================================================
export function updateAvatar(S, dt, isNowMoving) {
  if (!playerVrm || !playerGroup) return;

  // Update mixer
  if (playerMixer) playerMixer.update(dt);

  // Place avatar at player feet position
  playerGroup.position.set(S.playerPos.x, S.playerPos.y, S.playerPos.z);

  // Face movement direction
  playerGroup.rotation.y = S.avatarYaw;

  // Switch walk/idle animation
  if (isNowMoving !== playerIsMoving) {
    playerIsMoving = isNowMoving;
    if (playerIsMoving && vrmAnims.walk) {
      playAvatarAnim('walk');
    } else if (!playerIsMoving && vrmAnims.idle) {
      playAvatarAnim('idle');
    }
  }

  // Update VRM internals
  playerVrm.update(dt);
}


// ============================================================
// Dispose avatar (for room switching)
// ============================================================
export function disposeAvatar(S) {
  if (playerGroup) {
    S.scene.remove(playerGroup);
    playerGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  }
  playerVrm = null;
  playerMixer = null;
  playerGroup = null;
  playerIsMoving = false;
  currentAnimId = '';
  currentAction = null;
  S.avatarGroup = null;
  Object.keys(vrmAnims).forEach(k => delete vrmAnims[k]);
  console.log('[AVATAR] Disposed');
}
