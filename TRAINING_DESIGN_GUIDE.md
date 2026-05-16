# 🧠 TRAINING DESIGN GUIDE — Cevital

> **Document destiné à Claude Code** pour enrichir le TrainingPanel existant SANS casser le design actuel.
> Ce guide complète la **Phase 3 de ROADMAP_CEVITAL_partie2.md**.
> ⚠️ **À lire AVANT toute modification du fichier `TrainingPanel.jsx`.**

---

## 🎯 Principe directeur

Le TrainingPanel actuel a un **design réussi** avec son layout 2 colonnes + le visualiseur d'architecture en direct.
On ne refait pas, on **enrichit** intelligemment.

**Règle d'or** :
- ✅ On **GARDE** : layout, cards, visualiseur en direct, charts live, bouton "Lancer" coloré
- 🆕 On **AJOUTE** : card Dataset, card Paramètres Modèle, branche Embedding dans visualiseur
- 🗑️ On **SUPPRIME** : Machine ID, bandeau "Mode dual Azure"

---

## 📐 Structure existante à PRÉSERVER (zone protégée)

### 🔒 ZONE 1 : Header global de la page

**État actuel** :
```
┌────────────────────────────────────────────────────────────────────┐
│ ⚙️ Entraînement                                                    │
│    AutoML Bayésien · TimeSeriesSplit · Live                        │
└────────────────────────────────────────────────────────────────────┘
```

**À conserver tel quel** : titre + icône + sous-titre.

---

### 🔒 ZONE 2 : Bandeau central (en haut de la page, à côté de "PdM Platform")

**État actuel** :
```
✨ Mode dual : Azure démo + Générique V2
```

**À adapter** : remplacer par **`🏭 PdM Cevital`** avec icône usine ou bâtiment.

```jsx
<div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono"
  style={{
    background: 'var(--bg-card)',
    borderColor: 'var(--border-default)',
    color: 'var(--brand-primary)',
  }}>
  <Factory size={12} />
  PdM Cevital · Maintenance Prédictive GMAO
</div>
```

---

### 🔒 ZONE 3 : Layout 2 colonnes (ARCHITECTURE CRITIQUE)

```
┌─── Page Entraînement ─────────────────────────────────────────┐
│ ┌──── Sidebar gauche (col-span-2) ─┐ ┌── Right (col-span-3) ─┐│
│ │                                  │ │                       ││
│ │ Cards de configuration           │ │ ArchitectureVisualizer││
│ │ (Mode, Dataset, Architecture,    │ │ + KerasSummary        ││
│ │  Paramètres Modèle, Hyper, ...)  │ │ + Statut entraînement ││
│ │                                  │ │ + Charts live         ││
│ │ [Lancer LSTM]                    │ │                       ││
│ └──────────────────────────────────┘ └───────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

**À conserver** : grid 5 colonnes (sidebar = 2, monitoring = 3).

---

### 🔒 ZONE 4 : Card MODE (Manuel/AutoML)

```
┌─── MODE ───────────────────────────────┐
│ [🔧 Manuel ✓]     [⚡ AutoML]           │
└────────────────────────────────────────┘
```

**À conserver tel quel** :
- 2 boutons larges (50/50)
- Couleurs : Manuel bleu (`#4fc3f7`), AutoML vert (`#81c784`)
- Animation transition fluide

---

### 🔒 ZONE 5 : Card ARCHITECTURE

```
┌─── ARCHITECTURE ───────────────────────┐
│ ┌──────────────┐ ┌──────────────┐      │
│ │   LSTM ✓     │ │     GRU      │      │
│ │  (bleu)      │ │  (vert)      │      │
│ └──────────────┘ └──────────────┘      │
│ ┌──────────────┐ ┌──────────────┐      │
│ │  RNN 🔒       │ │ Transformer 🔒│      │
│ │  (grisé)     │ │  (grisé)     │      │
│ └──────────────┘ └──────────────┘      │
└────────────────────────────────────────┘
```

**À adapter** :
- Garder la grille 2×2 et les couleurs par architecture
- ✅ LSTM (bleu) → enabled
- ✅ GRU (vert) → enabled
- 🔒 RNN (orange) → **grisé/disabled** (pas dans le notebook Cevital)
- 🔒 Transformer (violet) → **grisé/disabled**

