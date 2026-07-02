import { CART_APPOINTMENT_STATUS, normalizeStatus } from "../constants/appointmentStatuses";

export type StatusColorClasses = {
  bgColor: string;
  textColor: string;
};

export const DEFAULT_UNKNOWN_STATUS_COLORS: StatusColorClasses = {
  bgColor: "bg-gray-100",
  textColor: "text-gray-700",
};

export const DEFAULT_APPOINTMENT_STATUS_COLORS: Record<string, StatusColorClasses> = {
  scheduled: { bgColor: "bg-emerald-100", textColor: "text-emerald-700" },
  [CART_APPOINTMENT_STATUS]: { bgColor: "bg-orange-100", textColor: "text-orange-700" },
  reserved: { bgColor: "bg-amber-100", textColor: "text-amber-700" },
  cancelled: { bgColor: "bg-red-100", textColor: "text-red-700" },
  deleted: { bgColor: "bg-slate-200", textColor: "text-slate-700" },
  completed: { bgColor: "bg-blue-100", textColor: "text-blue-700" },
  tbd: { bgColor: "bg-violet-100", textColor: "text-violet-700" },
  "to-pay": { bgColor: "bg-cyan-100", textColor: "text-cyan-700" },
};

const PAYMENT_STATUS_ALIASES: Record<string, string> = {
  "fully-paid": "paid",
  "full-paid": "paid",
  "paid-in-full": "paid",
  halfpaid: "half-paid",
  "half_paid": "half-paid",
  partial: "half-paid",
  "partial-paid": "half-paid",
  "partially-paid": "half-paid",
  payatclinic: "pay-at-clinic",
  "pay at clinic": "pay-at-clinic",
  "pay-at-clinic": "pay-at-clinic",
  overpaid: "over-paid",
  "over paid": "over-paid",
};

export const DEFAULT_PAYMENT_STATUS_COLORS: Record<string, StatusColorClasses> = {
  paid: { bgColor: "bg-emerald-100", textColor: "text-emerald-700" },
  unpaid: { bgColor: "bg-slate-100", textColor: "text-slate-700" },
  "half-paid": { bgColor: "bg-amber-100", textColor: "text-amber-700" },
  overdue: { bgColor: "bg-red-100", textColor: "text-red-700" },
  "pay-at-clinic": { bgColor: "bg-sky-100", textColor: "text-sky-700" },
  "over-paid": { bgColor: "bg-teal-100", textColor: "text-teal-700" },
};

export const normalizePaymentStatus = (status?: string | null): string => {
  const normalized = String(status || "").toLowerCase().trim();
  if (!normalized) return "";

  return PAYMENT_STATUS_ALIASES[normalized] || normalized;
};

export const hasDefaultAppointmentStatusColors = (status?: string | null): boolean => {
  const normalized = status ? normalizeStatus(status) : "";
  return Boolean(normalized && DEFAULT_APPOINTMENT_STATUS_COLORS[normalized]);
};

export const getDefaultAppointmentStatusColors = (status?: string | null): StatusColorClasses => {
  const normalized = status ? normalizeStatus(status) : "";
  return DEFAULT_APPOINTMENT_STATUS_COLORS[normalized] || DEFAULT_UNKNOWN_STATUS_COLORS;
};

export const getDefaultAppointmentBgColor = (status: string): string =>
  getDefaultAppointmentStatusColors(status).bgColor;

export const getDefaultAppointmentTextColor = (status: string): string =>
  getDefaultAppointmentStatusColors(status).textColor;

export const hasDefaultPaymentStatusColors = (status?: string | null): boolean => {
  const normalized = normalizePaymentStatus(status);
  return Boolean(normalized && DEFAULT_PAYMENT_STATUS_COLORS[normalized]);
};

export const getDefaultPaymentStatusColors = (status?: string | null): StatusColorClasses => {
  const normalized = normalizePaymentStatus(status);
  return DEFAULT_PAYMENT_STATUS_COLORS[normalized] || DEFAULT_UNKNOWN_STATUS_COLORS;
};

export const getDefaultPaymentBgColor = (status: string): string =>
  getDefaultPaymentStatusColors(status).bgColor;

export const getDefaultPaymentTextColor = (status: string): string =>
  getDefaultPaymentStatusColors(status).textColor;

type StatusOptionWithColors = {
  value: string;
  bgColor?: string;
  textColor?: string;
};

export const applyDefaultAppointmentStatusColors = <T extends StatusOptionWithColors>(status: T): T & StatusColorClasses => {
  const defaultColors = getDefaultAppointmentStatusColors(status.value);
  const shouldUseDefault = hasDefaultAppointmentStatusColors(status.value);

  return {
    ...status,
    bgColor: shouldUseDefault ? defaultColors.bgColor : status.bgColor || defaultColors.bgColor,
    textColor: shouldUseDefault ? defaultColors.textColor : status.textColor || defaultColors.textColor,
  };
};

export const applyDefaultPaymentStatusColors = <T extends StatusOptionWithColors>(status: T): T & StatusColorClasses => {
  const defaultColors = getDefaultPaymentStatusColors(status.value);
  const shouldUseDefault = hasDefaultPaymentStatusColors(status.value);

  return {
    ...status,
    bgColor: shouldUseDefault ? defaultColors.bgColor : status.bgColor || defaultColors.bgColor,
    textColor: shouldUseDefault ? defaultColors.textColor : status.textColor || defaultColors.textColor,
  };
};
