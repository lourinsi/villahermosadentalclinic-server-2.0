import { Router } from "express";
import { sendMessage } from "../controllers/messageController";

const router = Router();

router.post("/", sendMessage);

export default router;