```jsx
const ARCHITECTURES = [
  { id: "LSTM", label: "LSTM", color: "var(--accent-blue)",   enabled: true },
  { id: "GRU",  label: "GRU",  color: "var(--accent-green)",  enabled: true },
  { id: "RNN",  label: "RNN",  color: "var(--accent-orange)", enabled: false }, // 🔒
  { id: "Transformer", label: "Transformer", color: "var(--accent-purple)", enabled: false }, // 🔒
];
```

---

### 🔒 ZONE 6 : Card "Nom de l'expérience"

```
┌─── NOM DE L'EXPÉRIENCE ────────────────┐
│ [Exp_LSTM_01_______________________]   │
└────────────────────────────────────────┘
```

**À conserver tel quel** : input texte simple.

⚠️ **NOTE** : Le champ "MACHINE ID" qui suit doit être **SUPPRIMÉ** (voir section "Suppressions").

---

### 🔒 ZONE 7 : Card "Fenêtre temporelle" (lookback)

```
┌─── ⏱ FENÊTRE TEMPORELLE — 24H ─────────┐
│ [12h] [24h ✓] [48h] [72h] [168h]       │
│ [24________________________________]   │
│ 💡 Combien d'heures d'historique...     │
└────────────────────────────────────────┘
```

**À adapter** :
- ⚠️ **Cevital travaille en JOURS** (pas heures). Changer les unités :
  - Boutons : `[7j] [14j] [30j ✓] [60j] [90j]`
  - Note pédagogique : "Combien de jours d'historique..."
- **GARDER** la structure : boutons rapides + champ libre + note

---

### 🔒 ZONE 8 : Card "Hyperparamètres fixes"

```
┌─── HYPERPARAMÈTRES FIXES ──────────────┐
│ Nombre de couches                       │
│ [1] [2 ✓] [3] [4]                       │
│                                          │
│ Couche 1 — Unités    Couche 1 — Dropout │
│ [64____]             [0,2____]          │
│ Couche 2 — Unités    Couche 2 — Dropout │
│ [32____]             [0,1____]          │
│                                          │
│ Learning Rate        Batch Size         │
│ [0.001 ▼]            [32 ▼]             │
│ Époques max          Early stopping     │
│ [50____]             [10____]           │
└────────────────────────────────────────┘
```

**À conserver tel quel** : tous les champs et leur layout en grille 2 colonnes.

---

### 🔒 ZONE 9 : Bouton "Lancer LSTM"

```
┌────────────────────────────────────────┐
│         ▷ Lancer LSTM                  │
└────────────────────────────────────────┘
```

**À conserver** :
- Bouton plein largeur en bas
- Couleur dynamique selon architecture choisie (LSTM=bleu, GRU=vert)
- Texte dynamique : `▷ Lancer {architecture}`
- État disabled pendant l'entraînement avec spinner

---

### 🔒 ZONE 10 : ArchitectureVisualizer EN DIRECT ⭐⭐⭐

**Le composant le plus important à protéger.**

```
┌─── 🎨 Architecture en direct — LSTM ─────────────────┐
│                          Aperçu avant entraînement   │
│                                                       │
│ INPUT      LSTM_1    LSTM_2    DENSE                 │
│ 31 feat.   64 unit.  32 unit.  1 (RUL)               │
│ BATCH                                                 │
│ ┌──┐                                                 │
│ │██│ → ⓞⓞⓞⓞ ──→  ⓞⓞⓞⓞ ──→  ⓞⓞⓞ ──→ ŷ           │
│ │██│   x1                                            │
│ │██│   x2     ↻ récur.    ↻ récur.                   │
│ │██│   x3                                            │
│ └──┘   x4                                            │
│ 32 séqs                                              │
│ en parall.                                           │
│                                                       │
│ ◯ neurone actif  ◯ neurone "dropé"  📦 batch=32 ⏱24h │
└──────────────────────────────────────────────────────┘
💡 Dense final = 1 neurone fixe (non configurable) — ...
```

**À conserver absolument** :
- Style cercles + connexions (style Andrew Ng)
- Animation dropout (neurones grisés aléatoirement)
- Pile batch sur le côté gauche
- Légende en bas
- Note pédagogique sous le visualiseur (mais adapter le texte → "la RUL en JOURS" au lieu de "heures")
- **Mise à jour temps réel** quand on change les hyperparamètres

