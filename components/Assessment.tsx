
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { N8N } from '../n8nConfig';
import { useMarche } from './MarcheContext';
import { ArrowRight, Loader2, RefreshCw, Target, TrendingUp, Award, BrainCircuit } from 'lucide-react';
import { Page, MaturityResult, MaturityQuestion } from '../types';

interface AssessmentProps {
  session: any;
  onNavigate: (page: Page) => void;
  isOnboarding?: boolean;
  /** Appelé dès que le résultat est enregistré : lève le passage obligé par le test. */
  onResultat?: () => void;
  /** Fourni quand le test est obligatoire : sortie de secours si l'analyse n8n
   *  ne répond pas, pour ne pas bloquer l'accès au portail. */
  onReporter?: () => void;
}

// Fonction utilitaire pour parser le JSON
const safeParse = (data: any) => {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(data);
  } catch (e1) {
    if (typeof data === 'string') {
      try {
        let cleaned = data.trim();
        if (cleaned.startsWith('```')) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
        cleaned = cleaned.replace(/([{,]\s*)'([^']+)'(\s*:)/g, '$1"$2"$3');
        cleaned = cleaned.replace(/(:\s*)'([^']+)'(\s*[,}])/g, '$1"$2"$3');
        cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
        return JSON.parse(cleaned);
      } catch (e2) {
        // Fallback pour les JSON mal formés (ex: guillemets non échappés)
        const result: any = {};
        const regex = /"([^"]+)"\s*:\s*"([\s\S]*?)"(?=\s*(?:,\s*"[^"]+"\s*:|}))/g;
        let match;
        let found = false;
        while ((match = regex.exec(data)) !== null) {
          found = true;
          result[match[1]] = match[2];
        }
        if (found) return result;
        
        return {};
      }
    }
    return {};
  }
};

