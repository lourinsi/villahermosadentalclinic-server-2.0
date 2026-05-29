import { Request, Response } from "express";
import {
  FinanceRecord,
  ApiResponse,
  Revenue,
  ExpenseBreakdown,
  DetailedExpense,
  RecurringExpense,
  Payroll,
  RecentTransaction,
} from "../types/finance";
import { prisma } from "../lib/prisma";
import { getAppointmentTypeName } from "../utils/appointment-types";

const toFinanceRecord = (record: unknown): FinanceRecord => record as FinanceRecord;
const toDetailedExpense = (expense: unknown): DetailedExpense => expense as DetailedExpense;
type IdParams = { id: string };
const EXPENSE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

const toFiniteNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizeDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const dateKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const monthKey = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
};

const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
};

const recentMonthKeys = (count = 6) => {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return monthKey(date);
  });
};

const getRecordDate = (record: { date?: string | null; createdAt?: Date | null; updatedAt?: Date | null }) =>
  normalizeDate(record.date) || normalizeDate(record.createdAt) || normalizeDate(record.updatedAt);

const isIncomeType = (type: unknown) => {
  const normalized = String(type || "").toLowerCase();
  return ["payment", "income", "revenue"].includes(normalized);
};

const isChargeType = (type: unknown) => {
  const normalized = String(type || "").toLowerCase();
  return ["charge", "invoice", "service"].includes(normalized);
};

const isExpenseType = (type: unknown) => {
  const normalized = String(type || "").toLowerCase();
  return ["expense", "refund", "payroll"].includes(normalized);
};

const normalizeMethod = (method?: string | null) => {
  const value = String(method || "").trim();
  return value || "Clinic record";
};

const nextMonthlyDueDate = (dateValue: string) => {
  const date = normalizeDate(dateValue) || new Date();
  return dateKey(new Date(date.getFullYear(), date.getMonth() + 1, date.getDate()));
};

const isCurrentMonth = (dateValue?: string | null) => {
  const date = normalizeDate(dateValue);
  return date ? monthKey(date) === monthKey(new Date()) : false;
};

const extractPaymentId = (description?: string | null) => {
  const match = String(description || "").match(/\bPayment\s+(pay_[A-Za-z0-9_-]+)/i);
  return match?.[1] || null;
};

const extractAppointmentId = (description?: string | null) => {
  const text = String(description || "");
  const appointmentMatch = text.match(/\bappointment\s+([A-Za-z0-9_-]+)/i);
  if (appointmentMatch?.[1]) return appointmentMatch[1];

  const idMatch = text.match(/\bapt_[A-Za-z0-9_-]+/i);
  return idMatch?.[0] || null;
};

const extractAppointmentIdFromSnapshot = (snapshot: any) =>
  snapshot?.id || snapshot?.appointmentId || snapshot?._id || null;

const normalizeLookupText = (value?: string | null) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const extractServiceNameFromDescription = (description?: string | null) => {
  const text = String(description || "").trim();
  const paymentMatch = text.match(/^payment\s+for\s+(.+)$/i);
  if (paymentMatch?.[1]) return paymentMatch[1].trim();

  const chargeMatch = text.match(/^(.+?)\s+charge$/i);
  if (chargeMatch?.[1]) return chargeMatch[1].trim();

  return null;
};

const getAppointmentServiceName = (appointment: any) =>
  appointment?.customType ||
  appointment?.serviceType ||
  getAppointmentTypeName(Number(appointment?.type), appointment?.customType);

