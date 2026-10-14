import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  BrainCircuit,
  Users,
  Search,
  Building2,
  RotateCcw,
  Move,
  Check,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Palette,
  Crosshair,
  X
} from 'lucide-react';
import { DefiView, Organisation } from '../types';

interface MatriceIAViewProps {
  defis: DefiView[];
  onSelectDefi: (defi: DefiView) => void;
  onUpdateDefiCollective: (defiId: string, roi: number, complexite: number, justification?: string) => Promise<void>;
  organisations: Organisation[];
  getUserDetails: (userId: string) => { name: string; isMember: boolean; organisation_id?: string; organisation_name?: string };
  /** false = vue collective consultable mais non modifiable (membres). Défaut : true. */
  canEditCollective?: boolean;
  /** Masque le filtre organisation quand la matrice est déjà limitée à une organisation. */
  hideOrgFilter?: boolean;
  /** Force l'onglet initial sur la vue collective. */
  lockToCollective?: boolean;
}

/* ------------------------------------------------------------------ *
 *  Quadrants — une seule source de vérité
 * ------------------------------------------------------------------ */

type QuadrantKey = 'gains' | 'majeurs' | 'tactiques' | 'eviter';
type Axis = 'x' | 'y';
type Bound = 'min' | 'max';

const QUADRANTS: Record<QuadrantKey, {
  label: string;
  hint: string;
  color: string;
  corner: string;
  align: string;
  tint: string;
  frame: [[number, number], [number, number]];
}> = {
  gains: {
    label: 'Gains rapides',
    hint: 'ROI élevé · complexité faible',
    color: '#4ade80',
    corner: 'top-0 left-0',
    align: 'items-start text-left',
    tint: 'radial-gradient(circle at 0% 0%, rgba(74,222,128,0.20), transparent 60%)',
    frame: [[0, 50], [50, 100]]
  },
  majeurs: {
    label: 'Projets majeurs',
    hint: 'ROI élevé · complexité forte',
    color: '#60a5fa',
    corner: 'top-0 right-0',
    align: 'items-end text-right',
    tint: 'radial-gradient(circle at 100% 0%, rgba(96,165,250,0.17), transparent 60%)',
    frame: [[50, 100], [50, 100]]
  },
  tactiques: {
    label: 'Confort / tactiques',
    hint: 'ROI faible · complexité faible',
    color: '#cbd5e1',
    corner: 'bottom-0 left-0',
    align: 'items-start text-left',
    tint: 'radial-gradient(circle at 0% 100%, rgba(203,213,225,0.12), transparent 60%)',
    frame: [[0, 50], [0, 50]]
  },
  eviter: {
    label: 'À éviter',
    hint: 'ROI faible · complexité forte',
    color: '#fbbf24',
    corner: 'bottom-0 right-0',
    align: 'items-end text-right',
    tint: 'radial-gradient(circle at 100% 100%, rgba(251,191,36,0.15), transparent 60%)',
    frame: [[50, 100], [0, 50]]
  }
};

const QUADRANT_ORDER: QuadrantKey[] = ['gains', 'majeurs', 'tactiques', 'eviter'];

const quadrantKey = (roi: number, complexite: number): QuadrantKey => {
  if (roi >= 50) return complexite < 50 ? 'gains' : 'majeurs';
  return complexite < 50 ? 'tactiques' : 'eviter';
};

/** Conservé pour compatibilité avec le reste de l'application. */
export const getQuadrantName = (roi: number, complexite: number): string => {
  if (roi >= 50 && complexite < 50) return 'Gains Rapides';
  if (roi >= 50 && complexite >= 50) return 'Projets Majeurs';
  if (roi < 50 && complexite < 50) return 'Confort / Tactiques';
  return 'À Éviter';
};

/* Palette organisations — calibrée pour un fond vert sombre */
const ORG_PALETTE = ['#5eead4', '#c4b5fd', '#fdba74', '#7dd3fc', '#f9a8d4', '#fde047', '#86efac', '#fca5a5'];

