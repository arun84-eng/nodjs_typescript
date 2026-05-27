import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import path from 'path';
import { AppError } from './errorHandler';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10');
const MAX_FILE_SIZE    = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.csv']);

// ─── Use memory storage (no disk writes, safer for multi-tenant) ──────────────
const storage = multer.memoryStorage();

// ─── File filter ──────────────────────────────────────────────────────────────
function fileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    cb(new AppError(400, `File type not allowed. Supported: PDF, TXT, MD, CSV`));
    return;
  }
  cb(null, true);
}

// ─── Upload middleware ────────────────────────────────────────────────────────
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files:    5,  // Max 5 files per request
  },
});

// ─── Single file upload ───────────────────────────────────────────────────────
export const uploadSingle = upload.single('file');

// ─── Multiple files upload ────────────────────────────────────────────────────
export const uploadMultiple = upload.array('files', 5);
