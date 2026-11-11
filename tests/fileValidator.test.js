const {
  isPngBuffer,
  validatePngImage,
  dataUrlToBuffer,
  generateUniqueFilename
} = require('../utils/fileValidator');
const { UPLOAD_LIMITS } = require('../config/constants');

describe('File Validator Utility Tests', () => {
  // Valid 1x1 transparent PNG buffer
  const validPngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );

  it('should correctly identify valid PNG magic header bytes', () => {
    expect(isPngBuffer(validPngBuffer)).toBe(true);
  });

  it('should reject non-PNG buffers (e.g. text or JPEG)', () => {
    const textBuffer = Buffer.from('Hello world this is not an image');
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    expect(isPngBuffer(textBuffer)).toBe(false);
    expect(isPngBuffer(jpegBuffer)).toBe(false);
    expect(isPngBuffer(null)).toBe(false);
    expect(isPngBuffer(Buffer.alloc(4))).toBe(false);
  });

  it('should validate a genuine PNG image buffer', () => {
    const result = validatePngImage(validPngBuffer, 'Front Design');
    expect(result.valid).toBe(true);
    expect(result.size).toBe(validPngBuffer.length);
  });

  it('should reject empty buffer', () => {
    const result = validatePngImage(Buffer.alloc(0), 'Front Design');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('is empty');
  });

  it('should reject file that exceeds maximum allowed size', () => {
    // Mock oversized buffer check
    const originalMax = UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES;
    UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES = 50; // Temporarily lower threshold

    const result = validatePngImage(validPngBuffer, 'Front Design');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds maximum allowed limit');

    UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES = originalMax; // Restore
  });

  it('should correctly convert data URLs to Buffers', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const buffer = dataUrlToBuffer(dataUrl);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(isPngBuffer(buffer)).toBe(true);
  });

  it('should generate unique filenames with extension', () => {
    const filename1 = generateUniqueFilename('test', 'png');
    const filename2 = generateUniqueFilename('test', 'png');

    expect(filename1).toMatch(/^test_\d+_[a-f0-9]+\.png$/);
    expect(filename2).toMatch(/^test_\d+_[a-f0-9]+\.png$/);
    expect(filename1).not.toBe(filename2);
  });
});