**🆕 ÉVOLUTION OBLIGATOIRE** : ajouter la **branche Embedding composant** (voir section dédiée plus bas).

---

### 🔒 ZONE 11 : Charts live (pendant entraînement)

**À conserver tel quel** :
- Statut entraînement (En attente / En cours / Terminé)
- Logs Keras en temps réel
- Courbes Loss + MAE (Train vs Val)
- Trials AutoML (si mode automatic)
- Prédictions finales (scatter, timeline, distribution erreurs)

---

## 🆕 Ce qu'on AJOUTE

### 🆕 AJOUT 1 : Card "📦 DATASET" (TOUT EN HAUT de la sidebar)

**Position** : **AVANT** la card MODE.

```
┌─── 📦 DATASET ─────────────────────────┐
│ [Cevital 2023 ▼]                       │
│                                         │
│ 📊 12 547 lignes · 164 composants       │
│ 💥 854 pannes · 🔧 712 maintenances     │
│ 📅 2023-01-01 → 2023-12-31              │
│                                         │
│ ⚙️ Config Prétraitement (lecture seule)│
│  • Lookback : 30 jours                  │
│  • MAX RUL : 30 jours                   │
│  • Poids RUL faibles : ×15              │
│ [✏️ Modifier dans Prétraitement →]     │
└────────────────────────────────────────┘
```

### Code structure (React)

```jsx
function DatasetCard({ datasets, selectedDatasetId, onSelectDataset }) {
  const dataset = datasets.find(d => d.id === selectedDatasetId);

  return (
    <div className="rounded-xl border p-4" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--brand-primary) + 40',  // léger glow pour souligner
    }}>
      <div className="flex items-center gap-2 mb-3">
        <Database size={14} style={{ color: 'var(--brand-primary)' }}/>
        <p className="text-xs font-semibold uppercase tracking-widest"
           style={{ color: 'var(--text-tertiary)' }}>Dataset</p>
      </div>

      {/* Dropdown */}
      <select
        value={selectedDatasetId}
        onChange={(e) => onSelectDataset(parseInt(e.target.value))}
        className="w-full px-3 py-2 rounded-lg text-sm font-mono border outline-none mb-3"
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-default)',
          color: 'var(--text-primary)',
        }}>
        {datasets.length === 0 && <option>Aucun dataset disponible</option>}
        {datasets.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>

      {dataset && (
        <>
          {/* Stats */}
          <div className="space-y-1 text-xs font-mono mb-3" style={{ color: 'var(--text-secondary)' }}>
            <div>📊 {dataset.n_rows.toLocaleString()} lignes · {dataset.n_composants} composants</div>
            <div>💥 {dataset.n_failures} pannes · 🔧 {dataset.n_maintenances} maintenances</div>
            <div>📅 {dataset.period_start} → {dataset.period_end}</div>
          </div>

          {/* Config preprocessing (lecture seule) */}
          <div className="rounded-lg p-2.5 border" style={{
            background: 'var(--bg-base)',
            borderColor: 'var(--border-subtle)',
          }}>
            <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
              ⚙️ Config Prétraitement (lecture seule)
            </p>
            <div className="text-xs font-mono space-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              <div>• Lookback : <b>{dataset.lookback} jours</b></div>
              <div>• MAX RUL : <b>{dataset.current_max_rul} jours</b></div>
              <div>• Poids RUL faibles : <b>×{dataset.weight_factor}</b></div>
            </div>
            <button onClick={onEditPrep}
              className="text-xs mt-2 hover:underline"
              style={{ color: 'var(--brand-primary)' }}>
              ✏️ Modifier dans Prétraitement →
            </button>
          </div>
        </>
      )}

      {!dataset && datasets.length === 0 && (
        <div className="rounded-lg p-3 text-center" style={{
          background: 'var(--bg-base)',
          borderColor: 'var(--accent-warning)',
        }}>
          <p className="text-xs" style={{ color: 'var(--accent-warning)' }}>
            ⚠️ Aucun dataset prêt
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
            Va dans <b>Préparation Données</b> pour préparer un dataset
          </p>
        </div>
      )}
    </div>
  );
}
```

