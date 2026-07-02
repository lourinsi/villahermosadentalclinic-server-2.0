import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware";
import {
  createQuestionnaireQuestion,
  deleteQuestionnaireQuestion,
  getQuestionnaireQuestions,
  updateQuestionnaireQuestion,
} from "../utils/questionnaireQuestions";

const router = Router();

router.get("/", requireAuth, (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: getQuestionnaireQuestions(req.query.includeInactive === "true"),
      message: "Questionnaire questions retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load questionnaire questions",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/", requireAuth, requireRole(["admin", "receptionist"]), async (req: Request, res: Response) => {
  try {
    const question = await createQuestionnaireQuestion(req.body || {});
    res.status(201).json({
      success: true,
      data: question,
      message: "Question created successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create question";
    const status = /required|already exists/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, message });
  }
});

router.put("/:id", requireAuth, requireRole(["admin", "receptionist"]), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const question = await updateQuestionnaireQuestion(req.params.id, req.body || {});
    res.json({
      success: true,
      data: question,
      message: "Question updated successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update question";
    const status = /not found/i.test(message) ? 404 : /required|already exists/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, message });
  }
});

router.delete("/:id", requireAuth, requireRole(["admin", "receptionist"]), async (req: Request<{ id: string }>, res: Response) => {
  try {
    const question = await deleteQuestionnaireQuestion(req.params.id);
    res.json({
      success: true,
      data: question,
      message: "Question deleted successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete question";
    const status = /not found/i.test(message) ? 404 : 500;
    res.status(status).json({ success: false, message });
  }
});

export default router;
