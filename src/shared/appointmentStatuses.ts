import { getDefaultAppointmentStatusColors } from "./statusColors";

export interface AppointmentStatusOption {
  key: number;
  value: string;
  label: string;
  description: string;
  bgColor: string;
  textColor: string;
}

export const CART_APPOINTMENT_STATUS = "add-to-cart";
export const CART_APPOINTMENT_STATUS_LABEL = "Add to Cart";

export const APPOINTMENT_STATUSES: AppointmentStatusOption[] = [
  {
    key: 1,
    value: "scheduled",
    label: "Scheduled",
    description: "Confirmed and scheduled",
    ...getDefaultAppointmentStatusColors("scheduled")
  },
  {
    key: 2,
    value: CART_APPOINTMENT_STATUS,
    label: CART_APPOINTMENT_STATUS_LABEL,
    description: "In the patient's appointment cart awaiting checkout",
    ...getDefaultAppointmentStatusColors(CART_APPOINTMENT_STATUS)
  },
  {
    key: 3,
    value: "reserved",
    label: "Reserved",
    description: "Reserved awaiting payment or clinic confirmation",
    ...getDefaultAppointmentStatusColors("reserved")
  },
  {
    key: 4,
    value: "cancelled",
    label: "Cancelled",
    description: "Appointment cancelled",
    ...getDefaultAppointmentStatusColors("cancelled")
  },
  {
    key: 5,
    value: "completed",
    label: "Completed",
    description: "Appointment completed",
    ...getDefaultAppointmentStatusColors("completed")
  },
  {
    key: 6,
    value: "tbd",
    label: "TBD",
    description: "Past appointment awaiting completion status",
    ...getDefaultAppointmentStatusColors("tbd")
  },
];

/**
 * Get status option by value/key
 */
export const getStatusOption = (statusValue: string | number): AppointmentStatusOption | undefined => {
  if (typeof statusValue === 'number') {
    return APPOINTMENT_STATUSES.find(s => s.key === statusValue);
  }
  return APPOINTMENT_STATUSES.find(s => s.value === statusValue);
};

/**
 * Get status label by value
 */
export const getStatusLabel = (statusValue: string | number): string => {
  const status = getStatusOption(statusValue);
  return status?.label || String(statusValue);
};

/**
 * Get status description by value
 */
export const getStatusDescription = (statusValue: string | number): string => {
  const status = getStatusOption(statusValue);
  return status?.description || '';
};

/**
 * All valid status values
 */
export const VALID_STATUS_VALUES = APPOINTMENT_STATUSES.map(s => s.value);

/**
 * Check if a value is a valid status
 */
export const isValidStatus = (value: string | number): boolean => {
  if (typeof value === 'number') {
    return APPOINTMENT_STATUSES.some(s => s.key === value);
  }
  return VALID_STATUS_VALUES.includes(value);
};

/**
 * Status type for TypeScript
 */
export type AppointmentStatus = typeof APPOINTMENT_STATUSES[number]['value'];
