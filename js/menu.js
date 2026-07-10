// menu.js - Right-click context menu
// Extensible: add items via addMenuItem()

const LS_KEY = 'room_config';
let menuEl = null;
let isMenuOpen = false;
let stateRef = null;

// ============================================================
// Menu items registry
// ============================================================
const menuItems = [];

export function addMenuItem(item) {
  // item: { id, label, icon?, action, divider? }
  menuItems.push(item);
  if (menuEl) renderMenu();
}

// ============================================================
// Init menu
// ============================================================
export function setupMenu(S) {
  stateRef = S;

  // Create menu element
  menuEl = document.getElementById('context-menu');

  // Register default items
  registerDefaultItems();
  renderMenu();

  // Right-click handler (when pointer not locked)
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isMenuOpen) {
      hideMenu();
    } else {
      showMenu(e.clientX, e.clientY);
    }
  });

  // Tab key handler (when pointer is locked)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (isMenuOpen) {
        hideMenu();
        // Re-lock pointer
        document.body.requestPointerLock();
      } else if (S.isLocked) {
        document.exitPointerLock();
        // Show at screen center
        showMenu(window.innerWidth / 2 - 90, window.innerHeight / 2 - 50);
      }
    }
    if (e.code === 'Escape' && isMenuOpen) {
      hideMenu();
    }
  });
}

// ============================================================
// Show / Hide
// ============================================================
function showMenu(x, y) {
  if (stateRef?.isPublicMode) return;  // ← この1行追加

  menuEl.style.display = 'block';
  menuEl.style.left = `${x}px`;
  menuEl.style.top = `${y}px`;

  // Keep menu within viewport
  const rect = menuEl.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menuEl.style.left = `${window.innerWidth - rect.width - 8}px`;
  }
  if (rect.bottom > window.innerHeight) {
    menuEl.style.top = `${window.innerHeight - rect.height - 8}px`;
  }

  isMenuOpen = true;
}

function hideMenu() {
  menuEl.style.display = 'none';
  isMenuOpen = false;
}

export function isContextMenuOpen() {
  return isMenuOpen;
}

export function toggleMenu() {
  if (isMenuOpen) {
    hideMenu();
  } else {
    showMenu(window.innerWidth / 2 - 90, window.innerHeight / 2 - 100);
  }
}

// ============================================================
// Render menu items
// ============================================================
function renderMenu() {
  menuEl.innerHTML = '';

  for (const item of menuItems) {
    if (item.divider) {
      const div = document.createElement('div');
      div.className = 'ctx-divider';
      menuEl.appendChild(div);
      continue;
    }

    const btn = document.createElement('div');
    btn.className = 'ctx-item';
    btn.innerHTML = `${item.icon || ''} ${item.label}`;
    btn.addEventListener('click', () => {
      hideMenu();
      if (item.action) item.action(stateRef);
    });
    menuEl.appendChild(btn);
  }
}

