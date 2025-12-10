import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { StoryData, EvaluationResult, Question, UserScore } from "../types";

const getAI = () =>
  new GoogleGenAI({
    apiKey: import.meta.env.VITE_GEMINI_API_KEY,
  });


// Schema for generating the story and questions
const storySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "The title extracted from the text or a suitable title",
    },
    content: {
      type: Type.STRING,
      description: "The full transcription of the text in the image",
    },
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
          text: {
            type: Type.STRING,
            description: "The question text in French",
          },
          type: {
            type: Type.STRING,
            enum: ["LITERAL", "INFERENTIAL", "EVALUATIVE"],
          },
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

  // 1️⃣ Nettoyer le base64 si c'est une data URL complète
  //    Exemple: "data:image/png;base64,AAAA..."
  const cleanBase64 = base64Image.includes(",")
    ? base64Image.split(",")[1]
    : base64Image;

  const prompt = `
Tu vois une image contenant un texte narratif en français.
Lis UNIQUEMENT le texte présent dans l'image et NE PAS inventer d'histoire.
À partir de CE TEXTE :

1. Transcris le texte complet (champ "content").
2. Extrais ou génère un titre.
3. Génère exactement 10 questions de compréhension basées sur ce texte :
   - 4 questions littérales (LITERAL) -> repérage des informations explicites
   - 4 questions inférentielles (INFERENTIAL) -> déductions implicites
   - 2 questions évaluatives (EVALUATIVE) -> opinion et interprétation
4. Crée un glossaire de 3 à 6 mots difficiles du texte avec des définitions simples.

Le tout doit être adapté au niveau 5e année primaire.
Réponds STRICTEMENT en JSON conforme au schéma fourni (title, content, questions, glossary).
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash", // ou "gemini-1.5-flash" si c'est celui que tu utilises
    contents: [
      {
        role: "user",
        parts: [
          // 🔹 1. Le prompt texte
          { text: prompt },
          // 🔹 2. L'image en base64 pour que Gemini lise VRAIMENT le texte
          {
            inlineData: {
              mimeType: "image/png", // change en "image/jpeg" si tes images sont en jpeg
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

  const raw = (response as any).text ?? "{}";

  let data: StoryData;
  try {
    data = JSON.parse(raw) as StoryData;
  } catch (err) {
    console.error("Erreur lors du parsing de la réponse Gemini :", err, raw);
    throw err;
  }

  return data;
};

export const generateSpeech = async (text: string): Promise<string> => {
  console.warn("generateSpeech n'est pas encore réellement implémentée.");
  return "";
};
// Fonction d'évaluation d'une réponse d'élève
export const evaluateAnswer = async (
  ...args: any[]
): Promise<EvaluationResult> => {
  const [question, studentAnswer, story] = args as [Question, string, StoryData];

  const ai = getAI();

  const prompt = `
Tu es un correcteur bienveillant pour un élève marocain de 5e année primaire.
Tu reçois :
- Un TEXTE
- Une QUESTION de compréhension
- La RÉPONSE de l'élève

Tâches :
1️⃣ Évalue si la réponse est correcte, partiellement correcte ou incorrecte.
2️⃣ Donne un score parmi :
   - 0 = incorrect ou hors sujet
   - 1 = partiellement correct / incomplet
   - 2 = correct
3️⃣ Donne un feedback COURT et positif (1 à 2 phrases), adapté à un élève.
4️⃣ Donne la RÉPONSE CORRECTE idéale à la question, sous forme d'une phrase simple.

RÈGLES IMPORTANTES :
- Tu as TOUJOURS assez d'informations pour évaluer.
- NE DIS JAMAIS que tu ne peux pas évaluer.
- NE DEMANDE JAMAIS à l'élève de te redonner le texte, la question ou la réponse.
- NE POSE AUCUNE QUESTION à l'élève.
- Réponds uniquement avec ton évaluation.

Format de réponse STRICT (JSON) :
{
  "isCorrect": true/false,
  "score": 0/1/2,
  "feedback": "phrase simple et amicale",
  "correctAnswer": "la meilleure réponse possible à la question"
}

TEXTE :
"""${story.content}"""

QUESTION :
"""${question.text}"""

RÉPONSE DE L'ÉLÈVE :
"""${studentAnswer}"""
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    console.log("Réponse Gemini evaluate:", response);

    const raw =
      (response as any).output_text ??
      (response as any).candidates?.[0]?.content?.parts?.[0]?.text ??
      "{}";

    let result: EvaluationResult;

    try {
      // On parse le JSON renvoyé par Gemini
      const parsed = JSON.parse(raw) as any;

      // On force des valeurs par défaut au cas où
      result = {
        isCorrect: !!parsed.isCorrect,
        score:
          typeof parsed.score === "number"
            ? parsed.score
            : 0,
        feedback:
          typeof parsed.feedback === "string"
            ? parsed.feedback
            : "Lis bien le texte avant de répondre 😊",
        // Champ supplémentaire pour afficher la bonne réponse après le 2ᵉ essai
        // (même s'il n'existe pas dans le type, il sera quand même présent dans l'objet)
        correctAnswer:
          typeof parsed.correctAnswer === "string"
            ? parsed.correctAnswer
            : "",
      } as any as EvaluationResult;
    } catch (err) {
      console.error("Erreur JSON evaluateAnswer:", err, raw);
      result = {
        isCorrect: false,
        score: 0,
        feedback: "Je n'ai pas compris ta réponse, relis bien le texte 😊",
        correctAnswer: "",
      } as any as EvaluationResult;
    }

    return result;
  } catch (err) {
    console.error("Erreur API evaluateAnswer:", err);
    return {
      isCorrect: false,
      score: 0,
      feedback:
        "Une petite erreur est arrivée, essaie encore ou demande l'aide de ton enseignante 😊",
      correctAnswer: "",
    } as any as EvaluationResult;
  }
};

// Génération du feedback final personnalisé pour l'élève
export const generateFinalFeedback = async (
  userScore: UserScore,
  story: StoryData
): Promise<string> => {
  const ai = getAI();

  const prompt = `
Tu es un enseignant qui donne un retour positif à un élève marocain de 5e année primaire.

Voici ses résultats :
- Score littéral : ${userScore.literal}/8
- Score inférentiel : ${userScore.inferential}/8
- Score évaluatif : ${userScore.evaluative}/4

Rédige un message personnalisé de 3 à 4 phrases :
✔ Félicite l'élève
✔ Explique ce qu'il fait bien
✔ Donne 1 ou 2 conseils simples pour progresser
✔ Ton ton doit être motivant, adapté à son âge

Rédige uniquement le texte du message, pas de JSON :

Exemple de style :
"Bravo ! Tu comprends bien ce que tu lis. Continue à bien relire le texte avant de répondre pour mieux repérer les indices cachés."
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    console.log("Réponse Gemini final feedback:", response);

    return (response as any).output_text ??
      (response as any).candidates?.[0]?.content?.parts?.[0]?.text ??
      "Bravo pour ton travail ! Continue à progresser 😊";
  } catch (err) {
    console.error("Erreur API finalFeedback:", err);
    return "Bravo pour ton travail ! Continue à progresser 😊";
  }
};