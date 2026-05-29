import { AppointmentLog } from "../types/appointmentLog";
import { Appointment } from "../types/appointment";
import { prisma } from "../lib/prisma";

export const createAppointmentLog = async (
  appointmentId: string,
  previousState: Appointment,
  newState: Partial<Appointment>,
  changedBy: string,
  changedByName?: string,
  changeType: AppointmentLog["changeType"] = "update",
  amount?: number,
  notes?: string
): Promise<AppointmentLog> => {
  const newLog = await prisma.appointmentLog.create({
    data: {
      id: `apt_log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      appointmentId,
      previousState: previousState as any,
      newState: newState as any,
      changedBy,
      changedByName,
      changedAt: new Date(),
      changeType,
      amount,
      notes,
    },
  });

  return {
    ...newLog,
    changedAt: newLog.changedAt?.toISOString() || new Date().toISOString(),
    changedByName: newLog.changedByName || undefined,
    amount: newLog.amount ?? undefined,
    notes: newLog.notes || undefined,
    previousState: newLog.previousState as unknown as Appointment,
    newState: newLog.newState as unknown as Partial<Appointment>,
    changeType: newLog.changeType as AppointmentLog["changeType"],
  };
};

export const getAppointmentLogs = async (appointmentId: string): Promise<AppointmentLog[]> => {
  const logs = await prisma.appointmentLog.findMany({
    where: { appointmentId },
    orderBy: { changedAt: "desc" },
  });

  return logs.map((log) => ({
    ...log,
    changedAt: log.changedAt?.toISOString() || "",
    changedByName: log.changedByName || undefined,
    amount: log.amount ?? undefined,
    notes: log.notes || undefined,
    previousState: log.previousState as unknown as Appointment,
    newState: log.newState as unknown as Partial<Appointment>,
    changeType: log.changeType as AppointmentLog["changeType"],
  }));
};
