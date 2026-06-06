import { Appointment } from "../types/appointment";
import { CART_APPOINTMENT_STATUS, isPatientCartStatus, normalizeStatus } from "../constants/appointmentStatuses";
import { hasConflict } from "./appointment-helpers";
import { normalizeAppointmentDuration } from "./appointment-durations";
import { createAppointmentLog } from "./appointmentLogs";
import { getPastRestrictedAppointmentStatus } from "./appointmentStatusLifecycle";
import { DoctorIdentity } from "./doctorIdentity";
import { prisma } from "../lib/prisma";

type HandleAppointmentCloningArgs = {
  appointment: Appointment;
  allAppointments: Appointment[];
  recurrenceInput?: unknown;
  recurrenceInputProvided?: boolean;
  changedBy: string;
  changedByName?: string;
  doctorStaff?: DoctorIdentity[];
};

const RECURRING_APPOINTMENT_OPTIONS = ["7 days", "1 month", "3 months", "Custom"] as const;
type RecurringAppointmentOption = typeof RECURRING_APPOINTMENT_OPTIONS[number];
const DEFAULT_RECURRING_APPOINTMENT_OPTION: RecurringAppointmentOption = "1 month";

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeId = (value?: unknown): string | null => {
  const id = String(value || "").trim();
  return id || null;
};
const toAppointment = (appointment: unknown): Appointment => appointment as Appointment;

const normalizeDateOnly = (date?: unknown): string => {
  const value = String(date || "").trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) return value;

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    const parsed = new Date(year, month - 1, day);

    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return "";
};

const parseDateOnly = (date?: unknown): Date | null => {
  const value = normalizeDateOnly(date);
  if (!value) return null;

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const formatDateOnly = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const addMonthsClamped = (date: Date, months: number) => {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() + months;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDayOfTargetMonth);
  return new Date(targetYear, targetMonth, day);
};

const normalizeAppointmentRecurrence = (
  recurrence?: unknown,
): { enabled: boolean; option: RecurringAppointmentOption; customDate?: string | null } | null => {
  if (recurrence === null || recurrence === false) {
    return null;
  }

  const record = isRecord(recurrence) ? recurrence : { enabled: Boolean(recurrence) };
  if (!record.enabled) return null;

  return {
    enabled: true,
    option: RECURRING_APPOINTMENT_OPTIONS.includes(record.option) ? record.option : DEFAULT_RECURRING_APPOINTMENT_OPTION,
    customDate: normalizeDateOnly(record.customDate) || null,
  };
};

export const buildInitialAppointmentRecurrence = (_input?: unknown) => {
  return null; // Initial recurring logic is now deprecated
};

export const getRecurringGeneratedAppointments = async (
  _appointmentId?: string | null
): Promise<Appointment[]> => {
  return []; // Deprecated: no more chains
};

const getRecurrenceTargetDate = (appointmentDate: string, recurrence: { enabled: boolean; option: RecurringAppointmentOption; customDate?: string | null }) => {
  const sourceDate = parseDateOnly(appointmentDate);

  if (recurrence.option === "Custom") {
    const customDate = parseDateOnly(recurrence.customDate);
    if (!customDate || !sourceDate) return null;

    const today = parseDateOnly(formatDateOnly(new Date())) || new Date();
    const dayAfterSource = new Date(
      sourceDate.getFullYear(),
      sourceDate.getMonth(),
      sourceDate.getDate() + 1
    );
    const minimumDate = dayAfterSource.getTime() > today.getTime() ? dayAfterSource : today;

    return customDate.getTime() >= minimumDate.getTime() ? customDate : null;
  }

  if (!sourceDate) return null;

  const daysByOption: Record<RecurringAppointmentOption, { type: 'days' | 'months'; value: number }> = {
    "7 days": { type: 'days', value: 7 },
    "1 month": { type: 'months', value: 1 },
    "3 months": { type: 'months', value: 3 },
    Custom: { type: 'months', value: 1 },
  };

  const config = daysByOption[recurrence.option] || { type: 'months', value: 1 };
  if (config.type === 'days') {
    const result = new Date(sourceDate);
    result.setDate(sourceDate.getDate() + config.value);
    return result;
  }
  return addMonthsClamped(sourceDate, config.value);
};

const MAX_RECURRING_DAYS_TO_CHECK = 365;

