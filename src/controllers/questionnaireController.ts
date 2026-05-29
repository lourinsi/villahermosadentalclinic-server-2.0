import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type QuestionnaireData = {
  patientId?: string;
  gender?: string | null;
  civilStatus?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  religion?: string | null;
  nationality?: string | null;
  currentStreet?: string | null;
  currentBarangay?: string | null;
  currentCity?: string | null;
  currentProvince?: string | null;
  currentZipCode?: string | null;
  permanentStreet?: string | null;
  permanentBarangay?: string | null;
  permanentCity?: string | null;
  permanentProvince?: string | null;
  permanentZipCode?: string | null;
  landline?: string | null;
  mobileContact?: string | null;
  emailAddress?: string | null;
  emergencyFirstName?: string | null;
  emergencyLastName?: string | null;
  emergencyRelationship?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  education?: string | null;
  occupation?: string | null;
  company?: string | null;
  companyAddress?: string | null;
  height?: string | null;
  weight?: string | null;
  updatedAt?: string;
};

type PatientQuestionnaireSource = {
  id: string;
  gender?: string | null;
  civilStatus?: string | null;
  age?: string | null;
  ethnicity?: string | null;
  religion?: string | null;
  nationality?: string | null;
  currentStreet?: string | null;
  currentBarangay?: string | null;
  city?: string | null;
  currentProvince?: string | null;
  zipCode?: string | null;
  permanentStreet?: string | null;
  permanentBarangay?: string | null;
  permanentCity?: string | null;
  permanentProvince?: string | null;
  permanentZipCode?: string | null;
  landline?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyFirstName?: string | null;
  emergencyLastName?: string | null;
  emergencyRelationship?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  education?: string | null;
  occupation?: string | null;
  company?: string | null;
  companyAddress?: string | null;
  height?: string | null;
  weight?: string | null;
};

const toQuestionnaireData = (patient: PatientQuestionnaireSource): QuestionnaireData => ({
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
});

const toPatientUpdateData = (questionnaireData: QuestionnaireData) => ({
  gender: questionnaireData.gender,
  civilStatus: questionnaireData.civilStatus,
  age: questionnaireData.age != null ? String(questionnaireData.age) : questionnaireData.age,
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
});
type PatientParams = { patientId: string };

export const getQuestionnaire = async (req: Request<PatientParams>, res: Response) => {
  try {
    const { patientId } = req.params;
    const questionnaire = await prisma.questionnaire.findUnique({ where: { patientId } });

    if (questionnaire) {
      return res.status(200).json({
        success: true,
        data: questionnaire.data,
      });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });

    if (!patient || patient.deleted) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No questionnaire found",
      });
    }

    res.status(200).json({
      success: true,
      data: toQuestionnaireData(patient),
    });
  } catch (error) {
    console.error("Error fetching questionnaire:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch questionnaire",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const upsertQuestionnaire = async (req: Request<PatientParams>, res: Response) => {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
      });
    }

    const questionnaire = {
      patientId,
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient || patient.deleted) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    await prisma.questionnaire.upsert({
      where: { patientId },
      create: {
        patientId,
        data: questionnaire,
        updatedAt: new Date(),
      },
      update: {
        data: questionnaire,
        updatedAt: new Date(),
      },
    });

    await prisma.patient.update({
      where: { id: patientId },
      data: toPatientUpdateData(req.body),
    });

    res.status(200).json({
      success: true,
      data: questionnaire,
      message: "Questionnaire saved successfully",
    });
  } catch (error) {
    console.error("Error saving questionnaire:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save questionnaire",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const deleteQuestionnaire = async (req: Request<PatientParams>, res: Response) => {
  try {
    const { patientId } = req.params;
    const questionnaire = await prisma.questionnaire.findUnique({ where: { patientId } });

    if (!questionnaire) {
      return res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
    }

    await prisma.questionnaire.delete({ where: { patientId } });

    res.status(200).json({
      success: true,
      message: "Questionnaire deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting questionnaire:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete questionnaire",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
