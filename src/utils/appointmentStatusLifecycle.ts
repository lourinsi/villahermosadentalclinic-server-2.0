import { Appointment } from "../types/appointment";
import { normalizeStatus } from "../constants/appointmentStatuses";
import { createAppointmentLog } from "./appointmentLogs";
import { getAppointmentTypeName } from "./appointment-types";
import { notifyStatusChange, resolveRecipients } from "./notifications";
import { prisma } from "../lib/prisma";
import { DoctorIdentity, withResolvedDoctor } from "./doctorIdentity";
import { PatientIdentity, withResolvedPatient } from "./patientIdentity";

const TBD_STATUS = "tbd";
const FINAL_STATUSES = new Set(["cancelled", "completed"]);
const PAST_APPOINTMENT_STATUSES = new Set([TBD_STATUS, ...FINAL_STATUSES]);

// Explicitly define fields to fetch, excluding the missing treatmentNotes column
const APPOINTMENT_BASE_SELECT = {
  id: true,
  patientId: true,
  patientName: true,
  date: true,
  time: true,
  type: true,
  customType: true,
  price: true,
  discount: true,
  doctor: true,
  doctorId: true,
  duration: true,
  notes: true,
  serviceType: true,
  status: true,
  cancellationReason: true,
  paymentStatus: true,
  paymentMethod: true,
  totalPaid: true,
  balance: true,
  transactions: true,
  recurrence: true,
  isRecurring: true,
  recurringSeriesId: true,
  createdAt: true,
  updatedAt: true,
  deleted: true,
  deletedAt: true,
};

interface LifecycleResult {
  updatedCount: number;
  updatedIds: string[];
}

const toAppointment = (appointment: unknown): Appointment => appointment as Appointment;

const appointmentNotificationData = (appointment: Appointment, previousState: Appointment) => ({
  patientName: appointment.patientName,
  date: appointment.date,
  time: appointment.time,
  type: getAppointmentTypeName(appointment.type, appointment.customType),
  doctor: appointment.doctor,
  duration: appointment.duration,
  price: appointment.price,
  discount: appointment.discount,
  balance: appointment.balance,
  totalPaid: appointment.totalPaid,
  status: appointment.status,
  paymentStatus: appointment.paymentStatus,
  cancellationReason: appointment.cancellationReason,
  previousState,
  newState: appointment,
});