---

### 🆕 AJOUT 2 : Card "⚙️ PARAMÈTRES MODÈLE" (après Architecture)

**Position** : **APRÈS** la card ARCHITECTURE, **AVANT** la card Nom de l'expérience.

```
┌─── ⚙️ PARAMÈTRES MODÈLE ───────────────┐
│ EMBEDDING COMPOSANT                     │
│ [ 4 ] [ 8 ✓ ] [ 16 ] [ 32 ]             │
│                                         │
│ 💡 Taille de la projection de chaque    │
│    composant dans l'espace latent.      │
│    Plus c'est grand, plus le modèle     │
│    peut distinguer les composants.      │
└────────────────────────────────────────┘
```

### Code structure (React)

```jsx
function ModelParamsCard({ embeddingDim, setEmbeddingDim, mode }) {
  const EMBEDDING_OPTIONS = [4, 8, 16, 32];

  return (
    <div className="rounded-xl border p-4" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border-default)',
    }}>
      <div className="flex items-center gap-2 mb-3">
        <Cpu size={14} style={{ color: 'var(--accent-purple)' }}/>
        <p className="text-xs font-semibold uppercase tracking-widest"
           style={{ color: 'var(--text-tertiary)' }}>Paramètres Modèle</p>
      </div>

      <div>
        <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>
          Embedding Composant
          {mode === 'auto' && <span className="ml-2 text-[10px]" style={{ color: 'var(--accent-orange)' }}>
            (AutoML cherche aussi cette valeur)
          </span>}
        </label>

        <div className="flex gap-2">
          {EMBEDDING_OPTIONS.map(val => (
            <button key={val}
              onClick={() => setEmbeddingDim(val)}
              className="flex-1 py-1.5 rounded text-sm font-mono border"
              style={{
                background: embeddingDim === val ? 'var(--accent-purple) + 20' : 'var(--bg-card)',
                borderColor: embeddingDim === val ? 'var(--accent-purple)' : 'var(--border-default)',
                color: embeddingDim === val ? 'var(--accent-purple)' : 'var(--text-tertiary)',
              }}>
              {val}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        💡 Chaque composant est transformé en vecteur de cette taille.
        Plus c'est grand, plus le modèle peut "personnaliser" sa prédiction
        par composant.
      </p>
    </div>
  );
}
```

---

### 🆕 AJOUT 3 : Branche EMBEDDING dans le visualiseur ⭐

**LA modification la plus importante visuellement**.

Le visualiseur actuel a **1 input** (numérique).
Il faut le faire évoluer en **2 inputs en parallèle** :

```
                          Architecture en direct — LSTM

┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│  INPUT NUM                                                       │
│  31 feat.                                                        │
│  ┌────┐         LSTM_1    LSTM_2     DENSE                       │
│  │████│  →  ⓞⓞⓞⓞ ───→  ⓞⓞ ───→  ⓞ                            │
│  │████│      x1 x2 x3      x1 x2     ŷ                          │
│  │████│      ↻ récur.    ↻ récur.                                │
│  │████│                                                          │
│  └────┘                                                          │
│  BATCH=32                                                        │
│                                                                  │
│                                                                  │
│                          ╔═══ CONCAT ═══╗                        │
│                                                                  │
│  INPUT COMP                                                      │
│  1 (idx)                                                         │
│  ┌────┐                                                          │
│  │████│ → [Embedding dim=8] ──→ Flatten ──→ Repeat(lookback) ──┘ │
│  │████│                                                          │
│  └────┘                                                          │
│                                                                  │
│  ◯ neurone actif  ◯ neurone "dropé"  📦 batch=32  ⏱ window=30j  │
└──────────────────────────────────────────────────────────────────┘
```

### Code SVG complet à implémenter

