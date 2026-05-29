import express from "express";
import { login, logout, verifyToken, register } from "../controllers/authController";

const router = express.Router();

// Authentication routes
router.post("/login", login);
router.post("/logout", logout);
router.get("/verify", verifyToken);
router.post("/register", register);

export default router;
