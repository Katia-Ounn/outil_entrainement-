# 🏆 LEADERBOARD DESIGN GUIDE — Cevital

> **Document destiné à Claude Code** pour enrichir le Leaderboard existant SANS casser le design actuel.
> Ce guide complète la **Phase 4 de ROADMAP_CEVITAL_partie2.md**.
> ⚠️ **À lire AVANT toute modification du fichier `Leaderboard.jsx`.**

---

## 🎯 Principe directeur

Le leaderboard actuel a un **design réussi** qui ne doit **pas** être refait de zéro.

**Règle d'or** : on **AJOUTE** des choses (mini-onglets, nouvelles colonnes, boutons sticky), on ne **REFAIT PAS** ce qui existe.

---

## 📐 Structure existante à PRÉSERVER (zone protégée)

Voici tous les éléments visuels actuels qui doivent rester **identiques** ou être améliorés à la marge :

### 🔒 ZONE 1 : Header
```
┌────────────────────────────────────────────────────────────────┐
│ 🏆 Leaderboard                          [📁 pdm_experiments.db]│
│    3 expériences · 2 terminées · Stockées dans SQLite          │
│                                         [● Auto-refresh] [↻]   │
└────────────────────────────────────────────────────────────────┘
```

**À conserver** :
- Icône trophée jaune/orange dans cercle arrondi
- Titre "Leaderboard" en gras blanc
- Sous-titre dynamique "X expériences · Y terminées · Stockées dans SQLite"
- Badge `pdm_experiments.db` à droite avec icône
- Bouton Auto-refresh **vert** avec point pulsant
- Bouton refresh manuel (icône rotation)

**À adapter** :
- Le sous-titre reste tel quel mais on remplace `pdm_experiments.db` par le nom réel si nécessaire

---

### 🔒 ZONE 2 : InfoBox pédagogique SQLite
```
┌────────────────────────────────────────────────────────────────┐
│ 💾 Chaque entraînement est automatiquement sauvegardé dans     │
│    pdm_experiments.db (SQLite). Les résultats persistent entre │
│    les sessions — vous retrouvez ici toutes vos expériences    │
│    passées, même après redémarrage du serveur. Le modèle       │
│    .keras et les scalers .pkl sont sauvegardés dans exports/.  │
└────────────────────────────────────────────────────────────────┘
```

**À conserver tel quel** — c'est super pédagogique pour le jury.

**Légère adaptation** : remplacer `exports/` par `backend/models/{exp_id}/` (chemin réel Cevital).

---

### 🔒 ZONE 3 : Graphe Comparaison R² Score
```
┌─── COMPARAISON R² SCORE — TOUS LES MODÈLES ENTRAÎNÉS ───┐
│                                                          │
│ 1.00 ┤   ┌──┐                ┌──┐                       │
│      │   │  │                │  │                       │
│ 0.75 ┤   │  │                │  │                       │
│      │   │  │                │  │                       │
│ 0.50 ┤   │  │                │  │                       │
│      │   │  │                │  │                       │
│ 0.25 ┤   │  │                │  │                       │
│      │   │  │                │  │                       │
│ 0.00 └───┴──┴────────────────┴──┴───────────────────────│
│         Exp_LSTM_01         Exp_LSTM_01                 │
└──────────────────────────────────────────────────────────┘
```

**À conserver** :
- Style en barres bleues (couleur `#4fc3f7` ou variable CSS équivalente)
- Lignes pointillées horizontales à 0.25, 0.5, 0.75, 1.0
- Labels expérience inclinés en bas
- Encart border arrondi avec léger fond foncé

---

### 🔒 ZONE 4 : Tableau des expériences

Structure actuelle :
```
| # | NOM         | ARCH. | MODE      | R²    | MAE (H) | DURÉE | DATE        | STATUT    | ACTIONS |
|---|-------------|-------|-----------|-------|---------|-------|-------------|-----------|---------|
| 🥇| Exp_LSTM_01 | LSTM  | automatic | 0.866 | 55.2h   | 1721s | 05/05 12:31 | completed | 👁 🗑   |
```

**À conserver** :
- Trophée 🥇 pour le meilleur modèle (R² max)
- Badge architecture coloré (LSTM = bleu, GRU = vert)
- Mode `automatic` / `manual` en texte simple
- R² en **vert** quand > 0.7, sinon couleur neutre
- MAE en **bleu**
- Durée + Date en couleur neutre
- Badge statut : `completed` (vert), `running` (bleu pulsant), `error` (rouge)
- Actions : icône œil 👁️ (détails) + corbeille 🗑️ (supprimer)
- Possibilité de **trier** par colonne en cliquant sur l'en-tête

