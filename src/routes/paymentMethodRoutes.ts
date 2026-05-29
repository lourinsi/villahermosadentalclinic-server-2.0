import { Router } from "express";
import { getPaymentMethods, createPaymentMethod } from "../controllers/paymentMethodController";
import { requireAuth } from "../middleware/authMiddleware";

const router = Router();

// Apply requireAuth to all payment method routes
router.use(requireAuth);

router.get("/", getPaymentMethods);
router.post("/", createPaymentMethod);

export default router;