const findAppointmentForFinanceRecord = (
  record: {
    patientId?: string | null;
    date?: string | null;
    description?: string | null;
    amount?: number | null;
  },
  appointments: any[]
) => {
  const serviceName = extractServiceNameFromDescription(record.description);
  if (!serviceName || !record.date) return null;

  const normalizedServiceName = normalizeLookupText(serviceName);
  const matches = appointments.filter((appointment) => {
    if (!appointment || appointment.deleted) return false;
    if (record.patientId && appointment.patientId !== record.patientId) return false;
    if (appointment.date !== record.date) return false;

    return normalizeLookupText(getAppointmentServiceName(appointment)) === normalizedServiceName;
  });

  if (matches.length === 1) return matches[0];

  const amount = toFiniteNumber(record.amount);
  if (amount <= 0) return null;

  const amountMatches = matches.filter((appointment) => {
    const price = toFiniteNumber(appointment.price) - toFiniteNumber(appointment.discount);
    const totalPaid = toFiniteNumber(appointment.totalPaid);

    return amount === price || amount === totalPaid;
  });

  return amountMatches.length === 1 ? amountMatches[0] : null;
};

const getTransactionTime = (transaction: { logDate?: string; date?: string }) =>
  normalizeDate(transaction.logDate || transaction.date)?.getTime() || 0;

const isSamePaymentEvent = (
  a: { appointmentId?: string; amount?: number; logDate?: string; date?: string },
  b: { appointmentId?: string; amount?: number; logDate?: string; date?: string }
) => {
  if (!a.appointmentId || !b.appointmentId || a.appointmentId !== b.appointmentId) return false;
  if (Math.abs(toFiniteNumber(a.amount) - toFiniteNumber(b.amount)) > 0.01) return false;

  const aTime = getTransactionTime(a);
  const bTime = getTransactionTime(b);
  if (!aTime || !bTime) return false;

  return Math.abs(aTime - bTime) <= 10000;
};

const toIsoDate = (value: unknown) => {
  const date = normalizeDate(value);
  return date ? date.toISOString() : undefined;
};

