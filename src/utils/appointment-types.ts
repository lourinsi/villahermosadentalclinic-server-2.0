export const APPOINTMENT_TYPES = [
  "Routine Cleaning",
  "Checkup",
  "Filling",
  "Root Canal",
  "Extraction",
  "Whitening",
  "Other",
  "Dentures",
  "Crowns",
  "Braces",
];

export const OTHER_APPOINTMENT_TYPE_INDEX = 6;

export const APPOINTMENT_PRICES: Record<string, number> = {
  "Routine Cleaning": 1500,
  "Checkup": 500,
  "Filling": 1200,
  "Root Canal": 5000,
  "Extraction": 1500,
  "Whitening": 3000,
  "Other": 0,
  "Dentures": 10000,
  "Crowns": 8000,
  "Braces": 50000,
};

export const getAppointmentTypeName = (typeIndex: number, customType?: string): string => {
  if (typeIndex === OTHER_APPOINTMENT_TYPE_INDEX) {
    return customType || "Other";
  }
  return APPOINTMENT_TYPES[typeIndex] || "Unknown";
};

export const getAppointmentPrice = (typeIndex: number): number => {
  const typeName = APPOINTMENT_TYPES[typeIndex];
  return APPOINTMENT_PRICES[typeName] || 0;
};
