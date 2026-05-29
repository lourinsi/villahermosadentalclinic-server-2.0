import express from 'express';
import { getAppointmentStatuses, getStatusDescription } from '../controllers/appointmentStatusController';

const router = express.Router();

// Get all appointment statuses
router.get('/options', getAppointmentStatuses);

// Get status description
router.get('/:status/description', getStatusDescription);

export default router;