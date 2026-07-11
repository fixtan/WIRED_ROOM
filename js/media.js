// media.js - Image, video, credit board, and VRM figurine placement in 3D space
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation';
import Dexie from 'dexie';
import { PORTAL_COLORS } from '../config.js';
import { addMenuItem } from './menu.js';
import { createPortalEffect, updatePortalAnimations, removePortalAnimation } from './portal-effect.js';


// VRM loader for figurines
const figurineLoader = new GLTFLoader();
figurineLoader.register((parser) => new VRMLoaderPlugin(parser));
figurineLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    figurineLoader.load(url, resolve, undefined, reject);
  });
}

// Pose files (built-in + custom, loaded dynamically)
const BUILTIN_POSES = Array.from({ length: 25 }, (_, i) =>
  `./assets/pose/${String(i + 1).padStart(2, '0')}.vrma`
);

let poseList = []; // { url, isCustom?, idbKey? } — rebuilt on init

const db = new Dexie('RoomDB');
db.version(1).stores({ assets: '' });

let stateRef = null;
let mediaItems = [];       // { id, type, mesh, data }
let selectedMedia = null;
let mediaPanel = null;
let isLoadingMedia = false;// 追加

// ============================================================
// Init media system
// ============================================================
export async function setupMedia(S) {
  stateRef = S;

  // Build pose list: built-in + custom from IndexedDB
  await buildPoseList();

  createMediaPanel();

  addMenuItem({ divider: true });

  // MENU: イメージ
  addMenuItem({
    id: 'add-image',
    label: 'Add Image',
    icon: '🖼️',
    action: () => pickFile('image'),
  });

  // MENU: ビデオ
  addMenuItem({
    id: 'add-video',
    label: 'Add Video',
    icon: '🎬',
    action: () => pickFile('video'),
  });

  // MENU: クレジットボード
  addMenuItem({
    id: 'show-credits',
    label: 'Credit Board',
    icon: '📜',
    action: () => createCreditBoard(),
  });

  // MENU: AVATER
  addMenuItem({
    id: 'add-figurine',
    label: 'Add My Avatar',
    icon: '🧍',
    action: () => placeFigurine(`figurine_${Date.now()}`),
  });

  // MENU: ポータル
  addMenuItem({
    id: 'add-portal',
    label: 'Add Portal',
    icon: '🌀',
    action: () => {
      placePortal(`portal_${Date.now()}`, null, '', 'global');
    },
  });

  // Load saved media from localStorage
  //loadSavedMedia();
  if (!S.isPublicMode) {
    loadSavedMedia();
  }

  // Click to select media (raycaster)
  setupMediaRaycaster();
}

// ============================================================
// File picker
// ============================================================
function pickFile(type) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = type === 'image' ? 'image/*' : 'video/mp4,video/webm';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const id = `media_${Date.now()}`;

    if (type === 'image') {
      const dataUrl = await fileToDataURL(file);
      await db.assets.put(dataUrl, id);
      placeImage(id, dataUrl);
    } else {
      // Video: save as blob, create object URL
      const arrayBuffer = await file.arrayBuffer();
      await db.assets.put(arrayBuffer, id);
      const blob = new Blob([arrayBuffer], { type: file.type });
      const blobUrl = URL.createObjectURL(blob);
      placeVideo(id, blobUrl);
    }

    saveMediaList();
  });
  input.click();
}

function fileToDataURL(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// ============================================================
// Place image
// ============================================================
function placeImage(id, dataUrl, savedData) {
  const tex = new THREE.TextureLoader().load(dataUrl, (texture) => {
    // Calculate aspect ratio
    const aspect = texture.image.width / texture.image.height;
    const height = 1.2;
    const width = height * aspect;

    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    mat.toneMapped = false;  // ← これ追加
    const mesh = new THREE.Mesh(geo, mat);

    // Default position: center of room, wall height
    const pos = savedData?.pos || [0, 1.5, 0];
    const rot = savedData?.rot || [0, 0, 0];
    const scale = savedData?.scale || 1;

    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2])
    );
    mesh.scale.setScalar(scale);

    mesh.userData = { mediaId: id, type: 'image', label: savedData?.label || '', url: savedData?.url || '' };
    stateRef.scene.add(mesh);

    const item = { id, type: 'image', mesh, data: { pos, rot, scale, label: savedData?.label || '', url: savedData?.url || '' } };
    mediaItems.push(item);

    // Auto-select newly placed item
    if (!savedData) {
      selectMedia(item);
      showMediaPanel();
    }
  });
}