```jsx
function ArchitectureVisualizer({
  architecture, numLayers, units, dropouts, batchSize, lookback,
  embeddingDim,    // 🆕 NOUVEAU
  numClassesComp,  // 🆕 NOUVEAU : nombre de composants distincts
}) {
  const SVG_WIDTH = 1000;
  const SVG_HEIGHT = 380;

  // ── Couleurs (selon architecture) ──
  const colorMap = {
    LSTM:        'var(--accent-blue)',
    GRU:         'var(--accent-green)',
    RNN:         'var(--accent-orange)',
    Transformer: 'var(--accent-purple)',
  };
  const archColor = colorMap[architecture] || 'var(--accent-blue)';
  const embedColor = 'var(--accent-purple)';

  // ── Positions horizontales ──
  const xInputNum   = 80;
  const xInputComp  = 80;
  const xEmbedding  = 200;
  const xConcat     = 300;
  const xLayers     = [400, 550, 700];  // jusqu'à 3 couches
  const xDense      = 850;
  const xOutput     = 950;

  // ── Positions verticales (2 branches) ──
  const yMidNum     = 130;   // branche numérique en haut
  const yMidComp    = 280;   // branche composant en bas
  const yConcat     = 200;   // milieu où ça se rejoint

  return (
    <div className="rounded-xl border p-4" style={{
      background: 'var(--bg-elevated)',
      borderColor: 'var(--border-default)',
    }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold flex items-center gap-2"
            style={{ color: archColor }}>
          <Eye size={14}/>
          🎨 Architecture en direct — {architecture}
        </h3>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          Aperçu avant entraînement
        </span>
      </div>

      <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="w-full">

        {/* ════════════════════════════════════════════════ */}
        {/* BRANCHE 1 : INPUT NUMÉRIQUE (en haut)             */}
        {/* ════════════════════════════════════════════════ */}

        {/* Label INPUT NUM */}
        <text x={xInputNum} y={50} textAnchor="middle"
              fill="var(--text-tertiary)" fontSize="11" fontWeight="bold">
          INPUT NUM
        </text>
        <text x={xInputNum} y={67} textAnchor="middle"
              fill="var(--text-muted)" fontSize="10">
          9 feat.
        </text>

        {/* Pile batch */}
        <BatchStack x={xInputNum} y={yMidNum} batchSize={batchSize}/>

        {/* Label BATCH */}
        <text x={xInputNum} y={235} textAnchor="middle"
              fill="var(--text-muted)" fontSize="9">
          BATCH={batchSize}
        </text>

        {/* ════════════════════════════════════════════════ */}
        {/* BRANCHE 2 : INPUT COMPOSANT (en bas)              */}
        {/* ════════════════════════════════════════════════ */}

        {/* Label INPUT COMP */}
        <text x={xInputComp} y={255} textAnchor="middle"
              fill="var(--text-tertiary)" fontSize="11" fontWeight="bold">
          INPUT COMP
        </text>
        <text x={xInputComp} y={272} textAnchor="middle"
              fill="var(--text-muted)" fontSize="10">
          1 (idx)
        </text>

        {/* Petit cube composant */}
        <rect x={xInputComp - 20} y={yMidComp - 25}
              width="40" height="50"
              fill={embedColor + '30'}
              stroke={embedColor}
              strokeWidth="1.5"
              rx="3"/>

        {/* Embedding box */}
        <g>
          <rect x={xEmbedding - 35} y={yMidComp - 20}
                width="70" height="40"
                fill={embedColor + '20'}
                stroke={embedColor}
                strokeWidth="1.5"
                rx="6"/>
          <text x={xEmbedding} y={yMidComp - 5} textAnchor="middle"
                fill={embedColor} fontSize="10" fontWeight="bold">
            Embedding
          </text>
          <text x={xEmbedding} y={yMidComp + 10} textAnchor="middle"
                fill={embedColor} fontSize="10">
            dim={embeddingDim}
          </text>
        </g>

        {/* Flèche INPUT_COMP → Embedding */}
        <line x1={xInputComp + 20} y1={yMidComp}
              x2={xEmbedding - 35} y2={yMidComp}
              stroke={embedColor} strokeWidth="1.5"
              markerEnd="url(#arrow-embed)"/>

        {/* Flèche Embedding → Concat (avec mention Flatten + Repeat) */}
        <line x1={xEmbedding + 35} y1={yMidComp}
              x2={xConcat - 30}   y2={yConcat + 20}
              stroke={embedColor} strokeWidth="1.5"
              strokeDasharray="3 2"
              markerEnd="url(#arrow-embed)"/>
        <text x={(xEmbedding + xConcat) / 2 + 10} y={yMidComp - 30}
              fill={embedColor} fontSize="9" fontStyle="italic">
          Flatten + RepeatVector({lookback})
        </text>

        {/* Flèche INPUT_NUM → Concat */}
        <line x1={xInputNum + 30} y1={yMidNum}
              x2={xConcat - 30}   y2={yConcat - 20}
              stroke={archColor} strokeWidth="1.5"
              markerEnd="url(#arrow-arch)"/>

        {/* ════════════════════════════════════════════════ */}
        {/* CONCAT (fusion des 2 branches)                    */}
        {/* ════════════════════════════════════════════════ */}
        <g>
          <rect x={xConcat - 30} y={yConcat - 18}
                width="60" height="36"
                fill="var(--bg-card)"
                stroke="var(--accent-orange)"
                strokeWidth="2"
                rx="4"
                strokeDasharray="2 2"/>
          <text x={xConcat} y={yConcat - 3} textAnchor="middle"
                fill="var(--accent-orange)" fontSize="10" fontWeight="bold">
            CONCAT
          </text>
          <text x={xConcat} y={yConcat + 11} textAnchor="middle"
                fill="var(--text-muted)" fontSize="9">
            ({9 + embeddingDim})
          </text>
        </g>

        {/* ════════════════════════════════════════════════ */}
        {/* COUCHES LSTM/GRU                                  */}
        {/* ════════════════════════════════════════════════ */}
        {Array.from({ length: numLayers }).map((_, i) => (
          <LayerVisualization key={i}
            x={xLayers[i]} y={yConcat}
            architecture={architecture}
            archColor={archColor}
            units={units[i]}
            dropout={dropouts[i]}
            isLast={i === numLayers - 1}/>
        ))}

        {/* Flèche Concat → Couche 1 */}
        <line x1={xConcat + 30} y1={yConcat}
              x2={xLayers[0] - 35} y2={yConcat}
              stroke={archColor} strokeWidth="1.5"
              markerEnd="url(#arrow-arch)"/>

        {/* Flèches entre couches */}
        {Array.from({ length: numLayers - 1 }).map((_, i) => (
          <line key={i}
                x1={xLayers[i] + 35} y1={yConcat}
                x2={xLayers[i+1] - 35} y2={yConcat}
                stroke={archColor} strokeWidth="1.5"
                markerEnd="url(#arrow-arch)"/>
        ))}

        {/* ════════════════════════════════════════════════ */}
        {/* DENSE FINAL                                       */}
        {/* ════════════════════════════════════════════════ */}
        <g>
          <circle cx={xDense} cy={yConcat} r="18"
                  fill="var(--accent-pink) + 30"
                  stroke="var(--accent-pink)"
                  strokeWidth="2"/>
          <text x={xDense} y={yConcat + 4} textAnchor="middle"
                fill="var(--accent-pink)" fontSize="11" fontWeight="bold">
            DENSE
          </text>
          <text x={xDense} y={yConcat + 35} textAnchor="middle"
                fill="var(--text-muted)" fontSize="9">
            1 (RUL)
          </text>
        </g>

        {/* Flèche dernière couche → Dense */}
        <line x1={xLayers[numLayers - 1] + 35} y1={yConcat}
              x2={xDense - 18} y2={yConcat}
              stroke={archColor} strokeWidth="1.5"
              markerEnd="url(#arrow-arch)"/>

        {/* OUTPUT ŷ */}
        <text x={xOutput} y={yConcat + 4} textAnchor="middle"
              fill="var(--accent-pink)" fontSize="20" fontWeight="bold">
          ŷ
        </text>
        <line x1={xDense + 18} y1={yConcat}
              x2={xOutput - 10} y2={yConcat}
              stroke="var(--accent-pink)" strokeWidth="1.5"
              markerEnd="url(#arrow-pink)"/>

        {/* Définitions des markers (flèches) */}
        <defs>
          <marker id="arrow-arch" markerWidth="10" markerHeight="10"
                  refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 z" fill={archColor}/>
          </marker>
          <marker id="arrow-embed" markerWidth="10" markerHeight="10"
                  refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 z" fill={embedColor}/>
          </marker>
          <marker id="arrow-pink" markerWidth="10" markerHeight="10"
                  refX="8" refY="3" orient="auto">
            <path d="M0,0 L8,3 L0,6 z" fill="var(--accent-pink)"/>
          </marker>
        </defs>
      </svg>

      {/* Légende en bas */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs"
           style={{ color: 'var(--text-tertiary)' }}>
        <span>◯ neurone actif</span>
        <span>◯ neurone "dropé"</span>
        <span>📦 batch={batchSize}</span>
        <span>⏱ window={lookback}j</span>
      </div>

      {/* Note pédagogique */}
      <p className="text-xs mt-3 px-3 py-2 rounded leading-relaxed"
         style={{
           background: 'var(--bg-base)',
           color: 'var(--text-tertiary)',
           borderLeft: '3px solid var(--accent-pink)',
         }}>
        💡 <b style={{color: 'var(--accent-pink)'}}>Dense final = 1 neurone fixe</b>
        (non configurable) — c'est imposé par le problème : on prédit
        <b> une seule valeur</b> (la RUL en jours).
        <br/>
        Si on prédisait plusieurs choses à la fois (ex: RUL + probabilité de panne),
        il y aurait plusieurs neurones.
      </p>
    </div>
  );
}
```