const hasAppointmentConflict = ({
  appointments,
  date,
  appointment,
  excludeIds,
  doctorStaff,
}: {
  appointments: Appointment[];
  date: string;
  appointment: Appointment;
  excludeIds: Set<string>;
  doctorStaff: DoctorIdentity[];
}) =>
  hasConflict(
    appointments.filter((candidate) => !candidate.id || !excludeIds.has(candidate.id)),
    date,
    appointment.time,
    normalizeAppointmentDuration(appointment.duration),
    appointment.doctorId || appointment.doctor || "",
    undefined,
    appointment.patientId,
    doctorStaff
  );

const findRecurringAppointmentDate = ({
  appointment,
  allAppointments,
  targetDate,
  existingGeneratedAppointmentId,
  doctorStaff,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  targetDate: Date;
  existingGeneratedAppointmentId?: string | null;
  doctorStaff: DoctorIdentity[];
}) => {
  const excludeIds = new Set(
    [appointment.id, existingGeneratedAppointmentId].filter(Boolean).map(String)
  );

  for (let daysAhead = 0; daysAhead < MAX_RECURRING_DAYS_TO_CHECK; daysAhead += 1) {
    const candidate = new Date(targetDate);
    candidate.setDate(targetDate.getDate() + daysAhead);
    const date = formatDateOnly(candidate);

    if (
      !hasAppointmentConflict({
        appointments: allAppointments,
        date,
        appointment,
        excludeIds,
        doctorStaff,
      })
    ) {
      return date;
    }
  }

  return null;
};

const getGeneratedRecurringStatus = (status?: string | null) => {
  const normalized = normalizeStatus(status);
  if (normalized === "reserved") return "reserved";
  if (isPatientCartStatus(normalized)) return CART_APPOINTMENT_STATUS;
  return "scheduled";
};

const makeAppointmentId = () => `apt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const buildGeneratedAppointmentData = ({
  source,
  generatedDate,
}: {
  source: Appointment;
  generatedDate: string;
}) => {
  const now = new Date();
  const price = Number(source.price || 0);
  const discount = Number(source.discount || 0);

  return {
    id: makeAppointmentId(),
    patientId: source.patientId,
    patientName: source.patientName,
    date: generatedDate,
    time: source.time,
    type: source.type,
    customType: source.customType || "",
    price,
    discount,
    doctor: source.doctor || "",
    doctorId: source.doctorId || null,
    duration: normalizeAppointmentDuration(source.duration),
    notes: source.notes || "",
    treatmentNotes: (source as any).treatmentNotes || "",
    serviceType: source.serviceType || null,
    status: getPastRestrictedAppointmentStatus(
      generatedDate,
      getGeneratedRecurringStatus(source.status)
    ),
    cancellationReason: null,
    paymentStatus: "unpaid",
    paymentMethod: null,
    totalPaid: 0,
    balance: Math.max(0, price - discount),
    transactions: null,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deletedAt: null,
  };
};

export const cancelRecurringSeriesAppointments = async ({
  appointment,
}: {
  appointment: Appointment;
  [key: string]: any;
}): Promise<Appointment> => {
  return appointment; // Deprecated: no more series to cancel
};

export const reconcileAppointmentRecurrence = async ({
  appointment,
  allAppointments,
  recurrenceInput,
  changedBy,
  changedByName,
  doctorStaff = [],
}: HandleAppointmentCloningArgs): Promise<Appointment> => {
  if (!appointment.id) return appointment;

  const requestedRecurrence = normalizeAppointmentRecurrence(recurrenceInput);
  if (!requestedRecurrence) return appointment;

  const targetDate = getRecurrenceTargetDate(appointment.date, requestedRecurrence);
  if (!targetDate) return appointment;

  const generatedDate = findRecurringAppointmentDate({
    appointment,
    allAppointments,
    targetDate,
    existingGeneratedAppointmentId: null,
    doctorStaff,
  });
  if (!generatedDate) return appointment;

  const generatedData = buildGeneratedAppointmentData({ source: appointment, generatedDate });
  const created = toAppointment(await prisma.appointment.create({ data: generatedData as any }));

  await createAppointmentLog(
    created.id!,
    { status: "none", paymentStatus: "none", price: 0, balance: 0, totalPaid: 0 } as any,
    created,
    changedBy,
    changedByName || "System",
    "update",
    0,
    `Created as a clone for a future appointment.`
  );

  return appointment;
};