export const createFinanceRecord = async (
  req: Request,
  res: Response<ApiResponse<FinanceRecord>>
) => {
  try {
    const financeData: FinanceRecord = req.body;

    if (!financeData.type || !financeData.amount || !financeData.date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: type, amount, date",
      });
    }

    const newRecord = toFinanceRecord(
      await prisma.financeRecord.create({
        data: {
          id: `fin_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          patientId: financeData.patientId || null,
          type: financeData.type,
          amount: Number(financeData.amount),
          date: financeData.date,
          description: financeData.description || "",
          createdAt: new Date(),
          updatedAt: new Date(),
          deleted: false,
        },
      })
    );

    res.status(201).json({
      success: true,
      message: "Finance record added successfully",
      data: newRecord,
    });
  } catch (error) {
    console.error("[FINANCE CREATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding finance record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const createDetailedExpense = async (
  req: Request,
  res: Response<ApiResponse<DetailedExpense>>
) => {
  try {
    const expenseData: DetailedExpense = req.body;

    if (!expenseData.category || !expenseData.description || !expenseData.amount || !expenseData.date) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: category, description, amount, date",
      });
    }

    const newExpense = toDetailedExpense(
      await prisma.detailedExpense.create({
        data: {
          id: `exp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          date: expenseData.date,
          category: expenseData.category,
          description: expenseData.description,
          amount: Number(expenseData.amount),
          vendor: expenseData.vendor || "",
          paymentMethod: expenseData.paymentMethod || "",
          status: expenseData.status || "pending",
          recurring: Boolean(expenseData.recurring),
        },
      })
    );

    res.status(201).json({
      success: true,
      message: "Detailed expense added successfully",
      data: newExpense,
    });
  } catch (error) {
    console.error("[FINANCE CREATE_DETAILED_EXPENSE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding detailed expense",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllFinanceRecords = async (
  req: Request,
  res: Response<ApiResponse<FinanceRecord[]>>
) => {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);

    const [total, items] = await Promise.all([
      prisma.financeRecord.count({ where: { deleted: false } }),
      prisma.financeRecord.findMany({
        where: { deleted: false },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      success: true,
      message: "Finance records retrieved successfully",
      data: items as unknown as FinanceRecord[],
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.max(1, Math.ceil(total / limitNum)) },
    });
  } catch (error) {
    console.error("[FINANCE GET_ALL] Error fetching finance records:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching finance records",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getFinanceRecordById = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<FinanceRecord | null>>
) => {
  try {
    const record = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!record || record.deleted) {
      return res.status(404).json({ success: false, message: "Finance record not found" });
    }

    res.json({
      success: true,
      message: "Finance record retrieved successfully",
      data: toFinanceRecord(record),
    });
  } catch (error) {
    console.error("[FINANCE GET_BY_ID] Error fetching finance record:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching finance record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateFinanceRecord = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<FinanceRecord | null>>
) => {
  try {
    const record = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!record || record.deleted) {
      return res.status(404).json({ success: false, message: "Finance record not found" });
    }

    const updates = req.body;
    const updatedRecord = toFinanceRecord(
      await prisma.financeRecord.update({
        where: { id: req.params.id },
        data: {
          ...(updates.patientId !== undefined && { patientId: updates.patientId }),
          ...(updates.type !== undefined && { type: updates.type }),
          ...(updates.amount !== undefined && { amount: Number(updates.amount) }),
          ...(updates.date !== undefined && { date: updates.date }),
          ...(updates.description !== undefined && { description: updates.description }),
          updatedAt: new Date(),
        },
      })
    );

    res.json({
      success: true,
      message: "Finance record updated successfully",
      data: updatedRecord,
    });
  } catch (error) {
    console.error("[FINANCE UPDATE] Error updating finance record:", error);
    res.status(500).json({
      success: false,
      message: "Error updating finance record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteFinanceRecord = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<null>>
) => {
  try {
    const record = await prisma.financeRecord.findUnique({ where: { id: req.params.id } });
    if (!record || record.deleted) {
      return res.status(404).json({ success: false, message: "Finance record not found" });
    }

    await prisma.financeRecord.update({
      where: { id: req.params.id },
      data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() },
    });

    res.json({ success: true, message: "Finance record soft-deleted successfully" });
  } catch (error) {
    console.error("[FINANCE DELETE] Error deleting finance record:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting finance record",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getRevenue = async (req: Request, res: Response<ApiResponse<Revenue[]>>) => {
  try {
    const [financeRecords, detailedExpenses, activeStaff] = await Promise.all([
      prisma.financeRecord.findMany({ where: { deleted: false } }),
      prisma.detailedExpense.findMany(),
      prisma.staff.findMany({ where: { deleted: false } }),
    ]);

    const keys = recentMonthKeys(6);
    const totals = new Map(
      keys.map((key) => [key, { month: monthLabel(key), revenue: 0, expenses: 0, profit: 0 }])
    );

    let hasIncomeRecords = false;
    for (const record of financeRecords) {
      const date = getRecordDate(record);
      if (!date) continue;

      const key = monthKey(date);
      const total = totals.get(key);
      if (!total) continue;

      const amount = toFiniteNumber(record.amount);
      if (isIncomeType(record.type)) {
        hasIncomeRecords = true;
        total.revenue += amount;
      } else if (isExpenseType(record.type)) {
        total.expenses += amount;
      }
    }

    if (!hasIncomeRecords) {
      for (const record of financeRecords) {
        const date = getRecordDate(record);
        if (!date || !isChargeType(record.type)) continue;

        const total = totals.get(monthKey(date));
        if (total) total.revenue += toFiniteNumber(record.amount);
      }
    }

    for (const expense of detailedExpenses) {
      const date = normalizeDate(expense.date);
      if (!date) continue;

      const total = totals.get(monthKey(date));
      if (total) total.expenses += toFiniteNumber(expense.amount);
    }

    for (const staff of activeStaff) {
      const baseSalary = toFiniteNumber(staff.baseSalary);
      if (baseSalary <= 0) continue;

      const hireDate = normalizeDate(staff.hireDate);
      const hireMonth = hireDate ? monthKey(hireDate) : null;

      for (const key of keys) {
        if (hireMonth && key < hireMonth) continue;
        const total = totals.get(key);
        if (total) total.expenses += baseSalary;
      }
    }

    const data = keys.map((key) => {
      const total = totals.get(key)!;
      return {
        ...total,
        revenue: Math.round(total.revenue),
        expenses: Math.round(total.expenses),
        profit: Math.round(total.revenue - total.expenses),
      };
    });

    res.json({ success: true, message: "Revenue data retrieved successfully", data });
  } catch (error) {
    console.error("[FINANCE REVENUE] Error fetching revenue data:", error);
    res.status(500).json({ success: false, message: "Error fetching revenue data", error: error instanceof Error ? error.message : "Unknown error" });
  }
};

export const getExpenseBreakdown = async (
  req: Request,
  res: Response<ApiResponse<ExpenseBreakdown[]>>
) => {
  try {
    const [detailedExpenses, activeStaff] = await Promise.all([
      prisma.detailedExpense.findMany(),
      prisma.staff.findMany({ where: { deleted: false } }),
    ]);

    const categoryTotals = new Map<string, number>();

    for (const expense of detailedExpenses) {
      const category = String(expense.category || "Other").trim() || "Other";
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + toFiniteNumber(expense.amount));
    }

    const payrollTotal = activeStaff.reduce(
      (sum, staff) => sum + toFiniteNumber(staff.baseSalary),
      0
    );
    if (payrollTotal > 0) {
      categoryTotals.set("Payroll", (categoryTotals.get("Payroll") || 0) + payrollTotal);
    }

    const totalExpenses = Array.from(categoryTotals.values()).reduce((sum, amount) => sum + amount, 0);
    const data = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount], index) => ({
        category,
        amount: Math.round(amount),
        percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        color: EXPENSE_COLORS[index % EXPENSE_COLORS.length],
      }));

    res.json({ success: true, message: "Expense breakdown retrieved successfully", data });
  } catch (error) {
    console.error("[FINANCE EXPENSE_BREAKDOWN] Error fetching expense breakdown:", error);
    res.status(500).json({ success: false, message: "Error fetching expense breakdown", error: error instanceof Error ? error.message : "Unknown error" });
  }
};

export const getDetailedExpenses = async (
  req: Request,
  res: Response<ApiResponse<DetailedExpense[]>>
) => {
  try {
    const detailedExpenses = await prisma.detailedExpense.findMany({
      orderBy: { date: "desc" },
    });
    const data = detailedExpenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: toFiniteNumber(expense.amount),
      vendor: expense.vendor || "",
      paymentMethod: expense.paymentMethod || "",
      status: expense.status || "pending",
      recurring: Boolean(expense.recurring),
    }));
    res.json({
      success: true,
      message: "Detailed expenses retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("[FINANCE DETAILED_EXPENSES] Error fetching detailed expenses:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching detailed expenses",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getRecurringExpenses = async (
  req: Request,
  res: Response<ApiResponse<RecurringExpense[]>>
) => {
  try {
    const recurringExpenses = await prisma.detailedExpense.findMany({
      where: { recurring: true },
      orderBy: { date: "asc" },
    });

    const data = recurringExpenses.map((expense) => ({
      category: expense.category || "Other",
      description: expense.description,
      amount: toFiniteNumber(expense.amount),
      frequency: "Monthly",
      nextDue: nextMonthlyDueDate(expense.date),
    }));

    res.json({ success: true, message: "Recurring expenses retrieved successfully", data });
  } catch (error) {
    console.error("[FINANCE RECURRING_EXPENSES] Error fetching recurring expenses:", error);
    res.status(500).json({ success: false, message: "Error fetching recurring expenses", error: error instanceof Error ? error.message : "Unknown error" });
  }
};

export const getPayroll = async (req: Request, res: Response<ApiResponse<Payroll[]>>) => {
  try {
    const [activeStaff, staffFinancialRecords] = await Promise.all([
      prisma.staff.findMany({ where: { deleted: false }, orderBy: { name: "asc" } }),
      prisma.staffFinancialRecord.findMany(),
    ]);

    const data = activeStaff.map((staff) => {
      const currentMonthRecords = staffFinancialRecords.filter(
        (record) => record.staffId === staff.id && isCurrentMonth(record.date)
      );
      const bonus = currentMonthRecords
        .filter((record) => {
          const type = String(record.type || "").toLowerCase();
          return type.includes("bonus") || type.includes("commission") || type.includes("overtime");
        })
        .reduce((sum, record) => sum + toFiniteNumber(record.amount), 0);
      const baseSalary = toFiniteNumber(staff.baseSalary);
      const hasPendingRecord = currentMonthRecords.some((record) => record.status !== "paid");

      return {
        id: staff.id,
        name: staff.name,
        role: staff.role,
        baseSalary,
        bonus,
        total: baseSalary + bonus,
        status: hasPendingRecord || baseSalary > 0 ? "pending" : "paid",
      };
    });

    res.json({ success: true, message: "Payroll data retrieved successfully", data });
  } catch (error) {
    console.error("[FINANCE PAYROLL] Error fetching payroll data:", error);
    res.status(500).json({ success: false, message: "Error fetching payroll data", error: error instanceof Error ? error.message : "Unknown error" });
  }
};

export const getRecentTransactions = async (
  req: Request,
  res: Response<ApiResponse<RecentTransaction[]>>
) => {
  try {
    const [financeRecords, detailedExpenses, payments, appointmentPaymentLogs] = await Promise.all([
      prisma.financeRecord.findMany({ where: { deleted: false }, orderBy: { date: "desc" } }),
      prisma.detailedExpense.findMany({ orderBy: { date: "desc" } }),
      prisma.payment.findMany({ where: { deleted: false }, orderBy: { date: "desc" } }),
      prisma.appointmentLog.findMany({
        where: {
          OR: [
            { changeType: "payment" },
            { amount: { gt: 0 } },
          ],
        },
        orderBy: { changedAt: "desc" },
      }),
    ]);

    const paymentIds = new Set(payments.map((payment) => payment.id));
    const appointmentIds = Array.from(new Set([
      ...payments.map((payment) => payment.appointmentId).filter(Boolean),
      ...appointmentPaymentLogs.map((log) => log.appointmentId).filter(Boolean),
      ...financeRecords
        .map((record) => extractAppointmentIdFromSnapshot(record.appointmentSnapshot))
        .filter((id): id is string => Boolean(id)),
      ...financeRecords
        .map((record) => extractAppointmentId(record.description))
        .filter((id): id is string => Boolean(id)),
    ]));
    const financeRecordDates = Array.from(new Set(
      financeRecords.map((record) => record.date).filter((date): date is string => Boolean(date))
    ));
    const [appointmentSnapshots, financeRecordAppointments] = await Promise.all([
      appointmentIds.length > 0
        ? prisma.appointment.findMany({ where: { id: { in: appointmentIds } } })
        : Promise.resolve([]),
      financeRecordDates.length > 0
        ? prisma.appointment.findMany({
            where: {
              deleted: false,
              date: { in: financeRecordDates },
            },
          })
        : Promise.resolve([]),
    ]);
    const appointmentSnapshotById = new Map(
      [...appointmentSnapshots, ...financeRecordAppointments].map((appointment) => [appointment.id, appointment])
    );

    const paymentTransactions = payments.map((payment) => {
      // Prefer any snapshot stored on the payment record; otherwise fallback to current appointment row
      const appointmentSnapshot = (payment as any).appointmentSnapshot || appointmentSnapshotById.get(payment.appointmentId);
      const serviceName = appointmentSnapshot?.customType || appointmentSnapshot?.serviceType || "appointment";

      return {
        id: payment.id,
        date: payment.date,
        description: appointmentSnapshot
          ? `Payment for ${serviceName}`
          : `Payment ${payment.id} for appointment ${payment.appointmentId}`,
        amount: Math.abs(toFiniteNumber(payment.amount)),
        type: "income",
        method: normalizeMethod(payment.method),
        appointmentId: payment.appointmentId,
        appointmentSnapshot,
        logDate: toIsoDate(payment.updatedAt || payment.createdAt) || payment.date,
        source: "payment",
      };
    });

    const financeTransactions = financeRecords
      .filter((record) => isIncomeType(record.type) || isExpenseType(record.type))
      .filter((record) => {
        const paymentId = extractPaymentId(record.description);
        return !paymentId || !paymentIds.has(paymentId);
      })
      .map((record) => {
        const matchedAppointment = findAppointmentForFinanceRecord(record, financeRecordAppointments);
        const appointmentId =
          extractAppointmentIdFromSnapshot(record.appointmentSnapshot) ||
          extractAppointmentId(record.description) ||
          matchedAppointment?.id ||
          undefined;

        return {
          id: record.id,
          date: record.date,
          description: record.description || `${record.type} record`,
          amount: isExpenseType(record.type)
            ? -Math.abs(toFiniteNumber(record.amount))
            : Math.abs(toFiniteNumber(record.amount)),
          type: isExpenseType(record.type) ? "expense" : "income",
          method: isIncomeType(record.type) ? "Payment" : "Finance record",
          appointmentId,
          appointmentSnapshot: record.appointmentSnapshot
            ? record.appointmentSnapshot
            : (appointmentId ? appointmentSnapshotById.get(appointmentId) || matchedAppointment : matchedAppointment || undefined),
          logDate: toIsoDate(record.updatedAt || record.createdAt) || record.date,
          source: "finance-record",
        };
      });

    const representedPaymentTransactions = [...paymentTransactions, ...financeTransactions]
      .filter((transaction) => transaction.type === "income" && transaction.appointmentId && transaction.amount > 0);

    const appointmentLogTransactions = appointmentPaymentLogs
      .filter((log) => toFiniteNumber(log.amount) > 0)
      .map((log) => {
        const liveAppointment = appointmentSnapshotById.get(log.appointmentId);
        const logSnapshot = (log.newState && typeof log.newState === "object" ? log.newState : null) as any;
        const appointmentSnapshot = {
          ...(liveAppointment || {}),
          ...(logSnapshot || {}),
          id: logSnapshot?.id || liveAppointment?.id || log.appointmentId,
          appointmentId: log.appointmentId,
          changedAt: toIsoDate(log.changedAt),
          changedByName: log.changedByName || undefined,
        };
        const serviceName = getAppointmentServiceName(appointmentSnapshot);
        const changedAt = normalizeDate(log.changedAt) || new Date();
        const logDate = toIsoDate(log.changedAt) || dateKey(changedAt);

        return {
          id: log.id,
          date: dateKey(changedAt),
          description: `Payment for ${serviceName}`,
          amount: Math.abs(toFiniteNumber(log.amount)),
          type: "income",
          method: normalizeMethod(appointmentSnapshot.paymentMethod || "Payment log"),
          appointmentId: log.appointmentId,
          appointmentSnapshot,
          logDate,
          changedByName: log.changedByName || undefined,
          source: "appointment-log",
        };
      })
      .filter((transaction) =>
        !representedPaymentTransactions.some((represented) => isSamePaymentEvent(transaction, represented))
      );

    const expenseTransactions = detailedExpenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      description: expense.description,
      amount: -Math.abs(toFiniteNumber(expense.amount)),
      type: "expense",
      method: normalizeMethod(expense.paymentMethod),
      logDate: expense.date,
      source: "expense",
    }));

    const data = [...paymentTransactions, ...financeTransactions, ...appointmentLogTransactions, ...expenseTransactions]
      .sort((a, b) => {
        const aTime = normalizeDate(a.logDate || a.date)?.getTime() || 0;
        const bTime = normalizeDate(b.logDate || b.date)?.getTime() || 0;
        return bTime - aTime;
      })
      .slice(0, 25);

    res.json({ success: true, message: "Recent transactions retrieved successfully", data });
  } catch (error) {
    console.error("[FINANCE RECENT_TRANSACTIONS] Error fetching recent transactions:", error);
    res.status(500).json({ success: false, message: "Error fetching recent transactions", error: error instanceof Error ? error.message : "Unknown error" });
  }
};
