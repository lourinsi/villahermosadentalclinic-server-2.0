import { Request, Response } from "express";
import { ApiResponse } from "../types/patient";
import { STATUS_DESCRIPTIONS, getStatusOptions, getAppointmentStatusesFromJSON } from "../constants/appointmentStatuses";

export const getAppointmentStatuses = (
  req: Request,
  res: Response<ApiResponse<any>>
) => {
  try {
    // Return the full status list from JSON with all details (key, label, description)
    const statuses = getAppointmentStatusesFromJSON();
    
    res.status(200).json({
      success: true,
      message: "Appointment statuses retrieved successfully",
      data: statuses,
    });
  } catch (error) {
    console.error("[GET APPOINTMENT STATUSES] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment statuses",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getStatusDescription = (
  req: Request,
  res: Response<ApiResponse<string>>
) => {
  try {
    const { status } = req.params;
    const description = STATUS_DESCRIPTIONS[status as string];
    
    if (!description) {
      return res.status(404).json({
        success: false,
        message: "Status not found",
      });
    }

    res.status(200).json({
      success: true,
      data: description,
      message: "Status description retrieved successfully",
    });
  } catch (error) {
    console.error("[GET STATUS DESCRIPTION] Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch status description",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};