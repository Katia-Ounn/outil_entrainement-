"""
main.py — Serveur FastAPI avec WebSockets
Plateforme PdM — PFE Master 2 Génie Logiciel
"""

import os, json, asyncio, threading
from typing import List, Optional
from datetime import datetime

from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect,
    Depends, HTTPException, BackgroundTasks, status
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import numpy as np

from models import (
    init_db, get_db, Experiment, DataIngestionLog,
    TrainingStatus
)
from pipeline import MaintenancePipeline
from tuner import PDMTuner
from eda import EDAEngine

_eda_cache: dict = {}
_eda_engine: Optional[EDAEngine] = None

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, "..", "data")
EXPORTS_DIR = os.path.join(BASE_DIR, "..", "exports")

app = FastAPI(
    title="Plateforme PdM — PFE Master 2",
    description="Système d'expérimentation AutoML pour la Maintenance Prédictive",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


# ─────────────────────────────────────────────────────────────
# Gestionnaire WebSocket — supporte training + ingestion
# ─────────────────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.training: dict[int, WebSocket] = {}   # experiment_id → ws
        self.ingestion: Optional[WebSocket]  = None

    async def connect_training(self, experiment_id: int, ws: WebSocket):
        await ws.accept()
        self.training[experiment_id] = ws

    async def connect_ingestion(self, ws: WebSocket):
        await ws.accept()
        self.ingestion = ws

    def disconnect_training(self, experiment_id: int):
        self.training.pop(experiment_id, None)

    def disconnect_ingestion(self):
        self.ingestion = None

    async def send_training(self, experiment_id: int, data: dict):
        ws = self.training.get(experiment_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_training(experiment_id)

    async def send_ingestion(self, data: dict):
        if self.ingestion:
            try:
                await self.ingestion.send_json(data)
            except Exception:
                self.ingestion = None


manager = ConnectionManager()


# ─────────────────────────────────────────────────────────────
# Cache pipeline
# ─────────────────────────────────────────────────────────────
_pipeline_cache: Optional[MaintenancePipeline] = None
_pipeline_lock  = threading.Lock()
_ingestion_ws_queue: asyncio.Queue = None   # initialisé au démarrage


def get_pipeline_sync(machine_id: int = 99, lookback: int = 24) -> MaintenancePipeline:
    global _pipeline_cache
    with _pipeline_lock:
        if _pipeline_cache is not None and _pipeline_cache.machine_id == machine_id:
            return _pipeline_cache
        p = MaintenancePipeline(
            data_dir=DATA_DIR,
            exports_dir=EXPORTS_DIR,
            machine_id=machine_id,
            lookback=lookback,
        )
        p.run_full_pipeline()
        _pipeline_cache = p
        return p


async def get_pipeline(machine_id: int = 99, lookback: int = 24) -> MaintenancePipeline:
    global _pipeline_cache
    if _pipeline_cache is not None and _pipeline_cache.machine_id == machine_id:
        return _pipeline_cache
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: get_pipeline_sync(machine_id, lookback))
    return result


# ─────────────────────────────────────────────────────────────
# Schémas Pydantic
# ─────────────────────────────────────────────────────────────
class ManualTrainRequest(BaseModel):
    name:          str         = Field(..., example="LSTM_Test_01")
    architecture:  str         = Field("LSTM")
    machine_id:    int         = Field(99)
    num_layers:    int         = Field(2, ge=1, le=4)
    units:         List[int]   = Field([64, 32])
    dropout_rates: List[float] = Field([0.2, 0.1])
    learning_rate: float       = Field(0.001)
    epochs:        int         = Field(50, ge=1, le=200)
    batch_size:    int         = Field(32)
    patience:      int         = Field(10)
    lookback:      int         = Field(24)


class AutoTrainRequest(BaseModel):
    name:             str         = Field(..., example="AutoML_Bayesian_01")
    architecture:     str         = Field("LSTM")
    machine_id:       int         = Field(99)
    layers_min:       int         = Field(1, ge=1)
    layers_max:       int         = Field(4, le=6)
    units_min:        int         = Field(32)
    units_max:        int         = Field(256)
    units_step:       int         = Field(32)
    dropout_min:      float       = Field(0.1)
    dropout_max:      float       = Field(0.5)
    lr_choices:       List[float] = Field([1e-2, 1e-3, 1e-4])
    max_trials:       int         = Field(10, ge=1, le=30)
    cv_folds:         int         = Field(5, ge=2, le=10)
    epochs_per_trial: int         = Field(20)
    final_epochs:     int         = Field(50)
    batch_size:       int         = Field(32)
    lookback:         int         = Field(24)


# ─────────────────────────────────────────────────────────────
# Pipeline avec streaming WebSocket intégré
# ─────────────────────────────────────────────────────────────
def run_pipeline_streaming(machine_id: int, lookback: int, loop: asyncio.AbstractEventLoop, log_entry_id: int):
    """
    Exécute le pipeline ÉTAPE PAR ÉTAPE en suivant exactement la méthodologie
    documentée dans pipeline.py. Chaque transformation est envoyée au WebSocket
    avec son DataFrame réel et une explication méthodologique.
    """
    import pandas as pd
    import numpy as np
    from sklearn.preprocessing import MinMaxScaler

    SENSOR_COLS    = ["volt", "rotate", "pressure", "vibration"]
    COMPONENT_COLS = ["comp1", "comp2", "comp3", "comp4"]
    ERROR_COLS     = ["error1", "error2", "error3", "error4", "error5"]

    def emit(data: dict):
        """Envoie un message WebSocket depuis le thread de pipeline."""
        asyncio.run_coroutine_threadsafe(manager.send_ingestion(data), loop)

    def df_preview(df, cols=None, n=10, mix_special=None):
        """Prépare un aperçu du DataFrame pour l'interface.
        mix_special: dict optionnel {col: value} pour mélanger des lignes
        ayant cette valeur (ex: lignes avec failure!='none')."""
        cols = cols or list(df.columns)
        cols = [c for c in cols if c in df.columns]
        if mix_special:
            col, val = list(mix_special.items())[0]
            if col in df.columns:
                if callable(val):
                    mask = df[col].apply(val)
                else:
                    mask = df[col] == val
                special = df[mask].head(n // 2)
                normal  = df[~mask].head(n - len(special))
                sample  = pd.concat([normal, special]).head(n)
            else:
                sample = df.head(n)
        else:
            sample = df.head(n)

        rows = []
        for _, row in sample.iterrows():
            r = []
            for c in cols:
                v = row[c]
                if pd.isna(v):
                    r.append("")
                elif isinstance(v, (int, np.integer)):
                    r.append(str(int(v)))
                elif isinstance(v, (float, np.floating)):
                    r.append(f"{v:.4f}" if abs(v) < 1000 else f"{v:.2f}")
                else:
                    r.append(str(v))
            rows.append(r)
        return cols, rows

    files_meta = {
        "telemetry": "PdM_telemetry.csv",
        "machines":  "PdM_machines.csv",
        "failures":  "PdM_failures.csv",
        "errors":    "PdM_errors.csv",
        "maint":     "PdM_maint.csv",
    }

    # ════════════════════════════════════════════════════════
    # PHASE 1 : Chargement & Validation
    # ════════════════════════════════════════════════════════
    emit({"type": "phase", "phase": 1, "title": "Chargement & Validation des fichiers CSV"})

    dfs = {}
    for name, fname in files_meta.items():
        path = os.path.join(DATA_DIR, fname)
        df   = pd.read_csv(path)
        dfs[name] = df
        nan_c = int(df.isnull().sum().sum())
        dup_c = int(df.duplicated().sum())
        cols, rows = df_preview(df, n=5)
        emit({
            "type":    "file_loaded",
            "name":    name,
            "fname":   fname,
            "rows":    int(df.shape[0]),
            "cols":    int(df.shape[1]),
            "nan":     nan_c,
            "dup":     dup_c,
            "status":  "OK" if nan_c == 0 and dup_c == 0 else "Attention",
            "columns": cols,
            "preview": rows,
            "dtypes":  {c: str(d) for c, d in df.dtypes.items()},
        })

    # Conversion datetime + validation fréquence
    for name in ["telemetry", "failures", "errors", "maint"]:
        dfs[name]["datetime"] = pd.to_datetime(dfs[name]["datetime"])

    tel   = dfs["telemetry"]
    diffs = tel.groupby("machineID")["datetime"].diff().dropna().dt.total_seconds()
    freq_ok = bool(len(diffs.mode()) > 0 and diffs.mode().iloc[0] == 3600)
    emit({
        "type":       "validation",
        "freq_ok":    freq_ok,
        "period_start": str(tel["datetime"].min()),
        "period_end":   str(tel["datetime"].max()),
        "n_machines":   int(tel["machineID"].nunique()),
    })

    # ════════════════════════════════════════════════════════
    # PHASE 2 : Fusion des datasets — étape par étape
    # ════════════════════════════════════════════════════════
    emit({"type": "phase", "phase": 2, "title": "Fusion progressive des 5 datasets"})

    # ─── 2.0 : Base télémétrie ───
    df = dfs["telemetry"].copy()
    cols, rows = df_preview(df, n=10)
    emit({
        "type":    "merge_step",
        "step":    0,
        "label":   "Base de départ : table telemetry",
        "rows":    int(df.shape[0]),
        "cols":    int(df.shape[1]),
        "columns": cols,
        "preview": rows,
        "new_cols": [],
        "method":  "df = telemetry.copy()",
        "explain": "On part de la table telemetry qui contient les 4 mesures horaires (volt, rotate, pressure, vibration) pour 100 machines pendant 1 an. C\'est la base sur laquelle on va greffer les autres informations.",
    })

    # ─── 2.1 : Fusion avec machines ───
    machines = dfs["machines"].copy()
    if "age" in machines.columns:
        machines = machines.rename(columns={"age": "machine_age_years"})
    if "model" in machines.columns:
        machines["model_encoded"] = machines["model"].astype("category").cat.codes.astype(int)
    keep = ["machineID"] + [c for c in ["model_encoded", "machine_age_years"] if c in machines.columns]
    df = pd.merge(df, machines[keep], on="machineID", how="left")
    cols, rows = df_preview(df, n=10)
    emit({
        "type":    "merge_step",
        "step":    1,
        "label":   "Fusion avec machines",
        "rows":    int(df.shape[0]),
        "cols":    int(df.shape[1]),
        "columns": cols,
        "preview": rows,
        "new_cols": ["model_encoded", "machine_age_years"],
        "method":  "df = pd.merge(df, machines, on=\"machineID\", how=\"left\")",
        "explain": "LEFT JOIN sur machineID pour ajouter les métadonnées de chaque machine. La colonne \"age\" est renommée en \"machine_age_years\" pour éviter le conflit avec les futures colonnes comp_age. La colonne \"model\" est encodée en entier (0–3) car les modèles ML ne traitent pas les strings.",
        "transformations": [
            "Rename: age → machine_age_years",
            "Encode: model (string) → model_encoded (int 0–3)",
            "LEFT JOIN sur machineID",
        ],
    })

    # ─── 2.2 : Fusion avec errors (pivot) ───
    errors = dfs["errors"].copy()
    if "errorID" in errors.columns:
        for eid in sorted(errors["errorID"].unique()):
            col_name = str(eid).lower()
            sub = errors[errors["errorID"] == eid].groupby(["datetime", "machineID"]).size().reset_index(name=col_name)
            df = pd.merge(df, sub, on=["datetime", "machineID"], how="left")

    for col in ERROR_COLS:
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = df[col].fillna(0).astype(int)

    err_total = int(df[ERROR_COLS].sum().sum())
    # Aperçu mélangé : lignes avec et sans erreurs pour montrer le contraste
    cols_show = ["datetime", "machineID"] + ERROR_COLS
    cols, rows = df_preview(df, cols=cols_show, n=10,
                             mix_special={"_err_sum": lambda v: False})
    # Plus simple : prendre directement des lignes avec et sans erreurs
    rows_with_err    = df[df[ERROR_COLS].sum(axis=1) > 0].head(5)
    rows_without_err = df[df[ERROR_COLS].sum(axis=1) == 0].head(5)
    sample           = pd.concat([rows_without_err, rows_with_err]).head(10)
    cols, rows       = df_preview(sample, cols=cols_show, n=10)

    emit({
        "type":    "merge_step",
        "step":    2,
        "label":   "Fusion avec errors (pivot)",
        "rows":    int(df.shape[0]),
        "cols":    int(df.shape[1]),
        "columns": cols,
        "preview": rows,
        "new_cols": ERROR_COLS,
        "err_total": err_total,
        "method":  "Pour chaque errorID : groupby(datetime,machineID).size() puis merge",
        "explain": f"Les erreurs sont à l\'origine sous forme \"longue\" (1 ligne = 1 erreur). On les pivote en format \"large\" : chaque type d\'erreur (error1 à error5) devient une colonne binaire. \"1\" si l\'erreur a eu lieu cette heure, \"0\" sinon. Au total {err_total:,} occurrences d\'erreurs intégrées.",
        "transformations": [
            "Pivot longue → large pour chaque errorID",
            "fillna(0) pour les heures sans erreur",
            "astype(int) — colonnes binaires 0/1",
        ],
        "note": "Aperçu : 5 lignes sans erreurs (en haut) + 5 lignes avec erreurs réelles (en bas) pour montrer le contraste",
    })

    # ─── 2.3 : Fusion avec failures ───
    failures = dfs["failures"].copy()
    df = pd.merge(df, failures[["datetime", "machineID", "failure"]], on=["datetime", "machineID"], how="left")
    df["failure"] = df["failure"].fillna("none")
    df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)

    failure_counts = df["failure"].value_counts().to_dict()
    cols_show = ["datetime", "machineID", "volt", "rotate", "pressure", "vibration", "failure"]
    rows_with_fail    = df[df["failure"] != "none"].head(5)
    rows_without_fail = df[df["failure"] == "none"].head(5)
    sample            = pd.concat([rows_without_fail, rows_with_fail]).head(10)
    cols, rows        = df_preview(sample, cols=cols_show, n=10)

    emit({
        "type":    "merge_step",
        "step":    3,
        "label":   "Fusion avec failures",
        "rows":    int(df.shape[0]),
        "cols":    int(df.shape[1]),
        "columns": cols,
        "preview": rows,
        "new_cols": ["failure"],
        "failure_counts": failure_counts,
        "method":  "df = pd.merge(df, failures, on=[\"datetime\",\"machineID\"], how=\"left\")",
        "explain": "LEFT JOIN sur (datetime, machineID) pour aligner les pannes sur la timeline horaire. Les heures sans panne reçoivent \"none\". Cette colonne sera ESSENTIELLE pour calculer le RUL (Remaining Useful Life) en Phase 3.",
        "transformations": [
            "LEFT JOIN sur (datetime, machineID)",
            "fillna(\"none\") pour les heures sans panne",
            "Tri final par (machineID, datetime)",
        ],
        "note": "Aperçu : 5 lignes normales (failure=\"none\") + 5 lignes de pannes réelles. Sur 876 142 lignes, seulement 761 sont des pannes — c\'est un événement rare !",
    })

    # Stocker le DataFrame fusionné pour Phase 3
    df_raw = df

    # ════════════════════════════════════════════════════════
    # PHASE 3 : Feature Engineering — étape par étape
    # ════════════════════════════════════════════════════════
    emit({"type": "phase", "phase": 3, "title": "Feature Engineering — création des 31 features"})

    # ─── 3.1 : Rolling features ───
    df = df_raw.copy()
    new_cols = []
    for window, label in [(3, "3h"), (24, "24h")]:
        for col in SENSOR_COLS:
            df[f"{col}_mean_{label}"] = df.groupby("machineID")[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).mean()
            )
            df[f"{col}_std_{label}"]  = df.groupby("machineID")[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).std().fillna(0)
            )
            new_cols.extend([f"{col}_mean_{label}", f"{col}_std_{label}"])

    rolling_cols = [c for c in df.columns if "_mean_" in c or "_std_" in c]
    cols_show    = ["datetime", "machineID"] + rolling_cols
    cols, rows   = df_preview(df, cols=cols_show, n=10)
    emit({
        "type":         "feature_step",
        "step":         1,
        "label":        "Rolling features (statistiques glissantes)",
        "n_new":        len(rolling_cols),
        "cols":         rolling_cols,
        "preview_cols": cols,
        "preview":      rows,
        "method":       "df.groupby(\"machineID\")[col].transform(rolling(window).mean/std)",
        "explain":      "Pour chaque capteur, on calcule la moyenne et l\'écart-type sur 2 fenêtres temporelles glissantes : 3h (court terme) et 24h (long terme). Ces statistiques permettent au modèle LSTM de capturer à la fois les variations rapides (anomalies brusques) et les tendances lentes (dérive progressive vers une panne). Le groupby(machineID) garantit qu\'on ne mélange pas les historiques entre machines.",
        "transformations": [
            "Pour chaque (capteur × fenêtre) : moyenne et écart-type",
            "4 capteurs × 2 fenêtres × 2 stats = 16 nouvelles colonnes",
            "groupby(machineID) pour isoler chaque machine",
            "min_periods=1 : on remplit dès la première valeur (pas de NaN au début)",
        ],
        "description":  "16 nouvelles colonnes : volt_mean_3h, volt_std_3h, ..., vibration_mean_24h, vibration_std_24h",
    })

    # ─── 3.2 : Âge des composants ───
    maint    = dfs["maint"].copy().sort_values("datetime")
    comp_col = next((c for c in ["comp", "component", "comp_id"] if c in maint.columns), None)
    df_sorted = df.sort_values(["machineID", "datetime"]).copy()

    for comp in COMPONENT_COLS:
        try:
            if comp_col is None:
                df_sorted[f"{comp}_age"] = 0.0
            else:
                mc = maint[maint[comp_col] == comp][["datetime", "machineID"]].copy()
                mc = mc.sort_values("datetime")
                if len(mc) == 0:
                    df_sorted[f"{comp}_age"] = 0.0
                else:
                    tmp = pd.merge_asof(
                        df_sorted[["datetime", "machineID"]].reset_index().sort_values("datetime"),
                        mc.rename(columns={"datetime": "last_maint_date"}),
                        left_on="datetime", right_on="last_maint_date",
                        by="machineID", direction="backward"
                    )
                    tmp = tmp.set_index("index")
                    start_dates = df_sorted.groupby("machineID")["datetime"].transform("min")
                    age_filled = (df_sorted["datetime"] - start_dates).dt.total_seconds() / 86400.0
                    age_from_maint = (df_sorted["datetime"] - tmp["last_maint_date"]).dt.total_seconds() / 86400.0
                    df_sorted[f"{comp}_age"] = age_from_maint.fillna(age_filled).values
            new_cols.append(f"{comp}_age")
        except Exception:
            df_sorted[f"{comp}_age"] = 0.0
            new_cols.append(f"{comp}_age")

    df = df_sorted.sort_values(["machineID", "datetime"]).reset_index(drop=True)

    age_cols = [c for c in df.columns if c.endswith("_age")]
    age_stats = {c: {"mean": round(float(df[c].mean()), 2),
                     "max":  round(float(df[c].max()), 2),
                     "min":  round(float(df[c].min()), 2)} for c in age_cols}
    cols_show = ["datetime", "machineID"] + age_cols
    cols, rows = df_preview(df, cols=cols_show, n=10)
    emit({
        "type":         "feature_step",
        "step":         2,
        "label":        "Âge des composants (jours depuis dernière maintenance)",
        "cols":         age_cols,
        "stats":        age_stats,
        "preview_cols": cols,
        "preview":      rows,
        "method":       "pd.merge_asof(df, maint, by=\"machineID\", direction=\"backward\")",
        "explain":      "Pour chaque ligne, on cherche la dernière date de maintenance du composant correspondant et on calcule l\'écart en jours. Plus la valeur est élevée, plus le composant est usé depuis sa dernière révision. Les composants n\'ayant jamais été remplacés voient leur âge calculé depuis le début de l\'historique de la machine.",
        "transformations": [
            "merge_asof backward : trouve la dernière maintenance ≤ datetime courant",
            "Calcul (datetime_courant − last_maint_date) en jours",
            "Fallback : si jamais maintenu → âge depuis début historique",
            "4 composants → 4 nouvelles colonnes (comp1_age à comp4_age)",
        ],
        "description":  "Âge en jours depuis la dernière maintenance de chaque composant. Plus c\'est élevé, plus c\'est usé.",
    })

    # ─── 3.3 : Calcul du RUL ───
    df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)
    failures_only = dfs["failures"][["machineID", "datetime"]].copy()
    failures_only = failures_only.rename(columns={"datetime": "fail_date"})
    failures_only = failures_only.sort_values("fail_date").reset_index(drop=True)
    df = pd.merge_asof(
        df.sort_values("datetime"),
        failures_only,
        left_on="datetime", right_on="fail_date",
        by="machineID", direction="forward"
    )
    df["RUL"] = (df["fail_date"] - df["datetime"]).dt.total_seconds() / 3600.0
    df = df.drop(columns=["fail_date"])
    df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)

    before = len(df)
    df = df.dropna(subset=["RUL"]).reset_index(drop=True)
    df["RUL"] = df["RUL"].astype(float)
    n_removed = before - len(df)

    rul_data = df["RUL"].values
    machine_df = df[df["machineID"] == machine_id]
    failures_m = dfs["failures"][dfs["failures"]["machineID"] == machine_id].copy()
    failure_timeline = failures_m.sort_values("datetime")[["datetime", "failure"]].copy()
    failure_timeline["datetime"] = failure_timeline["datetime"].astype(str)

    cols_show  = ["datetime", "machineID", "volt", "rotate", "pressure", "vibration", "RUL"]
    cols, rows = df_preview(df, cols=cols_show, n=10)
    emit({
        "type":         "feature_step",
        "step":         3,
        "label":        "Calcul du RUL (Remaining Useful Life)",
        "rul_mean":     round(float(rul_data.mean()), 2),
        "rul_std":      round(float(rul_data.std()), 2),
        "rul_min":      round(float(rul_data.min()), 2),
        "rul_max":      round(float(rul_data.max()), 2),
        "rul_median":   round(float(np.median(rul_data)), 2),
        "n_samples":    int(len(rul_data)),
        "n_removed":    int(n_removed),
        "machine_rul_mean": round(float(machine_df["RUL"].mean()), 2) if len(machine_df) > 0 else 0,
        "failure_timeline": failure_timeline.to_dict("records"),
        "preview_cols": cols,
        "preview":      rows,
        "histogram":    [round(float(v), 1) for v in np.random.choice(rul_data, min(500, len(rul_data)), replace=False)],
        "method":       "pd.merge_asof(df, failures, direction=\"forward\") puis (fail_date − datetime)",
        "explain":      f"Le RUL est notre VARIABLE CIBLE : combien d\'heures restent avant la prochaine panne. Pour chaque ligne, on cherche la prochaine panne future de la même machine (merge_asof forward), et on calcule l\'écart en heures. Les {n_removed:,} lignes après la dernière panne d\'une machine sont supprimées car on ne connaît pas leur prochaine panne.",
        "transformations": [
            "merge_asof forward : trouve la prochaine panne > datetime courant",
            "RUL = (fail_date − datetime) en heures",
            f"dropna(RUL) : suppression de {n_removed:,} lignes après la dernière panne",
            f"Reste : {len(df):,} lignes utilisables",
        ],
        "description":  "RUL en heures = combien de temps avant la prochaine panne. C\'est ce que le modèle doit apprendre à prédire.",
    })

    # ─── 3.4 : Liste finale des features ───
    error_ok = [c for c in ERROR_COLS if c in df.columns]
    extra    = [c for c in ["model_encoded", "machine_age_years"] if c in df.columns]
    seen, ordered = set(), []
    for c in SENSOR_COLS + new_cols + error_ok + extra:
        if c not in seen and c in df.columns:
            seen.add(c)
            ordered.append(c)
    feature_cols = ordered

    categories = {
        "capteurs_bruts":  [c for c in feature_cols if c in SENSOR_COLS],
        "rolling_3h":      [c for c in feature_cols if "3h" in c],
        "rolling_24h":     [c for c in feature_cols if "24h" in c],
        "composants":      [c for c in feature_cols if "_age" in c],
        "erreurs":         [c for c in feature_cols if c.startswith("error")],
        "machine":         [c for c in feature_cols if c in ["model_encoded", "machine_age_years"]],
    }

    emit({
        "type":         "feature_step",
        "step":         4,
        "label":        f"Liste finale des {len(feature_cols)} features",
        "feature_cols": feature_cols,
        "n_features":   len(feature_cols),
        "categories":   categories,
        "method":       "Déduplication ordonnée + filtrage colonnes existantes",
        "explain":      f"Les {len(feature_cols)} features sont organisées en 6 catégories. Le modèle LSTM va apprendre à combiner ces signaux pour prédire le RUL. Notez qu\'on n\'inclut PAS \"failure\" car c\'est ce qu\'on cherche à éviter (si on connaissait la panne, on n\'aurait pas besoin de prédire).",
    })

    df_features = df

    # ════════════════════════════════════════════════════════
    # PHASE 4 : Préparation des tenseurs
    # ════════════════════════════════════════════════════════
    emit({"type": "phase", "phase": 4, "title": "Préparation des tenseurs pour le LSTM"})

    # 4.1 : Filtrage machine cible
    df_m = df_features[df_features["machineID"] == machine_id].copy()
    df_m = df_m.sort_values("datetime").reset_index(drop=True)
    n_initial = len(df_m)

    # 4.2 : Suppression du lookback
    df_m = df_m.iloc[lookback:].reset_index(drop=True)
    n_after_lookback = len(df_m)

    emit({
        "type":        "tensor_step",
        "step":        1,
        "label":       f"Filtrage machine cible #{machine_id} & stabilisation rolling",
        "train_rows":  n_initial,
        "test_rows":   n_after_lookback,
        "split_ratio": f"{n_initial:,} → {n_after_lookback:,}",
        "method":      f"df[df.machineID == {machine_id}].iloc[{lookback}:]",
        "explain":     f"On entraîne un modèle PAR MACHINE car chaque machine a ses propres caractéristiques d\'usure. On supprime aussi les {lookback} premières lignes : les rolling features sur 24h ne sont pas fiables avant d\'avoir 24h d\'historique.",
    })

    # 4.3 : Nettoyage NaN/Inf
    feature_cols_valid = [c for c in feature_cols if c in df_m.columns]
    df_m[feature_cols_valid] = df_m[feature_cols_valid].fillna(0).replace([np.inf, -np.inf], 0)
    df_m = df_m.dropna(subset=["RUL"]).reset_index(drop=True)

    # 4.4 : Split chronologique 80/20
    split_idx = int(len(df_m) * 0.8)
    df_train = df_m.iloc[:split_idx].copy()
    df_test  = df_m.iloc[split_idx:].copy()

    emit({
        "type":        "tensor_step",
        "step":        2,
        "label":       "Split chronologique 80% train / 20% test",
        "train_rows":  int(len(df_train)),
        "test_rows":   int(len(df_test)),
        "split_ratio": "80 / 20",
        "method":      "df.iloc[:split_idx] et df.iloc[split_idx:]",
        "explain":     "Split CHRONOLOGIQUE strict — pas de mélange aléatoire. Le modèle s\'entraîne sur les premiers 80% du temps et est testé sur les derniers 20%. C\'est crucial pour les séries temporelles : on ne peut pas \"voir le futur\" pendant l\'entraînement, sinon on triche (data leakage).",
    })

    # 4.5 : Normalisation
    scaler_x = MinMaxScaler(feature_range=(0, 1))
    scaler_y = MinMaxScaler(feature_range=(0, 1))

    X_train_arr = np.nan_to_num(df_train[feature_cols_valid].values.astype(np.float32))
    X_test_arr  = np.nan_to_num(df_test[feature_cols_valid].values.astype(np.float32))
    y_train_arr = np.nan_to_num(df_train[["RUL"]].values.astype(np.float32))
    y_test_arr  = np.nan_to_num(df_test[["RUL"]].values.astype(np.float32))

    X_train_s = scaler_x.fit_transform(X_train_arr)
    X_test_s  = scaler_x.transform(X_test_arr)
    y_train_s = scaler_y.fit_transform(y_train_arr)
    y_test_s  = scaler_y.transform(y_test_arr)

    emit({
        "type":          "tensor_step",
        "step":          3,
        "label":         "Normalisation MinMaxScaler [0, 1]",
        "feature_min":   [round(float(v), 4) for v in scaler_x.data_min_[:8]],
        "feature_max":   [round(float(v), 4) for v in scaler_x.data_max_[:8]],
        "feature_names": feature_cols_valid[:8],
        "method":        "scaler.fit_transform(X_train) puis scaler.transform(X_test)",
        "explain":       "MinMaxScaler ramène toutes les valeurs entre 0 et 1. CRUCIAL : le scaler est fitté UNIQUEMENT sur les données train, puis appliqué sur le test. Si on fittait sur tout, on \"verrait le futur\" (statistiques du test). Le scaler est sauvegardé dans exports/ pour pouvoir dénormaliser les prédictions plus tard.",
        "note":          "Affichage des 8 premières features. Le scaler est appliqué identiquement aux 31 features.",
    })

    # 4.6 : Séquençage 3D
    def create_sequences(X, y, lb):
        X_seq, y_seq = [], []
        for i in range(len(X) - lb):
            X_seq.append(X[i:i+lb])
            y_seq.append(y[i+lb])
        return np.array(X_seq), np.array(y_seq)

    X_train, y_train = create_sequences(X_train_s, y_train_s, lookback)
    X_test,  y_test  = create_sequences(X_test_s,  y_test_s,  lookback)

    seq_example       = X_train[0].tolist()
    seq_example_short = [row[:5] for row in seq_example[:3]]

    emit({
        "type":          "tensor_step",
        "step":          4,
        "label":         "Séquençage 3D : (Samples × Lookback × Features)",
        "X_train_shape": list(X_train.shape),
        "X_test_shape":  list(X_test.shape),
        "y_train_shape": list(y_train.shape),
        "y_test_shape":  list(y_test.shape),
        "lookback":      lookback,
        "seq_example":   seq_example_short,
        "seq_labels":    feature_cols_valid[:5],
        "method":        f"Pour chaque i : X[i:i+{lookback}] → prédire RUL à t={lookback}",
        "explain":       f"Le LSTM a besoin de séquences 3D : (nb_échantillons, longueur_séquence, nb_features). Chaque échantillon est une fenêtre glissante de {lookback} heures consécutives. Le modèle reçoit {lookback} heures d\'historique et prédit le RUL au pas suivant. C\'est ce qu\'on appelle l\'apprentissage many-to-one.",
        "note":          f"Aperçu : 3 premiers timesteps × 5 premières features (sur {lookback} timesteps × 31 features réels)",
    })

    # ── DataFrame final 100 lignes complètes ──
    df_final = df_features[df_features["machineID"] == machine_id].copy()
    df_final = df_final.sort_values("datetime").reset_index(drop=True)
    df_final = df_final.iloc[lookback:].reset_index(drop=True)
    final_cols = ["datetime", "machineID"] + feature_cols_valid + ["RUL"]
    final_cols = [c for c in final_cols if c in df_final.columns]
    df_show = df_final[final_cols].head(100).copy()
    cols, rows = df_preview(df_show, n=100)

    emit({
        "type":       "final_dataframe",
        "label":      f"DataFrame final prêt pour l\'entraînement — Machine {machine_id}",
        "columns":    cols,
        "preview":    rows,
        "total_rows": int(len(df_final)),
        "n_features": len(feature_cols_valid),
        "n_shown":    len(rows),
        "machine_id": machine_id,
    })

    # ── Construire le pipeline réel pour le cache (utilisé par l\'entraînement) ──
    pipeline = MaintenancePipeline(
        data_dir=DATA_DIR,
        exports_dir=EXPORTS_DIR,
        machine_id=machine_id,
        lookback=lookback,
    )
    # Injecter directement les résultats déjà calculés
    pipeline._dfs              = dfs
    pipeline.df_raw            = df_raw
    pipeline.df_features       = df_features
    pipeline.feature_cols      = feature_cols_valid
    pipeline.scaler_x          = scaler_x
    pipeline.scaler_y          = scaler_y
    pipeline.X_train, pipeline.y_train = X_train, y_train
    pipeline.X_test,  pipeline.y_test  = X_test,  y_test
    pipeline.test_dates        = df_test.iloc[lookback:]["datetime"].reset_index(drop=True)
    pipeline.health_report_data = {
        "telemetry": {"rows": int(dfs["telemetry"].shape[0])},
        "machines":  {"rows": int(dfs["machines"].shape[0])},
        "failures":  {"rows": int(dfs["failures"].shape[0])},
        "errors":    {"rows": int(dfs["errors"].shape[0])},
        "maint":     {"rows": int(dfs["maint"].shape[0])},
        "frequency_ok":   freq_ok,
        "period_start":   str(tel["datetime"].min()),
        "period_end":     str(tel["datetime"].max()),
        "machines_total": int(tel["machineID"].nunique()),
    }

    report = {
        "health":       pipeline.health_report_data,
        "n_features":   len(feature_cols_valid),
        "feature_cols": feature_cols_valid,
        "X_train":      list(X_train.shape),
        "X_test":       list(X_test.shape),
    }

    emit({
        "type":       "completed",
        "X_train":    list(X_train.shape),
        "X_test":     list(X_test.shape),
        "n_features": len(feature_cols_valid),
        "message":    "Pipeline terminé avec succès !",
    })

    return pipeline, report