const parseAppointmentDate = (dateValue?: string): Date | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || "");
  if (!dateMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export const isPastAppointmentDate = (
  dateValue?: string,
  now: Date = new Date()
): boolean => {
  const appointmentDate = parseAppointmentDate(dateValue);
  if (!appointmentDate) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return appointmentDate.getTime() < today.getTime();
};

export const getPastRestrictedAppointmentStatus = (
  dateValue?: string,
  status?: string,
  now: Date = new Date()
): string => {
  if (!isPastAppointmentDate(dateValue, now)) return normalizeStatus(status || "scheduled");

  const normalizedStatus = normalizeStatus(status);
  return PAST_APPOINTMENT_STATUSES.has(normalizedStatus) ? normalizedStatus : TBD_STATUS;
};

const shouldMarkAppointmentAsTbd = (appointment: Appointment, now: Date): boolean => {
  if (appointment.deleted) return false;

  const normalizedStatus = normalizeStatus(appointment.status);
  if (FINAL_STATUSES.has(normalizedStatus) || normalizedStatus === TBD_STATUS) return false;

  return isPastAppointmentDate(appointment.date, now);
};

const normalizeId = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const RECURRENCE_SERIES_STATUS_ACTIVE = "active";
const RECURRENCE_SERIES_STATUS_STOPPED = "stopped";
const RECURRENCE_OCCURRENCE_STATUS_ACTIVE = "active";
const RECURRENCE_OCCURRENCE_STATUS_CANCELLED = "cancelled";
const RECURRING_SERIES_MEMBER_STATUSES = new Set(["scheduled", "reserved"]);

const isRecurringSeriesMemberAppointment = (appointment?: Appointment | null) =>
  Boolean(
    appointment &&
      !appointment.deleted &&
      RECURRING_SERIES_MEMBER_STATUSES.has(normalizeStatus(appointment.status))
  );

const getAppointmentRecurringSeriesId = (appointment: Appointment): string => {
  const recurrence = isRecord((appointment as any).recurrence)
    ? (appointment as any).recurrence
    : {};

  return (
    normalizeId((appointment as any).recurringSeriesId) ||
    normalizeId(recurrence.recurringSeriesId)
  );
};

const sortRecurringOccurrenceRows = (
  rows: Array<{ occurrence: any; appointment: Appointment }>
) =>
  rows.sort((left, right) => {
    const leftDate = String(left.appointment.date || left.occurrence.generatedForDate || "");
    const rightDate = String(right.appointment.date || right.occurrence.generatedForDate || "");
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const leftTime = String(left.appointment.time || "");
    const rightTime = String(right.appointment.time || "");
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

    return Number(left.occurrence.sequence || 0) - Number(right.occurrence.sequence || 0);
  });

const syncRecurringSeriesMetadata = async (
  appointments: Appointment[]
): Promise<void> => {
  const appointmentIds = appointments
    .map((appointment) => normalizeId(appointment.id))
    .filter(Boolean);
  if (!appointmentIds.length) return;

  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const recurringSeries = (prisma as any).recurringSeries;
  if (!recurringOccurrence || !recurringSeries) return;

  const appointmentsById = new Map<string, Appointment>(
    appointments
      .filter((appointment) => normalizeId(appointment.id))
      .map((appointment) => [normalizeId(appointment.id), appointment])
  );

  const occurrences = await recurringOccurrence.findMany({
    where: {
      appointmentId: { in: appointmentIds },
      status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
    },
  });
  if (!occurrences.length) return;

  const now = new Date();
  const cancelledAppointmentIds: string[] = [];
  const activeRowsBySeriesId = new Map<string, Array<{ occurrence: any; appointment: Appointment }>>();
  const affectedSeriesIds = new Set<string>();

  for (const occurrence of occurrences) {
    const seriesId = normalizeId(occurrence.seriesId);
    const appointmentId = normalizeId(occurrence.appointmentId);
    if (!seriesId || !appointmentId) continue;

    affectedSeriesIds.add(seriesId);
    const appointment = appointmentsById.get(appointmentId);
    if (!appointment || !isRecurringSeriesMemberAppointment(appointment)) {
      cancelledAppointmentIds.push(appointmentId);
      continue;
    }

    const rows = activeRowsBySeriesId.get(seriesId) || [];
    rows.push({ occurrence, appointment });
    activeRowsBySeriesId.set(seriesId, rows);
  }

  if (cancelledAppointmentIds.length) {
    await recurringOccurrence.updateMany({
      where: { appointmentId: { in: Array.from(new Set(cancelledAppointmentIds)) } },
      data: {
        status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
        updatedAt: now,
      },
    });
  }

  for (const seriesId of affectedSeriesIds) {
    const rows = sortRecurringOccurrenceRows(activeRowsBySeriesId.get(seriesId) || []);
    const existingSeries = await recurringSeries.findUnique({ where: { id: seriesId } });
    if (!rows.length) {
      await recurringOccurrence.updateMany({
        where: { seriesId },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });
      await recurringSeries.update({
        where: { id: seriesId },
        data: {
          endDate: null,
          status: RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: existingSeries?.stoppedAt || now,
          updatedAt: now,
        },
      });
      continue;
    }

    if (rows.length === 1) {
      const onlyAppointment = rows[0].appointment;
      if (onlyAppointment.id) {
        await prisma.appointment.update({
          where: { id: onlyAppointment.id },
          data: {
            recurrence: null,
            isRecurring: false,
            recurringSeriesId: null,
            updatedAt: now,
          } as any,
        });
        (onlyAppointment as any).recurrence = null;
        (onlyAppointment as any).isRecurring = false;
        (onlyAppointment as any).recurringSeriesId = null;
        onlyAppointment.updatedAt = now;
      }

      await recurringOccurrence.updateMany({
        where: { seriesId },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });
      await recurringSeries.update({
        where: { id: seriesId },
        data: {
          rootAppointmentId: onlyAppointment.id || existingSeries?.rootAppointmentId,
          endDate: null,
          status: RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: existingSeries?.stoppedAt || now,
          updatedAt: now,
        },
      });
      continue;
    }

    const head = rows[0].appointment;
    const last = rows[rows.length - 1].appointment;

    await recurringSeries.update({
      where: { id: seriesId },
      data: {
        rootAppointmentId: head.id,
        startDate: head.date || null,
        endDate: last.date || null,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        stoppedAt: null,
        updatedAt: now,
      },
    });

    for (let index = 0; index < rows.length; index += 1) {
      const current = rows[index].appointment;
      const previous = rows[index - 1]?.appointment || null;
      if (!current.id) continue;

      await recurringOccurrence.update({
        where: { appointmentId: current.id },
        data: {
          parentAppointmentId: previous?.id || null,
          sequence: index,
          generatedForDate: current.date,
          status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
          updatedAt: now,
        },
      });
    }
  }
};

const enrichAppointmentsWithRecurringMetadata = async (
  appointments: Appointment[]
): Promise<Appointment[]> => {
  const appointmentIds = appointments
    .map((appointment) => normalizeId(appointment.id))
    .filter(Boolean);

  if (!appointmentIds.length) return appointments;

  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const recurringSeries = (prisma as any).recurringSeries;
  if (!recurringOccurrence || !recurringSeries) return appointments;

  const occurrences = await recurringOccurrence.findMany({
    where: {
      appointmentId: { in: appointmentIds },
      status: { not: "cancelled" },
    },
  });

  const appointmentsById = new Map<string, Appointment>(
    appointments
      .filter((appointment) => normalizeId(appointment.id))
      .map((appointment) => [normalizeId(appointment.id), appointment])
  );
  const occurrencesByAppointmentId = new Map<string, any>();
  const activeOccurrenceCountsBySeriesId = new Map<string, number>();
  for (const occurrence of occurrences) {
    const appointmentId = normalizeId(occurrence.appointmentId);
    const seriesId = normalizeId(occurrence.seriesId);
    if (!appointmentId) continue;

    const existing = occurrencesByAppointmentId.get(appointmentId);
    if (!existing || Number(occurrence.sequence || 0) < Number(existing.sequence || 0)) {
      occurrencesByAppointmentId.set(appointmentId, occurrence);
    }

    const appointment = appointmentsById.get(appointmentId);
    if (seriesId && isRecurringSeriesMemberAppointment(appointment)) {
      activeOccurrenceCountsBySeriesId.set(
        seriesId,
        (activeOccurrenceCountsBySeriesId.get(seriesId) || 0) + 1
      );
    }
  }

  const seriesIds = Array.from(
    new Set(
      [
        ...occurrences.map((occurrence: any) => normalizeId(occurrence.seriesId)),
        ...appointments.map(getAppointmentRecurringSeriesId),
      ].filter(Boolean)
    )
  );

  const seriesRows = seriesIds.length
    ? await recurringSeries.findMany({
        where: { id: { in: seriesIds } },
      })
    : [];
  const seriesById = new Map<string, any>();
  for (const series of seriesRows) {
    const id = normalizeId(series.id);
    if (id) seriesById.set(id, series);
  }

  return appointments.map((appointment) => {
    const appointmentId = normalizeId(appointment.id);
    const appointmentRecurrence = isRecord((appointment as any).recurrence)
      ? (appointment as any).recurrence
      : {};
    const occurrence = appointmentId
      ? occurrencesByAppointmentId.get(appointmentId)
      : null;
    const seriesId =
      normalizeId(occurrence?.seriesId) ||
      getAppointmentRecurringSeriesId(appointment);
    const series = seriesId ? seriesById.get(seriesId) : null;
    const parentAppointmentId = normalizeId(occurrence?.parentAppointmentId);
    const sequence =
      occurrence && Number.isFinite(Number(occurrence.sequence))
        ? Number(occurrence.sequence)
        : null;
    const rootAppointmentId = normalizeId(series?.rootAppointmentId);
    const recurringSeriesActiveOccurrenceCount = seriesId
      ? activeOccurrenceCountsBySeriesId.get(seriesId) || 0
      : 0;
    const recurringSeriesActiveChildCount = Math.max(
      0,
      recurringSeriesActiveOccurrenceCount - 1
    );
    const hasActiveRecurringChildren = recurringSeriesActiveChildCount > 0;
    const seriesStatus = normalizeId(series?.status);
    const seriesIsActive = !seriesStatus || seriesStatus === "active";
    const appointmentRepeats = Boolean(
      (appointment as any).isRecurring ||
        appointmentRecurrence.enabled
    );
    const isRecurringSeriesHead = Boolean(
      appointmentId &&
        seriesId &&
        seriesIsActive &&
        hasActiveRecurringChildren &&
        (
          (occurrence && (
            rootAppointmentId === appointmentId ||
            (sequence === 0 && !parentAppointmentId)
          )) ||
          (!occurrence && appointmentRepeats && rootAppointmentId === appointmentId)
        )
    );
    const isRecurringGeneratedAppointment = Boolean(
      appointmentId &&
        seriesId &&
        occurrence &&
        hasActiveRecurringChildren &&
        !isRecurringSeriesHead &&
        (
          parentAppointmentId ||
          (sequence != null && sequence > 0) ||
          (rootAppointmentId && rootAppointmentId !== appointmentId)
        )
    );

    return {
      ...(appointment as any),
      recurringSeriesId: seriesId || (appointment as any).recurringSeriesId || null,
      recurringSeriesRootAppointmentId: rootAppointmentId || null,
      recurringSeriesStatus: seriesStatus || null,
      recurringSeriesActiveOccurrenceCount,
      recurringSeriesActiveChildCount,
      hasActiveRecurringChildren,
      recurringOccurrenceId: occurrence?.id || null,
      recurringOccurrenceStatus: occurrence?.status || null,
      recurringOccurrenceSequence: sequence,
      recurringParentAppointmentId: parentAppointmentId || null,
      isRecurringSeriesHead,
      isRecurringGeneratedAppointment,
    } as Appointment;
  });
};

export const markPastAppointmentsAsTbd = async (
  appointments: Appointment[],
  now: Date = new Date()
): Promise<LifecycleResult> => {
  const updatedIds: string[] = [];

  for (const appointment of appointments) {
    if (!shouldMarkAppointmentAsTbd(appointment, now) || !appointment.id) continue;

    const previousState: Appointment = { ...appointment };
    appointment.status = TBD_STATUS;
    appointment.updatedAt = now;
    updatedIds.push(appointment.id);

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: TBD_STATUS, updatedAt: now },
    });

    const [patientRecord, doctorStaff] = await Promise.all([
      appointment.patientId
        ? prisma.patient.findFirst({
            where: { id: appointment.patientId, deleted: false },
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              username: true,
              email: true,
              phone: true,
              profilePicture: true,
              dateOfBirth: true,
            },
          }) as Promise<PatientIdentity | null>
        : Promise.resolve(null),
      prisma.staff.findMany({
        where: { deleted: false },
        select: {
          id: true,
          name: true,
          email: true,
          profilePicture: true,
          role: true,
          specialization: true,
        },
      }) as Promise<DoctorIdentity[]>,
    ]);
    const patientRecords = patientRecord ? [patientRecord] : [];
    const previousStateForLog = withResolvedDoctor(
      withResolvedPatient(previousState as any, patientRecords),
      doctorStaff
    ) as Appointment;
    const appointmentForLog = withResolvedDoctor(
      withResolvedPatient({ ...appointment } as any, patientRecords),
      doctorStaff
    ) as Appointment;

    await createAppointmentLog(
      appointment.id,
      previousStateForLog,
      appointmentForLog,
      "system",
      "System",
      "status_change",
      0,
      "Automatically marked TBD because the appointment date passed without completion or cancellation."
    );

    await notifyStatusChange(
      appointment.id,
      "status",
      normalizeStatus(previousStateForLog.status),
      TBD_STATUS,
      await resolveRecipients(appointmentForLog),
      appointmentNotificationData(appointmentForLog, previousStateForLog)
    );
  }

  if (updatedIds.length > 0) {
    console.log(
      `[APPOINTMENT LIFECYCLE] Marked ${updatedIds.length} past appointment(s) as TBD: ${updatedIds.join(", ")}`
    );
  }

  return {
    updatedCount: updatedIds.length,
    updatedIds,
  };
};

