export type DoctorIdentity = {
  id?: string | null;
  name?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
  role?: string | null;
  specialization?: string | null;
  bio?: string | null;
  profilePicture?: string | null;
};

export const normalizeDoctorIdentity = (value: unknown): string =>
  String(value ?? "")
    .replace(/^Dr\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeIdentifier = (value: unknown): string =>
  normalizeDoctorIdentity(String(value ?? "").replace(/[_-]+/g, " "));

const getStaffIdKey = (id: unknown): string => {
  const tokens = normalizeIdentifier(id)
    .split(/\s+/)
    .filter((token) => token && token !== "seed" && token !== "staff");
  return tokens.join(" ");
};

const doctorValueKeys = (value: unknown): string[] => {
  const raw = typeof value === "object" && value !== null
    ? [
        (value as DoctorIdentity).id,
        (value as DoctorIdentity).name,
        (value as DoctorIdentity).fullName,
        (value as DoctorIdentity).username,
        (value as DoctorIdentity).email,
      ]
    : [value];

  return Array.from(
    new Set(
      raw
        .map((item) => normalizeIdentifier(item))
        .filter(Boolean)
    )
  );
};

const doctorStaffKeys = (staff: DoctorIdentity): string[] =>
  Array.from(
    new Set(
      [
        normalizeIdentifier(staff.id),
        getStaffIdKey(staff.id),
        normalizeIdentifier(staff.name),
        normalizeIdentifier(staff.fullName),
        normalizeIdentifier(staff.username),
        normalizeIdentifier(staff.email),
        normalizeIdentifier(String(staff.email || "").split("@")[0]),
      ].filter(Boolean)
    )
  );

const keysMatch = (queryKey: string, staffKey: string): boolean => {
  if (!queryKey || !staffKey) return false;
  if (queryKey === staffKey) return true;
  if (staffKey.length >= 5 && queryKey.includes(staffKey)) return true;
  if (queryKey.length >= 5 && staffKey.includes(queryKey)) return true;
  return false;
};

export const findDoctorForValue = (
  staffMembers: DoctorIdentity[] = [],
  value: unknown
): DoctorIdentity | undefined => {
  const rawValue = String(value ?? "").trim();
  const queryKeys = doctorValueKeys(value);
  if (!rawValue && queryKeys.length === 0) return undefined;

  return (
    staffMembers.find((staff) => String(staff.id ?? "") === rawValue) ||
    staffMembers.find((staff) =>
      queryKeys.some((queryKey) => doctorStaffKeys(staff).some((staffKey) => queryKey === staffKey))
    ) ||
    staffMembers.find((staff) =>
      queryKeys.some((queryKey) => doctorStaffKeys(staff).some((staffKey) => keysMatch(queryKey, staffKey)))
    )
  );
};

export const areSameDoctorIdentity = (
  first: unknown,
  second: unknown,
  staffMembers: DoctorIdentity[] = []
): boolean => {
  const firstNormalized = normalizeDoctorIdentity(first);
  const secondNormalized = normalizeDoctorIdentity(second);
  if (!firstNormalized || !secondNormalized) return false;
  if (firstNormalized === secondNormalized) return true;

  const firstDoctor = findDoctorForValue(staffMembers, first);
  const secondDoctor = findDoctorForValue(staffMembers, second);
  if (firstDoctor?.id && secondDoctor?.id) {
    return String(firstDoctor.id) === String(secondDoctor.id);
  }

  return false;
};

export const getDoctorSearchText = (
  doctorValue: unknown,
  staffMembers: DoctorIdentity[] = []
): string => {
  const doctor = findDoctorForValue(staffMembers, doctorValue);
  return [
    doctorValue,
    doctor?.id,
    doctor?.name,
    doctor?.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

export const withResolvedDoctor = <T extends Record<string, any>>(
  value: T,
  staffMembers: DoctorIdentity[] = []
): T => {
  const doctor = findDoctorForValue(
    staffMembers,
    value.doctorId || value.doctorName || value.doctor
  );
  if (!doctor) return value;

  const doctorName = String(doctor.name || value.doctorName || value.doctor || "").trim();
  const doctorId = String(doctor.id || value.doctorId || "").trim();
  const doctorProfile = String(doctor.profilePicture || value.doctorProfile || value.doctorProfilePicture || "").trim();

  return {
    ...value,
    doctor: doctorName || value.doctor,
    doctorName: doctorName || value.doctorName,
    doctorId: doctorId || value.doctorId,
    doctorProfile: doctorProfile || value.doctorProfile,
    doctorProfilePicture: doctorProfile || value.doctorProfilePicture,
  };
};