# ─────────────────────────────────────────────────────────────
# Tâche d'entraînement
# ─────────────────────────────────────────────────────────────
async def run_training_task(experiment_id, request_data, mode, db_session):
    loop = asyncio.get_event_loop()

    def send_fn_sync(payload):
        """Envoie depuis n'importe quel thread vers le WebSocket."""
        asyncio.run_coroutine_threadsafe(
            manager.send_training(experiment_id, payload), loop
        )

    async def send_fn(payload):
        await manager.send_training(experiment_id, payload)

    db  = next(get_db())
    exp = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not exp:
        return

    try:
        exp.status = TrainingStatus.RUNNING
        db.commit()

        # Attendre que le frontend se connecte au WebSocket (max 10 secondes)
        for _ in range(20):
            if experiment_id in manager.training:
                break
            await asyncio.sleep(0.5)

        await send_fn({"type": "status", "status": "running", "experiment_id": experiment_id})

        pipeline = get_pipeline_sync(
            machine_id=request_data.get("machine_id", 99),
            lookback=request_data.get("lookback", 24),
        )

        scaler_paths = pipeline.save_scalers(request_data["name"])

        pdm_tuner = PDMTuner(
            X_train=pipeline.X_train, y_train=pipeline.y_train,
            X_test=pipeline.X_test,  y_test=pipeline.y_test,
            scaler_y=pipeline.scaler_y,
            exports_dir=EXPORTS_DIR,
            experiment_name=request_data["name"],
            send_fn=send_fn,  # async — le tuner gère le threading en interne
        )

        if mode == "manual":
            result = await pdm_tuner.train_manual(
                architecture=request_data["architecture"],
                num_layers=request_data["num_layers"],
                units=request_data["units"],
                dropout_rates=request_data["dropout_rates"],
                learning_rate=request_data["learning_rate"],
                epochs=request_data["epochs"],
                batch_size=request_data["batch_size"],
                patience=request_data.get("patience", 10),
            )
        else:
            result = await pdm_tuner.train_auto(
                architecture=request_data["architecture"],
                layers_min=request_data["layers_min"],
                layers_max=request_data["layers_max"],
                units_min=request_data["units_min"],
                units_max=request_data["units_max"],
                units_step=request_data["units_step"],
                dropout_min=request_data["dropout_min"],
                dropout_max=request_data["dropout_max"],
                lr_choices=request_data["lr_choices"],
                max_trials=request_data["max_trials"],
                cv_folds=request_data["cv_folds"],
                epochs_per_trial=request_data["epochs_per_trial"],
                final_epochs=request_data["final_epochs"],
                batch_size=request_data["batch_size"],
            )

        # Prédictions déjà calculées par le tuner
        predictions_data = result.get("predictions_data", {})

        exp.r2_score         = result.get("r2_score")
        exp.mae              = result.get("mae")
        exp.rmse             = result.get("rmse")
        exp.mae_hours        = result.get("mae_hours")
        exp.model_path       = result.get("model_path")
        exp.scaler_x_path    = scaler_paths["scaler_x_path"]
        exp.scaler_y_path    = scaler_paths["scaler_y_path"]
        exp.training_history = result.get("training_history")
        exp.hyperparameters  = result.get("hyperparameters")
        exp.total_trials     = result.get("total_trials")
        exp.duration_sec     = result.get("duration_sec")
        exp.status           = TrainingStatus.COMPLETED
        exp.updated_at       = datetime.utcnow()
        db.commit()

        await send_fn({
            "type":          "completed",
            "experiment_id": experiment_id,
            "r2":            exp.r2_score,
            "mae_hours":     exp.mae_hours,
            "predictions":   predictions_data,
        })

    except Exception as e:
        import traceback
        exp.status        = TrainingStatus.FAILED
        exp.error_message = str(e)
        exp.updated_at    = datetime.utcnow()
        db.commit()
        await send_fn({"type": "error", "message": str(e), "traceback": traceback.format_exc()})
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


