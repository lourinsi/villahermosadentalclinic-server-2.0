import { NotificationType } from '../shared/notificationStatuses';

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  createdAt: string;
  isRead: boolean;
  link?: string;
  isLog?: boolean; // Marked as true when this is a historical log entry (read-only)
  metadata?: {
    // Allow additional fields (notificationImage, doctorProfile, doctorId, patientId, etc.)
    [key: string]: any;
    appointmentId?: string;
    notificationImage?: string;
    doctorProfile?: string;
    patientProfile?: string;
    doctorId?: string;
    patientId?: string;
    currentStatus?: string;
    patientName?: string;
    appointmentDate?: string;
    appointmentTime?: string;
    doctor?: string;
    amount?: number;
    paymentDate?: string;
    paymentId?: string;
    cancellationReason?: string; // Reason why appointment was cancelled
    changedFields?: { [key: string]: any };
    changeSummary?: {
      field: string;
      label: string;
      from?: string;
      to?: string;
    }[];
    appointmentSnapshot?: { [key: string]: any };
    logDate?: string;
    isRequest?: boolean;
    isDoctorView?: boolean;
    isAdminView?: boolean;
    isPatientView?: boolean;
  };
  updatedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}
