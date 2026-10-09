/**
 * Detects the real image type from magic bytes (never trusts the client's MIME type or file
 * extension) and reads pixel dimensions from the header. SVG is intentionally unsupported
 * because it can carry scripts.
 */
const TYPES = Object.freeze({
  png: { mime: 'image/png', ext: 'png' },
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  gif: { mime: 'image/gif', ext: 'gif' },
  webp: { mime: 'image/webp', ext: 'webp' },
});

function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpSize(buffer) {
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && buffer.length >= 30) return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && buffer.length >= 30) return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  return null;
}

/** Returns { mime, ext, width, height } or null when the buffer is not a supported image. */
export function inspectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return null;
  let type = null;
  let size = null;
  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    type = TYPES.png;
    size = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    type = TYPES.jpeg;
    size = jpegSize(buffer);
  } else if (buffer.toString('ascii', 0, 4) === 'GIF8') {
    type = TYPES.gif;
    size = { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  } else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    type = TYPES.webp;
    size = webpSize(buffer);
  }
  if (!type || !size || !size.width || !size.height) return null;
  return { ...type, ...size };
}