# ── EDA ─────────────────────────────────────────────────────
def _get_eda(machine_id=99):
    global _eda_engine, _eda_cache
    if _eda_engine is None or _eda_engine.machine_id != machine_id:
        _eda_engine = EDAEngine(data_dir=DATA_DIR, machine_id=machine_id)
        _eda_engine.load()
        _eda_cache  = {}
    return _eda_engine

@app.get("/api/eda/full")
def eda_full(machine_id: int = 99):
    try:
        engine = EDAEngine(data_dir=DATA_DIR, machine_id=machine_id)
        return engine.full_report()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/health")
def eda_health(machine_id: int = 99):
    try: return _get_eda(machine_id).health_report()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/failures")
def eda_failures(machine_id: int = 99):
    try: return _get_eda(machine_id).failures_analysis()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/timeseries")
def eda_timeseries(machine_id: int = 99, days: int = 90):
    try: return _get_eda(machine_id).time_series(days=days)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/correlation")
def eda_correlation(machine_id: int = 99):
    try: return _get_eda(machine_id).correlation_matrix()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/prefailure")
def eda_prefailure(machine_id: int = 99, window_hours: int = 24):
    try: return _get_eda(machine_id).pre_failure_stats(window_hours=window_hours)
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/outliers")
def eda_outliers(machine_id: int = 99):
    try: return _get_eda(machine_id).outliers_report()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/boxplot")