export const syncPastAppointmentsToTbd = async (
  now: Date = new Date()
): Promise<LifecycleResult> => {
  const appointments = (await prisma.appointment.findMany({
    where: { deleted: false },
    select: APPOINTMENT_BASE_SELECT,
  })).map(toAppointment);

  return markPastAppointmentsAsTbd(appointments, now);
};

export const readAppointmentsWithLifecycle = async (
  now: Date = new Date()
): Promise<Appointment[]> => {
  const appointments = (await prisma.appointment.findMany({
    select: APPOINTMENT_BASE_SELECT,
  })).map(toAppointment);
  await markPastAppointmentsAsTbd(appointments, now);
  await syncRecurringSeriesMetadata(appointments);
  return enrichAppointmentsWithRecurringMetadata(appointments);
};

export const readAppointmentsForList = async ({
  startDate,
  endDate,
  includeDeleted = false,
}: {
  startDate?: string;
  endDate?: string;
  includeDeleted?: boolean;
} = {}): Promise<Appointment[]> => {
  const where: Record<string, any> = {};

  if (!includeDeleted) {
    where.deleted = false;
  }

  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  const appointments = (await prisma.appointment.findMany({
    where,
    select: APPOINTMENT_BASE_SELECT,
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  })).map(toAppointment);

  return enrichAppointmentsWithRecurringMetadata(appointments);
};
