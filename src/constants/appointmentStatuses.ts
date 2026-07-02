export const CART_APPOINTMENT_STATUS = "add-to-cart";
export const LEGACY_CART_APPOINTMENT_STATUS = "pending";
export const CART_APPOINTMENT_STATUS_LABEL = "Add to Cart";

const appointmentStatusList = [
  { key: 1, value: "scheduled", label: "Scheduled", description: "Confirmed and scheduled" },
  { key: 2, value: CART_APPOINTMENT_STATUS, label: CART_APPOINTMENT_STATUS_LABEL, description: "In the patient's appointment cart awaiting checkout" },
  { key: 3, value: "reserved", label: "Reserved", description: "Reserved awaiting payment or clinic confirmation" },
  { key: 4, value: "cancelled", label: "Cancelled", description: "Appointment cancelled" },
  { key: 5, value: "completed", label: "Completed", description: "Appointment completed" },
  { key: 6, value: "tbd", label: "TBD", description: "Past appointment awaiting completion status" },
  { key: 7, value: "deleted", label: "Deleted", description: "Appointment hidden from receptionist views" },
];

export const APPOINTMENT_STATUS_KEYS = {
  SCHEDULED: 1,
  ADD_TO_CART: 2,
  RESERVED: 3,
  CANCELLED: 4,
  COMPLETED: 5,
  TBD: 6,
  DELETED: 7,
} as const;

export const APPOINTMENT_STATUS_VALUES: Record<number, string> = appointmentStatusList.reduce(
  (acc: any, status: any) => {
    acc[status.key] = status.value || status.key;
    return acc;
  },
  {}
);

export const APPOINTMENT_STATUSES = appointmentStatusList.reduce((acc: any, status: any) => {
  const statusValue = status.value || status.key;
  acc[statusValue.toUpperCase().replace(/-/g, "_")] = statusValue;
  return acc;
}, {}) as any;

export type AppointmentStatus = typeof APPOINTMENT_STATUSES[keyof typeof APPOINTMENT_STATUSES];

export const STATUS_DESCRIPTIONS: Record<string, string> = appointmentStatusList.reduce(
  (acc: any, status: any) => {
    const statusValue = status.value || status.key;
    acc[statusValue] = status.description;
    return acc;
  },
  {}
);

export const LEGACY_STATUS_MAP: Record<string, string> = {
  confirmed: "scheduled",
  tentative: "reserved",
  pending: CART_APPOINTMENT_STATUS,
  "add to cart": CART_APPOINTMENT_STATUS,
  "add-to-cart": CART_APPOINTMENT_STATUS,
  topay: "to-pay",
  "to pay": "to-pay",
  "to-pay": "to-pay",
  halfpaid: "half-paid",
  "half-paid": "half-paid",
  reserved: "reserved",
  canceled: "cancelled",
  cancelled: "cancelled",
  scheduled: "scheduled",
  completed: "completed",
  tbd: "tbd",
  deleted: "deleted",
} as const;

export const getStatusOptions = () =>
  appointmentStatusList.map((status: any) => ({
    label: status.label,
    value: status.value || status.key,
    description: status.description,
  }));

export const normalizeStatus = (status?: string | null): string => {
  if (!status) return CART_APPOINTMENT_STATUS;
  const normalized = status.toLowerCase().trim();
  return LEGACY_STATUS_MAP[normalized] || normalized;
};

export const isPatientCartStatus = (status?: string | null): boolean => {
  if (!String(status || "").trim()) return false;
  return normalizeStatus(status) === CART_APPOINTMENT_STATUS;
};

export const getAppointmentStatusesFromJSON = () => appointmentStatusList;
