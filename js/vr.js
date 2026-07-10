// vr.js - WebXR VR mode support
// Quest controller input, VR movement, session management
import * as THREE from 'three';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { updateAvatar } from './avatar.js';
import { checkCollision } from './controls.js';
import { toggleMenu } from './menu.js';

let vrActive = false;
let controller0 = null; // left
let controller1 = null; // right
let controllerGrip0 = null;
let controllerGrip1 = null;
let wasYPressed = false;  // debounce for Y button

// VR-specific movement state
const VR_STICK_DEADZONE = 0.15;
const VR_TURN_SPEED = 2.0;

// Pre-allocated objects for updateVR (avoid per-frame GC)
const _vrCamDir = new THREE.Vector3();
const _vrCamForward = new THREE.Vector3();
const _vrCamRight = new THREE.Vector3();
const _vrEuler = new THREE.Euler();
const _vrMoveDir = new THREE.Vector3();
const _vrTestPos = new THREE.Vector3();

// ============================================================
// Setup VR
// ============================================================
export function setupVR(S) {
  // Enable WebXR on renderer
  S.renderer.xr.enabled = true;

  // Create VR button and add to DOM
  const vrButton = XRButton.createButton(S.renderer, {
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hand-tracking'],
  });
  vrButton.id = 'vr-button';
  document.body.appendChild(vrButton);

  // Camera group for VR (move this group to move the player in VR)
  S.cameraGroup = new THREE.Group();
  S.cameraGroup.add(S.camera);
  S.scene.add(S.cameraGroup);

  // Controller setup - add to cameraGroup so they follow player
  const controllerModelFactory = new XRControllerModelFactory();

  controller0 = S.renderer.xr.getController(0);
  S.cameraGroup.add(controller0);

  controllerGrip0 = S.renderer.xr.getControllerGrip(0);
  controllerGrip0.add(controllerModelFactory.createControllerModel(controllerGrip0));
  S.cameraGroup.add(controllerGrip0);

  controller1 = S.renderer.xr.getController(1);
  S.cameraGroup.add(controller1);

  controllerGrip1 = S.renderer.xr.getControllerGrip(1);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  S.cameraGroup.add(controllerGrip1);

  // Ray visualizer for controllers
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -3),
  ]);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 });

  controller0.add(new THREE.Line(lineGeo.clone(), lineMat.clone()));
  controller1.add(new THREE.Line(lineGeo.clone(), lineMat.clone()));

  // Session events
  S.renderer.xr.addEventListener('sessionstart', () => {
    vrActive = true;
    console.log('[VR] Session started');

    const spawn = S.roomData?.spawn || [0, 0, 0];
    S.playerPos.set(spawn[0], spawn[1], spawn[2]);
    S.cameraGroup.position.set(spawn[0], spawn[1], spawn[2]);
  });

  S.renderer.xr.addEventListener('sessionend', () => {
    vrActive = false;
    console.log('[VR] Session ended');
  });
}

// ============================================================
// Check if VR is active
// ============================================================
export function isVRActive() {
  return vrActive;
}

