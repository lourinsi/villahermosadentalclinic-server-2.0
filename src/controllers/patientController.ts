import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { Patient, ApiResponse } from "../types/patient";
import { createNotification, notifyAdmin } from "../utils/notifications";
import { isPatientCartStatus, normalizeStatus } from "../constants/appointmentStatuses";
import { prisma } from "../lib/prisma";
import { getPatientDisplayName } from "../utils/patientIdentity";

const patientUpdateFields = [
  "name",
  "firstName",
  "lastName",
  "email",
  "phone",
  "alternateEmail",
  "alternatePhone",
  "dateOfBirth",
  "address",
  "city",
  "zipCode",
  "insurance",
  "status",
  "emergencyContact",
  "emergencyPhone",
  "medicalHistory",
  "treatmentPlan",
  "clinicalNotes",
  "allergies",
  "notes",
  "profilePicture",
  "parentId",
  "isPrimary",
  "relationship",
  "username",
  "dentalCharts",
  "balance",
  "lastVisit",
  "gender",
  "civilStatus",
  "age",
  "ethnicity",
  "religion",
  "nationality",
  "currentStreet",
  "currentBarangay",
  "currentProvince",
  "permanentStreet",
  "permanentBarangay",
  "permanentCity",
  "permanentProvince",
  "permanentZipCode",
  "landline",
  "emergencyFirstName",
  "emergencyLastName",
  "emergencyRelationship",
  "education",
  "occupation",
  "company",
  "companyAddress",
  "height",
  "weight",
] as const;

const stripPassword = <T extends Record<string, any>>(patient: T): Omit<T, "password"> => {
  const { password, ...patientForResponse } = patient;
  return patientForResponse;
};

const toFiniteNumber = (value: unknown): number => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const toPositiveBalance = (value: unknown): number => Math.max(0, toFiniteNumber(value));

const latestDate = (...dates: Array<string | null | undefined>) =>
  dates
    .map((date) => String(date || "").split(" ")[0])
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || null;

const isBillableAppointment = (appointment: { status?: string | null; deleted?: boolean | null }) => {
  if (appointment.deleted) return false;

  const status = normalizeStatus(appointment.status);
  return status !== "cancelled" && !isPatientCartStatus(status);
};

const getAppointmentOutstandingBalance = (
  appointment: {
    id?: string | null;
    price?: number | null;
    discount?: number | null;
    balance?: number | null;
    status?: string | null;
    deleted?: boolean | null;
  },
  paymentSums: Record<string, number>
) => {
  if (!isBillableAppointment(appointment)) return 0;

  const price = toFiniteNumber(appointment.price);
  const discount = toFiniteNumber(appointment.discount);
  const totalDue = Math.max(0, price - discount);
  const paid = appointment.id ? paymentSums[appointment.id] || 0 : 0;
  const EPS = 0.01;

  if (paid + EPS >= totalDue) return 0;
  if (appointment.balance !== undefined && appointment.balance !== null) {
    return toPositiveBalance(appointment.balance);
  }

  return Math.max(0, totalDue - paid);
};

const getComputedPatientStatus = (hasOverdue: boolean, effectiveLastVisit?: string | null) => {
  if (hasOverdue) return "overdue";

  if (effectiveLastVisit) {
    const lastVisitDate = new Date(`${String(effectiveLastVisit).split(" ")[0]}T00:00:00`);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (lastVisitDate < oneYearAgo) return "inactive";
  }

  return "active";
};

const buildPatientUpdateData = (input: Record<string, any>) => {
  const data: Record<string, any> = {};

  for (const field of patientUpdateFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      data[field] = input[field];
    }
  }

  data.updatedAt = new Date();
  return data;
};

const buildPatientCreateData = (
  patientData: Partial<Patient>,
  id: string,
  passwordHash?: string
) => {
  const firstName = patientData.firstName || "";
  const lastName = patientData.lastName || "";
  const isPrimary =
    patientData.isPrimary !== undefined ? patientData.isPrimary : patientData.parentId ? false : true;

  return {
    id,
    name: patientData.name || `${firstName} ${lastName}`.trim() || patientData.email || patientData.phone || id,
    firstName,
    lastName,
    email: patientData.email || "",
    phone: patientData.phone || "",
    alternateEmail: patientData.alternateEmail || "",
    alternatePhone: patientData.alternatePhone || "",
    password: passwordHash,
    dateOfBirth: patientData.dateOfBirth || "",
    address: patientData.address || "",
    city: patientData.city || "",
    zipCode: patientData.zipCode || "",
    insurance: patientData.insurance || "",
    status: patientData.status || "active",
    emergencyContact: patientData.emergencyContact || "",
    emergencyPhone: patientData.emergencyPhone || "",
    medicalHistory: patientData.medicalHistory || "",
    treatmentPlan: patientData.treatmentPlan || "",
    clinicalNotes: patientData.clinicalNotes || "",
    allergies: patientData.allergies || "",
    notes: patientData.notes || "",
    profilePicture: patientData.profilePicture || null,
    parentId: isPrimary ? null : patientData.parentId || null,
    isPrimary,
    relationship: patientData.relationship || null,
    username: patientData.username || null,
    dentalCharts: patientData.dentalCharts || [],
    balance: (patientData as any).balance ?? null,
    lastVisit: patientData.lastVisit || null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deleted: false,
  };
};

