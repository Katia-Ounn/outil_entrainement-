/**
 * EDAPanel.jsx — Section EDA : Analyse Exploratoire Approfondie
 * Reproduit les 8 étapes de la Phase 1 du notebook DONNEES.ipynb
 */
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart2, Activity, GitBranch, AlertTriangle,
  TrendingUp, Box, Zap, RefreshCw, ChevronDown, ChevronUp,
  Database, CheckCircle, XCircle, Clock
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
  ReferenceLine
} from 'recharts';

const API = 'http://localhost:8000';

const SENSOR_COLORS = {
  volt:      '#4fc3f7',
  rotate:    '#81c784',
  pressure:  '#ffb74d',
  vibration: '#f06292',
};
const SENSOR_LABELS = {
  volt: 'Voltage', rotate: 'Rotation', pressure: 'Pression', vibration: 'Vibration'
};
const PIE_COLORS = ['#f44336', '#ff9800', '#9c27b0', '#2196f3', '#4caf50'];

// ──────────────────────────────────────────
// Composants UI de base
// ──────────────────────────────────────────
const Card = ({ title, icon: Icon, color = '#8a8d9f', children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: '#1a1d2e', borderColor: '#2a2d45' }}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 transition-colors"
        style={{ background: open ? '#232640' : '#1a1d2e' }}
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <Icon size={16} style={{ color }} />
          <span className="font-semibold text-sm" style={{ color: '#e4e6f0' }}>{title}</span>
        </div>
        {open ? <ChevronUp size={14} style={{ color: '#4a4d6a' }} /> : <ChevronDown size={14} style={{ color: '#4a4d6a' }} />}
      </button>
      {open && <div className="px-5 pb-5 pt-3">{children}</div>}
    </div>
  );
};

const Stat = ({ label, value, color = '#e4e6f0', sub }) => (
  <div className="rounded-lg p-3 border" style={{ background: '#232640', borderColor: '#2a2d45' }}>
    <p className="text-xs mb-1" style={{ color: '#8a8d9f' }}>{label}</p>
    <p className="text-xl font-bold font-mono" style={{ color }}>{value ?? '—'}</p>
    {sub && <p className="text-xs mt-0.5" style={{ color: '#4a4d6a' }}>{sub}</p>}
  </div>
);

const Loader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#4fc3f740', borderTopColor: '#4fc3f7' }} />
      <p className="text-xs font-mono" style={{ color: '#4a4d6a' }}>Calcul en cours...</p>
    </div>
  </div>
);

const TooltipStyle = {
  contentStyle: { background: '#232640', border: '1px solid #3d4172', borderRadius: 8, fontSize: 11 },
  labelStyle:   { color: '#e4e6f0' },
};