**À adapter (les colonnes)** :

```
AVANT (Azure) :
| # | NOM | ARCH. | MODE | R² | MAE (H) | DURÉE | DATE | STATUT | ACTIONS |

APRÈS (Cevital) :
| # | NOM | ARCH. | MODE | R² | MAE (j) | F1 | MAPE | DURÉE | DATE | STATUT | ACTIONS |
```

Changements précis :
- `MAE (H)` → `MAE (j)` (unité = jours pour Cevital)
- 🆕 Ajout colonne `F1` (vert si > 0.8, orange si > 0.6, rouge sinon)
- 🆕 Ajout colonne `MAPE` (vert si < 10%, orange si < 20%, rouge sinon)

---

## 🆕 Ce qu'on AJOUTE : la carte détails avec mini-onglets

### Structure générale

Quand l'utilisateur clique sur 👁️ dans une ligne `completed`, la **carte qui s'ouvre actuellement** (sous le tableau) est conservée MAIS enrichie d'un **système de mini-onglets** internes.

```
┌─── CARTE DÉTAILS (s'ouvre sous le tableau, style actuel conservé) ──┐
│                                                                      │
│ Exp_LSTM_01                                                     [×] │  ← Bouton fermer
│ LSTM · automatic · Dataset "Cevital 2023" · 05/05/2026 12:31         │
│                                                                      │
│ ┌─ Mini-onglets ────────────────────────────────────────────────┐   │
│ │ [📈 Régression ✓] [🎯 Classification] [📊 Apprentissage]       │   │
│ │ [🔮 Prédictions] [⚙️ Config]                                   │   │
│ └────────────────────────────────────────────────────────────────┘   │
│                                                                      │
│ ─── Contenu de l'onglet actif ────────────────────────────────────  │
│                                                                      │
│  [Contenu spécifique à chaque onglet ici]                            │
│                                                                      │
│                                                                      │
│ ═══════════════════════════════════════════════════════════════════ │
│ 🔻 BARRE STICKY (toujours visible en bas de la carte) 🔻             │
│ [🔄 Re-entraîner] [📥 Télécharger ZIP] [🗑️ Supprimer]              │
└──────────────────────────────────────────────────────────────────────┘
```

### Code structure (React)

```jsx
function ExperimentDetailsCard({ experiment, onClose }) {
  const [activeTab, setActiveTab] = useState('regression');

  const tabs = [
    { id: 'regression',     label: '📈 Régression',       icon: TrendingUp },
    { id: 'classification', label: '🎯 Classification',   icon: Target },
    { id: 'training',       label: '📊 Apprentissage',    icon: Activity },
    { id: 'predictions',    label: '🔮 Prédictions',      icon: Calendar },
    { id: 'config',         label: '⚙️ Config',           icon: Settings },
  ];

  return (
    <div className="rounded-xl border p-6 mt-4" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border-default)',
    }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold">{experiment.name}</h3>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {experiment.architecture} · {experiment.mode} · Dataset "{experiment.dataset_name}" · {formatDate(experiment.created_at)}
          </p>
        </div>
        <button onClick={onClose} className="...">×</button>
      </div>

      {/* Mini-onglets */}
      <div className="flex gap-1 p-1 rounded-lg border mb-5" style={{
        background: 'var(--bg-base)',
        borderColor: 'var(--border-default)',
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-all"
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)',
                border: isActive ? `1px solid ${color_active}` : '1px solid transparent',
              }}>
              <Icon size={14}/>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenu onglet (avec scroll si besoin, padding bottom pour ne pas être caché par sticky) */}
      <div className="pb-20"> {/* pb-20 pour éviter overlap avec sticky */}
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}>
            {activeTab === 'regression'    && <RegressionTab experiment={experiment}/>}
            {activeTab === 'classification' && <ClassificationTab experiment={experiment}/>}
            {activeTab === 'training'      && <TrainingTab experiment={experiment}/>}
            {activeTab === 'predictions'   && <PredictionsTab experiment={experiment}/>}
            {activeTab === 'config'        && <ConfigTab experiment={experiment}/>}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky action bar en bas de la carte */}
      <div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t flex items-center justify-end gap-2"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)',
          backdropFilter: 'blur(8px)',
        }}>
        <button className="..." onClick={() => handleRetrain(experiment.id)}>
          <RefreshCw size={14}/> Re-entraîner
        </button>
        <button className="..." onClick={() => handleDownloadZip(experiment.id)}>
          <Download size={14}/> Télécharger ZIP
        </button>
        <button className="..." onClick={() => handleDelete(experiment.id)}>
          <Trash2 size={14}/> Supprimer
        </button>
      </div>
    </div>
  );
}
```

