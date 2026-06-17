import { Request, Response } from "express";
import { InventoryItem, ApiResponse } from "../types/inventory";
import { notifyAdmin } from "../utils/notifications";
import { prisma } from "../lib/prisma";
import { createFinanceHistoryLog, getFinanceHistoryActor } from "../utils/financeHistoryLogs";

const LOW_STOCK_THRESHOLD = 5;

const toInventoryItem = (item: unknown): InventoryItem => item as InventoryItem;
type IdParams = { id: string };

export const createInventoryItem = async (
  req: Request,
  res: Response<ApiResponse<InventoryItem>>
) => {
  try {
    const itemData: InventoryItem = req.body;

    if (
      !itemData.item ||
      itemData.quantity === undefined ||
      Number(itemData.quantity) < 0 ||
      !itemData.unit ||
      itemData.costPerUnit === undefined ||
      Number(itemData.costPerUnit) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: item, quantity, unit, costPerUnit",
      });
    }

    const actor = getFinanceHistoryActor(req);
    const newItem = toInventoryItem(
      await prisma.$transaction(async (tx) => {
        const createdItem = await tx.inventoryItem.create({
          data: {
            id: `inv_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            item: itemData.item,
            quantity: Number(itemData.quantity),
            unit: itemData.unit,
            costPerUnit: Number(itemData.costPerUnit),
            totalValue: Number(itemData.totalValue ?? Number(itemData.quantity) * Number(itemData.costPerUnit)),
            supplier: itemData.supplier || "",
            lastOrdered: itemData.lastOrdered || "",
            createdAt: new Date(),
            updatedAt: new Date(),
            deleted: false,
          },
        });

        await createFinanceHistoryLog(tx, {
          entityType: "inventory",
          entityId: createdItem.id,
          action: "create",
          previousState: {},
          newState: createdItem,
          quantityChange: Number(createdItem.quantity) || 0,
          ...actor,
        });

        return createdItem;
      })
    );

    if (newItem.quantity <= LOW_STOCK_THRESHOLD) {
      await notifyAdmin(
        "Low Stock Alert",
        `Item "${newItem.item}" is low on stock (${newItem.quantity} ${newItem.unit} remaining).`,
        "system"
      );
    }

    res.status(201).json({
      success: true,
      message: "Inventory item added successfully",
      data: newItem,
    });
  } catch (error) {
    console.error("[INVENTORY CREATE] ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Error adding inventory item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllInventoryItems = async (
  req: Request,
  res: Response<ApiResponse<InventoryItem[]>>
) => {
  try {
    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);

    const [total, items] = await Promise.all([
      prisma.inventoryItem.count({ where: { deleted: false } }),
      prisma.inventoryItem.findMany({
        where: { deleted: false },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { item: "asc" },
      }),
    ]);

    res.json({
      success: true,
      message: "Inventory items retrieved successfully",
      data: items as unknown as InventoryItem[],
      meta: { total, page: pageNum, limit: limitNum, totalPages: Math.max(1, Math.ceil(total / limitNum)) },
    });
  } catch (error) {
    console.error("[INVENTORY GET_ALL] Error fetching inventory items:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching inventory items",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getInventoryItemById = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<InventoryItem | null>>
) => {
  try {
    const item = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!item || item.deleted) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    res.json({
      success: true,
      message: "Inventory item retrieved successfully",
      data: toInventoryItem(item),
    });
  } catch (error) {
    console.error("[INVENTORY GET_BY_ID] Error fetching inventory item:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching inventory item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateInventoryItem = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<InventoryItem | null>>
) => {
  try {
    const current = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!current || current.deleted) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    const updates = req.body;
    const actor = getFinanceHistoryActor(req);
    const updatedItem = toInventoryItem(
      await prisma.$transaction(async (tx) => {
        const savedItem = await tx.inventoryItem.update({
          where: { id: req.params.id },
          data: {
            ...(updates.item !== undefined && { item: updates.item }),
            ...(updates.quantity !== undefined && { quantity: Number(updates.quantity) }),
            ...(updates.unit !== undefined && { unit: updates.unit }),
            ...(updates.costPerUnit !== undefined && { costPerUnit: Number(updates.costPerUnit) }),
            ...(updates.totalValue !== undefined && { totalValue: Number(updates.totalValue) }),
            ...(updates.supplier !== undefined && { supplier: updates.supplier }),
            ...(updates.lastOrdered !== undefined && { lastOrdered: updates.lastOrdered }),
            updatedAt: new Date(),
          },
        });

        await createFinanceHistoryLog(tx, {
          entityType: "inventory",
          entityId: req.params.id,
          action: "update",
          previousState: current,
          newState: savedItem,
          quantityChange: (Number(savedItem.quantity) || 0) - (Number(current.quantity) || 0),
          ...actor,
        });

        return savedItem;
      })
    );

    if (updatedItem.quantity <= LOW_STOCK_THRESHOLD) {
      await notifyAdmin(
        "Low Stock Alert",
        `Item "${updatedItem.item}" is low on stock (${updatedItem.quantity} ${updatedItem.unit} remaining).`,
        "system"
      );
    }

    res.json({
      success: true,
      message: "Inventory item updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    console.error("[INVENTORY UPDATE] Error updating inventory item:", error);
    res.status(500).json({
      success: false,
      message: "Error updating inventory item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteInventoryItem = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<null>>
) => {
  try {
    const current = await prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
    if (!current || current.deleted) {
      return res.status(404).json({ success: false, message: "Inventory item not found" });
    }

    const actor = getFinanceHistoryActor(req);
    await prisma.$transaction(async (tx) => {
      const deletedItem = await tx.inventoryItem.update({
        where: { id: req.params.id },
        data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() },
      });

      await createFinanceHistoryLog(tx, {
        entityType: "inventory",
        entityId: req.params.id,
        action: "delete",
        previousState: current,
        newState: deletedItem,
        quantityChange: -(Number(current.quantity) || 0),
        ...actor,
      });
    });

    res.json({ success: true, message: "Inventory item soft-deleted successfully" });
  } catch (error) {
    console.error("[INVENTORY DELETE] Error deleting inventory item:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting inventory item",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
