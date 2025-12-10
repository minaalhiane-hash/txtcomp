import React, { useState, useRef } from 'react';
import { Compass, BookOpen, Trophy, Play, Upload, Image as ImageIcon, UserCircle, Download, LogOut } from 'lucide-react';
import { generateAssessment, generateFinalFeedback } from './services/geminiService';
import { StoryData, AppState, UserScore, UserInfo } from './types';
import { Button } from './components/Button';
import { StoryCard } from './components/StoryCard';
import { QuestionEngine } from './components/QuestionEngine';

const App = () => {
  const [appState, setAppState] = useState<AppState>('LOGIN');
  const [userInfo, setUserInfo] = useState<UserInfo>({ firstName: '', lastName: '' });
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [finalFeedback, setFinalFeedback] = useState<string>('');
  const [finalScores, setFinalScores] = useState<UserScore>({ literal: 0, inferential: 0, evaluative: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (userInfo.firstName.trim() && userInfo.lastName.trim()) {
          setAppState('SETUP');
      }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert("Veuillez sélectionner une image.");
        return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
        const base64String = reader.result as string;
        // Remove data URL prefix for API
        const base64Data = base64String.split(',')[1];
        startAssessment(base64Data, base64String);
    };
    reader.readAsDataURL(file);
  };

  const startAssessment = async (base64Data: string, fullDataUrl: string) => {
  setAppState('LOADING_STORY');

  try {
    const data = await generateAssessment(base64Data);
    // Inject the local image URL into the data so we can display it
    setStoryData({ ...data, imageUrl: fullDataUrl });
    setAppState('READING');
  } catch (error: any) {
    console.error("Erreur dans startAssessment / generateAssessment :", error);

    const message =
      error?.message ||
      (typeof error === "string" ? error : "") ||
      "Erreur inconnue (voir la console du navigateur).";

    alert("Erreur lors de l'analyse de l'image : " + message);
    setAppState('SETUP');
  }
};

  const handleReadingComplete = () => {
    setAppState('QUIZ');
  };

  const calculateScores = async (quizResults: any[]) => {
    let lit = 0, inf = 0, evalScore = 0;

    quizResults.forEach(r => {
      // 1 point for correct
      const points = r.isCorrect ? 1 : 0;
      
      if (r.question.type === 'LITERAL') lit += points;
      if (r.question.type === 'INFERENTIAL') inf += points;
      if (r.question.type === 'EVALUATIVE') evalScore += points;
    });

    const total = lit + inf + evalScore;
    setFinalScores({ literal: lit, inferential: inf, evaluative: evalScore, total });
    setResults(quizResults);
    
    // Generate AI feedback
    const feedbackText = await generateFinalFeedback(total, 10, userInfo.firstName);
    setFinalFeedback(feedbackText);
    
    setAppState('RESULTS');
  };

  const downloadCSV = () => {
    if (!storyData || results.length === 0) return;

    // BOM for Excel to read UTF-8 correctly
    const BOM = "\uFEFF";
    
    // Headers exactly as requested
    const headers = [
      "Student_First_Name", 
      "Student_Last_Name", 
      "Score littéral", 
      "Score inférentiel", 
      "Score évaluatif", 
      "Score total"
    ];
    
    // Single row with data mapped to headers
    const row = [
      userInfo.firstName, // Student_First_Name
      userInfo.lastName,  // Student_Last_Name
      finalScores.literal,
      finalScores.inferential,
      finalScores.evaluative,
      finalScores.total
    ];

    const csvContent = BOM + [
      headers.join(","),
      row.join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Rapport_${userInfo.lastName}_${userInfo.firstName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuit = () => {
    if (confirm("Es-tu sûr de vouloir quitter et revenir à l'accueil ?")) {
      setUserInfo({ firstName: '', lastName: '' });
      setStoryData(null);
      setResults([]);
      setAppState('LOGIN');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <Compass className="w-8 h-8" />
            <h1 className="text-xl font-bold font-comic tracking-tight">Mission Compr&eacute;hension de l'&Eacute;crit </h1>
          </div>
          {appState !== 'LOGIN' && (
             <div className="flex items-center gap-4">
                 <div className="hidden sm:flex items-center gap-2 text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
                    <UserCircle className="w-5 h-5" />
                    <span className="font-bold text-sm">{userInfo.firstName} {userInfo.lastName}</span>
                 </div>
                 <div className="text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                    5ᵉ Année
                 </div>
             </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
        
        {/* LOGIN SCREEN */}
        {appState === 'LOGIN' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-md mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 w-full">
                <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <UserCircle className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-2xl font-bold text-center text-slate-800 font-comic mb-2">Bienvenue !</h2>
                <p className="text-center text-slate-500 mb-6">Identifie-toi pour commencer l'aventure.</p>
                
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Prénom</label>
                        <input 
                            type="text" 
                            required
                            value={userInfo.firstName}
                            onChange={(e) => setUserInfo({...userInfo, firstName: e.target.value})}
                            className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Ex: Amine"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Nom</label>
                        <input 
                            type="text" 
                            required
                            value={userInfo.lastName}
                            onChange={(e) => setUserInfo({...userInfo, lastName: e.target.value})}
                            className="w-full p-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Ex: Benali"
                        />
                    </div>
                    <Button type="submit" className="w-full mt-4 text-lg">
                        Commencer
                    </Button>
                </form>
            </div>
          </div>
        )}

        {/* SETUP SCREEN */}
        {appState === 'SETUP' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-indigo-100 p-6 rounded-full mb-8 animate-bounce">
              <Upload className="w-16 h-16 text-indigo-600" />
            </div>
            <h2 className="text-4xl font-bold text-slate-900 mb-4 font-comic">Salut {userInfo.firstName}, charge ton texte !</h2>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              Prends une photo d'un texte sur les explorateurs (ou autre) et l'IA va créer un quiz interactif pour toi.
            </p>
            
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept="image/*" 
                className="hidden" 
            />
            
            <Button onClick={() => fileInputRef.current?.click()} className="text-xl px-10 py-5 shadow-xl shadow-indigo-200">
              <ImageIcon className="w-6 h-6 mr-2" /> Choisir une image
            </Button>
          </div>
        )}

        {/* LOADING SCREEN */}
        {appState === 'LOADING_STORY' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
            <p className="text-xl font-bold text-slate-600 animate-pulse">L'IA analyse ton image...</p>
            <p className="text-slate-400 mt-2">Lecture et préparation des questions...</p>
          </div>
        )}

        {/* READING SCREEN */}
        {appState === 'READING' && storyData && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-lg font-bold text-slate-400 uppercase tracking-wider">Lecture</h2>
               <Button onClick={handleReadingComplete} variant="success">
                 J'ai fini de lire <Play className="w-4 h-4 ml-2" />
               </Button>
            </div>
            <StoryCard data={storyData} />
            <div className="mt-8 flex justify-center">
               <Button onClick={handleReadingComplete} variant="success" className="w-full max-w-md text-lg">
                 Passer aux questions
               </Button>
            </div>
          </div>
        )}

        {/* QUIZ SCREEN */}
        {appState === 'QUIZ' && storyData && (
          <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500">
            {/* Show story/image on the side on larger screens */}
            <div className="hidden lg:block w-1/3 shrink-0 h-[calc(100vh-150px)] overflow-y-auto sticky top-24 pr-2">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm opacity-90 hover:opacity-100 transition-opacity">
                    <h3 className="font-bold text-slate-400 text-sm uppercase mb-4">Document de référence</h3>
                    {storyData.imageUrl ? (
                        <img src={storyData.imageUrl} alt="Reference" className="w-full rounded-lg mb-4" />
                    ) : (
                        <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{storyData.content}</p>
                    )}
                </div>
            </div>

            <div className="flex-1">
                <QuestionEngine storyData={storyData} onComplete={calculateScores} />
            </div>
          </div>
        )}

        {/* RESULTS SCREEN */}
        {appState === 'RESULTS' && (
          <div className="max-w-3xl mx-auto animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden text-center border-4 border-white ring-4 ring-indigo-50">
              <div className="bg-indigo-600 p-12 text-white">
                <Trophy className="w-20 h-20 mx-auto mb-4 text-yellow-300 drop-shadow-lg" />
                <h2 className="text-4xl font-bold font-comic mb-2">Résultats de {userInfo.firstName}</h2>
                <div className="text-6xl font-black tracking-tighter mb-2">
                  {finalScores.total}<span className="text-3xl opacity-50">/10</span>
                </div>
                <p className="text-indigo-200 text-lg font-medium">
                  {finalScores.total >= 8 ? "Excellent travail !" : 
                   finalScores.total >= 6 ? "Bien joué !" : "Courage, continue tes efforts !"}
                </p>
              </div>

              <div className="p-8 grid grid-cols-3 gap-4 border-b border-slate-100">
                <div className="p-4 rounded-xl bg-blue-50">
                  <div className="text-2xl font-bold text-blue-700">{finalScores.literal}/4</div>
                  <div className="text-xs font-bold text-blue-400 uppercase tracking-wide">Littéral</div>
                </div>
                <div className="p-4 rounded-xl bg-purple-50">
                  <div className="text-2xl font-bold text-purple-700">{finalScores.inferential}/4</div>
                  <div className="text-xs font-bold text-purple-400 uppercase tracking-wide">Inférentiel</div>
                </div>
                <div className="p-4 rounded-xl bg-orange-50">
                  <div className="text-2xl font-bold text-orange-700">{finalScores.evaluative}/2</div>
                  <div className="text-xs font-bold text-orange-400 uppercase tracking-wide">Évaluatif</div>
                </div>
              </div>

              <div className="p-8 text-left">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-indigo-500" />
                  Conseils du professeur
                </h3>
                <div className="bg-slate-50 p-6 rounded-xl text-slate-700 leading-relaxed border border-slate-200">
                  {finalFeedback || "Chargement du feedback..."}
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-4">
                <Button onClick={downloadCSV} variant="primary" className="flex-1">
                  <Download className="w-5 h-5 mr-2" /> Télécharger le rapport (CSV)
                </Button>
                <Button onClick={handleQuit} variant="danger" className="flex-1">
                  <LogOut className="w-5 h-5 mr-2" /> Quitter
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;