/**
 * IngestionPanel.jsx — Pipeline de données avec visualisation temps réel
 * Tableaux scrollables, sélecteur de lignes, explications par étape
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../AppContext';
import {
  Database, CheckCircle, AlertCircle, Loader, Play,
  GitMerge, Cpu, Layers, RefreshCw, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API    = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/ingestion';

const PHASE_META = {
  1: { label:'Chargement & Validation', color:'#4fc3f7', icon: Database,
       desc:'Lecture des 5 fichiers CSV bruts et vérification de leur intégrité : valeurs manquantes, doublons et fréquence horaire des mesures.' },
  2: { label:'Fusion des datasets',     color:'#81c784', icon: GitMerge,
       desc:'Jointure progressive des 5 tables sur machineID et datetime. On construit un DataFrame unique de 876 142 lignes contenant toutes les informations.' },
  3: { label:'Feature Engineering',     color:'#ffb74d', icon: Cpu,
       desc:'Création des 31 variables explicatives : rolling statistics (3h & 24h), âge des composants depuis la dernière maintenance, et calcul du RUL cible.' },
  4: { label:'Tenseurs & Normalisation',color:'#ce93d8', icon: Layers,
       desc:'Split chronologique 80/20 (sans mélange aléatoire), normalisation MinMaxScaler fitté sur le train uniquement, et séquençage 3D : Samples × 24h × 31 features.' },
};

const FILE_COLORS = {
  telemetry:'#4fc3f7', machines:'#81c784',
  failures:'#f06292', errors:'#ffb74d', maint:'#ce93d8',
};

const FILE_DESC = {
  telemetry:'Mesures horaires des 4 capteurs (volt, rotate, pressure, vibration) pour 100 machines — base de toute l\'analyse.',
  machines: 'Métadonnées des 100 machines : type de modèle et âge en années.',
  failures: 'Dates et types de pannes (comp1–comp4) — utilisées pour calculer le RUL cible.',
  errors:   'Codes d\'erreurs (error1–error5) enregistrés par machine et par heure.',
  maint:    'Dates de maintenance des composants — base du calcul de l\'âge des pièces.',
};

// ── Tableau scrollable dynamique ─────────────────────────────
function DataTable({ columns = [], rows = [], caption, totalRows, maxHeight = 280, defaultRows = 5, options = [5,10,20,50] }) {
  const [shown, setShown] = useState(defaultRows);
  if (!columns.length || !rows.length) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        {caption && <p className="text-xs italic" style={{ color:'#8a8d9f' }}>{caption}</p>}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs mr-1" style={{ color:'#4a4d6a' }}>Lignes :</span>
          {options.map(n => (
            <button key={n} onClick={() => setShown(n)}
              className="px-2 py-0.5 rounded text-xs font-mono border transition-all"
              style={{ background: shown===n?'#1a3a5c':'#232640', borderColor: shown===n?'#4fc3f7':'#2a2d45', color: shown===n?'#4fc3f7':'#4a4d6a' }}>
              {n}
            </button>
          ))}
          {totalRows && <span className="text-xs font-mono ml-1" style={{ color:'#4a4d6a' }}>/ {totalRows.toLocaleString()}</span>}
        </div>
      </div>
      <div className="rounded-lg border overflow-auto" style={{ borderColor:'#2a2d45', maxHeight }}>
        <table className="text-xs font-mono" style={{ minWidth:'100%', borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, zIndex:1 }}>
            <tr style={{ background:'#232640' }}>
              <th className="px-2 py-1.5 text-center" style={{ color:'#4a4d6a', borderBottom:'1px solid #2a2d45', minWidth:36, position:'sticky', left:0, background:'#232640', zIndex:2 }}>#</th>
              {columns.map((c,i) => (
                <th key={i} className="px-3 py-1.5 text-left whitespace-nowrap"
                  style={{ color:'#4fc3f7', borderBottom:'1px solid #2a2d45', minWidth:90 }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown).map((row, i) => (
              <tr key={i} style={{ background: i%2===0?'#1a1d2e':'#15172a', borderBottom:'1px solid #1e2135' }}>
                <td className="px-2 py-1.5 text-center" style={{ color:'#4a4d6a', position:'sticky', left:0, background: i%2===0?'#1a1d2e':'#15172a', zIndex:1 }}>{i+1}</td>
                {(Array.isArray(row)?row:Object.values(row)).map((cell,j) => (
                  <td key={j} className="px-3 py-1.5 whitespace-nowrap" style={{ color:'#c8cad4' }}>
                    {cell===null||cell===undefined
                      ? <span style={{color:'#4a4d6a'}}>null</span>
                      : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs" style={{ color:'#4a4d6a' }}>
        Scroll horizontal ↔ et vertical ↕ disponibles · Affichage {Math.min(shown, rows.length)} / {rows.length} lignes reçues
      </p>
    </div>
  );
}

// ── Boîte d'explication ──────────────────────────────────────
function ExplainBox({ text, color='#4fc3f7' }) {
  return (
    <div className="flex gap-2 rounded-lg px-3 py-2.5 border"
      style={{ background: color+'08', borderColor: color+'30' }}>
      <Info size={14} style={{ color, flexShrink:0, marginTop:1 }} />
      <p className="text-xs leading-relaxed" style={{ color:'#c8cad4' }}>{text}</p>
    </div>
  );
}

// ── Card de phase collapsible ────────────────────────────────
function PhaseCard({ phase, active, done, children }) {
  const [open, setOpen] = useState(true);
  const meta = PHASE_META[phase];
  const Icon = meta?.icon || Database;
  return (
    <div className="rounded-xl border overflow-hidden" style={{
      borderColor: active ? meta?.color+'60' : done ? '#2a4a2a' : '#2a2d45',
    }}>
      <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: done?'#0d2a0d': active? meta?.color+'12':'#1a1d2e' }}
        onClick={() => (done||active) && setOpen(o=>!o)}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{
          background: done?'#4caf50': active? meta?.color+'25':'#232640',
          border: `1.5px solid ${done?'#4caf50': active? meta?.color:'#2a2d45'}`,
        }}>
          {done ? <CheckCircle size={15} style={{color:'#4caf50'}} />
                : active ? <Loader size={15} className="animate-spin" style={{color:meta?.color}} />
                : <span className="text-xs font-bold" style={{color:'#4a4d6a'}}>{phase}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: done?'#4caf50': active? meta?.color:'#4a4d6a' }}>Phase {phase}</p>
          <p className="text-sm font-semibold"
            style={{ color: done?'#81c784': active?'#e4e6f0':'#4a4d6a' }}>{meta?.label}</p>
        </div>
        {(done||active) && (open ? <ChevronUp size={14} style={{color:'#4a4d6a'}} /> : <ChevronDown size={14} style={{color:'#4a4d6a'}} />)}
      </button>
      {(active||done) && open && (
        <div className="p-4 space-y-4" style={{ background:'#0f1117' }}>
          <ExplainBox text={meta?.desc} color={meta?.color} />
          {children}
        </div>
      )}
    </div>
  );
}

// ── Histogramme RUL ──────────────────────────────────────────
function RULHistogram({ data }) {
  if (!data?.length) return null;
  const bins = 20;
  const min = Math.min(...data), max = Math.max(...data);
  const size = (max - min) / bins || 1;
  const counts = Array(bins).fill(0);
  data.forEach(v => { const i = Math.min(Math.floor((v-min)/size),bins-1); counts[i]++; });
  const hist = counts.map((count,i) => ({ range:`${Math.round(min+i*size)}`, count }));
  return (
    <div>
      <p className="text-xs mb-1" style={{color:'#8a8d9f'}}>Distribution du RUL — samples par tranche d'heures</p>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={hist} margin={{top:5,right:5,bottom:15,left:0}}>
          <XAxis dataKey="range" tick={{fill:'#4a4d6a',fontSize:8}} axisLine={false} tickLine={false} interval={3}
            label={{value:'heures',position:'insideBottom',offset:-8,fill:'#4a4d6a',fontSize:9}} />
          <YAxis hide />
          <Tooltip contentStyle={{background:'#232640',border:'1px solid #3d4172',borderRadius:6,fontSize:11}}
            formatter={(v,_,p) => [v+' samples', `~${p.payload.range}h`]} />
          <Bar dataKey="count" radius={[2,2,0,0]}>
            {hist.map((_,i) => <Cell key={i} fill={`hsl(${200+i*7},65%,55%)`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Tableau complet des 31 features ─────────────────────────
function FeaturesTable({ categories, featureCols }) {
  if (!featureCols?.length) return null;
  const catColors = { capteurs_bruts:'#4fc3f7', rolling_3h:'#81c784', rolling_24h:'#a5d6a7', composants:'#ffb74d', erreurs:'#f06292', machine:'#ce93d8' };
  const catLabels = { capteurs_bruts:'Capteurs bruts', rolling_3h:'Rolling 3h', rolling_24h:'Rolling 24h', composants:'Âge composants', erreurs:'Codes erreurs', machine:'Métadonnées machine' };
  const getDesc = f => f.includes('mean_3h')?'Moyenne glissante 3 dernières heures'
    : f.includes('std_3h') ?'Écart-type glissant 3h'
    : f.includes('mean_24h')?'Moyenne glissante 24h'
    : f.includes('std_24h') ?'Écart-type glissant 24h'
    : f.includes('_age')    ?'Jours depuis dernière maintenance'
    : f.startsWith('error') ?'Occurrence du code erreur (0 ou 1)'
    : f==='model_encoded'   ?'Type de machine encodé numériquement'
    : f==='machine_age_years'?'Âge de la machine en années'
    :'Mesure brute du capteur';
  return (
    <div className="space-y-3">
      <ExplainBox text="Les 31 features sont les entrées du modèle LSTM. Chacune capture un aspect différent de l'état de la machine. Le modèle apprend à les combiner pour estimer le RUL restant." color="#ffb74d" />
      {Object.entries(categories||{}).map(([cat,cols]) => cols?.length>0 && (
        <div key={cat} className="rounded-lg border p-3" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{background:catColors[cat]||'#8a8d9f'}} />
            <p className="text-xs font-semibold" style={{color:catColors[cat]||'#8a8d9f'}}>{catLabels[cat]||cat} ({cols.length})</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cols.map(c => (
              <span key={c} className="text-xs px-2 py-0.5 rounded font-mono border"
                style={{background:(catColors[cat]||'#8a8d9f')+'15',borderColor:(catColors[cat]||'#8a8d9f')+'40',color:catColors[cat]||'#8a8d9f'}}>
                {c}
              </span>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="text-xs font-semibold mb-1" style={{color:'#8a8d9f'}}>Liste complète — telle qu'utilisée dans les tenseurs (scrollable)</p>
        <div className="rounded-lg border overflow-auto" style={{borderColor:'#2a2d45',maxHeight:320}}>
          <table className="w-full text-xs font-mono" style={{borderCollapse:'collapse'}}>
            <thead style={{position:'sticky',top:0}}>
              <tr style={{background:'#232640'}}>
                {['#','Feature','Catégorie','Description'].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left whitespace-nowrap"
                    style={{color:'#8a8d9f',borderBottom:'1px solid #2a2d45'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureCols.map((f,i) => {
                const cat = Object.entries(categories||{}).find(([,cols])=>cols.includes(f));
                const color = cat ? catColors[cat[0]] : '#8a8d9f';
                return (
                  <tr key={f} style={{background: i%2===0?'#1a1d2e':'#15172a',borderBottom:'1px solid #1e2135'}}>
                    <td className="px-3 py-1.5 text-center" style={{color:'#4a4d6a'}}>{i+1}</td>
                    <td className="px-3 py-1.5 font-bold whitespace-nowrap" style={{color}}>{f}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{background:color+'20',color}}>{cat?catLabels[cat[0]]:'—'}</span>
                    </td>
                    <td className="px-3 py-1.5" style={{color:'#8a8d9f'}}>{getDesc(f)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-1 text-right" style={{color:'#4a4d6a'}}>↕ Scroll pour voir les {featureCols.length} features</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Panel principal
// ════════════════════════════════════════════════════════════
export default function IngestionPanel() {
  const [machineId,    setMachineId]    = useState(99);
  const [error,        setError]        = useState('');
  const [currentPhase, setCurrentPhase] = useState(0);
  const [finalDataframe, setFinalDataframe] = useState(null);
  const wsRef = useRef(null);

  const {
    ingestionStatus:  status,    setIngestionStatus: setStatus,
    ingestionResult:  finalResult, setIngestionResult: setFinalResult,
    ingestionDone,    setIngestionDone,
    filesData,        setFilesData,
    validation,       setValidation,
    mergeSteps,       setMergeSteps,
    featSteps,        setFeatSteps,
    tensorSteps,      setTensorSteps,
    resetIngestion,
  } = useApp();

  const donePhases = new Set(ingestionDone);
  const setDonePhases = (fn) => {
    const next = typeof fn === 'function' ? fn(donePhases) : fn;
    setIngestionDone([...next]);
  };

  const reset = () => {
    setError(''); setCurrentPhase(0); setFinalDataframe(null);
    resetIngestion();
  };

  const handleIngest = useCallback(async () => {
    reset(); setStatus('running');
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    try {
      await new Promise((resolve, reject) => {
        ws.onopen  = resolve;
        ws.onerror = () => reject(new Error('WebSocket refusé — serveur démarré ?'));
        setTimeout(() => reject(new Error('WebSocket timeout (5s)')), 5000);
      });
    } catch(e) { setError(e.message); setStatus('error'); return; }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch(msg.type) {
          case 'phase':
            setCurrentPhase(msg.phase);
            setDonePhases(prev => { const s=new Set(prev); if(msg.phase>1) s.add(msg.phase-1); return s; });
            break;
          case 'file_loaded':   setFilesData(prev => ({...prev,[msg.name]:msg})); break;
          case 'validation':    setValidation(msg); break;
          case 'merge_step':    setMergeSteps(prev => [...prev.filter(s=>s.step!==msg.step), msg]); break;
          case 'feature_step':  setFeatSteps(prev  => [...prev.filter(s=>s.step!==msg.step), msg]); break;
          case 'tensor_step':   setTensorSteps(prev=> [...prev.filter(s=>s.step!==msg.step), msg]); break;
          case 'final_dataframe': setFinalDataframe(msg); break;
          case 'completed':
            setFinalResult(msg); setCurrentPhase(0); setDonePhases(new Set([1,2,3,4])); break;
        }
      } catch(_) {}
    };
    ws.onerror = () => setError('Erreur WebSocket');

    try {
      const res  = await fetch(`${API}/api/ingest?machine_id=${machineId}`, {method:'POST'});
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||'Erreur serveur');
      setStatus('success');
    } catch(e) { setError(e.message); setStatus('error'); } finally { ws.close(); }
  }, [machineId]);

  const filesList = ['telemetry','machines','failures','errors','maint'];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{background:'linear-gradient(135deg,#1a3a5c,#0d4a6b)',border:'1px solid #4fc3f740'}}>
            <Database size={18} style={{color:'#4fc3f7'}} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{color:'#e4e6f0'}}>Pipeline de Données</h2>
            <p className="text-xs" style={{color:'#8a8d9f'}}>5 fichiers CSV · 4 phases · Streaming temps réel</p>
          </div>
        </div>
        {status !== 'idle' && (
          <button onClick={reset} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs"
            style={{borderColor:'#2a2d45',color:'#8a8d9f',background:'#1a1d2e'}}>
            <RefreshCw size={12}/> Réinitialiser
          </button>
        )}
      </div>

      {/* Config */}
      {status === 'idle' && (
        <div className="rounded-xl border p-4 grid grid-cols-2 gap-4" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
          <div>
            <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{color:'#8a8d9f'}}>Machine Cible</label>
            <input type="number" value={machineId} onChange={e=>setMachineId(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono border outline-none"
              style={{background:'#232640',borderColor:'#3d4172',color:'#4fc3f7'}} min={1} max={100} />
            <p className="text-xs mt-1" style={{color:'#4a4d6a'}}>Machine 99 = max pannes (recommandée pour le PFE)</p>
          </div>
          <div className="flex items-center">
            <ExplainBox text="Le pipeline va charger, fusionner, enrichir et normaliser les données en 4 phases avec visualisation temps réel de chaque étape." color="#4fc3f7" />
          </div>
        </div>
      )}

      {/* Bouton */}
      {status === 'idle' && (
        <button onClick={handleIngest}
          className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 text-base"
          style={{background:'linear-gradient(135deg,#0d3a5c,#0d4a6b)',color:'#4fc3f7',border:'1px solid #4fc3f760'}}>
          <Play size={18}/> Lancer le Pipeline d'Ingestion
        </button>
      )}

      {/* Progression */}
      {status === 'running' && (
        <div className="rounded-xl border p-4" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{color:'#e4e6f0'}}>Pipeline en cours...</span>
            <Loader size={14} className="animate-spin" style={{color:'#4fc3f7'}} />
          </div>
          <div className="flex gap-2">
            {[1,2,3,4].map(p => {
              const done=donePhases.has(p), active=currentPhase===p, meta=PHASE_META[p];
              return (
                <div key={p} className="flex-1 rounded-lg p-2.5 border text-center transition-all" style={{
                  background: done?'#0d2a0d': active? meta.color+'15':'#232640',
                  borderColor: done?'#4caf50': active? meta.color:'#2a2d45',
                }}>
                  <p className="text-lg font-bold" style={{color: done?'#4caf50': active? meta.color:'#4a4d6a'}}>
                    {done?'✓': active?'⟳':p}
                  </p>
                  <p className="text-xs leading-tight mt-0.5" style={{color: done?'#4caf50': active? meta.color:'#4a4d6a'}}>
                    {meta.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Erreur */}
      {status === 'error' && (
        <div className="rounded-xl border p-4 flex gap-3" style={{background:'#2a0d0d',borderColor:'#f44336'}}>
          <AlertCircle size={18} style={{color:'#f44336',flexShrink:0}} />
          <p className="text-sm font-mono" style={{color:'#f06292'}}>{error}</p>
        </div>
      )}

      {/* ─── PHASE 1 ─── */}
      {(currentPhase>=1||donePhases.has(1)) && (
        <PhaseCard phase={1} active={currentPhase===1} done={donePhases.has(1)}>
          <div className="space-y-4">
            {filesList.map(name => {
              const f=filesData[name], color=FILE_COLORS[name];
              return (
                <div key={name} className="rounded-lg border overflow-hidden" style={{borderColor:'#2a2d45'}}>
                  <div className="flex items-start gap-3 px-3 py-2.5" style={{background:'#232640'}}>
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1" style={{background:color}} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm font-bold" style={{color}}>PdM_{name}.csv</p>
                      <p className="text-xs mt-0.5" style={{color:'#8a8d9f'}}>{FILE_DESC[name]}</p>
                    </div>
                    {f ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-mono" style={{color:'#4a4d6a'}}>{f.rows?.toLocaleString()} × {f.cols}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                          style={{background: f.status==='OK'?'#0d2a1a':'#2a1a0a', color: f.status==='OK'?'#4caf50':'#ff9800'}}>
                          {f.status}
                        </span>
                        {f.nan>0 && <span className="text-xs" style={{color:'#ff9800'}}>⚠ {f.nan} NaN</span>}
                        {f.dup>0 && <span className="text-xs" style={{color:'#ff9800'}}>⚠ {f.dup} doublons</span>}
                      </div>
                    ) : <Loader size={12} className="animate-spin flex-shrink-0" style={{color:'#4a4d6a'}} />}
                  </div>
                  {f && (
                    <div className="px-3 pb-3 pt-2" style={{background:'#0f1117'}}>
                      <DataTable columns={f.columns} rows={f.preview} totalRows={f.rows}
                        caption={`Aperçu — ${f.rows?.toLocaleString()} lignes au total dans ce fichier`} />
                    </div>
                  )}
                </div>
              );
            })}
            {validation && (
              <div className="rounded-lg border p-3" style={{background:'#0d2a1a',borderColor:'#4caf50'}}>
                <p className="text-xs font-semibold mb-2" style={{color:'#4caf50'}}>✓ Validation globale</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
                  {[
                    {l:'Fréquence', v: validation.freq_ok?'1h exacte ✓':'Irrégulière ✗', c: validation.freq_ok?'#4caf50':'#f44336'},
                    {l:'Début',     v: validation.period_start?.split(' ')[0], c:'#e4e6f0'},
                    {l:'Fin',       v: validation.period_end?.split(' ')[0],   c:'#e4e6f0'},
                    {l:'Machines',  v: validation.n_machines,                  c:'#4fc3f7'},
                  ].map(item => (
                    <div key={item.l} className="flex justify-between gap-2">
                      <span style={{color:'#8a8d9f'}}>{item.l} :</span>
                      <span style={{color:item.c}}>{item.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PhaseCard>
      )}

      {/* ─── PHASE 2 ─── */}
      {(currentPhase>=2||donePhases.has(2)) && (
        <PhaseCard phase={2} active={currentPhase===2} done={donePhases.has(2)}>
          <div className="space-y-4">
            {mergeSteps.sort((a,b)=>a.step-b.step).map(step => (
              <div key={step.step} className="rounded-lg border overflow-hidden" style={{borderColor:'#2a2d45'}}>
                <div className="flex items-center gap-2 px-3 py-2" style={{background:'#232640'}}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:'#81c78420',color:'#81c784',border:'1px solid #81c78450'}}>{step.step}</span>
                  <span className="text-sm font-semibold" style={{color:'#e4e6f0'}}>{step.label}</span>
                  <span className="ml-auto text-xs font-mono" style={{color:'#4a4d6a'}}>
                    {step.rows?.toLocaleString()} lignes · {step.cols} colonnes
                  </span>
                </div>
                <div className="px-3 pb-3 pt-2 space-y-3" style={{background:'#0f1117'}}>
                  {/* Explication méthodologique */}
                  {step.explain && <ExplainBox text={step.explain} color="#81c784" />}

                  {/* Méthode (code Python) */}
                  {step.method && (
                    <div className="rounded-lg border p-2" style={{background:'#0a0c14',borderColor:'#2a2d45'}}>
                      <p className="text-xs font-semibold mb-1" style={{color:'#4a4d6a'}}>📝 Méthode :</p>
                      <code className="text-xs font-mono" style={{color:'#81c784'}}>{step.method}</code>
                    </div>
                  )}

                  {/* Transformations détaillées */}
                  {step.transformations?.length>0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{color:'#8a8d9f'}}>🔧 Transformations effectuées :</p>
                      <ul className="space-y-1">
                        {step.transformations.map((t,i) => (
                          <li key={i} className="text-xs flex items-start gap-2" style={{color:'#c8cad4'}}>
                            <span style={{color:'#81c784'}}>▸</span>
                            <span className="font-mono">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Colonnes ajoutées */}
                  {step.new_cols?.length>0 && (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-xs font-semibold" style={{color:'#8a8d9f'}}>✨ Nouvelles colonnes :</span>
                      {step.new_cols.map(c => (
                        <span key={c} className="text-xs px-2 py-0.5 rounded font-mono border"
                          style={{background:'#81c78415',borderColor:'#81c78440',color:'#81c784'}}>{c}</span>
                      ))}
                    </div>
                  )}

                  {/* Stats erreurs */}
                  {step.err_total !== undefined && step.err_total > 0 && (
                    <div className="text-xs font-mono" style={{color:'#ffb74d'}}>
                      📊 Total occurrences d'erreurs : <span className="font-bold">{step.err_total.toLocaleString()}</span>
                    </div>
                  )}

                  {/* Stats failures */}
                  {step.failure_counts && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{color:'#8a8d9f'}}>📊 Distribution des pannes :</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(step.failure_counts).map(([k,v]) => (
                          <span key={k} className="text-xs px-2 py-0.5 rounded border font-mono"
                            style={{background: k==='none'?'#4caf5015':'#f0629215', borderColor: k==='none'?'#4caf5040':'#f0629240', color: k==='none'?'#4caf50':'#f06292'}}>
                            {k} : {v.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  {step.note && (
                    <div className="text-xs italic px-2 py-1 rounded" style={{background:'#1a1d2e', color:'#8a8d9f', borderLeft:'2px solid #ffb74d'}}>
                      💡 {step.note}
                    </div>
                  )}

                  <DataTable columns={step.columns} rows={step.preview} totalRows={step.rows}
                    caption="Aperçu du DataFrame après cette étape" />
                </div>
              </div>
            ))}
          </div>
        </PhaseCard>
      )}

      {/* ─── PHASE 3 ─── */}
      {(currentPhase>=3||donePhases.has(3)) && (
        <PhaseCard phase={3} active={currentPhase===3} done={donePhases.has(3)}>
          <div className="space-y-4">
            {featSteps.sort((a,b)=>a.step-b.step).map(step => (
              <div key={step.step} className="rounded-lg border overflow-hidden" style={{borderColor:'#2a2d45'}}>
                <div className="flex items-center gap-2 px-3 py-2" style={{background:'#232640'}}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:'#ffb74d20',color:'#ffb74d',border:'1px solid #ffb74d50'}}>{step.step}</span>
                  <span className="text-sm font-semibold" style={{color:'#e4e6f0'}}>{step.label}</span>
                  {step.n_new && <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded" style={{background:'#ffb74d15',color:'#ffb74d'}}>+{step.n_new} features</span>}
                </div>
                <div className="px-3 pb-3 pt-2 space-y-3" style={{background:'#0f1117'}}>
                  {/* Explication méthodologique */}
                  {step.explain && <ExplainBox text={step.explain} color="#ffb74d" />}
                  {step.description && !step.explain && <ExplainBox text={step.description} color="#ffb74d" />}

                  {/* Méthode (code Python) */}
                  {step.method && (
                    <div className="rounded-lg border p-2" style={{background:'#0a0c14',borderColor:'#2a2d45'}}>
                      <p className="text-xs font-semibold mb-1" style={{color:'#4a4d6a'}}>📝 Méthode :</p>
                      <code className="text-xs font-mono" style={{color:'#ffb74d'}}>{step.method}</code>
                    </div>
                  )}

                  {/* Transformations détaillées */}
                  {step.transformations?.length>0 && (
                    <div>
                      <p className="text-xs font-semibold mb-1.5" style={{color:'#8a8d9f'}}>🔧 Détails des transformations :</p>
                      <ul className="space-y-1">
                        {step.transformations.map((t,i) => (
                          <li key={i} className="text-xs flex items-start gap-2" style={{color:'#c8cad4'}}>
                            <span style={{color:'#ffb74d'}}>▸</span>
                            <span className="font-mono">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {step.step===1 && (
                    <DataTable columns={step.preview_cols} rows={step.preview}
                      caption="Aperçu du DataFrame avec les rolling features" />
                  )}

                  {step.step===2 && (
                    <>
                      <div className="grid grid-cols-4 gap-2">
                        {step.cols?.map(c => {
                          const s=step.stats?.[c];
                          return (
                            <div key={c} className="rounded-lg p-2.5 border text-center" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
                              <p className="text-xs font-mono font-bold" style={{color:'#ce93d8'}}>{c}</p>
                              <p className="text-xs mt-1" style={{color:'#8a8d9f'}}>moy : <span style={{color:'#e4e6f0'}}>{s?.mean}j</span></p>
                              <p className="text-xs" style={{color:'#8a8d9f'}}>max : <span style={{color:'#f06292'}}>{s?.max}j</span></p>
                              <p className="text-xs" style={{color:'#8a8d9f'}}>min : <span style={{color:'#4caf50'}}>{s?.min}j</span></p>
                            </div>
                          );
                        })}
                      </div>
                      <DataTable columns={step.preview_cols} rows={step.preview} caption="Âge des 4 composants en jours" />
                    </>
                  )}

                  {step.step===3 && (
                    <>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          {label:'Moyenne',   value:`${step.rul_mean}h`,   color:'#4fc3f7'},
                          {label:'Médiane',   value:`${step.rul_median}h`, color:'#81c784'},
                          {label:'Min',       value:`${step.rul_min}h`,    color:'#4caf50'},
                          {label:'Max',       value:`${step.rul_max}h`,    color:'#ffb74d'},
                          {label:'Supprimés', value:step.n_removed?.toLocaleString(), color:'#f06292'},
                        ].map(s => (
                          <div key={s.label} className="rounded-lg px-2 py-2 border text-center" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
                            <p className="text-xs" style={{color:'#8a8d9f'}}>{s.label}</p>
                            <p className="text-base font-bold font-mono" style={{color:s.color}}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <ExplainBox
                        text={`${step.n_removed?.toLocaleString()} lignes supprimées = après la dernière panne de chaque machine (RUL inconnu). Reste ${step.n_samples?.toLocaleString()} samples valides.`}
                        color="#f06292" />
                      <RULHistogram data={step.histogram} />
                      {step.failure_timeline?.length>0 && (
                        <div>
                          <p className="text-xs font-semibold mb-1.5" style={{color:'#8a8d9f'}}>
                            Timeline des {step.failure_timeline.length} pannes — Machine {machineId}
                          </p>
                          <div className="overflow-auto rounded-lg border" style={{borderColor:'#2a2d45',maxHeight:160}}>
                            <table className="w-full text-xs font-mono" style={{borderCollapse:'collapse'}}>
                              <thead style={{position:'sticky',top:0}}>
                                <tr style={{background:'#232640'}}>
                                  {['#','Date & heure','Type de panne'].map(h => (
                                    <th key={h} className="px-3 py-1.5 text-left" style={{color:'#8a8d9f',borderBottom:'1px solid #2a2d45'}}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {step.failure_timeline.map((f,i) => (
                                  <tr key={i} style={{background: i%2===0?'#1a1d2e':'#15172a',borderBottom:'1px solid #1e2135'}}>
                                    <td className="px-3 py-1" style={{color:'#4a4d6a'}}>{i+1}</td>
                                    <td className="px-3 py-1" style={{color:'#f06292'}}>{f.datetime}</td>
                                    <td className="px-3 py-1 font-bold" style={{color:'#e4e6f0'}}>{f.failure}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      <DataTable columns={step.preview_cols} rows={step.preview} caption="Exemple de valeurs RUL calculées (heures)" />
                    </>
                  )}

                  {step.step===4 && (
                    <FeaturesTable categories={step.categories} featureCols={step.feature_cols} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </PhaseCard>
      )}

      {/* ─── PHASE 4 ─── */}
      {(currentPhase>=4||donePhases.has(4)) && (
        <PhaseCard phase={4} active={currentPhase===4} done={donePhases.has(4)}>
          <div className="space-y-4">
            {tensorSteps.sort((a,b)=>a.step-b.step).map(step => (
              <div key={step.step} className="rounded-lg border overflow-hidden" style={{borderColor:'#2a2d45'}}>
                <div className="flex items-center gap-2 px-3 py-2" style={{background:'#232640'}}>
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:'#ce93d820',color:'#ce93d8',border:'1px solid #ce93d850'}}>{step.step}</span>
                  <span className="text-sm font-semibold" style={{color:'#e4e6f0'}}>{step.label}</span>
                </div>
                <div className="px-3 pb-3 pt-2 space-y-3" style={{background:'#0f1117'}}>
                  {/* Explication méthodologique */}
                  {step.explain && <ExplainBox text={step.explain} color="#ce93d8" />}
                  {step.note && !step.explain && <ExplainBox text={step.note} color="#ce93d8" />}

                  {/* Méthode (code) */}
                  {step.method && (
                    <div className="rounded-lg border p-2" style={{background:'#0a0c14',borderColor:'#2a2d45'}}>
                      <p className="text-xs font-semibold mb-1" style={{color:'#4a4d6a'}}>📝 Méthode :</p>
                      <code className="text-xs font-mono" style={{color:'#ce93d8'}}>{step.method}</code>
                    </div>
                  )}

                  {/* Note additionnelle */}
                  {step.note && step.explain && (
                    <div className="text-xs italic px-2 py-1 rounded" style={{background:'#1a1d2e', color:'#8a8d9f', borderLeft:'2px solid #ce93d8'}}>
                      💡 {step.note}
                    </div>
                  )}

                  {step.step===1 && (
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {label:'Train samples', value:step.train_rows?.toLocaleString(), color:'#81c784'},
                        {label:'Test samples',  value:step.test_rows?.toLocaleString(),  color:'#4fc3f7'},
                        {label:'Ratio',         value:step.split_ratio,                  color:'#ffb74d'},
                      ].map(s => (
                        <div key={s.label} className="rounded-lg p-3 border text-center" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
                          <p className="text-xs" style={{color:'#8a8d9f'}}>{s.label}</p>
                          <p className="text-xl font-bold font-mono" style={{color:s.color}}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {step.step===2 && step.feature_names && (
                    <div className="overflow-auto rounded-lg border" style={{borderColor:'#2a2d45',maxHeight:220}}>
                      <table className="w-full text-xs font-mono" style={{borderCollapse:'collapse'}}>
                        <thead style={{position:'sticky',top:0}}>
                          <tr style={{background:'#232640'}}>
                            {['Feature','Min original','Max original','Après MinMaxScaler'].map(h => (
                              <th key={h} className="px-3 py-1.5 text-left" style={{color:'#8a8d9f',borderBottom:'1px solid #2a2d45'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {step.feature_names.map((name,i) => (
                            <tr key={i} style={{background: i%2===0?'#1a1d2e':'#15172a',borderBottom:'1px solid #1e2135'}}>
                              <td className="px-3 py-1.5 font-bold" style={{color:'#4fc3f7'}}>{name}</td>
                              <td className="px-3 py-1.5" style={{color:'#f06292'}}>{step.feature_min?.[i]}</td>
                              <td className="px-3 py-1.5" style={{color:'#4caf50'}}>{step.feature_max?.[i]}</td>
                              <td className="px-3 py-1.5 font-bold" style={{color:'#ce93d8'}}>0.0 → 1.0</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {step.step===3 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          {label:'X_train', value:step.X_train_shape?.join(' × '), color:'#81c784'},
                          {label:'X_test',  value:step.X_test_shape?.join(' × '),  color:'#4fc3f7'},
                          {label:'y_train', value:step.y_train_shape?.join(' × '), color:'#ffb74d'},
                          {label:'y_test',  value:step.y_test_shape?.join(' × '),  color:'#ce93d8'},
                        ].map(s => (
                          <div key={s.label} className="rounded-lg px-3 py-2.5 border" style={{background:'#1a1d2e',borderColor:'#2a2d45'}}>
                            <p className="text-xs" style={{color:'#8a8d9f'}}>{s.label} shape</p>
                            <p className="text-base font-bold font-mono" style={{color:s.color}}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                      {step.seq_example && (
                        <>
                          <ExplainBox text={`Chaque sample = fenêtre de ${step.lookback}h consécutives. Exemple ci-dessous : 3 premiers timesteps d'un bloc 3D (5 features / 31 affichées). Le modèle reçoit ce bloc et prédit le RUL à t+1.`} color="#ce93d8" />
                          <div className="overflow-auto rounded-lg border" style={{borderColor:'#2a2d45'}}>
                            <table className="text-xs font-mono" style={{borderCollapse:'collapse',minWidth:'100%'}}>
                              <thead>
                                <tr style={{background:'#232640'}}>
                                  <th className="px-3 py-1.5 text-left whitespace-nowrap" style={{color:'#8a8d9f',borderBottom:'1px solid #2a2d45'}}>Timestep</th>
                                  {step.seq_labels?.map(l => (
                                    <th key={l} className="px-3 py-1.5 text-left whitespace-nowrap" style={{color:'#4fc3f7',borderBottom:'1px solid #2a2d45'}}>{l}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {step.seq_example?.map((row,i) => (
                                  <tr key={i} style={{background: i%2===0?'#1a1d2e':'#15172a',borderBottom:'1px solid #1e2135'}}>
                                    <td className="px-3 py-1.5 font-bold" style={{color:'#ce93d8'}}>t − {step.lookback-i}h</td>
                                    {(Array.isArray(row)?row:[row]).map((val,j) => (
                                      <td key={j} className="px-3 py-1.5" style={{color:'#c8cad4'}}>
                                        {typeof val==='number'?val.toFixed(5):val}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PhaseCard>
      )}

      {/* ─── GRAND TABLEAU FINAL : Toutes les features avec valeurs ─── */}
      {finalDataframe && (
        <div className="rounded-xl border overflow-hidden" style={{ background:'#0f1117', borderColor:'#ce93d8' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ background:'linear-gradient(135deg,#1a0d2a,#0d1a2a)' }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background:'#ce93d825', border:'1.5px solid #ce93d8' }}>
                <Layers size={14} style={{ color:'#ce93d8' }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color:'#e4e6f0' }}>{finalDataframe.label}</p>
                <p className="text-xs" style={{ color:'#8a8d9f' }}>
                  Données prêtes pour l'entraînement · {finalDataframe.total_rows?.toLocaleString()} lignes au total
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2 py-1 rounded" style={{ background:'#ce93d815', color:'#ce93d8' }}>
                {finalDataframe.columns?.length} colonnes
              </span>
              <span className="px-2 py-1 rounded" style={{ background:'#4fc3f715', color:'#4fc3f7' }}>
                {finalDataframe.n_features} features
              </span>
              <span className="px-2 py-1 rounded" style={{ background:'#4caf5015', color:'#4caf50' }}>
                Machine {finalDataframe.machine_id}
              </span>
            </div>
          </div>

          <div className="p-4">
            <ExplainBox
              text={`Voici le DataFrame complet utilisé pour entraîner le modèle. Chaque ligne représente une mesure horaire avec ses ${finalDataframe.n_features} features calculées et la cible RUL. Le modèle LSTM va apprendre à prédire la colonne RUL à partir des autres colonnes.`}
              color="#ce93d8"
            />
            <div className="mt-3">
              <DataTable
                columns={finalDataframe.columns}
                rows={finalDataframe.preview}
                totalRows={finalDataframe.total_rows}
                maxHeight={500}
                defaultRows={20}
                options={[10, 20, 50, 100]}
              />
            </div>
          </div>
        </div>
      )}

      {/* Résultat final */}
      {finalResult && (
        <div className="rounded-xl border p-5 space-y-3" style={{background:'#0d2a1a',borderColor:'#4caf50'}}>
          <div className="flex items-center gap-3">
            <CheckCircle size={24} style={{color:'#4caf50'}} />
            <div>
              <p className="text-lg font-bold" style={{color:'#81c784'}}>Pipeline terminé avec succès !</p>
              <p className="text-sm" style={{color:'#4a4d6a'}}>Données prêtes — passez à l'onglet Entraînement</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              {label:'X_train',  value:finalResult.X_train?.join(' × '), color:'#81c784'},
              {label:'X_test',   value:finalResult.X_test?.join(' × '),  color:'#4fc3f7'},
              {label:'Features', value:finalResult.n_features,            color:'#ffb74d'},
              {label:'Statut',   value:'✓ Prêt',                         color:'#4caf50'},
            ].map(s => (
              <div key={s.label} className="rounded-lg px-3 py-2 border" style={{background:'#0f1117',borderColor:'#2a4a2a'}}>
                <p className="text-xs" style={{color:'#8a8d9f'}}>{s.label}</p>
                <p className="text-base font-bold font-mono" style={{color:s.color}}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}