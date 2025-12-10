import React, { useState } from 'react';
import { Send, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { Question, EvaluationResult, StoryData } from '../types';
import { evaluateAnswer } from '../services/geminiService';
import { Button } from './Button';

// Question Status
type QuestionStatus = 'IDLE' | 'CORRECT' | 'INCORRECT_RETRY' | 'FAILED_FINAL';

interface SingleQuestionProps {
  question: Question;
  answer: string;
  status: QuestionStatus;
  feedback: EvaluationResult | null;
  onAnswerChange: (val: string) => void;
}

const SingleQuestion: React.FC<SingleQuestionProps> = ({ 
    question, 
    answer, 
    status, 
    feedback, 
    onAnswerChange 
}) => {
  const getTypeLabel = (type: string) => {
    switch(type) {
      case 'LITERAL': return { label: 'Repérage', color: 'text-blue-600 bg-blue-100' };
      case 'INFERENTIAL': return { label: 'Déduction', color: 'text-purple-600 bg-purple-100' };
      case 'EVALUATIVE': return { label: 'Opinion', color: 'text-orange-600 bg-orange-100' };
      default: return { label: 'Question', color: 'text-gray-600 bg-gray-100' };
    }
  };

  const typeInfo = getTypeLabel(question.type);
  
  // Input is disabled if Correct or Final Fail
  const isInputDisabled = status === 'CORRECT' || status === 'FAILED_FINAL';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6 transition-all duration-300 hover:shadow-md">
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`shrink-0 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide ${typeInfo.color} mt-1`}>
            {typeInfo.label}
          </div>
          <div className="flex-1">
             <h3 className="text-lg font-bold text-slate-800 font-comic mb-4">{question.text}</h3>
             
             {/* Input Area */}
             <div className="relative">
                <textarea
                    value={answer}
                    onChange={(e) => onAnswerChange(e.target.value)}
                    disabled={isInputDisabled}
                    placeholder="Écris ta réponse ici..."
                    className={`w-full p-3 text-base rounded-lg border-2 transition-all resize-none outline-none h-24
                        ${status === 'CORRECT' ? 'border-emerald-200 bg-emerald-50/30' : 
                          status === 'FAILED_FINAL' ? 'border-red-200 bg-red-50/30' :
                          status === 'INCORRECT_RETRY' ? 'border-yellow-300 focus:border-yellow-400 bg-yellow-50/10' :
                          'border-slate-200 focus:border-indigo-500'}
                    `}
                />
                
                {/* Status Icon Overlay */}
                <div className="absolute right-3 top-3">
                   {status === 'CORRECT' && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                   {status === 'FAILED_FINAL' && <XCircle className="w-6 h-6 text-red-500" />}
                   {status === 'INCORRECT_RETRY' && <RotateCcw className="w-5 h-5 text-yellow-500 animate-pulse" />}
                </div>
             </div>

             {/* Feedback Section */}
             {feedback && (
                <div className={`mt-3 p-4 rounded-lg text-sm border animate-in fade-in slide-in-from-top-1 ${
                    status === 'CORRECT' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
                    status === 'INCORRECT_RETRY' ? 'bg-yellow-50 border-yellow-100 text-yellow-800' :
                    status === 'FAILED_FINAL' ? 'bg-red-50 border-red-100 text-red-800' :
                    'bg-slate-50 text-slate-700'
                }`}>
                    <p className="font-bold mb-1">
                        {feedback.isIncomplete ? "Réponse incomplète" :
                         status === 'CORRECT' ? "Excellent !" :
                         status === 'INCORRECT_RETRY' ? "Pas tout à fait..." :
                         "Dommage."}
                    </p>
                    <p>{feedback.feedback}</p>
                    
                    {status === 'FAILED_FINAL' && feedback.correctAnswer && (
                        <div className="mt-2 pt-2 border-t border-red-200/50">
                            <span className="font-bold text-red-900">Réponse attendue : </span>
                            <span className="font-medium">{feedback.correctAnswer}</span>
                        </div>
                    )}
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface QuestionEngineProps {
  storyData: StoryData;
  onComplete: (results: any[]) => void;
}

export const QuestionEngine: React.FC<QuestionEngineProps> = ({ storyData, onComplete }) => {
  // State maps keyed by question ID
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const [statuses, setStatuses] = useState<Map<number, QuestionStatus>>(new Map());
  const [feedbacks, setFeedbacks] = useState<Map<number, EvaluationResult>>(new Map());
  const [attempts, setAttempts] = useState<Map<number, number>>(new Map()); // 0 = start, 1 = retry
  
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Helper to get current state for a question
  const getQuestionState = (id: number) => ({
      answer: answers.get(id) || '',
      status: statuses.get(id) || 'IDLE',
      feedback: feedbacks.get(id) || null,
      attempt: attempts.get(id) || 0
  });

  const handleAnswerChange = (id: number, val: string) => {
      setAnswers(prev => new Map(prev).set(id, val));
  };

  const handleGlobalSubmit = async () => {
      setIsEvaluating(true);
      
      // Identify questions that need evaluation:
      // We evaluate anything that is NOT explicitly finished (CORRECT or FAILED_FINAL).
      // This includes questions the user might have left empty (implied "skip" or "don't know").
      const questionsToEvaluate = storyData.questions.filter(q => {
          const { status } = getQuestionState(q.id);
          return status !== 'CORRECT' && status !== 'FAILED_FINAL';
      });

      if (questionsToEvaluate.length === 0) {
          setIsEvaluating(false);
          // If everything is done, we shouldn't be here, but just in case
          return;
      }

      try {
          // Parallel evaluation
          const results = await Promise.all(questionsToEvaluate.map(async (q) => {
              const { answer, attempt } = getQuestionState(q.id);
              const isRetry = attempt > 0;
              
              // Handle empty answer locally to save AI calls
              if (!answer.trim()) {
                  return {
                      id: q.id,
                      result: {
                          isCorrect: false,
                          isIncomplete: true,
                          feedback: isRetry 
                             ? "Tu n'as pas répondu. Voici la réponse." 
                             : "Tu n'as pas répondu. Essaie d'écrire quelque chose !",
                          correctAnswer: undefined // Will be filled by AI only if we asked for it, or we could ask AI for answer even if empty.
                                                  // For now, let's just mark it. If it's final fail, we might want the answer.
                                                  // Actually, if it's FINAL fail (isRetry=true), we usually want the AI to give the answer.
                                                  // So let's fall through to AI if it's the LAST attempt to ensure we get the correct string.
                      },
                      isRetry
                  };
              }

              const result = await evaluateAnswer(q, answer, storyData);
              return { id: q.id, result, isRetry };
          }));

          // Update states based on results
          const newStatuses = new Map(statuses);
          const newFeedbacks = new Map(feedbacks);
          const newAttempts = new Map(attempts);

          for (const { id, result, isRetry } of results) {
              // If empty answer on last attempt, we might need to fetch the correct answer if not present
              // But evaluateAnswer usually returns it on failure.
              // If we skipped AI for empty answer, let's fix the logic:
              // For empty answer on 2nd attempt, we need the correct answer. 
              // Simplest fix: If empty on 2nd attempt, call AI with empty string to get the correction.
              let finalResult = result;
              
              if (getQuestionState(id).answer.trim() === '' && isRetry && !result.correctAnswer) {
                   // Force AI call to get correct answer for empty final submission
finalResult = await evaluateAnswer(storyData.questions.find(q => q.id === id)!, "", storyData
);
              }

              newFeedbacks.set(id, finalResult);

              if (finalResult.isCorrect) {
                  newStatuses.set(id, 'CORRECT');
              } else {
                  // Incorrect or Incomplete
                  if (!isRetry) {
                      // First fail -> Move to Retry
                      newStatuses.set(id, 'INCORRECT_RETRY');
                      newAttempts.set(id, 1);
                  } else {
                      // Second fail -> Final
                      newStatuses.set(id, 'FAILED_FINAL');
                      newAttempts.set(id, 2);
                  }
              }
          }

          setStatuses(newStatuses);
          setFeedbacks(newFeedbacks);
          setAttempts(newAttempts);

      } catch (error) {
          console.error(error);
          alert("Une erreur est survenue lors de la validation.");
      } finally {
          setIsEvaluating(false);
      }
  };

  // Check if all questions are in a terminal state (CORRECT or FAILED_FINAL)
  const isAllComplete = storyData.questions.every(q => {
      const s = statuses.get(q.id);
      return s === 'CORRECT' || s === 'FAILED_FINAL';
  });

  const finishQuiz = () => {
     // Compile results array expected by App.tsx
     const finalResults = storyData.questions.map(q => {
         const s = statuses.get(q.id);
         const fb = feedbacks.get(q.id);
         const ans = answers.get(q.id);
         return {
             question: q,
             userAnswer: ans,
             isCorrect: s === 'CORRECT',
             feedback: fb?.feedback,
             correctAnswer: fb?.correctAnswer
         };
     });
     onComplete(finalResults);
  };

  const pendingRetryCount = storyData.questions.filter(q => statuses.get(q.id) === 'INCORRECT_RETRY').length;

  return (
    <div className="max-w-3xl mx-auto pb-24">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800 font-comic">Questions de compréhension</h2>
        <p className="text-slate-500">Réponds aux questions puis valide pour vérifier.</p>
      </div>

      <div className="space-y-2">
        {storyData.questions.map((question) => {
            const state = getQuestionState(question.id);
            return (
                <SingleQuestion 
                    key={question.id} 
                    question={question} 
                    answer={state.answer}
                    status={state.status}
                    feedback={state.feedback}
                    onAnswerChange={(val) => handleAnswerChange(question.id, val)}
                />
            );
        })}
      </div>

      <div className="sticky bottom-4 z-20 mt-8 flex justify-center">
        <div className="bg-white/90 backdrop-blur-sm p-4 rounded-2xl shadow-xl border border-indigo-100 w-full max-w-xl transition-all duration-300">
            {isAllComplete ? (
                <Button onClick={finishQuiz} variant="success" className="w-full py-4 text-xl shadow-lg shadow-emerald-200 animate-bounce">
                    Voir mes résultats 🏆
                </Button>
            ) : (
                <Button 
                    onClick={handleGlobalSubmit} 
                    isLoading={isEvaluating}
                    disabled={isEvaluating}
                    variant="primary" 
                    className="w-full py-4 text-lg shadow-lg shadow-indigo-200"
                >
                    <Send className="w-5 h-5 mr-2" />
                    {pendingRetryCount > 0 
                        ? "Valider mes corrections" 
                        : "Valider mes réponses"}
                </Button>
            )}
        </div>
      </div>
    </div>
  );
};
