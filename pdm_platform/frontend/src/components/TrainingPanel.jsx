/**
 * TrainingPanel.jsx — Entraînement avec visualisation temps réel complète
 * Barre Keras style · Graphes live · Résultats dénormalisés détaillés
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { BrainCircuit, Play, Loader, CheckCircle, RefreshCw, Info } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';

const API    = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';
const ARCH_COLORS = { LSTM:'#4fc3f7', GRU:'#81c784', RNN:'#ffb74d', Transformer:'#ce93d8' };

// ── Boîte info ───────────────────────────────────────────────
function InfoBox({ text, color='#4fc3f7' }) {
  return (
    <div className="flex gap-2 rounded-lg px-3 py-2 border"
      style={{ background:color+'08', borderColor:color+'30' }}>
      <Info size={13} style={{ color, flexShrink:0, marginTop:1 }} />
      <p className="text-xs leading-relaxed" style={{ color:'#c8cad4' }}>{text}</p>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────
function Stat({ label, value, color='#4fc3f7', sub }) {
  return (
    <div className="rounded-lg px-3 py-2.5 border" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
      <p className="text-xs" style={{ color:'#8a8d9f' }}>{label}</p>
      <p className="text-lg font-bold font-mono" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color:'#4a4d6a' }}>{sub}</p>}
    </div>
  );
}

// ── Barre de progression style Keras ─────────────────────────
function KerasEpochBar({ epoch }) {
  if (!epoch) return null;
  const pct   = Math.min((epoch.epoch / epoch.total) * 100, 100);
  const filled = Math.round(pct / 5);   // 20 blocs max
  const bar   = '━'.repeat(filled) + '╌'.repeat(20 - filled);

  return (
    <div className="rounded-lg border p-3 font-mono text-xs space-y-2"
      style={{ background:'#0a0c14', borderColor:'#2a2d45' }}>
      {/* Ligne principale style terminal Keras */}
      <div style={{ color:'#e4e6f0' }}>
        <span style={{ color:'#4fc3f7' }}>Epoch {epoch.epoch}/{epoch.total}</span>
        {' '}
        <span style={{ color:'#8a8d9f' }}>207/207</span>
        {' '}
        <span style={{ color: pct < 100 ? '#ffb74d' : '#4caf50' }}>{bar}</span>
        {' '}
        <span style={{ color:'#4a4d6a' }}>{epoch.elapsed || '—'}s</span>
        {' — '}
        <span style={{ color:'#f06292' }}>loss: </span>
        <span style={{ color:'#e4e6f0' }}>{epoch.loss?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'#ffb74d' }}>mae: </span>
        <span style={{ color:'#e4e6f0' }}>{epoch.mae?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'#ce93d8' }}>val_loss: </span>
        <span style={{ color:'#e4e6f0' }}>{epoch.val_loss?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'#81c784' }}>val_mae: </span>
        <span style={{ color:'#e4e6f0' }}>{epoch.val_mae?.toFixed(4)}</span>
      </div>
      {/* Barre de progression visuelle */}
      <div className="w-full rounded-full overflow-hidden" style={{ height:4, background:'#232640' }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width:`${pct}%`, background: pct<100?'#4fc3f7':'#4caf50' }} />
      </div>
    </div>
  );
}

