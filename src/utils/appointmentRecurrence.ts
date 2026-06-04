import { Appointment } from "../types/appointment";
import { CART_APPOINTMENT_STATUS, isPatientCartStatus, normalizeStatus } from "../constants/appointmentStatuses";
import { hasConflict } from "./appointment-helpers";
import { normalizeAppointmentDuration } from "./appointment-durations";
import { createAppointmentLog } from "./appointmentLogs";
import { DoctorIdentity } from "./doctorIdentity";
import { getPastRestrictedAppointmentStatus } from "./appointmentStatusLifecycle";
import { prisma } from "../lib/prisma";

const RECURRING_APPOINTMENT_OPTIONS = ["Weekly", "Monthly", "Every 2 months", "Every 3 months", "Every 6 months", "Custom"] as const;
const LEGACY_RECURRING_APPOINTMENT_OPTIONS = ["1 month", "3 months", "6 months"] as const;
const REPEAT_COUNT_OPTIONS = [1, 2, 3, 4] as const;
type RepeatCount = typeof REPEAT_COUNT_OPTIONS[number];
type RecurringAppointmentOption =
  | typeof RECURRING_APPOINTMENT_OPTIONS[number]
  | typeof LEGACY_RECURRING_APPOINTMENT_OPTIONS[number];

export type AppointmentRecurrencePayload = {
  enabled: boolean;
  option: RecurringAppointmentOption;
  customDate?: string | null;
  repeatCount?: RepeatCount;
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

const DEFAULT_RECURRING_APPOINTMENT_OPTION: RecurringAppointmentOption = "Monthly";
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
  const lowerValue = value.toLowerCase();
  const aliases: Record<string, RecurringAppointmentOption> = {
    weekly: "Weekly",
    "every week": "Weekly",
    monthly: "Monthly",
    "1 month": "Monthly",
    "every month": "Monthly",
    "2 months": "Every 2 months",
    "every 2 months": "Every 2 months",
    "3 months": "Every 3 months",
    "every 3 months": "Every 3 months",
    "6 months": "Every 6 months",
    "every 6 months": "Every 6 months",
    custom: "Custom",
  };

  if (aliases[lowerValue]) return aliases[lowerValue];
  if (RECURRING_APPOINTMENT_OPTIONS.includes(value as typeof RECURRING_APPOINTMENT_OPTIONS[number])) {
    return value as RecurringAppointmentOption;
  }
  if (LEGACY_RECURRING_APPOINTMENT_OPTIONS.includes(value as typeof LEGACY_RECURRING_APPOINTMENT_OPTIONS[number])) {
    return value as RecurringAppointmentOption;
  }

  return DEFAULT_RECURRING_APPOINTMENT_OPTION;
};

const normalizeRepeatCount = (value?: unknown): RepeatCount => {
  const count = Number(value);
  return REPEAT_COUNT_OPTIONS.includes(count as RepeatCount) ? (count as RepeatCount) : 1;
};

const areRecurrenceRulesEqual = (
  left?: AppointmentRecurrencePayload | null,
  right?: AppointmentRecurrencePayload | null
): boolean => {
  const normalizedLeft = normalizeAppointmentRecurrence(left) || {
    enabled: false,
    option: DEFAULT_RECURRING_APPOINTMENT_OPTION,
    customDate: null,
    repeatCount: 1,
  };
  const normalizedRight = normalizeAppointmentRecurrence(right) || {
    enabled: false,
    option: DEFAULT_RECURRING_APPOINTMENT_OPTION,
    customDate: null,
    repeatCount: 1,
  };

  return (
    normalizedLeft.enabled === normalizedRight.enabled &&
    normalizedLeft.option === normalizedRight.option &&
    normalizeDateOnly(normalizedLeft.customDate) === normalizeDateOnly(normalizedRight.customDate) &&
    normalizeRepeatCount(normalizedLeft.repeatCount) === normalizeRepeatCount(normalizedRight.repeatCount)
  );
};

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

const addDaysToDateOnly = (date: string, days: number) => {
  const parsed = parseDateOnly(date);
  if (!parsed) return "";

  parsed.setDate(parsed.getDate() + days);
  return formatDateOnly(parsed);
};

const addMonthsClamped = (date: Date, months: number) => {
  const targetYear = date.getFullYear();
  const targetMonth = date.getMonth() + months;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDayOfTargetMonth);
  return new Date(targetYear, targetMonth, day);
};

const dateDiffInDays = (start: Date, end: Date) =>
  Math.round(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) /
      86400000
  );

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
      repeatCount: normalizeRepeatCount(fallbackRecord.repeatCount),
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
    repeatCount: normalizeRepeatCount(record.repeatCount ?? fallbackRecord.repeatCount),
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

const makeRecurringSeriesId = (appointmentId?: string | null, date?: string | null) => {
  const idPart = appointmentId ? String(appointmentId).replace(/[^A-Za-z0-9_-]/g, "") : `auto${Date.now()}`;
  const normalizedDate = normalizeDateOnly(date) || String(Date.now());
  return `rec_series_${idPart}_${normalizedDate}`;
};

const makeRecurringOccurrenceId = () =>
  `rec_occ_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const makeAppointmentLogId = () =>
  `apt_log_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

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

const RECURRING_SERIES_MEMBER_STATUSES = new Set(["scheduled", "reserved"]);

const isRecurringSeriesMemberAppointment = (appointment?: Appointment | null) =>
  Boolean(
    appointment &&
      !appointment.deleted &&
      RECURRING_SERIES_MEMBER_STATUSES.has(normalizeStatus(appointment.status))
  );