def eda_boxplot(machine_id: int = 99):
    try: return _get_eda(machine_id).boxplot_stats()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/eda/errors")
def eda_errors(machine_id: int = 99):
    try: return _get_eda(machine_id).errors_analysis()
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))


# ── Ingestion ────────────────────────────────────────────────
@app.post("/api/ingest")
async def ingest_data(machine_id: int = 99, db: Session = Depends(get_db)):
    global _pipeline_cache
    _pipeline_cache = None

    log_entry = DataIngestionLog(status="running")
    db.add(log_entry)
    db.commit()
    log_id = log_entry.id

    loop = asyncio.get_event_loop()

    def run():
        return run_pipeline_streaming(machine_id, 24, loop, log_id)

    try:
        pipeline, report = await loop.run_in_executor(None, run)
        _pipeline_cache = pipeline

        db.refresh(log_entry)
        log_entry.status         = "success"
        log_entry.telemetry_rows = report["health"].get("telemetry", {}).get("rows")
        log_entry.merged_rows    = int(pipeline.X_train.shape[0] + pipeline.X_test.shape[0])
        log_entry.features_count = report["n_features"]
        log_entry.message        = json.dumps(report, default=str)
        db.commit()

        return {
            "success":    True,
            "health":     report["health"],
            "n_features": report["n_features"],
            "X_train":    [int(x) for x in report["X_train"]],
            "X_test":     [int(x) for x in report["X_test"]],
            "log_id":     log_id,
        }

    except Exception as e:
        import traceback
        detail = f"{str(e)}\n\nTraceback:\n{traceback.format_exc()}"
        try:
            db.refresh(log_entry)
            log_entry.status  = "failed"
            log_entry.message = detail
            db.commit()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=detail)


