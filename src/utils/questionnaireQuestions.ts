import fs from "fs";
import path from "path";

export type QuestionnaireQuestion = {
  id: string;
  text: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const QUESTIONS_FILE = path.join(DATA_DIR, "questionnaire-questions.json");

const normalizeText = (value: unknown) =>
  String(value || "").trim().replace(/\s+/g, " ");

const normalizeQuestion = (question: Partial<QuestionnaireQuestion>, fallbackId: string): QuestionnaireQuestion => {
  const text = normalizeText(question.text);

  return {
    id: normalizeText(question.id) || fallbackId,
    text,
    isActive: question.isActive !== false,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
  };
};

const readQuestionsFromDisk = (): QuestionnaireQuestion[] => {
  try {
    if (!fs.existsSync(QUESTIONS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(QUESTIONS_FILE, "utf8"));
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    return parsed
      .map((question, index) => normalizeQuestion(question, `question_${index}`))
      .filter((question) => {
        if (!question.id || !question.text || seen.has(question.id)) return false;
        seen.add(question.id);
        return true;
      });
  } catch (error) {
    console.warn("[QUESTIONNAIRE QUESTIONS] Failed to read questions:", error);
    return [];
  }
};

let questionCache = readQuestionsFromDisk();

const persistQuestions = async () => {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(QUESTIONS_FILE, JSON.stringify(questionCache, null, 2), "utf8");
};

const createQuestionId = () => `question_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

export const getQuestionnaireQuestions = (includeInactive = false) =>
  questionCache
    .filter((question) => includeInactive || question.isActive)
    .map((question) => ({ ...question }));

export const createQuestionnaireQuestion = async (input: Partial<QuestionnaireQuestion>) => {
  const text = normalizeText(input.text);
  if (!text) throw new Error("Question text is required");

  const duplicate = questionCache.find((question) => question.text.toLowerCase() === text.toLowerCase());
  if (duplicate) throw new Error("A question with this text already exists");

  const now = new Date().toISOString();
  const question = normalizeQuestion(
    {
      ...input,
      id: createQuestionId(),
      text,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    createQuestionId()
  );

  questionCache = [...questionCache, question];
  await persistQuestions();
  return { ...question };
};

export const updateQuestionnaireQuestion = async (
  id: string,
  input: Partial<QuestionnaireQuestion>
) => {
  const index = questionCache.findIndex((question) => question.id === id);
  if (index < 0) throw new Error("Question not found");

  const text = normalizeText(input.text || questionCache[index].text);
  if (!text) throw new Error("Question text is required");

  const duplicate = questionCache.find(
    (question) => question.id !== id && question.text.toLowerCase() === text.toLowerCase()
  );
  if (duplicate) throw new Error("A question with this text already exists");

  const updated = normalizeQuestion(
    {
      ...questionCache[index],
      ...input,
      id,
      text,
      updatedAt: new Date().toISOString(),
    },
    id
  );

  questionCache = [
    ...questionCache.slice(0, index),
    updated,
    ...questionCache.slice(index + 1),
  ];
  await persistQuestions();
  return { ...updated };
};

export const deleteQuestionnaireQuestion = async (id: string) => {
  const index = questionCache.findIndex((question) => question.id === id);
  if (index < 0) throw new Error("Question not found");

  const [deleted] = questionCache.splice(index, 1);
  await persistQuestions();
  return { ...deleted };
};