### Composant LayerVisualization (helper)

```jsx
function LayerVisualization({ x, y, architecture, archColor, units, dropout, isLast }) {
  const MAX_DISPLAY_NEURONS = 6;
  const displayCount = Math.min(units, MAX_DISPLAY_NEURONS);
  const neuronRadius = 8;
  const spacingY = 22;

  // Aléatoirement masquer un % de neurones selon dropout
  const droppedSet = new Set();
  for (let i = 0; i < displayCount; i++) {
    if (Math.random() < dropout) droppedSet.add(i);
  }

  return (
    <g>
      {/* Label couche */}
      <text x={x} y={y - 80} textAnchor="middle"
            fill={archColor} fontSize="11" fontWeight="bold">
        {architecture}
      </text>
      <text x={x} y={y - 65} textAnchor="middle"
            fill="var(--text-muted)" fontSize="9">
        {units} unit. · dr={dropout}
      </text>

      {/* Neurones */}
      {Array.from({ length: displayCount }).map((_, i) => {
        const cy = y - ((displayCount - 1) * spacingY) / 2 + i * spacingY;
        const isDropped = droppedSet.has(i);
        return (
          <circle key={i}
            cx={x} cy={cy} r={neuronRadius}
            fill={isDropped ? 'var(--bg-card)' : archColor + '40'}
            stroke={isDropped ? 'var(--text-muted)' : archColor}
            strokeWidth="1.5"
            opacity={isDropped ? 0.4 : 1}
            strokeDasharray={isDropped ? "2 2" : "none"}/>
        );
      })}

      {/* "..." si > MAX */}
      {units > MAX_DISPLAY_NEURONS && (
        <text x={x} y={y + ((displayCount - 1) * spacingY) / 2 + 22}
              textAnchor="middle"
              fill="var(--text-muted)" fontSize="9">
          ... ({units - MAX_DISPLAY_NEURONS} de +)
        </text>
      )}

      {/* Récurrence (sauf pour la dernière couche return_sequences=False) */}
      {!isLast && (
        <text x={x + 30} y={y + 5}
              fill={archColor} fontSize="9" fontStyle="italic">
          ↻ récur.
        </text>
      )}
    </g>
  );
}
```

