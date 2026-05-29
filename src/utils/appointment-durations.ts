export const ALLOWED_APPOINTMENT_DURATIONS = [30, 60, 90, 120] as const;
export type AppointmentDuration = typeof ALLOWED_APPOINTMENT_DURATIONS[number];

const ALLOWED_APPOINTMENT_DURATION_SET = new Set<number>(ALLOWED_APPOINTMENT_DURATIONS);

export const isAllowedAppointmentDuration = (value?: unknown) => {
  const duration = Number(value);
  return Number.isInteger(duration) && ALLOWED_APPOINTMENT_DURATION_SET.has(duration);
};

export const normalizeAppointmentDuration = (
  value?: unknown,
  fallback: AppointmentDuration = 30
): AppointmentDuration => {
  const duration = Number(value);
  return isAllowedAppointmentDuration(duration) ? (duration as AppointmentDuration) : fallback;
};