// ============================================================
// Read VR controller inputs (called every frame)
// ============================================================
export function getVRInput(S) {
  const session = S.renderer.xr.getSession();
  if (!session) return null;

  const input = {
    stickX: 0,      // right stick X (turn)
    stickY: 0,      // right stick Y (unused for now)
    moveX: 0,       // left stick X (strafe)
    moveY: 0,       // left stick Y (forward/back)
    trigger: false,  // either trigger
    grip: false,     // either grip
    buttonA: false,  // A button (right)
    buttonB: false,  // B button (right)
    buttonX: false,  // X button (left)
    buttonY: false,  // Y button (left, menu)
  };

  for (const source of session.inputSources) {
    if (!source.gamepad) continue;
    const gp = source.gamepad;
    const hand = source.handedness;

    if (hand === 'left') {
      // Left stick: movement
      if (gp.axes.length >= 4) {
        input.moveX = -gp.axes[2];
        input.moveY = -gp.axes[3];
      } else if (gp.axes.length >= 2) {
        input.moveX = -gp.axes[0];
        input.moveY = -gp.axes[1];
      }
      // Left trigger
      if (gp.buttons[0]?.pressed) input.trigger = true;
      // Left grip
      if (gp.buttons[1]?.pressed) input.grip = true;
      // Y button (left upper)
      if (gp.buttons[5]?.pressed) input.buttonY = true;
      // X button (left lower)
      if (gp.buttons[4]?.pressed) input.buttonX = true;
    }

    if (hand === 'right') {
      // Right stick: turn
      if (gp.axes.length >= 4) {
        input.stickX = -gp.axes[2];
        input.stickY = -gp.axes[3];
      } else if (gp.axes.length >= 2) {
        input.stickX = -gp.axes[0];
        input.stickY = -gp.axes[1];
      }
      // Right trigger
      if (gp.buttons[0]?.pressed) input.trigger = true;
      // Right grip
      if (gp.buttons[1]?.pressed) input.grip = true;
      // B button (right upper)
      if (gp.buttons[5]?.pressed) input.buttonB = true;
      // A button (right lower)
      if (gp.buttons[4]?.pressed) input.buttonA = true;
    }
  }

  // Apply deadzone
  if (Math.abs(input.moveX) < VR_STICK_DEADZONE) input.moveX = 0;
  if (Math.abs(input.moveY) < VR_STICK_DEADZONE) input.moveY = 0;
  if (Math.abs(input.stickX) < VR_STICK_DEADZONE) input.stickX = 0;
  if (Math.abs(input.stickY) < VR_STICK_DEADZONE) input.stickY = 0;

  return input;
}

// ============================================================
// Update VR movement (ADV-style: camera direction based)
// ============================================================
export function updateVR(S, dt) {
  if (!vrActive) return;

  const vrInput = getVRInput(S);
  if (!vrInput) return;

  // Y button: toggle menu
  if (vrInput.buttonY && !wasYPressed) {
    toggleMenu();
  }
  wasYPressed = vrInput.buttonY;

  // ── 1. Movement direction based on VR camera (headset) direction ──
  const camera = S.renderer.xr.getCamera();
  camera.getWorldDirection(_vrCamDir);
  const currentFacingAngle = Math.atan2(_vrCamDir.x, _vrCamDir.z);

  _vrEuler.set(0, currentFacingAngle, 0);

  _vrCamForward.set(0, 0, -1).applyEuler(_vrEuler).normalize();
  _vrCamRight.set(1, 0, 0).applyEuler(_vrEuler).normalize();

  _vrMoveDir.set(0, 0, 0);
  const isMoving = Math.abs(vrInput.moveX) > 0 || Math.abs(vrInput.moveY) > 0;

  if (isMoving) {
    // Left stick Y: forward/back (WebXR: pull back = positive, so negate)
    if (Math.abs(vrInput.moveY) > 0) {
      _vrMoveDir.addScaledVector(_vrCamForward, -vrInput.moveY);
    }
    // Left stick X: strafe
    if (Math.abs(vrInput.moveX) > 0) {
      _vrMoveDir.addScaledVector(_vrCamRight, vrInput.moveX);
    }
    _vrMoveDir.normalize();

    // Avatar faces movement direction
    S.avatarYaw = Math.atan2(_vrMoveDir.x, _vrMoveDir.z) + Math.PI;
  }

  // Apply movement with collision check
  if (isMoving) {
    // Try move X
    _vrTestPos.set(
      S.playerPos.x + _vrMoveDir.x * S.MOVE_SPEED * dt,
      S.playerPos.y + S.PLAYER_HEIGHT,
      S.playerPos.z
    );
    if (!checkCollision(S, _vrTestPos)) {
      S.playerPos.x += _vrMoveDir.x * S.MOVE_SPEED * dt;
    }

    // Try move Z
    _vrTestPos.set(
      S.playerPos.x,
      S.playerPos.y + S.PLAYER_HEIGHT,
      S.playerPos.z + _vrMoveDir.z * S.MOVE_SPEED * dt
    );
    if (!checkCollision(S, _vrTestPos)) {
      S.playerPos.z += _vrMoveDir.z * S.MOVE_SPEED * dt;
    }
  }

  // ── 2. Camera group follows player (ADV-style) ──
  if (S.cameraGroup) {
    S.cameraGroup.position.x = S.playerPos.x;
    S.cameraGroup.position.z = S.playerPos.z;
    S.cameraGroup.position.y = S.playerPos.y;
  }

  // ── 3. Update VRM avatar ──
  updateAvatar(S, dt, isMoving);
}