---

## 📑 Contenu détaillé de chaque mini-onglet

### 📈 Onglet 1 : Régression

```
┌─── ÉTAT DU CONTENU ────────────────────────────────────────────┐
│                                                                 │
│ 🔒 CONSERVÉ : 4 cards métriques (style actuel)                  │
│ ┌──────────┬──────────┬──────────┬──────────┐                  │
│ │ R² Score │ MAE norm │ MAE (j)  │ Durée    │                  │
│ │  0.8658  │  0.0512  │  1.82 j  │  1721s   │                  │
│ └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                 │
│ 🆕 AJOUT : 4ème card MAPE (à côté ou à la place de "Durée")    │
│ ┌──────────┬──────────┬──────────┬──────────┐                  │
│ │ R² Score │ MAE (j)  │ RMSE (j) │ MAPE     │                  │
│ │  0.8658  │  1.82 j  │  2.41 j  │  8.5 %   │                  │
│ └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                 │
│ 🆕 NOUVEAU : Scatter avec zones Vert/Orange/Rouge               │
│ [Composant ScatterWithZones — voir section dédiée]              │
│                                                                 │
│ 🆕 NOUVEAU : Timeline réel vs prédit                            │
│ [Recharts LineChart sur 150 premiers samples]                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 🎯 Onglet 2 : Classification (NOUVEAU)

```
┌─────────────────────────────────────────────────────────────────┐
│ ⚙️ Slider en haut :                                              │
│ "Seuil d'alerte (jours)" : [────●──────────] 10 jours          │
│  ↓ recalcule en temps réel les métriques ↓                      │
│                                                                  │
│ 4 cards :                                                        │
│ ┌──────────┬──────────┬──────────┬──────────┐                  │
│ │ Accuracy │ Precision│ Recall   │ F1-Score │                  │
│ │  0.92    │  0.88    │  0.91    │  0.89    │                  │
│ └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                  │
│ Matrice de confusion (heatmap colorée) :                         │
│ ┌─────────────────────────────────────────┐                     │
│ │              Prédit                      │                     │
│ │           Sain  | Alerte                 │                     │
│ │ Réel Sain  450  |   28                   │                     │
│ │    Alerte   12  |  140                   │                     │
│ └─────────────────────────────────────────┘                     │
│                                                                  │
│ Camembert "Sain vs Alerte" (proportion globale)                  │
└──────────────────────────────────────────────────────────────────┘
```

### 📊 Onglet 3 : Apprentissage

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│ 🔒 CONSERVÉ tel quel : courbes Loss + MAE                       │
│                                                                  │
│ ┌─── Loss (MSE) ───────────────────────────────────────────┐    │
│ │       ━━━ Train Loss     ━ ━ Val Loss                    │    │
│ │ 0.08 ╮                                                    │    │
│ │      │   ╱╲                                               │    │
│ │ 0.04 │  ╱  ╲    ╱╲      ╱╲                                │    │
│ │      │ ╱    ╲  ╱  ╲    ╱  ╲                               │    │
│ │ 0.00 └────────────────────────────                        │    │
│ │      1  2  3  4  5 ... 15                                 │    │
│ └───────────────────────────────────────────────────────────┘    │
│                                                                  │
│ ┌─── MAE ──────────────────────────────────────────────────┐    │
│ │       ━━━ Train MAE      ━ ━ Val MAE                     │    │
│ │ 0.20 ╮                                                    │    │
│ │      │  ╱╲                                                │    │
│ │ 0.10 │ ╱  ╲  ╱╲     ╱╲                                    │    │
│ │      │╱    ╲╱  ╲___╱  ╲                                   │    │
│ │ 0.00 └────────────────────────                            │    │
│ │      1  2  3  4  5 ... 15                                 │    │
│ └───────────────────────────────────────────────────────────┘    │
│                                                                  │
│ 🆕 AJOUT : Tableau historique époque par époque (collapsible)   │
│ ▼ Voir les valeurs par époque (15 lignes)                       │
└──────────────────────────────────────────────────────────────────┘
```

