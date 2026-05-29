import { PaymentLog } from "../types/paymentLog";
import { prisma } from "../lib/prisma";

export const createPaymentLog = async (
  appointmentId: string,
  amount: number,
  paymentMethod: string,
  paymentStatus: string,
  changedBy: string,
  previousBalance: number,
  newBalance: number,
  changedByName?: string
): Promise<PaymentLog> => {
  const newLog = await prisma.paymentLog.create({
    data: {
      id: `pay_log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      appointmentId,
      amount,
      paymentMethod,
      paymentStatus,
      changedBy,
      changedByName,
      changedAt: new Date(),
      previousBalance,
      newBalance,
    },
  });

  return {
    ...newLog,
    changedAt: newLog.changedAt?.toISOString() || new Date().toISOString(),
    changedByName: newLog.changedByName || undefined,
    previousBalance: newLog.previousBalance || 0,
    newBalance: newLog.newBalance || 0,
  };
};

export const getPaymentLogs = async (appointmentId: string): Promise<PaymentLog[]> => {
  const logs = await prisma.paymentLog.findMany({
    where: { appointmentId },
    orderBy: { changedAt: "desc" },
  });

  return logs.map((log) => ({
    ...log,
    changedAt: log.changedAt?.toISOString() || "",
    changedByName: log.changedByName || undefined,
    previousBalance: log.previousBalance || 0,
    newBalance: log.newBalance || 0,
  }));
};
