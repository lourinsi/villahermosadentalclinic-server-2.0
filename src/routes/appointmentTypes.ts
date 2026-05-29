import express, { Router, Request, Response } from 'express';
import { APPOINTMENT_TYPE_OPTIONS } from '../shared/appointmentTypes';

const router = Router();

/**
 * GET /api/appointment-types
 * Returns all available appointment types with pricing and duration
 */
router.get('/', (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: APPOINTMENT_TYPE_OPTIONS,
      message: 'Appointment types retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointment types',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