### 🔮 Onglet 4 : Prédictions par composant (NOUVEAU)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│ 🔍 Filtre composant : [Tous ▼]  ou  [B3602R0092-R001 ▼]         │
│                                                                  │
│ 📋 Comparaison dates de pannes :                                │
│                                                                  │
│ ┌──────────────────┬────────────┬────────────┬──────┬─────────┐ │
│ │ Composant        │ Panne Réel │ Panne Préd.│ Écart│ Évaluation│
│ ├──────────────────┼────────────┼────────────┼──────┼─────────┤ │
│ │ B3602R0092-R001  │ 15/03/2023 │ 13/03/2023 │ -2 j │ ✅ Exc. │ │
│ │ B3621R0042-R002  │ 22/06/2023 │ 25/06/2023 │ +3 j │ 🟠 OK   │ │
│ │ B3623R0062-R003  │ 08/09/2023 │ 22/09/2023 │ +14 j│ ❌ Revoir│ │
│ │ ...                                                          │ │
│ └──────────────────┴────────────┴────────────┴──────┴─────────┘ │
│                                                                  │
│ Pagination : [<] Page 1/5 [>]                                   │
│                                                                  │
│ Légende :                                                        │
│ ✅ Excellent : |écart| ≤ 2 jours                                │
│ 🟠 OK        : 2 < |écart| ≤ 5 jours                            │
│ ❌ À revoir  : |écart| > 5 jours                                │
└──────────────────────────────────────────────────────────────────┘
```

### ⚙️ Onglet 5 : Config

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│ 🔒 DÉPLACÉ ICI : Hyperparamètres utilisés (existait avant)      │
│                                                                  │
│ HYPERPARAMÈTRES UTILISÉS                                         │
│ [architecture: "LSTM"] [num_layers: 2] [units: [160,64]]        │
│ [dropout: [0.3, 0.2]] [learning_rate: 0.01] [epochs: 50]        │
│ [batch_size: 32] [embedding_dim: 8] [current_max_rul: 30]       │
│ [lookback: 30] [weight_factor: 15]                              │
│                                                                  │
│ 🆕 AJOUT : Dataset utilisé                                       │
│ 📦 Dataset "Cevital 2023"                                       │
│    • 12 547 lignes · 164 composants · 854 pannes                │
│    • Période : 2023-01-01 → 2023-12-31                          │
│    • [Voir détails dataset →]                                   │
│                                                                  │
│ 🔒 DÉPLACÉ ICI : Fichiers sauvegardés (existait avant)          │
│                                                                  │
│ FICHIERS SAUVEGARDÉS                                             │
│ Modèle    : model.keras           (4.2 MB)                       │
│ Scaler X  : scaler_x.pkl          (8 KB)                         │
│ Scaler Y  : scaler_y.pkl          (4 KB)                         │
│ Config    : config.json           (2 KB)                         │
│ Métriques : metrics.json          (1 KB)                         │
│ Préd.     : predictions.csv       (45 KB)                        │
│                                                                  │
│ 🆕 AJOUT : Bouton "Copier la config JSON"                       │
│ [📋 Copier la config JSON]                                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🎨 ScatterWithZones — Spécification visuelle précise

C'est le composant le plus important à créer.

### Apparence cible

```
RUL Prédit (jours)
  30 ┤                                          ╱
     │                              🟢       ╱   ← Zone verte (±2j)
     │                                    ╱
  25 ┤                            🟢   ╱
     │                              ╱
     │                       🟠  ╱      🟢       ← Zone orange (±5j)
  20 ┤                       ╱
     │              🟢    ╱      🟠
     │                 ╱
  15 ┤              ╱       🟢        🔴         ← Au-delà = rouge
     │           ╱     🟢
     │        ╱  🟠
  10 ┤     ╱                🟢
     │  ╱      🟢
     │╱   🟠         🔴
   5 ┤                                            ← Ligne diagonale verte
     │  🟢                                          (perfection y = x)
     │
   0 └──────────────────────────────────────────►
     0     5    10    15    20    25    30
              RUL Réel (jours)

   AXES ADAPTATIFS : domain = [0, current_max_rul]
```

### Composant React (à créer)

**Fichier** : `frontend/src/components/charts/ScatterWithZones.jsx`

```jsx
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
         CartesianGrid, Tooltip, ReferenceLine, ReferenceArea } from 'recharts';

