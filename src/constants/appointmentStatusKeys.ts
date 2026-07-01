/**
 * Appointment Status Keys - Single Source of Truth
 * 
 * IMPORTANT: Keep this file in sync with:
 * - Client: villahermosa-dental-clinic/lib/appointmentStatusKeys.ts
 * 
 * Numeric keys are stable and never change. If you add new statuses,
 * assign them the next available number. Never reuse or change existing keys.
 */

export const APPOINTMENT_STATUS_KEYS = {
  SCHEDULED: 1,
  ADD_TO_CART: 2,
  RESERVED: 3,
  CANCELLED: 4,
  COMPLETED: 5,
  TBD: 6,
  DELETED: 7,
} as const;

// Map for reference only (keys are what matter)
export const APPOINTMENT_STATUS_LABELS: Record<number, string> = {
  1: "Scheduled",
  2: "Add to Cart",
  3: "Reserved",
  4: "Cancelled",
  5: "Completed",
  6: "TBD",
  7: "Deleted",
} as const;

// Map for storage values (what gets saved to DB)
export const APPOINTMENT_STATUS_VALUES: Record<number, string> = {
  1: "scheduled",
  2: "add-to-cart",
  3: "reserved",
  4: "cancelled",
  5: "completed",
  6: "tbd",
  7: "deleted",
} as const;
