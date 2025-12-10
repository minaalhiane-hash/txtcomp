export type QuestionType = 'LITERAL' | 'INFERENTIAL' | 'EVALUATIVE';

export interface GlossaryItem {
  word: string;
  definition: string;
}

export interface Question {
  id: number;
  text: string;
  type: QuestionType;
}

export interface StoryData {
  title: string;
  content: string; // Transcribed text for AI context
  imageUrl?: string; // The uploaded image
  glossary: GlossaryItem[];
  questions: Question[];
}

export interface EvaluationResult {
  isCorrect: boolean;
  isIncomplete: boolean;
  feedback: string;
  correctAnswer?: string;
}

export interface UserScore {
  literal: number;
  inferential: number;
  evaluative: number;
  total: number;
}

export interface UserInfo {
  firstName: string;
  lastName: string;
}

export type AppState = 'LOGIN' | 'SETUP' | 'LOADING_STORY' | 'READING' | 'QUIZ' | 'RESULTS';