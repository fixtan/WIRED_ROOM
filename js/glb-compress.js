// glb-compress.js - Standalone GLB texture compressor
// Converts embedded PNG/JPEG textures to WebP inside GLB files.
// No external dependencies. Pure browser JavaScript.
//
// Usage:
//   import { compressGLB } from './js/glb-compress.js';
//   const compressed = await compressGLB(glbArrayBuffer, { quality: 0.75 });
//   // compressed is a new ArrayBuffer
//
// Command-line usage (Node.js):ほぼ同等の圧縮率
//  gltf-transform webp easter_eggs_blue_collection.glb output.glb
//
// ============================================================
// Public API
// ============================================================

/**
 * Compress a GLB file by converting embedded textures to WebP.
 * @param {ArrayBuffer} glbBuffer - Original GLB file data
 * @param {Object} [options]
 * @param {number} [options.quality=0.75] - WebP quality (0.0–1.0)
 * @param {number} [options.maxSize=2048] - Max texture dimension (width/height)
 * @param {function} [options.onProgress] - Progress callback (stage, percent)
 * @returns {Promise<ArrayBuffer>} Compressed GLB data
 */
export async function compressGLB(glbBuffer, options = {}) {
  const quality = options.quality ?? 0.75;
  const maxSize = options.maxSize ?? 2048;
  const onProgress = options.onProgress || (() => {});

  // 1. Parse GLB
  onProgress('parse', 0);
  const glb = parseGLB(glbBuffer);
  if (!glb) throw new Error('Invalid GLB file');

  const json = glb.json;
  const binChunk = glb.bin;

  if (!json.images || json.images.length === 0) {
    console.log('[GLB-COMPRESS] No images found, returning original');
    return glbBuffer;
  }

  // 2. Compress each image texture to WebP
  const imageCount = json.images.length;
  const newImageBuffers = [];

  for (let i = 0; i < imageCount; i++) {
    onProgress('texture', Math.round((i / imageCount) * 100));
    const image = json.images[i];

    // Get original image bytes from bufferView
    const bv = json.bufferViews[image.bufferView];
    const offset = bv.byteOffset || 0;
    const length = bv.byteLength;
    const originalBytes = new Uint8Array(binChunk, offset, length);

    // Check if already WebP
    if (image.mimeType === 'image/webp' || isWebP(originalBytes)) {
      newImageBuffers.push({ data: originalBytes, mimeType: 'image/webp' });
      continue;
    }

    // Convert to WebP via Canvas
    try {
      const webpBytes = await imageToWebP(originalBytes, image.mimeType, quality, maxSize);
      // Only use WebP if it's actually smaller
      if (webpBytes.byteLength < originalBytes.byteLength) {
        newImageBuffers.push({ data: new Uint8Array(webpBytes), mimeType: 'image/webp' });
        const ratio = ((1 - webpBytes.byteLength / originalBytes.byteLength) * 100).toFixed(0);
        console.log(`[GLB-COMPRESS] Image ${i}: ${formatSize(originalBytes.byteLength)} → ${formatSize(webpBytes.byteLength)} (-${ratio}%)`);
      } else {
        newImageBuffers.push({ data: originalBytes, mimeType: image.mimeType });
        console.log(`[GLB-COMPRESS] Image ${i}: WebP larger, keeping original`);
      }
    } catch (e) {
      console.warn(`[GLB-COMPRESS] Image ${i} conversion failed, keeping original:`, e);
      newImageBuffers.push({ data: originalBytes, mimeType: image.mimeType });
    }
  }

  // 3. Rebuild binary buffer
  onProgress('rebuild', 0);

  // Collect all non-image bufferView data
  const imageBufferViewIndices = new Set(
    json.images.map(img => img.bufferView)
  );

  // Build new buffer: non-image data first, then image data
  const segments = [];
  const newBufferViews = [];

  // Copy existing bufferViews (non-image ones keep original data)
  let currentOffset = 0;

  for (let bvIndex = 0; bvIndex < json.bufferViews.length; bvIndex++) {
    const bv = json.bufferViews[bvIndex];

    if (imageBufferViewIndices.has(bvIndex)) {
      // This bufferView is an image — will be replaced later
      // Find which image index uses this bufferView
      const imgIndex = json.images.findIndex(img => img.bufferView === bvIndex);
      const newData = newImageBuffers[imgIndex].data;

      // Align to 4 bytes
      const padding = (4 - (currentOffset % 4)) % 4;
      if (padding > 0) {
        segments.push(new Uint8Array(padding));
        currentOffset += padding;
      }

      segments.push(newData);
      newBufferViews.push({
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: newData.byteLength,
      });
      currentOffset += newData.byteLength;
    } else {
      // Non-image bufferView — copy original data
      const offset = bv.byteOffset || 0;
      const length = bv.byteLength;
      const data = new Uint8Array(binChunk, offset, length);

      // Align to 4 bytes
      const padding = (4 - (currentOffset % 4)) % 4;
      if (padding > 0) {
        segments.push(new Uint8Array(padding));
        currentOffset += padding;
      }

      segments.push(data);
      const newBv = {
        buffer: 0,
        byteOffset: currentOffset,
        byteLength: length,
      };
      // Preserve target and byteStride if present
      if (bv.target !== undefined) newBv.target = bv.target;
      if (bv.byteStride !== undefined) newBv.byteStride = bv.byteStride;
      newBufferViews.push(newBv);
      currentOffset += length;
    }
  }

  // Final padding to 4-byte alignment
  const finalPadding = (4 - (currentOffset % 4)) % 4;
  if (finalPadding > 0) {
    segments.push(new Uint8Array(finalPadding));
    currentOffset += finalPadding;
  }

  // Merge segments into single buffer
  const newBinBuffer = new Uint8Array(currentOffset);
  let writeOffset = 0;
  for (const seg of segments) {
    newBinBuffer.set(seg, writeOffset);
    writeOffset += seg.byteLength;
  }

  // 4. Update JSON
  const newJson = JSON.parse(JSON.stringify(json));
  newJson.bufferViews = newBufferViews;
  newJson.buffers = [{ byteLength: newBinBuffer.byteLength }];

  // Update image mimeTypes
  for (let i = 0; i < newJson.images.length; i++) {
    newJson.images[i].mimeType = newImageBuffers[i].mimeType;
  }

  // 5. Rebuild GLB
  onProgress('rebuild', 50);
  const result = buildGLB(newJson, newBinBuffer);

  const originalSize = glbBuffer.byteLength;
  const compressedSize = result.byteLength;
  const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  console.log(`[GLB-COMPRESS] Total: ${formatSize(originalSize)} → ${formatSize(compressedSize)} (-${ratio}%)`);

  onProgress('done', 100);
  return result;
}

