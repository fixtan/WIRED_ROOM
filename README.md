# WIRED ROOM

3D walkable personal exhibition space built with vanilla JS + Three.js + WebXR.
Deploy as static files — no build tools, no server infrastructure.

## Overview

WIRED ROOM lets you create a 3D room you can walk around in, decorate with images, videos, VRM figurines, and credit boards, then export as a ZIP and host on any static file server. Visitors can explore your room in desktop browsers or Meta Quest VR headsets.

Rooms connect to each other through portals. No central server — each person hosts their own room on their own domain.

## Live Demos

Deployed on 4 different hosting services — same static files, cross-server VR portal navigation:

| Host | URL |
|------|-----|
| Netlify | https://lain-lab.com/room/ |
| GitHub Pages | https://fixtan.github.io/WIRED_ROOM/ |
| Vercel | https://room-vercel.vercel.app/ |
| Cloudflare Pages | https://room-cloudflare.fixjp.workers.dev/ |

All four rooms are connected via portals. You can walk between servers in VR.

## Getting Started

### 1. Clone

```bash
git clone https://github.com/fixtan/WIRED_ROOM.git
cd WIRED_ROOM
```

### 2. Download Room Models

Room GLB files are sourced from Sketchfab (all free-licensed).
See `assets/room/models.json` for the full list with download URLs.

Download each model's GLB and place it in `assets/room/`:

```
assets/room/
├── room_blank.glb
├── living_room_interior_free.glb
├── living_roomkitchenbedroom.glb
├── comfy_living_interior_-_cgt_345_final.glb
└── loft_interior_6_for_free.glb
```

### 3. Deploy

Upload the entire folder to any static file server (Netlify, GitHub Pages, Apache, nginx, etc.) and open `index.html`.

No build step. No npm install. Just files on a server.

### Hosting Requirements

Cross-room portal navigation requires CORS headers on your server. Your server must return the following header for `.glb`, `.vrm`, `.vrma`, and media files:

`Access-Control-Allow-Origin: *`

### CORS Configuration by Host

**GitHub Pages** — CORS enabled by default. No configuration needed.

**Netlify** — Add `_headers` file to root:

```
/*
  Access-Control-Allow-Origin: *
```

**Cloudflare Pages** — Same as Netlify. Add `_headers` file to root:

```
/*
  Access-Control-Allow-Origin: *
```

**Vercel** — Add `vercel.json` to root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

Note: Vercel treats `public/` as the output directory by default. Go to **Settings → Build and Deployment → Output Directory** and set it to `.` (override) so the full repo is served.

**Apache** — Add to `.htaccess`:

```
Header set Access-Control-Allow-Origin "*"
```

**nginx** — Add to server block:

```
add_header Access-Control-Allow-Origin "*";
```

If your server doesn't support CORS, you can host room assets (GLB, VRM, media) on a CORS-enabled CDN and reference them from your room.


## Setup Wizard

On first launch, a 4-step wizard guides you through:

1. **Room Select** — Pick a room template from `models.json`, or use a custom GLB you've uploaded
2. **Avatar Select** — Choose from 2 bundled VRMs (male/female) or upload your own `.vrm`
3. **Sky Select** — 4 procedural skybox presets with animation
4. **Room Name** — Give your room a name

Settings are saved to `localStorage`. On next visit, the wizard is skipped.

## Controls

| Input | Action |
|-------|--------|
| WASD | Move |
| Mouse | Look around |
| Double-click | Select placed media for re-editing |
| Right-click | Context menu (pointer unlocked) |
| Tab | Context menu (pointer locked) |
| / (slash) | Toggle edit mode in public mode |
| E | Portal interaction |

### VR (Meta Quest)

| Input | Action |
|-------|--------|
| Left Thumbstick | Move (headset direction) |
| Right Thumbstick | Turn |
| A Button | Portal interaction |
| Y Button | Toggle menu |

## Context Menu (Edit Mode)