### Composant BatchStack (helper)

```jsx
function BatchStack({ x, y, batchSize }) {
  // Affiche une "pile" de batchSize rectangles empilés en 3D
  const DISPLAY = Math.min(batchSize, 6);
  const offset = 4;

  return (
    <g>
      {Array.from({ length: DISPLAY }).map((_, i) => (
        <rect key={i}
          x={x - 25 + i * offset}
          y={y - 50 + i * offset}
          width="50"
          height="100"
          fill="var(--accent-blue) + 20"
          stroke="var(--accent-blue)"
          strokeWidth="1"
          opacity={1 - i * 0.1}
          rx="3"/>
      ))}
    </g>
  );
}
```

---

## 🗑️ Suppressions obligatoires

### 🗑️ SUPPRESSION 1 : Champ "Machine ID"

**État actuel** (entre Nom expérience et Fenêtre temporelle) :
```
MACHINE ID
[99________________________________]
```

**Action** : Supprimer complètement ce champ. Sur Cevital, le dataset contient déjà **tous les composants** (le split se fait par composant 80/20 dans le pipeline). Il n'y a pas de "machine_id" unique à choisir.

Supprimer aussi tout state React lié (`machineId`, `setMachineId`) et toute référence dans les requêtes API.

### 🗑️ SUPPRESSION 2 : Bandeau "Mode dual : Azure démo + Générique V2"

