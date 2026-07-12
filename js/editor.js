// editor.js - Room upload, adjustment sliders
import Dexie from 'dexie';
import { addMenuItem } from './menu.js';

const db = new Dexie('RoomDB');
db.version(1).stores({
  assets: '',
});

let editorPanel = null;
let isEditorOpen = false;
let stateRef = null;
let currentSliders = {};

// ============================================================
// Init editor (add menu items)
// ============================================================
export function setupEditor(S) {
  stateRef = S;

  // Create editor panel
  createEditorPanel();

  // Add menu items
  addMenuItem({ divider: true });

  addMenuItem({
    id: 'add-custom-room',
    label: 'Add Custom Room',
    icon: '📦',
    action: () => openGLBPicker(),
  });

  addMenuItem({
    id: 'adjust-room',
    label: 'Adjust Room',
    icon: '📐',
    action: () => toggleEditor(),
  });
}

// ============================================================
// GLB file picker → info form → save
// ============================================================
function openGLBPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.glb';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const key = `custom_room_${file.name.replace(/\.glb$/i, '')}`;
    const name = file.name.replace(/\.glb$/i, '').replace(/[_-]/g, ' ');
    const fileSize = (file.size / (1024 * 1024)).toFixed(1) + 'MB';

    // Auto-extract stats by loading GLB temporarily
    let triangles = 0, vertices = 0;
    try {
      const { loadGLB } = await import('./room-loader.js');
      const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
      const blobUrl = URL.createObjectURL(blob);
      const gltf = await loadGLB(blobUrl);
      gltf.scene.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const geo = child.geometry;
          if (geo.index) {
            triangles += Math.floor(geo.index.count / 3);
          } else {
            triangles += Math.floor(geo.attributes.position.count / 3);
          }
          vertices += geo.attributes.position.count;
        }
      });
      URL.revokeObjectURL(blobUrl);
      // Remove from scene (it was only for counting)
      gltf.scene.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    } catch (e) {
      console.warn('[EDITOR] Could not auto-extract stats:', e);
    }

    // Show info form
    showRoomInfoForm({
      key, name, fileSize, triangles, vertices, arrayBuffer,
    });
  });
  input.click();
}

