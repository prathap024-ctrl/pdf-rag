import { Router } from "express";
import {
  deletePdfBId,
  fetchPdfById,
  fetchPdfs,
  generatePdfResponse,
  inputPdf,
} from "../controllers/PDF.controllers.js";
import upload from "../middleware/multer.middlewares.js";

const router = Router();

router.route("/load-pdf").post(upload.single("newPdf"), inputPdf);
router.route("/pdf-response").post(generatePdfResponse);
router.route("/fetch-pdf").get(fetchPdfs);
router.route("/fetch-pdf/:id").get(fetchPdfById);
router.route("/delete-pdf/:id").delete(deletePdfBId);

export default router;
