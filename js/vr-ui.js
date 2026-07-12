// vr-ui.js - Reusable VR 3D hint display
// Shows a canvas-based sprite at a world position.
// Usage:
//   initVRHint(scene)          — call once after scene is ready
//   showVRHint(pos, text)      — show hint at world position
//   hideVRHint()               — hide hint
//   disposeVRHint()            — cleanup on room dispose

import * as THREE from 'three';

let hintSprite = null;
let currentText = '';

// ============================================================
// Canvas texture generation
// ============================================================
function createHintCanvas(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  // Rounded rect background
  const r = 10;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(canvas.width - r, 0);
  ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r);
  ctx.lineTo(canvas.width, canvas.height - r);
  ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height);
  ctx.lineTo(r, canvas.height);
  ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fill();

  // Border
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#00ff88';
  ctx.font = 'bold 26px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  return canvas;
}

// ============================================================
// Public API
// ============================================================

const _hintOffset = new THREE.Vector3(0, 1.8, 0);

export function initVRHint(scene) {
  if (hintSprite) return;

  const canvas = createHintCanvas('');
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  hintSprite = new THREE.Sprite(material);
  hintSprite.scale.set(1.6, 0.4, 1);
  hintSprite.visible = false;
  scene.add(hintSprite);
}

/**
 * Show hint sprite above a world position.
 * @param {THREE.Vector3} worldPos - base position (e.g. portal center)
 * @param {string} text - label text, e.g. '[A] ENTER'
 * @param {THREE.Vector3} [offset] - optional offset from worldPos (default: y+3.2)
 */
export function showVRHint(worldPos, text, offset) {
  if (!hintSprite) return;

  // Update texture only when text changes
  if (text !== currentText) {
    const canvas = createHintCanvas(text);
    hintSprite.material.map.image = canvas;
    hintSprite.material.map.needsUpdate = true;
    currentText = text;
  }

  const off = offset || _hintOffset;
  hintSprite.position.set(
    worldPos.x + off.x,
    worldPos.y + off.y,
    worldPos.z + off.z,
  );
  hintSprite.visible = true;
}

export function hideVRHint() {
  if (!hintSprite) return;
  hintSprite.visible = false;
}

export function disposeVRHint() {
  if (!hintSprite) return;
  hintSprite.material.map.dispose();
  hintSprite.material.dispose();
  hintSprite.parent?.remove(hintSprite);
  hintSprite = null;
  currentText = '';
}
