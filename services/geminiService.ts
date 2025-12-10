import { GoogleGenAI, Type, Schema } from "@google/genai";
import { StoryData, EvaluationResult, Question, UserScore } from "../types";

const getAI = () =>
  new GoogleGenAI({
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,
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
Tu vois une image contenant un texte narratif en français.

OBJECTIF TRÈS IMPORTANT :
- Le champ "content" doit contenir TOUT le texte présent dans l'image.
- "content" ne doit JAMAIS être vide.
- Tu dois transcrire fidèlement le texte, sans inventer, sans résumer.

Ensuite :
- Génère un titre adapté au texte.
- Génère exactement 10 questions de compréhension :
  - 4 questions littérales (LITERAL)
  - 4 questions inférentielles (INFERENTIAL)
  - 2 questions évaluatives (EVALUATIVE)
- Crée un glossaire de 3 à 6 mots difficiles du texte avec des définitions simples.

CONTRAINTES :
- Tu ne dois jamais répondre que tu ne peux pas le faire.
- Tu dois toujours renvoyer un JSON complet conforme au schéma (title, content, glossary, questions).
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

  const data = JSON.parse(raw) as StoryData;

  // Petit garde-fou : si jamais content est vide, on met une chaîne explicite
  if (!data.content || !data.content.trim()) {
    data.content =
      "[ERREUR] Le texte n'a pas été correctement extrait de l'image.";
  }

  return data;
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
Tu es un correcteur bienveillant pour un élève marocain de 5e année primaire.

Tu reçois :
- un TEXTE (toujours fourni),
- une QUESTION de compréhension (toujours fournie),
- la RÉPONSE de l'élève.

Évalue cette réponse selon :
0 = incorrect
1 = partiellement correct
2 = correct

Toujours répondre en JSON strict :
{
  "isCorrect": true/false,
  "score": 0/1/2,
  "feedback": "message court et positif pour l'élève",
  "correctAnswer": "la meilleure réponse possible à la question"
}

CONTRAINTES IMPORTANTES :
- Considère que le texte et la question sont TOUJOURS fournis.
- Ne dis JAMAIS que tu ne peux pas répondre ou évaluer.
- Ne dis JAMAIS que le texte ou la question ne sont pas fournis.
- "correctAnswer" doit être une réponse modèle à la QUESTION, basée sur le TEXTE.
- Le feedback doit être encourageant, adapté à un élève de 5e année primaire.

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
    const parsed = JSON.parse(raw) as any;

    let feedback: string =
      typeof parsed.feedback === "string"
        ? parsed.feedback
        : "Relis bien le texte et essaie d'expliquer avec tes propres mots 😊";

    let correctAnswer: string =
      typeof parsed.correctAnswer === "string" ? parsed.correctAnswer.trim() : "";

    // 🧽 Nettoyage : si le modèle répond encore "je ne peux pas répondre..."
    const lower = correctAnswer.toLowerCase();
    if (
      lower.includes("je ne peux pas répondre") ||
      (lower.includes("texte") &&
        lower.includes("question") &&
        (lower.includes("pas fournis") || lower.includes("non fournis")))
    ) {
      // On vide la réponse attendue pour ne pas afficher ce message à l'élève
      correctAnswer = "";
      // Et on remplace le feedback si besoin
      if (!parsed.feedback) {
        feedback =
          "Réfléchis bien à ce que dit le texte et essaie de répondre de façon plus précise 😊";
      }
    }

    const result: EvaluationResult = {
      isCorrect: !!parsed.isCorrect,
      score:
        typeof parsed.score === "number" && parsed.score >= 0 && parsed.score <= 2
          ? parsed.score
          : 0,
      feedback,
      correctAnswer,
    };

    return result;
  } catch (err) {
    console.error("Erreur JSON evaluateAnswer:", err, raw);
    return {
      isCorrect: false,
      score: 0,
      feedback:
        "Je n'ai pas pu corriger ta réponse à cause d'un petit problème technique. Réessaie dans un instant 😊",
      correctAnswer: "",
    };
  }
};

/**
 * 👉 Synthèse vocale locale (API navigateur)
 */
export const generateSpeech = async (text: string): Promise<string> => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Synthèse vocale non supportée.");
    return "";
  }

  if (!text || !text.trim()) {
    console.warn("Texte vide pour la synthèse vocale.");
    return "";
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "fr-FR";
  utterance.rate = 1;
  utterance.pitch = 1;

  window.speechSynthesis.speak(utterance);

  // Pas d'URL à renvoyer, on retourne une chaîne vide
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
- Donne 1–2 conseils simples pour progresser
- Garde un ton très motivant et bienveillant.

Réponds uniquement avec le texte du message (pas de JSON).
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  return extractTextFromResponse(response);
};
