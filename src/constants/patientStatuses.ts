/**
 * Patient Status Constants
 * 
 * Standardized patient status system to avoid redundancy
 * and ensure consistency across the application
 */

export const PATIENT_STATUSES = {
  // Primary statuses - mutually exclusive
  ACTIVE: 'active',           // Patient is currently active and can book appointments
  INACTIVE: 'inactive',       // Patient has been deactivated (e.g., moved, no longer using service)
  
  // Status combinations can be extended if needed
  // Example: "archived" could be added for historical patients
} as const;

export type PatientStatus = typeof PATIENT_STATUSES[keyof typeof PATIENT_STATUSES];

/**
 * Status Descriptions for UI/Documentation
 */
export const STATUS_DESCRIPTIONS: Record<PatientStatus, string> = {
  [PATIENT_STATUSES.ACTIVE]: 'Patient is active and can schedule appointments',
  [PATIENT_STATUSES.INACTIVE]: 'Patient account is inactive',
} as const;

/**
 * Get available status options for filtering/selection
 */
export const getStatusOptions = () => Object.entries(PATIENT_STATUSES).map(([key, value]) => ({
  label: key.charAt(0) + key.slice(1).toLowerCase(),
  value: value,
  description: STATUS_DESCRIPTIONS[value],
}));