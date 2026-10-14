import { BadRequestException } from '@nestjs/common';

// ---------------------------------------------------------------------------
// Blocked extensions — rejected unconditionally regardless of mode
// ---------------------------------------------------------------------------
const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'sh',
  'bat',
  'cmd',
  'ps1',
  'php',
  'js',
  'ts',
  'py',
  'rb',
  'pl',
  'jsp',
  'asp',
  'aspx',
  'cgi',
  'htaccess',
  'svg',
  'xml',
  'html',
  'htm',
]);

// ---------------------------------------------------------------------------
// Allowed extensions per mode
// ---------------------------------------------------------------------------
const ALLOWED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ALLOWED_DOCUMENT_EXT = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'pdf',
  'doc',
  'docx',
]);
const ALLOWED_EXCEL_EXT = new Set(['xls', 'xlsx']);

// ---------------------------------------------------------------------------
// Magic bytes detector
// Returns a stable token string, or null if unrecognised.
// ---------------------------------------------------------------------------
function detectMagic(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';

  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  )
    return 'png';

  // WEBP: RIFF....WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer.length >= 12 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  )
    return 'webp';

  // PDF: %PDF
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  )
    return 'pdf';

  // ZIP-based (xlsx, docx): PK\x03\x04
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  )
    return 'zip';

  // Legacy OLE2 compound document (xls, doc): D0 CF 11 E0
  if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  )
    return 'ole2';

  // HEIC/HEIF: bytes 4-7 = 'ftyp', bytes 8-11 = brand
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    const brand = buffer.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'heic';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Post-buffer validator — call this inside the controller after multer buffers
// Throws BadRequestException on any violation.
// ---------------------------------------------------------------------------
export function validateUploadedFile(
  file: Express.Multer.File,
  mode: 'image' | 'document' | 'excel',
): void {
  if (!file) throw new BadRequestException('File is required.');

  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  const magic = detectMagic(file.buffer);

  // Block dangerous extensions first
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new BadRequestException(`File type .${ext} is not allowed.`);
  }

  if (mode === 'image') {
    if (!ALLOWED_IMAGE_EXT.has(ext)) {
      throw new BadRequestException(
        'Only JPG, PNG, and WEBP images are allowed.',
      );
    }
    if (!magic || !['jpeg', 'png', 'webp'].includes(magic)) {
      throw new BadRequestException(
        'File content does not match an allowed image format.',
      );
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('Image must not exceed 2 MB.');
    }
  }

  if (mode === 'document') {
    if (!ALLOWED_DOCUMENT_EXT.has(ext)) {
      throw new BadRequestException(
        'Only JPG, PNG, WEBP, HEIC, PDF, DOC, and DOCX files are allowed.',
      );
    }
    const validMagic =
      ['jpeg', 'png', 'webp', 'pdf', 'heic'].includes(magic) ||
      (magic === 'zip' && ext === 'docx') ||
      (magic === 'ole2' && ext === 'doc');
    if (!validMagic) {
      throw new BadRequestException(
        'File content does not match an allowed document format.',
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Document must not exceed 10 MB.');
    }
  }

  if (mode === 'excel') {
    if (!ALLOWED_EXCEL_EXT.has(ext)) {
      throw new BadRequestException(
        'Only Excel files (.xls, .xlsx) are allowed.',
      );
    }
    // xlsx → ZIP magic; xls → OLE2 magic
    const validMagic =
      (ext === 'xlsx' && magic === 'zip') ||
      (ext === 'xls' && magic === 'ole2');
    if (!validMagic) {
      throw new BadRequestException(
        'File content does not match a valid Excel format.',
      );
    }
    // if (file.size > 10 * 1024 * 1024) {
    //   throw new BadRequestException('Excel file must not exceed 10 MB.');
    // }
  }
}

// ---------------------------------------------------------------------------
// Multer fileFilter callbacks — EXTENSION CHECK ONLY (no MIME check).
//
// strict MIME checks in fileFilter reject files
// before magic bytes validation can run, because Postman/browsers often
// send multipart files with generic MIME types (application/octet-stream).
// MIME is client-controlled and unreliable. The real security check is
// validateUploadedFile() called in the controller after buffering.
// ---------------------------------------------------------------------------

export const imageFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(
      new BadRequestException(`File type .${ext} is not allowed.`),
      false,
    );
  }
  if (!ALLOWED_IMAGE_EXT.has(ext)) {
    return cb(
      new BadRequestException('Only JPG, PNG, and WEBP images are allowed.'),
      false,
    );
  }
  cb(null, true);
};

export const documentFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(
      new BadRequestException(`File type .${ext} is not allowed.`),
      false,
    );
  }
  if (!ALLOWED_DOCUMENT_EXT.has(ext)) {
    return cb(
      new BadRequestException(
        'Only JPG, PNG, WEBP, HEIC, PDF, DOC, and DOCX files are allowed.',
      ),
      false,
    );
  }
  cb(null, true);
};

export const excelFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();
  if (!ALLOWED_EXCEL_EXT.has(ext)) {
    return cb(
      new BadRequestException('Only Excel files (.xls, .xlsx) are allowed.'),
      false,
    );
  }
  cb(null, true);
};

// Mixed filter for driver POST/PUT which accepts both image and document fields.
// fieldname determines which ruleset applies.
export const driverFileFilter = (
  _req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  if (file.fieldname === 'image') {
    return imageFileFilter(_req, file, cb);
  }
  return documentFileFilter(_req, file, cb);
};