const getOrgColor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return ORG_PALETTE[Math.abs(hash) % ORG_PALETTE.length];
};

const MIN_SPAN = 10;
const DRAG_THRESHOLD = 4;

/* ------------------------------------------------------------------ */

export const MatriceIAView: React.FC<MatriceIAViewProps> = ({
  defis,
  onSelectDefi,
  onUpdateDefiCollective,
  organisations,
  getUserDetails,
  canEditCollective = true,
  hideOrgFilter = false,
  lockToCollective = false
}) => {
  const [activeTab, setActiveTab] = useState<'piloterra' | 'collective'>(lockToCollective ? 'collective' : 'piloterra');

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState('All');
  const [selectedQuadrantFilter, setSelectedQuadrantFilter] = useState<'Tous' | QuadrantKey>('Tous');
  const [colorMode, setColorMode] = useState<'quadrant' | 'organisation'>('quadrant');

  const [xRange, setXRange] = useState<[number, number]>([0, 100]);
  const [yRange, setYRange] = useState<[number, number]>([0, 100]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const plotRef = useRef<HTMLDivElement>(null);
  const xRailRef = useRef<HTMLDivElement>(null);
  const yRailRef = useRef<HTMLDivElement>(null);

  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number; roi: number; complexite: number; quadrant: QuadrantKey } | null>(null);
  const [axisDrag, setAxisDrag] = useState<{ axis: Axis; bound: Bound } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Distingue un vrai déplacement d'un simple clic
  const pointerOriginRef = useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = useRef(false);

  const isFramed = xRange[0] !== 0 || xRange[1] !== 100 || yRange[0] !== 0 || yRange[1] !== 100;

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  /* --- Échelle : le cadrage s'applique aux deux vues --- */
  const scale = useMemo(() => ({
    xMin: xRange[0], xMax: xRange[1], yMin: yRange[0], yMax: yRange[1]
  }), [xRange, yRange]);

  const toPlot = useCallback((roi: number, complexite: number) => ({
    x: ((complexite - scale.xMin) / (scale.xMax - scale.xMin)) * 100,
    y: 100 - ((roi - scale.yMin) / (scale.yMax - scale.yMin)) * 100
  }), [scale]);

  const fromPlot = useCallback((xPct: number, yPct: number) => ({
    complexite: Math.max(0, Math.min(100, Math.round(scale.xMin + (xPct / 100) * (scale.xMax - scale.xMin)))),
    roi: Math.max(0, Math.min(100, Math.round(scale.yMin + ((100 - yPct) / 100) * (scale.yMax - scale.yMin))))
  }), [scale]);

  const inFrame = useCallback((roi: number, cplx: number) =>
    cplx >= scale.xMin && cplx <= scale.xMax && roi >= scale.yMin && roi <= scale.yMax,
  [scale]);

  const getCoords = useCallback((defi: DefiView, mode: 'piloterra' | 'collective') => {
    const roi = mode === 'piloterra'
      ? (defi.score_roi ?? 50)
      : (defi.score_roi_collectif ?? defi.score_roi ?? 50);
    const cplx = mode === 'piloterra'
      ? (defi.score_complexite ?? 50)
      : (defi.score_complexite_collectif ?? defi.score_complexite ?? 50);
    return { roi, cplx, key: quadrantKey(roi, cplx) };
  }, []);

  /* --- Filtrage --- */
  const filteredDefis = useMemo(() => defis.filter(d => {
    const { key } = getCoords(d, activeTab);
    const q = searchQuery.toLowerCase();
    const matchesSearch = q === '' ||
      (d.titreDefi && d.titreDefi.toLowerCase().includes(q)) ||
      (d.probleme && d.probleme.toLowerCase().includes(q));

    const userOrgId = getUserDetails(d.user_id)?.organisation_id;
    const matchesOrg = selectedOrgFilter === 'All' ||
      userOrgId === selectedOrgFilter ||
      (d as any).organisation_id === selectedOrgFilter;

    const matchesQuadrant = selectedQuadrantFilter === 'Tous' || key === selectedQuadrantFilter;

    return matchesSearch && matchesOrg && matchesQuadrant;
  }), [defis, activeTab, searchQuery, selectedOrgFilter, selectedQuadrantFilter, getCoords, getUserDetails]);

  const counts = useMemo(() => {
    const base: Record<QuadrantKey, number> = { gains: 0, majeurs: 0, tactiques: 0, eviter: 0 };
    filteredDefis.forEach(d => { base[getCoords(d, activeTab).key] += 1; });
    return base;
  }, [filteredDefis, activeTab, getCoords]);

  const visibleDefis = useMemo(
    () => filteredDefis.filter(d => { const c = getCoords(d, activeTab); return inFrame(c.roi, c.cplx); }),
    [filteredDefis, activeTab, getCoords, inFrame]
  );
  const outOfRange = filteredDefis.length - visibleDefis.length;

  const resetFrame = () => { setXRange([0, 100]); setYRange([0, 100]); };

  const frameQuadrant = (k: QuadrantKey) => {
    const [x, y] = QUADRANTS[k].frame;
    setXRange(x);
    setYRange(y);
  };

  /* --- Cadrage : curseurs sur les axes --- */
  const updateRange = useCallback((axis: Axis, bound: Bound, raw: number) => {
    const v = Math.max(0, Math.min(100, Math.round(raw)));
    const apply = ([lo, hi]: [number, number]): [number, number] =>
      bound === 'min'
        ? [Math.min(v, hi - MIN_SPAN), hi]
        : [lo, Math.max(v, lo + MIN_SPAN)];
    if (axis === 'x') setXRange(apply);
    else setYRange(apply);
  }, []);

  useEffect(() => {
    if (!axisDrag) return;
    const onMove = (e: MouseEvent | TouchEvent) => {
      const rail = axisDrag.axis === 'x' ? xRailRef.current : yRailRef.current;
      if (!rail) return;
      if ('touches' in e) e.preventDefault();
      const rect = rail.getBoundingClientRect();
      const p = 'touches' in e ? e.touches[0] : e;
      const raw = axisDrag.axis === 'x'
        ? ((p.clientX - rect.left) / rect.width) * 100
        : 100 - ((p.clientY - rect.top) / rect.height) * 100;
      updateRange(axisDrag.axis, axisDrag.bound, raw);
    };
    const onUp = () => setAxisDrag(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [axisDrag, updateRange]);

  const onHandleKey = (axis: Axis, bound: Bound, e: React.KeyboardEvent) => {
    const range = axis === 'x' ? xRange : yRange;
    const current = bound === 'min' ? range[0] : range[1];
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); updateRange(axis, bound, current - step); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); updateRange(axis, bound, current + step); }
  };

  /* --- Glisser-déposer des fiches (vue collective) --- */
  const readPointer = useCallback((e: MouseEvent | TouchEvent) => {
    if (!plotRef.current) return null;
    const rect = plotRef.current.getBoundingClientRect();
    const p = 'touches' in e ? e.touches[0] : e;
    const xPct = Math.max(0, Math.min(100, ((p.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((p.clientY - rect.top) / rect.height) * 100));
    const { roi, complexite } = fromPlot(xPct, yPct);
    return { x: xPct, y: yPct, roi, complexite, quadrant: quadrantKey(roi, complexite) };
  }, [fromPlot]);

  const handlePointerDownNode = (e: React.MouseEvent | React.TouchEvent, defiId: string) => {
    const native = e.nativeEvent as MouseEvent | TouchEvent;
    const p = 'touches' in native ? native.touches[0] : native;
    pointerOriginRef.current = { x: p.clientX, y: p.clientY };
    hasMovedRef.current = false;

    if (activeTab !== 'collective' || !canEditCollective) return;
    e.stopPropagation();
    setDraggingNodeId(defiId);
    const coords = readPointer(native);
    if (coords) setDragCurrent(coords);
  };

  const handleGlobalMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!draggingNodeId) return;
    if ('touches' in e) e.preventDefault();

    const p = 'touches' in e ? e.touches[0] : e;
    const origin = pointerOriginRef.current;
    if (origin && Math.hypot(p.clientX - origin.x, p.clientY - origin.y) > DRAG_THRESHOLD) {
      hasMovedRef.current = true;
    }

    const coords = readPointer(e);
    if (coords) setDragCurrent(coords);
  }, [draggingNodeId, readPointer]);

  const handleGlobalUp = useCallback(async () => {
    const nodeId = draggingNodeId;
    const snapshot = dragCurrent;
    const moved = hasMovedRef.current;

    setDraggingNodeId(null);
    setDragCurrent(null);

    // Simple clic : aucune écriture en base, on laisse le onClick ouvrir la fiche
    if (!nodeId || !snapshot || !moved) return;

    const target = defis.find(d => d.id === nodeId);
    if (!target) return;

    setIsSaving(true);
    try {
      await onUpdateDefiCollective(target.id, snapshot.roi, snapshot.complexite);
      setNotification(`« ${target.titreDefi || 'Défi'} » repositionné · ROI ${snapshot.roi} · complexité ${snapshot.complexite} · ${QUADRANTS[snapshot.quadrant].label}`);
    } catch (err) {
      console.error('Erreur lors de la mise à jour collective :', err);
      setNotification("Le repositionnement n'a pas été enregistré. Réessayez ou vérifiez votre connexion.");
    } finally {
      setIsSaving(false);
    }
  }, [draggingNodeId, dragCurrent, defis, onUpdateDefiCollective]);

  useEffect(() => {
    if (!draggingNodeId) return;
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [draggingNodeId, handleGlobalMove, handleGlobalUp]);

  // Le plein écran est au-dessus des modales de l'application : on en sort avant d'ouvrir une fiche
  const openDefi = (d: DefiView) => {
    if (hasMovedRef.current) { hasMovedRef.current = false; return; }
    if (isFullscreen) setIsFullscreen(false);
    onSelectDefi(d);
  };

  const nodeColor = (d: DefiView, key: QuadrantKey) => {
    if (colorMode === 'organisation') {
      const orgId = getUserDetails(d.user_id)?.organisation_id || (d as any).organisation_id || d.user_id;
      return getOrgColor(String(orgId));
    }
    return QUADRANTS[key].color;
  };

  const ticks = [0, 25, 50, 75, 100];
  const tickValue = (t: number, axis: Axis) =>
    axis === 'x'
      ? Math.round(scale.xMin + (t / 100) * (scale.xMax - scale.xMin))
      : Math.round(scale.yMin + (t / 100) * (scale.yMax - scale.yMin));

  const accent = activeTab === 'piloterra' ? '#4ade80' : '#c4b5fd';
  const canDrag = activeTab === 'collective' && canEditCollective;

  /* --- Poignée de cadrage --- */
  const Handle = ({ axis, bound }: { axis: Axis; bound: Bound }) => {
    const range = axis === 'x' ? xRange : yRange;
    const value = bound === 'min' ? range[0] : range[1];
    const active = axisDrag?.axis === axis && axisDrag?.bound === bound;
    const pos = axis === 'x' ? { left: `${value}%` } : { top: `${100 - value}%` };

    return (
      <button
        type="button"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label={`${axis === 'x' ? 'Complexité' : 'ROI'} — borne ${bound === 'min' ? 'basse' : 'haute'}`}
        onMouseDown={(e) => { e.preventDefault(); setAxisDrag({ axis, bound }); }}
        onTouchStart={() => setAxisDrag({ axis, bound })}
        onKeyDown={(e) => onHandleKey(axis, bound, e)}
        className={`absolute z-10 h-4 w-4 rounded-full border-2 border-[#08150f] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
          axis === 'x' ? 'top-1/2 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2 -translate-y-1/2'
        } ${active ? 'scale-125 cursor-grabbing' : 'cursor-grab hover:scale-110'}`}
        style={{ ...pos, backgroundColor: accent, boxShadow: `0 0 10px ${accent}99` }}
      >
        {active && (
          <span
            className={`pointer-events-none absolute whitespace-nowrap rounded-md bg-[#0f2419] px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums ${
              axis === 'x' ? 'left-1/2 top-full mt-1.5 -translate-x-1/2' : 'right-full top-1/2 mr-2 -translate-y-1/2'
            }`}
          >
            {value}
          </span>
        )}
      </button>
    );
  };

  /* ---------------------------------------------------------------- *
   *  Panneau matrice
   * ---------------------------------------------------------------- */
  const matrixPanel = (
    <div className={`relative flex flex-col rounded-[28px] bg-[#0a1a12] p-5 ring-1 ring-white/10 shadow-[0_30px_80px_-25px_rgba(6,25,16,0.65)] md:p-7 ${isFullscreen ? 'h-full' : ''}`}>
      {/* Bandeau d'état */}
      <div className="flex items-center justify-between gap-4 pb-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 12px ${accent}` }} />
          <p className="truncate text-sm text-white/70">
            {activeTab === 'piloterra'
              ? 'Positions calculées par l’analyse PiloTerra'
              : canDrag
                ? 'Glissez une fiche pour la repositionner. Un simple clic l’ouvre.'
                : 'Positions arbitrées en atelier par votre organisation'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isSaving && <span className="font-mono text-[11px] text-violet-300/80">Enregistrement…</span>}
          {activeTab === 'collective' && !canEditCollective && (
            <span className="rounded-md bg-white/10 px-2 py-1 text-[11px] font-medium text-white/60">Lecture seule</span>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            title={isFullscreen ? 'Quitter le plein écran (Échap)' : 'Afficher en plein écran'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Corps : rail Y + zone de tracé + rail X */}
      <div className={`flex gap-2 ${isFullscreen ? 'min-h-0 flex-1' : ''}`}>
        {/* Colonne gauche : graduations + rail ROI */}
        <div className="flex shrink-0 flex-col">
          <div className="flex min-h-0 flex-1 gap-1.5">
            <div className="flex w-7 flex-col items-end justify-between">
              {[...ticks].reverse().map(t => (
                <span key={t} className="font-mono text-[10px] leading-none text-white/30 tabular-nums">{tickValue(t, 'y')}</span>
              ))}
            </div>
            <div
              ref={yRailRef}
              onDoubleClick={() => setYRange([0, 100])}
              title="Glissez les poignées pour cadrer l’axe ROI · double-clic pour réinitialiser"
              className="relative w-5 select-none"
            >
              <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-white/10" />
              <div
                className="absolute left-1/2 w-1 -translate-x-1/2 rounded-full"
                style={{ top: `${100 - yRange[1]}%`, height: `${yRange[1] - yRange[0]}%`, backgroundColor: accent, opacity: 0.75 }}
              />
              <Handle axis="y" bound="max" />
              <Handle axis="y" bound="min" />
            </div>
          </div>
          <div className="h-9" />
        </div>

        {/* Colonne droite : matrice + rail complexité */}
        <div className={`flex min-w-0 flex-1 flex-col ${isFullscreen ? 'min-h-0' : ''}`}>
          <div
            ref={plotRef}
            className={`relative w-full select-none ${isFullscreen ? 'min-h-0 flex-1' : 'aspect-[16/10] md:aspect-[2/1]'} ${
              canDrag ? 'cursor-crosshair' : ''
            }`}
          >
            {/* Fond */}
            <div className="absolute inset-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
              <div className="absolute inset-0 bg-[#061109]" />
              {QUADRANT_ORDER.map(k => (
                <div key={k} className="absolute inset-0" style={{ background: QUADRANTS[k].tint }} />
              ))}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)',
                  backgroundSize: '10% 10%'
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
              <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
            </div>

            {/* Coins : compteur, filtre, cadrage */}
            {QUADRANT_ORDER.map(k => {
              const q = QUADRANTS[k];
              const active = selectedQuadrantFilter === k;
              return (
                <div key={k} className={`group absolute z-10 m-3 flex flex-col ${q.corner} ${q.align}`}>
                  <button
                    onClick={() => setSelectedQuadrantFilter(active ? 'Tous' : k)}
                    className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${q.align} ${
                      active ? 'bg-white/10' : 'hover:bg-white/[0.06]'
                    }`}
                    title={active ? 'Retirer le filtre' : `N’afficher que « ${q.label} »`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-semibold leading-none tabular-nums" style={{ color: q.color }}>
                        {counts[k]}
                      </span>
                      <span className="text-[13px] font-medium text-white/85">{q.label}</span>
                    </span>
                    <span className="text-[10px] text-white/35">{q.hint}</span>
                  </button>
                  <button
                    onClick={() => frameQuadrant(k)}
                    title={`Cadrer la matrice sur « ${q.label} »`}
                    className="mt-0.5 flex items-center gap-1 rounded-lg px-3 py-1 text-[10px] text-white/40 opacity-0 transition-opacity hover:text-white/80 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-white/60 group-hover:opacity-100"
                  >
                    <Crosshair className="h-3 w-3" /> cadrer
                  </button>
                </div>
              );
            })}

            {/* Traces IA → collectif */}
            {activeTab === 'collective' && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                {visibleDefis.map(d => {
                  const ia = getCoords(d, 'piloterra');
                  const col = getCoords(d, 'collective');
                  if (ia.roi === col.roi && ia.cplx === col.cplx) return null;
                  if (!inFrame(ia.roi, ia.cplx)) return null;
                  const a = toPlot(ia.roi, ia.cplx);
                  const b = toPlot(col.roi, col.cplx);
                  return (
                    <g key={`trace-${d.id}`} opacity={hoveredNodeId && hoveredNodeId !== d.id ? 0.18 : 0.75}>
                      <circle cx={a.x} cy={a.y} r="1.4" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c4b5fd" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Réticule de glisser-déposer */}
            {dragCurrent && (
              <div className="pointer-events-none absolute inset-0 z-20">
                <div className="absolute inset-x-0 h-px bg-violet-300/60" style={{ top: `${dragCurrent.y}%` }} />
                <div className="absolute inset-y-0 w-px bg-violet-300/60" style={{ left: `${dragCurrent.x}%` }} />
                <div
                  className="absolute h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-300/25 ring-2 ring-violet-200"
                  style={{ left: `${dragCurrent.x}%`, top: `${dragCurrent.y}%` }}
                />
                <div
                  className="absolute -translate-x-1/2 -translate-y-[220%] whitespace-nowrap rounded-lg bg-violet-400 px-2.5 py-1 font-mono text-[11px] font-semibold text-violet-950 shadow-lg tabular-nums"
                  style={{ left: `${dragCurrent.x}%`, top: `${dragCurrent.y}%` }}
                >
                  ROI {dragCurrent.roi} · CPLX {dragCurrent.complexite}
                </div>
              </div>
            )}

            {/* Fiches */}
            <div className="absolute inset-0 z-10">
              {visibleDefis.map(d => {
                const { roi, cplx, key } = getCoords(d, activeTab);
                const isDragging = draggingNodeId === d.id;
                const pos = isDragging && dragCurrent ? { x: dragCurrent.x, y: dragCurrent.y } : toPlot(roi, cplx);
                const isHovered = hoveredNodeId === d.id;
                const dimmed = !!hoveredNodeId && !isHovered;
                const color = nodeColor(d, key);
                const size = isHovered || isDragging ? 20 : 13;

                return (
                  <button
                    key={d.id}
                    onClick={() => openDefi(d)}
                    onMouseDown={(e) => handlePointerDownNode(e, d.id)}
                    onTouchStart={(e) => handlePointerDownNode(e, d.id)}
                    onMouseEnter={() => setHoveredNodeId(d.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onFocus={() => setHoveredNodeId(d.id)}
                    onBlur={() => setHoveredNodeId(null)}
                    aria-label={`${d.titreDefi || 'Défi sans titre'} — ROI ${roi}, complexité ${cplx}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      canDrag ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'
                    }`}
                    style={{
                      left: `${pos.x}%`,
                      top: `${pos.y}%`,
                      width: size,
                      height: size,
                      backgroundColor: color,
                      opacity: dimmed ? 0.3 : 1,
                      boxShadow: `0 0 0 1.5px rgba(6,17,9,0.9), 0 0 ${isHovered || isDragging ? 26 : 14}px ${color}`,
                      transition: isDragging
                        ? 'width 120ms ease, height 120ms ease'
                        : 'width 160ms ease, height 160ms ease, opacity 160ms ease, left 220ms ease, top 220ms ease',
                      zIndex: isHovered || isDragging ? 30 : 10
                    }}
                  />
                );
              })}
            </div>

            {/* Infobulle */}
            {!draggingNodeId && hoveredNodeId && (() => {
              const d = visibleDefis.find(x => x.id === hoveredNodeId);
              if (!d) return null;
              const { roi, cplx, key } = getCoords(d, activeTab);
              const ia = getCoords(d, 'piloterra');
              const pos = toPlot(roi, cplx);
              const flipX = pos.x > 62;
              const flipY = pos.y > 55;
              const moved = activeTab === 'collective' && (ia.roi !== roi || ia.cplx !== cplx);

              return (
                <div
                  className="pointer-events-none absolute z-40 w-64 rounded-2xl border border-white/10 bg-[#0f2419]/95 p-4 shadow-2xl backdrop-blur-md"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: `translate(${flipX ? 'calc(-100% - 16px)' : '16px'}, ${flipY ? 'calc(-100% - 16px)' : '16px'})`
                  }}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-white/45">{getUserDetails(d.user_id).name}</span>
                    <span
                      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold"
                      style={{ color: QUADRANTS[key].color, backgroundColor: `${QUADRANTS[key].color}22` }}
                    >
                      {QUADRANTS[key].label}
                    </span>
                  </div>

                  <h4 className="mb-3 line-clamp-2 text-sm font-semibold leading-snug text-white">
                    {d.titreDefi || 'Analyse en cours…'}
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white/5 px-2.5 py-2">
                      <div className="text-[10px] text-white/40">ROI</div>
                      <div className="font-mono text-lg leading-tight text-white tabular-nums">{roi}</div>
                    </div>
                    <div className="rounded-lg bg-white/5 px-2.5 py-2">
                      <div className="text-[10px] text-white/40">Complexité</div>
                      <div className="font-mono text-lg leading-tight text-white tabular-nums">{cplx}</div>
                    </div>
                  </div>

                  {moved && (
                    <p className="mt-3 border-t border-white/10 pt-2.5 font-mono text-[11px] text-violet-300 tabular-nums">
                      Déplacé depuis ROI {ia.roi} · CPLX {ia.cplx}
                    </p>
                  )}

                  <p className="mt-3 flex items-center justify-end gap-1 text-[11px] text-white/45">
                    Cliquer pour ouvrir la fiche <ArrowUpRight className="h-3 w-3" />
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Rail complexité + graduations */}
          <div className="h-9">
            <div
              ref={xRailRef}
              onDoubleClick={() => setXRange([0, 100])}
              title="Glissez les poignées pour cadrer l’axe complexité · double-clic pour réinitialiser"
              className="relative mt-1.5 h-5 select-none"
            >
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                style={{ left: `${xRange[0]}%`, width: `${xRange[1] - xRange[0]}%`, backgroundColor: accent, opacity: 0.75 }}
              />
              <Handle axis="x" bound="min" />
              <Handle axis="x" bound="max" />
            </div>
            <div className="flex justify-between">
              {ticks.map(t => (
                <span key={t} className="font-mono text-[10px] text-white/30 tabular-nums">{tickValue(t, 'x')}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Pied */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
          <span>Axe horizontal · complexité de mise en œuvre</span>
          <span>Axe vertical · retour sur investissement</span>
          {activeTab === 'collective' && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-400" />
              position PiloTerra d’origine
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isFramed && (
            <button
              onClick={resetFrame}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Cadrage {xRange[0]}–{xRange[1]} · {yRange[0]}–{yRange[1]}
              {outOfRange > 0 && <span className="text-amber-300">· {outOfRange} masqué{outOfRange > 1 ? 's' : ''}</span>}
            </button>
          )}

          <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
            <Palette className="mx-1.5 h-3.5 w-3.5 text-white/35" />
            {(['quadrant', 'organisation'] as const).map(m => (
              <button
                key={m}
                onClick={() => setColorMode(m)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  colorMode === m ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/75'
                }`}
              >
                {m === 'quadrant' ? 'Quadrant' : 'Organisation'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- *
   *  Rendu
   * ---------------------------------------------------------------- */
  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
            Matrice de priorisation
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Chaque fiche défi est placée selon son retour sur investissement et sa complexité de mise en œuvre.
          </p>
        </div>

        <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('piloterra')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'piloterra' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <BrainCircuit className={`h-4 w-4 ${activeTab === 'piloterra' ? 'text-emerald-600' : 'text-slate-400'}`} />
            Analyse PiloTerra
          </button>
          <button
            onClick={() => setActiveTab('collective')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'collective' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className={`h-4 w-4 ${activeTab === 'collective' ? 'text-violet-600' : 'text-slate-400'}`} />
            Atelier collectif
          </button>
        </div>
      </div>

      {/* Barre de contrôle */}
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher un défi"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-0"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
              aria-label="Effacer la recherche"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {!hideOrgFilter && (
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <select
            value={selectedOrgFilter}
            onChange={(e) => setSelectedOrgFilter(e.target.value)}
            className="h-full w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-slate-700 focus:border-slate-400 focus:outline-none md:w-auto"
          >
            <option value="All">Toutes les organisations</option>
            {organisations.map(org => (
              <option key={org.id} value={org.id}>{org.nom}</option>
            ))}
          </select>
        </div>
        )}

        {/* Compteur */}
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 md:ml-auto">
          <span className="font-mono text-[28px] font-semibold leading-none text-emerald-700 tabular-nums">
            {visibleDefis.length}
          </span>
          <span className="text-xs leading-tight text-emerald-900">
            défi{visibleDefis.length > 1 ? 's' : ''} sur la matrice
            {visibleDefis.length !== defis.length && (
              <>
                <br />
                <span className="text-emerald-700/70">sur {defis.length} au total</span>
              </>
            )}
          </span>
          {(selectedQuadrantFilter !== 'Tous' || selectedOrgFilter !== 'All' || searchQuery || isFramed) && (
            <button
              onClick={() => { setSelectedQuadrantFilter('Tous'); if (!hideOrgFilter) setSelectedOrgFilter('All'); setSearchQuery(''); resetFrame(); }}
              className="ml-1 rounded-lg p-1.5 text-emerald-700/60 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
              title="Tout réafficher"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Matrice */}
      {isFullscreen ? (
        <div className="fixed inset-0 z-[90] bg-[#04100a] p-4 md:p-6">{matrixPanel}</div>
      ) : (
        matrixPanel
      )}

      {/* Aide contextuelle atelier */}
      {activeTab === 'collective' && !isFullscreen && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Move className="h-4 w-4 shrink-0 text-violet-500" />
          {canEditCollective
            ? 'Les repositionnements décidés en atelier sont enregistrés séparément. Les scores calculés par PiloTerra restent consultables dans chaque fiche.'
            : 'Cette vue montre les arbitrages retenus en atelier par votre organisation. Seuls les administrateurs peuvent déplacer les fiches.'}
        </p>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-3.5 text-sm text-white shadow-2xl">
            <Check className="h-4 w-4 shrink-0 text-succes-400" />
            <span>{notification}</span>
          </div>
        </div>
      )}
    </div>
  );
};