// ============================================================
// Room Info Form (modal)
// ============================================================
function showRoomInfoForm(data) {
  // Remove existing form if any
  const existing = document.getElementById('room-info-form');
  if (existing) existing.remove();

  const form = document.createElement('div');
  form.id = 'room-info-form';
  form.innerHTML = `
    <div class="info-form-container">
      <h3>ROOM INFO</h3>
      <div class="info-field">
        <label>Name</label>
        <input type="text" id="rif-name" value="${data.name}" maxlength="64" />
      </div>
      <div class="info-field">
        <label>Author</label>
        <input type="text" id="rif-author" placeholder="Creator name" maxlength="64" />
      </div>
      <div class="info-field">
        <label>Description</label>
        <input type="text" id="rif-desc" placeholder="(optional)" maxlength="200" />
      </div>
      <div class="info-field">
        <label>License</label>
        <select id="rif-license">
          <option value="CC-BY-4.0">CC Attribution</option>
          <option value="Free Standard">Free Standard</option>
          <option value="CC0">CC0 (Public Domain)</option>
          <option value="Original">Original Work</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="info-field">
        <label>Source URL</label>
        <input type="text" id="rif-url" placeholder="https://..." maxlength="200" />
      </div>
      <div class="info-field">
        <label>Credit List</label>
        <textarea id="rif-credits" placeholder="Furniture credits (one per line)" rows="3"></textarea>
      </div>
      <div class="info-stats">
        Triangles: ${data.triangles.toLocaleString()} / Vertices: ${data.vertices.toLocaleString()} / Size: ${data.fileSize}
      </div>
      <div class="info-actions">
        <button id="rif-cancel">Cancel</button>
        <button id="rif-save">Save & Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(form);

  // Cancel
  form.querySelector('#rif-cancel').addEventListener('click', () => {
    form.remove();
  });

  // Save
  form.querySelector('#rif-save').addEventListener('click', async () => {
    const roomMeta = {
      id: data.key,
      name: form.querySelector('#rif-name').value.trim() || data.name,
      author: form.querySelector('#rif-author').value.trim() || '',
      description: form.querySelector('#rif-desc').value.trim() || '',
      license: form.querySelector('#rif-license').value,
      url: form.querySelector('#rif-url').value.trim() || '',
      creditList: form.querySelector('#rif-credits').value.trim() || '',
      fileSize: data.fileSize,
      triangles: data.triangles,
      vertices: data.vertices,
      timestamp: Date.now(),
    };

    // Save GLB data to IndexedDB
    await db.assets.put(data.arrayBuffer, data.key);

    // Save metadata to IndexedDB (separate key)
    await db.assets.put(roomMeta, `meta_${data.key}`);

    console.log(`[EDITOR] Custom room saved: ${roomMeta.name} (${data.fileSize})`);

    // Build config
    const prevConfig = localStorage.getItem('room_config');
    const prev = prevConfig ? JSON.parse(prevConfig) : {};

    const config = {
      roomName: roomMeta.name,
      roomId: data.key,
      roomFile: data.key,
      roomDefaults: {
        scale: 1,
        pos: [0, 0, 0],
        rot: [0, 0, 0],
        spawn: [0, 0, 0],
      },
      avatarId: prev.avatarId || 'avater1',
      skyPreset: prev.skyPreset || 'night',
      isCustomGLB: true,
      customGLBKey: data.key,
      customGLBName: roomMeta.name,
      customGLBSize: data.fileSize,
      roomMeta: roomMeta,
      timestamp: Date.now(),
    };

    localStorage.setItem('room_config', JSON.stringify(config));

    form.remove();
    location.reload();
  });
}

// ============================================================
// Load all custom room metadata from IndexedDB
// ============================================================
export async function loadCustomRoomList() {
  try {
    const allKeys = await db.assets.toCollection().keys();
    const metaKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('meta_custom_room_'));
    const rooms = [];
    for (const mk of metaKeys) {
      const meta = await db.assets.get(mk);
      if (meta) rooms.push(meta);
    }
    return rooms;
  } catch (e) {
    console.error('[EDITOR] Failed to load custom room list:', e);
    return [];
  }
}

// ============================================================
// Edit Room Info (called from menu)
// ============================================================
export async function showEditRoomInfo(S) {
  // Load existing metadata
  const configStr = localStorage.getItem('room_config');
  const config = configStr ? JSON.parse(configStr) : {};
  let existingMeta = config.roomMeta || {};

  // Try loading from IndexedDB (persists across reset)
  try {
    const metaKey = config.customGLBKey
      ? `meta_${config.customGLBKey}`
      : `meta_room_${config.roomId || 'default'}`;
    const meta = await db.assets.get(metaKey);
    if (meta) existingMeta = { ...meta, ...existingMeta };
  } catch (e) { /* use config.roomMeta */ }

  // Get stats from current scene
  let triangles = 0, vertices = 0;
  if (S.roomModel) {
    S.roomModel.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry;
        if (geo.index) triangles += Math.floor(geo.index.count / 3);
        else triangles += Math.floor(geo.attributes.position.count / 3);
        vertices += geo.attributes.position.count;
      }
    });
  }

  // Remove existing form
  const existing = document.getElementById('room-info-form');
  if (existing) existing.remove();

  const form = document.createElement('div');
  form.id = 'room-info-form';
  form.innerHTML = `
    <div class="info-form-container">
      <h3>ROOM INFO</h3>
      <div class="info-field">
        <label>Name</label>
        <input type="text" id="rif-name" value="${existingMeta.name || S.roomData?.name || ''}" maxlength="64" />
      </div>
      <div class="info-field">
        <label>Author</label>
        <input type="text" id="rif-author" value="${existingMeta.author || ''}" placeholder="Creator name" maxlength="64" />
      </div>
      <div class="info-field">
        <label>Description</label>
        <input type="text" id="rif-desc" value="${existingMeta.description || ''}" placeholder="(optional)" maxlength="200" />
      </div>
      <div class="info-field">
        <label>License</label>
        <select id="rif-license">
          <option value="CC-BY-4.0" ${existingMeta.license === 'CC-BY-4.0' ? 'selected' : ''}>CC Attribution</option>
          <option value="Free Standard" ${existingMeta.license === 'Free Standard' ? 'selected' : ''}>Free Standard</option>
          <option value="CC0" ${existingMeta.license === 'CC0' ? 'selected' : ''}>CC0 (Public Domain)</option>
          <option value="Original" ${existingMeta.license === 'Original' ? 'selected' : ''}>Original Work</option>
          <option value="Other" ${existingMeta.license === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>
      <div class="info-field">
        <label>Source URL</label>
        <input type="text" id="rif-url" value="${existingMeta.url || ''}" placeholder="https://..." maxlength="200" />
      </div>
      <div class="info-field">
        <label>Message</label>
        <textarea id="rif-credits" placeholder="お知らせ、備考、クレジットなど自由入力" rows="6">${existingMeta.creditList || ''}</textarea>
      </div>
      <div class="info-stats">
        Triangles: ${triangles.toLocaleString()} / Vertices: ${vertices.toLocaleString()} / Meshes: ${S.colliderMeshes?.length || 0}
      </div>
      <div class="info-actions">
        <button id="rif-cancel">Close</button>
        <button id="rif-save">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(form);

  form.querySelector('#rif-cancel').addEventListener('click', () => form.remove());

  form.querySelector('#rif-save').addEventListener('click', async () => {
    const updatedMeta = {
      ...existingMeta,
      name: form.querySelector('#rif-name').value.trim() || 'My Room',
      author: form.querySelector('#rif-author').value.trim(),
      description: form.querySelector('#rif-desc').value.trim(),
      license: form.querySelector('#rif-license').value,
      url: form.querySelector('#rif-url').value.trim(),
      creditList: form.querySelector('#rif-credits').value.trim(),
      triangles,
      vertices,
      timestamp: Date.now(),
    };

    // Update localStorage config (runtime settings)
    config.roomMeta = updatedMeta;
    config.roomName = updatedMeta.name;
    localStorage.setItem('room_config', JSON.stringify(config));

    // Always save to IndexedDB (persists across reset)
    const metaKey = config.customGLBKey
      ? `meta_${config.customGLBKey}`
      : `meta_room_${config.roomId || 'default'}`;
    updatedMeta.id = config.customGLBKey || config.roomId || 'default';
    await db.assets.put(updatedMeta, metaKey);

    // Update displayed room name
    S.roomData.name = updatedMeta.name;
    document.getElementById('room-name').textContent = updatedMeta.name;

    console.log('[EDITOR] Room info updated');
    form.remove();
  });
}

// ============================================================
// Load custom GLB from IndexedDB as blob URL
// ============================================================
export async function loadCustomRoomGLB(key) {
  try {
    const data = await db.assets.get(key);
    if (data) {
      const blob = new Blob([data], { type: 'model/gltf-binary' });
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.error('[EDITOR] Failed to load custom room:', e);
  }
  return null;
}

// ============================================================
// Editor panel (adjustment sliders)
// ============================================================
function createEditorPanel() {
  editorPanel = document.createElement('div');
  editorPanel.id = 'editor-panel';
  editorPanel.style.display = 'none';
  editorPanel.innerHTML = `
    <div class="editor-header">
      <span>ROOM ADJUST</span>
      <button id="editor-close">✕</button>
    </div>
    <div class="editor-body">
      <div class="editor-group">
        <label>Scale</label>
        <input type="range" id="ed-scale" min="0.01" max="5" step="0.01" value="1" />
        <span id="ed-scale-val">1.00</span>
      </div>
      <div class="editor-group">
        <label>Pos X</label>
        <input type="range" id="ed-posX" min="-20" max="20" step="0.1" value="0" />
        <span id="ed-posX-val">0.0</span>
      </div>
      <div class="editor-group">
        <label>Pos Y</label>
        <input type="range" id="ed-posY" min="-5" max="10" step="0.01" value="0" />
        <span id="ed-posY-val">0.0</span>
      </div>
      <div class="editor-group">
        <label>Pos Z</label>
        <input type="range" id="ed-posZ" min="-20" max="20" step="0.1" value="0" />
        <span id="ed-posZ-val">0.0</span>
      </div>
      <div class="editor-group">
        <label>Rot Y</label>
        <input type="range" id="ed-rotY" min="0" max="360" step="1" value="0" />
        <span id="ed-rotY-val">0</span>
      </div>
      <div class="editor-group">
        <label>Spawn X</label>
        <input type="range" id="ed-spawnX" min="-20" max="20" step="0.1" value="0" />
        <span id="ed-spawnX-val">0.0</span>
      </div>
      <div class="editor-group">
        <label>Spawn Z</label>
        <input type="range" id="ed-spawnZ" min="-20" max="20" step="0.1" value="0" />
        <span id="ed-spawnZ-val">0.0</span>
      </div>
      <div class="editor-actions">
        <button id="ed-save">💾 Save</button>
        <button id="ed-copy-json">📋 Copy JSON</button>
      </div>
    </div>
  `;
  document.body.appendChild(editorPanel);

  // Close button
  editorPanel.querySelector('#editor-close').addEventListener('click', () => {
    toggleEditor();
  });

  // Save button
  editorPanel.querySelector('#ed-save').addEventListener('click', () => {
    saveAdjustments();
  });

  // Copy JSON button
  editorPanel.querySelector('#ed-copy-json').addEventListener('click', () => {
    copyJSON();
  });

  // Setup slider event listeners
  const sliderIds = ['ed-scale', 'ed-posX', 'ed-posY', 'ed-posZ', 'ed-rotY', 'ed-spawnX', 'ed-spawnZ'];
  for (const id of sliderIds) {
    const slider = editorPanel.querySelector(`#${id}`);
    const valSpan = editorPanel.querySelector(`#${id}-val`);
    slider.addEventListener('input', () => {
      valSpan.textContent = slider.value;
      applySliderValues();
    });
  }
}

// ============================================================
// Toggle editor
// ============================================================
function toggleEditor() {
  isEditorOpen = !isEditorOpen;
  editorPanel.style.display = isEditorOpen ? 'block' : 'none';

  if (isEditorOpen) {
    // Load current values into sliders
    loadCurrentValues();
  }
}

// ============================================================
// Load current room values into sliders
// ============================================================
function loadCurrentValues() {
  const room = stateRef.roomData?.room || {};
  const spawn = stateRef.roomData?.spawn || [0, 0, 0];

  setSlider('ed-scale', room.scale || 1);
  setSlider('ed-posX', room.pos?.[0] || 0);
  setSlider('ed-posY', room.pos?.[1] || 0);
  setSlider('ed-posZ', room.pos?.[2] || 0);
  setSlider('ed-rotY', room.rot?.[1] || 0);
  setSlider('ed-spawnX', spawn[0] || 0);
  setSlider('ed-spawnZ', spawn[2] || 0);
}

function setSlider(id, value) {
  const slider = editorPanel.querySelector(`#${id}`);
  const valSpan = editorPanel.querySelector(`#${id}-val`);
  if (slider && valSpan) {
    slider.value = value;
    valSpan.textContent = Number(value).toFixed(id === 'ed-rotY' ? 0 : 2);
  }
}

// ============================================================
// Apply slider values to room in real-time
// ============================================================
function applySliderValues() {
  const S = stateRef;
  if (!S.scene) return;

  const scale = parseFloat(editorPanel.querySelector('#ed-scale').value);
  const posX = parseFloat(editorPanel.querySelector('#ed-posX').value);
  const posY = parseFloat(editorPanel.querySelector('#ed-posY').value);
  const posZ = parseFloat(editorPanel.querySelector('#ed-posZ').value);
  const rotY = parseFloat(editorPanel.querySelector('#ed-rotY').value);

  // Find room model in scene (first large group that isn't camera/avatar)
  // We need to store room model reference in STATE
  if (S.roomModel) {
    S.roomModel.scale.setScalar(scale);
    S.roomModel.position.set(posX, posY, posZ);
    S.roomModel.rotation.y = THREE.MathUtils.degToRad(rotY);
  }

  // Update spawn marker position
  const spawnX = parseFloat(editorPanel.querySelector('#ed-spawnX').value);
  const spawnZ = parseFloat(editorPanel.querySelector('#ed-spawnZ').value);

  if (S.spawnMarker) {
    S.spawnMarker.position.set(spawnX, 0.1, spawnZ);
  } else {
    // Create spawn marker
    const markerGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.6 });
    S.spawnMarker = new THREE.Mesh(markerGeo, markerMat);
    S.spawnMarker.position.set(spawnX, 0.1, spawnZ);
    S.scene.add(S.spawnMarker);
  }
}