@app.get("/api/ingest/status")
def get_ingest_status(db: Session = Depends(get_db)):
    log = db.query(DataIngestionLog).order_by(DataIngestionLog.id.desc()).first()
    return log.to_dict() if log else {"status": "no_data"}


# ── Entraînement Manuel ──────────────────────────────────────
@app.post("/api/train/manual", status_code=202)
async def train_manual(request: ManualTrainRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    exp = Experiment(
        name=request.name, architecture=request.architecture,
        mode="manual", machine_id=request.machine_id,
        status=TrainingStatus.PENDING, search_space=None,
    )
    db.add(exp); db.commit(); db.refresh(exp)
    background_tasks.add_task(run_training_task, exp.id, request.dict(), "manual", db)
    return {"experiment_id": exp.id, "status": "accepted"}


# ── Entraînement Automatique ─────────────────────────────────
@app.post("/api/train/auto", status_code=202)
async def train_auto(request: AutoTrainRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    exp = Experiment(
        name=request.name, architecture=request.architecture,
        mode="automatic", machine_id=request.machine_id,
        status=TrainingStatus.PENDING,
        search_space={
            "layers_min": request.layers_min, "layers_max": request.layers_max,
            "units_min":  request.units_min,  "units_max":  request.units_max,
            "dropout_min":request.dropout_min,"dropout_max":request.dropout_max,
            "max_trials": request.max_trials, "cv_folds":   request.cv_folds,
        },
        cv_folds=request.cv_folds, total_trials=request.max_trials,
    )
    db.add(exp); db.commit(); db.refresh(exp)
    background_tasks.add_task(run_training_task, exp.id, request.dict(), "auto", db)
    return {"experiment_id": exp.id, "status": "accepted"}


# ── Leaderboard ──────────────────────────────────────────────
@app.get("/api/experiments")
def get_experiments(db: Session = Depends(get_db)):
    exps = db.query(Experiment).order_by(Experiment.r2_score.desc().nulls_last()).all()
    return [e.to_dict() for e in exps]

@app.get("/api/experiments/{exp_id}")
def get_experiment(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp: raise HTTPException(status_code=404, detail="Introuvable")
    return exp.to_dict()

@app.delete("/api/experiments/{exp_id}")
def delete_experiment(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp: raise HTTPException(status_code=404, detail="Introuvable")
    db.delete(exp); db.commit()
    return {"deleted": True}


# ── WebSocket Ingestion (DOIT être avant /ws/{id} pour éviter conflit de route) ──
@app.websocket("/ws/ingestion")
async def websocket_ingestion(websocket: WebSocket):
    await manager.connect_ingestion(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_ingestion()


# ── WebSocket Entraînement ───────────────────────────────────
@app.websocket("/ws/{experiment_id}")
async def websocket_training(websocket: WebSocket, experiment_id: int):
    await manager.connect_training(experiment_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_training(experiment_id)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)