export const Assessment: React.FC<AssessmentProps> = ({ session, onNavigate, isOnboarding, onResultat, onReporter }) => {
  const [step, setStep] = useState<'intro' | 'quiz' | 'analyzing' | 'result'>('intro');
  const [questions, setQuestions] = useState<MaturityQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [analysisResult, setAnalysisResult] = useState<MaturityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyseEnRetard, setAnalyseEnRetard] = useState(false);

  // Marché de l'utilisateur (verrouillé sur celui de son organisation),
  // transmis à n8n pour adapter l'analyse (étape 10).
  const { marcheActif } = useMarche();

  useEffect(() => {
    const fetchQuestions = async () => {
      const { data } = await supabase
        .from('maturity_questions')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });
      
      if (data) {
        setQuestions(data);
      }
    };
    
    // Check if user already has a result
    const checkExistingResult = async () => {
        if (session?.user?.id) {
            const { data } = await supabase
                .from('utilisateurs')
                .select('maturity_results')
                .eq('auth_id', session.user.id)
                .single();
            
            if (data?.maturity_results) {
                setAnalysisResult(safeParse(data.maturity_results) as MaturityResult);
                setStep('result');
            }
        }
    };

    fetchQuestions();
    if (!isOnboarding) checkExistingResult();
  }, [session, isOnboarding]);

  const handleStart = () => setStep('quiz');

  const handleAnswer = (answer: string) => {
    setAnswers(prev => ({ ...prev, [questions[currentQuestionIndex].id]: answer }));
    
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      finishQuiz({ ...answers, [questions[currentQuestionIndex].id]: answer });
    }
  };

  const finishQuiz = async (finalAnswers: Record<string, string>) => {
    setStep('analyzing');
    setError(null);

    try {
      if (!session?.user?.id) {
        throw new Error("Vous devez être connecté pour effectuer cette action.");
      }

      // Prepare data for webhook
      // On aplatit le payload pour que les réponses soient à la racine, comme attendu par n8n
      const payload = {
        ...finalAnswers,
        email: session.user.email
      };

      // Call n8n webhook
      // Note: On utilise 'no-cors' et 'text/plain' pour éviter les erreurs CORS (Failed to fetch)
      // On envoie le userId en paramètre de requête comme demandé.
      // Le marché part aussi dans l'adresse, pas dans le corps : les
      // réponses sont à la racine du corps, n8n ne doit pas le prendre
      // pour une réponse. Vide = vitrine / sans marché.
      const parametres = new URLSearchParams({ userId: session.user.id, marche: marcheActif ?? '' });
      await fetch(`${N8N.maturite}?${parametres.toString()}`, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(payload)
      });

      // Poll the database for the result
      let attempts = 0;
      const maxAttempts = 60; // 2 minutes max (2000ms * 60)
      
      const pollInterval = setInterval(async () => {
        attempts++;
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setError("L'analyse prend plus de temps que prévu. Vous pourrez retrouver vos résultats dans votre profil d'ici quelques minutes.");
          setAnalyseEnRetard(true);
          setStep('quiz');
          return;
        }
        
        const { data, error } = await supabase
          .from('utilisateurs')
          .select('maturity_results')
          .eq('auth_id', session.user.id)
          .single();
          
        if (!error && data?.maturity_results) {
          clearInterval(pollInterval);
          setAnalysisResult(safeParse(data.maturity_results) as MaturityResult);
          setStep('result');
          onResultat?.();
        }
      }, 2000);

    } catch (err: any) {
      console.error("Erreur analyse:", err);
      setError("Une erreur est survenue lors de l'analyse. Veuillez réessayer.");
      setStep('quiz'); 
    }
  };

  const getScoreColor = (score: number) => {
      if (score < 40) return 'text-red-500';
      if (score < 70) return 'text-yellow-500';
      return 'text-succes-500';
  };

  const resetTest = () => {
      setAnswers({});
      setCurrentQuestionIndex(0);
      setStep('intro');
      setAnalysisResult(null);
  };

  if (step === 'intro') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden">
                <div className="bg-emerald-900 p-10 text-center text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                    <Target className="w-16 h-16 mx-auto mb-6 text-emerald-400" />
                    <h1 className="text-3xl font-black mb-4">Diagnostic de Maturité IA</h1>
                    <p className="text-emerald-100 text-lg">Évaluez en 2 minutes votre potentiel d'innovation et découvrez votre profil numérique.</p>
                </div>
                <div className="p-10 text-center space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <span className="block text-2xl font-bold text-slate-800 mb-1">{questions.length}</span>
                            <span className="text-xs text-slate-500 uppercase font-bold">Questions</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <span className="block text-2xl font-bold text-slate-800 mb-1">2 min</span>
                            <span className="text-xs text-slate-500 uppercase font-bold">Durée</span>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                            <span className="block text-2xl font-bold text-slate-800 mb-1">100%</span>
                            <span className="text-xs text-slate-500 uppercase font-bold">Personnalisé</span>
                        </div>
                    </div>
                    <button onClick={handleStart} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
                        Commencer le test <ArrowRight className="w-5 h-5" />
                    </button>
                    {!isOnboarding && (
                        <button onClick={() => onNavigate('dashboard')} className="text-sm font-bold text-slate-400 hover:text-slate-600">
                            Retour au tableau de bord
                        </button>
                    )}
                </div>
            </div>
        </div>
      );
  }

  if (step === 'quiz') {
      const currentQ = questions[currentQuestionIndex];
      const progress = ((currentQuestionIndex) / questions.length) * 100;

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col min-h-[500px]">
                <div className="h-2 bg-slate-100 w-full">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                
                <div className="p-8 md:p-12 flex-grow flex flex-col">
                    <div className="mb-8">
                        <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-2 block">Question {currentQuestionIndex + 1}/{questions.length}</span>
                        <h2 className="text-2xl font-bold text-slate-900 leading-tight">{currentQ.question_text}</h2>
                    </div>

                    <div className="space-y-3 mt-auto">
                        {currentQ.question_type === 'choice' && currentQ.options ? (
                            currentQ.options.map((opt, idx) => (
                                <button 
                                    key={idx}
                                    onClick={() => handleAnswer(opt)}
                                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition-all font-medium text-slate-700 hover:text-emerald-900 group"
                                >
                                    <div className="flex items-center justify-between">
                                        <span>{opt}</span>
                                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500" />
                                    </div>
                                </button>
                            ))
                        ) : (
                            // key = la question : le champ est recréé vide à chaque
                            // question ouverte. Sans elle, React réutilisait le même
                            // champ et la réponse précédente restait affichée.
                            <div key={currentQ.id} className="space-y-4">
                                <textarea
                                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none min-h-[120px] resize-none"
                                    placeholder="Tapez votre réponse ici..."
                                    onKeyDown={(e) => {
                                        if(e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            const val = (e.target as HTMLTextAreaElement).value;
                                            // Même règle que le bouton : pas de réponse vide
                                            if (val.trim()) handleAnswer(val);
                                        }
                                    }}
                                    autoFocus
                                />
                                <button 
                                    onClick={(e) => {
                                        const val = (e.currentTarget.previousElementSibling as HTMLTextAreaElement).value;
                                        if(val.trim()) handleAnswer(val);
                                    }}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
                                >
                                    Valider
                                </button>
                            </div>
                        )}
                    </div>
                    {error && <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
                    {analyseEnRetard && onReporter && (
                        <button
                            onClick={() => { onReporter(); onNavigate('dashboard'); }}
                            className="mt-3 text-sm font-bold text-slate-500 hover:text-emerald-700"
                        >
                            Continuer vers mon espace, je repasserai le test plus tard
                        </button>
                    )}
                </div>
            </div>
        </div>
      );
  }

  if (step === 'analyzing') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="text-center">
                <div className="w-20 h-20 bg-white rounded-full shadow-xl flex items-center justify-center mx-auto mb-6 relative">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <div className="absolute inset-0 border-4 border-emerald-100 rounded-full animate-pulse"></div>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Analyse en cours...</h2>
                <p className="text-slate-500">Nos algorithmes étudient votre profil.</p>
            </div>
        </div>
      );
  }

  if (step === 'result' && analysisResult) {
      return (
        <div className="min-h-screen bg-slate-50 py-12 px-4">
            <div className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-slate-100">
                {/* Header Result */}
                <div className="bg-gradient-to-br from-emerald-900 to-slate-900 p-12 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-emerald-300 text-sm font-bold mb-6 uppercase tracking-wider">
                            <Award className="w-4 h-4" /> Votre Profil
                        </div>
                        <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">{analysisResult.profil_titre}</h1>
                        <p className="text-xl text-emerald-100 max-w-2xl mx-auto leading-relaxed opacity-90">
                            {analysisResult.profil_description}
                        </p>
                    </div>
                </div>

                {/* Score Section with Gauges */}
                <div className="p-8 md:p-12 space-y-12">
                    
                    {/* Score Jauge */}
                    <div className="flex flex-col items-center">
                        <div className="relative w-72 h-36 flex items-end justify-center overflow-hidden">
                            <svg className="w-full h-full overflow-visible" viewBox="0 0 200 100" preserveAspectRatio="xMidYMax meet">
                                <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#f1f5f9" strokeWidth="16" strokeLinecap="round" />
                                <path 
                                    d="M 20 100 A 80 80 0 0 1 180 100" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="16" 
                                    strokeLinecap="round"
                                    strokeDasharray="251.2" 
                                    strokeDashoffset={251.2 * (1 - analysisResult.score_maturite / 100)}
                                    className={`${getScoreColor(analysisResult.score_maturite)} transition-all duration-1000 ease-out`}
                                />
                            </svg>
                            <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center mb-1">
                                <span className={`text-6xl font-black leading-none ${getScoreColor(analysisResult.score_maturite)}`}>{analysisResult.score_maturite}</span>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Score IA</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-emerald-600" /> Analyse</h3>
                            <p className="text-slate-600 leading-relaxed text-sm">{analysisResult.analyse_psychologique}</p>
                        </div>
                        <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100">
                            <h3 className="text-lg font-bold text-emerald-900 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-600" /> Priorité n°1</h3>
                            <p className="text-emerald-800 leading-relaxed text-sm font-medium">{analysisResult.top_priorite}</p>
                        </div>
                    </div>

                    <div className="text-center py-8 border-t border-slate-100">
                        <QuoteIcon className="w-8 h-8 text-slate-300 mx-auto mb-4" />
                        <p className="text-2xl font-serif italic text-slate-700 max-w-2xl mx-auto">"{analysisResult.phrase_choc}"</p>
                    </div>

                    <div className="flex flex-col md:flex-row justify-center gap-4">
                        <button 
                            onClick={() => onNavigate('dashboard')}
                            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-lg shadow-xl shadow-emerald-900/10 transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                        >
                            Accéder à mon espace <ArrowRight className="w-5 h-5" />
                        </button>
                        {!isOnboarding && (
                            <button 
                                onClick={resetTest}
                                className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-600 hover:border-emerald-200 hover:text-emerald-700 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-5 h-5" /> Refaire le test
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
      );
  }

  return null;
};

const QuoteIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.896 14.321 16.067 14.929 15.513C15.537 14.959 16.666 14.682 18.316 14.682V12.923C16.254 12.879 15.138 12.378 14.969 11.419C14.801 10.459 15.656 9.582 17.535 8.788L16.632 6C13.255 7.42 11.566 9.878 11.566 13.375L11.566 21H14.017ZM8 14.682V12.923C5.938 12.879 4.822 12.378 4.653 11.419C4.485 10.459 5.339 9.582 7.219 8.788L6.316 6C2.939 7.42 1.25 9.878 1.25 13.375L1.25 21H3.701L3.701 18C3.701 16.896 4.005 16.067 4.613 15.513C5.221 14.959 6.35 14.682 8 14.682Z"/></svg>
);
