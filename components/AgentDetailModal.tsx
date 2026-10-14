import React, { useEffect } from 'react';
import { X, ExternalLink, Bot, Tag, Cpu, Sparkles } from 'lucide-react';
import { AgentIA } from '../types';
import { sendEvent } from '../analytics';
import { RenduMarkdown } from './RenduMarkdown';

interface AgentDetailModalProps {
  agent: AgentIA | null;
  onClose: () => void;
  session?: any;
}

export const AgentDetailModal: React.FC<AgentDetailModalProps> = ({
  agent,
  onClose,
  session
}) => {
  // Fermeture au clavier + blocage du défilement de l'arrière-plan
  useEffect(() => {
    if (!agent) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', surTouche);
    const ancienOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', surTouche);
      document.body.style.overflow = ancienOverflow;
    };
  }, [agent, onClose]);

  if (!agent) return null;

  let lienAgent = agent.link || '#';
  if (session?.user?.id && lienAgent !== '#') {
    const separateur = lienAgent.includes('?') ? '&' : '?';
    lienAgent = `${lienAgent}${separateur}user_id=${session.user.id}`;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={agent.name}
    >
      <div
        className="bg-white w-full sm:max-w-3xl max-h-[92vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="relative bg-emerald-900 text-white px-6 sm:px-8 py-7 shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/25 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wide mb-2">
            <Bot className="w-4 h-4" />
            Agent IA
          </div>
          <h2 className="text-2xl sm:text-3xl font-black leading-tight pr-10">{agent.name}</h2>
          {agent.description && (
            <p className="text-emerald-100 mt-2.5 leading-relaxed">{agent.description}</p>
          )}
        </div>

        {/* Corps défilant */}
        <div className="overflow-y-auto px-6 sm:px-8 py-6 flex-grow">
          {agent.contenuLong ? (
            <RenduMarkdown texte={agent.contenuLong} />
          ) : (
            <p className="text-slate-500 italic">
              La description détaillée de cet agent est en cours de rédaction.
            </p>
          )}

          {(agent.capabilities?.length || 0) > 0 && (
            <div className="mt-7">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-sm mb-3">
                <Sparkles className="w-4 h-4 text-emerald-600" /> Capacités
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-700 text-sm">
                {agent.capabilities.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {((agent.tags?.length || 0) > 0 || (agent.frameworks?.length || 0) > 0) && (
            <div className="mt-7 pt-6 border-t border-slate-100 flex flex-wrap gap-2">
              {(agent.tags || []).map((t) => (
                <span
                  key={`tag-${t}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"
                >
                  <Tag className="w-3 h-3" />
                  {t}
                </span>
              ))}
              {(agent.frameworks || []).map((f) => (
                <span
                  key={`fw-${f}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold"
                >
                  <Cpu className="w-3 h-3" />
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pied d'action */}
        <div className="border-t border-slate-100 px-6 sm:px-8 py-4 flex flex-col sm:flex-row gap-3 shrink-0 bg-slate-50">
          <a
            href={lienAgent}
            target="_blank"
            rel="noopener"
            onClick={() => sendEvent('click_agent', 'AgentsIA', agent.name)}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
          >
            Accéder à l'agent IA <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="py-3 px-6 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
