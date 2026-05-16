"""
models.py — Schéma BDD (SQLAlchemy + SQLite).

État Phase 0 :
  - `Experiment` est conservé tel quel (champs Azure encore présents pour
    compatibilité ascendante) mais sera étendu / remanié en Phase 1
    (ajout `Dataset`, `hyperparams JSON`, `dataset_id`, `f1_score`, `mape`,
    `precision`, `recall`, `model_dir`, etc.).
  - `DataIngestionLog` retiré (les routes Azure d'ingestion ont disparu).
  - La BDD `pdm_experiments.db` a été supprimée en Phase 0 — sera recréée
    vierge au premier démarrage via `init_db()`.
"""
from datetime import datetime

from sqlalchemy import (
    create_engine, Column, Integer, String, Float, JSON, DateTime, Text,
)
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./pdm_experiments.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class TrainingStatus:
    PENDING   = "pending"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"


class Experiment(Base):
    """
    Une expérience d'entraînement.

    ⚠️ Phase 0 : conserve le schéma actuel pour ne pas casser l'import.
    ⚠️ Phase 1 : ce modèle sera étendu (dataset_id, hyperparams JSON,
                 f1_score, precision, recall, mape, model_dir, …) et
                 certains champs Azure (machine_id, mae_hours) supprimés.
    """
    __tablename__ = "experiments"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(200), nullable=False)
    architecture     = Column(String(50), nullable=False)
    mode             = Column(String(20), nullable=False)
    machine_id       = Column(Integer, default=99)   # ⚠️ Azure legacy — retiré en Phase 1
    hyperparameters  = Column(JSON, nullable=True)
    search_space     = Column(JSON, nullable=True)
    r2_score         = Column(Float, nullable=True)
    mae              = Column(Float, nullable=True)
    rmse             = Column(Float, nullable=True)
    mae_hours        = Column(Float, nullable=True)  # ⚠️ Azure legacy (devient mae_days en Phase 1)
    training_history = Column(JSON, nullable=True)
    best_trial_id    = Column(Integer, nullable=True)
    total_trials     = Column(Integer, nullable=True)
    cv_folds         = Column(Integer, default=5)
    model_path       = Column(String(500), nullable=True)
    scaler_x_path    = Column(String(500), nullable=True)  # ⚠️ Azure legacy
    scaler_y_path    = Column(String(500), nullable=True)  # ⚠️ Azure legacy
    status           = Column(String(20), default=TrainingStatus.PENDING)
    error_message    = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    duration_sec     = Column(Float, nullable=True)

    def to_dict(self):
        return {
            "id":               self.id,
            "name":             self.name,
            "architecture":     self.architecture,
            "mode":             self.mode,
            "machine_id":       self.machine_id,
            "hyperparameters":  self.hyperparameters,
            "search_space":     self.search_space,
            "r2_score":         self.r2_score,
            "mae":              self.mae,
            "rmse":             self.rmse,
            "mae_hours":        self.mae_hours,
            "training_history": self.training_history,
            "best_trial_id":    self.best_trial_id,
            "total_trials":     self.total_trials,
            "cv_folds":         self.cv_folds,
            "model_path":       self.model_path,
            "scaler_x_path":    self.scaler_x_path,
            "scaler_y_path":    self.scaler_y_path,
            "status":           self.status,
            "error_message":    self.error_message,
            "created_at":       self.created_at.isoformat() if self.created_at else None,
            "updated_at":       self.updated_at.isoformat() if self.updated_at else None,
            "duration_sec":     self.duration_sec,
        }


def init_db():
    """Crée la BDD si absente — Phase 0 = vierge, Phase 1 redéfinit le schéma."""
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
