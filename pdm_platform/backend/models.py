from sqlalchemy import create_engine, Column, Integer, String, Float, JSON, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import enum

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
    __tablename__ = "experiments"
    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(200), nullable=False)
    architecture     = Column(String(50), nullable=False)
    mode             = Column(String(20), nullable=False)
    machine_id       = Column(Integer, default=99)
    hyperparameters  = Column(JSON, nullable=True)
    search_space     = Column(JSON, nullable=True)
    r2_score         = Column(Float, nullable=True)
    mae              = Column(Float, nullable=True)
    rmse             = Column(Float, nullable=True)
    mae_hours        = Column(Float, nullable=True)
    training_history = Column(JSON, nullable=True)
    best_trial_id    = Column(Integer, nullable=True)
    total_trials     = Column(Integer, nullable=True)
    cv_folds         = Column(Integer, default=5)
    model_path       = Column(String(500), nullable=True)
    scaler_x_path    = Column(String(500), nullable=True)
    scaler_y_path    = Column(String(500), nullable=True)
    status           = Column(String(20), default=TrainingStatus.PENDING)
    error_message    = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    duration_sec     = Column(Float, nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "architecture": self.architecture,
            "mode": self.mode, "machine_id": self.machine_id,
            "hyperparameters": self.hyperparameters, "search_space": self.search_space,
            "r2_score": self.r2_score, "mae": self.mae, "rmse": self.rmse,
            "mae_hours": self.mae_hours, "training_history": self.training_history,
            "best_trial_id": self.best_trial_id, "total_trials": self.total_trials,
            "cv_folds": self.cv_folds, "model_path": self.model_path,
            "scaler_x_path": self.scaler_x_path, "scaler_y_path": self.scaler_y_path,
            "status": self.status, "error_message": self.error_message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "duration_sec": self.duration_sec,
        }

class DataIngestionLog(Base):
    __tablename__ = "data_ingestion_logs"
    id             = Column(Integer, primary_key=True, index=True)
    status         = Column(String(20), default="pending")
    telemetry_rows = Column(Integer, nullable=True)
    machines_count = Column(Integer, nullable=True)
    failures_count = Column(Integer, nullable=True)
    errors_count   = Column(Integer, nullable=True)
    maint_count    = Column(Integer, nullable=True)
    merged_rows    = Column(Integer, nullable=True)
    features_count = Column(Integer, nullable=True)
    data_path      = Column(String(500), nullable=True)
    message        = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id, "status": self.status,
            "telemetry_rows": self.telemetry_rows, "machines_count": self.machines_count,
            "failures_count": self.failures_count, "errors_count": self.errors_count,
            "maint_count": self.maint_count, "merged_rows": self.merged_rows,
            "features_count": self.features_count, "message": self.message,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