![WIRED ROOM context menu](https://assets.lain-lab.com/images/uploads/WIRED_ROOM_MENU.webp?)

| Menu Item | Description |
|-----------|-------------|
| Room Info | Edit title, credits, announcement text |
| Reset Settings | Clear localStorage, re-run setup wizard |
| Fullscreen | Toggle fullscreen |
| Take Thumbnail | Capture room screenshot, saved to IndexedDB |
| Export ZIP | Download deployable ZIP for publishing |
| Import ZIP | Restore room from a previously exported ZIP |
| Clear All Data | Delete all data (IndexedDB + localStorage) and restart |
| Add Custom Room | Upload your own GLB room model |
| Adjust Room | Scale, position, rotation sliders |
| Add Image | Upload and place images in the room |
| Add Video | Upload and place MP4 videos |
| Credit Board | Display room credits or announcement messages |
| Add My Avatar | Place your VRM as a figurine with pose |
| Add Portal | Create a global portal to another room |
| Add Friend Portal | Create a friend portal (blue) |
| Edit Friend List | Manage friend portal destinations |
| Add Works Portal | Create a works portal (yellow) |
| Edit Works List | Manage works portal destinations |

All placed objects (images, videos, credit boards, avatars, portals) can be re-edited by double-clicking them.

## Publishing Your Room

1. Use **Export ZIP** from the context menu
2. Unzip — you'll find a `public/` folder inside
3. Copy `public/` into your room directory on the server:

```
room/
├── index.html
├── app.js
├── style.css
├── js/
├── assets/
└── public/          ← exported folder
    └── manifest.json
```

4. With `public/` present, the room automatically enters **public mode** (read-only for visitors)

### Unpublishing

Remove `public/` entirely, or just delete/rename `public/manifest.json`.
External visitors check for `manifest.json` first — if it's missing, the room is inaccessible.

### Re-editing in Public Mode

Press `/` (slash) to toggle back into edit mode while `public/` exists.

### manifest.json

Contains all placement data (coordinates, scale, rotation) for every object in the room. You can hand-edit the values directly if needed.

## Backup and Restore

Your room data lives in the browser (localStorage + IndexedDB). Use Export/Import ZIP to back up and restore everything.

### Backup

**Export ZIP** saves the complete room state: room GLB, all placed media (images, videos), VRM figurine with pose, credit board content, portal placements, and all coordinates/scales.

### Restore

**Import ZIP** restores a room from a previously exported ZIP. This overwrites all current data — you'll be prompted to back up first.

### Switching Between Rooms

1. Export current room as ZIP (backup)
2. Clear All Data
3. Import a different ZIP

### Clear All Data

Deletes all localStorage and IndexedDB data. The setup wizard will appear on next load. Use this before importing to ensure a clean state.

## Directory Structure

```
room/
room/
├── index.html
├── app.js              ← init/loadRoom/disposeRoom/loadExternalRoom
├── style.css
├── config.js           ← 共通定数
├── portal_list.json
├── js/
│   ├── avatar.js       ← disposeAvatar追加
│   ├── controls.js     ← tryPortalInteract/checkPortalProximity export、@座標デバッグ
│   ├── corridor.js     ← 広場（旧コリドー）、prefetchPortalList
│   ├── editor.js       ← Room Info フォーム
│   ├── media.js        ← ポータルURL削除、portalType
│   ├── menu.js
│   ├── portal-editor.js ← Friend/Worksポータルリスト編集UI
│   ├── portal-effect.js ← 共通エフェクト、clearAllPortalAnimations
│   ├── room-loader.js  ← onProgress対応
│   ├── setup.js
│   ├── vr.js           ← VRポータル操作、デバウンス修正
│   └── vr-ui.js        ← VR用3Dヒント表示（汎用スプライト）
├── assets/
│   ├── room/
│   ├── avatar/
│   ├── pose/
│   └── models/         ← Kenney CC0素材（grass, door, flowers, barrel）
└── public/             ← エクスポート済み公開データ
```

## Data Storage

### localStorage (lightweight metadata)

| Key | Contents |
|-----|----------|
| `room_config` | Wizard settings (roomId, avatarId, skyPreset, roomDefaults, roomMeta) |
| `room_media` | Media placement metadata array |
| `friend_portal_list` | Friend portal entries (JSON array) |
| `works_portal_list` | Works portal entries (JSON array) |

### IndexedDB: RoomDB.assets (binary / large data)

| Key Pattern | Contents |
|-------------|----------|
| `custom_room_*` | Custom GLB binary (ArrayBuffer) |
| `custom_vrm` | Custom VRM binary (ArrayBuffer) |
| `media_<id>` | Image (base64 data URL) or video (ArrayBuffer) |
| `meta_custom_room_*` | Room metadata (name, author, license, thumbnail, triangles) |
| `meta_room_<roomId>` | Preset room metadata (thumbnail, etc.) |

## Tech Stack

- **Three.js** (r170) — 3D rendering
- **@pixiv/three-vrm** — VRM avatar support
- **three-mesh-bvh** — BVH raycast collision
- **Dexie** — IndexedDB wrapper
- **WebXR** — VR mode for Meta Quest
- No build tools — `importmap` + CDN

## Portal System

Rooms connect via portals. A shared `portal_list.json` hosted on GitHub serves as the public directory. Registration via Pull Request — merge to publish. No server required.

When entering a portal (or pressing Back), a procedural plaza is generated with portal entrances arranged in a row, each with a banner image or text label showing the destination info.

### portal_list.json Format

```json
[
  {
    "name": "Lain's Room",
    "url": "https://lain-lab.com/room/",
    "image": "https://lain-lab.com/room/banner.webp",
    "description": "Main room with VRM figurines and portals"
  }
]
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Room name displayed on portal label |
| `url` | Yes | Full URL to the room |
| `description` | No | Short description (shown on text label fallback) |
| `image` | No | Banner image URL (falls back to text label if missing or CORS-blocked) |

### Banner Image Specs

- **Recommended size:** 480 × 120 px (4:1 aspect ratio)
- **Format:** WebP or PNG, keep under 30KB
- **CORS:** The banner URL must be accessible cross-origin. If your server doesn't send `Access-Control-Allow-Origin: *`, the banner silently falls back to a text label. Netlify, GitHub Pages, Vercel, and Cloudflare Pages serve CORS headers by default.

### Portal Types

Three portal types, each with its own color and data source:

| Type | Color | Data Source | Use Case |
|------|-------|-------------|----------|
| **Global** | Green (#00ff88) | `portal_list.json` on GitHub | Public directory — all rooms |
| **Friend** | Blue (#4488ff) | `portal_list_private.json` / localStorage | Private links between rooms |
| **Works** | Yellow (#ffaa00) | `portal_list_works.json` / localStorage | Your own rooms as a portfolio |

Friend and Works portals are managed via the in-room editor (right-click → **Edit Friend List** / **Edit Works List**). Each entry has name, URL, banner image, and description. Portal lists are included in the exported ZIP as `public/portal_list_private.json` and `public/portal_list_works.json`.


![WIRED ROOM Edit portal List](https://assets.lain-lab.com/images/uploads/WIRED_ROOM_EDIT_PORTAL.webp)

### Registering Your Room

To add your room to the global portal directory, contact via
https://lain-lab.com/contact with your room name, URL, and banner image.


## Design Principles

- **No server.** Static files only.
- **No griefing surface.** Each person hosts their own room on their own server.
- **No build tools.** importmap + CDN.
- **Data-driven.** JSON config defines everything.
- **Incremental.** Ship what works, add features later.

## License

MIT