// ============================================================
// Default menu items
// ============================================================
function registerDefaultItems() {
  addMenuItem({
    id: 'room-info',
    label: 'Room Info',
    icon: 'ℹ️',
    action: async (S) => {
      const { showEditRoomInfo } = await import('./editor.js');
      showEditRoomInfo(S);
    }
  });

  addMenuItem({ divider: true });

  addMenuItem({
    id: 'reset-settings',
    label: 'Reset Settings',
    icon: '🔄',
    action: () => {
      if (confirm('Reset all settings? This will restart the setup wizard.')) {
        localStorage.removeItem(LS_KEY);
        location.reload();
      }
    }
  });

  addMenuItem({
    id: 'fullscreen',
    label: 'Fullscreen',
    icon: '⛶',
    action: () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  });
  addMenuItem({
  id: 'take-thumbnail',
  label: 'Take Thumbnail',
  icon: '📷',
  action: async (S) => {
    S.renderer.render(S.scene, S.camera);
    const dataUrl = S.renderer.domElement.toDataURL('image/webp', 0.8);

    const config = JSON.parse(localStorage.getItem('room_config'));
    if (config) {
      // localStorage
      if (!config.roomMeta) config.roomMeta = {};
      config.roomMeta.thumbnail = dataUrl;
      localStorage.setItem('room_config', JSON.stringify(config));

      // IndexedDB（リセット後も残る）
      const Dexie = (await import('dexie')).default;
      const db = new Dexie('RoomDB');
      db.version(1).stores({ assets: '' });
      const metaKey = config.customGLBKey
        ? `meta_${config.customGLBKey}`
        : `meta_room_${config.roomId}`;
      const meta = await db.assets.get(metaKey) || {};
      meta.thumbnail = dataUrl;
      await db.assets.put(meta, metaKey);

      console.log('[EDITOR] Thumbnail saved');
    }
  }
});

  addMenuItem({ divider: true });

  addMenuItem({
    id: 'export-room',
    label: 'Export ZIP',
    icon: '📦',
    action: async (S) => {
      await exportRoom(S);
    }
  });
}

// ============================================================
// Export Room as ZIP
// ============================================================
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => reject(new Error('Failed to load JSZip'));
    document.head.appendChild(script);
  });
}

async function exportRoom(S) {
  const statusEl = document.getElementById('room-name');
  const origText = statusEl?.textContent || '';

  try {
    if (statusEl) statusEl.textContent = 'Exporting...';

    const JSZip = await loadJSZip();
    const zip = new JSZip();

    const Dexie = (await import('dexie')).default;
    const db = new Dexie('RoomDB');
    db.version(1).stores({ assets: '' });

    const config = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const mediaList = JSON.parse(localStorage.getItem('room_media') || '[]');

    // ── 1. Generate manifest.json (after media processing to get correct filenames) ──
    // moved below media processing

    // ── 2. Room GLB ──
    if (config.isCustomGLB && config.customGLBKey) {
      const glbData = await db.assets.get(config.customGLBKey);
      if (glbData) zip.file('public/room.glb', glbData);
    } else {
      const glbPath = `./assets/room/${config.roomFile || 'room_blank.glb'}`;
      const glbData = await fetchBinary(glbPath);
      if (glbData) zip.file('public/room.glb', glbData);
    }

    // ── 3. Avatar animations ──
    const idleData = await fetchBinary('./assets/avatar/idle.vrma');
    if (idleData) zip.file('public/idle.vrma', idleData);
    const walkData = await fetchBinary('./assets/avatar/walk.vrma');
    if (walkData) zip.file('public/walk.vrma', walkData);

    // ── 4. Media files (images, videos) — track actual filenames ──
    const mediaFileMap = {}; // id → actual filename
    for (const item of mediaList) {
      if (item.type === 'image') {
        const dataUrl = await db.assets.get(item.id);
        if (dataUrl) {
          const binary = dataUrlToBinary(dataUrl);
          const ext = dataUrl.includes('image/png') ? 'png'
                    : dataUrl.includes('image/jpeg') ? 'jpg'
                    : 'webp';
          const filename = `${item.id}.${ext}`;
          zip.file(`public/${filename}`, binary);
          mediaFileMap[item.id] = filename;
        }
      } else if (item.type === 'video') {
        const arrayBuffer = await db.assets.get(item.id);
        if (arrayBuffer) {
          const filename = `${item.id}.mp4`;
          zip.file(`public/${filename}`, arrayBuffer);
          mediaFileMap[item.id] = filename;
        }
      }
    }

    // ── 5. Figurine VRM + pose ──
    const figurine = mediaList.find(m => m.type === 'figurine');
    if (figurine) {
      // VRM
      if (config.avatarId === 'custom') {
        const vrmData = await db.assets.get('custom_vrm');
        if (vrmData) zip.file('public/default.vrm', vrmData);
      } else {
        const vrmPath = `./assets/avatar/${config.avatarId || 'avater1'}.vrm`;
        const vrmData = await fetchBinary(vrmPath);
        if (vrmData) zip.file('public/default.vrm', vrmData);
      }

      // Pose file
      const poseIndex = figurine.poseIndex || 0;
      const builtInCount = 25;
      if (poseIndex < builtInCount) {
        const poseNum = String(poseIndex + 1).padStart(2, '0');
        const poseData = await fetchBinary(`./assets/pose/${poseNum}.vrma`);
        if (poseData) zip.file('public/pose.vrma', poseData);
      } else {
        const allKeys = await db.assets.toCollection().keys();
        const customPoseKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('pose_custom_'));
        const customIndex = poseIndex - builtInCount;
        if (customPoseKeys[customIndex]) {
          const poseData = await db.assets.get(customPoseKeys[customIndex]);
          if (poseData) zip.file('public/pose.vrma', poseData);
        }
      }
    }

    // ── 6. Generate manifest.json (after all files collected) ──
    const manifest = buildManifest(config, mediaList, mediaFileMap);
    zip.file('public/manifest.json', JSON.stringify(manifest, null, 2));

    // ── 7. Generate and download ZIP ──
    const blob = await zip.generateAsync({ type: 'blob' });
    const roomName = (config.roomName || 'my-room').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadBlob(blob, `${roomName}.zip`);

    if (statusEl) statusEl.textContent = origText;
    console.log('[EXPORT] ZIP download started');

  } catch (e) {
    console.error('[EXPORT] Failed:', e);
    if (statusEl) statusEl.textContent = origText;
    alert('Export failed: ' + e.message);
  }
}

