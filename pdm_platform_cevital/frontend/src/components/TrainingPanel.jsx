/**
 * TrainingPanel.jsx — Entraînement avec visualisation temps réel complète
 * Barre Keras style · Graphes live · Résultats dénormalisés détaillés
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { BrainCircuit, Play, Loader, CheckCircle, RefreshCw, Info, Eye } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter,
  BarChart, Bar, Cell, ReferenceLine
} from 'recharts';

const API    = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';
const ARCH_COLORS = { LSTM:'var(--accent-blue)', GRU:'var(--accent-green)', RNN:'var(--accent-orange)', Transformer:'var(--accent-purple)' };

// ── Boîte info ───────────────────────────────────────────────
function InfoBox({ text, color='var(--accent-blue)' }) {
  return (
    <div className="flex gap-2 rounded-lg px-3 py-2 border"
      style={{ background:color+'08', borderColor:color+'30' }}>
      <Info size={13} style={{ color, flexShrink:0, marginTop:1 }} />
      <p className="text-xs leading-relaxed" style={{ color:'var(--text-secondary)' }}>{text}</p>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────
function Stat({ label, value, color='var(--accent-blue)', sub }) {
  return (
    <div className="rounded-lg px-3 py-2.5 border" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
      <p className="text-xs" style={{ color:'var(--text-tertiary)' }}>{label}</p>
      <p className="text-lg font-bold font-mono" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color:'var(--text-muted)' }}>{sub}</p>}
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
      style={{ background:'var(--bg-deep)', borderColor:'var(--border-default)' }}>
      {/* Ligne principale style terminal Keras */}
      <div style={{ color:'var(--text-primary)' }}>
        <span style={{ color:'var(--accent-blue)' }}>Epoch {epoch.epoch}/{epoch.total}</span>
        {' '}
        <span style={{ color:'var(--text-tertiary)' }}>207/207</span>
        {' '}
        <span style={{ color: pct < 100 ? 'var(--accent-orange)' : 'var(--success)' }}>{bar}</span>
        {' '}
        <span style={{ color:'var(--text-muted)' }}>{epoch.elapsed || '—'}s</span>
        {' — '}
        <span style={{ color:'#f06292' }}>loss: </span>
        <span style={{ color:'var(--text-primary)' }}>{epoch.loss?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'var(--accent-orange)' }}>mae: </span>
        <span style={{ color:'var(--text-primary)' }}>{epoch.mae?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'var(--accent-purple)' }}>val_loss: </span>
        <span style={{ color:'var(--text-primary)' }}>{epoch.val_loss?.toFixed(4)}</span>
        {' — '}
        <span style={{ color:'var(--accent-green)' }}>val_mae: </span>
        <span style={{ color:'var(--text-primary)' }}>{epoch.val_mae?.toFixed(4)}</span>
      </div>
      {/* Barre de progression visuelle */}
      <div className="w-full rounded-full overflow-hidden" style={{ height:4, background:'var(--bg-elevated)' }}>
        <div className="h-full rounded-full transition-all duration-300"
          style={{ width:`${pct}%`, background: pct<100?'var(--accent-blue)':'var(--success)' }} />
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
      <p className="text-xs font-semibold mb-1.5" style={{ color:'var(--text-tertiary)' }}>Historique des époques</p>
      <div ref={ref} className="rounded-lg border overflow-auto font-mono text-xs"
        style={{ background:'var(--bg-deep)', borderColor:'var(--border-default)', maxHeight:180 }}>
        <table className="w-full" style={{ borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:'var(--bg-elevated)' }}>
            <tr>
              {['Époque','Loss','Val Loss','MAE','Val MAE'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left whitespace-nowrap"
                  style={{ color:'var(--text-tertiary)', borderBottom:'1px solid var(--border-default)', fontSize:10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {epochs.map((e, i) => {
              const isLast = i === epochs.length - 1;
              const isBest = e.val_loss === Math.min(...epochs.map(x => x.val_loss));
              return (
                <tr key={e.epoch} style={{
                  background: isLast ? '#1a3a5c40' : isBest ? 'var(--tint-success-bg)' : i%2===0 ? 'var(--bg-base)' : 'var(--bg-deep)',
                  borderBottom:'1px solid var(--bg-card-alt)',
                }}>
                  <td className="px-3 py-1" style={{ color: isBest?'var(--success)': isLast?'var(--accent-blue)':'var(--text-tertiary)' }}>
                    {e.epoch}{isBest?' 🏆':''}
                  </td>
                  <td className="px-3 py-1" style={{ color:'#f06292' }}>{e.loss?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'var(--accent-purple)' }}>{e.val_loss?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'var(--accent-orange)' }}>{e.mae?.toFixed(6)}</td>
                  <td className="px-3 py-1" style={{ color:'var(--accent-green)' }}>{e.val_mae?.toFixed(6)}</td>
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
      style={{ borderColor:'var(--border-default)', color:'var(--text-muted)' }}>
      <p className="text-sm">En attente des premières époques...</p>
    </div>
  );
  return (
    <div className="space-y-4">
      {/* Loss */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>
          Loss (MSE) — Train vs Validation
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={epochs} margin={{ top:5, right:10, bottom:5, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="epoch" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
            <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={60} tickFormatter={v=>v.toFixed(4)} />
            <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
              formatter={(v,n) => [v?.toFixed(6), n]} labelFormatter={l=>`Époque ${l}`} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Line type="monotone" dataKey="loss"     stroke="#f06292" dot={false} strokeWidth={2} name="Train Loss" />
            <Line type="monotone" dataKey="val_loss" stroke="var(--accent-purple)" dot={false} strokeWidth={2} name="Val Loss" strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* MAE */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>
          MAE — Train vs Validation
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={epochs} margin={{ top:5, right:10, bottom:5, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis dataKey="epoch" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
            <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={60} tickFormatter={v=>v.toFixed(4)} />
            <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
              formatter={(v,n) => [v?.toFixed(6), n]} labelFormatter={l=>`Époque ${l}`} />
            <Legend wrapperStyle={{ fontSize:11 }} />
            <Line type="monotone" dataKey="mae"     stroke="var(--accent-orange)" dot={false} strokeWidth={2} name="Train MAE" />
            <Line type="monotone" dataKey="val_mae" stroke="var(--accent-green)" dot={false} strokeWidth={2} name="Val MAE" strokeDasharray="5 3" />
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
      <InfoBox text="Optimisation Bayésienne : chaque essai teste une combinaison d'hyperparamètres différente. La CV Loss (TimeSeriesSplit 5 plis) mesure la généralisation. L'essai avec la CV Loss minimale sera retenu pour l'entraînement final." color="var(--accent-purple)" />
      <p className="text-xs font-semibold" style={{ color:'var(--text-tertiary)' }}>
        CV Loss par essai — {trials.length}/{maxTrials} terminés
        {trials.length > 0 && <span style={{ color:'var(--success)' }}> · Meilleur : essai #{trials.find(t=>t.avg_cv_loss===bestLoss)?.trial} ({bestLoss.toFixed(5)})</span>}
      </p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={trials} margin={{ top:5, right:10, bottom:5, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
          <XAxis dataKey="trial" tick={{ fill:'var(--text-tertiary)', fontSize:9 }}
            label={{ value:'Essai', position:'insideBottom', offset:-2, fill:'var(--text-muted)', fontSize:9 }} />
          <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={60} tickFormatter={v=>v.toFixed(4)} />
          <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
            formatter={(v) => [v?.toFixed(6), 'CV Loss']} labelFormatter={l=>`Essai #${l}`} />
          <Bar dataKey="avg_cv_loss" radius={[3,3,0,0]} maxBarSize={35}>
            {trials.map((t,i) => (
              <Cell key={i} fill={t.avg_cv_loss===bestLoss ? 'var(--success)' : 'var(--accent-blue)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Tableau classement */}
      <div className="overflow-auto rounded-lg border" style={{ borderColor:'var(--border-default)', maxHeight:200 }}>
        <table className="w-full text-xs font-mono" style={{ borderCollapse:'collapse' }}>
          <thead style={{ position:'sticky', top:0, background:'var(--bg-elevated)' }}>
            <tr>
              {['Rang','Essai #','CV Loss moy.','Durée','Statut'].map(h => (
                <th key={h} className="px-3 py-1.5 text-left" style={{ color:'var(--text-tertiary)', borderBottom:'1px solid var(--border-default)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...trials].sort((a,b)=>a.avg_cv_loss-b.avg_cv_loss).map((t,i) => (
              <tr key={t.trial} style={{ background: i===0?'var(--tint-success-bg)': i%2===0?'var(--bg-card)':'#15172a', borderBottom:'1px solid var(--bg-card-alt)' }}>
                <td className="px-3 py-1.5" style={{ color: i===0?'var(--accent-orange)':'var(--text-muted)' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
                <td className="px-3 py-1.5 font-bold" style={{ color: i===0?'var(--success)':'var(--text-primary)' }}>#{t.trial}</td>
                <td className="px-3 py-1.5" style={{ color: i===0?'var(--success)':'var(--text-tertiary)' }}>{t.avg_cv_loss?.toFixed(6)}</td>
                <td className="px-3 py-1.5" style={{ color:'var(--text-muted)' }}>{t.duration}s</td>
                <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: i===0?'var(--tint-success-bg)':'var(--bg-elevated)', color: i===0?'var(--success)':'var(--text-tertiary)' }}>
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
    { range:'0–5h',   count: errors.filter(e=>e<=5).length,           color:'var(--success)' },
    { range:'5–10h',  count: errors.filter(e=>e>5&&e<=10).length,     color:'var(--accent-green)' },
    { range:'10–20h', count: errors.filter(e=>e>10&&e<=20).length,    color:'var(--accent-orange)' },
    { range:'20–50h', count: errors.filter(e=>e>20&&e<=50).length,    color:'#f06292' },
    { range:'>50h',   count: errors.filter(e=>e>50).length,           color:'var(--error)' },
  ];

  return (
    <div className="space-y-5">
      <InfoBox
        text="Résultats sur le jeu de test (20% chronologique — données jamais vues pendant l'entraînement). Les valeurs sont dénormalisées : reconverties en heures réelles via inverse_transform du scaler_y."
        color="var(--success)"
      />

      {/* Métriques globales */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color:'var(--text-tertiary)' }}>Métriques finales (dénormalisées)</p>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="R² Score"    value={r2_score?.toFixed(4)}          color="var(--success)"  sub="Plus proche de 1 = meilleur" />
          <Stat label="MAE (heures)"value={`${mae_hours?.toFixed(1)}h`}   color="var(--accent-blue)"  sub="Erreur absolue moyenne" />
          <Stat label="RMSE (h)"    value={rmse_hours ? `${rmse_hours?.toFixed(1)}h` : '—'} color="var(--accent-orange)" sub="Sensible aux grands écarts" />
          <Stat label="Échantillons"value={y_true.length}                  color="var(--accent-purple)"  sub="Points de test" />
        </div>
      </div>

      {/* Hyperparamètres retenus */}
      {hyperparams && (
        <div className="rounded-lg border p-3" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color:'var(--text-tertiary)' }}>Hyperparamètres du modèle retenu</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(hyperparams).map(([k,v]) => (
              <div key={k} className="text-xs font-mono px-2 py-1 rounded border"
                style={{ background:'var(--bg-elevated)', borderColor:'var(--border-strong)', color:'var(--accent-blue)' }}>
                <span style={{ color:'var(--text-tertiary)' }}>{k}: </span>
                <span>{JSON.stringify(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scatter : prédit vs réel */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>RUL Prédit vs RUL Réel (heures)</p>
        <InfoBox text="Chaque point = un sample du jeu de test. La ligne verte diagonale = prédiction parfaite. Plus les points s'en rapprochent, meilleur est le modèle." color="var(--success)" />
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top:10, right:10, bottom:30, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis type="number" dataKey="real" name="Réel" tick={{ fill:'var(--text-tertiary)', fontSize:9 }}
                label={{ value:'RUL Réel (heures)', position:'insideBottom', offset:-15, fill:'var(--text-muted)', fontSize:10 }} />
              <YAxis type="number" dataKey="pred" name="Prédit" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} width={55}
                label={{ value:'RUL Prédit (h)', angle:-90, position:'insideLeft', fill:'var(--text-muted)', fontSize:10 }} />
              <Tooltip cursor={{ strokeDasharray:'3 3' }}
                contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8, fontSize:11 }}
                formatter={(v,n) => [`${v?.toFixed(1)}h`, n]} />
              <ReferenceLine segment={[{x:0,y:0},{x:maxVal,y:maxVal}]} stroke="var(--success)" strokeWidth={1.5} strokeDasharray="4 2" label={{ value:'Parfait', fill:'var(--success)', fontSize:9 }} />
              <Scatter data={scatter.slice(0,300)} fill="var(--accent-blue)" fillOpacity={0.45} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Courbe temporelle */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>
          Évolution temporelle — RUL Réel vs Prédit (200 premiers samples)
        </p>
        <InfoBox text="Vue chronologique : les deux courbes devraient se superposer au maximum. Les écarts indiquent les zones où le modèle a plus de mal à prédire (ex: pic de RUL juste après une panne)." color="var(--accent-blue)" />
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={y_true.slice(0,200).map((v,i)=>({ i, real:v, pred:y_pred[i] }))}
              margin={{ top:5, right:10, bottom:5, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="i" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
              <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={55} tickFormatter={v=>`${Math.round(v)}h`} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
                formatter={(v) => [`${v?.toFixed(1)}h`]} labelFormatter={l=>`Sample #${l}`} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Line type="monotone" dataKey="real" stroke="var(--success)" dot={false} strokeWidth={2} name="RUL Réel" />
              <Line type="monotone" dataKey="pred" stroke="var(--accent-blue)" dot={false} strokeWidth={2} name="RUL Prédit" strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Distribution des erreurs */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>Distribution des erreurs absolues par tranche</p>
        <InfoBox text="Idéalement, la majorité des prédictions doit être dans la tranche 0–10h d'erreur. Les erreurs >50h sont critiques pour la maintenance préventive." color="var(--accent-orange)" />
        <div className="mt-2 grid grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={errBins} margin={{ top:5, right:5, bottom:5, left:0 }}>
              <XAxis dataKey="range" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={false} />
              <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={false} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
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
                    <span style={{ color:'var(--text-primary)' }}>{b.count} ({pct}%)</span>
                  </div>
                  <div className="w-full rounded-full" style={{ height:6, background:'var(--bg-elevated)' }}>
                    <div className="h-full rounded-full" style={{ width:`${pct}%`, background: b.color }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs pt-1" style={{ color:'var(--text-muted)' }}>Total : {errors.length} samples</p>
          </div>
        </div>
      </div>

      {/* Tableau détaillé 20 premiers */}
      <div>
        <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>Détail des prédictions — 20 premiers samples du jeu de test</p>
        <div className="overflow-auto rounded-lg border" style={{ borderColor:'var(--border-default)', maxHeight:250 }}>
          <table className="w-full text-xs font-mono" style={{ borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, background:'var(--bg-elevated)' }}>
              <tr>
                {['#','RUL Réel (h)','RUL Prédit (h)','Erreur abs. (h)','Erreur (%)','Qualité'].map(h => (
                  <th key={h} className="px-3 py-1.5 text-left whitespace-nowrap"
                    style={{ color:'var(--text-tertiary)', borderBottom:'1px solid var(--border-default)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {y_true.slice(0,50).map((real, i) => {
                const pred = y_pred[i];
                const err  = errors[i];
                const pct  = real > 0 ? Math.round((err/real)*100) : 0;
                const qual = err < 5 ? { label:'Excellent', color:'var(--success)' }
                           : err < 15? { label:'Bon',       color:'var(--accent-green)' }
                           : err < 30? { label:'Moyen',     color:'var(--accent-orange)' }
                           :           { label:'Faible',    color:'var(--error)' };
                return (
                  <tr key={i} style={{ background: i%2===0?'var(--bg-card)':'#15172a', borderBottom:'1px solid var(--bg-card-alt)' }}>
                    <td className="px-3 py-1.5" style={{ color:'var(--text-muted)' }}>{i+1}</td>
                    <td className="px-3 py-1.5 font-bold" style={{ color:'var(--success)' }}>{real.toFixed(1)}h</td>
                    <td className="px-3 py-1.5 font-bold" style={{ color:'var(--accent-blue)' }}>{pred.toFixed(1)}h</td>
                    <td className="px-3 py-1.5" style={{ color: err<10?'var(--accent-green)': err<30?'var(--accent-orange)':'var(--error)' }}>{err.toFixed(1)}h</td>
                    <td className="px-3 py-1.5" style={{ color:'var(--text-tertiary)' }}>{pct}%</td>
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
        <p className="text-xs mt-1" style={{ color:'var(--text-muted)' }}>Scroll pour voir plus · 50 lignes affichées</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// 🎨 ArchitectureVisualizer — Schéma vivant style Andrew Ng
// ════════════════════════════════════════════════════════════
function ArchitectureVisualizer({
  arch, numLayers, units, dropouts, batchSize, lookback, machineId
}) {
  const archColor = ARCH_COLORS[arch] || 'var(--accent-blue)';

  // Limites visuelles : on plafonne le nombre de neurones affichés
  const N_FEATURES = 31;
  const N_FEATURES_DISPLAY = 8;  // on en affiche 8 visuellement
  const MAX_VISIBLE_NEURONS = 12; // par couche
  const visibleUnits = units.slice(0, numLayers).map(u => Math.min(u, MAX_VISIBLE_NEURONS));

  // Dimensions SVG dynamiques
  const W = 900;
  const layerSpacing = (W - 200) / (numLayers + 2);
  const inputX = 100;
  const outputX = W - 80;
  const layerXs = visibleUnits.map((_, i) => inputX + (i + 1) * layerSpacing);
  const H = 380;

  // Y-positions des neurones d'une couche
  const neuronYs = (n, cy = H/2, height = 280) => {
    const step = Math.min(28, height / Math.max(1, n - 1));
    return Array.from({ length: n }, (_, i) =>
      cy - ((n - 1) / 2) * step + i * step
    );
  };

  const inputYs = neuronYs(N_FEATURES_DISPLAY);
  const layerNeuronYs = visibleUnits.map(n => neuronYs(n));

  // Génère un masque de dropout aléatoire (recalculé à chaque rendu — comme dans la réalité !)
  const dropoutMasks = useMemo(() =>
    visibleUnits.map((n, L) => {
      const rate = dropouts[L] || 0;
      return Array.from({ length: n }, () => Math.random() < rate);
    }),
    [visibleUnits.join(','), dropouts.slice(0, numLayers).join(','), Date.now() % 100]
  );

  return (
    <div className="rounded-xl border-2 overflow-hidden"
      style={{ borderColor: archColor, background: 'linear-gradient(135deg, var(--bg-base), var(--bg-card))' }}>
      <div className="px-4 py-2.5 flex items-center justify-between"
        style={{ background: archColor + '15', borderBottom: `1px solid ${archColor}40` }}>
        <div className="flex items-center gap-2">
          <Eye size={15} style={{ color: archColor }} />
          <span className="text-sm font-bold" style={{ color: archColor }}>
            🎨 Architecture en direct — {arch}
          </span>
        </div>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          Aperçu avant entraînement
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }}>
        <defs>
          <pattern id="archgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--bg-card)" strokeWidth="0.4"/>
          </pattern>
          <marker id="archarrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5"
            orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,5 L5,2.5 z" fill="var(--text-tertiary)"/>
          </marker>
        </defs>
        <rect width={W} height={H} fill="url(#archgrid)" />

        {/* ── Pile de batch sur le côté gauche (mémoire visuelle du batch_size) ── */}
        <g>
          {/* Profondeur de pile : on dessine 5 plans translucides pour figurer le batch */}
          {[0, 1, 2, 3].map(d => (
            <rect key={d}
              x={inputX - 50 - d * 4} y={50 - d * 4}
              width={70} height={H - 100}
              rx={4}
              fill="#1a3a5c"
              stroke="var(--accent-blue)"
              strokeWidth={0.6}
              opacity={0.15 + d * 0.08}
            />
          ))}
          <rect x={inputX - 50} y={50}
            width={70} height={H - 100} rx={4}
            fill="#0d2a4a" stroke="var(--accent-blue)" strokeWidth={1.5}/>
          <text x={inputX - 15} y={42} textAnchor="middle" fontSize={11}
            fill="var(--accent-blue)" fontFamily="monospace" fontWeight="bold">
            BATCH
          </text>
          <text x={inputX - 15} y={H - 36} textAnchor="middle" fontSize={11}
            fill="var(--accent-blue)" fontFamily="monospace" fontWeight="bold">
            {batchSize} séqs
          </text>
          <text x={inputX - 15} y={H - 22} textAnchor="middle" fontSize={9}
            fill="var(--text-tertiary)" fontFamily="monospace">
            en parallèle
          </text>
        </g>

        {/* Indication de la fenêtre temporelle */}
        <g transform={`translate(${inputX - 15}, ${H/2})`}>
          <text textAnchor="middle" fontSize={10}
            fill="var(--accent-green)" fontFamily="monospace" fontWeight="bold">
            ⏱ {lookback}h
          </text>
          <text y={14} textAnchor="middle" fontSize={8}
            fill="var(--text-muted)" fontFamily="monospace">
            window
          </text>
        </g>

        {/* ── Titres de colonnes ── */}
        <text x={inputX} y={20} textAnchor="middle" fontSize={11}
          fill="var(--text-tertiary)" fontFamily="monospace" fontWeight="bold">
          INPUT
        </text>
        <text x={inputX} y={34} textAnchor="middle" fontSize={9}
          fill="var(--text-muted)" fontFamily="monospace">
          {N_FEATURES} features
        </text>

        {layerXs.map((x, L) => {
          const dropoutRate = dropouts[L] || 0;
          return (
            <g key={`title-${L}`}>
              <text x={x} y={20} textAnchor="middle" fontSize={11}
                fill={archColor} fontFamily="monospace" fontWeight="bold">
                {arch}_{L + 1}
              </text>
              <text x={x} y={34} textAnchor="middle" fontSize={9}
                fill="var(--text-muted)" fontFamily="monospace">
                {units[L]} unités
              </text>
              {dropoutRate > 0 && (
                <text x={x} y={48} textAnchor="middle" fontSize={9}
                  fill="#f06292" fontFamily="monospace">
                  dropout {(dropoutRate * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}

        <text x={outputX} y={20} textAnchor="middle" fontSize={11}
          fill="#f06292" fontFamily="monospace" fontWeight="bold">
          DENSE
        </text>
        <text x={outputX} y={34} textAnchor="middle" fontSize={9}
          fill="var(--text-muted)" fontFamily="monospace">
          1 unité (RUL)
        </text>

        {/* ── Connexions input → couche 1 ── */}
        {inputYs.map((iy, i) =>
          layerNeuronYs[0]?.map((ly, j) => (
            <line key={`in-${i}-${j}`}
              x1={inputX + 14} y1={iy}
              x2={layerXs[0] - 14} y2={ly}
              stroke={archColor} strokeWidth={0.3} opacity={0.25}/>
          ))
        )}

        {/* ── Connexions entre couches ── */}
        {layerXs.slice(0, -1).map((x1, L) => (
          <g key={`conn-${L}`}>
            {layerNeuronYs[L]?.map((y1, i) =>
              layerNeuronYs[L + 1]?.map((y2, j) => (
                <line key={`l-${L}-${i}-${j}`}
                  x1={x1 + 14} y1={y1}
                  x2={layerXs[L + 1] - 14} y2={y2}
                  stroke={archColor} strokeWidth={0.3} opacity={0.25}/>
              ))
            )}
          </g>
        ))}

        {/* ── Connexions dernière couche → DENSE ── */}
        {layerNeuronYs[numLayers - 1]?.map((ly, i) => (
          <line key={`out-${i}`}
            x1={layerXs[numLayers - 1] + 14} y1={ly}
            x2={outputX - 14} y2={H/2}
            stroke="#f06292" strokeWidth={0.5} opacity={0.4}/>
        ))}

        {/* ── Récurrence (si RNN/LSTM/GRU) ── */}
        {(arch === 'LSTM' || arch === 'GRU' || arch === 'RNN') &&
          layerXs.map((x, L) => (
            <g key={`rec-${L}`}>
              <path
                d={`M ${x + 14} ${H/2 - 80}
                    C ${x + 50} ${H/2 - 130}, ${x + 50} ${H/2 + 130}, ${x + 14} ${H/2 + 80}`}
                fill="none" stroke={archColor} strokeWidth={0.8}
                opacity={0.5} markerEnd="url(#archarrow)" strokeDasharray="3,2"/>
              <text x={x + 56} y={H/2 + 4} fontSize={9}
                fill={archColor} fontFamily="monospace">
                ↺ récur.
              </text>
            </g>
          ))
        }

        {/* ── Neurones d'entrée (carrés bleus) ── */}
        {inputYs.map((y, i) => (
          <g key={`in-${i}`}>
            <rect x={inputX - 14} y={y - 9} width={28} height={18} rx={3}
              fill="#1a3a5c" stroke="var(--accent-blue)" strokeWidth={1}/>
            <text x={inputX} y={y + 3} textAnchor="middle" fontSize={8}
              fill="var(--accent-blue)" fontFamily="monospace">
              x{i + 1}
            </text>
          </g>
        ))}
        {/* Indicateur "..." si on tronque les features */}
        {N_FEATURES > N_FEATURES_DISPLAY && (
          <text x={inputX} y={inputYs[inputYs.length-1] + 22} textAnchor="middle" fontSize={9}
            fill="var(--text-muted)" fontFamily="monospace">
            ... ({N_FEATURES - N_FEATURES_DISPLAY} de plus)
          </text>
        )}

        {/* ── Neurones cachés avec animation dropout ── */}
        {layerNeuronYs.map((ys, L) =>
          ys.map((y, j) => {
            const isDropped = dropoutMasks[L]?.[j] || false;
            return (
              <motion.g key={`n-${L}-${j}`}
                animate={{
                  opacity: isDropped ? 0.2 : 1,
                  scale: isDropped ? 0.7 : 1,
                }}
                transition={{ duration: 0.5 }}
              >
                <circle cx={layerXs[L]} cy={y} r={11}
                  fill={isDropped ? 'var(--bg-card)' : archColor + '30'}
                  stroke={isDropped ? 'var(--text-muted)' : archColor}
                  strokeWidth={isDropped ? 1 : 1.5}
                  strokeDasharray={isDropped ? '2,2' : 'none'}
                />
                {!isDropped && (
                  <text x={layerXs[L]} y={y + 3} textAnchor="middle" fontSize={8}
                    fill={archColor} fontFamily="monospace" fontWeight="bold">
                    h{j + 1}
                  </text>
                )}
                {isDropped && (
                  <text x={layerXs[L]} y={y + 3} textAnchor="middle" fontSize={9}
                    fill="var(--text-muted)" fontFamily="monospace">
                    ✕
                  </text>
                )}
              </motion.g>
            );
          })
        )}

        {/* Indicateur "..." si neurones tronqués */}
        {layerXs.map((x, L) => {
          const totalUnits = units[L];
          if (totalUnits > MAX_VISIBLE_NEURONS) {
            const lastY = layerNeuronYs[L][layerNeuronYs[L].length - 1];
            return (
              <text key={`trunc-${L}`} x={x} y={lastY + 22} textAnchor="middle" fontSize={9}
                fill="var(--text-muted)" fontFamily="monospace">
                ... ({totalUnits - MAX_VISIBLE_NEURONS} de +)
              </text>
            );
          }
          return null;
        })}

        {/* ── Neurone de sortie ── */}
        <g>
          <circle cx={outputX} cy={H/2} r={16}
            fill="#f0629230" stroke="#f06292" strokeWidth={2}/>
          <text x={outputX} y={H/2 + 4} textAnchor="middle" fontSize={11}
            fill="#f06292" fontFamily="monospace" fontWeight="bold">
            ŷ
          </text>
          <text x={outputX} y={H/2 + 34} textAnchor="middle" fontSize={9}
            fill="#f06292" fontFamily="monospace">
            RUL (h)
          </text>
        </g>

        {/* ── Légende en bas ── */}
        <g transform={`translate(${W/2 - 250}, ${H - 18})`}>
          <rect x={0} y={-8} width={500} height={16} rx={8}
            fill="var(--bg-card)" stroke="var(--border-default)"/>
          <circle cx={20} cy={0} r={4} fill={archColor + '30'} stroke={archColor}/>
          <text x={30} y={3} fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">neurone actif</text>
          <circle cx={140} cy={0} r={4} fill="var(--bg-card)" stroke="var(--text-muted)" strokeDasharray="2,2"/>
          <text x={150} y={3} fontSize={9} fill="var(--text-tertiary)" fontFamily="monospace">neurone "dropé"</text>
          <text x={260} y={3} fontSize={9} fill="var(--accent-blue)" fontFamily="monospace">📦 batch={batchSize}</text>
          <text x={360} y={3} fontSize={9} fill="var(--accent-green)" fontFamily="monospace">⏱ window={lookback}h</text>
        </g>
      </svg>

      {/* Note pédagogique sur la couche Dense */}
      <div className="px-4 py-2.5 border-t" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-deep)' }}>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
          💡 <b style={{color:'#f06292'}}>Dense final = 1 neurone fixe</b> (non configurable) —
          c'est imposé par le problème : on prédit <b>une seule valeur</b> (la RUL en heures).<br/>
          Si on prédisait plusieurs choses à la fois (ex: RUL + probabilité de panne), il y aurait plusieurs neurones.
        </p>
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
  const [lookback,  setLookback]  = useState(24);  // Fenêtre temporelle (heures)

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
      ? { name:expName, architecture:arch, machine_id:machineId, lookback,
          num_layers:numLayers,
          units:units.slice(0,numLayers), dropout_rates:dropouts.slice(0,numLayers),
          learning_rate:lr, epochs, batch_size:batchSize, patience }
      : { name:expName, architecture:arch, machine_id:machineId, lookback,
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
  }, [mode, arch, expName, machineId, lookback, numLayers, units, dropouts, lr, epochs, batchSize, patience,
      layersMin, layersMax, unitsMin, unitsMax, dropMin, dropMax, maxTrials, cvFolds, trialEp, finalEp]);

  const TABS = [
    { id:'live',        label:'⚡ Live',          show: true },
    { id:'loss',        label:'📉 Loss/MAE',       show: epochData.length > 0 },
    { id:'trials',      label:'🔍 AutoML Trials',  show: trialData.length > 0 },
    { id:'predictions', label:'🎯 Prédictions',    show: !!predictions },
  ];

  const inputSty = { background:'var(--bg-elevated)', borderColor:'var(--border-strong)', color:'var(--text-primary)' };
  const inputCls = "w-full px-3 py-2 rounded-lg text-sm font-mono border outline-none";
  const lblCls   = "text-xs font-semibold uppercase tracking-widest block mb-1";

  const archColor = ARCH_COLORS[arch] || 'var(--accent-blue)';

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
            <h2 className="text-lg font-semibold" style={{ color:'var(--text-primary)' }}>Entraînement</h2>
            <p className="text-xs" style={{ color:'var(--text-tertiary)' }}>AutoML Bayésien · TimeSeriesSplit · Live</p>
          </div>
        </div>

        {/* Mode */}
        <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <p className={lblCls} style={{ color:'var(--text-tertiary)' }}>Mode</p>
          <div className="flex gap-2">
            {[['manual','🔧 Manuel'],['auto','⚡ AutoML']].map(([m,label]) => (
              <button key={m} onClick={()=>setMode(m)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border transition-all"
                style={{
                  background: mode===m?(m==='manual'?'#1a3a5c':'var(--tint-success-bg)'):'var(--bg-elevated)',
                  borderColor: mode===m?(m==='manual'?'var(--accent-blue)':'var(--accent-green)'):'var(--border-default)',
                  color: mode===m?(m==='manual'?'var(--accent-blue)':'var(--accent-green)'):'var(--text-muted)',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Architecture */}
        <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <p className={lblCls} style={{ color:'var(--text-tertiary)' }}>Architecture</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(ARCH_COLORS).map(([a,color]) => (
              <button key={a} onClick={()=>setArch(a)}
                className="py-2 rounded-lg text-sm font-bold border transition-all"
                style={{
                  background: arch===a?color+'20':'var(--bg-elevated)',
                  borderColor: arch===a?color:'var(--border-default)',
                  color: arch===a?color:'var(--text-muted)',
                }}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Nom + machine */}
        <div className="rounded-xl border p-4 space-y-3" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <div>
            <label className={lblCls} style={{ color:'var(--text-tertiary)' }}>Nom de l'expérience</label>
            <input className={inputCls} style={inputSty} value={expName} onChange={e=>setExpName(e.target.value)} />
          </div>
          <div>
            <label className={lblCls} style={{ color:'var(--text-tertiary)' }}>Machine ID</label>
            <input className={inputCls} style={inputSty} type="number" value={machineId}
              onChange={e=>setMachineId(Number(e.target.value))} min={1} max={100} />
          </div>
          {/* ⏱ Fenêtre temporelle (lookback) */}
          <div>
            <label className={lblCls} style={{ color:'var(--text-tertiary)' }}>
              ⏱ Fenêtre temporelle — {lookback}h
            </label>
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {[12, 24, 48, 72, 168].map(h => (
                <button key={h} onClick={() => setLookback(h)}
                  className="px-1 py-1.5 rounded text-xs font-mono border transition-all"
                  style={{
                    background: lookback === h ? 'var(--tint-success-bg)' : 'var(--bg-elevated)',
                    borderColor: lookback === h ? 'var(--accent-green)' : 'var(--border-default)',
                    color: lookback === h ? 'var(--accent-green)' : 'var(--text-tertiary)',
                  }}>
                  {h}h
                </button>
              ))}
            </div>
            <input className={inputCls} style={inputSty} type="number"
              value={lookback}
              min={3} max={336} step={1}
              placeholder="Valeur libre (3 - 336h)"
              onChange={e => {
                const v = Number(e.target.value);
                if (v >= 3 && v <= 336) setLookback(v);
              }}/>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              💡 Combien d'heures d'historique le modèle voit-il à chaque pas ? Plus c'est long, mieux il capture les tendances mais plus l'entraînement est lent.
            </p>
          </div>
        </div>

        {/* Hyperparamètres */}
        <div className="rounded-xl border p-4 space-y-3" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <p className={lblCls} style={{ color:'var(--text-tertiary)' }}>
            {mode==='manual'?'Hyperparamètres fixes':'Espace de recherche AutoML'}
          </p>

          {mode==='manual' ? (
            <>
              <div>
                <label className="text-xs mb-1 block" style={{ color:'var(--text-tertiary)' }}>Nombre de couches</label>
                <div className="flex gap-2">
                  {[1,2,3,4].map(n => (
                    <button key={n} onClick={()=>setNumLayers(n)}
                      className="flex-1 py-1.5 rounded text-sm font-mono border transition-all"
                      style={{ background:numLayers===n?'#1a3a5c':'var(--bg-elevated)', borderColor:numLayers===n?'var(--accent-blue)':'var(--border-default)', color:numLayers===n?'var(--accent-blue)':'var(--text-muted)' }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {Array.from({length:numLayers},(_,i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color:'var(--text-tertiary)' }}>Couche {i+1} — Unités</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={units[i]||32} min={8} max={512} step={8}
                      onChange={e=>setUnits(u=>{const a=[...u];a[i]=Number(e.target.value);return a;})} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color:'var(--text-tertiary)' }}>Couche {i+1} — Dropout</label>
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
                  <div key={f.label}><label className="text-xs mb-1 block" style={{color:'var(--text-tertiary)'}}>{f.label}</label>{f.el}</div>
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
                    <label className="text-xs mb-1 block" style={{color:'var(--text-tertiary)'}}>{f.label}</label>
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
                    <label className="text-xs mb-1 block" style={{color:'var(--text-tertiary)'}}>{f.label}</label>
                    <input className={inputCls} style={inputSty} type="number"
                      value={f.val} onChange={e=>f.set(Number(e.target.value))} min={f.min} max={f.max}/>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Mode AutoML : message d'info */}
        {mode === 'auto' && trainingStatus === 'idle' && (
          <div className="rounded-xl border p-4"
            style={{ background:'var(--bg-base)', borderColor:'#81c78440' }}>
            <div className="flex items-start gap-2">
              <BrainCircuit size={18} style={{ color:'var(--accent-green)', flexShrink:0, marginTop:2 }}/>
              <div>
                <p className="text-sm font-semibold" style={{ color:'var(--accent-green)' }}>
                  Mode AutoML — Recherche automatique
                </p>
                <p className="text-xs mt-1" style={{ color:'var(--text-tertiary)' }}>
                  L'architecture sera trouvée par optimisation bayésienne.<br/>
                  <b>{maxTrials} essais</b> × <b>{cvFolds} plis CV</b> × <b>{trialEp} époques</b><br/>
                  = <b style={{color:'var(--accent-green)'}}>{maxTrials * cvFolds * trialEp} époques</b> de recherche.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Bouton lancer */}
        <button onClick={handleTrain} disabled={trainingStatus==='running'}
          className="w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: trainingStatus==='running'?'var(--bg-elevated)':`linear-gradient(135deg,${archColor}15,${archColor}30)`,
            color: trainingStatus==='running'?'var(--text-muted)':archColor,
            border:`1px solid ${trainingStatus==='running'?'var(--border-default)':archColor+'60'}`,
            cursor: trainingStatus==='running'?'not-allowed':'pointer',
          }}>
          {trainingStatus==='running'
            ? <><Loader size={16} className="animate-spin"/> Entraînement en cours...</>
            : <><Play size={16}/> Lancer {arch}</>
          }
        </button>

        {trainingStatus!=='idle' && (
          <button onClick={resetState} className="w-full py-2 rounded-lg text-xs border flex items-center justify-center gap-1"
            style={{ borderColor:'var(--border-default)', color:'var(--text-tertiary)', background:'var(--bg-card)' }}>
            <RefreshCw size={12}/> Réinitialiser
          </button>
        )}
      </div>

      {/* ── Colonne droite : monitoring ── */}
      <div className="col-span-3 space-y-4">

        {/* 🎨 Architecture en direct — affiché à droite des hyperparamètres, même niveau */}
        {mode === 'manual' && trainingStatus === 'idle' && (
          <ArchitectureVisualizer
            arch={arch}
            numLayers={numLayers}
            units={units}
            dropouts={dropouts}
            batchSize={batchSize}
            lookback={lookback}
            machineId={machineId}
          />
        )}

        {/* Statut */}
        <div className="rounded-xl border p-4 flex items-center justify-between"
          style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{
              background: trainingStatus==='running'?'var(--accent-blue)': trainingStatus==='completed'?'var(--success)': trainingStatus==='error'?'var(--error)':'var(--text-muted)',
              boxShadow: trainingStatus==='running'?'0 0 8px var(--accent-blue)':'none',
              animation: trainingStatus==='running'?'pulse-dot 1.5s ease-in-out infinite':undefined,
            }}/>
            <span className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>Statut de l'entraînement</span>
          </div>
          <span className="text-sm font-mono px-3 py-1 rounded-full" style={{
            background: trainingStatus==='running'?'#0d2a3a': trainingStatus==='completed'?'var(--tint-success-bg)': trainingStatus==='error'?'var(--tint-error-bg)':'var(--bg-elevated)',
            color: trainingStatus==='running'?'var(--accent-blue)': trainingStatus==='completed'?'var(--success)': trainingStatus==='error'?'var(--error)':'var(--text-muted)',
          }}>
            {trainingStatus==='running'?'⟳ En cours': trainingStatus==='completed'?'✓ Terminé': trainingStatus==='error'?'✗ Erreur':'◦ En attente'}
          </span>
        </div>

        {/* Métriques finales */}
        {result && (
          <div className="grid grid-cols-4 gap-3">
            <Stat label="R² Score"     value={result.r2?.toFixed(4)||predictions?.r2_score?.toFixed(4)}  color="var(--success)"  sub="Coefficient de détermination" />
            <Stat label="MAE normalisé" value={result.mae?.toFixed(5)}                                    color="var(--accent-blue)"  sub="Sur données [0,1]" />
            <Stat label="MAE réel (h)" value={`${(result.mae_hours||predictions?.mae_hours)?.toFixed(1)}h`} color="var(--accent-orange)" sub="Après dénormalisation" />
            <Stat label="Durée"        value={result.duration?`${Math.round(result.duration)}s`:'—'}      color="var(--accent-purple)"  sub="Temps d'entraînement" />
          </div>
        )}

        {/* Barre Keras style — époque courante */}
        {trainingStatus==='running' && currentEpoch && (
          <KerasEpochBar epoch={currentEpoch} />
        )}

        {/* Tabs */}
        {trainingStatus !== 'idle' && (
          <>
            <div className="flex gap-1 p-1 rounded-xl border" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
              {TABS.filter(t=>t.show).map(t => (
                <button key={t.id} onClick={()=>setActiveTab(t.id)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeTab===t.id?'var(--bg-elevated)':'transparent',
                    color: activeTab===t.id?'var(--text-primary)':'var(--text-muted)',
                    border: activeTab===t.id?'1px solid var(--border-strong)':'1px solid transparent',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab Live */}
            {activeTab==='live' && (
              <div className="space-y-3">
                <div className="rounded-xl border" style={{ background:'var(--bg-deep)', borderColor:'var(--border-default)' }}>
                  <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor:'var(--border-default)' }}>
                    <span className="text-xs font-semibold uppercase tracking-widest" style={{ color:'var(--text-tertiary)' }}>Logs en direct</span>
                    {trainingStatus==='running' && <span className="text-xs font-mono" style={{ color:'var(--accent-blue)' }}>● LIVE</span>}
                  </div>
                  <div ref={logRef} className="p-3 font-mono text-xs space-y-0.5 overflow-y-auto" style={{ maxHeight:200 }}>
                    {logs.length===0
                      ? <p style={{ color:'var(--text-muted)' }}>En attente du lancement...</p>
                      : logs.map((l,i) => (
                        <p key={i} style={{
                          color: l.text.includes('❌')?'var(--error)': l.text.includes('✅')||l.text.includes('🏁')?'var(--success)': l.text.includes('🔍')?'var(--accent-orange)':'var(--text-tertiary)',
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
              <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
                <p className="text-xs font-semibold mb-1" style={{ color:'var(--text-tertiary)' }}>
                  Courbes d'apprentissage — {epochData.length} époque{epochData.length>1?'s':''}
                </p>
                <InfoBox text="La courbe de validation (pointillée) doit suivre la courbe d'entraînement. Si val_loss remonte alors que loss continue de baisser → surapprentissage (overfitting). L'early stopping stoppe automatiquement dans ce cas." color="var(--accent-blue)" />
                <div className="mt-3">
                  <LiveCharts epochs={epochData} />
                </div>
              </div>
            )}

            {/* Tab Trials */}
            {activeTab==='trials' && (
              <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color:'var(--text-tertiary)' }}>
                  Optimisation Bayésienne — {trialData.length}/{maxTrials} essais
                </p>
                <TrialsView trials={trialData} maxTrials={maxTrials} />
              </div>
            )}

            {/* Tab Prédictions */}
            {activeTab==='predictions' && (
              <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color:'var(--text-tertiary)' }}>
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