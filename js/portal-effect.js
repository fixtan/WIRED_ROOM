// portal-effect.js - Shared portal visual effect (rings + particles)
// Used by media.js (edit mode) and app.js (public mode)
import * as THREE from 'three';
import {
  PORTAL_COLORS,
  PORTAL_RING_COUNT,
  PORTAL_RING_SEGMENTS,
  PORTAL_RING_SPEED,
  PORTAL_PARTICLE_COUNT,
  PORTAL_RADIUS,
} from '../config.js';

// Shared ring geometry (created once)
let _ringGeo = null;
function getRingGeo() {
  if (!_ringGeo) _ringGeo = new THREE.RingGeometry(0.96, 1.0, PORTAL_RING_SEGMENTS);
  return _ringGeo;
}

// All active portal animations (for updatePortalAnimations)
const portalAnimations = [];

// ============================================================
// Create portal effect (rings + particles) → returns { group, animData }
// ============================================================
export function createPortalEffect(portalType) {
  const colorHex = PORTAL_COLORS[portalType] || PORTAL_COLORS.global;
  const color = new THREE.Color(colorHex);
  const radius = PORTAL_RADIUS;
  const group = new THREE.Group();

  // ── Rings ──
  const ringGeo = getRingGeo();
  const rings = [];
  const ringOffsets = [];
  for (let i = 0; i < PORTAL_RING_COUNT; i++) {
    ringOffsets.push(i / PORTAL_RING_COUNT);
  }

  for (let i = 0; i < PORTAL_RING_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.set(0.01, 0.01, 1);
    group.add(ring);
    rings.push({ mesh: ring, progress: ringOffsets[i] });
  }

  // ── Particles ──
  const positions = new Float32Array(PORTAL_PARTICLE_COUNT * 3);
  const particles = [];
  for (let i = 0; i < PORTAL_PARTICLE_COUNT; i++) {
    const p = {
      x: (Math.random() - 0.5) * radius * 1.2,
      y: Math.random() * 1.5,
      z: (Math.random() - 0.5) * radius * 1.2,
      speedY: 0.15 + Math.random() * 0.2,
      age: Math.random() * 2,
      maxAge: 2 + Math.random() * 2,
    };
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    particles.push(p);
  }
  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(particleGeo, new THREE.PointsMaterial({
    color, size: 0.04, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  group.add(points);

  // Animation data
  const animData = { group, rings, particles, particleGeo, radius };
  portalAnimations.push(animData);

  return { group, animData };
}

// ============================================================
// Update all portal animations (call from render loop)
// ============================================================
export function updatePortalAnimations(dt) {
  for (const anim of portalAnimations) {
    // Rings
    for (const ring of anim.rings) {
      ring.progress += dt * PORTAL_RING_SPEED;
      if (ring.progress > 1.0) ring.progress = 0.0;
      const s = ring.progress * anim.radius;
      ring.mesh.scale.set(s, s, 1);
      ring.mesh.material.opacity = (1.0 - ring.progress) * 0.7;
    }
    // Particles
    const posAttr = anim.particleGeo.attributes.position;
    for (let i = 0; i < anim.particles.length; i++) {
      const p = anim.particles[i];
      p.age += dt;
      p.y += p.speedY * dt;
      if (p.age > p.maxAge || p.y > 1.5) {
        p.x = (Math.random() - 0.5) * anim.radius * 1.2;
        p.y = 0;
        p.z = (Math.random() - 0.5) * anim.radius * 1.2;
        p.age = 0;
      }
      posAttr.setXYZ(i, p.x, p.y, p.z);
    }
    posAttr.needsUpdate = true;
  }
}

// ============================================================
// Remove a portal's animation data (for delete/cleanup)
// ============================================================
export function removePortalAnimation(group) {
  const idx = portalAnimations.findIndex(a => a.group === group);
  if (idx !== -1) portalAnimations.splice(idx, 1);
}