const getRecurringSeriesEndDate = (
  rows: Array<{ appointment: Appointment }>
): string | null => {
  const lastAppointment = rows[rows.length - 1]?.appointment;
  return normalizeDateOnly(lastAppointment?.date) || null;
};

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
        const isSeriesRootAppointment = appointment.id === existingSeries.rootAppointmentId;
        const shouldUpdateSeries = recurrence.enabled || isSeriesRootAppointment;

        if (shouldUpdateSeries) {
          await recurringSeries.update({
            where: { id: existingSeriesId },
            data: {
              interval: recurrence.option,
              customDate: recurrence.customDate || null,
              startDate: existingSeries.startDate || appointment.date || null,
              endDate: existingSeries.endDate || appointment.date || null,
              status: recurrence.enabled
                ? RECURRENCE_SERIES_STATUS_ACTIVE
                : RECURRENCE_SERIES_STATUS_STOPPED,
              stoppedAt: recurrence.enabled ? null : existingSeries.stoppedAt || now,
              updatedAt: now,
            },
          });
        }

        return existingSeriesId;
      }
    }

    const parentAppointmentId = normalizeId(
      recurrence.generatedFromId || recurrence.sourceAppointmentId
    );
    if (!recurrence.enabled && parentAppointmentId) {
      return existingSeriesId;
    }

    if (parentAppointmentId) {
      const parentOccurrence = await recurringOccurrence.findFirst({
        where: { appointmentId: parentAppointmentId },
      });
      if (parentOccurrence?.seriesId) {
        const parentSeries = await recurringSeries.findUnique({ where: { id: parentOccurrence.seriesId } });
        await recurringSeries.update({
          where: { id: parentOccurrence.seriesId },
          data: {
            interval: recurrence.option,
            customDate: recurrence.customDate || null,
            startDate: parentSeries?.startDate || appointment.date || null,
            endDate: parentSeries?.endDate || appointment.date || null,
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
          startDate: rootSeries.startDate || appointment.date || null,
          endDate: rootSeries.endDate || appointment.date || null,
          status: recurrence.enabled
            ? RECURRENCE_SERIES_STATUS_ACTIVE
            : RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: recurrence.enabled ? null : rootSeries.stoppedAt || now,
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
        id: makeRecurringSeriesId(appointment.id, appointment.date),
        rootAppointmentId: appointment.id,
        interval: recurrence.option,
        customDate: recurrence.customDate || null,
        startDate: appointment.date || null,
        endDate: appointment.date || null,
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
          isRecurringSeriesMemberAppointment(row.appointment)
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
      await (prisma as any).recurringOccurrence.updateMany({
        where: { seriesId: id },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });
      await recurringSeries.update({
        where: { id },
        data: {
          endDate: null,
          status: RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: series.stoppedAt || now,
          updatedAt: now,
        },
      });
      return;
    }

    if (activeRows.length === 1) {
      const onlyAppointment = activeRows[0].appointment;

      // Keep the single active appointment's recurrence metadata intact for history.
      // Only cancel other (non-active) occurrences and mark the series stopped.
      await (prisma as any).recurringOccurrence.updateMany({
        where: {
          seriesId: id,
          appointmentId: { not: onlyAppointment.id },
        },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });

      await recurringSeries.update({
        where: { id },
        data: {
          rootAppointmentId: onlyAppointment.id || series.rootAppointmentId,
          endDate: null,
          status: RECURRENCE_SERIES_STATUS_STOPPED,
          stoppedAt: series.stoppedAt || now,
          updatedAt: now,
        },
      });
      return;
    }

    const head = activeRows[0].appointment;
    const seriesEndDate = getRecurringSeriesEndDate(activeRows);
    await recurringSeries.update({
      where: { id },
      data: {
        rootAppointmentId: head.id,
        endDate: seriesEndDate,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        stoppedAt: null,
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
  const occurrenceStatus = isRecurringSeriesMemberAppointment(appointment)
    ? status
    : RECURRENCE_OCCURRENCE_STATUS_CANCELLED;
  // parentAppointmentId should ONLY be set if this appointment was GENERATED FROM another one.
  // sourceAppointmentId is just metadata about the series source, not the direct parent.
  const parentAppointmentId = normalizeId(recurrence.generatedFromId);

  try {
    const existingOccurrence = await recurringOccurrence.findFirst({
      where: { appointmentId: appointment.id },
    });
    let sequence = Number(existingOccurrence?.sequence ?? 0);
    let finalStatus = occurrenceStatus;

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

    // Try the upsert; if it fails due to unique constraint on parentAppointmentId + status,
    // fall back to cancelled status (only one active child per parent is allowed).
    try {
      await recurringOccurrence.upsert({
        where: { appointmentId: appointment.id },
        update: {
          seriesId,
          parentAppointmentId,
          generatedForDate: appointment.date,
          status: finalStatus,
          updatedAt: now,
        },
        create: {
          id: makeRecurringOccurrenceId(),
          seriesId,
          appointmentId: appointment.id,
          parentAppointmentId,
          sequence,
          generatedForDate: appointment.date,
          status: finalStatus,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (upsertErr: any) {
      // If the upsert failed due to unique constraint on parentAppointmentId (active status),
      // it means there's already an active child for this parent. Cancel this one instead.
      if (
        parentAppointmentId &&
        finalStatus === RECURRENCE_OCCURRENCE_STATUS_ACTIVE &&
        (upsertErr?.code === "P2002" || upsertErr?.message?.includes("parentAppointmentId"))
      ) {
        console.info("[Recurring Sync] Active child already exists for parent; cancelling this occurrence", {
          appointmentId: appointment.id,
          parentAppointmentId,
          seriesId,
        });
        await recurringOccurrence.upsert({
          where: { appointmentId: appointment.id },
          update: {
            seriesId,
            parentAppointmentId,
            generatedForDate: appointment.date,
            status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
            updatedAt: now,
          },
          create: {
            id: makeRecurringOccurrenceId(),
            seriesId,
            appointmentId: appointment.id,
            parentAppointmentId,
            sequence,
            generatedForDate: appointment.date,
            status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else {
        throw upsertErr;
      }
    }

    // Defensive repair: if multiple occurrences were created with sequence=0 (heads),
    // recalculate and promote a single canonical head. This can happen under
    // concurrent upserts where two rows are created before either can see the other.
    try {
      const headCount = await recurringOccurrence.count({
        where: { seriesId, sequence: 0, status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE },
      });
      if (headCount > 1) {
        await promoteRecurringSeriesHead(seriesId);
      }
    } catch (err) {
      warnRecurringTableSync("Could not repair duplicate recurring series head", err);
    }
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
  deleteRelatedAppointments = false,
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
    const shouldMarkDeleted = Boolean(
      appointmentToCancel.deleted ||
      (!isCurrentAppointment && deleteRelatedAppointments)
    );
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
        `Recurring appointment cancelled because ${formatRecurringLogDate(appointment.date)} was cancelled.`
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
  const sourceDate = parseDateOnly(appointmentDate);

  if (recurrence.option === "Custom") {
    const customDate = parseDateOnly(recurrence.customDate);
    if (!customDate || !sourceDate) return null;
    const rootDate = parseDateOnly(
      recurrence.sourceAppointmentDate ||
      recurrence.generatedFromDate ||
      appointmentDate
    ) || sourceDate;
    const isRootStep = formatDateOnly(rootDate) === formatDateOnly(sourceDate);

    if (isRootStep) {
      const today = parseDateOnly(formatDateOnly(new Date())) || new Date();
      const dayAfterSource = new Date(
        sourceDate.getFullYear(),
        sourceDate.getMonth(),
        sourceDate.getDate() + 1
      );
      const minimumDate = dayAfterSource.getTime() > today.getTime() ? dayAfterSource : today;

      return customDate.getTime() >= minimumDate.getTime() ? customDate : null;
    }

    const intervalDays = Math.max(1, dateDiffInDays(rootDate, customDate));
    const targetDate = new Date(sourceDate);
    targetDate.setDate(sourceDate.getDate() + intervalDays);
    return targetDate;
  }

  if (!sourceDate) return null;

  if (recurrence.option === "Weekly") {
    const targetDate = new Date(sourceDate);
    targetDate.setDate(sourceDate.getDate() + 7);
    return targetDate;
  }

  const monthsByOption: Partial<Record<RecurringAppointmentOption, number>> = {
    Monthly: 1,
    "Every 2 months": 2,
    "Every 3 months": 3,
    "Every 6 months": 6,
    "1 month": 1,
    "3 months": 3,
    "6 months": 6,
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
    recurrence: recurrenceForGeneratedAppointment,
    isRecurring: false,
    recurringSeriesId: recurrenceForGeneratedAppointment.recurringSeriesId || null,
  };
};

const createAppointmentLogInTransaction = async ({
  tx,
  appointmentId,
  previousState,
  newState,
  changedBy,
  changedByName,
  changeType = "update",
  amount = 0,
  notes,
}: {
  tx: any;
  appointmentId: string;
  previousState: Appointment;
  newState: Partial<Appointment>;
  changedBy: string;
  changedByName?: string;
  changeType?: string;
  amount?: number;
  notes?: string;
}) => {
  await tx.appointmentLog.create({
    data: {
      id: makeAppointmentLogId(),
      appointmentId,
      previousState: previousState as any,
      newState: newState as any,
      changedBy,
      changedByName: changedByName || "System",
      changedAt: new Date(),
      changeType,
      amount,
      notes,
    },
  });
};

const getSortedActiveOccurrenceRows = (
  occurrences: any[],
  appointmentsById: Map<string, Appointment>
) =>
  sortAppointmentsBySchedule(
    occurrences
      .filter((occurrence) => occurrence?.status !== RECURRENCE_OCCURRENCE_STATUS_CANCELLED)
      .map((occurrence) => ({
        occurrence,
        appointment: appointmentsById.get(String(occurrence.appointmentId || "")),
      }))
      .filter(
        (row: { occurrence: any; appointment?: Appointment }): row is { occurrence: any; appointment: Appointment } =>
          isRecurringSeriesMemberAppointment(row.appointment)
      )
  );

/**
 * CLEAN RECURRING SERIES SPLIT LOGIC
 * ====================================
 * When a user edits a middle/tail appointment in a recurring series to change "This and all future sessions",
 * this function executes a 5-step procedure to preserve historical data and split the series cleanly:
 *
 * STEP 1: Truncate the old series (set endDate to day before edited appointment)
 * STEP 2: Soft-cancel all future appointments in the old series (status = 'cancelled', not hard-deleted)
 * STEP 3: Create a brand-new recurring series with the new recurrence settings
 * STEP 4: Migrate the edited appointment to the new series (preserving payments and all other data)
 * STEP 5: Spawn 4 new future appointments for the new series
 *
 * All operations use database transactions to ensure atomic updates with full rollback on failure.
 */
const maybeSplitRecurringSeriesAtAppointment = async ({
  appointment,
  allAppointments,
  requestedRecurrence,
  recurrenceInputProvided,
  changedBy,
  changedByName,
  doctorStaff,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  requestedRecurrence: AppointmentRecurrencePayload;
  recurrenceInputProvided: boolean;
  changedBy: string;
  changedByName?: string;
  doctorStaff: DoctorIdentity[];
}): Promise<Appointment | null> => {
  const appointmentId = normalizeId(appointment.id);
  const splitStartDate = normalizeDateOnly(appointment.date);

  if (!appointmentId || !splitStartDate || !requestedRecurrence.enabled) {
    return null;
  }

  if (!recurrenceInputProvided) return null;

  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const recurringSeries = (prisma as any).recurringSeries;

  // ═══════════════════════════════════════════════════════════════════════════════
  // PREREQUISITE CHECK: Verify the appointment belongs to an existing recurring series
  // ═══════════════════════════════════════════════════════════════════════════════
  const currentOccurrence = await recurringOccurrence.findFirst({
    where: {
      appointmentId,
      status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
    },
  });
  if (!currentOccurrence?.seriesId) return null;

  const oldSeries = await recurringSeries.findUnique({
    where: { id: currentOccurrence.seriesId },
  });
  if (!oldSeries) return null;

  // ═══════════════════════════════════════════════════════════════════════════════
  // GUARD: If recurrence is being disabled (DO NOT REPEAT selected), do NOT split the series.
  // This prevents accidental cancellation when user just wants to edit the current appointment.
  // ═══════════════════════════════════════════════════════════════════════════════
  if (!requestedRecurrence.enabled) {
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PREREQUISITE CHECK: Verify there are past appointments (cannot split at series start)
  // ═══════════════════════════════════════════════════════════════════════════════
  const oldOccurrences = await recurringOccurrence.findMany({
    where: {
      seriesId: oldSeries.id,
    },
  });
  const hasOlderOccurrence = oldOccurrences.some((occurrence: any) => {
    if (String(occurrence.appointmentId || "") === appointmentId) return false;
    const occurrenceDate = normalizeDateOnly(occurrence.generatedForDate);
    return Boolean(occurrenceDate && occurrenceDate < splitStartDate);
  });
  if (!hasOlderOccurrence) return null;

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXECUTION: Begin the 5-step split procedure within a database transaction
  // ═══════════════════════════════════════════════════════════════════════════════
  console.log(`[SPLIT] ====== STARTING RECURRING SERIES SPLIT ======`);
  console.log(`[SPLIT] Appointment ID: ${appointmentId}`);
  console.log(`[SPLIT] Split Start Date: ${splitStartDate}`);
  console.log(`[SPLIT] Old Series ID: ${currentOccurrence?.seriesId}`);
  console.log(`[SPLIT] New Series ID: ${makeRecurringSeriesId(appointmentId, splitStartDate)}`);
  console.log(`[SPLIT] Requested Recurrence: ${JSON.stringify(requestedRecurrence)}`);
  
  const now = new Date();
  const oldSeriesEndDateOneDayBefore = addDaysToDateOnly(splitStartDate, -1);
  const newSeriesId = makeRecurringSeriesId(appointmentId, splitStartDate);

  const splitResult = await prisma.$transaction(async (tx) => {
    const txAppointment = (tx as any).appointment;
    const txRecurringSeries = (tx as any).recurringSeries;
    const txRecurringOccurrence = (tx as any).recurringOccurrence;

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 1: TRUNCATE THE OLD MASTER RULE
    // Update the old series to end one day before the edited appointment.
    // This safely locks in all historical past appointments.
    // ─────────────────────────────────────────────────────────────────────────────
    await txRecurringSeries.update({
      where: { id: oldSeries.id },
      data: {
        endDate: oldSeriesEndDateOneDayBefore,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        stoppedAt: null,
        updatedAt: now,
      },
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 2: SOFT-DELETE / CANCEL OLD FUTURE APPOINTMENTS **FIRST** (BEFORE CREATING NEW)
    // Find all appointments in the old series that occur AFTER the edited date.
    // Update their status to 'cancelled' and disconnect from the old series.
    // CRITICAL: Do this BEFORE spawning new appointments to avoid conflicts.
    // ─────────────────────────────────────────────────────────────────────────────
    console.log(`[SPLIT] STEP 2 START: Looking for old future appointments after ${splitStartDate}`);
    const futureOldOccurrences = oldOccurrences.filter((occurrence: any) => {
      if (String(occurrence.appointmentId || "") === appointmentId) {
        console.log(`[SPLIT] STEP 2: Skipping head appointment ${appointmentId}`);
        return false;
      }
      const occurrenceDate = normalizeDateOnly(occurrence.generatedForDate);
      return Boolean(occurrenceDate && occurrenceDate > splitStartDate);
    });

    console.log(`[SPLIT] STEP 2: Found ${futureOldOccurrences.length} old future appointments to cancel`);

    for (const futureOccurrence of futureOldOccurrences) {
      const futureAppointmentId = String(futureOccurrence.appointmentId || "");
      if (!futureAppointmentId) continue;

      console.log(`[SPLIT] STEP 2: Cancelling future appointment ${futureAppointmentId}`);

      const futureAppointment = toAppointment(
        await txAppointment.findUnique({ where: { id: futureAppointmentId } })
      );
      if (!futureAppointment) continue;

      const previousState = { ...futureAppointment };

      // Cancel the appointment (do not hard-delete; preserve for audit trail)
      await txAppointment.update({
        where: { id: futureAppointmentId },
        data: {
          status: "cancelled",
          isRecurring: false,
          recurringSeriesId: oldSeries.id,
          updatedAt: now,
          recurrence: {
            ...(normalizeAppointmentRecurrence((futureAppointment as any).recurrence) || {}),
            enabled: false,
            generatedAppointmentId: null,
            generatedAppointmentDate: null,
            cancelledAt: now.toISOString(),
          } as any,
        } as any,
      });

      // Log the cancellation
      const cancelledAppointment = toAppointment(
        await txAppointment.findUnique({ where: { id: futureAppointmentId } })
      );

      await createAppointmentLogInTransaction({
        tx,
        appointmentId: futureAppointmentId,
        previousState,
        newState: cancelledAppointment!,
        changedBy,
        changedByName,
        changeType: "status_change",
        notes: `Cancelled from the recurring series. A new recurring schedule begins on ${formatRecurringLogDate(splitStartDate)}.`,
      });

      // Mark the occurrence as cancelled
      await txRecurringOccurrence.update({
        where: { appointmentId: futureAppointmentId },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 3: CREATE THE NEW MASTER RULE
    // Insert a brand-new recurring series with the new recurrence settings.
    // ─────────────────────────────────────────────────────────────────────────────
    const newSeriesRecurrence: AppointmentRecurrencePayload = {
      enabled: true,
      option: normalizeRecurrenceOption(requestedRecurrence.option),
      customDate:
        requestedRecurrence.option === "Custom"
          ? normalizeDateOnly(requestedRecurrence.customDate) || null
          : null,
      repeatCount: normalizeRepeatCount(requestedRecurrence.repeatCount),
      recurringSeriesId: newSeriesId,
      sourceAppointmentId: appointmentId,
      sourceAppointmentDate: splitStartDate,
    };

    await txRecurringSeries.create({
      data: {
        id: newSeriesId,
        rootAppointmentId: appointmentId,
        interval: newSeriesRecurrence.option,
        customDate: newSeriesRecurrence.customDate || null,
        startDate: splitStartDate,
        endDate: splitStartDate,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        createdAt: now,
        updatedAt: now,
        stoppedAt: null,
      },
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 4: MIGRATE THE EDITED APPOINTMENT
    // Disconnect from the old series and connect to the new series.
    // PRESERVE all payments and notes.
    // ─────────────────────────────────────────────────────────────────────────────
    console.log(`[SPLIT] STEP 4 START: Migrating head appointment ${appointmentId} to new series ${newSeriesId}`);
    const headAppointment = toAppointment(
      await txAppointment.findUnique({ where: { id: appointmentId } })
    );
    console.log(`[SPLIT] STEP 4: Found head appointment:`, {
      id: headAppointment?.id,
      status: headAppointment?.status,
      paymentStatus: headAppointment?.paymentStatus,
      isRecurring: headAppointment?.isRecurring,
      recurringSeriesId: headAppointment?.recurringSeriesId,
    });

    if (!headAppointment || isInactiveAppointment(headAppointment)) {
      throw new Error("Cannot migrate an inactive appointment to the new series.");
    }

    const headRecurrenceToSave: AppointmentRecurrencePayload = {
      ...normalizeAppointmentRecurrence((headAppointment as any).recurrence),
      ...newSeriesRecurrence,
      enabled: true,
    };

    console.log(`[SPLIT] STEP 4: About to update head with:`, {
      status: headAppointment.status,
      paymentStatus: headAppointment.paymentStatus,
      recurringSeriesId: newSeriesId,
      isRecurring: true,
    });

    const updatedHead = toAppointment(
      await txAppointment.update({
        where: { id: appointmentId },
        data: {
          status: headAppointment.status,
          paymentStatus: headAppointment.paymentStatus,
          recurringSeriesId: newSeriesId,
          isRecurring: true,
          recurrence: headRecurrenceToSave as any,
          updatedAt: now,
        } as any,
      })
    );

    console.log(`[SPLIT] STEP 4: Head appointment after update:`, {
      id: updatedHead?.id,
      status: updatedHead?.status,
      paymentStatus: updatedHead?.paymentStatus,
      isRecurring: updatedHead?.isRecurring,
      recurringSeriesId: updatedHead?.recurringSeriesId,
    });

    // Upsert the occurrence link to the new series
    console.log(`[SPLIT] STEP 4: Creating occurrence record for head (sequence=0)`);
    await txRecurringOccurrence.upsert({
      where: { appointmentId },
      update: {
        seriesId: newSeriesId,
        parentAppointmentId: null,
        sequence: 0,
        generatedForDate: splitStartDate,
        status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
        updatedAt: now,
      },
      create: {
        id: makeRecurringOccurrenceId(),
        seriesId: newSeriesId,
        appointmentId,
        parentAppointmentId: null,
        sequence: 0,
        generatedForDate: splitStartDate,
        status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
        createdAt: now,
        updatedAt: now,
      },
    });

    console.log(`[SPLIT] STEP 4: Occurrence upsert complete. Fetching updated head from DB...`);
    
    // Verify the head status didn't change
    const headAfterOccurrence = toAppointment(
      await txAppointment.findUnique({ where: { id: appointmentId } })
    );
    console.log(`[SPLIT] STEP 4: Head after occurrence upsert:`, {
      id: headAfterOccurrence?.id,
      status: headAfterOccurrence?.status,
      paymentStatus: headAfterOccurrence?.paymentStatus,
    });

    console.log(`[SPLIT] STEP 4: Creating appointment log...`);
    await createAppointmentLogInTransaction({
      tx,
      appointmentId,
      previousState: headAppointment,
      newState: updatedHead,
      changedBy,
      changedByName,
      changeType: "recurrence_change",
      notes: `Migrated to a new recurring series with ${newSeriesRecurrence.option} recurrence starting ${formatRecurringLogDate(splitStartDate)}.`,
    });

    console.log(`[SPLIT] STEP 4 COMPLETE: Head appointment migrated successfully`);

    // ─────────────────────────────────────────────────────────────────────────────
    // STEP 5: SPAWN BRAND NEW APPOINTMENTS FOR THE NEW TIMELINE
    // Generate the next 4 unique appointment instances linked to the new series.
    // IMPORTANT: Calculate dates relative to series start + offset, NOT relative to
    // previously created appointments. This ensures Jan 16 is attempted (not blocked
    // by old series anymore), and if blocked, Jan 17 is used. Then next attempt is
    // Jan 23 (series start + 2*7), NOT Jan 24 (prev created date + 7).
    // ─────────────────────────────────────────────────────────────────────────────
    const newSeriesAppointments: Appointment[] = [updatedHead];
    const appointmentsForConflict = [...allAppointments];
    const seenDates = new Set<string>([splitStartDate]);
    const spawnCount = 4; // Pre-generate 4 future instances
    let logicalBaseDate = splitStartDate; // Track logical cadence separately from created dates
    let currentParent = updatedHead;

    for (let i = 0; i < spawnCount; i += 1) {
      // Calculate the next target date based on recurrence rule.
      // CRITICAL: Use the accumulated LOGICAL target, not the previously CREATED date.
      // This preserves the recurrence cadence even if a date must be skipped due to conflicts.
      // Example: Jan 9 (logical) + 7d = Jan 16 (logical, but blocked) → skip to Jan 17 (created)
      //          Jan 16 (logical) + 7d = Jan 23 (logical) → attempt Jan 23, not Jan 24
      const logicalTargetDate = getRecurrenceTargetDate(logicalBaseDate, newSeriesRecurrence);
      
      if (!logicalTargetDate) {
        throw new Error(`Cannot calculate next recurrence date for ${newSeriesRecurrence.option}`);
      }
      
      // Update logical base for next iteration (before we potentially skip due to conflicts)
      logicalBaseDate = formatDateOnly(logicalTargetDate);

      // Find an available date (avoiding conflicts with existing appointments)
      // Note: Old future appointments are now cancelled, so they won't block
      const generatedDate = findRecurringAppointmentDate({
        appointment: currentParent,
        allAppointments: appointmentsForConflict,
        targetDate: logicalTargetDate,
        doctorStaff,
      });

      if (!generatedDate) {
        throw new Error(`No available date found for new recurring series at step ${i + 1}`);
      }

      if (seenDates.has(generatedDate)) {
        throw new Error(`Duplicate appointment date generated: ${generatedDate}`);
      }
      seenDates.add(generatedDate);

      // Create the new appointment with the same core details as the current parent
      const generatedData = buildGeneratedAppointmentData({
        source: currentParent,
        generatedDate,
        recurrence: newSeriesRecurrence,
      });

      const newAppointment = toAppointment(
        await txAppointment.create({ data: generatedData as any })
      );

      // Link it to the new series
      await txRecurringOccurrence.create({
        data: {
          id: makeRecurringOccurrenceId(),
          seriesId: newSeriesId,
          appointmentId: newAppointment.id || "",
          parentAppointmentId: currentParent.id || null,
          sequence: i + 1,
          generatedForDate: generatedDate,
          status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
          createdAt: now,
          updatedAt: now,
        },
      });

      // Update the appointment's recurrence metadata
      const recurrenceData: AppointmentRecurrencePayload = {
        ...newSeriesRecurrence,
        enabled: true,
        generatedFromId: currentParent.id || null,
        generatedFromDate: currentParent.date || null,
        sourceAppointmentId: appointmentId,
        sourceAppointmentDate: splitStartDate,
      };

      await txAppointment.update({
        where: { id: newAppointment.id || "" },
        data: {
          recurringSeriesId: newSeriesId,
          isRecurring: true,
          recurrence: recurrenceData as any,
          updatedAt: now,
        } as any,
      });

      // Update the parent pointer to continue the chain
      currentParent = newAppointment;

      // Log the creation
      await createAppointmentLogInTransaction({
        tx,
        appointmentId: newAppointment.id || "",
        previousState: {
          status: "none",
          paymentStatus: "none",
          price: 0,
          balance: 0,
          totalPaid: 0,
        } as any,
        newState: newAppointment,
        changedBy,
        changedByName,
        notes: `Pre-generated for the new recurring series starting ${formatRecurringLogDate(splitStartDate)}.`,
      });

      newSeriesAppointments.push(newAppointment);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Update the new series endDate to reflect all spawned appointments
    // ─────────────────────────────────────────────────────────────────────────────
    const newSeriesEndDate = getRecurringSeriesEndDate(
      newSeriesAppointments.map((apt) => ({ appointment: apt }))
    );

    await txRecurringSeries.update({
      where: { id: newSeriesId },
      data: {
        endDate: newSeriesEndDate || splitStartDate,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        stoppedAt: null,
        updatedAt: now,
      },
    });

    // ─────────────────────────────────────────────────────────────────────────────
    // Log the split event at the series level
    // ─────────────────────────────────────────────────────────────────────────────
    console.log(`[SPLIT] Final status check before series-level log...`);
    const headBeforeSeriesLog = toAppointment(
      await txAppointment.findUnique({ where: { id: appointmentId } })
    );
    console.log(`[SPLIT] Head before series log:`, {
      id: headBeforeSeriesLog?.id,
      status: headBeforeSeriesLog?.status,
    });

    await createAppointmentLogInTransaction({
      tx,
      appointmentId,
      previousState: headAppointment,
      newState: updatedHead,
      changedBy,
      changedByName,
      notes: `Recurring series split: Old ${oldSeries.interval} series ended on ${formatRecurringLogDate(
        oldSeriesEndDateOneDayBefore
      )}. New ${newSeriesRecurrence.option} series starts on ${formatRecurringLogDate(splitStartDate)} with ${spawnCount} pre-generated future appointments.`,
    });

    console.log(`[SPLIT] Series log created. Fetching final head status...`);
    const headFinal = toAppointment(
      await txAppointment.findUnique({ where: { id: appointmentId } })
    );
    console.log(`[SPLIT] Head final status before return:`, {
      id: headFinal?.id,
      status: headFinal?.status,
      paymentStatus: headFinal?.paymentStatus,
    });

    return headFinal;
  });

  console.log(`[SPLIT] Transaction complete. Split result:`, {
    id: splitResult?.id,
    status: splitResult?.status,
  });
  console.log(`[SPLIT] ====== SPLIT COMPLETE ======`);
  return splitResult ? toAppointment(splitResult) : null;
};

const maybeOverwriteRecurringSeriesHead = async ({
  appointment,
  allAppointments,
  requestedRecurrence,
  recurrenceInputProvided,
  changedBy,
  changedByName,
  doctorStaff,
}: {
  appointment: Appointment;
  allAppointments: Appointment[];
  requestedRecurrence: AppointmentRecurrencePayload;
  recurrenceInputProvided: boolean;
  changedBy: string;
  changedByName?: string;
  doctorStaff: DoctorIdentity[];
}): Promise<Appointment | null> => {
  const appointmentId = normalizeId(appointment.id);
  const headDate = normalizeDateOnly(appointment.date);

  if (!appointmentId || !headDate || !requestedRecurrence.enabled || !recurrenceInputProvided) {
    return null;
  }

  const recurringOccurrence = (prisma as any).recurringOccurrence;
  const recurringSeries = (prisma as any).recurringSeries;
  const currentOccurrence = await recurringOccurrence.findFirst({
    where: {
      appointmentId,
      status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
    },
  });
  if (!currentOccurrence?.seriesId) return null;

  const series = await recurringSeries.findUnique({
    where: { id: currentOccurrence.seriesId },
  });
  if (!series) return null;

  // ═══════════════════════════════════════════════════════════════════════════════
  // GUARD: If recurrence is being disabled (DO NOT REPEAT selected), do NOT overwrite the series.
  // This prevents accidental cancellation when user just wants to edit the current appointment.
  // ═══════════════════════════════════════════════════════════════════════════════
  if (!requestedRecurrence.enabled) {
    return null;
  }

  const olderOccurrence = await recurringOccurrence.findFirst({
    where: {
      seriesId: series.id,
      appointmentId: { not: appointmentId },
      generatedForDate: { lt: headDate },
      status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
    },
  });
  if (olderOccurrence) return null;

  const seriesRootId = normalizeId(series.rootAppointmentId);
  const parentAppointmentId = normalizeId(currentOccurrence.parentAppointmentId);
  const isSeriesHead =
    Number(currentOccurrence.sequence || 0) === 0 ||
    !parentAppointmentId ||
    seriesRootId === appointmentId;
  if (!isSeriesHead) return null;

  const desiredRepeatCount = normalizeRepeatCount(requestedRecurrence.repeatCount);
  const now = new Date();

  const overwriteResult = await prisma.$transaction(async (tx) => {
    const txAppointment = (tx as any).appointment;
    const txRecurringSeries = (tx as any).recurringSeries;
    const txRecurringOccurrence = (tx as any).recurringOccurrence;

    const freshAppointment = toAppointment(
      await txAppointment.findUnique({ where: { id: appointmentId } })
    );
    if (!freshAppointment || isInactiveAppointment(freshAppointment)) {
      throw new Error("Cannot overwrite an inactive repeating appointment head.");
    }

    const freshCurrentOccurrence = await txRecurringOccurrence.findFirst({
      where: {
        appointmentId,
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
    });
    if (!freshCurrentOccurrence?.seriesId) {
      throw new Error("Cannot overwrite repeating appointment without an occurrence row.");
    }

    const freshSeries = await txRecurringSeries.findUnique({
      where: { id: freshCurrentOccurrence.seriesId },
    });
    if (!freshSeries) return null;

    const freshHeadDate = normalizeDateOnly(freshAppointment.date);
    const freshOlderOccurrence = await txRecurringOccurrence.findFirst({
      where: {
        seriesId: freshSeries.id,
        appointmentId: { not: appointmentId },
        generatedForDate: { lt: freshHeadDate },
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
    });
    if (freshOlderOccurrence) return null;

    const recurrenceForGeneration: AppointmentRecurrencePayload = {
      ...requestedRecurrence,
      enabled: true,
      option: normalizeRecurrenceOption(requestedRecurrence.option),
      customDate: requestedRecurrence.option === "Custom"
        ? normalizeDateOnly(requestedRecurrence.customDate) || null
        : null,
      repeatCount: desiredRepeatCount,
      recurringSeriesId: freshSeries.id,
      sourceAppointmentId: appointmentId,
      sourceAppointmentDate: freshAppointment.date,
    };

    await txRecurringSeries.update({
      where: { id: freshSeries.id },
      data: {
        rootAppointmentId: appointmentId,
        interval: recurrenceForGeneration.option,
        customDate: recurrenceForGeneration.customDate || null,
        startDate: freshAppointment.date || null,
        endDate: freshAppointment.date || null,
        status: RECURRENCE_SERIES_STATUS_ACTIVE,
        stoppedAt: null,
        updatedAt: now,
      },
    });

    const seriesOccurrences = await txRecurringOccurrence.findMany({
      where: {
        seriesId: freshSeries.id,
        status: { not: RECURRENCE_OCCURRENCE_STATUS_CANCELLED },
      },
      orderBy: [
        { sequence: "asc" },
        { generatedForDate: "asc" },
        { createdAt: "asc" },
      ],
    });
    const seriesAppointmentIds = Array.from(new Set<string>(
      seriesOccurrences
        .map((occurrence: any) => String(occurrence.appointmentId || ""))
        .filter(Boolean)
    ));
    const seriesAppointments: Appointment[] = ((await txAppointment.findMany({
      where: { id: { in: seriesAppointmentIds } },
    })) as unknown[]).map(toAppointment);
    const appointmentsById = new Map<string, Appointment>(
      seriesAppointments
        .filter((seriesAppointment: Appointment) => seriesAppointment.id)
        .map((seriesAppointment: Appointment) => [String(seriesAppointment.id), seriesAppointment])
    );
    const activeRows = getSortedActiveOccurrenceRows(seriesOccurrences, appointmentsById);
    const reusableRows = activeRows.filter((row) => row.appointment.id !== appointmentId);
    const reusableAppointmentIds = reusableRows
      .map((row) => String(row.appointment.id || ""))
      .filter(Boolean);
    const generatedAppointments: Appointment[] = [];
    let appointmentsForConflict = allAppointments.filter((candidate) => {
      const candidateId = String(candidate.id || "");
      return candidateId !== appointmentId && !reusableAppointmentIds.includes(candidateId);
    });
    let parentAppointment = freshAppointment;
    const seenInstanceDates = new Set<string>([freshAppointment.date]);

    for (let index = 0; index < desiredRepeatCount; index += 1) {
      const targetDate = getRecurrenceTargetDate(parentAppointment.date, {
        ...recurrenceForGeneration,
        generatedFromId: parentAppointment.id || null,
        generatedFromDate: parentAppointment.date || null,
        sourceAppointmentId: appointmentId,
        sourceAppointmentDate: freshAppointment.date,
      });
      if (!targetDate) {
        throw new Error("Cannot generate the next repeating appointment date.");
      }

      const reusableAppointment = reusableRows[index]?.appointment || null;
      const reusableAppointmentId = reusableAppointment?.id || null;
      const generatedDate = findRecurringAppointmentDate({
        appointment: parentAppointment,
        allAppointments: appointmentsForConflict,
        targetDate,
        existingGeneratedAppointmentId: reusableAppointmentId,
        doctorStaff,
      });
      if (!generatedDate) {
        throw new Error("No available date was found for the overwritten repeating series.");
      }
      if (seenInstanceDates.has(generatedDate)) {
        throw new Error("The overwritten repeating series generated a duplicate appointment date.");
      }
      seenInstanceDates.add(generatedDate);

      const generatedData = buildGeneratedAppointmentData({
        source: parentAppointment,
        generatedDate,
        recurrence: recurrenceForGeneration,
        generatedAppointmentId: reusableAppointmentId || undefined,
      });

      let generatedAppointment: Appointment;
      if (reusableAppointmentId && reusableAppointment) {
        const previousState: Appointment = { ...reusableAppointment };
        const generatedUpdateData = { ...generatedData } as any;
        delete generatedUpdateData.id;
        generatedAppointment = toAppointment(
          await txAppointment.update({
            where: { id: reusableAppointmentId },
            data: {
              ...generatedUpdateData,
              createdAt: reusableAppointment.createdAt || generatedData.createdAt,
              updatedAt: now,
            } as any,
          })
        );

        await createAppointmentLogInTransaction({
          tx,
          appointmentId: reusableAppointmentId,
          previousState,
          newState: generatedAppointment,
          changedBy,
          changedByName,
          changeType:
            previousState.date !== generatedAppointment.date || previousState.time !== generatedAppointment.time
              ? "rescheduled"
              : "update",
          notes: "Updated from repeating head changes.",
        });
      } else {
        generatedAppointment = toAppointment(
          await txAppointment.create({ data: generatedData as any })
        );

        await createAppointmentLogInTransaction({
          tx,
          appointmentId: generatedAppointment.id!,
          previousState: { status: "none", paymentStatus: "none", price: 0, balance: 0, totalPaid: 0 } as any,
          newState: generatedAppointment,
          changedBy,
          changedByName,
          notes: `Created from repeating schedule from ${formatRecurringLogDate(parentAppointment.date)}.`,
        });
      }

      generatedAppointments.push(generatedAppointment);
      appointmentsForConflict = [
        ...appointmentsForConflict.filter(
          (existingAppointment) => String(existingAppointment.id || "") !== String(generatedAppointment.id || "")
        ),
        generatedAppointment,
      ];
      parentAppointment = generatedAppointment;
    }

    const extraRows = reusableRows.slice(generatedAppointments.length);
    for (const row of extraRows) {
      const extraAppointment = row.appointment;
      if (!extraAppointment.id) continue;

      const previousState: Appointment = { ...extraAppointment };
      const extraRecurrence = normalizeAppointmentRecurrence((extraAppointment as any).recurrence);
      const nextState: Appointment = {
        ...extraAppointment,
        status: "cancelled",
        deleted: Boolean(extraAppointment.deleted),
        deletedAt: extraAppointment.deletedAt,
        updatedAt: now,
        isRecurring: false,
        recurrence: {
          ...(extraRecurrence || {}),
          enabled: false,
          generatedAppointmentId: null,
          generatedAppointmentDate: null,
          cancelledByHeadOverwriteId: appointmentId,
          cancelledAt: now.toISOString(),
        } as any,
      };

      await txAppointment.update({
        where: { id: extraAppointment.id },
        data: {
          status: nextState.status,
          deleted: nextState.deleted,
          deletedAt: nextState.deletedAt,
          updatedAt: now,
          isRecurring: false,
          recurrence: (nextState as any).recurrence,
        } as any,
      });

      await txRecurringOccurrence.update({
        where: { appointmentId: extraAppointment.id },
        data: {
          status: RECURRENCE_OCCURRENCE_STATUS_CANCELLED,
          updatedAt: now,
        },
      });

      await createAppointmentLogInTransaction({
        tx,
        appointmentId: extraAppointment.id,
        previousState,
        newState: nextState,
        changedBy,
        changedByName,
        changeType: "status_change",
        notes: `Cancelled because the repeating head was changed on ${formatRecurringLogDate(freshAppointment.date)}.`,
      });
    }

    const sequenceAppointments = [freshAppointment, ...generatedAppointments];
    let savedHead = freshAppointment;
    for (let index = 0; index < sequenceAppointments.length; index += 1) {
      const current = sequenceAppointments[index];
      if (!current.id) continue;

      const previous = index === 0 ? null : sequenceAppointments[index - 1];
      const next = sequenceAppointments[index + 1] || null;
      const existingRecurrence = normalizeAppointmentRecurrence((current as any).recurrence);
      const recurrenceToSave: AppointmentRecurrencePayload = {
        ...(existingRecurrence || {}),
        ...recurrenceForGeneration,
        enabled: Boolean(next),
        repeatCount: normalizeRepeatCount(Math.max(1, sequenceAppointments.length - index - 1)),
        generatedFromId: previous?.id || null,
        generatedFromDate: previous?.date || null,
        sourceAppointmentId: previous?.id || current.id || null,
        sourceAppointmentDate: previous?.date || current.date || null,
        ...getImmutableCreatedFromMetadata(existingRecurrence, current, previous || undefined),
        generatedAppointmentId: next?.id || null,
        generatedAppointmentDate: next?.date || null,
        overwrittenFromHeadId: appointmentId,
        overwrittenAt: now.toISOString(),
        lastGeneratedAt: now.toISOString(),
      };

      const savedCurrent = toAppointment(
        await txAppointment.update({
          where: { id: current.id },
          data: {
            recurrence: recurrenceToSave as any,
            isRecurring: Boolean(next),
            recurringSeriesId: freshSeries.id,
            updatedAt: now,
          } as any,
        })
      );

      await txRecurringOccurrence.upsert({
        where: { appointmentId: current.id },
        update: {
          seriesId: freshSeries.id,
          parentAppointmentId: previous?.id || null,
          sequence: index,
          generatedForDate: current.date,
          status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
          updatedAt: now,
        },
        create: {
          id: makeRecurringOccurrenceId(),
          seriesId: freshSeries.id,
          appointmentId: current.id,
          parentAppointmentId: previous?.id || null,
          sequence: index,
          generatedForDate: current.date,
          status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
          createdAt: now,
          updatedAt: now,
        },
      });

      if (index === 0) savedHead = savedCurrent;
    }

    const sequenceEndDate = getRecurringSeriesEndDate(
      sequenceAppointments.map((appointment) => ({ appointment }))
    ) || freshAppointment.date || null;
    await txRecurringSeries.update({
      where: { id: freshSeries.id },
      data: {
        endDate: sequenceEndDate,
        status:
          sequenceAppointments.length > 1
            ? RECURRENCE_SERIES_STATUS_ACTIVE
            : RECURRENCE_SERIES_STATUS_STOPPED,
        stoppedAt: sequenceAppointments.length > 1 ? null : now,
        updatedAt: now,
      },
    });

    await createAppointmentLogInTransaction({
      tx,
      appointmentId,
      previousState: freshAppointment,
      newState: savedHead,
      changedBy,
      changedByName,
      notes: `Repeating head overwritten. New ${recurrenceForGeneration.option} rule starts on ${formatRecurringLogDate(freshAppointment.date)}.`,
    });

    return savedHead;
  });

  return overwriteResult ? toAppointment(overwriteResult) : null;
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
    deleted: Boolean(existing.deleted),
    deletedAt: existing.deletedAt,
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
        deleted: Boolean(existing.deleted),
        deletedAt: existing.deletedAt || null,
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
    `Recurring appointment cancelled because recurrence was disabled on ${formatRecurringLogDate(rootAppointment.date)}.`
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
    const splitAppointment = await maybeSplitRecurringSeriesAtAppointment({
      appointment,
      allAppointments,
      requestedRecurrence,
      recurrenceInputProvided,
      changedBy,
      changedByName,
      doctorStaff,
    });
    if (splitAppointment) return splitAppointment;

    const overwrittenHeadAppointment = await maybeOverwriteRecurringSeriesHead({
      appointment,
      allAppointments,
      requestedRecurrence,
      recurrenceInputProvided,
      changedBy,
      changedByName,
      doctorStaff,
    });
    if (overwrittenHeadAppointment) return overwrittenHeadAppointment;
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
    // ════════════════════════════════════════════════════════════════════════════════
    // GUARD: If user explicitly selected DO NOT REPEAT (recurrenceInputProvided === true)
    // without specifying explicit deletions, just update the appointment recurrence to
    // disabled WITHOUT cascading cancellations. This preserves the series for mid-series edits.
    // ════════════════════════════════════════════════════════════════════════════════
    if (
      recurrenceInputProvided &&
      !requestedDeletionIds &&
      !requestedRecurrence.generatedAppointmentId
    ) {
      console.log(`[RECURRENCE] DO NOT REPEAT selected: updating appointment ${appointment.id} to disabled recurrence without cancellations`);
      return writeAppointmentRecurrence(appointment, {
        ...requestedRecurrence,
        enabled: false,
        generatedAppointmentId: null,
        generatedAppointmentDate: null,
        cancelledAt: new Date().toISOString(),
      });
    }

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

  const sourceRecurringSeriesId = await syncRecurringTablesForAppointment(
    appointment,
    { ...requestedRecurrence, repeatCount: normalizeRepeatCount(requestedRecurrence.repeatCount) }
  );
  const desiredRepeatCount = normalizeRepeatCount(requestedRecurrence.repeatCount);
  const recurrenceForGeneration = sourceRecurringSeriesId
    ? {
        ...requestedRecurrence,
        repeatCount: desiredRepeatCount,
        recurringSeriesId: sourceRecurringSeriesId,
        sourceAppointmentId: appointment.id || null,
        sourceAppointmentDate: appointment.date || null,
      }
    : {
        ...requestedRecurrence,
        repeatCount: desiredRepeatCount,
        sourceAppointmentId: appointment.id || null,
        sourceAppointmentDate: appointment.date || null,
      };

  const existingGeneratedChain = (await getRecurringGeneratedAppointments(appointment.id))
    .filter((generatedAppointment) => !isInactiveAppointment(generatedAppointment));
  const existingGeneratedChainIds = new Set(
    existingGeneratedChain
      .map((generatedAppointment) => String(generatedAppointment.id || ""))
      .filter(Boolean)
  );
  const generatedAppointments: Appointment[] = [];
  let appointmentsForConflict = allAppointments.filter(
    (candidate) => !existingGeneratedChainIds.has(String(candidate.id || ""))
  );
  let parentAppointment = appointment;

  for (let index = 0; index < desiredRepeatCount; index += 1) {
    const targetDate = getRecurrenceTargetDate(parentAppointment.date, {
      ...recurrenceForGeneration,
      generatedFromId: parentAppointment.id || null,
      generatedFromDate: parentAppointment.date || null,
      sourceAppointmentId: appointment.id || null,
      sourceAppointmentDate: appointment.date || null,
    });
    if (!targetDate) break;

    const existingGeneratedAppointment = existingGeneratedChain[index] || null;
    const existingGeneratedAppointmentId =
      existingGeneratedAppointment && !existingGeneratedAppointment.deleted
        ? existingGeneratedAppointment.id
        : null;

    const generatedDate = findRecurringAppointmentDate({
      appointment: parentAppointment,
      allAppointments: appointmentsForConflict,
      targetDate,
      existingGeneratedAppointmentId,
      doctorStaff,
    });

    if (!generatedDate) break;

    let generatedAppointment: Appointment;
    const generatedData = buildGeneratedAppointmentData({
      source: parentAppointment,
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
          parentAppointment
        );
        generatedUpdateData.recurrence = {
          ...existingGeneratedRecurrence,
          recurringSeriesId:
            sourceRecurringSeriesId ||
            existingGeneratedRecurrence.recurringSeriesId ||
            (existingGeneratedAppointment as any).recurringSeriesId ||
            null,
          generatedFromId: parentAppointment.id,
          generatedFromDate: parentAppointment.date,
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
        "Updated from repeating appointment changes."
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
        `Created from repeating schedule from ${formatRecurringLogDate(parentAppointment.date)}.`
      );
    }

    generatedAppointment = await syncGeneratedRecurringTables({
      source: parentAppointment,
      generatedAppointment,
      recurrence: recurrenceForGeneration,
      seriesId: sourceRecurringSeriesId,
    });

    generatedAppointments.push(generatedAppointment);
    appointmentsForConflict = [
      ...appointmentsForConflict.filter(
        (existingAppointment) => String(existingAppointment.id || "") !== String(generatedAppointment.id || "")
      ),
      generatedAppointment,
    ];
    parentAppointment = generatedAppointment;
  }

  if (!generatedAppointments.length) return appointment;

  const extraGeneratedAppointmentIds = existingGeneratedChain
    .slice(generatedAppointments.length)
    .map((generatedAppointment) => String(generatedAppointment.id || ""))
    .filter(Boolean);
  if (extraGeneratedAppointmentIds.length) {
    await cancelRecurringSeriesAppointments({
      appointment,
      cancelAppointmentIds: extraGeneratedAppointmentIds,
      changedBy,
      changedByName,
      includeCurrentAppointment: false,
    });
  }

  for (let index = 0; index < generatedAppointments.length; index += 1) {
    const current = generatedAppointments[index];
    if (!current.id) continue;
    const previous = index === 0 ? appointment : generatedAppointments[index - 1];
    const next = generatedAppointments[index + 1] || null;
    const existingGeneratedRecurrence = normalizeAppointmentRecurrence((current as any).recurrence);
    const createdFromMetadata = getImmutableCreatedFromMetadata(
      existingGeneratedRecurrence,
      current,
      previous
    );
    const generatedRecurrence: AppointmentRecurrencePayload = {
      ...(existingGeneratedRecurrence || {}),
      enabled: Boolean(next),
      option: recurrenceForGeneration.option,
      customDate: recurrenceForGeneration.customDate || null,
      repeatCount: normalizeRepeatCount(Math.max(1, desiredRepeatCount - index - 1)),
      recurringSeriesId: sourceRecurringSeriesId || null,
      generatedFromId: previous?.id || null,
      generatedFromDate: previous?.date || null,
      sourceAppointmentId: previous?.id || current.id || null,
      sourceAppointmentDate: previous?.date || current.date || null,
      ...createdFromMetadata,
      generatedAppointmentId: next?.id || null,
      generatedAppointmentDate: next?.date || null,
      lastGeneratedAt: new Date().toISOString(),
    };

    await prisma.appointment.update({
      where: { id: current.id },
      data: {
        recurrence: generatedRecurrence as any,
        isRecurring: Boolean(next),
        recurringSeriesId: sourceRecurringSeriesId || null,
        updatedAt: new Date(),
      } as any,
    });

    if (sourceRecurringSeriesId) {
      await syncRecurringOccurrenceRecord({
        appointment: {
          ...current,
          recurrence: generatedRecurrence,
          recurringSeriesId: sourceRecurringSeriesId,
        } as Appointment,
        recurrence: generatedRecurrence,
        seriesId: sourceRecurringSeriesId,
        status: RECURRENCE_OCCURRENCE_STATUS_ACTIVE,
      });
    }
  }

  const sourceRecurrence: AppointmentRecurrencePayload = {
    ...recurrenceForGeneration,
    enabled: true,
    sourceAppointmentId: appointment.id,
    sourceAppointmentDate: appointment.date,
    repeatCount: desiredRepeatCount,
    generatedAppointmentId: generatedAppointments[0]?.id || null,
    generatedAppointmentDate: generatedAppointments[0]?.date || null,
    lastGeneratedAt: new Date().toISOString(),
  };

  if (sourceRecurringSeriesId) {
    const sequenceAppointments = [appointment, ...generatedAppointments];
    const seriesEndDate = getRecurringSeriesEndDate(
      sequenceAppointments.map((sequenceAppointment) => ({ appointment: sequenceAppointment }))
    ) || appointment.date || null;
    await (prisma as any).recurringSeries.update({
      where: { id: sourceRecurringSeriesId },
      data: {
        endDate: seriesEndDate,
        status:
          sequenceAppointments.length > 1
            ? RECURRENCE_SERIES_STATUS_ACTIVE
            : RECURRENCE_SERIES_STATUS_STOPPED,
        stoppedAt: sequenceAppointments.length > 1 ? null : new Date(),
        updatedAt: new Date(),
      },
    });
  }

  return writeAppointmentRecurrence(appointment, sourceRecurrence);
};
