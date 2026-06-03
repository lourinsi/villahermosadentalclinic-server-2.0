import { Appointment } from "../types/appointment";
import { CART_APPOINTMENT_STATUS, isPatientCartStatus, normalizeStatus } from "../constants/appointmentStatuses";
import { hasConflict } from "./appointment-helpers";
import { normalizeAppointmentDuration } from "./appointment-durations";
import { createAppointmentLog } from "./appointmentLogs";
import { DoctorIdentity } from "./doctorIdentity";
import { getPastRestrictedAppointmentStatus } from "./appointmentStatusLifecycle";
import { prisma } from "../lib/prisma";

const RECURRING_APPOINTMENT_OPTIONS = ["1 month", "3 months", "6 months", "Custom"] as const;
type RecurringAppointmentOption = typeof RECURRING_APPOINTMENT_OPTIONS[number];

export type AppointmentRecurrencePayload = {
  enabled: boolean;
  option: RecurringAppointmentOption;
  customDate?: string | null;
  generatedAppointmentId?: string | null;
  generatedAppointmentDate?: string | null;
  generatedFromId?: string | null;
  generatedFromDate?: string | null;
  sourceAppointmentId?: string | null;
  sourceAppointmentDate?: string | null;
  createdFromAppointmentId?: string | null;
  createdFromAppointmentDate?: string | null;
  originalGeneratedFromId?: string | null;
  originalGeneratedFromDate?: string | null;
  recurringSeriesId?: string | null;
  cancelledGeneratedAppointmentId?: string | null;
  cancelledGeneratedAppointmentDate?: string | null;
  cancelledAt?: string | null;
  [key: string]: any;
};

type ReconcileAppointmentRecurrenceArgs = {
  appointment: Appointment;
  allAppointments: Appointment[];
  recurrenceInput?: unknown;
  recurrenceInputProvided?: boolean;
  changedBy: string;
  changedByName?: string;
  doctorStaff?: DoctorIdentity[];
};

const DEFAULT_RECURRING_APPOINTMENT_OPTION: RecurringAppointmentOption = "1 month";
const MAX_RECURRING_DAYS_TO_CHECK = 365;
const RECURRENCE_SERIES_STATUS_ACTIVE = "active";
const RECURRENCE_SERIES_STATUS_STOPPED = "stopped";
const RECURRENCE_OCCURRENCE_STATUS_ACTIVE = "active";
const RECURRENCE_OCCURRENCE_STATUS_STOPPED = "stopped";
const RECURRENCE_OCCURRENCE_STATUS_CANCELLED = "cancelled";

const toAppointment = (appointment: unknown): Appointment => appointment as Appointment;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeId = (value?: unknown): string | null => {
  const id = String(value || "").trim();
  return id || null;
};

const normalizeRecurrenceOption = (option?: unknown): RecurringAppointmentOption => {
  const value = String(option || "").trim();
  return RECURRING_APPOINTMENT_OPTIONS.includes(value as RecurringAppointmentOption)
    ? (value as RecurringAppointmentOption)
    : DEFAULT_RECURRING_APPOINTMENT_OPTION;
};

