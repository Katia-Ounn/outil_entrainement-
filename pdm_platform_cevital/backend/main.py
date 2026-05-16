"""
main.py — Serveur FastAPI (Phase 0 — lean, post-suppression Azure).

État après Phase 0 :
  ✅ Routes démos (RNN / LSTM / Transformer) — autonomes via synthetic_data
  ✅ Routes pipelines registry (liste des pipelines disponibles)
  ✅ Routes experiments read-only (BDD vierge en sortie Phase 0)
  ✅ WebSocket scaffolding (entraînement + ingestion / préparation)
  ⏳ Routes datasets / EDA / features / preprocessing / training : Phase 1
  ⏳ Routes export ZIP : Phase 5

Les routes Azure (ingestion telemetry, EDA Machine 99, train_manual/auto avec
machine_id) ont été retirées. Elles seront remplacées par leurs équivalents
Cevital en Phase 1 (basés sur le vrai CevitalPipeline).
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import List, Optional

from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect,
    Depends, HTTPException, BackgroundTasks,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

# ─── BDD ────────────────────────────────────────────────────────
from models import (
    init_db, get_db, Experiment, TrainingStatus,
)

# ─── Architecture en plugins ────────────────────────────────────
from pipelines import CevitalPipeline, PIPELINE_REGISTRY
from pipelines.registry import list_pipelines

# ─── Démos pédagogiques (autonomes, mini-dataset synthétique) ───
from demos import get_synthetic_pipeline
from demos.rnn_demo         import run_demo as run_rnn_demo
from demos.lstm_demo        import run_demo as run_lstm_demo
from demos.transformer_demo import run_demo as run_transformer_demo


# ─── Dossiers ───────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
DATASETS_DIR = os.path.join(BASE_DIR, "datasets")
MODELS_DIR   = os.path.join(BASE_DIR, "models")
EXPORTS_DIR  = os.path.join(BASE_DIR, "exports")
for _d in (DATASETS_DIR, MODELS_DIR, EXPORTS_DIR):
    os.makedirs(_d, exist_ok=True)


# ─── FastAPI ────────────────────────────────────────────────────
app = FastAPI(
    title="Plateforme PdM Cevital — PFE Master 2",
    description="Maintenance prédictive Cevital (RUL en jours) + démos pédagogiques.",
    version="3.0.0-phase0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


# ═══════════════════════════════════════════════════════════════
# Gestionnaire WebSocket — supporte training + préparation / ingestion
# ═══════════════════════════════════════════════════════════════
class ConnectionManager:
    def __init__(self):
        self.training:  dict[int, WebSocket] = {}
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


manager = ConnectionManager()


# ═══════════════════════════════════════════════════════════════
# Health + métadonnées
# ═══════════════════════════════════════════════════════════════
@app.get("/health")
def health_check():
    return {
        "status":   "ok",
        "phase":    "0",
        "version":  app.version,
        "ts":       datetime.utcnow().isoformat(),
    }


@app.get("/api/pipelines")
def get_pipelines():
    """Liste les pipelines disponibles (mono-pipeline en Partie 2 = Cevital)."""
    return {
        "pipelines": list_pipelines(),
        "default":   CevitalPipeline.PIPELINE_ID,
    }


# ═══════════════════════════════════════════════════════════════
# Experiments — read-only en Phase 0 (CRUD complet en Phase 1)
# ═══════════════════════════════════════════════════════════════
@app.get("/api/experiments")
def list_experiments(db: Session = Depends(get_db)):
    rows = db.query(Experiment).order_by(Experiment.created_at.desc()).all()
    return [exp.to_dict() for exp in rows]


@app.get("/api/experiments/{exp_id}")
def get_experiment(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment introuvable")
    return exp.to_dict()


@app.delete("/api/experiments/{exp_id}")
def delete_experiment(exp_id: int, db: Session = Depends(get_db)):
    exp = db.query(Experiment).filter(Experiment.id == exp_id).first()
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment introuvable")
    db.delete(exp)
    db.commit()
    return {"deleted": exp_id}


# ═══════════════════════════════════════════════════════════════
# Routes Cevital — stubs Phase 0 (vraie implémentation en Phase 1+)
# ═══════════════════════════════════════════════════════════════
_PHASE1_MSG = (
    "Cette route sera implémentée en Phase 1 (voir ROADMAP_CEVITAL_partie2.md). "
    "Phase 0 = scaffolding architecture + theme switcher."
)
_PHASE5_MSG = "Export ZIP — implémentation prévue en Phase 5."


def _phase_stub(msg: str = _PHASE1_MSG):
    raise HTTPException(status_code=501, detail=msg)


# --- Datasets (Phase 1) ---
@app.get("/api/datasets", status_code=501)
def _datasets_list():
    _phase_stub()


@app.post("/api/datasets/upload", status_code=501)
def _datasets_upload():
    _phase_stub()


@app.get("/api/datasets/{dataset_id}", status_code=501)
def _datasets_get(dataset_id: int):
    _phase_stub()


@app.delete("/api/datasets/{dataset_id}", status_code=501)
def _datasets_delete(dataset_id: int):
    _phase_stub()


@app.post("/api/datasets/{dataset_id}/eda_raw", status_code=501)
def _datasets_eda_raw(dataset_id: int):
    _phase_stub()


@app.post("/api/datasets/{dataset_id}/features", status_code=501)
def _datasets_features(dataset_id: int):
    _phase_stub()


@app.post("/api/datasets/{dataset_id}/eda_features", status_code=501)
def _datasets_eda_feat(dataset_id: int):
    _phase_stub()


@app.post("/api/datasets/{dataset_id}/preprocessing", status_code=501)
def _datasets_preproc(dataset_id: int):
    _phase_stub()


@app.post("/api/datasets/{dataset_id}/merge", status_code=501)
def _datasets_merge(dataset_id: int):
    _phase_stub()


@app.get("/api/datasets/{dataset_id}/download_v1", status_code=501)
def _datasets_download(dataset_id: int):
    _phase_stub()


# --- Training (Phase 1 / Phase 3) ---
@app.post("/api/train/manual", status_code=501)
def _train_manual():
    _phase_stub()


@app.post("/api/train/auto", status_code=501)
def _train_auto():
    _phase_stub()


@app.post("/api/experiments/{exp_id}/retrain", status_code=501)
def _experiments_retrain(exp_id: int):
    _phase_stub()


@app.get("/api/experiments/{exp_id}/details", status_code=501)
def _experiments_details(exp_id: int):
    _phase_stub()


@app.get("/api/experiments/{exp_id}/recompute_classification", status_code=501)
def _experiments_recompute(exp_id: int):
    _phase_stub()


# --- Export ZIP (Phase 5) ---
@app.get("/api/experiments/{exp_id}/export", status_code=501)
def _experiments_export(exp_id: int):
    _phase_stub(_PHASE5_MSG)


# ═══════════════════════════════════════════════════════════════
# 🧪 DÉMOS PÉDAGOGIQUES — autonomes via mini-dataset synthétique
# ═══════════════════════════════════════════════════════════════
class RNNDemoRequest(BaseModel):
    layers:        List[int] = Field([4], description="1 à 3 couches, 2 à 16 unités chacune")
    batch_size:    int   = Field(4,   ge=2, le=8)
    seq_length:    int   = Field(3,   ge=2, le=6)
    learning_rate: float = Field(0.1, gt=0.0, le=1.0)
    seed:          int   = Field(7)


@app.post("/api/rnn_demo/run")
def rnn_demo_run(req: RNNDemoRequest):
    """Démo RNN pas-à-pas sur un mini-dataset synthétique pédagogique."""
    try:
        pipeline = get_synthetic_pipeline()

        if not (1 <= len(req.layers) <= 3):
            raise ValueError("Entre 1 et 3 couches supportées")
        if not all(2 <= u <= 16 for u in req.layers):
            raise ValueError("Chaque couche doit avoir entre 2 et 16 neurones")

        return run_rnn_demo(
            pipeline      = pipeline,
            layers        = req.layers,
            batch_size    = req.batch_size,
            seq_length    = req.seq_length,
            learning_rate = req.learning_rate,
            seed          = req.seed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur démo RNN : {e}")


class LSTMDemoRequest(BaseModel):
    layers:        List[int] = Field([4], description="1 à 3 couches LSTM, 2 à 16 unités")
    batch_size:    int   = Field(4,   ge=2, le=8)
    seq_length:    int   = Field(3,   ge=2, le=6)
    learning_rate: float = Field(0.1, gt=0.0, le=1.0)
    seed:          int   = Field(7)


@app.post("/api/lstm_demo/run")
def lstm_demo_run(req: LSTMDemoRequest):
    """Démo LSTM pas-à-pas : 4 portes + cell state, mini-dataset synthétique."""
    try:
        pipeline = get_synthetic_pipeline()

        if not (1 <= len(req.layers) <= 3):
            raise ValueError("Entre 1 et 3 couches supportées")
        if not all(2 <= u <= 16 for u in req.layers):
            raise ValueError("Chaque couche doit avoir entre 2 et 16 neurones")

        return run_lstm_demo(
            pipeline      = pipeline,
            layers        = req.layers,
            batch_size    = req.batch_size,
            seq_length    = req.seq_length,
            learning_rate = req.learning_rate,
            seed          = req.seed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur démo LSTM : {e}")


class TransformerDemoRequest(BaseModel):
    d_model:       int   = Field(8,  ge=4, le=32)
    n_heads:       int   = Field(2,  ge=1, le=4)
    d_ff:          int   = Field(16, ge=8, le=64)
    batch_size:    int   = Field(4,  ge=2, le=8)
    seq_length:    int   = Field(3,  ge=2, le=6)
    learning_rate: float = Field(0.01, gt=0.0, le=1.0)
    seed:          int   = Field(7)


@app.post("/api/transformer_demo/run")
def transformer_demo_run(req: TransformerDemoRequest):
    """Démo Transformer pas-à-pas : encoder + decoder + multi-head attention."""
    try:
        pipeline = get_synthetic_pipeline()

        if req.n_heads not in [1, 2, 4]:
            raise ValueError("Nombre de têtes : 1, 2 ou 4")
        if req.d_model % req.n_heads != 0:
            raise ValueError(f"d_model ({req.d_model}) doit être divisible par n_heads ({req.n_heads})")

        return run_transformer_demo(
            pipeline      = pipeline,
            d_model       = req.d_model,
            n_heads       = req.n_heads,
            d_ff          = req.d_ff,
            batch_size    = req.batch_size,
            seq_length    = req.seq_length,
            learning_rate = req.learning_rate,
            seed          = req.seed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur démo Transformer : {e}")


# ═══════════════════════════════════════════════════════════════
# WebSockets — scaffolding conservé pour Phase 1 / Phase 3
# ═══════════════════════════════════════════════════════════════
@app.websocket("/ws/ingestion")
async def websocket_ingestion(websocket: WebSocket):
    await manager.connect_ingestion(websocket)
    try:
        await websocket.send_json({
            "type":    "info",
            "message": "Scaffolding WS prêt (préparation / ingestion). "
                       "Implémentation Phase 1 — ROADMAP.",
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_ingestion()


@app.websocket("/ws/{experiment_id}")
async def websocket_training(websocket: WebSocket, experiment_id: int):
    await manager.connect_training(experiment_id, websocket)
    try:
        await websocket.send_json({
            "type":    "info",
            "message": f"Scaffolding WS prêt pour exp {experiment_id}. "
                       f"Entraînement Cevital implémenté en Phase 3.",
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_training(experiment_id)
