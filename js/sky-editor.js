// sky-editor.js - Sky Settings editor panel
import * as THREE from 'three';
import { addMenuItem } from './menu.js';
import { SKY_PRESETS } from './room-loader.js';

const LS_SKY_KEY = 'sky_settings';
let skyPanel = null;
let isSkyEditorOpen = false;
let stateRef = null;

// ============================================================
// Init (add menu item)
// ============================================================
export function setupSkyEditor(S) {
  stateRef = S;
  createSkyPanel();

  addMenuItem({
    id: 'sky-settings',
    label: 'Sky Settings',
    icon: '🌤️',
    action: () => toggleSkyEditor(),
  });
}

// ============================================================
// Apply sky settings to shader uniforms (no reload)
// ============================================================
function applySkySettings(settings) {
  const S = stateRef;
  if (!S?.skyMaterial?.uniforms) return;

  const u = S.skyMaterial.uniforms;
  u.uTopColor.value.set(settings.topColor);
  u.uMidColor.value.set(settings.midColor);
  u.uBottomColor.value.set(settings.bottomColor);
  u.uStarsIntensity.value = settings.stars ? 1.0 : 0.0;
  u.uGridIntensity.value = settings.grid ? 1.0 : 0.0;
  u.uCloudsIntensity.value = settings.clouds ? 1.0 : 0.0;

  // Cloud color
  if (settings.cloudColor) {
    u.uCloudColor.value.set(settings.cloudColor);
  }
  if (settings.cloudAlpha !== undefined) {
    u.uCloudAlpha.value = settings.cloudAlpha;
  }

  // Grid color
  if (settings.gridColor) {
    u.uGridColor.value.set(settings.gridColor);
  }

  // Rotation speed
  if (settings.rotSpeed !== undefined) {
    S.skyRotSpeed = settings.rotSpeed;
  }

  // Background color
  if (settings.bgColor) {
    S.scene.background = new THREE.Color(settings.bgColor);
  }
}