// ── Historique époques scrollable ─────────────────────────────
function EpochHistory({ epochs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [epochs]);
  if (!epochs.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold mb-1.5" style={{ color:'#8a8d9f' }}>Historique des époques</p>
      <div ref={ref} className="rounded-lg border overflow-auto font-mono text-xs"
        style={{ background:'#0a0c14', borderColor:'#2a2d45', maxHeight:180 }}>
        <table className="w-full" style={{ borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:'#232640' }}>
            <tr>
              {['Époque','Loss','Val Loss','MAE','Val MAE'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left whitespace-nowrap"
                  style={{ color:'#8a8d9f', borderBottom:'1px solid #2a2d45', fontSize:10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {epochs.map((e, i) => {
              const isLast = i === epochs.length - 1;
              const isBest = e.val_loss === Math.min(...epochs.map(x => x.val_loss));
              return (
                <tr key={e.epoch} style={{
                  background: isLast ? '#1a3a5c40' : isBest ? '#0d2a1a' : i%2===0 ? '#0f1117' : '#0a0c14',
                  borderBottom:'1px solid #1e2135',
                }}>
                  <td className="px-3 py-1" style={{ color: isBest?'#4caf50': isLast?'#4fc3f7':'#8a8d9f' }}>
                    {e.epoch}{isBest?' 🏆':''}
                  </td>
                  <td className="px-3 py-1" style={{ color:'#f06292' }}>{e.loss?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'#ce93d8' }}>{e.val_loss?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'#ffb74d' }}>{e.mae?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'#81c784' }}>{e.val_mae?.toFixed(6)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Graphes loss + MAE live ───────────────────────────────────
function LiveCharts({ epochs }) {
  if (!epochs.length) return (
    <div className="flex items-center justify-center h-32 rounded-lg border"
      style={{ borderColor:'#2a2d45', color:'#4a4d6a' }}>
      <p className="text-sm">En attente des premières époques...</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {/* Loss */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>
          Loss (MSE) — Train vs Validation
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={epochs} margin={{ top:5, right:10, bottom:5, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
            <XAxis dataKey="epoch" tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} />
            <YAxis tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} width={60} tickFormatter={v=>v.toFixed(4)} />
            <Tooltip contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8 }}
              formatter={(v,n) => [v?.toFixed(6), n]} labelFormatter={l=>`Époque ${l}`} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Line type="monotone" dataKey="loss"     stroke="#f06292" dot={false} strokeWidth={2} name="Train Loss" />
            <Line type="monotone" dataKey="val_loss" stroke="#ce93d8" dot={false} strokeWidth={2} name="Val Loss" strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* MAE */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>
          MAE — Train vs Validation
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={epochs} margin={{ top:5, right:10, bottom:5, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
            <XAxis dataKey="epoch" tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} />
            <YAxis tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} width={60} tickFormatter={v=>v.toFixed(4)} />
            <Tooltip contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8 }}
              formatter={(v,n) => [v?.toFixed(6), n]} labelFormatter={l=>`Époque ${l}`} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Line type="monotone" dataKey="mae"     stroke="#ffb74d" dot={false} strokeWidth={2} name="Train MAE" />
            <Line type="monotone" dataKey="val_mae" stroke="#81c784" dot={false} strokeWidth={2} name="Val MAE" strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Graphe Trials AutoML ─────────────────────────────────────
function TrialsView({ trials, maxTrials }) {
  if (!trials.length) return null;
  const bestLoss = Math.min(...trials.map(t => t.avg_cv_loss));
  return (
    <div className="space-y-3">
      <InfoBox text="Optimisation Bayésienne : chaque essai teste une combinaison d'hyperparamètres différente. La CV Loss (TimeSeriesSplit 5 plis) mesure la généralisation. L'essai avec la CV Loss minimale sera retenu pour l'entraînement final." color="#ce93d8" />
      <p className="text-xs font-semibold" style={{ color:'#8a8d9f' }}>
        CV Loss par essai — {trials.length}/{maxTrials} terminés
        {trials.length > 0 && <span style={{ color:'#4caf50' }}> · Meilleur : essai #{trials.find(t=>t.avg_cv_loss===bestLoss)?.trial} ({bestLoss.toFixed(5)})</span>}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={trials} margin={{ top:5, right:10, bottom:5, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
          <XAxis dataKey="trial" tick={{ fill:'#8a8d9f', fontSize:9 }}
            label={{ value:'Essai', position:'insideBottom', offset:-2, fill:'#4a4d6a', fontSize:9 }} />
          <YAxis tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} width={60} tickFormatter={v=>v.toFixed(4)} />
          <Tooltip contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8 }}
            formatter={(v) => [v?.toFixed(6), 'CV Loss']} labelFormatter={l=>`Essai #${l}`} />
          <Bar dataKey="avg_cv_loss" radius={[3,3,0,0]} maxBarSize={35}>
            {trials.map((t,i) => (
              <Cell key={i} fill={t.avg_cv_loss===bestLoss ? '#4caf50' : '#4fc3f7'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Tableau classement */}
      <div className="overflow-auto rounded-lg border" style={{ borderColor:'#2a2d45', maxHeight:200 }}>
        <table className="w-full text-xs font-mono" style={{ borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:'#232640' }}>
            <tr>
              {['Rang','Essai #','CV Loss moy.','Durée','Statut'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left" style={{ color:'#8a8d9f', borderBottom:'1px solid #2a2d45' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...trials].sort((a,b)=>a.avg_cv_loss-b.avg_cv_loss).map((t,i) => (
              <tr key={t.trial} style={{ background: i===0?'#0d2a1a': i%2===0?'#1a1d2e':'#15172a', borderBottom:'1px solid #1e2135' }}>
                <td className="px-3 py-1.5" style={{ color: i===0?'#ffb74d':'#4a4d6a' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                <td className="px-3 py-1.5 font-bold" style={{ color: i===0?'#4caf50':'#e4e6f0' }}>#{t.trial}</td>
                <td className="px-3 py-1.5" style={{ color: i===0?'#4caf50':'#8a8d9f' }}>{t.avg_cv_loss?.toFixed(6)}</td>
                <td className="px-3 py-1.5" style={{ color:'#4a4d6a' }}>{t.duration}s</td>
                <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: i===0?'#0d2a1a':'#232640', color: i===0?'#4caf50':'#8a8d9f' }}>
                  {i===0?'✓ Meilleur':'Terminé'}
                </span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Résultats finaux & prédictions ───────────────────────────
function PredictionsView({ data, hyperparams }) {
  if (!data) return null;
  const { y_true, y_pred, errors, r2_score, mae_hours, rmse_hours } = data;
  const maxVal = Math.max(...y_true, ...y_pred, 1);
  const scatter = y_true.map((v,i) => ({ real:v, pred:y_pred[i], err:errors[i] }));

  // Bins erreurs
  const errBins = [
    { range:'0–5h',   count: errors.filter(e=>e<=5).length,           color:'#4caf50' },
    { range:'5–10h',  count: errors.filter(e=>e>5&&e<=10).length,     color:'#81c784' },
    { range:'10–20h', count: errors.filter(e=>e>10&&e<=20).length,    color:'#ffb74d' },
    { range:'20–50h', count: errors.filter(e=>e>20&&e<=50).length,    color:'#f06292' },
    { range:'>50h',   count: errors.filter(e=>e>50).length,           color:'#f44336' },
  ];

  return (
    <div className="space-y-5">
      <InfoBox
        text="Résultats sur le jeu de test (20% chronologique — données jamais vues pendant l'entraînement). Les valeurs sont dénormalisées : reconverties en heures réelles via inverse_transform du scaler_y."
        color="#4caf50"
      />

      {/* Métriques globales */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color:'#8a8d9f' }}>Métriques finales (dénormalisées)</p>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="R² Score"    value={r2_score?.toFixed(4)}          color="#4caf50"  sub="Plus proche de 1 = meilleur" />
          <Stat label="MAE (heures)"value={`${mae_hours?.toFixed(1)}h`}   color="#4fc3f7"  sub="Erreur absolue moyenne" />
          <Stat label="RMSE (h)"    value={rmse_hours ? `${rmse_hours?.toFixed(1)}h` : '—'} color="#ffb74d" sub="Sensible aux grands écarts" />
          <Stat label="Échantillons"value={y_true.length}                  color="#ce93d8"  sub="Points de test" />
        </div>
      </div>

      {/* Hyperparamètres retenus */}
      {hyperparams && (
        <div className="rounded-lg border p-3" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <p className="text-xs font-semibold mb-2" style={{ color:'#8a8d9f' }}>Hyperparamètres du modèle retenu</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(hyperparams).map(([k,v]) => (
              <div key={k} className="text-xs font-mono px-2 py-1 rounded border"
                style={{ background:'#232640', borderColor:'#3d4172', color:'#4fc3f7' }}>
                <span style={{ color:'#8a8d9f' }}>{k}: </span>
                <span>{JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scatter : prédit vs réel */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>RUL Prédit vs RUL Réel (heures)</p>
        <InfoBox text="Chaque point = un sample du jeu de test. La ligne verte diagonale = prédiction parfaite. Plus les points s'en rapprochent, meilleur est le modèle." color="#4caf50" />
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top:10, right:10, bottom:30, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
              <XAxis type="number" dataKey="real" name="Réel" tick={{ fill:'#8a8d9f', fontSize:9 }}
                label={{ value:'RUL Réel (heures)', position:'insideBottom', offset:-15, fill:'#4a4d6a', fontSize:10 }} />
              <YAxis type="number" dataKey="pred" name="Prédit" tick={{ fill:'#8a8d9f', fontSize:9 }} width={55}
                label={{ value:'RUL Prédit (h)', angle:-90, position:'insideLeft', fill:'#4a4d6a', fontSize:10 }} />
              <Tooltip cursor={{ strokeDasharray:'3 3' }}
                contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8, fontSize:11 }}
                formatter={(v,n) => [`${v?.toFixed(1)}h`, n]} />
              <ReferenceLine segment={[{x:0,y:0},{x:maxVal,y:maxVal}]} stroke="#4caf50" strokeWidth={1.5} strokeDasharray="4 2" label={{ value:'Parfait', fill:'#4caf50', fontSize:9 }} />
              <Scatter data={scatter.slice(0,300)} fill="#4fc3f7" fillOpacity={0.45} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Courbe temporelle */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>
          Évolution temporelle — RUL Réel vs Prédit (200 premiers samples)
        </p>
        <InfoBox text="Vue chronologique : les deux courbes devraient se superposer au maximum. Les écarts indiquent les zones où le modèle a plus de mal à prédire (ex: pic de RUL juste après une panne)." color="#4fc3f7" />
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={y_true.slice(0,200).map((v,i)=>({ i, real:v, pred:y_pred[i] }))}
              margin={{ top:5, right:10, bottom:5, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
              <XAxis dataKey="i" tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} />
              <YAxis tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={{ stroke:'#2a2d45' }} width={55} tickFormatter={v=>`${Math.round(v)}h`} />
              <Tooltip contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8 }}
                formatter={(v) => [`${v?.toFixed(1)}h`]} labelFormatter={l=>`Sample #${l}`} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Line type="monotone" dataKey="real" stroke="#4caf50" dot={false} strokeWidth={2} name="RUL Réel" />
              <Line type="monotone" dataKey="pred" stroke="#4fc3f7" dot={false} strokeWidth={2} name="RUL Prédit" strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribution des erreurs */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>Distribution des erreurs absolues par tranche</p>
        <InfoBox text="Idéalement, la majorité des prédictions doit être dans la tranche 0–10h d'erreur. Les erreurs >50h sont critiques pour la maintenance préventive." color="#ffb74d" />
        <div className="mt-2 grid grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={errBins} margin={{ top:5, right:5, bottom:5, left:0 }}>
              <XAxis dataKey="range" tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={false} />
              <YAxis tick={{ fill:'#8a8d9f', fontSize:9 }} axisLine={false} />
              <Tooltip contentStyle={{ background:'#232640', border:'1px solid #3d4172', borderRadius:8 }}
                formatter={(v) => [v+' samples']} />
              <Bar dataKey="count" radius={[3,3,0,0]}>
                {errBins.map((b,i) => <Cell key={i} fill={b.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {errBins.map(b => {
              const pct = Math.round((b.count / errors.length) * 100);
              return (
                <div key={b.range} className="space-y-0.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span style={{ color: b.color }}>{b.range}</span>
                    <span style={{ color:'#e4e6f0' }}>{b.count} ({pct}%)</span>
                  </div>
                  <div className="w-full rounded-full" style={{ height:6, background:'#232640' }}>
                    <div className="h-full rounded-full" style={{ width:`${pct}%`, background: b.color }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs pt-1" style={{ color:'#4a4d6a' }}>Total : {errors.length} samples</p>
          </div>
        </div>
      </div>

      {/* Tableau détaillé 20 premiers */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>Détail des prédictions — 20 premiers samples du jeu de test</p>
        <div className="overflow-auto rounded-lg border" style={{ borderColor:'#2a2d45', maxHeight:250 }}>
          <table className="w-full text-xs font-mono" style={{ borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:'#232640' }}>
              <tr>
                {['#','RUL Réel (h)','RUL Prédit (h)','Erreur abs. (h)','Erreur (%)','Qualité'].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left whitespace-nowrap"
                    style={{ color:'#8a8d9f', borderBottom:'1px solid #2a2d45' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {y_true.slice(0,50).map((real, i) => {
                const pred = y_pred[i];
                const err  = errors[i];
                const pct  = real > 0 ? Math.round((err/real)*100) : 0;
                const qual = err < 5 ? { label:'Excellent', color:'#4caf50' }
                           : err < 15? { label:'Bon',       color:'#81c784' }
                           : err < 30? { label:'Moyen',     color:'#ffb74d' }
                           :           { label:'Faible',    color:'#f44336' };
                return (
                  <tr key={i} style={{ background: i%2===0?'#1a1d2e':'#15172a', borderBottom:'1px solid #1e2135' }}>
                    <td className="px-3 py-1.5" style={{ color:'#4a4d6a' }}>{i+1}</td>
                    <td className="px-3 py-1.5 font-bold" style={{ color:'#4caf50' }}>{real.toFixed(1)}h</td>
                    <td className="px-3 py-1.5 font-bold" style={{ color:'#4fc3f7' }}>{pred.toFixed(1)}h</td>
                    <td className="px-3 py-1.5" style={{ color: err<10?'#81c784': err<30?'#ffb74d':'#f44336' }}>{err.toFixed(1)}h</td>
                    <td className="px-3 py-1.5" style={{ color:'#8a8d9f' }}>{pct}%</td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{ background:qual.color+'20', color:qual.color }}>
                        {qual.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs mt-1" style={{ color:'#4a4d6a' }}>Scroll pour voir plus · 50 lignes affichées</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Panel principal
// ════════════════════════════════════════════════════════════
export default function TrainingPanel() {
  const [mode,      setMode]      = useState('manual');
  const [arch,      setArch]      = useState('LSTM');
  const [expName,   setExpName]   = useState('Exp_LSTM_01');
  const [machineId, setMachineId] = useState(99);

  // Manuel
  const [numLayers, setNumLayers] = useState(2);
  const [units,     setUnits]     = useState([64, 32, 32, 32]);
  const [dropouts,  setDropouts]  = useState([0.2, 0.1, 0.1, 0.1]);
  const [lr,        setLr]        = useState(0.001);
  const [epochs,    setEpochs]    = useState(50);
  const [batchSize, setBatchSize] = useState(32);
  const [patience,  setPatience]  = useState(10);

  // AutoML
  const [layersMin, setLayersMin] = useState(1);
  const [layersMax, setLayersMax] = useState(4);
  const [unitsMin,  setUnitsMin]  = useState(32);
  const [unitsMax,  setUnitsMax]  = useState(256);
  const [dropMin,   setDropMin]   = useState(0.1);
  const [dropMax,   setDropMax]   = useState(0.5);
  const [maxTrials, setMaxTrials] = useState(10);
  const [cvFolds,   setCvFolds]   = useState(5);
  const [trialEp,   setTrialEp]   = useState(20);
  const [finalEp,   setFinalEp]   = useState(50);

  // État
  const [trainingStatus, setTrainingStatus] = useState('idle');
  const [epochData,   setEpochData]   = useState([]);
  const [trialData,   setTrialData]   = useState([]);
  const [currentEpoch,setCurrentEpoch]= useState(null);
  const [logs,        setLogs]        = useState([]);
  const [result,      setResult]      = useState(null);
  const [predictions, setPredictions] = useState(null);
  const [hyperparams, setHyperparams] = useState(null);
  const [activeTab,   setActiveTab]   = useState('live');
  const [startTime,   setStartTime]   = useState(null);

  const wsRef  = useRef(null);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  const addLog = (msg) => setLogs(prev => [...prev.slice(-400), { ts: Date.now(), text: msg }]);

  const resetState = () => {
    setTrainingStatus('idle'); setEpochData([]); setTrialData([]);
    setCurrentEpoch(null); setLogs([]); setResult(null);
    setPredictions(null); setHyperparams(null); setActiveTab('live'); setStartTime(null);
  };

  const connectWS = (expId) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`${WS_URL}/${expId}`);
    wsRef.current = ws;
    ws.onopen = () => addLog('🔌 Connexion WebSocket établie...');
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch(data.type) {
          case 'log':
            addLog(data.message);
            break;
          case 'epoch':
            const elapsed = startTime ? Math.round((Date.now()-startTime)/1000) : null;
            const ep = { epoch:data.epoch, total:data.total, loss:data.loss, val_loss:data.val_loss, mae:data.mae, val_mae:data.val_mae, elapsed };
            setCurrentEpoch(ep);
            setEpochData(prev => [...prev, ep]);
            break;
          case 'trial_start':
            addLog(`\n🔍 Essai ${data.trial}/${data.total} en cours...`);
            setActiveTab('trials');
            break;
          case 'trial_end':
            setTrialData(prev => [...prev, { trial:data.trial, avg_cv_loss:data.avg_cv_loss, duration:data.duration }]);
            addLog(`  ✅ Essai ${data.trial} terminé — CV Loss: ${data.avg_cv_loss?.toFixed(5)}`);
            break;
          case 'result':
            setResult(data);
            if (data.hyperparameters) setHyperparams(data.hyperparameters);
            addLog(data.message);
            break;
          case 'completed':
            setTrainingStatus('completed');
            if (data.predictions) { setPredictions(data.predictions); setActiveTab('predictions'); }
            if (data.hyperparameters) setHyperparams(data.hyperparameters);
            addLog(`\n🏁 Entraînement terminé ! R²=${data.r2?.toFixed(4)} | MAE=${data.mae_hours?.toFixed(1)}h`);
            break;
          case 'error':
            setTrainingStatus('error');
            addLog(`\n❌ Erreur : ${data.message}`);
            break;
        }
      } catch(_) { addLog(event.data); }
    };
    ws.onerror = () => addLog('❌ Erreur WebSocket');
    ws.onclose = () => addLog('🔌 Connexion fermée.');
  };

  const handleTrain = useCallback(async () => {
    resetState();
    setTrainingStatus('running');
    setStartTime(Date.now());
    const url = mode==='manual' ? `${API}/api/train/manual` : `${API}/api/train/auto`;
    const payload = mode==='manual'
      ? { name:expName, architecture:arch, machine_id:machineId, num_layers:numLayers,
          units:units.slice(0,numLayers), dropout_rates:dropouts.slice(0,numLayers),
          learning_rate:lr, epochs, batch_size:batchSize, patience }
      : { name:expName, architecture:arch, machine_id:machineId,
          layers_min:layersMin, layers_max:layersMax, units_min:unitsMin, units_max:unitsMax,
          units_step:32, dropout_min:dropMin, dropout_max:dropMax,
          lr_choices:[0.01,0.001,0.0001], max_trials:maxTrials, cv_folds:cvFolds,
          epochs_per_trial:trialEp, final_epochs:finalEp, batch_size:batchSize };
    try {
      const res  = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail||'Erreur serveur');
      connectWS(data.experiment_id);
    } catch(e) {
      addLog(`❌ ${e.message}`);
      setTrainingStatus('error');
    }
  }, [mode, arch, expName, machineId, numLayers, units, dropouts, lr, epochs, batchSize, patience,
      layersMin, layersMax, unitsMin, unitsMax, dropMin, dropMax, maxTrials, cvFolds, trialEp, finalEp]);

  const TABS = [
    { id:'live',        label:'⚡ Live',          show: true },
    { id:'loss',        label:'📉 Loss/MAE',       show: epochData.length > 0 },
    { id:'trials',      label:'🔍 AutoML Trials',  show: trialData.length > 0 },
    { id:'predictions', label:'🎯 Prédictions',    show: !!predictions },
  ];

  const inputSty = { background:'#232640', borderColor:'#3d4172', color:'#e4e6f0' };
  const inputCls = "w-full px-3 py-2 rounded-lg text-sm font-mono border outline-none";
  const lblCls   = "text-xs font-semibold uppercase tracking-widest block mb-1";

  const archColor = ARCH_COLORS[arch] || '#4fc3f7';

  return (
    <div className="grid grid-cols-5 gap-6">

      {/* ── Colonne gauche : config ── */}
      <div className="col-span-2 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background:`linear-gradient(135deg,${archColor}20,${archColor}40)`, border:`1px solid ${archColor}40` }}>
            <BrainCircuit size={18} style={{ color:archColor }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color:'#e4e6f0' }}>Entraînement</h2>
            <p className="text-xs" style={{ color:'#8a8d9f' }}>AutoML Bayésien · TimeSeriesSplit · Live</p>
          </div>
        </div>

        {/* Mode */}
        <div className="rounded-xl border p-4" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <p className={lblCls} style={{ color:'#8a8d9f' }}>Mode</p>
          <div className="flex gap-2">
            {[['manual','🔧 Manuel'],['auto','⚡ AutoML']].map(([m,label]) => (
              <button key={m} onClick={()=>setMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{
                  background: mode===m?(m==='manual'?'#1a3a5c':'#0d2a1a'):'#232640',
                  borderColor: mode===m?(m==='manual'?'#4fc3f7':'#81c784'):'#2a2d45',
                  color: mode===m?(m==='manual'?'#4fc3f7':'#81c784'):'#4a4d6a',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Architecture */}
        <div className="rounded-xl border p-4" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <p className={lblCls} style={{ color:'#8a8d9f' }}>Architecture</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ARCH_COLORS).map(([a,color]) => (
              <button key={a} onClick={()=>setArch(a)}
                className="py-2 rounded-lg text-sm font-bold border transition-all"
                style={{
                  background: arch===a?color+'20':'#232640',
                  borderColor: arch===a?color:'#2a2d45',
                  color: arch===a?color:'#4a4d6a',
                }}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Nom + machine */}
        <div className="rounded-xl border p-4 space-y-3" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <div>
            <label className={lblCls} style={{ color:'#8a8d9f' }}>Nom de l'expérience</label>
            <input className={inputCls} style={inputSty} value={expName} onChange={e=>setExpName(e.target.value)} />
          </div>
          <div>
            <label className={lblCls} style={{ color:'#8a8d9f' }}>Machine ID</label>
            <input className={inputCls} style={inputSty} type="number" value={machineId}
              onChange={e=>setMachineId(Number(e.target.value))} min={1} max={100} />
          </div>
        </div>

        {/* Hyperparamètres */}
        <div className="rounded-xl border p-4 space-y-3" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <p className={lblCls} style={{ color:'#8a8d9f' }}>
            {mode==='manual'?'Hyperparamètres fixes':'Espace de recherche AutoML'}
          </p>

          {mode==='manual' ? (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color:'#8a8d9f' }}>Nombre de couches</label>
                <div className="flex gap-2">
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={()=>setNumLayers(n)}
                      className="flex-1 py-1.5 rounded text-sm font-mono border transition-all"
                      style={{ background:numLayers===n?'#1a3a5c':'#232640', borderColor:numLayers===n?'#4fc3f7':'#2a2d45', color:numLayers===n?'#4fc3f7':'#4a4d6a' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {Array.from({length:numLayers},(_,i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color:'#8a8d9f' }}>Couche {i+1} — Unités</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={units[i]||32} min={8} max={512} step={8}
                      onChange={e=>setUnits(u=>{const a=[...u];a[i]=Number(e.target.value);return a;})} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color:'#8a8d9f' }}>Couche {i+1} — Dropout</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={dropouts[i]||0.2} min={0} max={0.9} step={0.05}
                      onChange={e=>setDropouts(d=>{const a=[...d];a[i]=Number(e.target.value);return a;})} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {[
                  {label:'Learning Rate', el:<select className={inputCls} style={inputSty} value={lr} onChange={e=>setLr(Number(e.target.value))}>
                    {[0.01,0.001,0.0001].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>},
                  {label:'Batch Size', el:<select className={inputCls} style={inputSty} value={batchSize} onChange={e=>setBatchSize(Number(e.target.value))}>
                    {[16,32,64,128].map(v=><option key={v} value={v}>{v}</option>)}
                  </select>},
                  {label:`Époques max`, el:<input className={inputCls} style={inputSty} type="number" value={epochs} onChange={e=>setEpochs(Number(e.target.value))} min={5} max={500}/>},
                  {label:'Early stopping', el:<input className={inputCls} style={inputSty} type="number" value={patience} onChange={e=>setPatience(Number(e.target.value))} min={3} max={50}/>},
                ].map(f=>(
                  <div key={f.label}><label className="text-xs mb-1 block" style={{color:'#8a8d9f'}}>{f.label}</label>{f.el}</div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {label:'Couches min', val:layersMin, set:setLayersMin, min:1, max:4},
                  {label:'Couches max', val:layersMax, set:setLayersMax, min:1, max:6},
                  {label:'Unités min',  val:unitsMin,  set:setUnitsMin,  min:8, max:512},
                  {label:'Unités max',  val:unitsMax,  set:setUnitsMax,  min:8, max:512},
                  {label:'Dropout min', val:dropMin,   set:setDropMin,   min:0, max:0.9, step:0.05},
                  {label:'Dropout max', val:dropMax,   set:setDropMax,   min:0, max:0.9, step:0.05},
                ].map(f=>(
                  <div key={f.label}>
                    <label className="text-xs mb-1 block" style={{color:'#8a8d9f'}}>{f.label}</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={f.val} onChange={e=>f.set(Number(e.target.value))} min={f.min} max={f.max} step={f.step||1}/>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {label:'Essais Bayésiens', val:maxTrials, set:setMaxTrials, min:3, max:30},
                  {label:'Plis CV',          val:cvFolds,  set:setCvFolds,   min:2, max:10},
                  {label:'Époques / essai',  val:trialEp,  set:setTrialEp,   min:5, max:100},
                  {label:'Époques finales',  val:finalEp,  set:setFinalEp,   min:10, max:500},
                ].map(f=>(
                  <div key={f.label}>
                    <label className="text-xs mb-1 block" style={{color:'#8a8d9f'}}>{f.label}</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={f.val} onChange={e=>f.set(Number(e.target.value))} min={f.min} max={f.max}/>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bouton lancer */}
        <button onClick={handleTrain} disabled={trainingStatus==='running'}
          className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: trainingStatus==='running'?'#232640':`linear-gradient(135deg,${archColor}15,${archColor}30)`,
            color: trainingStatus==='running'?'#4a4d6a':archColor,
            border:`1px solid ${trainingStatus==='running'?'#2a2d45':archColor+'60'}`,
            cursor: trainingStatus==='running'?'not-allowed':'pointer',
          }}>
          {trainingStatus==='running'
            ? <><Loader size={16} className="animate-spin"/> Entraînement en cours...</>
            : <><Play size={16}/> Lancer {arch}</>
          }
        </button>

        {trainingStatus!=='idle' && (
          <button onClick={resetState} className="w-full py-2 rounded-lg text-xs border flex items-center justify-center gap-1"
            style={{ borderColor:'#2a2d45', color:'#8a8d9f', background:'#1a1d2e' }}>
            <RefreshCw size={12}/> Réinitialiser
          </button>
        )}
      </div>

      {/* ── Colonne droite : monitoring ── */}
      <div className="col-span-3 space-y-4">

        {/* Statut */}
        <div className="rounded-xl border p-4 flex items-center justify-between"
          style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{
              background: trainingStatus==='running'?'#4fc3f7': trainingStatus==='completed'?'#4caf50': trainingStatus==='error'?'#f44336':'#4a4d6a',
              boxShadow: trainingStatus==='running'?'0 0 8px #4fc3f7':'none',
              animation: trainingStatus==='running'?'pulse-dot 1.5s ease-in-out infinite':undefined,
            }}/>
            <span className="text-sm font-semibold" style={{ color:'#e4e6f0' }}>Statut de l'entraînement</span>
          </div>
          <span className="text-sm font-mono px-3 py-1 rounded-full" style={{
            background: trainingStatus==='running'?'#0d2a3a': trainingStatus==='completed'?'#0d2a1a': trainingStatus==='error'?'#2a0d0d':'#232640',
            color: trainingStatus==='running'?'#4fc3f7': trainingStatus==='completed'?'#4caf50': trainingStatus==='error'?'#f44336':'#4a4d6a',
          }}>
            {trainingStatus==='running'?'⟳ En cours': trainingStatus==='completed'?'✓ Terminé': trainingStatus==='error'?'✗ Erreur':'◦ En attente'}
          </span>
        </div>

        {/* Métriques finales */}
        {result && (
          <div className="grid grid-cols-4 gap-3">
            <Stat label="R² Score"     value={result.r2?.toFixed(4)||predictions?.r2_score?.toFixed(4)}  color="#4caf50"  sub="Coefficient de détermination" />
            <Stat label="MAE normalisé" value={result.mae?.toFixed(5)}                                    color="#4fc3f7"  sub="Sur données [0,1]" />
            <Stat label="MAE réel (h)" value={`${(result.mae_hours||predictions?.mae_hours)?.toFixed(1)}h`} color="#ffb74d" sub="Après dénormalisation" />
            <Stat label="Durée"        value={result.duration?`${Math.round(result.duration)}s`:'—'}      color="#ce93d8"  sub="Temps d'entraînement" />
          </div>
        )}

        {/* Barre Keras style — époque courante */}
        {trainingStatus==='running' && currentEpoch && (
          <KerasEpochBar epoch={currentEpoch} />
        )}

        {/* Tabs */}
        {trainingStatus !== 'idle' && (
          <>
            <div className="flex gap-1 p-1 rounded-xl border" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
              {TABS.filter(t=>t.show).map(t => (
                <button key={t.id} onClick={()=>setActiveTab(t.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeTab===t.id?'#232640':'transparent',
                    color: activeTab===t.id?'#e4e6f0':'#4a4d6a',
                    border: activeTab===t.id?'1px solid #3d4172':'1px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab Live */}
            {activeTab==='live' && (
              <div className="space-y-3">
                <div className="rounded-xl border" style={{ background:'#0a0c14', borderColor:'#2a2d45' }}>
                  <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor:'#2a2d45' }}>
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color:'#8a8d9f' }}>Logs en direct</span>
                    {trainingStatus==='running' && <span className="text-xs font-mono" style={{ color:'#4fc3f7' }}>● LIVE</span>}
                  </div>
                  <div ref={logRef} className="p-3 font-mono text-xs space-y-0.5 overflow-y-auto" style={{ maxHeight:200 }}>
                    {logs.length===0
                      ? <p style={{ color:'#4a4d6a' }}>En attente du lancement...</p>
                      : logs.map((l,i) => (
                        <p key={i} style={{
                          color: l.text.includes('❌')?'#f44336': l.text.includes('✅')||l.text.includes('🏁')?'#4caf50': l.text.includes('🔍')?'#ffb74d':'#8a8d9f',
                          whiteSpace:'pre-wrap',
                        }}>{l.text}</p>
                      ))
                    }
                  </div>
                </div>
                <EpochHistory epochs={epochData} />
              </div>
            )}

            {/* Tab Loss/MAE */}
            {activeTab==='loss' && (
              <div className="rounded-xl border p-4" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
                <p className="text-xs font-semibold mb-1" style={{ color:'#8a8d9f' }}>
                  Courbes d'apprentissage — {epochData.length} époque{epochData.length>1?'s':''}
                </p>
                <InfoBox text="La courbe de validation (pointillée) doit suivre la courbe d'entraînement. Si val_loss remonte alors que loss continue de baisser → surapprentissage (overfitting). L'early stopping stoppe automatiquement dans ce cas." color="#4fc3f7" />
                <div className="mt-3">
                  <LiveCharts epochs={epochData} />
                </div>
              </div>
            )}

            {/* Tab Trials */}
            {activeTab==='trials' && (
              <div className="rounded-xl border p-4" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
                <p className="text-xs font-semibold mb-3" style={{ color:'#8a8d9f' }}>
                  Optimisation Bayésienne — {trialData.length}/{maxTrials} essais
                </p>
                <TrialsView trials={trialData} maxTrials={maxTrials} />
              </div>
            )}

            {/* Tab Prédictions */}
            {activeTab==='predictions' && (
              <div className="rounded-xl border p-4" style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
                <p className="text-xs font-semibold mb-3" style={{ color:'#8a8d9f' }}>
                  Résultats de prédiction — Jeu de test (dénormalisé)
                </p>
                <PredictionsView data={predictions} hyperparams={hyperparams} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}