// ──────────────────────────────────────────
// SECTION 1 : Santé des données
// ──────────────────────────────────────────
const HealthSection = ({ data }) => {
  if (!data) return <Loader />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Machines" value={data.machines_total} color="#4fc3f7" />
        <Stat label="Fréquence" value={data.frequence_ok ? '1H ✅' : 'Variable ⚠️'} color={data.frequence_ok ? '#4caf50' : '#ff9800'} />
        <Stat label="Période" value="1 an" sub={`${data.periode_debut?.slice(0,10)} → ${data.periode_fin?.slice(0,10)}`} color="#81c784" />
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#232640' }}>
            {['Fichier', 'Lignes', 'Colonnes', 'NaN', 'NaN %', 'Doublons', 'Statut'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-widest" style={{ color: '#8a8d9f' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.fichiers?.map(f => (
            <tr key={f.fichier} style={{ borderBottom: '1px solid #2a2d45' }}>
              <td className="px-3 py-2 font-mono" style={{ color: '#4fc3f7' }}>{f.fichier}</td>
              <td className="px-3 py-2 font-mono" style={{ color: '#e4e6f0' }}>{f.lignes?.toLocaleString()}</td>
              <td className="px-3 py-2 font-mono" style={{ color: '#8a8d9f' }}>{f.colonnes}</td>
              <td className="px-3 py-2 font-mono" style={{ color: f.nan > 0 ? '#f44336' : '#4a4d6a' }}>{f.nan}</td>
              <td className="px-3 py-2 font-mono" style={{ color: '#4a4d6a' }}>{f.nan_pct}%</td>
              <td className="px-3 py-2 font-mono" style={{ color: f.doublons > 0 ? '#ff9800' : '#4a4d6a' }}>{f.doublons}</td>
              <td className="px-3 py-2">
                <span className="px-2 py-0.5 rounded-full text-xs font-mono"
                  style={{ background: f.statut === 'OK' ? '#0d2a1a' : '#2a1a0a', color: f.statut === 'OK' ? '#4caf50' : '#ff9800' }}>
                  {f.statut}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 2 : Pannes
// ──────────────────────────────────────────
const FailuresSection = ({ data }) => {
  if (!data) return <Loader />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Machine cible" value={`Machine ${data.machine_cible}`} color="#f44336" sub="Plus de pannes" />
        <Stat label="Pannes machine cible" value={data.pannes_cible} color="#ffb74d" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Barplot top 20 */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#8a8d9f' }}>
            Pannes par machine (Top 20)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.par_machine} margin={{ bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
              <XAxis dataKey="machineID" tick={{ fill: '#8a8d9f', fontSize: 9 }} angle={-45} textAnchor="end" axisLine={{ stroke: '#2a2d45' }} />
              <YAxis tick={{ fill: '#8a8d9f', fontSize: 10 }} axisLine={{ stroke: '#2a2d45' }} />
              <Tooltip {...TooltipStyle} formatter={v => [v, 'Pannes']} />
              <Bar dataKey="pannes" radius={[3, 3, 0, 0]} maxBarSize={30}>
                {data.par_machine?.map((m, i) => (
                  <Cell key={i} fill={m.est_cible ? '#f44336' : '#4fc3f7'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie types de pannes */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#8a8d9f' }}>
            Répartition des types de pannes
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.types_globaux}
                dataKey="count"
                nameKey="type"
                cx="50%" cy="50%"
                outerRadius={80}
                label={({ type, pct }) => `${type} (${pct}%)`}
                labelLine={{ stroke: '#3d4172' }}
              >
                {data.types_globaux?.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...TooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Détail machine cible */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#8a8d9f' }}>
          Chronologie — Machine {data.machine_cible}
        </p>
        <div className="max-h-48 overflow-y-auto rounded-lg" style={{ background: '#0a0c14' }}>
          <table className="w-full text-xs">
            <thead style={{ position: 'sticky', top: 0, background: '#232640' }}>
              <tr>
                <th className="px-3 py-2 text-left" style={{ color: '#8a8d9f' }}>Date</th>
                <th className="px-3 py-2 text-left" style={{ color: '#8a8d9f' }}>Composant</th>
              </tr>
            </thead>
            <tbody>
              {data.detail_cible?.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1d2e' }}>
                  <td className="px-3 py-1.5 font-mono" style={{ color: '#c8cad4' }}>{f.datetime}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-2 py-0.5 rounded text-xs font-mono"
                      style={{ background: '#2a1a1a', color: '#f44336' }}>{f.failure}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 3 : Séries temporelles
// ──────────────────────────────────────────
const TimeSeriesSection = ({ data }) => {
  const [activeSensor, setActiveSensor] = useState('volt');
  if (!data) return <Loader />;

  const seriesData = data.series?.[activeSensor] || [];
  const pannes     = data.pannes || [];

  // Trouver les valeurs min/max pour les pannes
  const vals    = seriesData.map(d => d.value);
  const yMin    = Math.min(...vals);
  const yMax    = Math.max(...vals);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {Object.keys(SENSOR_COLORS).map(s => (
          <button
            key={s}
            onClick={() => setActiveSensor(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all"
            style={{
              background:  activeSensor === s ? `${SENSOR_COLORS[s]}20` : '#232640',
              color:       activeSensor === s ? SENSOR_COLORS[s] : '#8a8d9f',
              borderColor: activeSensor === s ? SENSOR_COLORS[s] : '#3d4172',
            }}
          >
            {SENSOR_LABELS[s]}
          </button>
        ))}
        <span className="text-xs ml-auto" style={{ color: '#4a4d6a' }}>
          {data.periode?.debut} → {data.periode?.fin} (90j)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={seriesData} margin={{ right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
          <XAxis
            dataKey="datetime"
            tick={false}
            axisLine={{ stroke: '#2a2d45' }}
          />
          <YAxis tick={{ fill: '#8a8d9f', fontSize: 10 }} axisLine={{ stroke: '#2a2d45' }} width={60} />
          <Tooltip
            {...TooltipStyle}
            labelFormatter={l => l?.slice(0, 16)}
            formatter={v => [v?.toFixed(2), SENSOR_LABELS[activeSensor]]}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={SENSOR_COLORS[activeSensor]}
            dot={false}
            strokeWidth={1.5}
            name={SENSOR_LABELS[activeSensor]}
          />
          {pannes.map((p, i) => (
            <ReferenceLine
              key={i}
              x={p.datetime}
              stroke="#f44336"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{ value: p.failure, position: 'top', fill: '#f44336', fontSize: 9 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5" style={{ background: SENSOR_COLORS[activeSensor] }} />
          <span style={{ color: '#8a8d9f' }}>{SENSOR_LABELS[activeSensor]}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5" style={{ background: '#f44336', borderTop: '2px dashed #f44336' }} />
          <span style={{ color: '#8a8d9f' }}>Pannes ({pannes.length})</span>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 4 : Heatmap de corrélation
// ──────────────────────────────────────────
const CorrelationSection = ({ data }) => {
  if (!data) return <Loader />;
  const sensors = data.sensors || [];

  const getColor = (v) => {
    if (v === null || v === undefined) return '#232640';
    const abs = Math.abs(v);
    if (v > 0) return `rgba(79,195,247,${abs})`;
    return `rgba(240,98,146,${abs})`;
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="mx-auto">
          <thead>
            <tr>
              <th className="w-24" />
              {sensors.map(s => (
                <th key={s} className="px-2 py-2 text-xs font-mono" style={{ color: '#8a8d9f', minWidth: 80 }}>
                  {data.labels?.[s] || s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sensors.map(row => (
              <tr key={row}>
                <td className="pr-3 text-xs font-mono text-right" style={{ color: '#8a8d9f', minWidth: 80 }}>
                  {data.labels?.[row] || row}
                </td>
                {sensors.map(col => {
                  const cell  = data.cells?.find(c => c.row === row && c.col === col);
                  const value = cell?.value;
                  return (
                    <td
                      key={col}
                      className="text-center text-xs font-mono font-bold rounded"
                      style={{
                        background: getColor(value),
                        color: Math.abs(value ?? 0) > 0.5 ? '#fff' : '#e4e6f0',
                        padding: '14px 8px',
                        minWidth: 80,
                      }}
                      title={`${row} × ${col} = ${value?.toFixed(3)}`}
                    >
                      {value?.toFixed(3)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-16 h-3 rounded" style={{ background: 'linear-gradient(90deg, rgba(240,98,146,1), #232640, rgba(79,195,247,1))' }} />
          <span style={{ color: '#8a8d9f' }}>-1 → 0 → +1</span>
        </div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 5 : Stats avant panne vs normal
// ──────────────────────────────────────────
const PreFailureSection = ({ data }) => {
  if (!data) return <Loader />;

  const chartData = data.stats?.map(s => ({
    name:         s.label,
    normal:       s.moy_normal,
    pre_panne:    s.moy_pre_panne,
    delta:        s.delta_pct,
  })) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Stat label="Fenêtre d'analyse" value={`${data.window_hours}h`} color="#4fc3f7" />
        <Stat label="Pannes analysées"  value={data.nb_pannes}          color="#f44336" />
        <Stat label="Machine"           value={`#${data.machine_id}`}   color="#8a8d9f" />
      </div>

      {/* Tableau comparatif */}
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#232640' }}>
            {['Capteur', 'Moy. Normal', 'Std Normal', 'Moy. Pré-Panne', 'Std Pré-Panne', 'Δ Moy (%)', ''].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-widest" style={{ color: '#8a8d9f' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.stats?.map(s => (
            <tr key={s.capteur} style={{ borderBottom: '1px solid #2a2d45' }}>
              <td className="px-3 py-2.5">
                <span className="font-mono font-semibold" style={{ color: SENSOR_COLORS[s.capteur] }}>
                  {s.label}
                </span>
              </td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#c8cad4' }}>{s.moy_normal}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#4a4d6a' }}>{s.std_normal}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#ffb74d' }}>
                {s.moy_pre_panne ?? 'N/A'}
              </td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#4a4d6a' }}>
                {s.std_pre_panne ?? 'N/A'}
              </td>
              <td className="px-3 py-2.5 font-mono font-bold"
                style={{ color: s.delta_pct == null ? '#4a4d6a' : s.delta_pct > 0 ? '#f44336' : '#4caf50' }}>
                {s.delta_pct != null ? `${s.delta_pct > 0 ? '+' : ''}${s.delta_pct}%` : 'N/A'}
              </td>
              <td className="px-3 py-2.5">
                {s.alerte && <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                  style={{ background: '#2a1a0a', color: '#ff9800' }}>⚠️ Alerte</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Graphique comparatif */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
          <XAxis dataKey="name" tick={{ fill: '#8a8d9f', fontSize: 11 }} axisLine={{ stroke: '#2a2d45' }} />
          <YAxis tick={{ fill: '#8a8d9f', fontSize: 10 }} axisLine={{ stroke: '#2a2d45' }} />
          <Tooltip {...TooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="normal"    fill="#4fc3f7" name="Fonctionnement normal" radius={[3,3,0,0]} maxBarSize={40} />
          <Bar dataKey="pre_panne" fill="#f44336" name="24h avant panne"       radius={[3,3,0,0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 6 : Outliers
// ──────────────────────────────────────────
const OutliersSection = ({ data }) => {
  if (!data) return <Loader />;

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-4 border text-xs"
        style={{ background: '#1a2a1a', borderColor: '#4caf50' }}
      >
        <p className="font-semibold mb-1" style={{ color: '#81c784' }}>⚠️ Décision sur les outliers</p>
        <p style={{ color: '#8a8d9f' }}>{data.decision}</p>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#232640' }}>
            {['Capteur', 'Min', 'Max', 'Q1', 'Q3', 'Borne Basse IQR', 'Borne Haute IQR', 'Outliers Z>3', 'Outliers IQR', '%'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#8a8d9f', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rapport?.map(r => (
            <tr key={r.capteur} style={{ borderBottom: '1px solid #2a2d45' }}>
              <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: SENSOR_COLORS[r.capteur] }}>{r.label}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#c8cad4' }}>{r.min}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#c8cad4' }}>{r.max}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#8a8d9f' }}>{r.Q1}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#8a8d9f' }}>{r.Q3}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#4a4d6a' }}>{r.lower_iqr}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#4a4d6a' }}>{r.upper_iqr}</td>
              <td className="px-3 py-2.5 font-mono font-bold" style={{ color: r.outliers_z > 0 ? '#ffb74d' : '#4a4d6a' }}>{r.outliers_z}</td>
              <td className="px-3 py-2.5 font-mono font-bold" style={{ color: r.outliers_iqr > 0 ? '#f06292' : '#4a4d6a' }}>{r.outliers_iqr}</td>
              <td className="px-3 py-2.5 font-mono" style={{ color: '#8a8d9f' }}>{r.pct_outliers}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Barplot outliers */}
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data.rapport} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
          <XAxis dataKey="label" tick={{ fill: '#8a8d9f', fontSize: 11 }} axisLine={{ stroke: '#2a2d45' }} />
          <YAxis tick={{ fill: '#8a8d9f', fontSize: 10 }} axisLine={{ stroke: '#2a2d45' }} />
          <Tooltip {...TooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="outliers_z"   fill="#ffb74d" name="Z-Score > 3" radius={[3,3,0,0]} maxBarSize={35} />
          <Bar dataKey="outliers_iqr" fill="#f06292" name="IQR × 3"     radius={[3,3,0,0]} maxBarSize={35} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 7 : Distribution (Boxplot stats)
// ──────────────────────────────────────────
const BoxplotSection = ({ data }) => {
  if (!data) return <Loader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {data.capteurs?.map(c => (
          <div key={c.capteur} className="rounded-xl p-4 border" style={{ background: '#232640', borderColor: '#2a2d45' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm" style={{ color: SENSOR_COLORS[c.capteur] }}>{c.label}</span>
              <span className="text-xs font-mono" style={{ color: '#4a4d6a' }}>
                moy: {c.mean}  |  σ: {c.std}
              </span>
            </div>

            {/* Box plot visuel simplifié */}
            <div className="relative h-10 flex items-center">
              {(() => {
                const range  = c.max - c.min;
                const toX    = v => ((v - c.min) / range * 100).toFixed(1) + '%';
                return (
                  <div className="relative w-full h-4">
                    {/* Ligne centrale */}
                    <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: '#3d4172' }} />
                    {/* Whisker low */}
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: toX(c.whisker_low), background: SENSOR_COLORS[c.capteur] }} />
                    {/* Box Q1-Q3 */}
                    <div className="absolute top-0 bottom-0 rounded"
                      style={{
                        left:       toX(c.Q1),
                        width:      `${((c.Q3 - c.Q1) / range * 100).toFixed(1)}%`,
                        background: `${SENSOR_COLORS[c.capteur]}30`,
                        border:     `1px solid ${SENSOR_COLORS[c.capteur]}`,
                      }}
                    />
                    {/* Médiane */}
                    <div className="absolute top-0 bottom-0 w-0.5"
                      style={{ left: toX(c.median), background: SENSOR_COLORS[c.capteur] }} />
                    {/* Whisker high */}
                    <div className="absolute top-0 bottom-0 w-px" style={{ left: toX(c.whisker_high), background: SENSOR_COLORS[c.capteur] }} />
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-5 gap-1 mt-3 text-center">
              {[
                { l: 'Min',    v: c.min    },
                { l: 'Q1',     v: c.Q1     },
                { l: 'Méd.',   v: c.median },
                { l: 'Q3',     v: c.Q3     },
                { l: 'Max',    v: c.max    },
              ].map(s => (
                <div key={s.l}>
                  <p className="text-xs" style={{ color: '#4a4d6a' }}>{s.l}</p>
                  <p className="text-xs font-mono font-bold" style={{ color: '#c8cad4' }}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────
// SECTION 8 : Analyse des erreurs
// ──────────────────────────────────────────
const ErrorsSection = ({ data }) => {
  if (!data) return <Loader />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Répartition par type */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#8a8d9f' }}>
            Répartition par type d'erreur
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data.par_type} dataKey="count" nameKey="errorID" cx="50%" cy="50%" outerRadius={75}
                label={({ errorID, pct }) => `${errorID} (${pct}%)`} labelLine={{ stroke: '#3d4172' }}>
                {data.par_type?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip {...TooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Par machine */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#8a8d9f' }}>
            Erreurs par machine (Top 15)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.par_machine} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d45" />
              <XAxis type="number" tick={{ fill: '#8a8d9f', fontSize: 9 }} axisLine={{ stroke: '#2a2d45' }} />
              <YAxis type="category" dataKey="machineID" tick={{ fill: '#8a8d9f', fontSize: 9 }} axisLine={{ stroke: '#2a2d45' }} width={35} />
              <Tooltip {...TooltipStyle} />
              <Bar dataKey="count" fill="#ffb74d" radius={[0, 3, 3, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg p-3 border flex items-center justify-between"
        style={{ background: '#1a1d2e', borderColor: '#2a2d45' }}>
        <span className="text-xs" style={{ color: '#8a8d9f' }}>
          Machine {data.machine_cible ?? '—'} · Erreurs totales
        </span>
        <span className="font-bold font-mono" style={{ color: '#ffb74d' }}>
          {data.machine_cible_total} erreurs
        </span>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────
// PANNEAU PRINCIPAL
// ──────────────────────────────────────────
export default function EDAPanel() {
  const [machineId, setMachineId] = useState(99);
  const [loading,   setLoading]   = useState(false);
  const [loaded,    setLoaded]    = useState(false);
  const [data,      setData]      = useState({});
  const [error,     setError]     = useState('');

  const fetchSection = useCallback(async (endpoint, key) => {
    try {
      const res = await fetch(`${API}/api/eda/${endpoint}?machine_id=${machineId}`);
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      setData(prev => ({ ...prev, [key]: json }));
    } catch (e) {
      console.error(`EDA ${key} error:`, e);
    }
  }, [machineId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    setData({});
    try {
      // Charger en parallèle par groupes pour ne pas surcharger
      await Promise.all([
        fetchSection('health',      'health'),
        fetchSection('failures',    'failures'),
      ]);
      await Promise.all([
        fetchSection('timeseries',  'timeseries'),
        fetchSection('correlation', 'correlation'),
      ]);
      await Promise.all([
        fetchSection('prefailure',  'prefailure'),
        fetchSection('outliers',    'outliers'),
        fetchSection('boxplot',     'boxplot'),
        fetchSection('errors',      'errors'),
      ]);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [fetchSection]);

  const sections = [
    { key: 'health',      title: 'Étape 1 — Santé des données',                    icon: Database,      color: '#4fc3f7', Component: HealthSection },
    { key: 'failures',    title: 'Étape 2 — Analyse des pannes',                   icon: AlertTriangle, color: '#f44336', Component: FailuresSection },
    { key: 'timeseries',  title: 'Étape 3 — Séries temporelles (90 jours)',        icon: Activity,      color: '#81c784', Component: TimeSeriesSection },
    { key: 'correlation', title: 'Étape 4 — Heatmap de corrélation',               icon: GitBranch,     color: '#ce93d8', Component: CorrelationSection },
    { key: 'prefailure',  title: 'Étape 5 — Stats 24h avant panne vs normal',      icon: Clock,         color: '#ffb74d', Component: PreFailureSection },
    { key: 'outliers',    title: 'Étape 6 — Détection des outliers (Z-Score+IQR)', icon: Zap,            color: '#ff9800', Component: OutliersSection },
    { key: 'boxplot',     title: 'Étape 7 — Distribution des capteurs',            icon: Box,           color: '#f06292', Component: BoxplotSection },
    { key: 'errors',      title: 'Étape 8 — Analyse des erreurs',                  icon: BarChart2,     color: '#4caf50', Component: ErrorsSection },
  ];

  return (
    <div className="space-y-6">
      {/* Header + bouton lancer */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: '#e4e6f0' }}>
            EDA Approfondie — Phase 1
          </h2>
          <p className="text-sm mt-1" style={{ color: '#8a8d9f' }}>
            Reproduit les 8 étapes d'analyse du notebook DONNEES.ipynb
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs" style={{ color: '#8a8d9f' }}>Machine</label>
            <input
              type="number" value={machineId}
              onChange={e => setMachineId(Number(e.target.value))}
              className="w-20 px-2 py-1.5 rounded-lg text-sm font-mono border outline-none"
              style={{ background: '#232640', borderColor: '#3d4172', color: '#4fc3f7' }}
              min={1} max={100}
            />
          </div>
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background:  loading ? '#232640' : 'linear-gradient(135deg, #0d4a6b, #4fc3f730)',
              color:       loading ? '#4a4d6a' : '#4fc3f7',
              border:      '1px solid',
              borderColor: loading ? '#2a2d45' : '#4fc3f7',
              cursor:      loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? <><RefreshCw size={15} className="animate-spin" /> Analyse...</>
              : <><TrendingUp size={15} /> Lancer l'EDA</>
            }
          </button>
        </div>
      </div>

      {/* Erreur */}
      {error && (
        <div className="rounded-xl p-4 border flex items-center gap-3"
          style={{ background: '#2a1a1a', borderColor: '#f44336' }}>
          <XCircle size={16} style={{ color: '#f44336' }} />
          <p className="text-sm font-mono" style={{ color: '#f06292' }}>{error}</p>
        </div>
      )}

      {/* État initial */}
      {!loaded && !loading && !error && (
        <div className="rounded-2xl border p-12 text-center"
          style={{ background: '#1a1d2e', borderColor: '#2a2d45', borderStyle: 'dashed' }}>
          <TrendingUp size={40} className="mx-auto mb-4" style={{ color: '#2a2d45' }} />
          <p className="text-sm font-semibold" style={{ color: '#4a4d6a' }}>
            Cliquez sur "Lancer l'EDA" pour démarrer l'analyse
          </p>
          <p className="text-xs mt-2" style={{ color: '#3a3d5c' }}>
            Assurez-vous d'avoir effectué l'ingestion des données au préalable
          </p>
        </div>
      )}

      {/* Sections accordéon */}
      {(loaded || loading) && (
        <div className="space-y-4">
          {sections.map(({ key, title, icon, color, Component }) => (
            <Card key={key} title={title} icon={icon} color={color} defaultOpen={key === 'health'}>
              <Component data={data[key]} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
