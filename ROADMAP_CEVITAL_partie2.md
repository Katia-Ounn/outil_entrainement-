# 🗺️ ROADMAP CEVITAL — Partie 2 (Phases 1 à 7)

> **Document destiné à Claude Code** pour finaliser la plateforme PdM CEVITAL.
> Cette roadmap suit la Partie 1 (qui a déjà fait le setup architecture + theme switcher).
> Projet PFE Master 2 Génie Logiciel.
>
> 📌 **DOCUMENT COMPLÉMENTAIRE OBLIGATOIRE** : `LEADERBOARD_DESIGN_GUIDE.md`
> À lire AVANT de toucher au fichier `Leaderboard.jsx` (Phase 4).
> Ce guide protège le design existant qui doit être préservé.

---

## 📋 Contexte et état actuel

### Ce qui existe (après Partie 1)
- Backup `pdm_platform_azure/` (intact)
- Projet de travail `pdm_platform_cevital/`
- Architecture en plugins : `backend/pipelines/` avec `BasePipeline`, `azure_pipeline.py`, `cevital_pipeline.py` (squelette)
- Theme switcher dark/light fonctionnel
- Logo CEVITAL en haut à gauche
- Variables CSS pour les 2 thèmes

### Ce qui change avec cette Partie 2
- **Suppression complète d'Azure** dans l'outil (l'outil devient mono-pipeline Cevital)
- Le squelette `cevital_pipeline.py` est **remplacé par un pipeline réel** basé sur le notebook
- Refonte complète de la page "Préparation Données" (5 sous-onglets stepper)
- Refonte de l'entraînement (suppression Démo, ajout embedding composant)
- Refonte du leaderboard (page détails par modèle avec onglets)
- Nouveau système d'export ZIP des modèles
- Nouvelle variable `current_max_rul` pilotée par l'UI
- Scatter plot avec zones Vert/Orange/Rouge
- Tableau dates panne par composant

### Architecture cible finale

```
pdm_platform_cevital/
├── backend/
│   ├── main.py                       # ⚠️ Refonte des routes
│   ├── models.py                     # ⚠️ Nouveaux modèles (Dataset, Experiment étendu)
│   ├── tuner.py                      # ⚠️ Adapter pour LSTM/GRU avec embedding composant
│   ├── start.py
│   ├── pipelines/
│   │   ├── __init__.py
│   │   ├── base.py                   # Inchangé (Partie 1)
│   │   ├── registry.py               # ⚠️ Retirer Azure
│   │   └── cevital_pipeline.py       # ⭐ Remplacé par la version réelle (fournie)
│   ├── exports/                      # 🆕 Dossier où sont stockés les ZIP modèles
│   ├── datasets/                     # 🆕 Stockage CSV uploadés et Dataset_V1 générés
│   │   └── {dataset_id}/
│   │       ├── failure.csv
│   │       ├── equipment.csv
│   │       └── dataset_v1.csv
│   └── models/                       # 🆕 Modèles entraînés
│       └── {exp_id}/
│           ├── model.keras
│           ├── scaler_x.pkl
│           ├── scaler_y.pkl
│           ├── config.json
│           ├── metrics.json
│           ├── predictions.csv
│           └── README.md
├── frontend/
│   ├── src/
│   │   ├── App.jsx                   # ⚠️ Suppression onglet Démo
│   │   ├── components/
│   │   │   ├── PreparationPanel.jsx          # 🆕 Container avec 5 sous-onglets
│   │   │   ├── prep/
│   │   │   │   ├── RawEDA.jsx                # 🆕 Sous-onglet 1
│   │   │   │   ├── FeatureEngineering.jsx    # 🆕 Sous-onglet 2
│   │   │   │   ├── FeaturesEDA.jsx           # 🆕 Sous-onglet 3
│   │   │   │   ├── Preprocessing.jsx         # 🆕 Sous-onglet 4
│   │   │   │   └── MergeDatasets.jsx         # 🆕 Sous-onglet 5
│   │   │   ├── TrainingPanel.jsx     # ⚠️ Adapter pour Cevital (LSTM/GRU + embedding)
│   │   │   ├── Leaderboard.jsx       # ⚠️ Refonte complète
│   │   │   ├── ModelDetails.jsx      # 🆕 Page/modal détails par modèle
│   │   │   ├── ArchitectureVisualizer.jsx  # ⚠️ Adapter pour embedding composant
│   │   │   └── ... (autres existants)
```

---

# 🚀 PHASE 1 — Backend : Pipeline Cevital + suppression Azure

## Tâche 1.1 — Remplacer le squelette `cevital_pipeline.py`

**Fichier source** : `/mnt/user-data/outputs/cevital_pipeline.py` (fourni à côté de cette roadmap)

**Action** : Copier le contenu complet de ce fichier vers `pdm_platform_cevital/backend/pipelines/cevital_pipeline.py`.

Ce pipeline contient **toute la logique du notebook** :
- Phase 1 : `compute_eda_raw()`
- Phase 2 : `compute_features()` (8 étapes : filtrage, hiérarchie, sélection, lookup, panel, RUL, features, export)
- Phase 3 : `compute_eda_features()`
- Phase 4 : `prepare_sequences(lookback, current_max_rul, ...)` — paramètres pilotables UI
- Bonus : `merge_new_data()` pour fusion temporelle
- Bonus : `predict_with_safety()` pour clip dynamique en sortie

⚠️ **Garder strictement la classe `CevitalPipeline`** telle quelle. Ne pas modifier la logique métier.

## Tâche 1.2 — Supprimer Azure du registre

**Fichier** : `backend/pipelines/registry.py`

```python
# AVANT
PIPELINE_REGISTRY = {
    AzurePipeline.PIPELINE_ID:   AzurePipeline,
    CevitalPipeline.PIPELINE_ID: CevitalPipeline,
}

# APRÈS
from .cevital_pipeline import CevitalPipeline

PIPELINE_REGISTRY = {
    CevitalPipeline.PIPELINE_ID: CevitalPipeline,
}
```

**Action** : Supprimer aussi le fichier `backend/pipelines/azure_pipeline.py` (plus utilisé).

## Tâche 1.3 — Étendre les modèles BDD

**Fichier** : `backend/models.py`

Ajouter le modèle `Dataset` et étendre `Experiment` :

```python
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from datetime import datetime

class Dataset(Base):
    __tablename__ = "datasets"
    id           = Column(Integer, primary_key=True)
    name         = Column(String, unique=True, nullable=False)
    folder_path  = Column(String, nullable=False)       # backend/datasets/{id}/
    failure_path = Column(String)                       # CSV failure uploadé
    equipment_path = Column(String)                     # CSV equipment uploadé
    v1_path      = Column(String, nullable=True)        # Dataset_V1 généré (après features)
    n_rows       = Column(Integer, default=0)
    n_failures   = Column(Integer, default=0)
    n_maintenances = Column(Integer, default=0)
    n_composants = Column(Integer, default=0)
    period_start = Column(String)                       # ISO date
    period_end   = Column(String)
    status       = Column(String, default="uploaded")   # uploaded|features_done|preprocessed
    created_at   = Column(DateTime, default=datetime.utcnow)
    metadata_json = Column(JSON, nullable=True)

    experiments = relationship("Experiment", back_populates="dataset")


# Étendre Experiment existant
class Experiment(Base):
    __tablename__ = "experiments"
    id           = Column(Integer, primary_key=True)
    name         = Column(String, nullable=False)
    architecture = Column(String, nullable=False)       # LSTM | GRU
    status       = Column(String, default="pending")    # pending|running|completed|error
    created_at   = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # ─ NOUVEAU : lien vers dataset
    dataset_id   = Column(Integer, ForeignKey("datasets.id"), nullable=True)
    dataset      = relationship("Dataset", back_populates="experiments")

    # ─ NOUVEAU : tous les hyperparams stockés (pour re-train pré-rempli)
    hyperparams  = Column(JSON, nullable=True)
    # Exemple de contenu hyperparams :
    # {
    #   "lookback": 30,
    #   "current_max_rul": 30,
    #   "embedding_dim": 8,
    #   "num_layers": 2,
    #   "units": [128, 64],
    #   "dropout_rates": [0.2, 0.15],
    #   "learning_rate": 0.001,
    #   "batch_size": 32,
    #   "epochs": 60,
    #   "patience": 7,
    #   "weight_factor": 15.0,
    #   "mode": "manual" | "auto"
    # }

    # ─ Métriques
    r2           = Column(Float, nullable=True)
    mae          = Column(Float, nullable=True)
    rmse         = Column(Float, nullable=True)
    mape         = Column(Float, nullable=True)
    accuracy     = Column(Float, nullable=True)
    precision    = Column(Float, nullable=True)
    recall       = Column(Float, nullable=True)
    f1_score     = Column(Float, nullable=True)

    # ─ Chemins fichiers
    model_dir    = Column(String, nullable=True)         # backend/models/{exp_id}/
    duration_sec = Column(Float, nullable=True)
    notes        = Column(Text, nullable=True)
```

**Migration** : Supprimer la BDD existante (`pdm_experiments.db`) et la recréer via `Base.metadata.create_all()` au démarrage.

## Tâche 1.4 — Nouvelles routes API dans `main.py`

Remplacer toutes les anciennes routes Azure par les nouvelles routes Cevital.

### 1.4.1. Gestion des datasets

```python
@app.post("/api/datasets/upload")
async def upload_dataset(
    name: str = Form(...),
    failure_file: UploadFile = File(...),
    equipment_file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Uploade un nouveau dataset (CSV failure + equipment) et crée l'entrée BDD."""
    # 1. Créer dossier backend/datasets/{new_id}/
    # 2. Sauvegarder les 2 CSV
    # 3. Créer ligne Dataset(status="uploaded")
    # 4. Retourner dataset_id

@app.get("/api/datasets")
def list_datasets(db: Session = Depends(get_db)):
    """Liste tous les datasets disponibles."""

@app.get("/api/datasets/{dataset_id}")
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Détails d'un dataset."""

@app.delete("/api/datasets/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """Supprime un dataset (fichiers + BDD)."""
```

### 1.4.2. Routes EDA et Features (par dataset)

```python
@app.post("/api/datasets/{dataset_id}/eda_raw")
def run_eda_raw(dataset_id: int):
    """Phase 1 : EDA brute. Retourne tous les stats."""
    # 1. Charger pipeline avec failure_path + equipment_path
    # 2. pipe.load_raw_data(...)
    # 3. pipe.compute_eda_raw()
    # 4. Cacher le résultat (Redis-style en mémoire ou sur disque)
    # 5. Retourner le dict JSON
    return result

@app.post("/api/datasets/{dataset_id}/features")
def run_features(dataset_id: int):
    """Phase 2 : Feature Engineering. Génère le Dataset_V1."""
    # 1. pipe.compute_features()
    # 2. pipe.export_dataset_v1(f"backend/datasets/{dataset_id}/dataset_v1.csv")
    # 3. Update BDD : status="features_done", v1_path, stats
    return result

@app.get("/api/datasets/{dataset_id}/download_v1")
def download_v1(dataset_id: int):
    """Télécharge le Dataset_V1 généré."""
    return FileResponse(...)

@app.post("/api/datasets/{dataset_id}/eda_features")
def run_eda_features(dataset_id: int):
    """Phase 3 : EDA sur le Dataset_V1."""
    return result

@app.post("/api/datasets/{dataset_id}/preprocessing")
def run_preprocessing(
    dataset_id: int,
    lookback: int = Body(30),
    current_max_rul: int = Body(30),
    weight_factor: float = Body(15.0),
    test_ratio: float = Body(0.20),
):
    """Phase 4 : Prétraitement LSTM. Génère les tenseurs."""
    # Met à jour Dataset.status = "preprocessed"
    return result
```

### 1.4.3. Route fusion datasets

```python
@app.post("/api/datasets/{dataset_id}/analyze_merge")
async def analyze_merge(
    dataset_id: int,
    new_failure_file: UploadFile = File(...)
):
    """
    Analyse le nouveau CSV sans fusionner (preview).
    Retourne les stats pour que l'admin décide de fusionner ou non.
    """

@app.post("/api/datasets/{dataset_id}/merge")
async def merge_dataset(
    dataset_id: int,
    new_failure_file: UploadFile = File(...)
):
    """Effectue la fusion temporelle + recalcule features."""
    # 1. pipe.merge_new_data(new_csv_path)
    # 2. pipe.compute_features()
    # 3. Sauvegarder le nouveau Dataset_V1
```

### 1.4.4. Routes entraînement

```python
@app.post("/api/train/manual")
async def train_manual(req: TrainManualRequest, db: Session = Depends(get_db)):
    """
    Entraînement avec hyperparams fixes.
    Architecture : LSTM ou GRU (PAS RNN, PAS Transformer pour l'instant).
    """
    # Pareil que l'existant, mais :
    # - Accepter dataset_id
    # - Accepter embedding_dim et current_max_rul
    # - Sauvegarder dans la BDD avec hyperparams complets
    # - Sauvegarder dans backend/models/{exp_id}/

@app.post("/api/train/auto")
async def train_auto(req: TrainAutoRequest, db: Session = Depends(get_db)):
    """AutoML Bayésien (lookback/batch/epochs FIXES, embedding_dim cherché)."""

@app.post("/api/experiments/{exp_id}/retrain")
def retrain_experiment(exp_id: int, db: Session = Depends(get_db)):
    """
    Re-entraînement avec les MÊMES hyperparams.
    Retourne les hyperparams pour pré-remplir le formulaire frontend.
    """
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    return {
        "hyperparams":   exp.hyperparams,
        "dataset_id":    exp.dataset_id,
        "architecture":  exp.architecture,
    }
```

### 1.4.5. Routes leaderboard / détails / export

```python
@app.get("/api/experiments/{exp_id}/details")
def get_experiment_details(exp_id: int, db: Session = Depends(get_db)):
    """
    Détails complets pour la page ModelDetails :
    - Hyperparams
    - Métriques
    - Loss history (epochs)
    - y_true, y_pred (scatter)
    - predictions.csv chargé (table dates panne)
    """

@app.get("/api/experiments/{exp_id}/recompute_classification")
def recompute_classification(
    exp_id: int,
    threshold: float = Query(10.0)  # seuil en jours
):
    """
    Recalcule les métriques de classification avec un nouveau seuil.
    L'admin peut tester différentes politiques d'alerte.
    """

@app.get("/api/experiments/{exp_id}/export")
def export_experiment(exp_id: int, db: Session = Depends(get_db)):
    """
    Génère un ZIP contenant :
    - model.keras
    - scaler_x.pkl, scaler_y.pkl
    - config.json (hyperparams + dataset utilisé)
    - metrics.json (toutes les métriques)
    - predictions.csv (date, comp, y_true, y_pred, erreur)
    - README.md (instructions d'utilisation)
    """
```

## Tâche 1.5 — Adapter le `tuner.py` pour les modèles avec embedding composant

L'architecture du notebook utilise **2 entrées** (`X_num` + `X_comp`) avec un Embedding pour le composant. Il faut adapter le tuner pour ça.

Reproduire **exactement** la fonction `build_model` du notebook (cellule 56) :

```python
from tensorflow.keras.layers import (LSTM, GRU, Dense, Dropout, Input,
                                     Embedding, Flatten, Concatenate, RepeatVector)
from tensorflow.keras.models import Model
from tensorflow.keras import regularizers

def build_model_cevital(hp, architecture, lookback, n_features, num_classes_comp,
                       embedding_dim=8, units_search=(64, 128, 32)):
    """
    Construit un modèle LSTM ou GRU avec embedding composant.
    Args:
        hp : keras_tuner HyperParameters
        architecture : 'LSTM' ou 'GRU'
        embedding_dim : peut être recherché par AutoML (4, 8, 16, 32)
    """
    LayerCls = LSTM if architecture == "LSTM" else GRU

    input_num  = Input(shape=(lookback, n_features), name="input_num")
    input_comp = Input(shape=(1,), name="input_comp")

    # Embedding composant — embedding_dim PEUT être un hp si AutoML
    emb = Embedding(num_classes_comp, embedding_dim)(input_comp)
    emb = Flatten()(emb)
    emb_seq = RepeatVector(lookback)(emb)

    x = Concatenate()([input_num, emb_seq])

    reg_val = 0.0001
    nb_layers = hp.Int("nb_layers", 1, 2)

    for i in range(nb_layers):
        x = LayerCls(
            units=hp.Int(f"u_{i}", units_search[0], units_search[1], step=units_search[2]),
            return_sequences=(i < nb_layers - 1),
            kernel_regularizer=regularizers.l2(reg_val)
        )(x)
        x = Dropout(hp.Float(f"d_{i}", 0.1, 0.25))(x)

    output = Dense(1, activation="relu")(x)

    model = Model(inputs=[input_num, input_comp], outputs=output)
    model.compile(
        optimizer=tf.keras.optimizers.Adam(hp.Choice("lr", [1e-3, 2e-3])),
        loss="mse",
        metrics=["mae"]
    )
    return model
```

⚠️ **Important** : Le `model.fit` doit passer `sample_weight=w_train` (récupéré depuis le pipeline).

## Tests Phase 1

- [ ] `POST /api/datasets/upload` avec 2 CSV → crée bien le dataset
- [ ] `POST /api/datasets/{id}/eda_raw` retourne les stats EDA
- [ ] `POST /api/datasets/{id}/features` génère le Dataset_V1
- [ ] `GET /api/datasets/{id}/download_v1` télécharge le CSV
- [ ] `POST /api/datasets/{id}/preprocessing` avec lookback=30, current_max_rul=30 → tenseurs prêts
- [ ] `POST /api/train/manual` lance l'entraînement et sauve dans backend/models/{exp_id}/
- [ ] `GET /api/experiments/{id}/export` retourne un ZIP valide

---

# 🎨 PHASE 2 — Frontend : Page Préparation Données (5 sous-onglets)

## Tâche 2.1 — Architecture du PreparationPanel

**Fichier** : `frontend/src/components/PreparationPanel.jsx`

Container qui gère :
- La sélection du dataset actif (dropdown en haut)
- Les 5 sous-onglets en mode stepper
- Le suivi de progression (quelle phase est complétée)
- Le bouton "Importer un nouveau dataset" (ouvre modal upload)

```jsx
const SUBTABS = [
  { id: "raw_eda",       label: "EDA Brute",           icon: BarChart3,    step: 1 },
  { id: "features",      label: "Feature Engineering", icon: Cog,          step: 2 },
  { id: "features_eda",  label: "EDA Features",        icon: TrendingUp,   step: 3 },
  { id: "preprocessing", label: "Prétraitement",       icon: Layers,       step: 4 },
  { id: "merge",         label: "Fusion / Réentraîn.", icon: GitMerge,     step: 5 },
];
```

### Navigation entre sous-onglets

- Le sous-onglet `n+1` est **désactivé** tant que `n` n'est pas complété
- Quand on complète `n`, on **débloque** `n+1` et on switch automatiquement
- Une barre de progression en haut indique où on en est (1/5, 2/5, etc.)

## Tâche 2.2 — Sous-onglet 1 : RawEDA.jsx (EDA Brute)

**Fichier** : `frontend/src/components/prep/RawEDA.jsx`

À l'entrée :
- Bouton **"📤 Importer dataset"** au centre (s'il n'y en a pas) → modal upload 2 CSV (failure + equipment) + nom
- Si dataset déjà uploadé : bouton **"🔍 Lancer EDA"** au centre

Après EDA :
- **Section 1** : Cards d'overview (Total OT, OT 2023, OT niveaux 3+4, composants, machines mères)
- **Section 2** : Heatmap qualité données (barres % manquantes)
- **Section 3** : Distribution niveaux hiérarchiques (pie + bar)
- **Section 4** : Pannes par mois (barres + ligne moyenne)
- **Section 5** : Pannes cumulées dans le temps (area chart)
- **Section 6** : Top composants (horizontal bar chart)
- **Section 7** : Distribution type maintenance + statistiques coûts

Utilise Recharts pour tous les graphes. Couleurs cohérentes (vert/orange/rouge pour qualité, etc.).

Bouton en bas : **"✓ Validé → Aller à Feature Engineering"** → switch sur sous-onglet 2.

## Tâche 2.3 — Sous-onglet 2 : FeatureEngineering.jsx

**Fichier** : `frontend/src/components/prep/FeatureEngineering.jsx`

Bouton au centre : **"⚙️ Lancer Feature Engineering"** → appelle l'API qui exécute les 8 étapes.

Pendant le calcul : spinner + texte explicatif des 8 étapes en cours.

À la fin, **affichage des résultats** :

### Stats globales (cards)
```
🧱 Lignes : 59 860  |  💥 Pannes : 854  |  🔧 Maintenances : 712
🔩 Composants : 164  |  ⚙️ Machines : 38
📅 Période : 2023-01-01 → 2023-12-31
```

### Tableau 1 : Aperçu du panel composant × jour
Affiche les 10 premières lignes avec toutes les colonnes (date, machineID, composant, failure, maintenance, etc.)

### Tableau 2 : Aperçu Dataset_V1 final
Affiche les 10 premières lignes du Dataset_V1 (les 23 colonnes finales avec RUL et features).

### Statistiques RUL
- Min / Max / Mean / Median
- Distribution rapide (mini histogramme)

### Bouton d'action principal
**"📥 Télécharger Dataset_V1.csv"** → appelle `GET /api/datasets/{id}/download_v1`

Bouton en bas : **"✓ Continuer vers EDA Features"** → switch sur sous-onglet 3.

## Tâche 2.4 — Sous-onglet 3 : FeaturesEDA.jsx

**Fichier** : `frontend/src/components/prep/FeaturesEDA.jsx`

Bouton **"🔍 Lancer EDA sur les features"** → appelle `POST /api/datasets/{id}/eda_features`.

Affichage :

### Stats descriptives
Tableau avec les colonnes : DSLF, DSLM, MTBF_rolling, has_mtbf, month_sin, month_cos, dslf_mtbf_ratio, RUL
Avec count / mean / std / min / 25% / 50% / 75% / max

### Distribution RUL (3 graphes en 1 ligne)
1. **Histogramme RUL** (hors RUL=0) avec lignes médiane / moyenne / seuil alerte
2. **ECDF** (courbe cumulative) avec annotation "% sous le seuil"
3. **Camembert Sain/Alerte** (seuil 10j)

### Corrélations
- **Heatmap** : matrice de corrélation features + RUL (triangle inférieur)
- **Bar chart horizontal** : corrélation de chaque feature avec RUL (vert si positif, rouge si négatif)

Bouton en bas : **"✓ Aller au Prétraitement"** → switch sur sous-onglet 4.

## Tâche 2.5 — Sous-onglet 4 : Preprocessing.jsx (le plus important)

**Fichier** : `frontend/src/components/prep/Preprocessing.jsx`

⭐ **CŒUR DE L'INTERFACE** — c'est ici qu'on configure les paramètres de prétraitement.

### Layout : 2 colonnes

#### Colonne gauche : Configuration

```
⚙️ PARAMÈTRES DE PRÉTRAITEMENT

📏 LOOKBACK (Fenêtre temporelle)
[7]  [14]  [30 ✓]  [60]  [90]   [Custom: ___]
Combien de jours d'historique le modèle voit-il ?

🎯 CURRENT MAX RUL (NOUVEAU)
[10]  [20]  [30 ✓]  [60]  [90]   [Custom: ___]
Plafond du RUL — au-delà = considéré comme "sain"

⚖️ POIDS RUL FAIBLES
[×5]  [×10]  [×15 ✓]  [×20]
Amplification du gradient sur les composants en alerte

📊 TEST RATIO
[10%]  [15%]  [20% ✓]  [25%]
Proportion du test set (split par composant)

🚀 [Lancer le prétraitement]
```

#### Colonne droite : Résultats (vides au début, remplis après lancement)

```
📦 TENSEURS GÉNÉRÉS

X_train (numérique) : (15234, 30, 9)
X_train (composant) : (15234,)
y_train             : (15234,)
poids w_train       : moyenne=8.4, max=16.0

X_test (numérique)  : (3812, 30, 9)
y_test              : (3812,)

🧮 Composants distincts : 164 (pour Embedding)

📋 Aperçu valeurs normalisées (séquence 0, 5 premières lignes) :
[Tableau 5x9 avec valeurs normalisées entre 0 et 1]

🎚️ Aperçu poids d'entraînement (10 premiers) :
[Mini bar chart horizontal]

✅ Prétraitement terminé — Prêt pour l'entraînement
```

Bouton en bas (apparait après succès) : **"✓ Aller à l'Entraînement →"** → switch vers l'onglet Entraînement.

## Tâche 2.6 — Sous-onglet 5 : MergeDatasets.jsx (fusion / réentraînement)

**Fichier** : `frontend/src/components/prep/MergeDatasets.jsx`

Interface dédiée pour l'admin Cevital qui veut **enrichir** son dataset existant avec de nouvelles données.

### Workflow en 3 étapes

#### Étape 1 : Sélection dataset existant
Dropdown : sélectionner le dataset à enrichir (parmi ceux disponibles).

#### Étape 2 : Upload nouveau CSV failure
Drag-and-drop ou bouton upload. Champ "Nom de l'enrichissement" (juste pour l'historique).

Quand fichier uploadé → appel automatique de `POST /api/datasets/{id}/analyze_merge`.

**Affichage des stats** (pour que l'admin décide) :

```
📊 ANALYSE DU NOUVEAU FICHIER

┌─ Dataset existant ──────┬─ Nouveau fichier ─────────┐
│ Lignes : 12 547         │ Lignes : 3 421            │
│ Période : 2023          │ Période : 2024-01 → 2024-09│
│ Composants : 164        │ Composants : 178          │
└─────────────────────────┴───────────────────────────┘

⚙️ APRÈS FUSION (estimé) :
- Total lignes : 15 968
- Composants : 187 (164 existants + 23 nouveaux)
- Période complète : 2023-01 → 2024-09
- Composants communs : 155
- Nouveaux composants : 23

📋 Liste des 20 premiers nouveaux composants :
B3604R0089-R002, B3608R0014-R001, ...

⚠️ ATTENTION : La fusion va recalculer toutes les features
et réinitialiser le prétraitement. Tu devras réentraîner.

[← Annuler]   [🔀 Confirmer la fusion]
```

#### Étape 3 : Après fusion réussie
Affichage du succès + bouton "Aller au Feature Engineering" pour recommencer le pipeline avec les données enrichies.

## Tests Phase 2

- [ ] Importer un dataset (2 CSV + nom) crée bien le dataset
- [ ] Lancer EDA brute affiche tous les graphes correctement
- [ ] Lancer Feature Engineering affiche les 2 tableaux + permet le téléchargement Dataset_V1
- [ ] EDA features affiche distribution RUL et corrélations
- [ ] Prétraitement avec lookback=30 et current_max_rul=30 affiche les tenseurs
- [ ] Bouton "Aller à l'Entraînement" navigue correctement
- [ ] Le sous-onglet Fusion permet d'uploader un nouveau CSV et de fusionner

---

# 🧠 PHASE 3 — Frontend : Entraînement enrichi (PAS refonte)

⚠️ **LECTURE OBLIGATOIRE AVANT DE COMMENCER** :
**`TRAINING_DESIGN_GUIDE.md`** (livré séparément à côté de cette roadmap)

Ce guide contient les **règles strictes** pour ne PAS casser le design existant.
Le TrainingPanel actuel est **réussi** (layout 2 colonnes + visualiseur en direct), on ne refait pas, on **enrichit**.

## ⚠️ RÈGLE CRITIQUE — Persistance des processus en arrière-plan

Le système actuel a une fonctionnalité **essentielle** à **PRÉSERVER ABSOLUMENT** :

> **Quand l'utilisateur lance un entraînement (ou un prétraitement long), il peut changer d'onglet, modifier des paramètres ailleurs, voire fermer l'onglet et y revenir : le processus continue en arrière-plan et l'UI reprend là où elle en était.**

### Comment c'est fait (à conserver)

1. **Backend** : l'entraînement tourne dans un **thread/task séparé** (FastAPI `BackgroundTasks` ou `asyncio.create_task`)
2. **Backend** : un **WebSocket** envoie les updates (logs, époques, métriques) au frontend
3. **Frontend** : l'état d'entraînement (`isTraining`, `currentEpoch`, `logs`, `metrics`) vit dans le **`AppContext.jsx`** (Context global)
4. **Frontend** : le WebSocket est connecté au niveau de l'App, pas du TrainingPanel
5. **Si l'utilisateur change d'onglet** → l'état persiste, le WebSocket reste connecté
6. **Si l'utilisateur revient** → il voit où l'entraînement en est

### À étendre pour le prétraitement (Phase 2)

Le **prétraitement** doit aussi être en background avec WebSocket :
- Pendant que pipeline.prepare_sequences() tourne, le user peut naviguer
- Un panneau "Statut prétraitement" reste visible (toaster ou badge en haut)
- Quand c'est fini → notification + désactivation du badge

### Ce que Claude Code NE DOIT PAS faire

- ❌ Mettre l'état d'entraînement dans `TrainingPanel.jsx` (state local) → cassé au changement d'onglet
- ❌ Re-créer le WebSocket à chaque montage du composant → connexions multiples
- ❌ Faire des appels API synchrones bloquants pour le prétraitement long
- ❌ Perdre les logs si l'utilisateur revient sur le TrainingPanel

### Tests à effectuer

- [ ] Lancer un entraînement → changer d'onglet → revenir : l'entraînement continue, je vois les logs
- [ ] Lancer un prétraitement → changer d'onglet : un badge "Prétraitement en cours" reste visible
- [ ] Lancer un entraînement → ouvrir une nouvelle expérience dans le Leaderboard : pas de conflit
- [ ] Un seul WebSocket connecté à la fois (vérifier dans DevTools Network)

---

## Principe directeur

> **Garder TOUTE la structure existante du `TrainingPanel.jsx`** (header, layout 2 colonnes, cards Mode/Architecture/Nom/Fenêtre/Hyperparams, visualiseur en direct, charts live).
> **Ajouter** : card Dataset en haut, card Paramètres Modèle (embedding_dim), branche Embedding dans visualiseur.
> **Supprimer** : champ Machine ID (Azure-spécifique), bandeau "Mode dual Azure".

## Tâche 3.1 — Suppression onglet Démo

**Fichier** : `frontend/src/App.jsx`

Supprimer l'onglet "Démo" et le composant `DemoPanel.jsx` (pas pertinent pour Cevital).

Les onglets finaux : **Préparation Données · Entraînement · Leaderboard**

## Tâche 3.2 — Ajouter card "📦 DATASET" en haut de la sidebar

Voir spécification complète dans **TRAINING_DESIGN_GUIDE.md** section "AJOUT 1".

Position : **TOUT EN HAUT** de la sidebar gauche, avant la card MODE.

Contenu :
- Dropdown de sélection (datasets avec status="preprocessed")
- Stats : nb lignes, nb composants, nb pannes, nb maintenances, période
- Récap config Prétraitement (lookback, current_max_rul, weight_factor) en lecture seule
- Bouton "✏️ Modifier dans Prétraitement →"
- Si aucun dataset : message d'erreur orange "Va dans Préparation Données"

## Tâche 3.3 — Ajouter card "⚙️ PARAMÈTRES MODÈLE" après Architecture

Voir spécification complète dans **TRAINING_DESIGN_GUIDE.md** section "AJOUT 2".

Position : **APRÈS** la card ARCHITECTURE, **AVANT** la card Nom de l'expérience.

Contenu :
- Champ **Embedding Composant** : boutons rapides [4] [8 ✓] [16] [32]
- Si mode AutoML : badge "AutoML cherche aussi cette valeur"
- Note pédagogique sous le champ

## Tâche 3.4 — Modifier les architectures dans la grille

Voir spécification dans **TRAINING_DESIGN_GUIDE.md** section "ZONE 5".

- ✅ LSTM → enabled (bleu)
- ✅ GRU → enabled (vert)
- 🔒 RNN → **grisé/disabled** (orange)
- 🔒 Transformer → **grisé/disabled** (violet)

## Tâche 3.5 — Adapter la card Fenêtre temporelle (heures → jours)

Cevital travaille en **JOURS** (pas heures comme Azure).

Changer :
- Boutons rapides : `[7j] [14j] [30j ✓] [60j] [90j]` au lieu de `[12h] [24h ✓] ...`
- Label : "FENÊTRE TEMPORELLE — 30J"
- Note : "Combien de jours d'historique le modèle voit-il..."

## Tâche 3.6 — SUPPRIMER le champ "Machine ID"

Le concept Machine ID est **Azure-spécifique** (Machine 99). Sur Cevital, le dataset contient déjà tous les composants (split par composant 80/20 dans le pipeline).

**Actions** :
- Supprimer la card/champ "MACHINE ID" entre Nom de l'expérience et Fenêtre temporelle
- Supprimer tout state React lié (`machineId`, `setMachineId`)
- Supprimer toute référence dans les requêtes API

## Tâche 3.7 — Remplacer le bandeau "Mode dual Azure" par "PdM Cevital"

Voir spécification dans **TRAINING_DESIGN_GUIDE.md** section "ZONE 2".

Remplacer le bandeau central par :
```jsx
<div className="..." style={{...}}>
  <Factory size={12} />
  PdM Cevital · Maintenance Prédictive GMAO
</div>
```

## Tâche 3.8 — Adapter le ArchitectureVisualizer (branche Embedding)

⭐ **LA modification la plus importante visuellement.**

Voir spécification complète dans **TRAINING_DESIGN_GUIDE.md** section "AJOUT 3" — code SVG complet fourni.

Le visualiseur actuel a **1 input numérique**.
Le faire évoluer en **2 inputs en parallèle** :
- **Branche haute** : Input numérique (9 features) → couches LSTM/GRU
- **Branche basse** : Input composant (1 idx) → Embedding(dim=N) → Flatten → RepeatVector(lookback)
- **Fusion CONCAT** au milieu → couches LSTM/GRU
- **Dense final** : 1 neurone (RUL)

⚠️ Mise à jour temps réel quand l'utilisateur change `embedding_dim` ou `num_layers`.

⚠️ Garder le style existant (cercles, dropout grisé, légende, pile batch).

## Tâche 3.9 — Adapter le backend training

Dans `main.py`, les routes `/api/train/manual` et `/api/train/auto` doivent :
1. Charger le pipeline depuis le `dataset_id`
2. Charger les tenseurs déjà préparés (`X_train_num`, `X_train_comp`, `y_train`, `w_train`)
3. Construire le modèle avec `build_model_cevital` (voir Phase 1 Tâche 1.5)
4. Lancer `model.fit([X_train_num, X_train_comp], y_train, sample_weight=w_train, ...)`
5. Évaluer avec `pipe.predict_with_safety(...)`
6. Sauvegarder dans `backend/models/{exp_id}/`

⚠️ **N'oublie pas** :
- Le `sample_weight=w_train` est crucial (poids ×15 sur RUL faibles)
- L'entrée du modèle est `[X_num, X_comp]` (liste de 2 tensors, pas 1)
- Sauvegarder le modèle au format `.keras` (et non `.h5`)

## Tests Phase 3

- [ ] Onglet Démo supprimé
- [ ] Bandeau "Mode dual Azure" remplacé par "PdM Cevital"
- [ ] Champ "Machine ID" supprimé
- [ ] Card "📦 DATASET" présente en haut de la sidebar avec dropdown + stats
- [ ] Card "⚙️ PARAMÈTRES MODÈLE" avec embedding_dim
- [ ] Fenêtre temporelle en jours (pas heures)
- [ ] RNN et Transformer grisés (pas cliquables)
- [ ] Visualiseur d'architecture affiche la branche Embedding
- [ ] Visualiseur se met à jour temps réel quand on change embedding_dim
- [ ] L'entraînement passe bien `sample_weight=w_train`
- [ ] Le modèle est sauvegardé dans `backend/models/{exp_id}/`
- [ ] Layout 2 colonnes préservé
- [ ] Tous les charts live fonctionnent (Loss, MAE, AutoML trials)
- [ ] Bouton "Lancer LSTM/GRU" prend la couleur de l'architecture choisie

---

# 🏆 PHASE 4 — Frontend : Leaderboard enrichi (PAS refonte)

⚠️ **LECTURE OBLIGATOIRE AVANT DE COMMENCER** :
**`LEADERBOARD_DESIGN_GUIDE.md`** (livré séparément à côté de cette roadmap)

Ce guide contient les **règles strictes** pour ne PAS casser le design existant.
Le Leaderboard actuel est **réussi**, on ne refait pas, on **enrichit**.

## Principe directeur

> **Garder TOUTE la structure existante du `Leaderboard.jsx`** (header, InfoBox SQLite, graphe R² comparaison, tableau, carte qui s'ouvre).
> **Ajouter** : 2 colonnes au tableau (F1, MAPE), mini-onglets dans la carte détails, barre sticky d'actions en bas.

## Tâche 4.1 — Enrichir le tableau (2 colonnes en plus)

**Fichier** : `frontend/src/components/Leaderboard.jsx`

Colonnes finales : `# · NOM · ARCH · MODE · R² · MAE (j) · F1 · MAPE · DURÉE · DATE · STATUT · ACTIONS`

- Changer `MAE (H)` → `MAE (j)` (jours pour Cevital)
- Ajouter colonne `F1` :
  - Vert si > 0.8
  - Orange si > 0.6
  - Rouge sinon
- Ajouter colonne `MAPE` :
  - Vert si < 10%
  - Orange si < 20%
  - Rouge sinon

## Tâche 4.2 — Mini-onglets dans la carte détails

Voir spécification complète dans **LEADERBOARD_DESIGN_GUIDE.md** section "Mini-onglets".

5 onglets internes :
1. **📈 Régression** : 4 cards (R², MAE, RMSE, MAPE) + ScatterWithZones + Timeline réel/prédit
2. **🎯 Classification** : Slider seuil + 4 cards (Accuracy, Precision, Recall, F1) + Matrice confusion + Camembert
3. **📊 Apprentissage** : Courbes Loss + MAE (conservées) + tableau historique époques collapsible
4. **🔮 Prédictions** : Filtre composant + Tableau dates panne réelle vs prédite
5. **⚙️ Config** : Hyperparams + Dataset + Fichiers sauvegardés + bouton Copier JSON

## Tâche 4.3 — Barre sticky d'actions en bas de la carte

3 boutons toujours visibles (même en scrollant les onglets) :
- 🔄 **Re-entraîner** → `POST /api/experiments/{id}/retrain` puis navigation vers Entraînement avec form pré-rempli
- 📥 **Télécharger ZIP** → `GET /api/experiments/{id}/export`
- 🗑️ **Supprimer** → `DELETE /api/experiments/{id}` avec confirmation

Style sticky :
```jsx
<div className="sticky bottom-0 -mx-6 -mb-6 px-6 py-3 border-t flex justify-end gap-2"
     style={{
       background: 'var(--bg-elevated)',
       borderColor: 'var(--border-default)',
       backdropFilter: 'blur(8px)',
     }}>
  {/* 3 boutons */}
</div>
```

## Tâche 4.4 — Créer ScatterWithZones

**Fichier** : `frontend/src/components/charts/ScatterWithZones.jsx`

Code complet fourni dans **LEADERBOARD_DESIGN_GUIDE.md** section "ScatterWithZones".

Points clés :
- Axes adaptatifs au `current_max_rul` du modèle
- 3 zones : Vert (±2j), Orange (±5j), Rouge (>5j)
- Ligne diagonale verte (perfection y = x)
- Légende avec pourcentages de chaque zone

## Tâche 4.5 — Bouton "Re-entraîner" qui pré-remplit le formulaire

Workflow :
1. Click sur "🔄 Re-entraîner" dans la carte détails
2. Appel `POST /api/experiments/{exp_id}/retrain` qui retourne :
   ```json
   {
     "hyperparams": { ... tous les params ... },
     "dataset_id":  3,
     "architecture": "LSTM"
   }
   ```
3. Navigation vers l'onglet Entraînement avec un state global ou URL params
4. Le formulaire d'entraînement détecte les données et pré-remplit tous les champs
5. Toast : "✓ Hyperparamètres chargés depuis Exp_LSTM_01 — vérifie et lance"

Utiliser un **Context** ou URL params (`?retrain_from=42`).

## Tâche 4.6 — Adapter le bouton Télécharger ZIP

Voir spécification complète dans **Phase 5 de cette roadmap** (Export ZIP).

## Tests Phase 4

- [ ] Tableau affiche bien les 12 colonnes (avec F1 et MAPE)
- [ ] Click sur 👁️ ouvre la carte détails avec les mini-onglets
- [ ] Les 5 onglets s'affichent correctement
- [ ] Barre sticky reste visible quand on scrolle dans un onglet
- [ ] ScatterWithZones affiche les bandes Vert/Orange/Rouge avec axes adaptatifs
- [ ] Slider seuil classification recalcule les métriques en temps réel
- [ ] Filtre composant dans onglet Prédictions fonctionne
- [ ] Bouton Re-entraîner pré-remplit le formulaire Entraînement
- [ ] Bouton Télécharger ZIP fournit un fichier valide
- [ ] Tout le design ORIGINAL est préservé (header, InfoBox, graphe R², badge 🥇, etc.)

---

# 📦 PHASE 5 — Backend : Export ZIP complet

⚠️ **Important** : Le ZIP doit contenir **TOUS** les fichiers nécessaires pour que l'admin Cevital puisse réutiliser le modèle dans son application **sans dépendance à notre outil**.

## Contenu du ZIP final

```
modele_exp_42.zip
├── model.keras              # Modèle Keras (réseau LSTM/GRU + Embedding)
├── scaler_x.pkl             # MinMaxScaler des 9 features numériques
├── scaler_y.pkl             # MinMaxScaler du RUL
├── features_list.json       # 🆕 Ordre exact des colonnes features
├── comp_mapping.json        # 🆕 Mapping nom_composant → idx_embedding
├── config.json              # Tous les hyperparamètres + métadonnées
├── metrics.json             # Toutes les métriques finales
├── predictions.csv          # date, comp, y_true, y_pred, error (test set)
└── README.md                # Guide de réutilisation Python
```

## Tâche 5.1 — Génération du ZIP

**Fichier** : `backend/main.py` (route `/api/experiments/{id}/export`)

```python
import zipfile
import json
from pathlib import Path

@app.get("/api/experiments/{exp_id}/export")
def export_experiment(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp or exp.status != "completed":
        raise HTTPException(404, "Modèle introuvable ou non complété")

    model_dir = Path(exp.model_dir)
    zip_path = Path(f"backend/exports/exp_{exp_id}.zip")
    zip_path.parent.mkdir(exist_ok=True)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # ── Fichiers binaires (modèle + scalers) ──────────────
        zf.write(model_dir / "model.keras",   "model.keras")
        zf.write(model_dir / "scaler_x.pkl",  "scaler_x.pkl")
        zf.write(model_dir / "scaler_y.pkl",  "scaler_y.pkl")

        # ── 🆕 Liste des features (ordre exact) ───────────────
        zf.writestr("features_list.json", json.dumps({
            "feature_cols":     exp.hyperparams.get("feature_cols", []),
            "n_features":       len(exp.hyperparams.get("feature_cols", [])),
            "target_col":       "RUL",
            "lookback":         exp.hyperparams.get("lookback"),
            "current_max_rul":  exp.hyperparams.get("current_max_rul"),
            "comment": "Ordre exact des colonnes à fournir au modèle dans X_num."
        }, indent=2))

        # ── 🆕 Mapping composants → idx embedding ─────────────
        zf.write(model_dir / "comp_mapping.json", "comp_mapping.json")

        # ── Config complète ───────────────────────────────────
        zf.writestr("config.json", json.dumps({
            "experiment_id":   exp.id,
            "name":            exp.name,
            "architecture":    exp.architecture,
            "hyperparams":     exp.hyperparams,
            "dataset_id":      exp.dataset_id,
            "created_at":      exp.created_at.isoformat(),
        }, indent=2))

        # ── Métriques ─────────────────────────────────────────
        zf.writestr("metrics.json", json.dumps({
            "regression": {
                "r2":   exp.r2,
                "mae":  exp.mae,
                "rmse": exp.rmse,
                "mape": exp.mape,
            },
            "classification": {
                "threshold_days": exp.hyperparams.get("classification_threshold", 10),
                "accuracy":  exp.accuracy,
                "precision": exp.precision,
                "recall":    exp.recall,
                "f1":        exp.f1_score,
            }
        }, indent=2))

        # ── Prédictions du test set ───────────────────────────
        zf.write(model_dir / "predictions.csv", "predictions.csv")

        # ── README de réutilisation ───────────────────────────
        zf.writestr("README.md", _generate_readme(exp))

    return FileResponse(zip_path, filename=f"{exp.name}.zip", media_type="application/zip")
```

## Tâche 5.2 — Sauvegarder `comp_mapping.json` après l'entraînement

À la fin de chaque entraînement, sauvegarder le mapping composant → idx :

```python
# Après le model.fit(...) et avant model.save()
comp_mapping = {
    str(comp_name): int(comp_idx)
    for comp_name, comp_idx in pipeline._comp_name_to_idx.items()
}
with open(model_dir / "comp_mapping.json", "w") as f:
    json.dump({
        "mapping":           comp_mapping,
        "num_classes_comp":  pipeline.num_classes_comp,
        "comment":           "Mapping nom_composant -> indice (input du layer Embedding)."
    }, f, indent=2)
```

⚠️ **Note** : le `cevital_pipeline.py` doit stocker ce mapping dans un attribut `_comp_name_to_idx` lors du `prepare_sequences()`. Mettre à jour le pipeline en conséquence :

```python
# Dans prepare_sequences() après df["comp_idx"] = ...
self._comp_name_to_idx = dict(zip(
    df[self.COMP_COL].astype(str).tolist(),
    df["comp_idx"].astype(int).tolist()
))
# Garder une copie unique (un comp peut apparaître plusieurs fois)
self._comp_name_to_idx = {
    comp: int(idx) for comp, idx in self._comp_name_to_idx.items()
}
```

## Tâche 5.3 — Générer le README complet

```python
def _generate_readme(exp):
    feature_cols = exp.hyperparams.get("feature_cols", [])
    max_rul = exp.hyperparams.get("current_max_rul", 30)
    lookback = exp.hyperparams.get("lookback", 30)

    return f"""# Modèle PdM Cevital — Export

## 📋 Métadonnées
- **Nom** : {exp.name}
- **Architecture** : {exp.architecture}
- **Date d'entraînement** : {exp.created_at}
- **Dataset source** : ID {exp.dataset_id}

## 📊 Métriques
### Régression
- R² : {exp.r2:.4f}
- MAE : {exp.mae:.2f} jours
- RMSE : {exp.rmse:.2f} jours
- MAPE : {exp.mape:.2f}%

### Classification dérivée (seuil = 10 jours)
- Accuracy : {exp.accuracy:.4f}
- F1 : {exp.f1_score:.4f}
- Recall : {exp.recall:.4f}
- Precision : {exp.precision:.4f}

## 📁 Contenu du ZIP
| Fichier | Description |
|---------|-------------|
| model.keras | Modèle Keras (2 inputs : X_num + X_comp) |
| scaler_x.pkl | MinMaxScaler des features numériques |
| scaler_y.pkl | MinMaxScaler du RUL |
| features_list.json | Ordre exact des colonnes features |
| comp_mapping.json | Mapping nom_composant → idx embedding |
| config.json | Hyperparamètres + métadonnées |
| metrics.json | Métriques de régression + classification |
| predictions.csv | Prédictions sur le test set |

## 🐍 Utilisation dans une application Python

```python
import json
import joblib
import numpy as np
import pandas as pd
from tensorflow.keras.models import load_model

# ── 1. Charger les artefacts ──────────────────────────────
model    = load_model("model.keras")
scaler_x = joblib.load("scaler_x.pkl")
scaler_y = joblib.load("scaler_y.pkl")

with open("features_list.json") as f:
    features_info = json.load(f)
with open("comp_mapping.json") as f:
    comp_info = json.load(f)

feature_cols = features_info["feature_cols"]
lookback     = features_info["lookback"]         # = {lookback}
max_rul      = features_info["current_max_rul"]  # = {max_rul}
comp_mapping = comp_info["mapping"]

# ── 2. Préparer tes données ───────────────────────────────
# df_recent doit contenir AU MOINS `lookback` lignes consécutives
# pour le composant qu'on veut analyser, avec toutes les colonnes :
# {", ".join(feature_cols) if feature_cols else "(voir features_list.json)"}

df_recent = pd.DataFrame(...)  # tes données
component_name = "B3602R0092-R001"
comp_idx = comp_mapping[component_name]

# ── 3. Construire les inputs ──────────────────────────────
X_features = df_recent[feature_cols].values[-lookback:]   # (lookback, n_feat)
X_scaled = scaler_x.transform(X_features)                  # normalisation
X_num = np.array([X_scaled])                               # (1, lookback, n_feat)
X_comp = np.array([comp_idx])                              # (1,)

# ── 4. Prédire ────────────────────────────────────────────
raw_pred = model.predict([X_num, X_comp])
pred_normalized = raw_pred[0][0]
pred_days = scaler_y.inverse_transform([[pred_normalized]])[0][0]

# Clip de sécurité (comme pendant l'entraînement)
pred_days = np.clip(pred_days, 0, max_rul)

print(f"RUL prédit pour {{component_name}} : {{pred_days:.1f}} jours")

# ── 5. Interprétation ─────────────────────────────────────
if pred_days < 5:
    print("⚠️ ALERTE CRITIQUE — intervention urgente")
elif pred_days < 10:
    print("🟠 SURVEILLANCE — à planifier")
else:
    print("✅ SAIN")
```

## ⚙️ Hyperparamètres utilisés

{json.dumps(exp.hyperparams, indent=2)}

---
Généré par PdM Platform Cevital · PFE Master 2 Génie Logiciel
"""
```

## Tâche 5.4 — Sauvegarde complète du modèle après entraînement

À la fin de chaque entraînement (route `/api/train/manual` et `/api/train/auto`), sauvegarder dans `backend/models/{exp_id}/` :

```python
model_dir = Path(f"backend/models/{exp_id}")
model_dir.mkdir(parents=True, exist_ok=True)

# 1. Modèle Keras
model.save(model_dir / "model.keras")

# 2. Scalers
joblib.dump(pipeline.scaler_x, model_dir / "scaler_x.pkl")
joblib.dump(pipeline.scaler_y, model_dir / "scaler_y.pkl")

# 3. 🆕 Mapping composants (voir Tâche 5.2)
comp_mapping = {
    str(name): int(idx)
    for name, idx in pipeline._comp_name_to_idx.items()
}
with open(model_dir / "comp_mapping.json", "w") as f:
    json.dump({
        "mapping":          comp_mapping,
        "num_classes_comp": pipeline.num_classes_comp,
    }, f, indent=2)

# 4. Prédictions complètes (test set)
y_pred_days = pipeline.predict_with_safety(model,
                                            pipeline.X_test_num,
                                            pipeline.X_test_comp)
y_true_days = pipeline.scaler_y.inverse_transform(
    pipeline.y_test.reshape(-1, 1)
).flatten()

df_test = pipeline.get_test_dataframe()
df_preds = pd.DataFrame({
    "date":   df_test["date"].iloc[pipeline.lookback:].values[:len(y_pred_days)],
    "comp":   df_test[pipeline.COMP_COL].iloc[pipeline.lookback:].values[:len(y_pred_days)],
    "y_true": y_true_days,
    "y_pred": y_pred_days,
    "error":  np.abs(y_true_days - y_pred_days),
})
df_preds.to_csv(model_dir / "predictions.csv", index=False)

# 5. Update BDD
exp.model_dir = str(model_dir)
exp.hyperparams = {
    **exp.hyperparams,
    "feature_cols": pipeline.FEATURE_COLS,  # 🆕 pour le ZIP
}
db.commit()
```

## Tests Phase 5

- [ ] Après entraînement, `backend/models/{exp_id}/` contient : `model.keras`, `scaler_x.pkl`, `scaler_y.pkl`, `comp_mapping.json`, `predictions.csv`
- [ ] `GET /api/experiments/{id}/export` télécharge un ZIP valide
- [ ] Le ZIP contient les 8 fichiers attendus dont `features_list.json` et `comp_mapping.json`
- [ ] Le code Python du README fonctionne pour faire une prédiction
- [ ] `features_list.json` contient bien les 9 features dans l'ordre exact
- [ ] `comp_mapping.json` contient bien la mapping nom → idx

---

# 🎨 PHASE 6 — Polish UI & Light Mode CEVITAL

⚠️ **Cette phase suppose que Partie 1 (theme switcher) est déjà faite.**

## Tâche 6.1 — Vérifier que tous les nouveaux composants utilisent les variables CSS

Tous les nouveaux composants créés en Phase 2-4 doivent utiliser `var(--bg-elevated)`, `var(--text-primary)`, etc., et JAMAIS des couleurs hardcodées.

## Tâche 6.2 — Ajuster la palette light pour les graphes

En light mode, certaines couleurs trop claires ne sont pas lisibles sur fond blanc. Ajuster les couleurs sémantiques :

```css
:root[data-theme="light"] {
  --chart-blue:    #1d4ed8;   /* plus foncé qu'en dark */
  --chart-green:   #15803d;
  --chart-orange:  #c2410c;
  --chart-red:     #b91c1c;
  --chart-purple:  #7e22ce;
}
```

Et utiliser ces variables dans tous les charts (Recharts color props).

## Tâche 6.3 — Animations de transition entre sous-onglets

Utiliser Framer Motion pour animer le changement de sous-onglet dans PreparationPanel :

```jsx
<AnimatePresence mode="wait">
  <motion.div key={activeSubtab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}>
    {renderSubtab()}
  </motion.div>
</AnimatePresence>
```

## Tâche 6.4 — Messages et feedback utilisateur

Toast notifications pour les actions importantes :
- "✅ Dataset uploadé avec succès"
- "✅ Feature Engineering terminé"
- "✅ Prétraitement réussi — tu peux passer à l'entraînement"
- "🎉 Entraînement terminé — voir le leaderboard"
- "❌ Erreur : ..."

Utiliser `react-hot-toast` (installer via npm si pas déjà fait).

---

# 🧪 PHASE 7 — Tests end-to-end & finalisation

## Tâche 7.1 — Workflow complet de test

Effectuer **manuellement** le workflow end-to-end :

1. ✅ Démarrer backend : `uvicorn main:app --reload`
2. ✅ Démarrer frontend : `npm run dev`
3. ✅ Toggle mode clair → vérifier que tout est lisible
4. ✅ Upload de `failure1.csv` + `equipment_clean.csv` avec nom "Test_Cevital_2023"
5. ✅ Lancer EDA brute → vérifier que les graphes apparaissent
6. ✅ Lancer Feature Engineering → vérifier les tableaux + télécharger Dataset_V1.csv
7. ✅ Lancer EDA Features → vérifier corrélations
8. ✅ Prétraitement avec lookback=30, current_max_rul=30 → vérifier shapes
9. ✅ Aller à Entraînement → choisir LSTM, manuel, units=128, dropout=0.2, lr=0.001
10. ✅ Lancer entraînement → suivre live → terminer
11. ✅ Aller au Leaderboard → cliquer sur l'expérience → ModelDetails ouvre
12. ✅ Vérifier les 5 onglets de détails
13. ✅ Tester le scatter avec zones (axes adaptatifs)
14. ✅ Tester slider seuil classification → métriques recalculées
15. ✅ Tester filtre composant dans tableau prédictions
16. ✅ Cliquer "Re-entraîner" → formulaire pré-rempli
17. ✅ Cliquer "Télécharger ZIP" → vérifier contenu
18. ✅ Tester la fusion : upload d'un 2e CSV → analyse → confirmer fusion
19. ✅ Refaire Feature Engineering avec le dataset fusionné

## Tâche 7.2 — Documentation finale

Créer `pdm_platform_cevital/README.md` :

```markdown
# PdM Platform Cevital — PFE Master 2

## Description
Plateforme d'expérimentation pour la maintenance prédictive Cevital.
Régression du RUL (Remaining Useful Life) en jours via LSTM/GRU avec embedding composant.

## Stack
- Backend : FastAPI · SQLAlchemy/SQLite · TensorFlow/Keras · Keras Tuner
- Frontend : React · Vite · Tailwind CSS · Framer Motion · Recharts

## Installation
[...]

## Workflow utilisateur
1. **Préparation Données** (5 sous-onglets) : Upload → EDA brute → Features → EDA features → Prétraitement
2. **Entraînement** : LSTM ou GRU avec embedding composant
3. **Leaderboard** : visualisation détaillée + export ZIP

## Architecture pipeline
[Diagramme]
```

## Tâche 7.3 — Cleanup

- [ ] Supprimer tous les fichiers Azure (`pipeline.py` ancien, `azure_pipeline.py`, démos RNN/LSTM)
- [ ] Vérifier qu'il n'y a plus de référence à "Azure" ou "Machine 99" dans le code
- [ ] Nettoyer les imports inutilisés
- [ ] Vérifier les erreurs console (frontend)

---

# ✅ Checklist finale globale

## Backend
- [ ] `pipelines/cevital_pipeline.py` est la version réelle (notebook converti)
- [ ] Modèles BDD : `Dataset` + `Experiment` étendu
- [ ] Routes datasets (upload, EDA, features, preprocessing, merge)
- [ ] Routes training (manual, auto, retrain)
- [ ] Routes experiments (details, recompute_classification, export)
- [ ] `tuner.py` utilise `build_model_cevital` avec embedding composant
- [ ] Sauvegarde modèles dans `backend/models/{exp_id}/`
- [ ] Export ZIP fonctionnel

## Frontend
- [ ] `PreparationPanel` avec 5 sous-onglets stepper
- [ ] `RawEDA` avec tous les graphes
- [ ] `FeatureEngineering` avec tableaux + download
- [ ] `FeaturesEDA` avec corrélations
- [ ] `Preprocessing` avec lookback + **current_max_rul** + poids
- [ ] `MergeDatasets` avec upload + analyse + fusion
- [ ] `TrainingPanel` : LSTM/GRU + **embedding_dim** + ArchitectureVisualizer adapté
- [ ] `Leaderboard` avec liste + click → `ModelDetails`
- [ ] `ModelDetails` avec 5 onglets : Régression, Classification, Apprentissage, Prédictions, Config
- [ ] **ScatterWithZones** : zones Vert/Orange/Rouge avec axes adaptatifs à `max_rul`
- [ ] **Tableau dates panne** par composant avec filtre
- [ ] **Bouton Re-entraîner** pré-remplit le formulaire
- [ ] **Bouton Télécharger ZIP** télécharge le modèle
- [ ] Slider seuil classification recalcule métriques

## Architecture & Qualité
- [ ] Plus aucune référence à Azure
- [ ] Toutes les couleurs utilisent les variables CSS (dark + light)
- [ ] Animations Framer Motion fluides
- [ ] Toast notifications pour actions importantes
- [ ] README.md projet à jour

---

# 📞 Si tu bloques

Si Claude Code rencontre un problème :
1. Lire **attentivement** la section concernée de cette roadmap
2. Consulter le notebook source pour la logique métier (`Pipeline_PFE_Cevital_CHAMPION.ipynb`)
3. Consulter `cevital_pipeline.py` pour le code exact
4. Demander confirmation à l'utilisateur avant de prendre une décision importante

---

**Document généré par Claude (Anthropic) — Version 1.0 — Partie 2/2**
**Fichier source pipeline : `cevital_pipeline.py` (livré séparément)**
