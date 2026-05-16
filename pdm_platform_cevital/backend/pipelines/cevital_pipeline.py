"""
cevital_pipeline.py — Squelette du pipeline Cevital (Phase 0).

⚠️ Cette version est un SQUELETTE déposé en Phase 0.
   Le pipeline réel (logique métier complète du notebook) sera collé
   ici en Phase 1 (Tâche 1.1 de ROADMAP_CEVITAL_partie2.md).

But du squelette : permettre au backend de démarrer sans erreur après
suppression de l'ancien `pipeline.py` (Azure), et fournir une structure
de méthodes que les routes pourront déjà importer.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from .base import BasePipeline


class CevitalPipeline(BasePipeline):
    """Pipeline GMAO Cevital — Régression RUL (jours) — SQUELETTE Phase 0."""

    PIPELINE_ID = "cevital"
    PIPELINE_NAME = "CEVITAL GMAO"
    PIPELINE_DESCRIPTION = (
        "Pipeline GMAO CEVITAL — Régression RUL (jours) basé sur les données "
        "failure + equipment. Inclut embedding composant et séquençage pondéré. "
        "[SQUELETTE Phase 0 — implémentation réelle en Phase 1]"
    )

    # Colonnes attendues (figées par le notebook) — utiles dès Phase 0 pour
    # que d'autres modules (visualiseur, tests) puissent référencer la liste.
    FEATURE_COLS: List[str] = [
        "comp_level",
        "pannes_7j", "pannes_30j", "pannes_90j",
        "maint_7j",  "maint_30j",  "maint_90j",
        "DSLF",      "DSLM",
    ]
    TARGET_COL = "RUL"
    COMP_COL   = "failure_comp"

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        super().__init__(config)
        cfg = self.config
        self.year         = cfg.get("year", 2023)
        self.min_failures = cfg.get("min_failures", 2)
        self.alert_days   = cfg.get("alert_days", 10)
        self.random_state = cfg.get("random_state", 42)

        # Placeholders pour les tenseurs et scalers — remplis en Phase 1
        self.X_train_num:  Optional[np.ndarray] = None
        self.X_train_comp: Optional[np.ndarray] = None
        self.X_test_num:   Optional[np.ndarray] = None
        self.X_test_comp:  Optional[np.ndarray] = None
        self.y_train:      Optional[np.ndarray] = None
        self.y_test:       Optional[np.ndarray] = None
        self.w_train:      Optional[np.ndarray] = None
        self.w_test:       Optional[np.ndarray] = None
        self.scaler_x = None
        self.scaler_y = None
        self.num_classes_comp: int = 0
        self.lookback: int = 30
        self.current_max_rul: int = 30

    # ─── Stubs des méthodes principales (implémentation Phase 1) ──
    def load_raw_data(self, failure_path: str, equipment_path: str) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def compute_eda_raw(self) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def compute_features(self) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def compute_eda_features(self) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def prepare_sequences(
        self,
        lookback: int = 30,
        current_max_rul: int = 30,
        test_ratio: float = 0.20,
        weight_factor: float = 15.0,
        healthy_sample_frac: float = 0.30,
    ) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def predict_with_safety(self, model, X_num, X_comp, current_max_rul=None):
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def merge_new_data(self, new_failure_csv: str) -> Dict[str, Any]:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def export_dataset_v1(self, output_path: str) -> str:
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    def get_test_dataframe(self):
        raise NotImplementedError("Implémentation Phase 1 — Tâche 1.1.")

    # ─── Implémentation du contrat BasePipeline ────────────────
    def get_info(self) -> Dict[str, Any]:
        return {
            "id":               self.PIPELINE_ID,
            "name":             self.PIPELINE_NAME,
            "description":      self.PIPELINE_DESCRIPTION,
            "is_ready":         self.is_ready,
            "phases_done":      self.phases_completed,
            "year":             self.year,
            "min_failures":     self.min_failures,
            "current_max_rul":  self.current_max_rul,
            "lookback":         self.lookback,
            "num_classes_comp": self.num_classes_comp,
            "skeleton":         True,   # Phase 0 marker
        }
