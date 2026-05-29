export const APPOINTMENT_TYPES = [
  "Routine Cleaning",
  "Checkup",
  "Filling",
  "Root Canal",
  "Extraction",
  "Whitening",
  "Other",
];

export const APPOINTMENT_PRICES: Record<string, number> = {
  "Routine Cleaning": 1500,
  "Checkup": 500,
  "Filling": 1200,
  "Root Canal": 5000,
  "Extraction": 1500,
  "Whitening": 3000,
  "Other": 0,
};

export const getAppointmentTypeName = (typeIndex: number, customType?: string): string => {
  if (typeIndex === APPOINTMENT_TYPES.length - 1) {
    return customType || "Other";
  }
  return APPOINTMENT_TYPES[typeIndex] || "Unknown";
};

export const getAppointmentPrice = (typeIndex: number): number => {
  const typeName = APPOINTMENT_TYPES[typeIndex];
  return APPOINTMENT_PRICES[typeName] || 0;
};