// ============================================================
// Place video
// ============================================================
function placeVideo(id, blobUrl, savedData) {
  const video = document.createElement('video');
  video.src = blobUrl;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.play();

  video.addEventListener('loadedmetadata', () => {
    const aspect = video.videoWidth / video.videoHeight;
    const height = 1.2;
    const width = height * aspect;

    const tex = new THREE.VideoTexture(video);
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.DoubleSide,
    });
    mat.toneMapped = false;  // ← これ追加
    const mesh = new THREE.Mesh(geo, mat);

    const pos = savedData?.pos || [0, 1.5, 0];
    const rot = savedData?.rot || [0, 0, 0];
    const scale = savedData?.scale || 1;

    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2])
    );
    mesh.scale.setScalar(scale);

    mesh.userData = { mediaId: id, type: 'video', video, label: savedData?.label || '', url: savedData?.url || '' };
    stateRef.scene.add(mesh);

    const item = { id, type: 'video', mesh, video, data: { pos, rot, scale, label: savedData?.label || '', url: savedData?.url || '' } };
    mediaItems.push(item);

    if (!savedData) {
      selectMedia(item);
      showMediaPanel();
    }
  });
}

// ============================================================
// Credit board
// ============================================================
function createCreditBoard(isLoading = false) {
  // Get credit info from config
  const config = JSON.parse(localStorage.getItem('room_config') || '{}');
  const meta = config.roomMeta || {};
  const roomName = meta.name || config.roomName || 'Room';
  const author = meta.author || '';
  const license = meta.license || '';
  const creditList = meta.creditList || '';

  // Build credit text
  let lines = [`── ${roomName} ──`, ''];
  if (author) lines.push(`Room by: ${author}`);
  if (license) lines.push(`License: ${license}`);
  if (creditList) {
    lines.push('', '── Credits ──', '');
    lines = lines.concat(creditList.split('\n').filter(l => l.trim()));
  }

  // Canvas rendering
  const canvas = document.createElement('canvas');
  const lineHeight = 28;
  const padding = 30;
  canvas.width = 512;
  canvas.height = Math.max(256, lines.length * lineHeight + padding * 2);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = 'rgba(10, 10, 10, 0.9)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);

  // Text
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

  // Create mesh
  const aspect = canvas.width / canvas.height;
  const height = 1.5;
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geo, mat);

  // Check if credit board already exists, remove old one
  const existingIdx = mediaItems.findIndex(m => m.type === 'credit');
  if (existingIdx >= 0) {
    stateRef.scene.remove(mediaItems[existingIdx].mesh);
    mediaItems.splice(existingIdx, 1);
  }

  mesh.position.set(0, 1.5, -2);
  mesh.userData = { mediaId: 'credit_board', type: 'credit' };
  stateRef.scene.add(mesh);

  const item = { id: 'credit_board', type: 'credit', mesh, data: { pos: [0, 1.5, -2], rot: [0, 0, 0], scale: 1 } };
  mediaItems.push(item);

  if (!isLoading) {
    selectMedia(item);
    showMediaPanel();
    saveMediaList();
  }

  console.log('[MEDIA] Credit board created');
}

// ============================================================
// Pose list management
// ============================================================
async function buildPoseList() {
  // Start with built-in poses
  poseList = BUILTIN_POSES.map(url => ({ url }));

  // Load custom poses from IndexedDB
  try {
    const allKeys = await db.assets.toCollection().keys();
    const poseKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('pose_custom_'));
    for (const key of poseKeys) {
      const data = await db.assets.get(key);
      if (data) {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        poseList.push({ url, isCustom: true, idbKey: key });
      }
    }
  } catch (e) {
    console.warn('[MEDIA] Failed to load custom poses:', e);
  }

  console.log(`[MEDIA] Pose list: ${poseList.length} poses (${poseList.length - BUILTIN_POSES.length} custom)`);
}

