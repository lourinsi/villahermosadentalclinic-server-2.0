import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware";
import {
  createServiceCatalogItem,
  getServiceCatalog,
  updateServiceCatalogItem,
} from "../utils/serviceCatalog";

const router = Router();

/**
 * GET /api/appointment-types
 * Returns all available appointment types with pricing and duration
 */
router.get("/", (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: getServiceCatalog(req.query.includeInactive === "true"),
      message: "Appointment types retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching appointment types:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointment types",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post(
  "/",
  requireAuth,
  requireRole(["admin", "doctor", "receptionist"]),
  async (req: Request, res: Response) => {
    try {
      const created = await createServiceCatalogItem(req.body || {});
      res.status(201).json({
        success: true,
        data: created,
        message: "Service created successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create service";
      const status = /required|already exists/i.test(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
);

router.put(
  "/:id",
  requireAuth,
  requireRole(["admin", "doctor", "receptionist"]),
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id < 0) {
        return res.status(400).json({ success: false, message: "Invalid service id" });
      }

      const updated = await updateServiceCatalogItem(id, req.body || {});
      res.json({
        success: true,
        data: updated,
        message: "Service updated successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update service";
      const status = /not found/i.test(message) ? 404 : /required|already exists/i.test(message) ? 400 : 500;
      res.status(status).json({ success: false, message });
    }
  }
);

export default router;