const COLORS = {
  green:  '#2ecc71',
  orange: '#f39c12',
  red:    '#e74c3c',
};

const THRESHOLDS = {
  excellent: 2,   // |erreur| ≤ 2j
  ok:        5,   // |erreur| ≤ 5j
  // Au-delà = rouge
};

export default function ScatterWithZones({ y_true, y_pred, max_rul = 30 }) {
  // Catégoriser chaque point selon son erreur
  const points = y_true.map((t, i) => {
    const p = y_pred[i];
    const err = Math.abs(p - t);
    let category;
    if (err <= THRESHOLDS.excellent) category = 'green';
    else if (err <= THRESHOLDS.ok)   category = 'orange';
    else                              category = 'red';
    return { y_true: t, y_pred: p, error: err, category };
  });

  const greenPts  = points.filter(p => p.category === 'green');
  const orangePts = points.filter(p => p.category === 'orange');
  const redPts    = points.filter(p => p.category === 'red');

  // Bandes de tolérance autour de la diagonale (visualisation des zones)
  // Bande verte : entre y=x-2 et y=x+2
  // Bande orange : entre y=x-5 et y=x+5 (sauf bande verte)
  // On utilise plusieurs ReferenceArea pour dessiner les zones

  return (
    <div className="rounded-xl border p-4" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border-default)',
    }}>
      <p className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
        🎯 Nuage de corrélation — Réel vs Prédit
      </p>

      <ResponsiveContainer width="100%" height={400}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)"/>

          <XAxis type="number" dataKey="y_true" name="Réel"
                 domain={[0, max_rul]}
                 tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                 label={{
                   value: 'RUL Réel (jours)',
                   position: 'insideBottom',
                   offset: -10,
                   fill: 'var(--text-tertiary)',
                 }}/>

          <YAxis type="number" dataKey="y_pred" name="Prédit"
                 domain={[0, max_rul]}
                 tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                 label={{
                   value: 'RUL Prédit (jours)',
                   angle: -90,
                   position: 'insideLeft',
                   offset: -10,
                   fill: 'var(--text-tertiary)',
                 }}/>

          {/* Bande VERTE (±2j) — ligne entre y=x-2 et y=x+2 */}
          {/* Recharts ne permet pas de tracer une bande diagonale en natif
              → on utilise plusieurs ReferenceLine ou un Area en bidouille */}
          <ReferenceLine
            segment={[{x: 0, y: 0}, {x: max_rul, y: max_rul}]}
            stroke={COLORS.green} strokeWidth={2.5} strokeDasharray="6 3"
            label={{ value: 'y = x (perfection)', fill: COLORS.green, position: 'insideTopLeft' }}/>

          {/* Bandes diagonales : 4 lignes parallèles à y=x */}
          <ReferenceLine
            segment={[{x: 0, y: -2}, {x: max_rul, y: max_rul - 2}]}
            stroke={COLORS.green} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5}/>
          <ReferenceLine
            segment={[{x: 0, y: 2}, {x: max_rul, y: max_rul + 2}]}
            stroke={COLORS.green} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5}/>
          <ReferenceLine
            segment={[{x: 0, y: -5}, {x: max_rul, y: max_rul - 5}]}
            stroke={COLORS.orange} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5}/>
          <ReferenceLine
            segment={[{x: 0, y: 5}, {x: max_rul, y: max_rul + 5}]}
            stroke={COLORS.orange} strokeWidth={0.8} strokeDasharray="3 3" opacity={0.5}/>

          {/* Points colorés */}
          <Scatter name="Excellent (≤2j)"  data={greenPts}  fill={COLORS.green}  fillOpacity={0.7}/>
          <Scatter name="OK (≤5j)"         data={orangePts} fill={COLORS.orange} fillOpacity={0.7}/>
          <Scatter name="À revoir (>5j)"   data={redPts}    fill={COLORS.red}    fillOpacity={0.7}/>

          <Tooltip
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              borderRadius: 8,
            }}
            formatter={(value, name) => [`${value.toFixed(1)} j`, name]}
            cursor={{ strokeDasharray: '3 3' }}/>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Légende textuelle sous le graphe */}
      <div className="flex items-center justify-center gap-6 mt-3 text-xs font-mono">
        <div className="flex items-center gap-1">
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: COLORS.green
          }}/>
          <span>Excellent ({greenPts.length} · {(greenPts.length/points.length*100).toFixed(0)}%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: COLORS.orange
          }}/>
          <span>OK ({orangePts.length} · {(orangePts.length/points.length*100).toFixed(0)}%)</span>
        </div>
        <div className="flex items-center gap-1">
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: COLORS.red
          }}/>
          <span>À revoir ({redPts.length} · {(redPts.length/points.length*100).toFixed(0)}%)</span>
        </div>
      </div>
    </div>
  );
}
```

---

## 🚨 Règles strictes — DO et DON'T

### ✅ À FAIRE
- ✅ Conserver TOUT le header existant (logo, titre, sous-titre, boutons refresh)
- ✅ Conserver la InfoBox SQLite (juste mettre à jour le chemin)
- ✅ Conserver le graphe R² comparaison
- ✅ Conserver le tableau (ajouter 2 colonnes F1 et MAPE)
- ✅ Conserver la card qui s'ouvre quand on clique 👁️ (juste ajouter les mini-onglets dedans)
- ✅ Conserver les 4 cards métriques (les enrichir dans onglet Régression)
- ✅ Conserver les courbes Loss + MAE (les mettre dans onglet Apprentissage)
- ✅ Conserver le bloc Hyperparamètres + Fichiers sauvegardés (les mettre dans onglet Config)
- ✅ Utiliser toutes les variables CSS de la Partie 1 pour le theme switcher

### ❌ À NE PAS FAIRE
- ❌ NE PAS refaire le Leaderboard de zéro
- ❌ NE PAS transformer la card en modal full-screen
- ❌ NE PAS supprimer les éléments existants
- ❌ NE PAS changer les couleurs sémantiques du tableau (R² en vert, MAE en bleu)
- ❌ NE PAS toucher au graphe R² comparaison sauf si nécessaire (correction unité MAE)
- ❌ NE PAS supprimer le badge 🥇 du meilleur modèle
- ❌ NE PAS hardcoder des couleurs (toujours utiliser variables CSS)

---

## 📦 Routes API nécessaires (rappel)

```python
# Détails complets d'une expérience (pour les onglets)
GET /api/experiments/{exp_id}/details
→ {
    "id":            int,
    "name":          str,
    "architecture":  "LSTM" | "GRU",
    "mode":          "manual" | "auto",
    "dataset":       { id, name, n_rows, n_failures, ... },
    "status":        "completed",
    "created_at":    iso_datetime,
    "duration_sec":  float,

    "hyperparams":   { lookback, current_max_rul, embedding_dim, ... },

    "metrics": {
      "regression":    { r2, mae, rmse, mape },
      "classification": { accuracy, precision, recall, f1, threshold: 10 },
    },

    "training_history": [
      { epoch: 1, loss: 0.04, val_loss: 0.05, mae: 0.15, val_mae: 0.16 },
      ...
    ],

    "predictions": {
      "y_true":  [...],            // valeurs réelles (jours)
      "y_pred":  [...],            // prédictions (jours)
      "dates":   [...],            // dates
      "comp":    [...],            // composants
      "current_max_rul": 30,
    },

    "files": {
      "model":      "model.keras",       size_kb: 4200,
      "scaler_x":   "scaler_x.pkl",      size_kb: 8,
      "scaler_y":   "scaler_y.pkl",      size_kb: 4,
      "config":     "config.json",       size_kb: 2,
      "metrics":    "metrics.json",      size_kb: 1,
      "predictions": "predictions.csv",  size_kb: 45,
    },
  }

# Recalcul métriques classification avec nouveau seuil
GET /api/experiments/{exp_id}/recompute_classification?threshold=10
→ { accuracy, precision, recall, f1, confusion_matrix }

# Tableau dates de pannes par composant
GET /api/experiments/{exp_id}/failure_dates?component=B3602R0092-R001
→ [
    { composant, panne_reelle, panne_predite, ecart_jours, evaluation },
    ...
  ]

# Re-entraîner (pré-remplit le formulaire)
POST /api/experiments/{exp_id}/retrain
→ {
    "hyperparams":  { ... },   // à pré-remplir dans le form
    "dataset_id":   int,
    "architecture": "LSTM",
  }

# Télécharger ZIP
GET /api/experiments/{exp_id}/export
→ Fichier ZIP
```

---

**Document généré par Claude (Anthropic) — Guide design Leaderboard Cevital**
