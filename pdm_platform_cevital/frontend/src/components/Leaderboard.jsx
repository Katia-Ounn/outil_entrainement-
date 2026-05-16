/**
 * Leaderboard.jsx — Tableau comparatif des expériences
 * Récupère depuis SQLite via GET /api/experiments
 * Auto-refresh toutes les 4s · Détails complets par expérience
 */
import { useState, useEffect, useCallback } from 'react';
import { Trophy, RefreshCw, Trash2, ChevronUp, ChevronDown, Eye, Database } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, Legend
} from 'recharts';

const API = 'http://localhost:8000';

const ARCH_COLORS = {
  LSTM:        'var(--accent-blue)',
  GRU:         'var(--accent-green)',
  RNN:         'var(--accent-orange)',
  Transformer: 'var(--accent-purple)',
};

function StatusBadge({ status }) {
  const map = {
    completed: { bg:'var(--tint-success-bg)', color:'var(--success)'  },
    running:   { bg:'var(--tint-info-bg)', color:'var(--accent-blue)'  },
    failed:    { bg:'var(--tint-error-bg)', color:'var(--error)'  },
    pending:   { bg:'var(--bg-card)', color:'var(--text-tertiary)'  },
  };
  const s = map[status] || map.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-mono"
      style={{ background:s.bg, color:s.color }}>
      {status}
    </span>
  );
}

