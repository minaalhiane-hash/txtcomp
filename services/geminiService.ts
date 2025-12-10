import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StoryData, EvaluationResult, Question, UserScore } from "../types";

const getAI = () =>
  new GoogleGenAI({
    apiKey:
      (import.meta as any).env?.VITE_GEMINI_API_KEY ||
      "AIzaSyD0GEmyC1TqMPeckyw2wDpLkNfleh_SQoA",
  });


/**
 * Fonction utilitaire pour extraire le texte JSON renvoyé par Gemini
 */
const extractTextFromResponse = (response: any): string => {
  if (!response) return "{}";
  if (typeof response.output_text === "string") return response.output_text;
  if (response.response?.text) return response.response.text();
  if (response.candidates?.[0]?.content?.parts?.[0]?.text)
    return response.candidates[0].content.parts[0].text;
  return "{}";
};

// Schéma JSON pour la génération du texte scanné + questions
const storySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    content: { type: Type.STRING },
    glossary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          definition: { type: Type.STRING },
        },
        required: ["word", "definition"],
      },
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          text: { type: Type.STRING },
          type: { type: Type.STRING },
        },
        required: ["id", "text", "type"],
      },
    },
  },
  required: ["title", "content", "glossary", "questions"],
};

export const generateAssessment = async (
  base64Image: string
): Promise<StoryData> => {
  const ai = getAI();

  const cleanBase64 = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  const prompt = `
Lis UNIQUEMENT le texte dans l'image.
- Transcris tout le texte (content)
- Génère un titre
- Génère 10 questions (4 LITERAL / 4 INFERENTIAL / 2 EVALUATIVE)
- Glossaire de 3 à 6 mots difficiles
Réponds STRICTEMENT en JSON.
`;

const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: [
    {
      role: "user",
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: "image/png",
            data: cleanBase64,
          },
        },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
    responseSchema: storySchema,
  },
});


  const raw = extractTextFromResponse(response);
  return JSON.parse(raw);
};

/**
 * 👉 Fonction d’évaluation d’une réponse d’élève
 *    Utilisée avec : evaluateAnswer(question, studentAnswer, storyData)
 */
export const evaluateAnswer = async (
  question: Question,
  studentAnswer: string,
  story: StoryData
): Promise<EvaluationResult> => {
  const ai = getAI();

  const prompt = `
Tu es un correcteur bienveillant pour un élève de 5e primaire.

Évalue cette réponse selon :
0 = incorrect
1 = partiellement correct
2 = correct

Toujours répondre en JSON strict :
{
  "isCorrect": true/false,
  "score": 0/1/2,
  "feedback": "message court et positif",
  "correctAnswer": "réponse idéale"
}

TEXTE :
"""${story.content}"""

QUESTION :
"""${question.text}"""

RÉPONSE DE L'ÉLÈVE :
"""${studentAnswer}"""
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { responseMimeType: "application/json" },
  });

  const raw = extractTextFromResponse(response);

  try {
    return JSON.parse(raw) as EvaluationResult;
  } catch {
    return {
      isCorrect: false,
      score: 0,
      feedback: "Je n'ai pas compris ta réponse, essaie encore 😊",
      correctAnswer: "",
    };
  }
};

/**
 * 👉 Stub pour garder la compatibilité avec ton front
 *    (au cas où tu imports generateSpeech, même si ce n'est pas encore implémenté)
 */
export const generateSpeech = async (text: string): Promise<string> => {
  console.warn("generateSpeech n'est pas encore implémentée.");
  // Pour l’instant on renvoie une string vide ou un pseudo-URL
  return "";
};

// Feedback final pour l'élève
export const generateFinalFeedback = async (
  userScore: UserScore
): Promise<string> => {
  const ai = getAI();

  const prompt = `
Tu es un enseignant qui donne un retour positif à un élève marocain de 5e année primaire.

Résultats :
- Littéral : ${userScore.literal}/8
- Inférentiel : ${userScore.inferential}/8
- Évaluatif : ${userScore.evaluative}/4

Rédige 3–4 phrases :
- Félicite l'élève
- Explique ce qu'il a bien fait
- Donne 1–2 conseils simples
Sans JSON, juste le texte du message.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return extractTextFromResponse(response);
};
