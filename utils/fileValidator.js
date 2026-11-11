const crypto = require('crypto');
const { UPLOAD_LIMITS } = require('../config/constants');

/**
 * Validates that a buffer has a valid PNG file signature (magic bytes).
 * PNG magic header: 89 50 4E 47 0D 0A 1A 0A
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isPngBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    return false;
  }
  return buffer.subarray(0, 8).equals(UPLOAD_LIMITS.PNG_SIGNATURE);
}

/**
 * Converts a base64 data URL or raw base64 string to a Buffer.
 * Supports: "data:image/png;base64,iVBORw0KGgo..." or raw base64.
 * @param {string} dataUrl
 * @returns {Buffer}
 */
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid image payload: string expected');
  }
  const base64Index = dataUrl.indexOf('base64,');
  const base64Data = base64Index !== -1 ? dataUrl.slice(base64Index + 7) : dataUrl;
  return Buffer.from(base64Data, 'base64');
}

/**
 * Validates an image buffer against size, mime type, and magic bytes.
 * @param {Buffer} buffer
 * @param {string} [name='image']
 * @returns {{ valid: boolean, error?: string, size: number }}
 */
function validatePngImage(buffer, name = 'Image') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { valid: false, error: `${name} buffer is missing or invalid.` };
  }

  if (buffer.length === 0) {
    return { valid: false, error: `${name} is empty (0 bytes).` };
  }

  if (buffer.length > UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    const limitMb = (UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      error: `${name} size (${sizeMb} MB) exceeds maximum allowed limit of ${limitMb} MB.`
    };
  }

  if (!isPngBuffer(buffer)) {
    return {
      valid: false,
      error: `${name} has invalid content: must be a genuine PNG file with valid signature.`
    };
  }

  return { valid: true, size: buffer.length };
}

/**
 * Generates collision-resistant unique filename.
 * @param {string} prefix
 * @param {string} extension
 * @returns {string}
 */
function generateUniqueFilename(prefix = 'design', extension = 'png') {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const cleanExt = extension.replace(/^\./, '');
  return `${prefix}_${timestamp}_${randomSuffix}.${cleanExt}`;
}

module.exports = {
  isPngBuffer,
  dataUrlToBuffer,
  validatePngImage,
  generateUniqueFilename
};

