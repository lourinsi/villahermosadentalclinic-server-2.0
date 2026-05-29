export interface AppointmentTypeOption {
  id: number;
  value: string;
  label: string;
  price?: number;
  duration?: number;
}

export const APPOINTMENT_TYPES = [
  "Routine Cleaning",
  "Checkup",
  "Filling",
  "Root Canal",
  "Extraction",
  "Whitening",
  "Other",
];

/**
 * Appointment type details with pricing and duration
 */
export const APPOINTMENT_TYPE_OPTIONS: AppointmentTypeOption[] = [
  { id: 0, value: "Routine Cleaning", label: "Routine Cleaning", price: 1500, duration: 30 },
  { id: 1, value: "Checkup", label: "Checkup", price: 500, duration: 30 },
  { id: 2, value: "Filling", label: "Filling", price: 1200, duration: 60 },
  { id: 3, value: "Root Canal", label: "Root Canal", price: 5000, duration: 90 },
  { id: 4, value: "Extraction", label: "Extraction", price: 1500, duration: 60 },
  { id: 5, value: "Whitening", label: "Whitening", price: 3000, duration: 60 },
  { id: 6, value: "Other", label: "Other", duration: 30 }
];

export const getAppointmentTypeName = (typeIndex: number, customType?: string): string => {
  // Type 6 (index) is the "Other" type
  if (typeIndex === 6) {
    return customType || "Other";
  }
  // For types 0-5, return the standard type name
  const standardTypes = [
    "Routine Cleaning",
    "Checkup",
    "Filling",
    "Root Canal",
    "Extraction",
    "Whitening",
  ];
  return standardTypes[typeIndex] || "Unknown";
};

/**
 * Get appointment type option by index
 */
export const getAppointmentTypeOption = (typeIndex: number): AppointmentTypeOption | undefined => {
  return APPOINTMENT_TYPE_OPTIONS[typeIndex];
};

/**
 * Get price for appointment type
 */
export const getAppointmentTypePrice = (typeIndex: number): number | undefined => {
  return APPOINTMENT_TYPE_OPTIONS[typeIndex]?.price;
};

/**
 * Get duration for appointment type
 */
export const getAppointmentTypeDuration = (typeIndex: number): number | undefined => {
  return APPOINTMENT_TYPE_OPTIONS[typeIndex]?.duration;
};
