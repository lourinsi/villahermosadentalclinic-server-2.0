import { Router, Request, Response } from "express";
import { APPOINTMENT_STATUSES } from "../shared/appointmentStatuses";
import { PAYMENT_STATUSES } from "../shared/paymentStatuses";
import {
  CART_APPOINTMENT_STATUS,
  CART_APPOINTMENT_STATUS_LABEL,
  normalizeStatus,
} from "../constants/appointmentStatuses";
import {
  applyDefaultAppointmentStatusColors,
  applyDefaultPaymentStatusColors,
  normalizePaymentStatus,
} from "../shared/statusColors";
import { prisma } from "../lib/prisma";

const router = Router();
const HIDDEN_PAYMENT_STATUS_VALUES = new Set(["pay-at-clinic"]);

router.get("/appointments", async (req: Request, res: Response) => {
  try {
    const config = await prisma.statusConfig.findUnique({ where: { key: "appointment" } });
    const rawStatuses = Array.isArray(config?.value) ? config.value : APPOINTMENT_STATUSES;
    const appointmentStatusesByValue = new Map<string, any>();

    for (const status of rawStatuses as any[]) {
      const value = normalizeStatus(status.value);
      const isCartStatus = value === CART_APPOINTMENT_STATUS;
      if (appointmentStatusesByValue.has(value)) continue;

      appointmentStatusesByValue.set(
        value,
        applyDefaultAppointmentStatusColors({
          key: status.key,
          value,
          label: isCartStatus ? CART_APPOINTMENT_STATUS_LABEL : status.label,
          description: isCartStatus
            ? "In the patient's appointment cart awaiting checkout"
            : status.description,
          bgColor: status.bgColor,
          textColor: status.textColor,
        })
      );
    }

    const appointmentStatuses = Array.from(appointmentStatusesByValue.values());

    res.json({
      success: true,
      data: appointmentStatuses,
      message: "Appointment statuses retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching appointment statuses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment statuses",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.get("/payments", async (req: Request, res: Response) => {
  try {
    const config = await prisma.statusConfig.findUnique({ where: { key: "payment" } });
    const configuredStatuses = Array.isArray(config?.value) ? config.value : [];
    const rawStatuses = [...configuredStatuses, ...PAYMENT_STATUSES];
    const paymentStatusesByValue = new Map<string, any>();

    for (const status of rawStatuses as any[]) {
      const value = normalizePaymentStatus(status.value);
      if (!value || HIDDEN_PAYMENT_STATUS_VALUES.has(value) || paymentStatusesByValue.has(value)) continue;

      paymentStatusesByValue.set(
        value,
        applyDefaultPaymentStatusColors({
          key: status.key,
          value,
          label: status.label,
          description: status.description,
          bgColor: status.bgColor,
          textColor: status.textColor,
        })
      );
    }

    const paymentStatuses = Array.from(paymentStatusesByValue.values());

    res.json({
      success: true,
      data: paymentStatuses,
      message: "Payment statuses retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment statuses",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