async function addCustomPose() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.vrma';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const key = `pose_custom_${Date.now()}`;
    const arrayBuffer = await file.arrayBuffer();
    await db.assets.put(arrayBuffer, key);

    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    poseList.push({ url, isCustom: true, idbKey: key });

    // Apply new pose to current figurine
    if (selectedMedia?.type === 'figurine') {
      const newIndex = poseList.length - 1;
      await applyFigurinePose(selectedMedia, newIndex);
      mediaPanel.querySelector('#md-pose-val').textContent = newIndex + 1;
    }

    console.log(`[MEDIA] Custom pose added: ${file.name} (${key})`);
  });
  input.click();
}




// ============================================================
// Place Portal (WavyRing effect)　ポータル
// ============================================================
function placePortal(id, savedData, url, label) {
  const portalType = savedData?.portalType || (label === 'friend' ? 'friend' : 'global');

  const { group } = createPortalEffect(portalType);

  // Position
  const pos = savedData?.pos || [stateRef.playerPos.x, 0, stateRef.playerPos.z];
  const rot = savedData?.rot || [0, 0, 0];
  const scale = savedData?.scale || 1;
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.y = THREE.MathUtils.degToRad(rot[1] || 0);
  group.scale.setScalar(scale);

  const portalUrl = savedData?.url || url || '';
  const portalLabel = savedData?.label || label || portalUrl;
  group.userData = { mediaId: id, type: 'portal', url: portalUrl, label: portalLabel, portalType };

  stateRef.scene.add(group);
  stateRef.portalMeshes.push(group);

  const item = {
    id, type: 'portal', mesh: group,
    data: { pos, rot, scale, url: portalUrl, label: portalLabel, portalType },
  };
  mediaItems.push(item);

  if (!savedData) {
    selectMedia(item);
    showMediaPanel();
    saveMediaList();
  }

  console.log(`[MEDIA] Portal placed: ${portalLabel} → ${portalUrl}`);
}



// ============================================================
// Place VRM figurine (max 1)
// ============================================================
async function placeFigurine(id, savedData) {
  // Limit to 1 figurine: remove existing
  const existing = mediaItems.find(m => m.type === 'figurine');
  if (existing) {
    if (!savedData) {
      // User clicked "Add My Avatar" again — replace
      deleteMedia(existing);
    } else {
      // Loading from save — skip if already exists
      return;
    }
  }
  // Get VRM path from current config (same avatar as player)
  const config = JSON.parse(localStorage.getItem('room_config') || '{}');
  let vrmPath = './assets/avatar/avater1.vrm';
  if (config.avatarId === 'avater2') {
    vrmPath = './assets/avatar/avater2.vrm';
  } else if (config.avatarId === 'custom') {
    // Load custom VRM from IndexedDB
    const data = await db.assets.get('custom_vrm');
    if (data) {
      const blob = new Blob([data], { type: 'application/octet-stream' });
      vrmPath = URL.createObjectURL(blob);
    }
  }

  try {
    const gltf = await loadGLTF(vrmPath);
    const vrm = gltf.userData.vrm;
    if (!vrm) { console.error('[MEDIA] No VRM data'); return; }

    VRMUtils.removeUnnecessaryVertices(vrm.scene);
    VRMUtils.removeUnnecessaryJoints(vrm.scene);

    // Create group
    const group = new THREE.Group();
    group.add(vrm.scene);

    // Position
    const pos = savedData?.pos || [0, 0, 0];
    const rot = savedData?.rot || [0, 0, 0];
    const scale = savedData?.scale || 1;
    const poseIndex = savedData?.poseIndex || 0;

    group.position.set(pos[0], pos[1], pos[2]);
    group.rotation.set(
      THREE.MathUtils.degToRad(rot[0]),
      THREE.MathUtils.degToRad(rot[1]),
      THREE.MathUtils.degToRad(rot[2])
    );
    group.scale.setScalar(scale);

    group.userData = { mediaId: id, type: 'figurine', label: savedData?.label || '', url: savedData?.url || '' };
    stateRef.scene.add(group);

    const item = {
      id, type: 'figurine', mesh: group, vrm,
      data: { pos, rot, scale, poseIndex, label: savedData?.label || '', url: savedData?.url || '' },
    };
    mediaItems.push(item);

    // Apply pose
    await applyFigurinePose(item, poseIndex);

    if (!savedData) {
      selectMedia(item);
      showMediaPanel();
    }

    console.log(`[MEDIA] Figurine placed: ${id} (pose ${poseIndex + 1})`);
  } catch (e) {
    console.error('[MEDIA] Failed to place figurine:', e);
  }
}