// ============================================================
// Save adjustments to localStorage
// ============================================================
function saveAdjustments() {
  const scale = parseFloat(editorPanel.querySelector('#ed-scale').value);
  const posX = parseFloat(editorPanel.querySelector('#ed-posX').value);
  const posY = parseFloat(editorPanel.querySelector('#ed-posY').value);
  const posZ = parseFloat(editorPanel.querySelector('#ed-posZ').value);
  const rotY = parseFloat(editorPanel.querySelector('#ed-rotY').value);
  const spawnX = parseFloat(editorPanel.querySelector('#ed-spawnX').value);
  const spawnZ = parseFloat(editorPanel.querySelector('#ed-spawnZ').value);

  // Update config in localStorage
  const configStr = localStorage.getItem('room_config');
  if (configStr) {
    const config = JSON.parse(configStr);
    config.roomDefaults = {
      scale,
      pos: [posX, posY, posZ],
      rot: [0, rotY, 0],
      spawn: [spawnX, 0, spawnZ],
    };
    localStorage.setItem('room_config', JSON.stringify(config));
    console.log('[EDITOR] Settings saved');
    alert('Room settings saved!');
  }
}

// ============================================================
// Copy models.json entry to clipboard
// ============================================================
function copyJSON() {
  const scale = parseFloat(editorPanel.querySelector('#ed-scale').value);
  const posX = parseFloat(editorPanel.querySelector('#ed-posX').value);
  const posY = parseFloat(editorPanel.querySelector('#ed-posY').value);
  const posZ = parseFloat(editorPanel.querySelector('#ed-posZ').value);
  const rotY = parseFloat(editorPanel.querySelector('#ed-rotY').value);
  const spawnX = parseFloat(editorPanel.querySelector('#ed-spawnX').value);
  const spawnZ = parseFloat(editorPanel.querySelector('#ed-spawnZ').value);

  const json = {
    id: stateRef.roomData?.room?.glb?.split('/')?.pop()?.replace('.glb', '') || 'custom_room',
    name: stateRef.roomData?.name || 'Custom Room',
    file: stateRef.roomData?.room?.glb?.split('/')?.pop() || 'custom.glb',
    thumbnail: '',
    description: '',
    credit: { author: '', credit: '', url: '', license: '' },
    defaults: {
      scale,
      pos: [posX, posY, posZ],
      rot: [0, rotY, 0],
      spawn: [spawnX, 0, spawnZ],
    },
    stats: { triangles: 0, vertices: 0, fileSize: '' },
    tags: [],
  };

  navigator.clipboard.writeText(JSON.stringify(json, null, 2))
    .then(() => alert('JSON copied to clipboard!'))
    .catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = JSON.stringify(json, null, 2);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('JSON copied to clipboard!');
    });
}

// Need THREE for spawn marker
import * as THREE from 'three';
