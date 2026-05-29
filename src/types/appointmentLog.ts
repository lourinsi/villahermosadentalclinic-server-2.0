import { Appointment } from "./appointment";

export interface AppointmentLog {
  id: string;
  appointmentId: string;
  previousState: Appointment;
  newState: Partial<Appointment>;
  changedBy: string; // userId (admin, doctor, or patient)
  changedByName?: string; // name of the user who made the change
  changedAt: string;
  changeType: 'update' | 'status_change' | 'payment' | 'rescheduled' | 'notes_update';
  amount?: number;
  notes?: string;
}