Voir **ZONE 2** plus haut. Remplacer par `🏭 PdM Cevital · Maintenance Prédictive GMAO`.

---

## 🎨 Récap visuel : Sidebar finale

L'ordre final des cards dans la sidebar gauche (de haut en bas) :

```
1. 📦 DATASET                  🆕 (au-dessus de tout)
2. MODE (Manuel/AutoML)        🔒 inchangé
3. ARCHITECTURE                🔒 inchangé (RNN/Transformer grisés)
4. ⚙️ PARAMÈTRES MODÈLE        🆕 (embedding_dim)
5. NOM DE L'EXPÉRIENCE         🔒 inchangé
6. ⏱ FENÊTRE TEMPORELLE        🔒 inchangé (unité = jours)
7. HYPERPARAMÈTRES FIXES       🔒 inchangé
8. [▷ Lancer LSTM]             🔒 inchangé
```

🗑️ Disparu : champ "Machine ID" entre Nom et Fenêtre.

---

## 🚨 Règles strictes — DO et DON'T

### ✅ À FAIRE
- ✅ Conserver TOUT le header existant
- ✅ Conserver le layout 2 colonnes (sidebar 2/5, monitoring 3/5)
- ✅ Conserver le visualiseur d'architecture en direct
- ✅ Conserver la note pédagogique sous le visualiseur
- ✅ Conserver toutes les cards existantes (Mode, Architecture, Nom, Fenêtre, Hyperparams)
- ✅ Conserver le bouton "Lancer X" coloré
- ✅ Conserver les charts live (Loss, MAE, AutoML trials)
- ✅ Utiliser toutes les variables CSS pour le theme switcher
- ✅ Ajouter la branche Embedding dans le visualiseur
- ✅ Mettre les jours partout au lieu des heures
- ✅ AutoML cherche aussi `embedding_dim` (en plus de nb_layers, units, dropout, lr)

### ❌ À NE PAS FAIRE
- ❌ NE PAS refaire le TrainingPanel de zéro
- ❌ NE PAS changer le layout 2 colonnes
- ❌ NE PAS supprimer le visualiseur d'architecture en direct
- ❌ NE PAS rendre RNN/Transformer enabled (juste grisés)
- ❌ NE PAS hardcoder des couleurs (toujours utiliser variables CSS)
- ❌ NE PAS oublier de supprimer le champ "Machine ID"
- ❌ NE PAS oublier de passer `sample_weight=w_train` au `model.fit()`
- ❌ NE PAS oublier que c'est `[X_num, X_comp]` comme entrée du modèle (2 inputs)

---

## 📦 Routes API utilisées

```python
# Liste des datasets prêts
GET /api/datasets?status=preprocessed
→ [{ id, name, n_rows, n_composants, n_failures, n_maintenances,
     period_start, period_end, lookback, current_max_rul, weight_factor }, ...]

# Entraînement manuel (à adapter)
POST /api/train/manual
Body : {
  "dataset_id":      3,
  "name":            "Exp_LSTM_01",
  "architecture":    "LSTM",          # ou "GRU"
  "embedding_dim":   8,               # 🆕
  "num_layers":      2,
  "units":           [64, 32],
  "dropout_rates":   [0.2, 0.1],
  "learning_rate":   0.001,
  "batch_size":      32,
  "epochs":          50,
  "patience":        10,
  # PLUS de "machine_id"
}

# Entraînement AutoML (à adapter)
POST /api/train/auto
Body : {
  "dataset_id":      3,
  "name":            "Exp_LSTM_auto",
  "architecture":    "LSTM",
  "max_trials":      10,
  "embedding_dim_search": [4, 8, 16, 32],  # 🆕 AutoML cherche aussi ça
  # autres paramètres comme avant
}
```

---

**Document généré par Claude (Anthropic) — Guide design TrainingPanel Cevital**
