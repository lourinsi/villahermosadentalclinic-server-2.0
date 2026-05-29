import { Request, Response } from "express";
import { PaymentMethod, ApiResponse } from "../types/paymentMethod";
import { prisma } from "../lib/prisma";

export const getPaymentMethods = async (
  req: Request,
  res: Response<ApiResponse<PaymentMethod[]>>
) => {
  try {
    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ success: true, data: paymentMethods as unknown as PaymentMethod[] });
  } catch (error) {
    console.error("[GET PAYMENT METHODS] Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payment methods",
      error: error instanceof Error ? error.message : error,
    });
  }
};

export const createPaymentMethod = async (
  req: Request,
  res: Response<ApiResponse<PaymentMethod>>
) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "Name is required" });
    }

    const existing = await prisma.paymentMethod.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Payment method already exists",
      });
    }

    const newPaymentMethod = await prisma.paymentMethod.create({
      data: {
        id: `pm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name,
        description: description || "",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    res.status(201).json({
      success: true,
      message: "Payment method created",
      data: newPaymentMethod as unknown as PaymentMethod,
    });
  } catch (error) {
    console.error("[CREATE PAYMENT METHOD] Error:", error);
    res.status(500).json({
      success: false,
      message: "Error creating payment method",
      error: error instanceof Error ? error.message : error,
    });
  }
};