export const addPatient = async (req: Request, res: Response<ApiResponse<Patient>>) => {
  try {
    const user = (req as any).user;
    if (user?.role === "patient") {
      return res.status(403).json({
        success: false,
        message: "Patients are not allowed to add other patients",
      });
    }

    const patientData: Patient = req.body;

    if (!patientData.firstName) {
      return res.status(400).json({
        success: false,
        message: "Missing required field: firstName",
      });
    }

    const passwordHash = patientData.password
      ? patientData.password
      : await bcrypt.hash("villahermosa123", 10);
    const id = `patient_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newPatient = await prisma.patient.create({
      data: buildPatientCreateData(patientData, id, passwordHash) as any,
    });

    notifyAdmin(
      "New Patient Registration",
      `A new patient, ${newPatient.firstName || ""} ${newPatient.lastName || ""}, has registered.`,
      "system"
    );

    createNotification(
      id,
      "Welcome to Villahermosa Dental Clinic",
      "Thank you for registering with us. We look forward to serving you!",
      "system"
    );

    res.status(201).json({
      success: true,
      message: "Patient added successfully",
      data: stripPassword(newPatient) as unknown as Patient,
    });
  } catch (error) {
    console.error("[PATIENT CREATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding patient",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const addPublicBookingPatient = async (
  req: Request,
  res: Response<ApiResponse<Patient>>
) => {
  try {
    const patientData: Patient = req.body;

    if (!patientData.firstName) {
      return res.status(400).json({ success: false, message: "Missing required field: firstName" });
    }
    if (!patientData.lastName) {
      return res.status(400).json({ success: false, message: "Missing required field: lastName" });
    }
    if (!patientData.phone) {
      return res.status(400).json({ success: false, message: "Missing required field: phone" });
    }

    const existingPatient = await prisma.patient.findFirst({
      where: {
        deleted: false,
        OR: [
          ...(patientData.email ? [{ email: patientData.email }] : []),
          ...(patientData.phone ? [{ phone: patientData.phone }] : []),
        ],
      },
    });

    if (existingPatient) {
      return res.status(200).json({
        success: true,
        message: "Patient already exists",
        data: stripPassword(existingPatient) as unknown as Patient,
      });
    }

    const passwordHash = await bcrypt.hash("villahermosa123", 10);
    const id = `patient_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newPatient = await prisma.patient.create({
      data: buildPatientCreateData({ ...patientData, isPrimary: true }, id, passwordHash) as any,
    });

    notifyAdmin(
      "New Public Booking Patient",
      `A new patient, ${newPatient.firstName || ""} ${newPatient.lastName || ""}, was created from public booking.`,
      "system"
    );

    res.status(201).json({
      success: true,
      message: "Patient added successfully",
      data: stripPassword(newPatient) as unknown as Patient,
    });
  } catch (error) {
    console.error("[PUBLIC PATIENT CREATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding patient",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const addDependent = async (req: Request, res: Response<ApiResponse<Patient>>) => {
  try {
    const {
      parentId,
      firstName,
      lastName,
      relationship,
      dateOfBirth,
      medicalHistory,
      allergies,
      alternateEmail,
      alternatePhone,
    } = req.body;

    if (!parentId || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: parentId, firstName, lastName",
      });
    }

    const parent = await prisma.patient.findUnique({ where: { id: parentId } });
    if (!parent || parent.deleted) {
      return res.status(404).json({ success: false, message: "Parent patient not found" });
    }

    const id = `patient_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newPatient = await prisma.patient.create({
      data: {
        id,
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        email: parent.email || "",
        phone: parent.phone || "",
        alternateEmail: alternateEmail || "",
        alternatePhone: alternatePhone || "",
        parentId,
        isPrimary: false,
        relationship: relationship || "Family Member",
        dateOfBirth: dateOfBirth || "",
        address: parent.address || "",
        city: parent.city || "",
        zipCode: parent.zipCode || "",
        insurance: parent.insurance || "",
        medicalHistory: medicalHistory || "",
        allergies: allergies || "",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
        deleted: false,
      },
    });

    createNotification(
      parentId,
      "Dependent Added",
      `${firstName} ${lastName} has been added as a dependent to your account.`,
      "system"
    );

    res.status(201).json({
      success: true,
      message: "Dependent patient added successfully",
      data: stripPassword(newPatient) as unknown as Patient,
    });
  } catch (error) {
    console.error("[ADD DEPENDENT] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding dependent",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getPatients = async (
  req: Request,
  res: Response<ApiResponse<Patient[]>>
) => {
  try {
    const { page = "1", limit = "10", search = "", status = "all", parentId = "", doctor = "" } =
      req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);

    let active = (await prisma.patient.findMany({
      where: { deleted: false },
      orderBy: { createdAt: "desc" },
    })) as any[];

    if (doctor && !search) {
      const appointments = await prisma.appointment.findMany({
        where: { deleted: false, doctor },
        select: { patientId: true },
      });
      const doctorPatientIds = new Set(appointments.map((appointment) => appointment.patientId));
      active = active.filter((patient) => doctorPatientIds.has(patient.id || ""));
    }

    if (parentId) {
      active = active.filter((patient) => patient.parentId === parentId);
    }

    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      active = active.filter((patient) => {
        const full = `${patient.firstName || ""} ${patient.lastName || ""}`.toLowerCase();
        return (
          full.includes(q) ||
          (patient.email || "").toLowerCase().includes(q) ||
          (patient.phone || "").toLowerCase().includes(q)
        );
      });
    }

    // Compute balance and overdue status for the remaining patients server-side using Prisma data.
    // Patient.balance is kept as a ledger fallback because older hosted records may have balances
    // that are not represented by appointment rows anymore.
    if (active.length > 0) {
      const patientIds = active.map((p) => p.id).filter(Boolean) as string[];

      const appts = await prisma.appointment.findMany({
        where: { deleted: false, patientId: { in: patientIds } },
        select: { id: true, patientId: true, price: true, discount: true, status: true, date: true, paymentStatus: true, balance: true, totalPaid: true },
      });

      const apptMap: Record<string, { totalBalance: number; hasOverdue: boolean; lastCompletedDate?: string | null }> = {};

      const apptIds = appts.map((a) => a.id).filter(Boolean) as string[];
      // Fetch payments for these appointments so we compute outstanding amounts reliably
      const payments = apptIds.length
        ? await prisma.payment.findMany({
            where: { deleted: false, appointmentId: { in: apptIds } },
            select: { appointmentId: true, amount: true },
          })
        : [];

      const paymentSums: Record<string, number> = {};
      for (const p of payments) {
        const aid = p.appointmentId as string;
        paymentSums[aid] = (paymentSums[aid] || 0) + Number(p.amount || 0);
      }

      for (const a of appts) {
        const pid = a.patientId as string;
        if (!apptMap[pid]) apptMap[pid] = { totalBalance: 0, hasOverdue: false, lastCompletedDate: null };
        const entry = apptMap[pid];

        entry.totalBalance += getAppointmentOutstandingBalance(a, paymentSums);

        const aptStatus = normalizeStatus(a.status);
        const aptPaymentStatus = String((a as any).paymentStatus || "").toLowerCase();

        // Mark overdue only when the appointment's paymentStatus is 'overdue'.
        if (isBillableAppointment(a) && aptPaymentStatus === "overdue") {
          entry.hasOverdue = true;
        }

        if (aptStatus === "completed" && a.date) {
          if (!entry.lastCompletedDate || a.date > entry.lastCompletedDate) {
            entry.lastCompletedDate = a.date;
          }
        }
      }

      // Merge computed values back into patient records
      active = active.map((patient) => {
        const agg = apptMap[patient.id] || { totalBalance: 0, hasOverdue: false, lastCompletedDate: null };
        const effectiveLastVisit = latestDate(patient.lastVisit, agg.lastCompletedDate);
        const computedBalance = agg.totalBalance > 0 ? agg.totalBalance : toPositiveBalance(patient.balance);
        const newStatus = getComputedPatientStatus(agg.hasOverdue, effectiveLastVisit);

        return {
          ...patient,
          balance: computedBalance,
          status: newStatus,
          lastVisit: effectiveLastVisit,
        } as any;
      });
    }

    if (status && status !== "all") {
      active = active.filter((patient) => patient.status === status);
    }

    const requester = (req as any).user || (req as any).authUser;
    if (requester?.role === "patient") {
      const userEmail = String(requester.email || "").toLowerCase();
      const userName = String(requester.username || "").toLowerCase();
      const userId = requester.id || requester.patientId ? String(requester.id || requester.patientId) : undefined;

      active = active.filter((patient) => {
        const patientEmail = String(patient.email || "").toLowerCase();
        const patientUsername = String(patient.username || patient.email || "").toLowerCase();
        const patientName = String(patient.name || "").toLowerCase();

        return (
          (userEmail && patientEmail === userEmail) ||
          (userName && (patientUsername === userName || patientName === userName)) ||
          (userId && String(patient.parentId || patient.id) === userId)
        );
      });
    }

    const total = active.length;
    const totalPages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const items = active.slice(start, start + limitNum).map((patient) => stripPassword(patient));

    res.json({
      success: true,
      message: "Patients retrieved successfully",
      data: items as unknown as Patient[],
      meta: { total, page: pageNum, limit: limitNum, totalPages },
    });
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching patients",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getPatientById = async (
  req: Request,
  res: Response<ApiResponse<Patient | null>>
) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id as string } }) as any;

    if (!patient || patient.deleted) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    // Compute appointments-based balance and overdue flag for this patient.
    // Preserve Patient.balance as a ledger fallback for older hosted records.
    const appts = await prisma.appointment.findMany({
      where: { deleted: false, patientId: patient.id },
      select: { id: true, price: true, discount: true, status: true, date: true, paymentStatus: true, balance: true, totalPaid: true },
    });

    let totalBalance = 0;
    let hasOverdue = false;
    let lastCompletedDate: string | null = null;

    const apptIds = appts.map((a) => a.id).filter(Boolean) as string[];
    const payments = apptIds.length
      ? await prisma.payment.findMany({ where: { deleted: false, appointmentId: { in: apptIds } }, select: { appointmentId: true, amount: true } })
      : [];

    const paymentSums: Record<string, number> = {};
    for (const p of payments) {
      const aid = p.appointmentId as string;
      paymentSums[aid] = (paymentSums[aid] || 0) + Number(p.amount || 0);
    }

    for (const a of appts) {
      totalBalance += getAppointmentOutstandingBalance(a, paymentSums);

      const aptStatus = normalizeStatus(a.status);
      const aptPaymentStatus = String((a as any).paymentStatus || "").toLowerCase();
      // Mark overdue only when appointment paymentStatus is 'overdue'
      if (isBillableAppointment(a) && aptPaymentStatus === "overdue") hasOverdue = true;
      if (aptStatus === "completed" && a.date) {
        if (!lastCompletedDate || a.date > lastCompletedDate) lastCompletedDate = a.date;
      }
    }

    const effectiveLastVisit = latestDate(patient.lastVisit, lastCompletedDate);
    const computedBalance = totalBalance > 0 ? totalBalance : toPositiveBalance(patient.balance);
    const newStatus = getComputedPatientStatus(hasOverdue, effectiveLastVisit);

    const patientForResponse = {
      ...patient,
      balance: computedBalance,
      status: newStatus,
      lastVisit: effectiveLastVisit,
    };

    res.json({
      success: true,
      message: "Patient retrieved successfully",
      data: stripPassword(patientForResponse) as unknown as Patient,
    });
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching patient",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updatePatient = async (
  req: Request,
  res: Response<ApiResponse<Patient | null>>
) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id as string } });
    if (!patient || patient.deleted) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    delete req.body.password;

    const updateData = buildPatientUpdateData(req.body);
    if (!req.body.name && (req.body.firstName !== undefined || req.body.lastName !== undefined)) {
      updateData.name = `${req.body.firstName ?? patient.firstName ?? ""} ${
        req.body.lastName ?? patient.lastName ?? ""
      }`.trim();
    }

    const updatedPatient = await prisma.patient.update({
      where: { id: req.params.id as string },
      data: updateData as any,
    });
    const currentPatientName = getPatientDisplayName(updatedPatient);

    await prisma.appointment.updateMany({
      where: { patientId: updatedPatient.id, deleted: false },
      data: { patientName: currentPatientName, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Patient updated successfully",
      data: stripPassword(updatedPatient) as unknown as Patient,
    });
  } catch (error) {
    console.error("[PATIENT UPDATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error updating patient",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getQuestionnaire = async (
  req: Request,
  res: Response<ApiResponse<any>>
) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.patientId as string } });

    if (!patient || patient.deleted) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No questionnaire found",
      });
    }

    const questionnaireData = {
      patientId: patient.id,
      gender: patient.gender,
      civilStatus: patient.civilStatus,
      age: patient.age,
      ethnicity: patient.ethnicity,
      religion: patient.religion,
      nationality: patient.nationality,
      currentStreet: patient.currentStreet,
      currentBarangay: patient.currentBarangay,
      currentCity: patient.city,
      currentProvince: patient.currentProvince,
      currentZipCode: patient.zipCode,
      permanentStreet: patient.permanentStreet,
      permanentBarangay: patient.permanentBarangay,
      permanentCity: patient.permanentCity,
      permanentProvince: patient.permanentProvince,
      permanentZipCode: patient.permanentZipCode,
      landline: patient.landline,
      mobileContact: patient.phone,
      emailAddress: patient.email,
      emergencyFirstName: patient.emergencyFirstName,
      emergencyLastName: patient.emergencyLastName,
      emergencyRelationship: patient.emergencyRelationship,
      emergencyContact: patient.emergencyContact,
      emergencyPhone: patient.emergencyPhone,
      education: patient.education,
      occupation: patient.occupation,
      company: patient.company,
      companyAddress: patient.companyAddress,
      height: patient.height,
      weight: patient.weight,
    };

    res.status(200).json({
      success: true,
      data: questionnaireData,
      message: "Questionnaire retrieved successfully",
    });
  } catch (error) {
    console.error("[GET QUESTIONNAIRE] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch questionnaire",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const upsertQuestionnaire = async (
  req: Request,
  res: Response<ApiResponse<Patient | null>>
) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.patientId as string } });
    if (!patient || patient.deleted) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const questionnaireData = req.body;
    const updateData = {
      gender: questionnaireData.gender,
      civilStatus: questionnaireData.civilStatus,
      age: questionnaireData.age,
      ethnicity: questionnaireData.ethnicity,
      religion: questionnaireData.religion,
      nationality: questionnaireData.nationality,
      currentStreet: questionnaireData.currentStreet,
      currentBarangay: questionnaireData.currentBarangay,
      city: questionnaireData.currentCity,
      currentProvince: questionnaireData.currentProvince,
      zipCode: questionnaireData.currentZipCode,
      permanentStreet: questionnaireData.permanentStreet,
      permanentBarangay: questionnaireData.permanentBarangay,
      permanentCity: questionnaireData.permanentCity,
      permanentProvince: questionnaireData.permanentProvince,
      permanentZipCode: questionnaireData.permanentZipCode,
      landline: questionnaireData.landline,
      phone: questionnaireData.mobileContact,
      email: questionnaireData.emailAddress,
      emergencyFirstName: questionnaireData.emergencyFirstName,
      emergencyLastName: questionnaireData.emergencyLastName,
      emergencyRelationship: questionnaireData.emergencyRelationship,
      emergencyContact: questionnaireData.emergencyContact,
      emergencyPhone: questionnaireData.emergencyPhone,
      education: questionnaireData.education,
      occupation: questionnaireData.occupation,
      company: questionnaireData.company,
      companyAddress: questionnaireData.companyAddress,
      height: questionnaireData.height,
      weight: questionnaireData.weight,
      updatedAt: new Date(),
    };

    const updatedPatient = await prisma.patient.update({
      where: { id: req.params.patientId as string },
      data: updateData,
    });

    res.json({
      success: true,
      data: stripPassword(updatedPatient) as unknown as Patient,
      message: "Questionnaire saved successfully",
    });
  } catch (error) {
    console.error("[QUESTIONNAIRE UPDATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save questionnaire",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deletePatient = async (
  req: Request,
  res: Response<ApiResponse<null>>
) => {
  try {
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id as string } });
    if (!patient || patient.deleted) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    await prisma.patient.update({
      where: { id: req.params.id as string },
      data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() },
    });

    res.json({ success: true, message: "Patient deleted (soft) successfully" });
  } catch (error) {
    console.error("[PATIENT DELETE] Error deleting patient:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting patient",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const changePassword = async (
  req: Request,
  res: Response<ApiResponse<null>>
) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const patient = await prisma.patient.findUnique({ where: { id: req.params.id as string } });

    if (!patient || patient.deleted) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    if (!patient.password) {
      return res.status(400).json({
        success: false,
        message: "Patient does not have a password set.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, patient.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Incorrect current password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
    await prisma.patient.update({
      where: { id: req.params.id as string },
      data: { password: hashedPassword, updatedAt: new Date() },
    });

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("[PATIENT PASSWORD] Error changing password:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