async function applyFigurinePose(item, poseIndex) {
  if (!item.vrm || poseIndex < 0 || poseIndex >= poseList.length) return;

  try {
    const poseGltf = await loadGLTF(poseList[poseIndex].url);
    const vrmAnim = poseGltf.userData.vrmAnimations?.[0];
    if (!vrmAnim) return;

    const clip = createVRMAnimationClip(vrmAnim, item.vrm);
    const mixer = new THREE.AnimationMixer(item.vrm.scene);
    const action = mixer.clipAction(clip);
    action.play();

    // Advance one frame to apply pose, then stop
    mixer.update(0.016);
    action.paused = true;

    // Update VRM internals
    item.vrm.update(0);

    item.data.poseIndex = poseIndex;
  } catch (e) {
    console.warn(`[MEDIA] Failed to apply pose ${poseIndex}:`, e);
  }
}

// ============================================================
// Media selection (raycaster click)
// ============================================================
const mediaRaycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

function setupMediaRaycaster() {
  document.addEventListener('dblclick', (e) => {
    if (stateRef.isLocked) return; // only when pointer is free
    if (stateRef.isPublicMode) return;  // ← この1行追加

    mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;

    mediaRaycaster.setFromCamera(mouseVec, stateRef.camera);

    const meshes = mediaItems.map(m => m.mesh);
    const hits = mediaRaycaster.intersectObjects(meshes, true); // true: recurse into Groups (figurines)

    if (hits.length > 0) {
      const hitObj = hits[0].object;
      // Find which mediaItem owns this object (direct mesh or ancestor group)
      const item = mediaItems.find(m => {
        if (m.mesh === hitObj) return true;
        // Check if hitObj is a descendant of the group (figurine)
        let parent = hitObj.parent;
        while (parent) {
          if (parent === m.mesh) return true;
          parent = parent.parent;
        }
        return false;
      });
      if (item) {
        selectMedia(item);
        showMediaPanel();
      }
    }
  });
}

function selectMedia(item) {
  // Remove old selection highlight (only for Mesh, not Group/figurine)
  if (selectedMedia?.mesh?.material?.color) {
    selectedMedia.mesh.material.color.set(0xffffff);
  }
  selectedMedia = item;
}

import { MEDIA_MOVE_STEP, MEDIA_ROT_STEP, MEDIA_SCALE_STEP } from '../config.js';


