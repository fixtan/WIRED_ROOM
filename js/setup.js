// setup.js - Initial setup wizard (room select, avatar select, name input)
// Saves config to localStorage, custom VRM to IndexedDB

import Dexie from 'dexie';

const LS_KEY = 'room_config';

// ============================================================
// IndexedDB helpers
// ============================================================
const db = new Dexie('RoomDB');
db.version(1).stores({
  assets: '',
});

async function saveToIDB(key, data) {
  await db.assets.put(data, key);
}

async function loadFromIDB(key) {
  return await db.assets.get(key) || null;
}

// ============================================================
// Load saved config
// ============================================================
export function loadConfig() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

function saveConfig(config) {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

// ============================================================
// Load custom VRM from IndexedDB as blob URL
// ============================================================
export async function loadCustomVRM() {
  const data = await loadFromIDB('custom_vrm');
  if (data) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    return URL.createObjectURL(blob);
  }
  return null;
}

// ============================================================
// Show setup wizard
// ============================================================
export function showSetupWizard() {
  return new Promise(async (resolve) => {
    const overlay = document.getElementById('setup-wizard');
    overlay.style.display = 'flex';

    // Hide click-to-start
    document.getElementById('click-to-start').style.display = 'none';

    // State
    let currentStep = 0;
    let selectedRoom = null;
    let selectedAvatar = 'avater1'; // default male
    let selectedSky = 'night';      // default sky
    let customVrmFile = null;
    let roomName = '';
    let modelsData = null;

    // Load models.json
    try {
      const res = await fetch('./assets/room/models.json');
      modelsData = await res.json();
    } catch (e) {
      console.error('[SETUP] Failed to load models.json:', e);
      modelsData = { models: [] };
    }

    const steps = overlay.querySelectorAll('.setup-step');
    const prevBtn = document.getElementById('setup-prev');
    const nextBtn = document.getElementById('setup-next');

    function showStep(index) {
      steps.forEach((s, i) => {
        s.style.display = i === index ? 'block' : 'none';
      });
      prevBtn.style.display = index === 0 ? 'none' : 'inline-block';
      nextBtn.textContent = index === steps.length - 1 ? 'START' : 'NEXT ▶';
      currentStep = index;
    }

    // ── Step 0: Room Select ──
    const roomGrid = document.getElementById('room-grid');
    roomGrid.innerHTML = '';

    for (const model of modelsData.models) {
      const card = document.createElement('div');
      card.className = 'setup-card';
      card.dataset.id = model.id;
      card.innerHTML = `
        <img src="./assets/room/${model.thumbnail}" alt="${model.name}" />
        <div class="setup-card-name">${model.name}</div>
        <div class="setup-card-credit">${model.credit.author} / ${model.credit.license}</div>
        <div class="setup-card-stats">${model.stats.triangles.toLocaleString()} tri / ${model.stats.fileSize}</div>
      `;
      card.addEventListener('click', () => {
        roomGrid.querySelectorAll('.setup-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedRoom = model;
      });
      roomGrid.appendChild(card);
    }

    // Load custom rooms from IndexedDB
    try {
      const { loadCustomRoomList } = await import('./editor.js');
      const customRooms = await loadCustomRoomList();
      for (const meta of customRooms) {
        const card = document.createElement('div');
        card.className = 'setup-card';
        card.dataset.id = meta.id;
        card.innerHTML = `
          <div class="custom-room-badge">CUSTOM</div>
          ${meta.thumbnail ? `<img src="${meta.thumbnail}" alt="${meta.name}" />` : ''}
          <div class="setup-card-name">${meta.name}</div>
          <div class="setup-card-credit">${meta.author || 'Unknown'} / ${meta.license || ''}</div>
          <div class="setup-card-stats">${meta.triangles?.toLocaleString() || '?'} tri / ${meta.fileSize || '?'}</div>
        `;
        const customModel = {
          id: meta.id,
          file: meta.id,
          name: meta.name,
          isCustom: true,
          defaults: { scale: 1, pos: [0, 0, 0], rot: [0, 0, 0], spawn: [0, 0, 0] },
          credit: { author: meta.author, license: meta.license },
          stats: { triangles: meta.triangles, vertices: meta.vertices, fileSize: meta.fileSize },
        };
        card.addEventListener('click', () => {
          roomGrid.querySelectorAll('.setup-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedRoom = customModel;
        });
        roomGrid.appendChild(card);
      }
    } catch (e) {
      console.warn('[SETUP] Could not load custom rooms:', e);
    }

    // Select first by default
    if (modelsData.models.length > 0) {
      selectedRoom = modelsData.models[0];
      roomGrid.querySelector('.setup-card')?.classList.add('selected');
    }

    // ── Step 1: Avatar Select ──
    const avatarCards = overlay.querySelectorAll('.avatar-card');
    avatarCards.forEach(card => {
      card.addEventListener('click', () => {
        avatarCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedAvatar = card.dataset.id;
        // Hide upload info if preset selected
        if (selectedAvatar !== 'custom') {
          document.getElementById('custom-vrm-info').textContent = '';
        }
      });
    });

    // Custom VRM upload
    const vrmUpload = document.getElementById('vrm-upload');
    const customCard = overlay.querySelector('.avatar-card[data-id="custom"]');

    vrmUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && file.name.endsWith('.vrm')) {
        customVrmFile = file;
        selectedAvatar = 'custom';
        avatarCards.forEach(c => c.classList.remove('selected'));
        customCard.classList.add('selected');
        document.getElementById('custom-vrm-info').textContent = file.name;
      }
    });

    // ── Step 2: Sky Select ──
    const skyCards = overlay.querySelectorAll('.sky-card');
    skyCards.forEach(card => {
      card.addEventListener('click', () => {
        skyCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedSky = card.dataset.id;
      });
    });

    // ── Step 3: Name Input ──
    const nameInput = document.getElementById('room-name-input');

    // ── Navigation ──
    prevBtn.addEventListener('click', () => {
      if (currentStep > 0) showStep(currentStep - 1);
    });

    nextBtn.addEventListener('click', async () => {
      if (currentStep < steps.length - 1) {
        showStep(currentStep + 1);
      } else {
        // Final step: save and start
        roomName = nameInput.value.trim() || "My Room";

        // Save custom VRM to IndexedDB
        if (selectedAvatar === 'custom' && customVrmFile) {
          const arrayBuffer = await customVrmFile.arrayBuffer();
          await saveToIDB('custom_vrm', arrayBuffer);
        }

        // Build config
        const config = {
          roomName,
          roomId: selectedRoom?.id || 'room_blank',
          roomFile: selectedRoom?.file || 'room_blank.glb',
          roomDefaults: selectedRoom?.defaults || { scale: 1, pos: [0, 0, 0], rot: [0, 0, 0], spawn: [0, 0, 3] },
          avatarId: selectedAvatar,
          skyPreset: selectedSky,
          timestamp: Date.now(),
        };

        // Mark custom rooms
        if (selectedRoom?.isCustom) {
          config.isCustomGLB = true;
          config.customGLBKey = selectedRoom.id;
        }

        saveConfig(config);

        // Hide wizard
        overlay.style.display = 'none';

        resolve(config);
      }
    });

    showStep(0);
  });
}

