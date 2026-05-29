import { Router } from "express";
import {
  addPatient,
  addPublicBookingPatient,
  addDependent,
  getPatients,
  getPatientById,
  updatePatient,
  deletePatient,
  changePassword,
} from "../controllers/patientController";
import { requireAuth, requireRole } from "../middleware/authMiddleware";

const router = Router();

// POST - Add or reuse a patient from the public booking modal
router.post("/public-booking", addPublicBookingPatient);

// POST - Add new patient (admin/doctor only)
router.post("/", requireAuth, addPatient);

// POST - Add dependent patient
router.post("/dependent", requireAuth, addDependent);

// GET - Get all patients (require auth so we can filter for patient role)
router.get("/", requireAuth, getPatients);

// GET - Get patient by ID
router.get("/:id", getPatientById);

// PUT - Update patient by ID (staff only)
router.put("/:id", requireAuth, requireRole(["admin", "doctor", "receptionist"]), updatePatient);

// POST - Change password
router.post("/:id/change-password", changePassword);

// DELETE - Soft delete patient by ID (staff only)
router.delete("/:id", requireAuth, requireRole(["admin", "doctor", "receptionist"]), deletePatient);

export default router;
