import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, verifyTenantAccess } from '../../middleware/auth';
import { uploadSingle, uploadMultiple } from '../../middleware/upload';
import {
  uploadDocument,
  listDocuments,
  getDocument,
  deleteDocument,
} from '../../services/documentService';

const router = Router({ mergeParams: true });

// ─── POST /tenant/:tenantId/documents — Upload a document ─────────────────────
router.post(
  '/',
  authenticate,
  verifyTenantAccess,
  uploadSingle,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({
          success:   false,
          error:     'No file uploaded. Use multipart/form-data with field name "file".',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const doc = await uploadDocument(
        req.params.tenantId,
        req.file,
        req.body.metadata ? JSON.parse(req.body.metadata) : undefined
      );

      res.status(202).json({
        success:   true,
        message:   'Document upload accepted. Processing in background.',
        data:      doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /tenant/:tenantId/documents/batch — Upload multiple ─────────────────
router.post(
  '/batch',
  authenticate,
  verifyTenantAccess,
  uploadMultiple,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({
          success:   false,
          error:     'No files uploaded.',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const uploads = await Promise.all(
        files.map((file) => uploadDocument(req.params.tenantId, file))
      );

      res.status(202).json({
        success:   true,
        message:   `${uploads.length} document(s) accepted for processing.`,
        data:      uploads,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tenant/:tenantId/documents — List documents ─────────────────────────
router.get(
  '/',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page  = parseInt(String(req.query.page  || '1'));
      const limit = parseInt(String(req.query.limit || '20'));

      const { documents, total } = await listDocuments(
        req.params.tenantId,
        page,
        limit
      );

      res.json({
        success:   true,
        data:      documents,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /tenant/:tenantId/documents/:documentId — Get single document ─────────
router.get(
  '/:documentId',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const doc = await getDocument(req.params.tenantId, req.params.documentId);
      res.json({
        success:   true,
        data:      doc,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /tenant/:tenantId/documents/:documentId — Delete document ──────────
router.delete(
  '/:documentId',
  authenticate,
  verifyTenantAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deleteDocument(req.params.tenantId, req.params.documentId);
      res.json({
        success:   true,
        message:   'Document deleted successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
