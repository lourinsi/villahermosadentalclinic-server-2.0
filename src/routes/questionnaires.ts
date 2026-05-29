import express, { Request, Response, NextFunction } from 'express';
import {
  getQuestionnaire,
  upsertQuestionnaire,
  deleteQuestionnaire,
} from '../controllers/questionnaireController';

const router = express.Router();

// Logging middleware for this router
router.use((req: Request, res: Response, next: NextFunction) => {
  console.log('[QUESTIONNAIRE ROUTE] Incoming request:', req.method, req.path, req.params);
  next();
});

// Get questionnaire
router.get('/:patientId', getQuestionnaire);

// Create or update questionnaire
router.put('/:patientId', upsertQuestionnaire);

// Delete questionnaire
router.delete('/:patientId', deleteQuestionnaire);

export default router;
