import express from "express";
import multer from "multer";
import ImportController from "../controllers/importController.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Stage 0 — parse + preview only (no AI)
router.post("/upload", upload.single("file"), (req, res, next) => {
  ImportController.uploadPreview(req, res).catch(next);
});

// Two-stage AI extraction, streamed over SSE
router.post("/import", upload.single("file"), (req, res, next) => {
  ImportController.importLeads(req, res).catch(next);
});

export default router;