// ============================================================
// Build manifest.json from current state
// ============================================================
function buildManifest(config, mediaList, mediaFileMap = {}) {
  const d = config.roomDefaults || {};

  const manifest = {
    name: config.roomName || 'My Room',
    spawn: d.spawn || [0, 0, 3],
    room: {
      glb: 'room.glb',
      scale: d.scale || 1,
      pos: d.pos || [0, 0, 0],
      rot: d.rot || [0, 0, 0],
    },
    avatar: {
      vrm: null, // Player picks own avatar; figurine VRM is separate
      animations: {
        idle: 'idle.vrma',
        walk: 'walk.vrma',
      },
    },
    sky: { preset: config.skyPreset || 'night' },
    media: [],
    objects: [],
    portals: [],
  };

  // Media entries
  for (const item of mediaList) {
    if (item.type === 'image') {
      manifest.media.push({
        type: 'image',
        file: mediaFileMap[item.id] || `${item.id}.webp`,
        pos: item.pos,
        rot: item.rot,
        scale: item.scale,
        label: item.label || '',
        url: item.url || '',
      });
    } else if (item.type === 'video') {
      manifest.media.push({
        type: 'video',
        file: mediaFileMap[item.id] || `${item.id}.mp4`,
        pos: item.pos,
        rot: item.rot,
        scale: item.scale,
        label: item.label || '',
        url: item.url || '',
      });
    } else if (item.type === 'figurine') {
      manifest.media.push({
        type: 'figurine',
        vrm: 'default.vrm',
        pose: 'pose.vrma',
        pos: item.pos,
        rot: item.rot,
        scale: item.scale,
        label: item.label || '',
        url: item.url || '',
      });
    } else if (item.type === 'credit') {
      manifest.media.push({
        type: 'credit',
        pos: item.pos,
        rot: item.rot,
        scale: item.scale,
      });
    }
  }

  return manifest;
}

// ============================================================
// Helpers
// ============================================================
async function fetchBinary(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch (e) {
    console.warn(`[EXPORT] Failed to fetch: ${url}`);
    return null;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    console.warn(`[EXPORT] Failed to fetch: ${url}`);
    return null;
  }
}

function dataUrlToBinary(dataUrl) {
  const parts = dataUrl.split(',');
  const byteString = atob(parts[1]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return bytes;
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 100);
}