// ============================================================
// Build room.json override from config
// ============================================================
export async function buildRoomDataFromConfig(config) {
  const d = config.roomDefaults;

  // Load saved metadata from IndexedDB (persists across reset)
  try {
    const Dexie = (await import('dexie')).default;
    const db = new Dexie('RoomDB');
    db.version(1).stores({ assets: '' });
    const metaKey = config.customGLBKey
      ? `meta_${config.customGLBKey}`
      : `meta_room_${config.roomId || 'default'}`;
    const savedMeta = await db.assets.get(metaKey);
    if (savedMeta) {
      config.roomMeta = { ...savedMeta, ...(config.roomMeta || {}) };
      if (!config.roomName || config.roomName === 'My Room') {
        config.roomName = savedMeta.name || config.roomName;
      }
      // Re-save merged config to localStorage
      localStorage.setItem('room_config', JSON.stringify(config));
    }
  } catch (e) { /* no saved meta */ }

  // Determine room GLB path
  let roomGlb = `./assets/room/${config.roomFile}`;
  if (config.isCustomGLB && config.customGLBKey) {
    const { loadCustomRoomGLB } = await import('./editor.js');
    const blobUrl = await loadCustomRoomGLB(config.customGLBKey);
    if (blobUrl) roomGlb = blobUrl;
  } else if (config.roomId?.startsWith('custom_room_')) {
    // Selected custom room from wizard
    const { loadCustomRoomGLB } = await import('./editor.js');
    const blobUrl = await loadCustomRoomGLB(config.roomId);
    if (blobUrl) {
      roomGlb = blobUrl;
      config.isCustomGLB = true;
      config.customGLBKey = config.roomId;
    }
  }

  // Determine avatar VRM path
  let avatarVrm = './assets/avatar/avater1.vrm';
  if (config.avatarId === 'avater2') {
    avatarVrm = './assets/avatar/avater2.vrm';
  } else if (config.avatarId === 'custom') {
    const blobUrl = await loadCustomVRM();
    if (blobUrl) avatarVrm = blobUrl;
  }

  return {
    name: config.roomName,
    spawn: d.spawn || [0, 0, 3],
    room: {
      glb: roomGlb,
      scale: d.scale || 1,
      pos: d.pos || [0, 0, 0],
      rot: d.rot || [0, 0, 0],
      collision: true,
    },
    avatar: {
      vrm: avatarVrm,
      scale: 1,
      mode: '3rd',
      animations: {
        idle: './assets/avatar/idle.vrma',
        walk: './assets/avatar/walk.vrma',
      },
    },
    objects: [],
    portals: [],
    sky: {
      preset: config.skyPreset || 'night',
    },
  };
}