const normalizeDateOnly = (date?: unknown): string => {
  const value = String(date || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
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

export const normalizeAppointmentRecurrence = (
  recurrence?: unknown,
  fallback?: unknown
): AppointmentRecurrencePayload | null => {
  const fallbackRecord = isRecord(fallback) ? fallback : {};

  if (recurrence === undefined) {
    if (!isRecord(fallback)) return null;
    return normalizeAppointmentRecurrence(fallbackRecord);
  }

  if (recurrence === null || recurrence === false) {
    return {
      ...fallbackRecord,
      enabled: false,
      option: normalizeRecurrenceOption(fallbackRecord.option),
      customDate: normalizeDateOnly(fallbackRecord.customDate) || null,
      recurringSeriesId: fallbackRecord.recurringSeriesId ?? null,
    };
  }

  const record = isRecord(recurrence) ? recurrence : { enabled: Boolean(recurrence) };
  const hasExplicitEnabled = Object.prototype.hasOwnProperty.call(record, "enabled");
  const enabled = hasExplicitEnabled
    ? Boolean(record.enabled)
    : Boolean(record.option || record.customDate || fallbackRecord.enabled);

  return {
    ...fallbackRecord,
    ...record,
    enabled,
    option: normalizeRecurrenceOption(record.option ?? fallbackRecord.option),
    customDate: normalizeDateOnly(record.customDate ?? fallbackRecord.customDate) || null,
    generatedAppointmentId:
      record.generatedAppointmentId ?? fallbackRecord.generatedAppointmentId ?? null,
    generatedAppointmentDate:
      normalizeDateOnly(record.generatedAppointmentDate ?? fallbackRecord.generatedAppointmentDate) || null,
    generatedFromId: record.generatedFromId ?? fallbackRecord.generatedFromId ?? null,
    generatedFromDate:
      normalizeDateOnly(record.generatedFromDate ?? fallbackRecord.generatedFromDate) || null,
    sourceAppointmentId: record.sourceAppointmentId ?? fallbackRecord.sourceAppointmentId ?? null,
    sourceAppointmentDate:
      normalizeDateOnly(record.sourceAppointmentDate ?? fallbackRecord.sourceAppointmentDate) || null,
    createdFromAppointmentId:
      record.createdFromAppointmentId ??
      record.originalGeneratedFromId ??
      fallbackRecord.createdFromAppointmentId ??
      fallbackRecord.originalGeneratedFromId ??
      null,
    createdFromAppointmentDate:
      normalizeDateOnly(
        record.createdFromAppointmentDate ??
        record.originalGeneratedFromDate ??
        fallbackRecord.createdFromAppointmentDate ??
        fallbackRecord.originalGeneratedFromDate
      ) || null,
    originalGeneratedFromId:
      record.originalGeneratedFromId ??
      record.createdFromAppointmentId ??
      fallbackRecord.originalGeneratedFromId ??
      fallbackRecord.createdFromAppointmentId ??
      null,
    originalGeneratedFromDate:
      normalizeDateOnly(
        record.originalGeneratedFromDate ??
        record.createdFromAppointmentDate ??
        fallbackRecord.originalGeneratedFromDate ??
        fallbackRecord.createdFromAppointmentDate
      ) || null,
    recurringSeriesId: record.recurringSeriesId ?? fallbackRecord.recurringSeriesId ?? null,
  };
};

const formatRecurringLogDate = (date?: string | null) => {
  const parsed = parseDateOnly(date);
  if (!parsed) return String(date || "the source appointment");

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const makeRecurringSeriesId = () =>
  `rec_series_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const makeRecurringOccurrenceId = () =>
  `rec_occ_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const getAppointmentRecurringSeriesId = (
  appointment?: Appointment | null,
  recurrence?: AppointmentRecurrencePayload | null
) =>
  normalizeId((appointment as any)?.recurringSeriesId) ||
  normalizeId(recurrence?.recurringSeriesId);

const getImmutableCreatedFromMetadata = (
  recurrence?: AppointmentRecurrencePayload | null,
  currentAppointment?: Appointment | null,
  fallbackSource?: Appointment | null
) => {
  const currentId = normalizeId(currentAppointment?.id);
  const currentDate = normalizeDateOnly(currentAppointment?.date);
  const fallbackId = normalizeId(fallbackSource?.id);
  const fallbackDate = normalizeDateOnly(fallbackSource?.date);

  const idCandidates = [
    recurrence?.createdFromAppointmentId,
    recurrence?.originalGeneratedFromId,
    recurrence?.generatedFromId,
    recurrence?.sourceAppointmentId,
    fallbackId,
  ];
  const dateCandidates = [
    recurrence?.createdFromAppointmentDate,
    recurrence?.originalGeneratedFromDate,
    recurrence?.generatedFromDate,
    recurrence?.sourceAppointmentDate,
    fallbackDate,
  ];

  let id: string | null = null;
  let date: string | null = null;

  for (let index = 0; index < idCandidates.length || index < dateCandidates.length; index += 1) {
    const candidateId = normalizeId(idCandidates[index]);
    const candidateDate = normalizeDateOnly(dateCandidates[index]);
    const pointsAtCurrent =
      Boolean(candidateId && currentId && candidateId === currentId) ||
      Boolean(!candidateId && candidateDate && currentDate && candidateDate === currentDate);

    if ((candidateId || candidateDate) && !pointsAtCurrent) {
      id = candidateId || null;
      date = candidateDate || null;
      break;
    }
  }

  return {
    createdFromAppointmentId: id,
    createdFromAppointmentDate: date,
    originalGeneratedFromId: id,
    originalGeneratedFromDate: date,
  };
};

const warnRecurringTableSync = (message: string, error: unknown) => {
  console.warn(
    `[APPOINTMENT RECURRENCE] ${message}:`,
    error instanceof Error ? error.message : error
  );
};

const isInactiveAppointment = (appointment?: Appointment | null) =>
  Boolean(
    !appointment ||
    appointment.deleted ||
    normalizeStatus(appointment.status) === "cancelled"
  );

const sortAppointmentsBySchedule = <T extends { appointment: Appointment; occurrence?: any }>(
  rows: T[]
) =>
  rows.sort((left, right) => {
    const leftDate = String(left.appointment.date || "");
    const rightDate = String(right.appointment.date || "");
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    const leftTime = String(left.appointment.time || "");
    const rightTime = String(right.appointment.time || "");
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);

    const leftSequence = Number(left.occurrence?.sequence ?? Number.MAX_SAFE_INTEGER);
    const rightSequence = Number(right.occurrence?.sequence ?? Number.MAX_SAFE_INTEGER);
    return leftSequence - rightSequence;
  });

const ensureRecurringSeriesForAppointment = async (
  appointment: Appointment,
  recurrence: AppointmentRecurrencePayload
): Promise<string | null> => {
  if (!appointment.id) return null;

  const now = new Date();
  const recurringSeries = (prisma as any).recurringSeries;
  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const existingSeriesId = getAppointmentRecurringSeriesId(appointment, recurrence);

  try {
    if (existingSeriesId) {
      const existingSeries = await recurringSeries.findUnique({ where: { id: existingSeriesId } });
      if (existingSeries) {
        await recurringSeries.update({
          where: { id: existingSeriesId },
          data: {
            interval: recurrence.option,
            customDate: recurrence.customDate || null,
            status: recurrence.enabled ? RECURRENCE_SERIES_STATUS_ACTIVE : RECURRENCE_SERIES_STATUS_STOPPED,
            stoppedAt: recurrence.enabled ? null : now,
            updatedAt: now,
          },
        });
        return existingSeriesId;
      }
    }

    const parentAppointmentId = normalizeId(
      recurrence.generatedFromId || recurrence.sourceAppointmentId
    );
    if (parentAppointmentId) {
      const parentOccurrence = await recurringOccurrence.findFirst({
        where: { appointmentId: parentAppointmentId },
      });
      if (parentOccurrence?.seriesId) {
        await recurringSeries.update({
          where: { id: parentOccurrence.seriesId },
          data: {
            interval: recurrence.option,
            customDate: recurrence.customDate || null,
            status: RECURRENCE_SERIES_STATUS_ACTIVE,
            stoppedAt: null,
            updatedAt: now,
          },
        });
        return parentOccurrence.seriesId;
      }
    }

    const rootSeries = await recurringSeries.findFirst({
      where: { rootAppointmentId: appointment.id },
      orderBy: { createdAt: "desc" },
    });
    if (rootSeries) {
      await recurringSeries.update({
        where: { id: rootSeries.id },
        data: {
          interval: recurrence.option,
          customDate: recurrence.customDate || null,
          status: recurrence.enabled ? RECURRENCE_SERIES_STATUS_ACTIVE : RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: recurrence.enabled ? null : now,
          updatedAt: now,
        },
      });
      return rootSeries.id;
    }

    if (!recurrence.enabled && !recurrence.generatedAppointmentId && !parentAppointmentId) {
      return existingSeriesId;
    }

    const createdSeries = await recurringSeries.create({
      data: {
        id: makeRecurringSeriesId(),
        rootAppointmentId: appointment.id,
        interval: recurrence.option,
        customDate: recurrence.customDate || null,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        createdAt: now,
        updatedAt: now,
        stoppedAt: null,
      },
    });
    return createdSeries.id;
  } catch (error) {
    warnRecurringTableSync("Could not sync recurring series table", error);
    return existingSeriesId;
  }
};

const getActiveRecurringChildAppointment = async (
  appointmentId?: string | null
): Promise<Appointment | null> => {
  const sourceId = normalizeId(appointmentId);
  if (!sourceId) return null;

  try {
    const childOccurrences = await (prisma as any).recurringOccurrence.findMany({
      where: {
        parentAppointmentId: sourceId,
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
      orderBy: [
        { sequence: "asc" },
        { generatedForDate: "asc" },
        { createdAt: "asc" },
      ],
    });
    if (!childOccurrences.length) return null;

    const childIds = childOccurrences
      .map((occurrence: any) => String(occurrence.appointmentId || ""))
      .filter(Boolean);
    const childAppointments = (await prisma.appointment.findMany({
      where: { id: { in: childIds } },
    })).map(toAppointment);
    const appointmentsById = new Map(
      childAppointments
        .filter((appointment) => appointment.id)
        .map((appointment) => [String(appointment.id), appointment])
    );

    for (const occurrence of childOccurrences) {
      const child = appointmentsById.get(String(occurrence.appointmentId || ""));
      if (!isInactiveAppointment(child)) return child || null;
    }
  } catch (error) {
    warnRecurringTableSync("Could not read recurring child appointment", error);
  }

  return null;
};

const getActiveRecurringSeriesRows = async (seriesId?: string | null) => {
  const id = normalizeId(seriesId);
  if (!id) return [];

  const occurrences = await (prisma as any).recurringOccurrence.findMany({
    where: {
      seriesId: id,
      status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
    },
    orderBy: [
      { sequence: "asc" },
      { generatedForDate: "asc" },
      { createdAt: "asc" },
    ],
  });
  if (!occurrences.length) return [];

  const appointmentIds = occurrences
    .map((occurrence: any) => String(occurrence.appointmentId || ""))
    .filter(Boolean);
  const appointments = (await prisma.appointment.findMany({
    where: { id: { in: appointmentIds } },
  })).map(toAppointment);
  const appointmentsById = new Map(
    appointments
      .filter((appointment) => appointment.id)
      .map((appointment) => [String(appointment.id), appointment])
  );

  return sortAppointmentsBySchedule(
    occurrences
      .map((occurrence: any) => ({
        occurrence,
        appointment: appointmentsById.get(String(occurrence.appointmentId || "")),
      }))
      .filter(
        (row: { occurrence: any; appointment?: Appointment }): row is { occurrence: any; appointment: Appointment } =>
          Boolean(row.appointment && !isInactiveAppointment(row.appointment))
      )
  );
};

const promoteRecurringSeriesHead = async (seriesId?: string | null) => {
  const id = normalizeId(seriesId);
  if (!id) return;

  try {
    const recurringSeries = (prisma as any).recurringSeries;
    const series = await recurringSeries.findUnique({ where: { id } });
    if (!series) return;

    const activeRows = await getActiveRecurringSeriesRows(id);
    const now = new Date();

    if (!activeRows.length) {
      await recurringSeries.update({
        where: { id },
        data: {
          status: RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: now,
          updatedAt: now,
        },
      });
      return;
    }

    const head = activeRows[0].appointment;
    await recurringSeries.update({
      where: { id },
      data: {
        rootAppointmentId: head.id,
        status:
          activeRows.length > 1
            ? RECURRENCE_SERIES_STATUS_ACTIVE
            : RECURRENCE_SERIES_STATUS_STOPPED,
        stoppedAt: activeRows.length > 1 ? null : now,
        updatedAt: now,
      },
    });

    await (prisma as any).recurringOccurrence.updateMany({
      where: {
        appointmentId: {
          in: activeRows
            .map((row) => String(row.appointment.id || ""))
            .filter(Boolean),
        },
      },
      data: {
        parentAppointmentId: null,
        updatedAt: now,
      },
    });

    for (let index = 0; index < activeRows.length; index += 1) {
      const current = activeRows[index].appointment;
      const previous = activeRows[index - 1]?.appointment || null;
      const next = activeRows[index + 1]?.appointment || null;
      const existingRecurrence = normalizeAppointmentRecurrence((current as any).recurrence);
      const createdFromMetadata = getImmutableCreatedFromMetadata(existingRecurrence, current);
      const recurrenceToSave: AppointmentRecurrencePayload = {
        ...(existingRecurrence || {}),
        enabled: Boolean(next),
        option: normalizeRecurrenceOption(series.interval),
        customDate: normalizeDateOnly(series.customDate) || null,
        recurringSeriesId: id,
        generatedFromId: previous?.id || null,
        generatedFromDate: previous?.date || null,
        sourceAppointmentId: previous?.id || current.id || null,
        sourceAppointmentDate: previous?.date || current.date || null,
        ...createdFromMetadata,
        generatedAppointmentId: next?.id || null,
        generatedAppointmentDate: next?.date || null,
      };

      await (prisma as any).recurringOccurrence.update({
        where: { appointmentId: current.id },
        data: {
          parentAppointmentId: previous?.id || null,
          sequence: index,
          generatedForDate: current.date,
          status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
          updatedAt: now,
        },
      });

      await prisma.appointment.update({
        where: { id: current.id },
        data: {
          recurrence: recurrenceToSave as any,
          isRecurring: Boolean(next),
          recurringSeriesId: id,
          updatedAt: now,
        } as any,
      });
    }
  } catch (error) {
    warnRecurringTableSync("Could not promote recurring series head", error);
  }
};

const syncRecurringOccurrenceRecord = async ({
  appointment,
  recurrence,
  seriesId,
  status,
}: {
  appointment: Appointment;
  recurrence: AppointmentRecurrencePayload;
  seriesId: string;
  status: string;
}) => {
  if (!appointment.id) return;

  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const now = new Date();
  const parentAppointmentId = normalizeId(
    recurrence.generatedFromId || recurrence.sourceAppointmentId
  );

  try {
    const existingOccurrence = await recurringOccurrence.findFirst({
      where: { appointmentId: appointment.id },
    });
    let sequence = Number(existingOccurrence?.sequence ?? 0);

    if (!existingOccurrence && parentAppointmentId) {
      const parentOccurrence = await recurringOccurrence.findFirst({
        where: { seriesId, appointmentId: parentAppointmentId },
      });
      sequence = Number(parentOccurrence?.sequence ?? -1) + 1;
    } else if (!existingOccurrence) {
      const latestOccurrence = await recurringOccurrence.findFirst({
        where: { seriesId },
        orderBy: { sequence: "desc" },
      });
      sequence = latestOccurrence ? Number(latestOccurrence.sequence || 0) + 1 : 0;
    }

    await recurringOccurrence.upsert({
      where: { appointmentId: appointment.id },
      update: {
        seriesId,
        parentAppointmentId,
        generatedForDate: appointment.date,
        status,
        updatedAt: now,
      },
      create: {
        id: makeRecurringOccurrenceId(),
        seriesId,
        appointmentId: appointment.id,
        parentAppointmentId,
        sequence,
        generatedForDate: appointment.date,
        status,
        createdAt: now,
        updatedAt: now,
      },
    });
  } catch (error) {
    warnRecurringTableSync("Could not sync recurring occurrence table", error);
  }
};

const syncRecurringTablesForAppointment = async (
  appointment: Appointment,
  recurrence: AppointmentRecurrencePayload
): Promise<string | null> => {
  const seriesId = await ensureRecurringSeriesForAppointment(appointment, recurrence);
  if (!seriesId || !appointment.id) return seriesId;

  await syncRecurringOccurrenceRecord({
    appointment,
    recurrence: { ...recurrence, recurringSeriesId: seriesId },
    seriesId,
    status: recurrence.enabled
      ? RECURRENCE_OCCURRENCE_STATUS_ACTIVE
      : RECURRENCE_OCCURRENCE_STATUS_STOPPED,
  });

  return seriesId;
};

const syncGeneratedRecurringTables = async ({
  source,
  generatedAppointment,
  recurrence,
  seriesId,
}: {
  source: Appointment;
  generatedAppointment: Appointment;
  recurrence: AppointmentRecurrencePayload;
  seriesId?: string | null;
}): Promise<Appointment> => {
  if (!seriesId || !generatedAppointment.id) return generatedAppointment;

  const generatedRecurrence = {
    ...(normalizeAppointmentRecurrence((generatedAppointment as any).recurrence) || recurrence),
    recurringSeriesId: seriesId,
    generatedFromId: source.id || null,
    generatedFromDate: source.date,
    sourceAppointmentId: source.id || null,
    sourceAppointmentDate: source.date,
    ...getImmutableCreatedFromMetadata(
      normalizeAppointmentRecurrence((generatedAppointment as any).recurrence),
      generatedAppointment,
      source
    ),
  };

  await syncRecurringOccurrenceRecord({
    appointment: {
      ...generatedAppointment,
      recurringSeriesId: seriesId,
      recurrence: generatedRecurrence,
    } as Appointment,
    recurrence: generatedRecurrence,
    seriesId,
    status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
  });

  const saved = await prisma.appointment.update({
    where: { id: generatedAppointment.id },
    data: {
      recurringSeriesId: seriesId,
      recurrence: generatedRecurrence as any,
      updatedAt: new Date(),
    } as any,
  });
  return toAppointment(saved);
};

const markRecurringOccurrenceStatus = async (
  appointmentId: string | null | undefined,
  status: string,
  date: Date
) => {
  const id = normalizeId(appointmentId);
  if (!id) return;

  try {
    await (prisma as any).recurringOccurrence.updateMany({
      where: { appointmentId: id },
      data: { status, updatedAt: date },
    });
  } catch (error) {
    warnRecurringTableSync("Could not update recurring occurrence status", error);
  }
};

type CancelRecurringSeriesAppointmentsArgs = {
  appointment: Appointment;
  cancelAppointmentIds?: Iterable<string>;
  changedBy: string;
  changedByName?: string;
  includeCurrentAppointment?: boolean;
  deleteRelatedAppointments?: boolean;
};

export const cancelRecurringSeriesAppointments = async ({
  appointment,
  cancelAppointmentIds = [],
  changedBy,
  changedByName,
  includeCurrentAppointment = true,
  deleteRelatedAppointments = true,
}: CancelRecurringSeriesAppointmentsArgs): Promise<Appointment> => {
  if (!appointment.id) return appointment;

  const now = new Date();
  const appointmentIdsToCancel = new Set<string>(
    [
      ...(includeCurrentAppointment ? [appointment.id] : []),
      ...Array.from(cancelAppointmentIds),
    ]
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
  const affectedSeriesIds = new Set<string>();
  const recurringOccurrence = (prisma as any).recurringOccurrence;

  const occurrences = await recurringOccurrence.findMany({
    where: { appointmentId: { in: Array.from(appointmentIdsToCancel) } },
  });
  for (const occurrence of occurrences) {
    if (occurrence?.seriesId) affectedSeriesIds.add(String(occurrence.seriesId));
  }

  const fallbackSeriesId = getAppointmentRecurringSeriesId(
    appointment,
    normalizeAppointmentRecurrence((appointment as any).recurrence)
  );
  if (fallbackSeriesId) affectedSeriesIds.add(fallbackSeriesId);

  const appointmentsToCancel = (await prisma.appointment.findMany({
    where: { id: { in: Array.from(appointmentIdsToCancel) } },
  })).map(toAppointment);

  for (const appointmentToCancel of appointmentsToCancel) {
    if (!appointmentToCancel.id) continue;

    const isCurrentAppointment = appointmentToCancel.id === appointment.id;
    const previousState = { ...appointmentToCancel };
    const existingRecurrence = normalizeAppointmentRecurrence((appointmentToCancel as any).recurrence);
    const shouldMarkDeleted =
      appointmentToCancel.deleted ||
      (!isCurrentAppointment && deleteRelatedAppointments);
    const nextState: Appointment = {
      ...appointmentToCancel,
      status: "cancelled",
      deleted: shouldMarkDeleted,
      deletedAt: shouldMarkDeleted ? appointmentToCancel.deletedAt || now : appointmentToCancel.deletedAt,
      updatedAt: now,
      isRecurring: false,
      recurrence: {
        ...(existingRecurrence || {}),
        enabled: false,
        generatedAppointmentId: null,
        generatedAppointmentDate: null,
        cancelledAt: now.toISOString(),
      } as any,
    };

    await prisma.appointment.update({
      where: { id: appointmentToCancel.id },
      data: {
        status: nextState.status,
        deleted: nextState.deleted,
        deletedAt: nextState.deletedAt,
        updatedAt: now,
        isRecurring: false,
        recurrence: (nextState as any).recurrence,
      } as any,
    });

    await markRecurringOccurrenceStatus(
      appointmentToCancel.id,
      RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
      now
    );

    if (!isCurrentAppointment) {
      await createAppointmentLog(
        appointmentToCancel.id,
        previousState,
        nextState,
        changedBy,
        changedByName || "System",
        "status_change",
        0,
        `Recurring appointment removed because ${formatRecurringLogDate(appointment.date)} was cancelled.`
      );
    }
  }

  for (const seriesId of affectedSeriesIds) {
    await promoteRecurringSeriesHead(seriesId);
  }

  const savedCurrentAppointment = appointment.id
    ? await prisma.appointment.findUnique({ where: { id: appointment.id } })
    : null;
  return savedCurrentAppointment ? toAppointment(savedCurrentAppointment) : appointment;
};

const getRecurringGeneratedAppointmentsFromTable = async (
  appointmentId?: string | null
): Promise<Appointment[]> => {
  const sourceId = normalizeId(appointmentId);
  if (!sourceId) return [];

  try {
    const recurringOccurrence = (prisma as any).recurringOccurrence;
    const currentOccurrences = await recurringOccurrence.findMany({
      where: {
        appointmentId: sourceId,
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
    });

    const sourceAppointment = await prisma.appointment.findUnique({
      where: { id: sourceId },
      select: {
        recurringSeriesId: true,
        recurrence: true,
      },
    });
    const sourceRecurrence = normalizeAppointmentRecurrence((sourceAppointment as any)?.recurrence);
    const seriesIds: string[] = Array.from(
      new Set(
        [
          ...currentOccurrences.map((occurrence: any) => String(occurrence.seriesId || "")),
          normalizeId((sourceAppointment as any)?.recurringSeriesId) || "",
          normalizeId(sourceRecurrence?.recurringSeriesId) || "",
        ].filter(Boolean)
      )
    );
    if (!seriesIds.length) return [];

    for (const seriesId of seriesIds) {
      await promoteRecurringSeriesHead(seriesId);
    }

    const occurrences = await recurringOccurrence.findMany({
      where: {
        seriesId: { in: seriesIds },
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
      orderBy: [
        { seriesId: "asc" },
        { sequence: "asc" },
        { generatedForDate: "asc" },
        { createdAt: "asc" },
      ],
    });
    const relatedAppointmentIds: string[] = Array.from(new Set<string>(occurrences
      .filter(
        (occurrence: any) =>
          occurrence.appointmentId !== sourceId
      )
      .map((occurrence: any) => String(occurrence.appointmentId || ""))
      .filter(Boolean)));

    if (!relatedAppointmentIds.length) return [];

    const appointments = (await prisma.appointment.findMany({
      where: { id: { in: relatedAppointmentIds }, deleted: false },
    })).map(toAppointment);
    const appointmentsById = new Map(
      appointments
        .filter((appointment: Appointment) => appointment.id)
        .map((appointment: Appointment) => [String(appointment.id), appointment])
    );

    return relatedAppointmentIds
      .map((id: string) => appointmentsById.get(id))
      .filter((appointment: Appointment | undefined): appointment is Appointment =>
        Boolean(appointment && !appointment.deleted && normalizeStatus(appointment.status) !== "cancelled")
      );
  } catch (error) {
    warnRecurringTableSync("Could not read recurring appointment table chain", error);
    return [];
  }
};

const getRecurringGeneratedAppointmentsFromJson = async (
  appointmentId?: string | null
): Promise<Appointment[]> => {
  const sourceId = String(appointmentId || "").trim();
  if (!sourceId) return [];

  const chain: Appointment[] = [];
  const visited = new Set<string>([sourceId]);
  const activeAppointments = (await prisma.appointment.findMany({
    where: { deleted: false },
    orderBy: [{ date: "asc" }, { time: "asc" }, { createdAt: "asc" }],
  })).map(toAppointment).filter((appointment) => normalizeStatus(appointment.status) !== "cancelled");
  const appointmentsById = new Map(
    activeAppointments
      .filter((appointment) => appointment.id)
      .map((appointment) => [String(appointment.id), appointment])
  );
  const linkedAppointmentIds = new Map<string, Set<string>>();
  const addLink = (left?: string | null, right?: string | null) => {
    const leftId = normalizeId(left);
    const rightId = normalizeId(right);
    if (!leftId || !rightId) return;

    const leftLinks = linkedAppointmentIds.get(leftId) || new Set<string>();
    leftLinks.add(rightId);
    linkedAppointmentIds.set(leftId, leftLinks);

    const rightLinks = linkedAppointmentIds.get(rightId) || new Set<string>();
    rightLinks.add(leftId);
    linkedAppointmentIds.set(rightId, rightLinks);
  };

  for (const appointment of activeAppointments) {
    const recurrence = normalizeAppointmentRecurrence((appointment as any).recurrence);
    const parentId = String(recurrence?.generatedFromId || recurrence?.sourceAppointmentId || "").trim();
    if (appointment.id) {
      addLink(parentId, appointment.id);
      addLink(appointment.id, recurrence?.generatedAppointmentId || null);
    }
  }

  const queue = Array.from(linkedAppointmentIds.get(sourceId) || []);
  while (queue.length) {
    const nextId = queue.shift();
    if (!nextId || visited.has(nextId)) continue;
    visited.add(nextId);

    const appointment = appointmentsById.get(nextId);
    if (appointment && !appointment.deleted) {
      chain.push(appointment);
      for (const linkedId of linkedAppointmentIds.get(nextId) || []) {
        if (!visited.has(linkedId)) queue.push(linkedId);
      }
    }
  }

  return chain.sort((left, right) => {
    const dateCompare = String(left.date || "").localeCompare(String(right.date || ""));
    if (dateCompare !== 0) return dateCompare;
    return String(left.time || "").localeCompare(String(right.time || ""));
  });
};

export const getRecurringGeneratedAppointments = async (
  appointmentId?: string | null
): Promise<Appointment[]> => {
  const tableBackedChain = await getRecurringGeneratedAppointmentsFromTable(appointmentId);
  if (tableBackedChain.length) return tableBackedChain;
  return getRecurringGeneratedAppointmentsFromJson(appointmentId);
};

const getRecurrenceTargetDate = (appointmentDate: string, recurrence: AppointmentRecurrencePayload) => {
  if (recurrence.option === "Custom") {
    const customDate = parseDateOnly(recurrence.customDate);
    if (customDate) return customDate;
  }

  const sourceDate = parseDateOnly(appointmentDate);
  if (!sourceDate) return null;

  const monthsByOption: Record<RecurringAppointmentOption, number> = {
    "1 month": 1,
    "3 months": 3,
    "6 months": 6,
    Custom: 1,
  };

  return addMonthsClamped(sourceDate, monthsByOption[recurrence.option] || 1);
};

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
  recurrence,
  generatedAppointmentId,
}: {
  source: Appointment;
  generatedDate: string;
  recurrence: AppointmentRecurrencePayload;
  generatedAppointmentId?: string;
}) => {
  const now = new Date();
  const price = Number(source.price || 0);
  const discount = Number(source.discount || 0);
  const recurrenceForGeneratedAppointment: AppointmentRecurrencePayload = {
    enabled: false,
    option: recurrence.option,
    customDate: recurrence.customDate || null,
    recurringSeriesId: recurrence.recurringSeriesId || (source as any).recurringSeriesId || null,
    generatedFromId: source.id || null,
    generatedFromDate: source.date,
    sourceAppointmentId: source.id || null,
    sourceAppointmentDate: source.date,
    createdFromAppointmentId: source.id || null,
    createdFromAppointmentDate: source.date,
    originalGeneratedFromId: source.id || null,
    originalGeneratedFromDate: source.date,
  };

  return {
    id: generatedAppointmentId || makeAppointmentId(),
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
    recurrence: recurrenceForGeneratedAppointment,
    isRecurring: false,
    recurringSeriesId: recurrenceForGeneratedAppointment.recurringSeriesId || null,
  };
};

const writeAppointmentRecurrence = async (
  appointment: Appointment,
  recurrence: AppointmentRecurrencePayload
) => {
  const syncedSeriesId = await syncRecurringTablesForAppointment(appointment, recurrence);
  const recurringSeriesId =
    syncedSeriesId || getAppointmentRecurringSeriesId(appointment, recurrence);
  const recurrenceToSave = recurringSeriesId
    ? { ...recurrence, recurringSeriesId }
    : recurrence;

  const saved = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      recurrence: recurrenceToSave as any,
      isRecurring: Boolean(recurrenceToSave.enabled),
      recurringSeriesId,
      updatedAt: new Date(),
    } as any,
  });

  return toAppointment(saved);
};

const cancelGeneratedRecurringAppointment = async ({
  source,
  generatedAppointmentId,
  rootSource,
  cancelAppointmentIds,
  changedBy,
  changedByName,
}: {
  source: Appointment;
  generatedAppointmentId?: string | null;
  rootSource?: Appointment;
  cancelAppointmentIds?: Set<string> | null;
  changedBy: string;
  changedByName?: string;
}): Promise<Appointment[]> => {
  if (!generatedAppointmentId) return [];

  const existing = toAppointment(
    await prisma.appointment.findUnique({ where: { id: generatedAppointmentId } })
  );
  if (!existing || existing.deleted) return [];

  const previousState = { ...existing };
  const now = new Date();
  const existingRecurrence = normalizeAppointmentRecurrence((existing as any).recurrence);
  const rootAppointment = rootSource || source;
  const cancelledDescendants = await cancelGeneratedRecurringAppointment({
    source: existing,
    generatedAppointmentId: existingRecurrence?.generatedAppointmentId,
    rootSource: rootAppointment,
    cancelAppointmentIds,
    changedBy,
    changedByName,
  });
  const shouldCancelAppointment = !cancelAppointmentIds || cancelAppointmentIds.has(String(existing.id));
  if (!shouldCancelAppointment) {
    return cancelledDescendants;
  }

  const nextState: Appointment = {
    ...existing,
    status: "cancelled",
    deleted: true,
    deletedAt: now,
    updatedAt: now,
    isRecurring: false,
    recurrence: {
      ...(existingRecurrence || {}),
      enabled: false,
      generatedAppointmentId: null,
      generatedAppointmentDate: null,
      cancelledGeneratedAppointmentId: existingRecurrence?.generatedAppointmentId || null,
      cancelledGeneratedAppointmentDate: existingRecurrence?.generatedAppointmentDate || null,
      cancelledByRecurrenceSourceId: source.id || null,
      cancelledByRecurrenceRootId: rootAppointment.id || null,
      cancelledAt: now.toISOString(),
    } as any,
  };

  const saved = toAppointment(
    await prisma.appointment.update({
      where: { id: generatedAppointmentId },
      data: {
        status: "cancelled",
        deleted: true,
        deletedAt: now,
        updatedAt: now,
        isRecurring: false,
        recurrence: (nextState as any).recurrence,
      } as any,
    })
  );
  await markRecurringOccurrenceStatus(
    generatedAppointmentId,
    RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
    now
  );

  await createAppointmentLog(
    generatedAppointmentId,
    previousState,
    nextState,
    changedBy,
    changedByName || "System",
    "status_change",
    0,
    `Recurring appointment removed because recurrence was disabled on ${formatRecurringLogDate(rootAppointment.date)}.`
  );

  const parentId = String(existingRecurrence?.generatedFromId || existingRecurrence?.sourceAppointmentId || "").trim();
  const parentWillRemainActive =
    parentId &&
    parentId !== String(rootAppointment.id || "") &&
    (!cancelAppointmentIds || !cancelAppointmentIds.has(parentId));

  if (parentWillRemainActive) {
    const parent = toAppointment(
      await prisma.appointment.findUnique({ where: { id: parentId } })
    );
    const parentRecurrence = normalizeAppointmentRecurrence((parent as any)?.recurrence);
    if (
      parent &&
      !parent.deleted &&
      parentRecurrence?.generatedAppointmentId &&
      String(parentRecurrence.generatedAppointmentId) === String(existing.id)
    ) {
      await prisma.appointment.update({
        where: { id: parentId },
        data: {
          recurrence: {
            ...parentRecurrence,
            enabled: false,
            generatedAppointmentId: null,
            generatedAppointmentDate: null,
            cancelledGeneratedAppointmentId: existing.id || null,
            cancelledGeneratedAppointmentDate: existing.date || null,
            cancelledAt: now.toISOString(),
          } as any,
          isRecurring: false,
          updatedAt: now,
        } as any,
      });
      await markRecurringOccurrenceStatus(
        parentId,
        RECURRENCE_OCCURRENCE_STATUS_STOPPED,
        now
      );
    }
  }

  return [saved, ...cancelledDescendants];
};

export const buildInitialAppointmentRecurrence = (recurrenceInput?: unknown) => {
  const recurrence = normalizeAppointmentRecurrence(recurrenceInput);
  if (!recurrence?.enabled) return null;

  return {
    ...recurrence,
    generatedAppointmentId: recurrence.generatedAppointmentId || null,
    generatedAppointmentDate: recurrence.generatedAppointmentDate || null,
  };
};

export const reconcileAppointmentRecurrence = async ({
  appointment,
  allAppointments,
  recurrenceInput,
  recurrenceInputProvided = false,
  changedBy,
  changedByName,
  doctorStaff = [],
}: ReconcileAppointmentRecurrenceArgs): Promise<Appointment> => {
  if (!appointment.id) return appointment;

  const existingRecurrence = normalizeAppointmentRecurrence((appointment as any).recurrence);
  const requestedRecurrence = recurrenceInputProvided
    ? normalizeAppointmentRecurrence(recurrenceInput, existingRecurrence)
    : existingRecurrence;

  if (!requestedRecurrence) return appointment;

  const requestedDeletionIds = Array.isArray((requestedRecurrence as any).deleteGeneratedAppointmentIds)
    ? new Set<string>(
        (requestedRecurrence as any).deleteGeneratedAppointmentIds
          .map((id: unknown) => String(id || "").trim())
          .filter(Boolean)
      )
    : null;
  const requestedDeletionIdValues = Array.from(requestedDeletionIds || []);

  if (isInactiveAppointment(appointment)) {
    return cancelRecurringSeriesAppointments({
      appointment,
      cancelAppointmentIds: requestedDeletionIdValues,
      changedBy,
      changedByName,
    });
  }

  if (requestedRecurrence.enabled) {
    const existingGeneratedAppointmentId = normalizeId(existingRecurrence?.generatedAppointmentId);
    const requestedGeneratedAppointmentId = normalizeId(requestedRecurrence.generatedAppointmentId);
    const activeRecurringChildAppointment = await getActiveRecurringChildAppointment(appointment.id);

    if (existingGeneratedAppointmentId && !requestedGeneratedAppointmentId) {
      requestedRecurrence.generatedAppointmentId = existingGeneratedAppointmentId;
      requestedRecurrence.generatedAppointmentDate =
        existingRecurrence?.generatedAppointmentDate || requestedRecurrence.generatedAppointmentDate || null;
    }

    if (
      activeRecurringChildAppointment?.id &&
      !normalizeId(requestedRecurrence.generatedAppointmentId)
    ) {
      requestedRecurrence.generatedAppointmentId = activeRecurringChildAppointment.id;
      requestedRecurrence.generatedAppointmentDate = activeRecurringChildAppointment.date || null;
    }
  }

  if (!requestedRecurrence.enabled) {
    if (
      !existingRecurrence?.enabled &&
      !requestedRecurrence.generatedAppointmentId &&
      !requestedDeletionIds
    ) {
      return appointment;
    }

    if (requestedDeletionIds) {
      const generatedChain = await getRecurringGeneratedAppointments(appointment.id);
      const generatedChainIds = new Set(
        generatedChain.map((generatedAppointment) => String(generatedAppointment.id || "")).filter(Boolean)
      );
      if (requestedRecurrence.generatedAppointmentId) {
        generatedChainIds.add(String(requestedRecurrence.generatedAppointmentId));
      }

      for (const generatedAppointmentId of requestedDeletionIdValues) {
        if (!generatedChainIds.has(generatedAppointmentId)) continue;
        await cancelRecurringSeriesAppointments({
          appointment,
          cancelAppointmentIds: [generatedAppointmentId],
          changedBy,
          changedByName,
          includeCurrentAppointment: false,
        });
      }
    } else {
      await cancelGeneratedRecurringAppointment({
        source: appointment,
        generatedAppointmentId: requestedRecurrence.generatedAppointmentId,
        changedBy,
        changedByName,
      });
    }

    const directGeneratedAppointmentWasCancelled =
      !requestedDeletionIds ||
      (requestedRecurrence.generatedAppointmentId
        ? requestedDeletionIds.has(String(requestedRecurrence.generatedAppointmentId))
        : false);

    return writeAppointmentRecurrence(appointment, {
      ...requestedRecurrence,
      enabled: false,
      generatedAppointmentId: null,
      generatedAppointmentDate: null,
      cancelledGeneratedAppointmentId: directGeneratedAppointmentWasCancelled
        ? requestedRecurrence.generatedAppointmentId || null
        : null,
      cancelledGeneratedAppointmentDate: directGeneratedAppointmentWasCancelled
        ? requestedRecurrence.generatedAppointmentDate || null
        : null,
      cancelledGeneratedAppointmentIds: requestedDeletionIdValues,
      cancelledAt: new Date().toISOString(),
    });
  }

  const targetDate = getRecurrenceTargetDate(appointment.date, requestedRecurrence);
  if (!targetDate) return appointment;

  const existingGeneratedAppointment = requestedRecurrence.generatedAppointmentId
    ? toAppointment(
        await prisma.appointment.findUnique({
          where: { id: requestedRecurrence.generatedAppointmentId },
        })
      )
    : null;
  const existingGeneratedAppointmentId =
    existingGeneratedAppointment && !existingGeneratedAppointment.deleted
      ? existingGeneratedAppointment.id
      : null;

  const generatedDate = findRecurringAppointmentDate({
    appointment,
    allAppointments,
    targetDate,
    existingGeneratedAppointmentId,
    doctorStaff,
  });

  if (!generatedDate) return appointment;

  const sourceRecurringSeriesId = await syncRecurringTablesForAppointment(
    appointment,
    requestedRecurrence
  );
  const recurrenceForGeneration = sourceRecurringSeriesId
    ? { ...requestedRecurrence, recurringSeriesId: sourceRecurringSeriesId }
    : requestedRecurrence;

  let generatedAppointment: Appointment;
  const generatedData = buildGeneratedAppointmentData({
    source: appointment,
    generatedDate,
    recurrence: recurrenceForGeneration,
    generatedAppointmentId: existingGeneratedAppointmentId || undefined,
  });

  if (existingGeneratedAppointmentId && existingGeneratedAppointment) {
    const previousState = { ...existingGeneratedAppointment };
    const generatedUpdateData = { ...generatedData } as any;
    const existingGeneratedRecurrence = normalizeAppointmentRecurrence(
      (existingGeneratedAppointment as any).recurrence
    );
    if (existingGeneratedRecurrence?.enabled) {
      const createdFromMetadata = getImmutableCreatedFromMetadata(
        existingGeneratedRecurrence,
        existingGeneratedAppointment,
        appointment
      );
      generatedUpdateData.recurrence = {
        ...existingGeneratedRecurrence,
        recurringSeriesId:
          sourceRecurringSeriesId ||
          existingGeneratedRecurrence.recurringSeriesId ||
          (existingGeneratedAppointment as any).recurringSeriesId ||
          null,
        generatedFromId: appointment.id,
        generatedFromDate: appointment.date,
        ...createdFromMetadata,
      };
      generatedUpdateData.isRecurring = true;
    }
    delete generatedUpdateData.id;
    generatedAppointment = toAppointment(
      await prisma.appointment.update({
        where: { id: existingGeneratedAppointmentId },
        data: {
          ...generatedUpdateData,
          createdAt: existingGeneratedAppointment.createdAt || generatedData.createdAt,
        } as any,
      })
    );
    const changeType =
      previousState.date !== generatedAppointment.date || previousState.time !== generatedAppointment.time
        ? "rescheduled"
        : "update";

    await createAppointmentLog(
      generatedAppointment.id!,
      previousState,
      generatedAppointment,
      changedBy,
      changedByName || "System",
      changeType,
      0,
      "Updated from recurring appointment changes."
    );
  } else {
    generatedAppointment = toAppointment(
      await prisma.appointment.create({ data: generatedData as any })
    );

    await createAppointmentLog(
      generatedAppointment.id!,
      { status: "none", paymentStatus: "none", price: 0, balance: 0, totalPaid: 0 } as any,
      generatedAppointment,
      changedBy,
      changedByName || "System",
      "update",
      0,
      `Created from recurring schedule from ${formatRecurringLogDate(appointment.date)}.`
    );
  }
  generatedAppointment = await syncGeneratedRecurringTables({
    source: appointment,
    generatedAppointment,
    recurrence: recurrenceForGeneration,
    seriesId: sourceRecurringSeriesId,
  });

  const sourceRecurrence: AppointmentRecurrencePayload = {
    ...recurrenceForGeneration,
    enabled: true,
    sourceAppointmentId: appointment.id,
    generatedAppointmentId: generatedAppointment.id || null,
    generatedAppointmentDate: generatedAppointment.date || null,
    lastGeneratedAt: new Date().toISOString(),
  };

  return writeAppointmentRecurrence(appointment, sourceRecurrence);
};
