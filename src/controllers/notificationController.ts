import { Request, Response } from "express";
import { Notification } from "../types/notification";
import { ApiResponse } from "../types/patient";
import { prisma } from "../lib/prisma";
import { updateOrCreateNotificationForAppointment } from "../utils/notifications";

const toNotification = (notification: any): Notification => ({
  ...notification,
  createdAt: notification.createdAt?.toISOString?.() || notification.createdAt || new Date().toISOString(),
  updatedAt: notification.updatedAt?.toISOString?.() || notification.updatedAt || undefined,
  deletedAt: notification.deletedAt?.toISOString?.() || notification.deletedAt || undefined,
  metadata: notification.metadata as Notification["metadata"],
});
type IdParams = { id: string };

export const getNotifications = async (
  req: Request,
  res: Response<ApiResponse<Notification[]>>
) => {
  try {
    const { userId, type, includeDeleted, limit, offset } = req.query as Record<string, string>;
    const shouldIncludeDeleted =
      includeDeleted === "true" || includeDeleted === "True" || includeDeleted === "1";
    const take = limit
      ? Math.max(1, Math.min(100, parseInt(limit, 10) || 20))
      : undefined;
    const skip = Math.max(0, parseInt(offset || "0", 10) || 0);

    const where = {
      ...(shouldIncludeDeleted ? {} : { deleted: false }),
      ...(userId ? { userId } : {}),
      ...(type ? { type } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        ...(take ? { take, skip } : {}),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          ...(userId ? { userId } : {}),
          ...(type ? { type } : {}),
          deleted: false,
          isRead: false,
        },
      }),
    ]);

    const returnedCount = notifications.length;

    res.json({
      success: true,
      message: "Notifications retrieved successfully",
      meta: {
        limit: take ?? null,
        offset: skip,
        total,
        unreadCount,
        hasMore: Boolean(take && skip + returnedCount < total),
      },
      data: notifications.map(toNotification),
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const addNotification = async (
  req: Request,
  res: Response<ApiResponse<Notification>>
) => {
  try {
    const notificationData: Notification = req.body;

    if (
      !notificationData.userId ||
      !notificationData.title ||
      !notificationData.message ||
      !notificationData.type
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: userId, title, message, and type are required",
      });
    }

    if (notificationData.type === "appointment" && notificationData.metadata?.appointmentId) {
      const processed = await updateOrCreateNotificationForAppointment(
        notificationData.userId,
        notificationData.metadata.appointmentId,
        {
          title: notificationData.title,
          message: notificationData.message,
          type: notificationData.type,
          metadata: notificationData.metadata,
        }
      );

      return res.status(201).json({
        success: true,
        message: "Notification processed successfully",
        data: processed,
      });
    }

    const newNotification = await prisma.notification.create({
      data: {
        id: `notification_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        userId: notificationData.userId,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type,
        metadata: notificationData.metadata as any,
        createdAt: notificationData.createdAt ? new Date(notificationData.createdAt) : new Date(),
        updatedAt: notificationData.updatedAt ? new Date(notificationData.updatedAt) : new Date(),
        isRead: notificationData.isRead || false,
        deleted: false,
        isLog: notificationData.isLog || false,
      },
    });

    res.status(201).json({
      success: true,
      message: "Notification added successfully",
      data: toNotification(newNotification),
    });
  } catch (error) {
    console.error("Error adding notification:", error);
    res.status(500).json({
      success: false,
      message: "Error adding notification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateNotification = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<Notification>>
) => {
  try {
    const { id } = req.params;
    const existing = await prisma.notification.findUnique({ where: { id } });

    if (!existing) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    const updates = req.body;
    const isOnlyMarkingRead = Object.keys(updates).length === 1 && updates.isRead !== undefined;

    const updated = await prisma.notification.update({
      where: { id },
      data: {
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.message !== undefined && { message: updates.message }),
        ...(updates.type !== undefined && { type: updates.type }),
        ...(updates.metadata !== undefined && { metadata: updates.metadata }),
        isRead: isOnlyMarkingRead ? updates.isRead : false,
        updatedAt: isOnlyMarkingRead ? existing.updatedAt || existing.createdAt : new Date(),
      },
    });

    res.json({
      success: true,
      message: "Notification updated successfully",
      data: toNotification(updated),
    });
  } catch (error) {
    console.error("Error updating notification:", error);
    res.status(500).json({
      success: false,
      message: "Error updating notification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteNotification = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<null>>
) => {
  try {
    const { id } = req.params;
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() },
    });

    res.json({ success: true, message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting notification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const markAllAsRead = async (
  req: Request,
  res: Response<ApiResponse<null>>
) => {
  try {
    const { userId } = req.query as Record<string, string>;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    await prisma.notification.updateMany({
      where: { userId, isRead: false, deleted: false },
      data: { isRead: true },
    });

    res.json({ success: true, message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all as read:", error);
    res.status(500).json({
      success: false,
      message: "Error marking all as read",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteAllNotifications = async (
  req: Request,
  res: Response<ApiResponse<null>>
) => {
  try {
    const { userId } = req.query as Record<string, string>;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    await prisma.notification.updateMany({
      where: { userId, deleted: false },
      data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() },
    });

    res.json({ success: true, message: "All notifications cleared" });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    res.status(500).json({
      success: false,
      message: "Error clearing notifications",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const restoreNotification = async (
  req: Request<IdParams>,
  res: Response<ApiResponse<Notification>>
) => {
  try {
    const { id } = req.params;
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }
    if (!existing.deleted) {
      return res.status(400).json({ success: false, message: "Notification is not deleted" });
    }

    const restored = await prisma.notification.update({
      where: { id },
      data: { deleted: false, deletedAt: null, updatedAt: new Date() },
    });

    res.json({
      success: true,
      message: "Notification restored successfully",
      data: toNotification(restored),
    });
  } catch (error) {
    console.error("Error restoring notification:", error);
    res.status(500).json({
      success: false,
      message: "Error restoring notification",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