// ============================================================
// Media adjustment panel
// ============================================================
function createMediaPanel() {
  mediaPanel = document.createElement('div');
  mediaPanel.id = 'media-panel';
  mediaPanel.style.display = 'none';
  mediaPanel.innerHTML = `
    <div class="editor-header">
      <span>MEDIA ADJUST</span>
      <button id="media-close">✕</button>
    </div>
    <div class="editor-body">
      <div class="editor-group">
        <label>Pos X</label>
        <input type="range" id="md-posX" min="-10" max="10" step="${MEDIA_MOVE_STEP}" value="0" />
        <span id="md-posX-val">0</span>
      </div>
      <div class="editor-group">
        <label>Pos Y</label>
        <input type="range" id="md-posY" min="-1" max="5" step="${MEDIA_MOVE_STEP}" value="1.5" />
        <span id="md-posY-val">1.5</span>
      </div>
      <div class="editor-group">
        <label>Pos Z</label>
        <input type="range" id="md-posZ" min="-10" max="10" step="${MEDIA_MOVE_STEP}" value="0" />
        <span id="md-posZ-val">0</span>
      </div>
      <div class="editor-group">
        <label>Rot Y</label>
        <input type="range" id="md-rotY" min="0" max="360" step="${MEDIA_ROT_STEP}" value="0" />
        <span id="md-rotY-val">0</span>
      </div>
      <div class="editor-group">
        <label>Scale</label>
        <input type="range" id="md-scale" min="0.1" max="5" step="${MEDIA_SCALE_STEP}" value="1" />
        <span id="md-scale-val">1</span>
      </div>
      <div class="info-field" style="margin-top:8px;">
        <label>Label</label>
        <input type="text" id="md-label" placeholder="Work title" maxlength="64" />
      </div>
      <div class="info-field">
        <label>Link URL</label>
        <input type="text" id="md-url" placeholder="https://booth.pm/..." maxlength="200" />
      </div>
      <div id="md-pose-group" class="editor-group" style="display:none;">
        <label>Pose</label>
        <button id="md-pose-prev" style="width:32px;">◀</button>
        <span id="md-pose-val" style="margin:0 8px;">1</span>
        <button id="md-pose-next" style="width:32px;">▶</button>
        <button id="md-pose-add" style="width:32px; margin-left:4px;" title="Add custom .vrma">＋</button>
      </div>
      <div class="editor-actions">
        <button id="md-save">💾 Save</button>
        <button id="md-delete">🗑️ Delete</button>
      </div>
    </div>
  `;
  document.body.appendChild(mediaPanel);

  // Close
  mediaPanel.querySelector('#media-close').addEventListener('click', hideMediaPanel);

  // Save
  mediaPanel.querySelector('#md-save').addEventListener('click', () => {
    saveCurrentMedia();
    saveMediaList();
    alert('Media saved!');
  });

  // Delete
  mediaPanel.querySelector('#md-delete').addEventListener('click', () => {
    if (selectedMedia && confirm('Delete this media?')) {
      deleteMedia(selectedMedia);
      hideMediaPanel();
    }
  });

  // Slider events
  const ids = ['md-posX', 'md-posY', 'md-posZ', 'md-rotY', 'md-scale'];
  for (const id of ids) {
    const slider = mediaPanel.querySelector(`#${id}`);
    slider.addEventListener('input', () => {
      mediaPanel.querySelector(`#${id}-val`).textContent = slider.value;
      applyMediaSliders();
    });
  }

  // Pose prev/next/add buttons
  mediaPanel.querySelector('#md-pose-prev').addEventListener('click', () => {
    if (!selectedMedia || selectedMedia.type !== 'figurine') return;
    const cur = selectedMedia.data.poseIndex || 0;
    const next = (cur - 1 + poseList.length) % poseList.length;
    applyFigurinePose(selectedMedia, next);
    mediaPanel.querySelector('#md-pose-val').textContent = next + 1;
  });
  mediaPanel.querySelector('#md-pose-next').addEventListener('click', () => {
    if (!selectedMedia || selectedMedia.type !== 'figurine') return;
    const cur = selectedMedia.data.poseIndex || 0;
    const next = (cur + 1) % poseList.length;
    applyFigurinePose(selectedMedia, next);
    mediaPanel.querySelector('#md-pose-val').textContent = next + 1;
  });
  mediaPanel.querySelector('#md-pose-add').addEventListener('click', () => {
    addCustomPose();
  });
}

function showMediaPanel() {
  if (!selectedMedia) return;
  mediaPanel.style.display = 'block';

  const d = selectedMedia.data || {};
  setMediaSlider('md-posX', d.pos?.[0] || 0);
  setMediaSlider('md-posY', d.pos?.[1] || 1.5);
  setMediaSlider('md-posZ', d.pos?.[2] || 0);
  setMediaSlider('md-rotY', d.rot?.[1] || 0);
  setMediaSlider('md-scale', d.scale || 1);
  mediaPanel.querySelector('#md-label').value = d.label || '';
  mediaPanel.querySelector('#md-url').value = d.url || '';

  // Show pose selector only for figurines
  const poseGroup = mediaPanel.querySelector('#md-pose-group');
  if (selectedMedia.type === 'figurine') {
    poseGroup.style.display = '';
    mediaPanel.querySelector('#md-pose-val').textContent = (d.poseIndex || 0) + 1;
  } else {
    poseGroup.style.display = 'none';
  }
}

function hideMediaPanel() {
  mediaPanel.style.display = 'none';
  selectedMedia = null;
}

function setMediaSlider(id, value) {
  const slider = mediaPanel.querySelector(`#${id}`);
  const span = mediaPanel.querySelector(`#${id}-val`);
  if (slider) slider.value = value;
  if (span) span.textContent = Number(value).toFixed(2);
}

