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
    """Exécute le pipeline et envoie les données étape par étape via WebSocket."""
    import pandas as pd

    def emit(data: dict):
        """Envoie un message WebSocket depuis le thread de pipeline."""
        asyncio.run_coroutine_threadsafe(manager.send_ingestion(data), loop)

    files_meta = {
        "telemetry": "PdM_telemetry.csv",
        "machines":  "PdM_machines.csv",
        "failures":  "PdM_failures.csv",
        "errors":    "PdM_errors.csv",
        "maint":     "PdM_maint.csv",
    }

    emit({"type": "phase", "phase": 1, "title": "Chargement & Validation des fichiers CSV"})

    # ── PHASE 1 : Chargement ──────────────────────────────
    dfs = {}
    for name, fname in files_meta.items():
        path = os.path.join(DATA_DIR, fname)
        df   = pd.read_csv(path)
        dfs[name] = df
        nan_c = int(df.isnull().sum().sum())
        dup_c = int(df.duplicated().sum())
        preview_cols = list(df.columns)
        preview_rows = df.head(5).fillna("").astype(str).values.tolist()
        emit({
            "type":    "file_loaded",
            "name":    name,
            "fname":   fname,
            "rows":    int(df.shape[0]),
            "cols":    int(df.shape[1]),
            "nan":     nan_c,
            "dup":     dup_c,
            "status":  "OK" if nan_c == 0 and dup_c == 0 else "Attention",
            "columns": preview_cols,
            "preview": preview_rows,
            "dtypes":  {col: str(dtype) for col, dtype in df.dtypes.items()},
        })

    # Vérification fréquence
    tel = dfs["telemetry"].copy()
    tel["datetime"] = pd.to_datetime(tel["datetime"])
    diffs = tel.groupby("machineID")["datetime"].diff().dropna().dt.total_seconds()
    freq_ok = bool(len(diffs.mode()) > 0 and diffs.mode().iloc[0] == 3600)
    emit({
        "type":       "validation",
        "freq_ok":    freq_ok,
        "period_start": str(tel["datetime"].min()),
        "period_end":   str(tel["datetime"].max()),
        "n_machines":   int(tel["machineID"].nunique()),
    })

    # ── PHASE 2 : Fusion ──────────────────────────────────
    emit({"type": "phase", "phase": 2, "title": "Fusion des 5 datasets"})

    # Construire le vrai pipeline pour ne pas dupliquer la logique
    pipeline = MaintenancePipeline(
        data_dir=DATA_DIR,
        exports_dir=EXPORTS_DIR,
        machine_id=machine_id,
        lookback=lookback,
    )
    pipeline.load_and_validate()

    # Après merge machines
    pipeline.merge_datasets()
    df_merged = pipeline.df_raw.copy()
    emit({
        "type":    "merge_step",
        "step":    1,
        "label":   "Après fusion machines (model_encoded, machine_age_years)",
        "rows":    int(df_merged.shape[0]),
        "cols":    int(df_merged.shape[1]),
        "columns": list(df_merged.columns),
        "preview": df_merged.head(5).fillna(0).astype(str).values.tolist(),
        "new_cols": ["model_encoded", "machine_age_years"],
    })

    # Stats erreurs
    err_cols = [c for c in df_merged.columns if c.startswith("error")]
    emit({
        "type":       "merge_step",
        "step":       2,
        "label":      "Après intégration des erreurs (error1..error5)",
        "rows":       int(df_merged.shape[0]),
        "cols":       int(df_merged.shape[1]),
        "columns":    list(df_merged.columns),
        "preview":    df_merged[["datetime","machineID"] + err_cols].head(5).fillna(0).astype(str).values.tolist(),
        "new_cols":   err_cols,
        "err_total":  int(df_merged[err_cols].sum().sum()) if err_cols else 0,
    })

    # Failures
    emit({
        "type":     "merge_step",
        "step":     3,
        "label":    "Après alignement des pannes (colonne failure)",
        "rows":     int(df_merged.shape[0]),
        "cols":     int(df_merged.shape[1]),
        "columns":  list(df_merged.columns),
        "preview":  df_merged[["datetime","machineID","failure"]].head(5).fillna("none").astype(str).values.tolist(),
        "new_cols": ["failure"],
        "failure_counts": df_merged["failure"].value_counts().head(10).to_dict(),
    })

    # ── PHASE 3 : Feature Engineering ─────────────────────
    emit({"type": "phase", "phase": 3, "title": "Feature Engineering"})

    pipeline.feature_engineering()
    df_feat = pipeline.df_features.copy()

    # Rolling features
    rolling_cols = [c for c in df_feat.columns if "_mean_" in c or "_std_" in c]
    rolling_preview = df_feat[["datetime","machineID"] + rolling_cols[:6]].head(5).fillna(0).round(3).astype(str).values.tolist()
    emit({
        "type":         "feature_step",
        "step":         1,
        "label":        "Rolling features (moyennes & écarts-types 3h et 24h)",
        "n_new":        len(rolling_cols),
        "cols":         rolling_cols,
        "preview_cols": ["datetime","machineID"] + rolling_cols[:6],
        "preview":      rolling_preview,
        "description":  "Pour chaque capteur (volt, rotate, pressure, vibration) : moyenne et écart-type sur fenêtres glissantes de 3h et 24h",
    })

    # Comp age
    age_cols = [c for c in df_feat.columns if "_age" in c]
    age_stats = {}
    for c in age_cols:
        age_stats[c] = {
            "mean": round(float(df_feat[c].mean()), 2),
            "max":  round(float(df_feat[c].max()), 2),
            "min":  round(float(df_feat[c].min()), 2),
        }
    emit({
        "type":        "feature_step",
        "step":        2,
        "label":       "Âge des composants (jours depuis dernière maintenance)",
        "cols":        age_cols,
        "stats":       age_stats,
        "preview_cols":["datetime","machineID"] + age_cols,
        "preview":     df_feat[["datetime","machineID"] + age_cols].head(5).fillna(0).round(2).astype(str).values.tolist(),
        "description": "Nombre de jours écoulés depuis la dernière maintenance de chaque composant. Plus la valeur est élevée, plus le composant est usé.",
    })

    # RUL stats
    rul_data = df_feat["RUL"].dropna()
    machine_df = df_feat[df_feat["machineID"] == machine_id]
    failures_df = dfs["failures"]
    failures_m  = failures_df[failures_df["machineID"] == machine_id].copy()
    failures_m["datetime"] = pd.to_datetime(failures_m["datetime"])
    failure_timeline = failures_m.sort_values("datetime")[["datetime","failure"]].copy()
    failure_timeline["datetime"] = failure_timeline["datetime"].astype(str)

    emit({
        "type":         "feature_step",
        "step":         3,
        "label":        "Calcul du RUL (Remaining Useful Life)",
        "rul_mean":     round(float(rul_data.mean()), 2),
        "rul_std":      round(float(rul_data.std()), 2),
        "rul_min":      round(float(rul_data.min()), 2),
        "rul_max":      round(float(rul_data.max()), 2),
        "rul_median":   round(float(rul_data.median()), 2),
        "n_samples":    int(len(rul_data)),
        "n_removed":    int(pipeline.df_raw.shape[0] - len(rul_data)),
        "machine_rul_mean": round(float(machine_df["RUL"].mean()), 2) if len(machine_df) > 0 else 0,
        "failure_timeline": failure_timeline.to_dict("records"),
        "preview_cols": ["datetime","machineID","RUL"],
        "preview":      df_feat[["datetime","machineID","RUL"]].head(5).round(2).astype(str).values.tolist(),
        "histogram":    [round(float(v), 1) for v in rul_data.sample(min(500, len(rul_data)), random_state=42).tolist()],
        "description":  "RUL = heures restantes avant la prochaine panne. Calculé par merge_asof forward sur les dates de pannes.",
    })

    # Features finales
    emit({
        "type":         "feature_step",
        "step":         4,
        "label":        "Liste finale des 31 features",
        "feature_cols": pipeline.feature_cols,
        "n_features":   len(pipeline.feature_cols),
        "categories":   {
            "capteurs_bruts": ["volt","rotate","pressure","vibration"],
            "rolling_3h":     [c for c in pipeline.feature_cols if "3h" in c],
            "rolling_24h":    [c for c in pipeline.feature_cols if "24h" in c],
            "composants":     [c for c in pipeline.feature_cols if "_age" in c],
            "erreurs":        [c for c in pipeline.feature_cols if c.startswith("error")],
            "machine":        [c for c in pipeline.feature_cols if c in ["model_encoded","machine_age_years"]],
        },
    })

    # ── PHASE 4 : Tenseurs ─────────────────────────────────
    emit({"type": "phase", "phase": 4, "title": "Préparation des tenseurs & normalisation"})

    pipeline.prepare_tensors()

    # Exemple séquence
    seq_example = pipeline.X_train[0].tolist()  # shape (24, 31)
    seq_example_short = [row[:5] for row in seq_example[:3]]  # 3 timesteps, 5 features

    # Stats normalisation
    scaler_x = pipeline.scaler_x
    emit({
        "type":        "tensor_step",
        "step":        1,
        "label":       "Split chronologique 80% train / 20% test",
        "train_rows":  int(pipeline.X_train.shape[0] + pipeline.lookback),
        "test_rows":   int(pipeline.X_test.shape[0] + pipeline.lookback),
        "split_ratio": "80 / 20",
        "note":        "Split chronologique strict — pas de mélange aléatoire pour éviter le data leakage temporel",
    })

    emit({
        "type":          "tensor_step",
        "step":          2,
        "label":         "Normalisation MinMaxScaler [0, 1]",
        "feature_min":   [round(float(v), 4) for v in scaler_x.data_min_[:5]],
        "feature_max":   [round(float(v), 4) for v in scaler_x.data_max_[:5]],
        "feature_names": pipeline.feature_cols[:5],
        "note":          "Scaler fitté sur TRAIN uniquement — appliqué sur TEST pour éviter le data leakage",
    })

    emit({
        "type":          "tensor_step",
        "step":          3,
        "label":         "Séquençage 3D (Samples × Lookback × Features)",
        "X_train_shape": list(pipeline.X_train.shape),
        "X_test_shape":  list(pipeline.X_test.shape),
        "y_train_shape": list(pipeline.y_train.shape),
        "y_test_shape":  list(pipeline.y_test.shape),
        "lookback":      pipeline.lookback,
        "seq_example":   seq_example_short,
        "seq_labels":    pipeline.feature_cols[:5],
        "note":          f"Chaque sample = fenêtre de {pipeline.lookback}h d'historique → prédire RUL à t+1",
    })

    # Résumé final
    report = {
        "health":     pipeline.health_report_data,
        "n_features": len(pipeline.feature_cols),
        "feature_cols": pipeline.feature_cols,
        "X_train":    list(pipeline.X_train.shape),
        "X_test":     list(pipeline.X_test.shape),
    }

    emit({
        "type":       "completed",
        "X_train":    list(pipeline.X_train.shape),
        "X_test":     list(pipeline.X_test.shape),
        "n_features": len(pipeline.feature_cols),
        "message":    "Pipeline terminé avec succès !",
    })

    return pipeline, report


