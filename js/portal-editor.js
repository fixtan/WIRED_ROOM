// portal-editor.js - Friend/Works portal list editor
const STORAGE_KEYS = {
  friend: 'friend_portal_list',
  works: 'works_portal_list',
};

let currentType = 'friend';
let currentList = [];

export function openPortalEditor(type = 'friend') {
  currentType = type;
  const titleEl = document.getElementById('portal-editor-title');
  titleEl.textContent = type === 'friend' ? 'FRIEND PORTAL LIST' : 'WORKS PORTAL LIST';

  // Load from localStorage
  try {
    currentList = JSON.parse(localStorage.getItem(STORAGE_KEYS[type]) || '[]');
  } catch { currentList = []; }

  renderList();
  clearInputs();
  document.getElementById('portal-editor').style.display = 'flex';
}

function renderList() {
  const container = document.getElementById('portal-editor-list');
  container.innerHTML = '';

  currentList.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'pe-item';

    const imgHtml = item.image
      ? `<img src="${item.image}" onerror="this.style.display='none'" />`
      : '';

    div.innerHTML = `
      ${imgHtml}
      <div class="pe-item-info">
        <div class="pe-item-name">${item.name || '(no name)'}</div>
        <div class="pe-item-url">${item.url || ''}</div>
      </div>
    `;

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.onclick = () => {
      currentList.splice(i, 1);
      renderList();
    };
    div.appendChild(delBtn);

    container.appendChild(div);
  });
}

function clearInputs() {
  document.getElementById('pe-name').value = '';
  document.getElementById('pe-url').value = '';
  document.getElementById('pe-image').value = '';
  document.getElementById('pe-desc').value = '';
}

export function initPortalEditor() {
  document.getElementById('pe-add').addEventListener('click', () => {
    const name = document.getElementById('pe-name').value.trim();
    const url = document.getElementById('pe-url').value.trim();
    const image = document.getElementById('pe-image').value.trim();
    const description = document.getElementById('pe-desc').value.trim();

    if (!name && !url) return;

    currentList.push({ name, url, image, description });
    renderList();
    clearInputs();
  });

  document.getElementById('pe-save').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS[currentType], JSON.stringify(currentList));
    document.getElementById('portal-editor').style.display = 'none';
    console.log(`[PORTAL-EDITOR] Saved ${currentList.length} ${currentType} portals`);
  });

  document.getElementById('pe-cancel').addEventListener('click', () => {
    document.getElementById('portal-editor').style.display = 'none';
  });
}

export function getPortalList(type = 'friend') {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS[type]) || '[]');
  } catch { return []; }
}