// ============================================================
// GLB Parser
// ============================================================

function parseGLB(buffer) {
  const view = new DataView(buffer);

  // Header: magic(4) + version(4) + length(4)
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) return null; // 'glTF'

  const version = view.getUint32(4, true);
  if (version !== 2) return null;

  // JSON chunk
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);
  if (jsonChunkType !== 0x4E4F534A) return null; // 'JSON'

  const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const json = JSON.parse(jsonStr);

  // BIN chunk
  const binChunkOffset = 20 + jsonChunkLength;
  let bin = null;

  if (binChunkOffset < buffer.byteLength) {
    const binChunkLength = view.getUint32(binChunkOffset, true);
    const binChunkType = view.getUint32(binChunkOffset + 4, true);
    if (binChunkType === 0x004E4942) { // 'BIN\0'
      bin = buffer.slice(binChunkOffset + 8, binChunkOffset + 8 + binChunkLength);
    }
  }

  return { json, bin };
}

// ============================================================
// GLB Builder
// ============================================================

function buildGLB(json, binBuffer) {
  const jsonStr = JSON.stringify(json);
  const jsonEncoder = new TextEncoder();
  let jsonBytes = jsonEncoder.encode(jsonStr);

  // Pad JSON to 4-byte alignment with spaces (0x20)
  const jsonPadding = (4 - (jsonBytes.byteLength % 4)) % 4;
  if (jsonPadding > 0) {
    const padded = new Uint8Array(jsonBytes.byteLength + jsonPadding);
    padded.set(jsonBytes);
    for (let i = jsonBytes.byteLength; i < padded.byteLength; i++) {
      padded[i] = 0x20; // space
    }
    jsonBytes = padded;
  }

  // Pad BIN to 4-byte alignment with zeros
  const binPadding = (4 - (binBuffer.byteLength % 4)) % 4;
  let binBytes = binBuffer;
  if (binPadding > 0) {
    const padded = new Uint8Array(binBuffer.byteLength + binPadding);
    padded.set(binBuffer instanceof Uint8Array ? binBuffer : new Uint8Array(binBuffer));
    binBytes = padded;
  }

  // Total length
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binBytes.byteLength;

  // Write GLB
  const glb = new ArrayBuffer(totalLength);
  const glbView = new DataView(glb);
  const glbArray = new Uint8Array(glb);

  // Header
  glbView.setUint32(0, 0x46546C67, true); // magic: 'glTF'
  glbView.setUint32(4, 2, true);           // version: 2
  glbView.setUint32(8, totalLength, true); // total length

  // JSON chunk
  glbView.setUint32(12, jsonBytes.byteLength, true);
  glbView.setUint32(16, 0x4E4F534A, true); // 'JSON'
  glbArray.set(jsonBytes, 20);

  // BIN chunk
  const binStart = 20 + jsonBytes.byteLength;
  glbView.setUint32(binStart, binBytes.byteLength, true);
  glbView.setUint32(binStart + 4, 0x004E4942, true); // 'BIN\0'
  glbArray.set(binBytes instanceof Uint8Array ? binBytes : new Uint8Array(binBytes), binStart + 8);

  return glb;
}

// ============================================================
// Image → WebP conversion via Canvas
// ============================================================

async function imageToWebP(imageBytes, mimeType, quality, maxSize) {
  // Create Blob from raw bytes
  const blob = new Blob([imageBytes], { type: mimeType || 'image/png' });

  // Decode to ImageBitmap
  const bitmap = await createImageBitmap(blob);

  // Calculate resize dimensions
  let { width, height } = bitmap;
  if (width > maxSize || height > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Draw to canvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Encode to WebP
  const webpBlob = await canvas.convertToBlob({ type: 'image/webp', quality });
  return await webpBlob.arrayBuffer();
}

// ============================================================
// Utilities
// ============================================================

function isWebP(bytes) {
  // RIFF....WEBP
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 &&
    bytes[10] === 0x42 && bytes[11] === 0x50;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