# ─────────────────────────────────────────────────────────────
# Tâche d'entraînement
# ─────────────────────────────────────────────────────────────
async def run_training_task(experiment_id, request_data, mode, db_session):
    async def send_fn(payload):
        await manager.send_training(experiment_id, payload)

    db  = next(get_db())
    exp = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not exp:
        return

    try:
        exp.status = TrainingStatus.RUNNING
        db.commit()
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
            send_fn=send_fn,
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

        # Calcul prédictions pour visualisation
        import tensorflow as tf
        model = tf.keras.models.load_model(result["model_path"])
        y_pred_s = model.predict(pipeline.X_test, verbose=0)
        y_pred_h = pipeline.scaler_y.inverse_transform(y_pred_s.reshape(-1,1)).flatten()
        y_true_h = pipeline.scaler_y.inverse_transform(pipeline.y_test.reshape(-1,1)).flatten()
        n = min(200, len(y_true_h))
        predictions_data = {
            "y_true": [round(float(v), 2) for v in y_true_h[:n]],
            "y_pred": [round(float(v), 2) for v in y_pred_h[:n]],
            "errors": [round(float(abs(y_pred_h[i] - y_true_h[i])), 2) for i in range(n)],
            "mae_hours": round(float(result.get("mae_hours", 0)), 2),
            "r2_score":  round(float(result.get("r2_score", 0)), 4),
        }

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


# ── WebSocket Entraînement ───────────────────────────────────
@app.websocket("/ws/{experiment_id}")
async def websocket_training(websocket: WebSocket, experiment_id: int):
    await manager.connect_training(experiment_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_training(experiment_id)


# ── WebSocket Ingestion ──────────────────────────────────────
@app.websocket("/ws/ingest")
async def websocket_ingestion(websocket: WebSocket):
    await manager.connect_ingestion(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_ingestion()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