// ============================================================
// Load saved sky settings from localStorage
// ============================================================
export function loadSkySettings() {
  try {
    const saved = localStorage.getItem(LS_SKY_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('[SKY] Failed to load sky settings:', e);
  }
  return null;
}

// ============================================================
// Save sky settings to localStorage
// ============================================================
function saveSkySettings(settings) {
  localStorage.setItem(LS_SKY_KEY, JSON.stringify(settings));

  // Also update room_config.skyPreset
  try {
    const config = JSON.parse(localStorage.getItem('room_config') || '{}');
    config.skyPreset = settings.preset || config.skyPreset;
    localStorage.setItem('room_config', JSON.stringify(config));
  } catch (e) { /* ignore */ }
}

// ============================================================
// Get current settings from UI
// ============================================================
function getCurrentSettings() {
  return {
    preset: skyPanel.querySelector('#sky-preset-select')?.value || 'night',
    topColor: skyPanel.querySelector('#sky-topColor')?.value || '#050520',
    midColor: skyPanel.querySelector('#sky-midColor')?.value || '#0a0a3a',
    bottomColor: skyPanel.querySelector('#sky-bottomColor')?.value || '#1a0a1a',
    bgColor: skyPanel.querySelector('#sky-bgColor')?.value || '#0a0a3a',
    stars: skyPanel.querySelector('#sky-stars')?.checked || false,
    clouds: skyPanel.querySelector('#sky-clouds')?.checked || false,
    grid: skyPanel.querySelector('#sky-grid')?.checked || false,
    cloudColor: skyPanel.querySelector('#sky-cloudColor')?.value || '#ffffff',
    cloudAlpha: parseFloat(skyPanel.querySelector('#sky-cloudAlpha')?.value || '0.7'),
    gridColor: skyPanel.querySelector('#sky-gridColor')?.value || '#00ff44',
    rotSpeed: parseFloat(skyPanel.querySelector('#sky-rotSpeed')?.value || '0.003'),
  };
}

// ============================================================
// Set UI from settings object
// ============================================================
function setUIFromSettings(settings) {
  const set = (id, val) => {
    const el = skyPanel.querySelector(`#${id}`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  };

  set('sky-topColor', settings.topColor);
  set('sky-midColor', settings.midColor);
  set('sky-bottomColor', settings.bottomColor);
  set('sky-bgColor', settings.bgColor);
  set('sky-stars', settings.stars);
  set('sky-clouds', settings.clouds);
  set('sky-grid', settings.grid);
  set('sky-cloudColor', settings.cloudColor || '#ffffff');
  set('sky-cloudAlpha', settings.cloudAlpha ?? 0.7);
  set('sky-gridColor', settings.gridColor || '#00ff44');
  set('sky-rotSpeed', settings.rotSpeed ?? 0.003);

  // Update value displays
  updateValueDisplay('sky-cloudAlpha');
  updateValueDisplay('sky-rotSpeed');
}

function updateValueDisplay(id) {
  const el = skyPanel.querySelector(`#${id}`);
  const span = skyPanel.querySelector(`#${id}-val`);
  if (el && span) span.textContent = parseFloat(el.value).toFixed(3);
}

// ============================================================
// Create sky settings panel
// ============================================================
function createSkyPanel() {
  skyPanel = document.createElement('div');
  skyPanel.id = 'sky-panel';
  skyPanel.style.display = 'none';
  skyPanel.innerHTML = `
    <div class="editor-header">
      <span>SKY SETTINGS</span>
      <button id="sky-close">✕</button>
    </div>
    <div class="editor-body">

      <div class="editor-group">
        <label>Preset</label>
        <select id="sky-preset-select">
          <option value="night">Night</option>
          <option value="sunset">Sunset</option>
          <option value="day">Day</option>
          <option value="wired">WIRED</option>
        </select>
      </div>

      <div class="sky-divider"></div>

      <div class="editor-group">
        <label>Top Color</label>
        <input type="color" id="sky-topColor" value="#050520" />
      </div>
      <div class="editor-group">
        <label>Mid Color</label>
        <input type="color" id="sky-midColor" value="#0a0a3a" />
      </div>
      <div class="editor-group">
        <label>Bottom Color</label>
        <input type="color" id="sky-bottomColor" value="#1a0a1a" />
      </div>
      <div class="editor-group">
        <label>BG Color</label>
        <input type="color" id="sky-bgColor" value="#0a0a3a" />
      </div>

      <div class="sky-divider"></div>

      <div class="editor-group">
        <label>Stars</label>
        <input type="checkbox" id="sky-stars" />
      </div>
      <div class="editor-group">
        <label>Clouds</label>
        <input type="checkbox" id="sky-clouds" />
      </div>
      <div class="editor-group">
        <label>Cloud Color</label>
        <input type="color" id="sky-cloudColor" value="#ffffff" />
      </div>
      <div class="editor-group">
        <label>Cloud Alpha</label>
        <input type="range" id="sky-cloudAlpha" min="0" max="1" step="0.05" value="0.7" />
        <span id="sky-cloudAlpha-val">0.700</span>
      </div>

      <div class="sky-divider"></div>

      <div class="editor-group">
        <label>Grid</label>
        <input type="checkbox" id="sky-grid" />
      </div>
      <div class="editor-group">
        <label>Grid Color</label>
        <input type="color" id="sky-gridColor" value="#00ff44" />
      </div>

      <div class="sky-divider"></div>

      <div class="editor-group">
        <label>Rot Speed</label>
        <input type="range" id="sky-rotSpeed" min="0" max="0.02" step="0.001" value="0.003" />
        <span id="sky-rotSpeed-val">0.003</span>
      </div>

      <div class="editor-actions">
        <button id="sky-save">💾 Save</button>
        <button id="sky-reset">🔄 Reset</button>
      </div>
    </div>
  `;
  document.body.appendChild(skyPanel);

  // ── Event Listeners ──

  // Close
  skyPanel.querySelector('#sky-close').addEventListener('click', () => {
    toggleSkyEditor();
  });

  // Preset select → load preset values into UI → apply
  skyPanel.querySelector('#sky-preset-select').addEventListener('change', (e) => {
    const presetName = e.target.value;
    const preset = SKY_PRESETS[presetName];
    if (!preset) return;

    // Map preset to settings format
    const settings = {
      preset: presetName,
      topColor: preset.topColor,
      midColor: preset.midColor,
      bottomColor: preset.bottomColor,
      bgColor: preset.bgColor,
      stars: !!preset.stars,
      clouds: !!preset.clouds,
      grid: !!preset.grid,
      cloudColor: preset.name === 'Sunset' ? '#f3a17b' : '#ffffff',
      cloudAlpha: preset.name === 'Sunset' ? 0.6 : 0.7,
      gridColor: preset.name === 'WIRED' ? '#00ff44' : '#ff6699',
      rotSpeed: preset.rotSpeed || 0.003,
    };

    setUIFromSettings(settings);
    applySkySettings(settings);
  });

  // All color inputs → live update
  const colorInputs = ['sky-topColor', 'sky-midColor', 'sky-bottomColor', 'sky-bgColor',
    'sky-cloudColor', 'sky-gridColor'];
  for (const id of colorInputs) {
    skyPanel.querySelector(`#${id}`).addEventListener('input', () => {
      applySkySettings(getCurrentSettings());
    });
  }

  // Checkboxes → live update
  const checkboxes = ['sky-stars', 'sky-clouds', 'sky-grid'];
  for (const id of checkboxes) {
    skyPanel.querySelector(`#${id}`).addEventListener('change', () => {
      applySkySettings(getCurrentSettings());
    });
  }

  // Sliders → live update
  const sliders = ['sky-cloudAlpha', 'sky-rotSpeed'];
  for (const id of sliders) {
    skyPanel.querySelector(`#${id}`).addEventListener('input', () => {
      updateValueDisplay(id);
      applySkySettings(getCurrentSettings());
    });
  }

  // Save
  skyPanel.querySelector('#sky-save').addEventListener('click', () => {
    const settings = getCurrentSettings();
    saveSkySettings(settings);
    console.log('[SKY] Settings saved');
    alert('Sky settings saved!');
  });

  // Reset → load preset, clear custom settings
  skyPanel.querySelector('#sky-reset').addEventListener('click', () => {
    localStorage.removeItem(LS_SKY_KEY);
    const config = JSON.parse(localStorage.getItem('room_config') || '{}');
    const presetName = config.skyPreset || 'night';
    skyPanel.querySelector('#sky-preset-select').value = presetName;

    const preset = SKY_PRESETS[presetName];
    if (preset) {
      const settings = {
        preset: presetName,
        topColor: preset.topColor,
        midColor: preset.midColor,
        bottomColor: preset.bottomColor,
        bgColor: preset.bgColor,
        stars: !!preset.stars,
        clouds: !!preset.clouds,
        grid: !!preset.grid,
        cloudColor: preset.name === 'Sunset' ? '#f3a17b' : '#ffffff',
        cloudAlpha: preset.name === 'Sunset' ? 0.6 : 0.7,
        gridColor: preset.name === 'WIRED' ? '#00ff44' : '#ff6699',
        rotSpeed: preset.rotSpeed || 0.003,
      };
      setUIFromSettings(settings);
      applySkySettings(settings);
    }
    console.log('[SKY] Reset to preset:', presetName);
  });
}

// ============================================================
// Toggle panel
// ============================================================
function toggleSkyEditor() {
  isSkyEditorOpen = !isSkyEditorOpen;
  skyPanel.style.display = isSkyEditorOpen ? 'block' : 'none';

  if (isSkyEditorOpen) {
    // Load saved settings or current preset
    const saved = loadSkySettings();
    if (saved) {
      skyPanel.querySelector('#sky-preset-select').value = saved.preset || 'night';
      setUIFromSettings(saved);
    } else {
      const config = JSON.parse(localStorage.getItem('room_config') || '{}');
      const presetName = config.skyPreset || 'night';
      skyPanel.querySelector('#sky-preset-select').value = presetName;
      const preset = SKY_PRESETS[presetName];
      if (preset) {
        setUIFromSettings({
          topColor: preset.topColor,
          midColor: preset.midColor,
          bottomColor: preset.bottomColor,
          bgColor: preset.bgColor,
          stars: !!preset.stars,
          clouds: !!preset.clouds,
          grid: !!preset.grid,
          cloudColor: '#ffffff',
          cloudAlpha: 0.7,
          gridColor: '#00ff44',
          rotSpeed: preset.rotSpeed || 0.003,
        });
      }
    }
  }
}
