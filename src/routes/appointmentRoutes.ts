import { Router } from "express";
import {
  addAppointment,
  getAppointments,
  getPublicAppointmentAvailability,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  bookPublicAppointment,
  fetchRecurringAppointmentChain,
  fetchAppointmentLogs,
  fetchPaymentLogs,
} from "../controllers/appointmentController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

// POST - Public booking (no auth required)
router.post("/public-book", bookPublicAppointment);

// GET - Public availability (no auth required, anonymized)
router.get("/public-availability", getPublicAppointmentAvailability);

// GET - Recurring appointment chain preview
router.get("/:id/recurrence-chain", fetchRecurringAppointmentChain);

// GET - Appointment logs (supports public token or authenticated staff/patient)
router.get("/:id/logs", fetchAppointmentLogs);

// GET - Payment logs (supports public token or authenticated staff/patient)
router.get("/:id/payments", fetchPaymentLogs);

// POST - Add new appointment
router.post("/", requireAuth, addAppointment);

// GET - Get all appointments
router.get("/", requireAuth, getAppointments);

// GET - Get appointment by ID
router.get("/:id", requireAuth, getAppointmentById);

// PUT - Update appointment
router.put("/:id", requireAuth, updateAppointment);

// DELETE - Delete appointment
router.delete("/:id", requireAuth, deleteAppointment);

export default router;
