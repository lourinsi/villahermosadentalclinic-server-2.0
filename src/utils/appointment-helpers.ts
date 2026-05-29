import { Appointment } from "../types/appointment";
import { isPatientCartStatus } from "../constants/appointmentStatuses";
import { normalizeAppointmentDuration } from "./appointment-durations";
import { areSameDoctorIdentity, DoctorIdentity } from "./doctorIdentity";

/**
 * Checks for appointment conflicts for a specific doctor
 */
export const hasConflict = (
  appointments: Appointment[],
  newDate: string,
  newTime: string,
  newDuration: number,
  doctor: string,
  excludeId?: string,
  patientId?: string,
  doctorStaff: DoctorIdentity[] = []
): boolean => {
  const timeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(":").map(Number);
    return (hours || 0) * 60 + (minutes || 0);
  };

  const newStart = timeToMinutes(newTime);
  const duration = normalizeAppointmentDuration(newDuration);
  const newEnd = newStart + duration;

  return appointments.some((apt) => {
    if (
      apt.deleted ||
      apt.id === excludeId ||
      apt.date !== newDate ||
      apt.status === "cancelled" ||
      apt.status === "completed" ||
      isPatientCartStatus(apt.status) // Cart appointments don't block others until paid/scheduled
    ) {
      return false;
    }

    // Check for patient overlap (patient cannot have two appointments at the same time)
    const isSamePatient = patientId && apt.patientId === patientId;
    
    // Check for doctor overlap (doctor cannot have two appointments at the same time)
    const existingDoctor = apt.doctorId || apt.doctor;
    const isSameDoctor = Boolean(
      doctor && existingDoctor && areSameDoctorIdentity(doctor, existingDoctor, doctorStaff)
    );

    // If it's neither the same patient nor the same doctor, no conflict
    if (!isSamePatient && !isSameDoctor) {
      return false;
    }

    const aptStart = timeToMinutes(apt.time);
    const aptDuration = normalizeAppointmentDuration(apt.duration);
    const aptEnd = aptStart + aptDuration;

    // Overlap condition: (newStart < aptEnd) && (newEnd > aptStart)
    return newStart < aptEnd && newEnd > aptStart;
  });
};
