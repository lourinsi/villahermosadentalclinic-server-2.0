import express from "express";
import {
  getNotifications,
  addNotification,
  updateNotification,
  deleteNotification,
  markAllAsRead,
  deleteAllNotifications,
  restoreNotification,
} from "../controllers/notificationController";
import { requireAuth } from "../middleware/authMiddleware";

const router = express.Router();

router.get("/", requireAuth, getNotifications);
router.post("/", requireAuth, addNotification);
router.put("/mark-all-read", requireAuth, markAllAsRead);
router.put("/:id", requireAuth, updateNotification);
router.put("/:id/restore", requireAuth, restoreNotification);
router.delete("/:id", requireAuth, deleteNotification);
router.delete("/", requireAuth, deleteAllNotifications);

export default router;