export default function Leaderboard() {
  const [experiments, setExperiments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [sortKey,     setSortKey]     = useState('r2_score');
  const [sortAsc,     setSortAsc]     = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/experiments`);
      const data = await res.json();
      setExperiments(data);
      // Mettre à jour l'expérience sélectionnée si elle a changé
      if (selected) {
        const updated = data.find(e => e.id === selected.id);
        if (updated) setSelected(updated);
      }
    } catch (_) {}
    setLoading(false);
  }, [selected]);

  useEffect(() => { fetchExperiments(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchExperiments, 4000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchExperiments]);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette expérience ?')) return;
    await fetch(`${API}/api/experiments/${id}`, { method:'DELETE' });
    fetchExperiments();
    if (selected?.id === id) setSelected(null);
  };

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(v => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sorted = [...experiments].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });

  const completed = experiments.filter(e => e.status === 'completed' && e.r2_score != null);

  const SortIcon = ({ k }) => sortKey === k
    ? (sortAsc ? <ChevronUp size={11}/> : <ChevronDown size={11}/>)
    : null;

  const thCls = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-widest cursor-pointer select-none whitespace-nowrap";

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background:'linear-gradient(135deg,#2a1a0a,#4a2a0a)', border:'1px solid #ffb74d40' }}>
            <Trophy size={18} style={{ color:'var(--accent-orange)' }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color:'var(--text-primary)' }}>Leaderboard</h2>
            <p className="text-xs" style={{ color:'var(--text-tertiary)' }}>
              {experiments.length} expérience{experiments.length>1?'s':''} · {completed.length} terminée{completed.length>1?'s':''} · Stockées dans SQLite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border"
            style={{ background:'var(--bg-card)', borderColor:'var(--border-default)', color:'var(--text-muted)' }}>
            <Database size={11}/> pdm_experiments.db
          </div>
          <button onClick={() => setAutoRefresh(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{
              background: autoRefresh?'var(--tint-success-bg)':'var(--bg-card)',
              color:      autoRefresh?'var(--success)':'var(--text-tertiary)',
              borderColor:autoRefresh?'var(--success)':'var(--border-default)',
            }}>
            {autoRefresh ? '● Auto-refresh' : 'Auto-refresh'}
          </button>
          <button onClick={fetchExperiments}
            className="p-2 rounded-lg border transition-all"
            style={{ background:'var(--bg-card)', borderColor:'var(--border-default)', color:'var(--text-tertiary)' }}>
            <RefreshCw size={14} className={loading?'animate-spin':''} />
          </button>
        </div>
      </div>

      {/* ── Explication stockage ── */}
      <div className="rounded-xl border p-3 flex items-start gap-2"
        style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
        <Database size={13} style={{ color:'var(--accent-blue)', flexShrink:0, marginTop:1 }} />
        <p className="text-xs leading-relaxed" style={{ color:'var(--text-tertiary)' }}>
          Chaque entraînement est automatiquement sauvegardé dans <span style={{color:'var(--accent-blue)',fontFamily:'monospace'}}>pdm_experiments.db</span> (SQLite).
          Les résultats persistent entre les sessions — vous retrouvez ici toutes vos expériences passées, même après redémarrage du serveur.
          Le modèle <span style={{color:'var(--accent-orange)',fontFamily:'monospace'}}>.keras</span> et les scalers <span style={{color:'var(--accent-orange)',fontFamily:'monospace'}}>.pkl</span> sont sauvegardés dans <span style={{color:'var(--accent-blue)',fontFamily:'monospace'}}>exports/</span>.
        </p>
      </div>

      {/* ── Graphe comparatif R² ── */}
      {completed.length > 1 && (
        <div className="rounded-xl border p-4" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color:'var(--text-tertiary)' }}>
            Comparaison R² Score — tous les modèles entraînés
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={completed.slice(0,15)} margin={{ top:5, right:10, bottom:30, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
              <XAxis dataKey="name" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} angle={-25} textAnchor="end"
                axisLine={{ stroke:'var(--border-default)' }} />
              <YAxis domain={[0,1]} tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
              <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
                formatter={(v) => [v?.toFixed(4), 'R²']} />
              <Bar dataKey="r2_score" radius={[4,4,0,0]} maxBarSize={40}>
                {completed.map((e,i) => (
                  <Cell key={i} fill={ARCH_COLORS[e.architecture]||'var(--accent-blue)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tableau principal ── */}
      <div className="rounded-xl border overflow-hidden" style={{ background:'var(--bg-card)', borderColor:'var(--border-default)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background:'var(--bg-elevated)', borderBottom:'1px solid var(--border-default)' }}>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }}>#</th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }} onClick={()=>handleSort('name')}>
                  Nom <SortIcon k="name"/>
                </th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }}>Arch.</th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }}>Mode</th>
                <th className={thCls} style={{ color:'var(--accent-orange)' }} onClick={()=>handleSort('r2_score')}>
                  R² <SortIcon k="r2_score"/>
                </th>
                <th className={thCls} style={{ color:'var(--accent-blue)' }} onClick={()=>handleSort('mae_hours')}>
                  MAE (h) <SortIcon k="mae_hours"/>
                </th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }} onClick={()=>handleSort('duration_sec')}>
                  Durée <SortIcon k="duration_sec"/>
                </th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }} onClick={()=>handleSort('created_at')}>
                  Date <SortIcon k="created_at"/>
                </th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }}>Statut</th>
                <th className={thCls} style={{ color:'var(--text-tertiary)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm" style={{ color:'var(--text-muted)' }}>
                    Aucune expérience. Lancez un entraînement !
                  </td>
                </tr>
              ) : sorted.map((exp, idx) => {
                const isFirst = idx===0 && exp.status==='completed';
                return (
                  <tr key={exp.id}
                    className="transition-colors cursor-pointer"
                    style={{
                      borderBottom:'1px solid var(--border-default)',
                      background: selected?.id===exp.id?'var(--bg-elevated)':'transparent',
                    }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg-card-alt)'}
                    onMouseLeave={e=>e.currentTarget.style.background=selected?.id===exp.id?'var(--bg-elevated)':'transparent'}
                    onClick={()=>setSelected(selected?.id===exp.id?null:exp)}>
                    <td className="px-3 py-3 text-xs font-mono" style={{ color:'var(--text-muted)' }}>
                      {isFirst?'🥇':idx+1}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-semibold" style={{ color:'var(--text-primary)' }}>{exp.name}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold"
                        style={{ background:`${ARCH_COLORS[exp.architecture]||'var(--text-tertiary)'}20`, color:ARCH_COLORS[exp.architecture]||'var(--text-tertiary)' }}>
                        {exp.architecture}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-mono" style={{ color:'var(--text-tertiary)' }}>{exp.mode}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-bold font-mono" style={{ color: exp.r2_score>0.8?'var(--success)': exp.r2_score>0.5?'var(--accent-orange)':'#f06292' }}>
                        {exp.r2_score!=null?exp.r2_score.toFixed(4):'—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-mono" style={{ color:'var(--accent-blue)' }}>
                        {exp.mae_hours!=null?`${exp.mae_hours.toFixed(1)}h`:'—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-mono" style={{ color:'var(--text-tertiary)' }}>
                        {exp.duration_sec!=null?`${Math.round(exp.duration_sec)}s`:'—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-mono" style={{ color:'var(--text-muted)' }}>
                        {exp.created_at?new Date(exp.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}
                      </span>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={exp.status}/></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={e=>{e.stopPropagation();setSelected(selected?.id===exp.id?null:exp);}}
                          className="p-1.5 rounded transition-colors" style={{ color:'var(--text-tertiary)' }} title="Voir détails">
                          <Eye size={14}/>
                        </button>
                        <button onClick={e=>{e.stopPropagation();handleDelete(exp.id);}}
                          className="p-1.5 rounded transition-colors" style={{ color:'var(--text-muted)' }} title="Supprimer">
                          <Trash2 size={14}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Détails expérience sélectionnée ── */}
      {selected && (
        <div className="rounded-xl border space-y-4 overflow-hidden" style={{ borderColor:'var(--border-strong)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5">
            <div>
              <h3 className="font-bold text-base" style={{ color:'var(--text-primary)' }}>{selected.name}</h3>
              <p className="text-xs mt-0.5" style={{ color:'var(--text-tertiary)' }}>
                {selected.architecture} · {selected.mode}
                {selected.created_at && ' · ' + new Date(selected.created_at).toLocaleString('fr-FR')}
              </p>
            </div>
            <button onClick={()=>setSelected(null)} className="p-1.5 rounded" style={{ color:'var(--text-muted)' }}>✕</button>
          </div>

          {/* Métriques */}
          {selected.status === 'completed' && (
            <div className="grid grid-cols-4 gap-3 px-5">
              {[
                {label:'R² Score',    value:selected.r2_score?.toFixed(4),              color: selected.r2_score>0.8?'var(--success)': selected.r2_score>0.5?'var(--accent-orange)':'#f06292'},
                {label:'MAE normalisé',value:selected.mae?.toFixed(5),                  color:'var(--accent-blue)'},
                {label:'MAE (heures)', value:selected.mae_hours!=null?`${selected.mae_hours.toFixed(1)}h`:'—', color:'var(--accent-orange)'},
                {label:'Durée',       value:selected.duration_sec!=null?`${Math.round(selected.duration_sec)}s`:'—', color:'var(--accent-purple)'},
              ].map(s => (
                <div key={s.label} className="rounded-lg px-3 py-2 border" style={{ background:'var(--bg-base)', borderColor:'var(--border-default)' }}>
                  <p className="text-xs" style={{ color:'var(--text-tertiary)' }}>{s.label}</p>
                  <p className="text-lg font-bold font-mono" style={{ color:s.color }}>{s.value??'—'}</p>
                </div>
              ))}
            </div>
          )}

          {/* Hyperparamètres */}
          {selected.hyperparameters && (
            <div className="px-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color:'var(--text-tertiary)' }}>
                Hyperparamètres utilisés
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selected.hyperparameters).map(([k,v]) => (
                  <div key={k} className="text-xs font-mono px-2 py-1 rounded border"
                    style={{ background:'var(--bg-elevated)', borderColor:'var(--border-strong)', color:'var(--accent-blue)' }}>
                    <span style={{ color:'var(--text-tertiary)' }}>{k}: </span>
                    <span>{JSON.stringify(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Courbes loss/MAE */}
          {selected.training_history?.loss && (
            <div className="px-5 pb-5 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color:'var(--text-tertiary)' }}>
                Courbes d'apprentissage sauvegardées ({selected.training_history.loss.length} époques)
              </p>
              {/* Loss */}
              <div>
                <p className="text-xs mb-1" style={{ color:'var(--text-muted)' }}>Loss (MSE)</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart
                    data={selected.training_history.loss.map((l,i) => ({
                      epoch: i+1,
                      loss: l,
                      val_loss: selected.training_history.val_loss?.[i],
                    }))}
                    margin={{ top:5, right:10, bottom:5, left:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                    <XAxis dataKey="epoch" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
                    <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={60} tickFormatter={v=>v.toFixed(4)} />
                    <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
                      formatter={(v,n) => [v?.toFixed(6),n]} labelFormatter={l=>`Époque ${l}`} />
                    <Legend wrapperStyle={{ fontSize:11 }} />
                    <Line type="monotone" dataKey="loss"     stroke="#f06292" dot={false} strokeWidth={2} name="Train Loss" />
                    <Line type="monotone" dataKey="val_loss" stroke="var(--accent-purple)" dot={false} strokeWidth={2} name="Val Loss" strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* MAE */}
              {selected.training_history.mae && (
                <div>
                  <p className="text-xs mb-1" style={{ color:'var(--text-muted)' }}>MAE</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart
                      data={selected.training_history.mae.map((m,i) => ({
                        epoch: i+1,
                        mae: m,
                        val_mae: selected.training_history.val_mae?.[i],
                      }))}
                      margin={{ top:5, right:10, bottom:5, left:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                      <XAxis dataKey="epoch" tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} />
                      <YAxis tick={{ fill:'var(--text-tertiary)', fontSize:9 }} axisLine={{ stroke:'var(--border-default)' }} width={60} tickFormatter={v=>v.toFixed(4)} />
                      <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:8 }}
                        formatter={(v,n) => [v?.toFixed(6),n]} labelFormatter={l=>`Époque ${l}`} />
                      <Legend wrapperStyle={{ fontSize:11 }} />
                      <Line type="monotone" dataKey="mae"     stroke="var(--accent-orange)" dot={false} strokeWidth={2} name="Train MAE" />
                      <Line type="monotone" dataKey="val_mae" stroke="var(--accent-green)" dot={false} strokeWidth={2} name="Val MAE" strokeDasharray="5 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Chemins fichiers */}
          {selected.model_path && (
            <div className="px-5 pb-5">
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color:'var(--text-tertiary)' }}>Fichiers sauvegardés</p>
              <div className="space-y-1">
                {[
                  {label:'Modèle',   path:selected.model_path,     color:'var(--accent-blue)'},
                  {label:'Scaler X', path:selected.scaler_x_path,  color:'var(--accent-green)'},
                  {label:'Scaler Y', path:selected.scaler_y_path,  color:'var(--accent-green)'},
                ].filter(f=>f.path).map(f => (
                  <div key={f.label} className="flex items-center gap-2 text-xs font-mono">
                    <span style={{ color:'var(--text-muted)', width:60 }}>{f.label}</span>
                    <span className="px-2 py-0.5 rounded" style={{ background:'var(--bg-elevated)', color:f.color }}>
                      {f.path.split('\\').pop().split('/').pop()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}