export type PatientIdentity = {
  id?: string | null;
  name?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  profilePicture?: string | null;
  dateOfBirth?: string | null;
  dob?: string | null;
  birthDate?: string | null;
  birthday?: string | null;
};

const normalizeIdentifier = (value: unknown): string =>
  String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export const getPatientDisplayName = (
  patient?: PatientIdentity | null,
  fallback?: unknown
): string => {
  if (!patient) return String(fallback ?? "").trim();

  const composedName = [patient.firstName, patient.lastName]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  return (
    composedName ||
    String(patient.name || patient.fullName || patient.username || patient.email || patient.phone || patient.id || fallback || "").trim()
  );
};

const valueKeys = (value: unknown): string[] => {
  const raw = typeof value === "object" && value !== null
    ? [
        (value as any).id,
        (value as any).patientId,
        (value as PatientIdentity).name,
        (value as PatientIdentity).fullName,
        (value as PatientIdentity).firstName,
        (value as PatientIdentity).lastName,
        (value as PatientIdentity).username,
        (value as PatientIdentity).email,
        (value as PatientIdentity).phone,
      ]
    : [value];

  return Array.from(new Set(raw.map(normalizeIdentifier).filter(Boolean)));
};

const patientKeys = (patient: PatientIdentity): string[] =>
  Array.from(
    new Set(
      [
        normalizeIdentifier(patient.id),
        normalizeIdentifier(getPatientDisplayName(patient)),
        normalizeIdentifier(patient.name),
        normalizeIdentifier(patient.fullName),
        normalizeIdentifier(patient.username),
        normalizeIdentifier(patient.email),
        normalizeIdentifier(patient.phone),
      ].filter(Boolean)
    )
  );

export const findPatientForValue = (
  patients: PatientIdentity[] = [],
  value: unknown
): PatientIdentity | undefined => {
  const rawValue = String(value ?? "").trim();
  const queryKeys = valueKeys(value);
  if (!rawValue && queryKeys.length === 0) return undefined;

  return (
    patients.find((patient) => String(patient.id ?? "") === rawValue) ||
    patients.find((patient) =>
      queryKeys.some((queryKey) => patientKeys(patient).some((patientKey) => queryKey === patientKey))
    )
  );
};

export const getPatientSearchText = (
  patientValue: unknown,
  patients: PatientIdentity[] = []
): string => {
  const patient = findPatientForValue(patients, patientValue);
  return [
    patientValue,
    patient?.id,
    patient?.name,
    patient?.firstName,
    patient?.lastName,
    getPatientDisplayName(patient),
    patient?.email,
    patient?.phone,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export const withResolvedPatient = <T extends Record<string, any>>(
  value: T,
  patients: PatientIdentity[] = []
): T => {
  const patient = findPatientForValue(
    patients,
    value.patientId || value.patient?.id || value.patientName || value.patient
  );
  if (!patient) return value;

  const patientId = String(patient.id || value.patientId || "").trim();
  const patientName = getPatientDisplayName(patient, value.patientName || value.patient?.name);
  const patientProfile = String(
    patient.profilePicture ||
      value.patientProfile ||
      value.patientProfilePicture ||
      value.profilePicture ||
      value.patient?.profilePicture ||
      ""
  ).trim();
  const patientDateOfBirth = String(
    patient.dateOfBirth ||
      patient.dob ||
      patient.birthDate ||
      patient.birthday ||
      value.patientDateOfBirth ||
      value.patientDob ||
      value.patientBirthDate ||
      value.patientBirthday ||
      value.patient?.dateOfBirth ||
      ""
  ).trim();

  const existingPatient = value.patient && typeof value.patient === "object" ? value.patient : {};

  return {
    ...value,
    patientId: patientId || value.patientId,
    patientName: patientName || value.patientName,
    patientFirstName: patient.firstName ?? value.patientFirstName,
    patientLastName: patient.lastName ?? value.patientLastName,
    email: patient.email ?? value.email,
    phone: patient.phone ?? value.phone,
    patientEmail: patient.email ?? value.patientEmail,
    patientPhone: patient.phone ?? value.patientPhone,
    patientProfile: patientProfile || value.patientProfile,
    patientProfilePicture: patientProfile || value.patientProfilePicture,
    profilePicture: patientProfile || value.profilePicture,
    patientDateOfBirth: patientDateOfBirth || value.patientDateOfBirth,
    patientDob: patientDateOfBirth || value.patientDob,
    patientBirthDate: patientDateOfBirth || value.patientBirthDate,
    patientBirthday: patientDateOfBirth || value.patientBirthday,
    patient: {
      ...existingPatient,
      id: patientId || existingPatient.id,
      name: patientName || existingPatient.name,
      firstName: patient.firstName ?? existingPatient.firstName,
      lastName: patient.lastName ?? existingPatient.lastName,
      email: patient.email ?? existingPatient.email,
      phone: patient.phone ?? existingPatient.phone,
      profilePicture: patientProfile || existingPatient.profilePicture,
      profilePictureUrl: patientProfile || existingPatient.profilePictureUrl,
      dateOfBirth: patientDateOfBirth || existingPatient.dateOfBirth,
      dob: patientDateOfBirth || existingPatient.dob,
    },
  };
};
