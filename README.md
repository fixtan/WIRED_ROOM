# WIRED ROOM

3D walkable personal exhibition space built with vanilla JS + Three.js + WebXR.
Deploy as static files — no build tools, no server infrastructure.

## Overview

WIRED ROOM lets you create a 3D room you can walk around in, decorate with images, videos, VRM figurines, and credit boards, then export as a ZIP and host on any static file server. Visitors can explore your room in desktop browsers or Meta Quest VR headsets.

Rooms connect to each other through portals. No central server — each person hosts their own room on their own domain.

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

**CORS enabled by default:** Netlify, Cloudflare Pages, Vercel, GitHub Pages

**Requires configuration:** Apache (`.htaccess`), nginx (`add_header` directive)

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
| Thumbstick | Move (headset direction) |
| Controller ray | Interact |

## Context Menu (Edit Mode)

![WIRED ROOM context menu](https://assets.lain-lab.com/images/uploads/WIRED_ROOM_MENU.webp)

| Menu Item | Description |
|-----------|-------------|
| Room Info | Edit title, credits, announcement text |
| Reset Settings | Clear localStorage, re-run setup wizard |
| Fullscreen | Toggle fullscreen |
| Take Thumbnail | Capture room screenshot, saved to IndexedDB |
| Export ZIP | Download deployable ZIP for publishing |
| Add Custom Room | Upload your own GLB room model |
| Adjust Room | Scale, position, rotation sliders |
| Add Image | Upload and place images in the room |
| Add Video | Upload and place MP4 videos |
| Credit Board | Display room credits or announcement messages |
| Add My Avatar | Place your VRM as a figurine with pose |
| Add Portal | Create a warp point to another room |

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

## Directory Structure

```
room/
├── index.html
├── app.js              ← entry point: state, init, lights, render loop
├── style.css
├── js/
│   ├── avatar.js       ← VRM loading / animation / update
│   ├── controls.js     ← input / collision / movement / camera / portals
│   ├── editor.js       ← GLB upload / Room Info / adjustment sliders
│   ├── media.js        ← image / video / credit board placement
│   ├── menu.js         ← right-click context menu
│   ├── room-loader.js  ← GLB / room / furniture / skybox / portals
│   ├── setup.js        ← setup wizard / config management
│   └── vr.js           ← WebXR VR mode / Quest controllers
└── assets/
    ├── room/           ← GLB files + models.json + thumbnails
    ├── pose/           ← pose data for VRM figurines
    └── avatar/         ← VRM models + .vrma animations
```

## Data Storage

### localStorage (lightweight metadata)

| Key | Contents |
|-----|----------|
| `room_config` | Wizard settings (roomId, avatarId, skyPreset, roomDefaults, roomMeta) |
| `room_media` | Media placement metadata array |

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

## Portal System (Planned)

Rooms connect via portals. A shared `portal_list.json` hosted on GitHub serves as the public directory:

```json
[
  {
    "name": "Lain's Room",
    "url": "https://lain-lab.com/room/",
    "homepage": "https://lain-lab.com",
    "image": "https://lain-lab.com/banner.png",
    "message": "[2026-07-11]\nLAYER FIGHTER v2.0 released"
  }
]
```

Registration via Pull Request. Merge to publish. No server required.

When entering a portal, a procedural plaza is generated with portal entrances arranged around the perimeter, each with an info board showing the destination's name, message, and banner image.

## Design Principles

- **No server.** Static files only.
- **No griefing surface.** Each person hosts their own room on their own server.
- **No build tools.** importmap + CDN.
- **Data-driven.** JSON config defines everything.
- **Incremental.** Ship what works, add features later.

## License

MIT