function applyMediaSliders() {
  if (!selectedMedia?.mesh) return;

  const posX = parseFloat(mediaPanel.querySelector('#md-posX').value);
  const posY = parseFloat(mediaPanel.querySelector('#md-posY').value);
  const posZ = parseFloat(mediaPanel.querySelector('#md-posZ').value);
  const rotY = parseFloat(mediaPanel.querySelector('#md-rotY').value);
  const scale = parseFloat(mediaPanel.querySelector('#md-scale').value);

  selectedMedia.mesh.position.set(posX, posY, posZ);
  selectedMedia.mesh.rotation.y = THREE.MathUtils.degToRad(rotY);
  selectedMedia.mesh.scale.setScalar(scale);

  selectedMedia.data.pos = [posX, posY, posZ];
  selectedMedia.data.rot = [0, rotY, 0];
  selectedMedia.data.scale = scale;
}

function saveCurrentMedia() {
  if (!selectedMedia) return;
  selectedMedia.data.label = mediaPanel.querySelector('#md-label').value.trim();
  selectedMedia.data.url = mediaPanel.querySelector('#md-url').value.trim();
  selectedMedia.mesh.userData.label = selectedMedia.data.label;
  selectedMedia.mesh.userData.url = selectedMedia.data.url;
}

// ============================================================
// Delete media
// ============================================================
function deleteMedia(item) {
  stateRef.scene.remove(item.mesh);
  if (item.type === 'figurine') {
    // Dispose VRM scene tree
    item.mesh.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
        else child.material.dispose();
      }
    });
  } else {
    if (item.mesh.geometry) item.mesh.geometry.dispose();
    if (item.mesh.material) item.mesh.material.dispose();
  }
  if (item.video) { item.video.pause(); item.video.src = ''; }

  const idx = mediaItems.indexOf(item);
  if (idx >= 0) mediaItems.splice(idx, 1);

  // Remove from IndexedDB
  db.assets.delete(item.id).catch(() => {});

  selectedMedia = null;
  saveMediaList();
  console.log(`[MEDIA] Deleted: ${item.id}`);
}

// ============================================================
// Save/Load media list
// ============================================================
function saveMediaList() {
  if (isLoadingMedia) return;  // ロード中は絶対に保存しない
  const list = mediaItems.map(item => {
    const entry = {
      id: item.id,
      type: item.type,
      pos: item.data.pos,
      rot: item.data.rot,
      scale: item.data.scale,
      label: item.data.label || '',
      url: item.data.url || '',
    };
    // フィギュア
    if (item.type === 'figurine') {
      entry.poseIndex = item.data.poseIndex || 0;
    }
    // ポータル
    if (item.type === 'portal') {
      entry.url = item.data.url || '';
      entry.label = item.data.label || '';
    }

    return entry;
  });
  localStorage.setItem('room_media', JSON.stringify(list));
}

async function loadSavedMedia() {
  const saved = localStorage.getItem('room_media');
  if (!saved) return;

  isLoadingMedia = true;  // ← ガード開始

  try {
    const list = JSON.parse(saved);
    for (const item of list) {
      if (item.type === 'image') {
        const dataUrl = await db.assets.get(item.id);
        if (dataUrl) placeImage(item.id, dataUrl, item);
      } else if (item.type === 'video') {
        const arrayBuffer = await db.assets.get(item.id);
        if (arrayBuffer) {
          const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          placeVideo(item.id, blobUrl, item);
        }
      } else if (item.type === 'figurine') {
        await placeFigurine(item.id, item);
      } else if (item.type === 'portal') {
        placePortal(item.id, item, item.url, item.label);
      } else if (item.type === 'credit') {
        createCreditBoard();
        const creditItem = mediaItems.find(m => m.type === 'credit');
        if (creditItem) {
          creditItem.mesh.position.set(item.pos[0], item.pos[1], item.pos[2]);
          creditItem.mesh.rotation.y = THREE.MathUtils.degToRad(item.rot?.[1] || 0);
          creditItem.mesh.scale.setScalar(item.scale || 1);
          creditItem.data = { ...item };
        }
        hideMediaPanel();
      }
    }
  } catch (e) {
    console.error('[MEDIA] Failed to load saved media:', e);
  }
  isLoadingMedia = false;  // ← ガード解除
}
