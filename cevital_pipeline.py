"""
cevital_pipeline.py
═══════════════════════════════════════════════════════════════════════════
Pipeline complet CEVITAL — Conversion exacte du notebook Pipeline_PFE_Cevital_CHAMPION.ipynb

Auteur     : PFE Master 2 Génie Logiciel
Cible ML   : Régression RUL (Remaining Useful Life) en JOURS
Entrées    : failure1.csv + equipment_clean.csv
Sortie     : Dataset_V1 (23 colonnes) + tenseurs LSTM/GRU prêts (avec embedding composant)

PHASES :
  Phase 1 : EDA Brute (failure1.csv)              → compute_eda_raw()
  Phase 2 : Feature Engineering (8 étapes)        → compute_features()
  Phase 3 : EDA Features Créées                   → compute_eda_features()
  Phase 4 : Prétraitement LSTM (avec current_max_rul dynamique) → prepare_sequences()
  Bonus   : Fusion temporelle de datasets         → merge_new_data()
  Bonus   : Prédiction sécurisée                  → predict_with_safety()
═══════════════════════════════════════════════════════════════════════════
"""
from __future__ import annotations
import os
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler

warnings.filterwarnings("ignore")


class CevitalPipeline:
    """
    Pipeline complet pour les données GMAO Cevital.
    Toutes les étapes du notebook PFE sont encapsulées ici.

    Utilisation typique :
        pipe = CevitalPipeline(config={"year": 2023, "min_failures": 2})
        pipe.load_raw_data("failure1.csv", "equipment_clean.csv")
        eda_raw = pipe.compute_eda_raw()
        feat_info = pipe.compute_features()
        eda_feat = pipe.compute_eda_features()
        seq_info = pipe.prepare_sequences(lookback=30, current_max_rul=30)
        # → utiliser pipe.X_train, pipe.y_train, pipe.w_train, etc.
    """

    PIPELINE_ID = "cevital"
    PIPELINE_NAME = "CEVITAL GMAO"
    PIPELINE_DESCRIPTION = (
        "Pipeline GMAO CEVITAL — Régression RUL (jours) basé sur les données "
        "failure + equipment. Inclut embedding composant et séquençage pondéré."
    )

    # Features utilisées pour le modèle LSTM/GRU (NE PAS toucher l'ordre)
    FEATURE_COLS = [
        "comp_level",
        "pannes_7j", "pannes_30j", "pannes_90j",
        "maint_7j",  "maint_30j",  "maint_90j",
        "DSLF",      "DSLM",
    ]

    TARGET_COL  = "RUL"
    COMP_COL    = "failure_comp"

    # Colonnes du Dataset_V1 (fichier final exporté)
    EXPORT_COLS = [
        "date", "machineID_num", "machineID", "machineID_level",
        "comp_num", "failure_comp", "comp_level",
        "failure", "maintenance",
        "pannes_7j", "pannes_30j", "pannes_90j",
        "maint_7j", "maint_30j", "maint_90j",
        "DSLF", "DSLM", "MTBF_rolling", "has_mtbf",
        "month_sin", "month_cos", "dslf_mtbf_ratio",
        "RUL",
    ]

    def __init__(self, config: Optional[Dict] = None):
        cfg = config or {}
        # Paramètres pilotés depuis l'extérieur (UI ou main.py)
        self.year         = cfg.get("year", 2023)
        self.min_failures = cfg.get("min_failures", 2)
        self.alert_days   = cfg.get("alert_days", 10)
        self.random_state = cfg.get("random_state", 42)

        # ─── État ────────────────────────────────────────────────
        self.df_fail:    Optional[pd.DataFrame] = None  # raw failure.csv
        self.df_equip:   Optional[pd.DataFrame] = None  # raw equipment.csv
        self.df_panel:   Optional[pd.DataFrame] = None  # après panel composant × jour
        self.df_rul:     Optional[pd.DataFrame] = None  # après calcul RUL
        self.df_final:   Optional[pd.DataFrame] = None  # après feature engineering
        self.df_export:  Optional[pd.DataFrame] = None  # Dataset_V1 exporté

        # ─── Tenseurs LSTM/GRU (après prepare_sequences) ────────
        self.X_train_num: Optional[np.ndarray] = None  # (n, lookback, n_features)
        self.X_train_comp: Optional[np.ndarray] = None # (n,) indices composant
        self.X_test_num:  Optional[np.ndarray] = None
        self.X_test_comp: Optional[np.ndarray] = None
        self.y_train:     Optional[np.ndarray] = None
        self.y_test:      Optional[np.ndarray] = None
        self.w_train:     Optional[np.ndarray] = None  # sample_weights
        self.w_test:      Optional[np.ndarray] = None

        # ─── Scalers et métadonnées ─────────────────────────────
        self.scaler_x: Optional[MinMaxScaler] = None
        self.scaler_y: Optional[MinMaxScaler] = None
        self.num_classes_comp: int = 0
        self.lookback: int = 30
        self.current_max_rul: int = 30  # NOUVEAU : variable pilotée par UI

        # ─── État global ─────────────────────────────────────────
        self.is_ready: bool = False
        self.phases_completed: List[str] = []

    # ═══════════════════════════════════════════════════════════════
    # PHASE 1 — CHARGEMENT + EDA BRUTE
    # ═══════════════════════════════════════════════════════════════
    def load_raw_data(self, failure_path: str, equipment_path: str) -> Dict:
        """
        Charge les deux CSV nécessaires : failure et equipment.
        Retourne les métadonnées (nb lignes, période, etc.).
        """
        if not Path(failure_path).exists():
            raise FileNotFoundError(f"Fichier introuvable : {failure_path}")
        if not Path(equipment_path).exists():
            raise FileNotFoundError(f"Fichier introuvable : {equipment_path}")

        self.df_fail = pd.read_csv(failure_path, encoding="utf-8-sig")
        self.df_equip = pd.read_csv(equipment_path, encoding="utf-8-sig")

        # Conversion dates
        for col in ["WOWO_DECLARATION_DATE", "WOWO_END_DATE", "WOWO_CREATION_DATE"]:
            if col in self.df_fail.columns:
                self.df_fail[col] = pd.to_datetime(self.df_fail[col], errors="coerce")

        # Année + mois + durée (utiles pour l'EDA)
        self.df_fail["annee"] = self.df_fail["WOWO_DECLARATION_DATE"].dt.year
        self.df_fail["mois"]  = self.df_fail["WOWO_DECLARATION_DATE"].dt.month
        self.df_fail["duree"] = (
            self.df_fail["WOWO_END_DATE"] - self.df_fail["WOWO_DECLARATION_DATE"]
        ).dt.days

        self.phases_completed.append("load_raw_data")

        return {
            "failure_n_rows":   int(len(self.df_fail)),
            "failure_n_cols":   int(len(self.df_fail.columns)),
            "equipment_n_rows": int(len(self.df_equip)),
            "year_filter":      int(self.year),
            "date_min": self.df_fail["WOWO_DECLARATION_DATE"].min().isoformat()
                        if self.df_fail["WOWO_DECLARATION_DATE"].notna().any() else None,
            "date_max": self.df_fail["WOWO_DECLARATION_DATE"].max().isoformat()
                        if self.df_fail["WOWO_DECLARATION_DATE"].notna().any() else None,
            "n_failures_year":  int((self.df_fail["annee"] == self.year).sum()),
        }

    def compute_eda_raw(self) -> Dict:
        """
        Phase 1 : EDA sur les données brutes (failure1.csv).
        Reproduit les analyses du notebook (sections 1.1 à 1.6).
        Retourne un dict avec les stats prêtes pour visualisation côté frontend.
        """
        if self.df_fail is None:
            raise RuntimeError("Charge d'abord les données avec load_raw_data()")

        df = self.df_fail
        df23 = df[df["annee"] == self.year].copy()
        df34 = df23[df23["WOWO_EQUIPMENT_LEVEL"].isin([3.0, 4.0])].copy()

        # ── Section 1 : Qualité des données ─────────────────────
        cols_utiles = [
            "WOWO_DECLARATION_DATE", "WOWO_END_DATE", "WOWO_EQUIPMENT",
            "WOWO_EQUIPMENT_LEVEL", "failure_parent_code", "failure_parent_level",
            "WOWO_JOB_CLASS", "WOWO_TOTAL_COST",
        ]
        existing_cols = [c for c in cols_utiles if c in df.columns]
        missing = df[existing_cols].isnull().sum().astype(int).to_dict()
        missing_pct = (df[existing_cols].isnull().mean() * 100).round(1).to_dict()

        # ── Section 2 : Distribution par niveau hiérarchique ───
        niveau_dist = df23["WOWO_EQUIPMENT_LEVEL"].value_counts().sort_index().to_dict()
        niveau_dist = {str(k): int(v) for k, v in niveau_dist.items()}

        # ── Section 3 : Distribution temporelle ─────────────────
        pannes_par_mois = df34.groupby("mois").size().reindex(range(1, 13), fill_value=0)
        pannes_mensuel = [int(v) for v in pannes_par_mois.values]

        # Niveaux séparés
        nv3_mois = df23[df23["WOWO_EQUIPMENT_LEVEL"] == 3.0].groupby("mois").size().reindex(range(1, 13), fill_value=0)
        nv4_mois = df23[df23["WOWO_EQUIPMENT_LEVEL"] == 4.0].groupby("mois").size().reindex(range(1, 13), fill_value=0)

        # Pannes cumulées
        df34_sorted = df34.sort_values("WOWO_DECLARATION_DATE")
        df34_sorted = df34_sorted.copy()
        df34_sorted["cumul"] = range(1, len(df34_sorted) + 1)
        cumul_dates = df34_sorted["WOWO_DECLARATION_DATE"].dt.strftime("%Y-%m-%d").tolist()
        cumul_values = df34_sorted["cumul"].tolist()

        # ── Section 4 : Top composants ──────────────────────────
        top_composants = (df34["WOWO_EQUIPMENT"]
                          .value_counts()
                          .head(15)
                          .to_dict())
        top_composants = {str(k): int(v) for k, v in top_composants.items()}

        # ── Section 5 : Type maintenance + coût ─────────────────
        if "WOWO_JOB_CLASS" in df34.columns:
            job_class_dist = df34["WOWO_JOB_CLASS"].value_counts().to_dict()
            job_class_dist = {str(k): int(v) for k, v in job_class_dist.items()}
        else:
            job_class_dist = {}

        cout_stats = {}
        if "WOWO_TOTAL_COST" in df34.columns:
            cost_clean = pd.to_numeric(df34["WOWO_TOTAL_COST"], errors="coerce").dropna()
            if len(cost_clean) > 0:
                cout_stats = {
                    "mean":   float(cost_clean.mean()),
                    "median": float(cost_clean.median()),
                    "max":    float(cost_clean.max()),
                    "total":  float(cost_clean.sum()),
                    "count":  int(len(cost_clean)),
                }

        # ── Section 6 : Durée réparation ────────────────────────
        duree_stats = {}
        duree_clean = df34["duree"].dropna()
        if len(duree_clean) > 0:
            duree_stats = {
                "mean":   float(duree_clean.mean()),
                "median": float(duree_clean.median()),
                "max":    float(duree_clean.max()),
                "p95":    float(duree_clean.quantile(0.95)),
                "count":  int(len(duree_clean)),
            }

        self.phases_completed.append("compute_eda_raw")

        return {
            "overview": {
                "total_ot":            int(len(df)),
                "total_ot_year":       int(len(df23)),
                "total_ot_niveaux_34": int(len(df34)),
                "composants_uniques":  int(df34["WOWO_EQUIPMENT"].nunique()),
                "machines_meres":      int(df34["WOWO_SYSTEM_EQUIPMENT"].nunique()),
            },
            "quality": {
                "missing":     missing,
                "missing_pct": missing_pct,
                "total_rows":  int(len(df)),
            },
            "niveau_distribution":  niveau_dist,
            "pannes_mensuel":       pannes_mensuel,
            "pannes_mensuel_niv3":  [int(v) for v in nv3_mois.values],
            "pannes_mensuel_niv4":  [int(v) for v in nv4_mois.values],
            "pannes_cumulees": {
                "dates":  cumul_dates[:500],  # limite pour ne pas exploser le JSON
                "values": cumul_values[:500],
            },
            "top_composants":  top_composants,
            "job_class_dist":  job_class_dist,
            "cout_stats":      cout_stats,
            "duree_stats":     duree_stats,
        }

    # ═══════════════════════════════════════════════════════════════
    # PHASE 2 — FEATURE ENGINEERING (8 ÉTAPES)
    # ═══════════════════════════════════════════════════════════════
    def compute_features(self) -> Dict:
        """
        Phase 2 : Création des features dérivées (Dataset_V1).
        Suit fidèlement les 8 étapes du notebook (cellules 19-37).
        """
        if self.df_fail is None or self.df_equip is None:
            raise RuntimeError("Charge d'abord les données avec load_raw_data()")

        df_fail  = self.df_fail
        df_equip = self.df_equip

        # ───────────────── ÉTAPE 2 : Filtrage année ─────────────────
        df_fail_year = df_fail[
            df_fail["WOWO_DECLARATION_DATE"].dt.year == self.year
        ].copy()

        # ───────────── ÉTAPE 3 : Hiérarchie machineID ───────────────
        eq_dict = df_equip.set_index("EREQ_CODE")[
            ["EREQ_LEVEL", "EREQ_PARENT_EQUIPMENT", "EREQ_DESCRIPTION"]
        ].to_dict("index")

        def get_machineID(comp_code, comp_level, parent_code, parent_level):
            if comp_level in [1, 2]:
                return None, None
            if comp_level == 3:
                if pd.notna(parent_level) and int(parent_level) == 2:
                    desc = eq_dict.get(parent_code, {}).get("EREQ_DESCRIPTION", "")
                    return parent_code, desc
                return None, None
            if comp_level == 4:
                if pd.isna(parent_code) or parent_code not in eq_dict:
                    return None, None
                grandparent = eq_dict[parent_code].get("EREQ_PARENT_EQUIPMENT")
                if pd.isna(grandparent) or grandparent not in eq_dict:
                    return None, None
                if eq_dict[grandparent]["EREQ_LEVEL"] == 2:
                    desc = eq_dict[grandparent].get("EREQ_DESCRIPTION", "")
                    return grandparent, desc
                return None, None
            return None, None

        result = df_fail_year.apply(
            lambda r: pd.Series(get_machineID(
                r["WOWO_EQUIPMENT"], r["WOWO_EQUIPMENT_LEVEL"],
                r["failure_parent_code"], r["failure_parent_level"]
            )), axis=1
        )
        df_fail_year[["machineID", "machineID_desc"]] = result
        fail_ok = df_fail_year[df_fail_year["machineID"].notna()].copy()

        # ──────────── ÉTAPE 4 : Sélection des composants ────────────
        comp_counts = fail_ok.groupby("WOWO_EQUIPMENT").size()
        comps_ok = comp_counts[comp_counts >= self.min_failures].index
        fail_ok = fail_ok[fail_ok["WOWO_EQUIPMENT"].isin(comps_ok)].copy()

        ref_comp = fail_ok.groupby("WOWO_EQUIPMENT").agg(
            machineID      = ("machineID", "first"),
            machineID_desc = ("machineID_desc", "first"),
            comp_desc      = ("WOWO_EQUIPMENT_DESCRIPTION", "first"),
            comp_level     = ("WOWO_EQUIPMENT_LEVEL", "first"),
            machine_root   = ("WOWO_SYSTEM_EQUIPMENT", "first"),
        ).reset_index().rename(columns={"WOWO_EQUIPMENT": "failure_comp"})

        all_comps = sorted(comps_ok)

        # ──────────── ÉTAPE 5 : Lookup maintenance V1 ───────────────
        fail_ok["maintenance_date"] = fail_ok["WOWO_END_DATE"]
        fail_ok["duree_reparation"] = (
            fail_ok["maintenance_date"] - fail_ok["WOWO_DECLARATION_DATE"]
        ).dt.days

        fail_lookup, maint_lookup_v1 = {}, {}
        for _, row in fail_ok.iterrows():
            comp = row["WOWO_EQUIPMENT"]
            fail_date = row["WOWO_DECLARATION_DATE"].date()
            maint_date = row["maintenance_date"].date()
            job_class = row.get("WOWO_JOB_CLASS", None)

            if comp not in fail_lookup:
                fail_lookup[comp] = {}
            fail_lookup[comp][fail_date] = job_class

            if comp not in maint_lookup_v1:
                maint_lookup_v1[comp] = set()
            maint_lookup_v1[comp].add(maint_date)

        # ──────────── ÉTAPE 6 : Panel composant × jour ──────────────
        timeline = pd.date_range(
            start=f"{self.year}-01-01",
            end  =f"{self.year}-12-31",
            freq ="D"
        )

        rows = []
        for comp in all_comps:
            r = ref_comp.set_index("failure_comp").loc[comp]
            fail_dates_c = fail_lookup.get(comp, {})
            maint_dates_c = maint_lookup_v1.get(comp, set())

            for day in timeline:
                d = day.date()
                rows.append({
                    "date":            day,
                    "machine_root":    r["machine_root"],
                    "machineID":       r["machineID"],
                    "machineID_desc":  r["machineID_desc"],
                    "failure_comp":    comp,
                    "comp_level":      r["comp_level"],
                    "comp_desc":       r["comp_desc"],
                    "failure":         1 if d in fail_dates_c else 0,
                    "WOWO_JOB_CLASS":  fail_dates_c.get(d, None),
                    "maintenance":    1 if d in maint_dates_c else 0,
                })

        df_panel = pd.DataFrame(rows)
        df_panel = df_panel.sort_values(["failure_comp", "date"]).reset_index(drop=True)
        self.df_panel = df_panel

        # ──────────── ÉTAPE 7 : Calcul du RUL V1 ────────────────────
        def calculate_rul_v1(df_comp):
            df_comp = df_comp.sort_values("date").copy().reset_index(drop=True)
            failure_dates = df_comp[df_comp["failure"] == 1]["date"].values
            maint_dates_arr = df_comp[df_comp["maintenance"] == 1]["date"].values
            if len(failure_dates) == 0:
                return pd.DataFrame()

            end_of_year = pd.Timestamp(f"{self.year}-12-31")
            ruls = []
            for _, row in df_comp.iterrows():
                d = row["date"]
                past_fails  = failure_dates[failure_dates <= d]
                past_maints = maint_dates_arr[maint_dates_arr <= d]

                if len(past_fails) > 0:
                    last_fail  = past_fails[-1]
                    last_maint = past_maints[-1] if len(past_maints) > 0 else None
                    if last_maint is None or last_fail > last_maint:
                        ruls.append(0)
                        continue

                future_fails = failure_dates[failure_dates > d]
                if len(future_fails) > 0:
                    rul = int((pd.Timestamp(future_fails[0]) - d).days)
                else:
                    rul = (end_of_year - d).days
                ruls.append(rul)

            df_comp["RUL"] = ruls
            return df_comp

        df_rul = df_panel.groupby("failure_comp", group_keys=False).apply(calculate_rul_v1)
        df_rul = df_rul.reset_index(drop=True)
        self.df_rul = df_rul

        # ──────────── ÉTAPE 8 : Feature Engineering ─────────────────
        def add_features(df_comp):
            df_comp = df_comp.sort_values("date").copy().reset_index(drop=True)

            # 1. Fenêtres roulantes
            for w in [7, 30, 90]:
                df_comp[f"pannes_{w}j"] = (
                    df_comp["failure"].shift(1).rolling(w, min_periods=0).sum().fillna(0).astype(int)
                )
                df_comp[f"maint_{w}j"] = (
                    df_comp["maintenance"].shift(1).rolling(w, min_periods=0).sum().fillna(0).astype(int)
                )

            # 2. DSLF (Days Since Last Failure)
            last_fail = pd.Timestamp(f"{self.year - 1}-12-31")
            dslf = []
            for _, row in df_comp.iterrows():
                if row["failure"] == 1:
                    last_fail = row["date"]
                dslf.append((row["date"] - last_fail).days)
            df_comp["DSLF"] = dslf

            # 3. DSLM (Days Since Last Maintenance)
            last_maint = pd.Timestamp(f"{self.year - 1}-12-31")
            dslm = []
            for _, row in df_comp.iterrows():
                if row["maintenance"] == 1:
                    last_maint = row["date"]
                dslm.append((row["date"] - last_maint).days)
            df_comp["DSLM"] = dslm

            # 4. MTBF rolling (moyenne sur 3 dernières pannes)
            mtbf_col, gap_list, last_fail_date, current_mtbf = [], [], None, np.nan
            for _, row in df_comp.iterrows():
                if row["failure"] == 1:
                    if last_fail_date is not None:
                        gap = (row["date"] - last_fail_date).days
                        gap_list.append(gap)
                        current_mtbf = round(sum(gap_list[-3:]) / len(gap_list[-3:]), 1)
                    last_fail_date = row["date"]
                mtbf_col.append(current_mtbf)
            df_comp["MTBF_rolling"] = mtbf_col
            df_comp["has_mtbf"] = df_comp["MTBF_rolling"].notna().astype(int)
            df_comp["MTBF_rolling"] = df_comp["MTBF_rolling"].fillna(0)

            # 5. Saisonnalité (encodage cyclique du mois)
            df_comp["month"] = df_comp["date"].dt.month
            df_comp["month_sin"] = np.sin(2 * np.pi * df_comp["month"] / 12)
            df_comp["month_cos"] = np.cos(2 * np.pi * df_comp["month"] / 12)

            # 6. Ratio DSLF / MTBF (feature dérivée)
            df_comp["dslf_mtbf_ratio"] = df_comp["DSLF"] / (df_comp["MTBF_rolling"] + 1)

            return df_comp

        df_final = df_rul.groupby("failure_comp", group_keys=False).apply(add_features)
        df_final = df_final.reset_index(drop=True)

        # ───── Numérotation et niveaux (pour visualisation) ─────────
        machine_ids = sorted(df_final["machineID"].unique())
        df_final["machineID_num"] = df_final["machineID"].map({m: i+1 for i, m in enumerate(machine_ids)})
        comp_ids = sorted(df_final["failure_comp"].unique())
        df_final["comp_num"] = df_final["failure_comp"].map({c: i+1 for i, c in enumerate(comp_ids)})
        df_final["machineID_level"] = 2

        self.df_final = df_final
        self.df_export = df_final[self.EXPORT_COLS].copy()

        self.phases_completed.append("compute_features")

        return {
            "n_rows":          int(len(self.df_export)),
            "n_failures":      int(self.df_export["failure"].sum()),
            "n_maintenances":  int(self.df_export["maintenance"].sum()),
            "n_composants":    int(self.df_export["failure_comp"].nunique()),
            "n_machines":      int(self.df_export["machineID"].nunique()),
            "n_features":      len(self.FEATURE_COLS),
            "feature_cols":    self.FEATURE_COLS,
            "period_start":    self.df_export["date"].min().isoformat(),
            "period_end":      self.df_export["date"].max().isoformat(),
            "rul_stats": {
                "min":    int(self.df_export["RUL"].min()),
                "max":    int(self.df_export["RUL"].max()),
                "mean":   float(self.df_export["RUL"].mean()),
                "median": float(self.df_export["RUL"].median()),
            },
            # Aperçu pour affichage frontend (premiers + lignes panne)
            "preview_panel":   self.df_panel.head(5).to_dict(orient="records"),
            "preview_final":   self.df_export.head(10).to_dict(orient="records"),
        }

    def export_dataset_v1(self, output_path: str) -> str:
        """Sauvegarde le Dataset_V1 final en CSV téléchargeable."""
        if self.df_export is None:
            raise RuntimeError("Lance compute_features() d'abord")
        self.df_export.to_csv(output_path, index=False, sep=";", encoding="utf-8-sig")
        return output_path

    # ═══════════════════════════════════════════════════════════════
    # PHASE 3 — EDA SUR LES FEATURES CRÉÉES
    # ═══════════════════════════════════════════════════════════════
    def compute_eda_features(self) -> Dict:
        """
        Phase 3 : Stats descriptives + distribution RUL + corrélations.
        Reproduit les analyses du notebook (sections 3.1-3.3).
        """
        if self.df_export is None:
            raise RuntimeError("Lance compute_features() d'abord")

        df = self.df_export

        # ── 3.1 Aperçu général ─────────────────────────────────
        overview = {
            "n_rows":     int(len(df)),
            "n_cols":     int(df.shape[1]),
            "n_comp":     int(df["failure_comp"].nunique()),
            "n_pannes":   int(df["failure"].sum()),
            "rul_zero":   int((df["RUL"] == 0).sum()),
            "rul_zero_pct": float((df["RUL"] == 0).mean() * 100),
            "period_start": df["date"].min().isoformat(),
            "period_end":   df["date"].max().isoformat(),
        }

        # Stats numériques
        num_cols = ["DSLF", "DSLM", "MTBF_rolling", "has_mtbf",
                    "month_sin", "month_cos", "dslf_mtbf_ratio", "RUL"]
        stats = df[num_cols].describe().T.round(3).to_dict(orient="index")
        # Sérialiser les Timestamp
        for col, st in stats.items():
            stats[col] = {k: float(v) for k, v in st.items()}

        # ── 3.2 Distribution du RUL ────────────────────────────
        rul_pos = df[df["RUL"] > 0]["RUL"]
        rul_hist, rul_bins = np.histogram(rul_pos, bins=50)

        # ECDF
        sorted_rul = np.sort(rul_pos.values)
        ecdf = (np.arange(1, len(sorted_rul) + 1) / len(sorted_rul)) * 100

        # Alerte / Sain
        alert_pct = float((df["RUL"] <= self.alert_days).mean() * 100)

        # ── 3.3 Corrélations features avec RUL ──────────────────
        feature_cols_full = ["failure", "maintenance",
                             "pannes_7j", "pannes_30j", "pannes_90j",
                             "maint_7j", "maint_30j", "maint_90j",
                             "DSLF", "DSLM", "MTBF_rolling", "has_mtbf",
                             "month_sin", "month_cos", "dslf_mtbf_ratio"]
        corr_matrix = df[feature_cols_full + ["RUL"]].corr().round(3)
        corr_with_rul = corr_matrix["RUL"].drop("RUL").to_dict()
        corr_with_rul = {k: float(v) for k, v in corr_with_rul.items()}

        # Matrice complète sérialisée
        corr_full = {
            row: {col: float(corr_matrix.loc[row, col]) for col in corr_matrix.columns}
            for row in corr_matrix.index
        }

        self.phases_completed.append("compute_eda_features")

        return {
            "overview":     overview,
            "stats":        stats,
            "rul_distribution": {
                "bins":   rul_bins.tolist(),
                "counts": rul_hist.tolist(),
                "mean":   float(rul_pos.mean()),
                "median": float(rul_pos.median()),
            },
            "ecdf": {
                "rul":  sorted_rul[::max(1, len(sorted_rul)//500)].tolist(),  # sample
                "pct":  ecdf[::max(1, len(ecdf)//500)].tolist(),
            },
            "alert_balance": {
                "alert_pct":    alert_pct,
                "healthy_pct":  100 - alert_pct,
                "threshold":    self.alert_days,
            },
            "corr_with_rul":  corr_with_rul,
            "corr_matrix":    corr_full,
        }

    # ═══════════════════════════════════════════════════════════════
    # PHASE 4 — PRÉTRAITEMENT LSTM/GRU (avec current_max_rul DYNAMIQUE)
    # ═══════════════════════════════════════════════════════════════
    def prepare_sequences(
        self,
        lookback:        int   = 30,
        current_max_rul: int   = 30,
        test_ratio:      float = 0.20,
        weight_factor:   float = 15.0,
        healthy_sample_frac: float = 0.30,
    ) -> Dict:
        """
        Phase 4 : Prétraitement LSTM/GRU complet (cellules 47-53).

        Args:
            lookback        : taille de la fenêtre temporelle (configurable UI)
            current_max_rul : plafond du RUL — pilotable depuis l'UI (NOUVEAU)
            test_ratio      : proportion test (0.20 par défaut)
            weight_factor   : amplification du poids sur les RUL faibles (×15 par défaut)
            healthy_sample_frac : proportion d'échantillons sains gardés (0.30 par défaut)
        """
        if self.df_export is None:
            raise RuntimeError("Lance compute_features() d'abord")

        df = self.df_export.copy()
        df = df.sort_values(["failure_comp", "date"]).reset_index(drop=True)

        # ── Application de current_max_rul (NOUVEAU — pilotable UI) ──
        self.current_max_rul = current_max_rul
        self.lookback = lookback
        df["RUL"] = df["RUL"].apply(lambda x: min(x, current_max_rul))

        # ── Équilibrage sain/dégradé ────────────────────────────────
        mask_sain = df["RUL"] >= current_max_rul
        df_degrad = df[~mask_sain]
        df_sain_reduit = df[mask_sain].sample(frac=healthy_sample_frac, random_state=self.random_state)
        df = pd.concat([df_degrad, df_sain_reduit]).sort_values(["failure_comp", "date"]).reset_index(drop=True)

        # Indexation composants (pour embedding)
        df["comp_idx"] = df["failure_comp"].astype("category").cat.codes
        self.num_classes_comp = int(df["comp_idx"].nunique())

        # ── Split par composant ─────────────────────────────────────
        all_components = df[self.COMP_COL].unique()
        np.random.seed(self.random_state)
        np.random.shuffle(all_components)
        train_size = int(len(all_components) * (1 - test_ratio))
        train_comps, test_comps = all_components[:train_size], all_components[train_size:]

        df_train = df[df[self.COMP_COL].isin(train_comps)].reset_index(drop=True)
        df_test  = df[df[self.COMP_COL].isin(test_comps)].reset_index(drop=True)

        # ── Normalisation (MinMaxScaler) ────────────────────────────
        self.scaler_x = MinMaxScaler()
        self.scaler_y = MinMaxScaler()
        X_train_s = self.scaler_x.fit_transform(df_train[self.FEATURE_COLS])
        X_test_s  = self.scaler_x.transform(df_test[self.FEATURE_COLS])
        y_train_s = self.scaler_y.fit_transform(df_train[[self.TARGET_COL]])
        y_test_s  = self.scaler_y.transform(df_test[[self.TARGET_COL]])

        # ── Séquençage avec poids renforcés ─────────────────────────
        def create_sequences_weighted(X_s, y_s, df_meta, lb, wf):
            X_num, X_comp, ys, weights = [], [], [], []
            for comp in df_meta[self.COMP_COL].unique():
                mask = df_meta[self.COMP_COL].values == comp
                X_c, y_c = X_s[mask], y_s[mask]
                if mask.sum() <= lb:
                    continue
                c_idx = df_meta.loc[mask, "comp_idx"].values[0]
                for i in range(len(X_c) - lb):
                    X_num.append(X_c[i:i+lb])
                    X_comp.append(c_idx)
                    val_y = y_c[i+lb][0]
                    ys.append(val_y)
                    # Poids = 1 + (1 - y_normalisé) × weight_factor
                    weights.append(1.0 + (1.0 - val_y) * wf)
            return np.array(X_num), np.array(X_comp), np.array(ys), np.array(weights)

        Xn_tr, Xc_tr, ytr, wtr = create_sequences_weighted(X_train_s, y_train_s, df_train, lookback, weight_factor)
        Xn_te, Xc_te, yte, wte = create_sequences_weighted(X_test_s,  y_test_s,  df_test,  lookback, weight_factor)

        # ── Sauvegarde des tenseurs ─────────────────────────────────
        self.X_train_num,  self.X_train_comp = Xn_tr, Xc_tr
        self.X_test_num,   self.X_test_comp  = Xn_te, Xc_te
        self.y_train, self.y_test = ytr, yte
        self.w_train, self.w_test = wtr, wte
        # Garder les df de test pour pouvoir construire le tableau des dates de pannes
        self._df_test = df_test
        self.is_ready = True

        self.phases_completed.append("prepare_sequences")

        return {
            "lookback":        int(lookback),
            "current_max_rul": int(current_max_rul),
            "weight_factor":   float(weight_factor),
            "num_classes_comp": int(self.num_classes_comp),
            "X_train_num_shape":  list(Xn_tr.shape),
            "X_train_comp_shape": list(Xc_tr.shape),
            "X_test_num_shape":   list(Xn_te.shape),
            "X_test_comp_shape":  list(Xc_te.shape),
            "y_train_shape":  list(ytr.shape),
            "y_test_shape":   list(yte.shape),
            "n_train_comps":  int(len(train_comps)),
            "n_test_comps":   int(len(test_comps)),
            "features":       self.FEATURE_COLS,
            "target":         self.TARGET_COL,
            # Aperçus pour visualisation UI
            "preview_normalized_X": Xn_tr[0, :5, :].tolist() if len(Xn_tr) else [],
            "preview_weights":      wtr[:10].tolist() if len(wtr) else [],
        }

    # ═══════════════════════════════════════════════════════════════
    # POST-TRAITEMENT — Prédiction sécurisée avec clip dynamique
    # ═══════════════════════════════════════════════════════════════
    def predict_with_safety(
        self,
        model,
        X_num: np.ndarray,
        X_comp: np.ndarray,
        current_max_rul: Optional[int] = None,
    ) -> np.ndarray:
        """
        Prédit et applique un clip dynamique [0, current_max_rul].
        Si current_max_rul n'est pas fourni, utilise self.current_max_rul.
        Retourne y_pred_days (valeurs en jours, dénormalisées et clippées).
        """
        if self.scaler_y is None:
            raise RuntimeError("Pipeline non prêt — lance prepare_sequences() d'abord")
        max_rul = current_max_rul if current_max_rul is not None else self.current_max_rul
        raw = model.predict([X_num, X_comp])
        prediction_inverse = self.scaler_y.inverse_transform(raw).flatten()
        prediction_finale = np.clip(prediction_inverse, 0, max_rul)
        return prediction_finale

    # ═══════════════════════════════════════════════════════════════
    # FUSION TEMPORELLE — Pour le réentrainement par l'admin
    # ═══════════════════════════════════════════════════════════════
    def merge_new_data(self, new_failure_csv: str) -> Dict:
        """
        Fusionne un nouveau fichier failure avec les données existantes,
        sur l'axe temporel + par composant.

        Logique :
        - Le nouveau fichier doit suivre la même structure que failure1.csv
        - Pour chaque composant existant : concaténation temporelle
        - Pour les nouveaux composants : intégration dans le panel
        - Recalcul automatique du RUL et des features

        Args:
            new_failure_csv : chemin vers le nouveau CSV failure
        """
        if self.df_fail is None:
            raise RuntimeError("Charge d'abord les données initiales avec load_raw_data()")

        # Charger le nouveau CSV
        new_df = pd.read_csv(new_failure_csv, encoding="utf-8-sig")
        for col in ["WOWO_DECLARATION_DATE", "WOWO_END_DATE", "WOWO_CREATION_DATE"]:
            if col in new_df.columns:
                new_df[col] = pd.to_datetime(new_df[col], errors="coerce")
        new_df["annee"] = new_df["WOWO_DECLARATION_DATE"].dt.year
        new_df["mois"]  = new_df["WOWO_DECLARATION_DATE"].dt.month
        new_df["duree"] = (new_df["WOWO_END_DATE"] - new_df["WOWO_DECLARATION_DATE"]).dt.days

        # Vérifier compatibilité (mêmes colonnes essentielles)
        required_cols = ["WOWO_DECLARATION_DATE", "WOWO_END_DATE",
                         "WOWO_EQUIPMENT", "WOWO_EQUIPMENT_LEVEL",
                         "WOWO_SYSTEM_EQUIPMENT", "failure_parent_code", "failure_parent_level"]
        missing = [c for c in required_cols if c not in new_df.columns]
        if missing:
            raise ValueError(f"Colonnes manquantes dans le nouveau CSV : {missing}")

        # Stats du nouveau dataset
        new_stats = {
            "n_rows_new":       int(len(new_df)),
            "date_min_new":     new_df["WOWO_DECLARATION_DATE"].min().isoformat(),
            "date_max_new":     new_df["WOWO_DECLARATION_DATE"].max().isoformat(),
            "n_composants_new": int(new_df["WOWO_EQUIPMENT"].nunique()),
        }

        # Composants existants vs nouveaux
        existing_comps = set(self.df_fail["WOWO_EQUIPMENT"].unique())
        new_comps_in_file = set(new_df["WOWO_EQUIPMENT"].unique())
        truly_new_comps = new_comps_in_file - existing_comps
        common_comps    = new_comps_in_file & existing_comps

        # Fusion
        merged = pd.concat([self.df_fail, new_df], ignore_index=True)
        merged = merged.sort_values(["WOWO_EQUIPMENT", "WOWO_DECLARATION_DATE"]).reset_index(drop=True)
        # Détecte le nouveau range d'années
        years_in_merged = sorted(merged["annee"].dropna().unique().astype(int).tolist())

        # Met à jour df_fail (le pipeline va recalculer tout le reste sur appel)
        self.df_fail = merged

        # Reset des phases postérieures (il faudra refaire feature engineering + prétraitement)
        self.df_panel = self.df_rul = self.df_final = self.df_export = None
        self.is_ready = False
        self.phases_completed = ["load_raw_data"]

        return {
            "before": {
                "n_rows":         int(len(self.df_fail) - len(new_df)),
                "n_composants":   len(existing_comps),
            },
            "new": new_stats,
            "after_merge": {
                "n_rows_total":     int(len(merged)),
                "n_composants_total": int(merged["WOWO_EQUIPMENT"].nunique()),
                "common_components": len(common_comps),
                "new_components":    len(truly_new_comps),
                "list_new_components": sorted(truly_new_comps)[:20],  # 20 premiers
                "years_covered":     years_in_merged,
            },
            "next_steps": [
                "Lance compute_features() pour recalculer Dataset_V1",
                "Lance prepare_sequences() pour préparer les tenseurs",
                "Réentraîne le modèle avec les nouvelles données",
            ],
        }

    # ═══════════════════════════════════════════════════════════════
    # UTILITAIRES
    # ═══════════════════════════════════════════════════════════════
    def get_test_dataframe(self) -> pd.DataFrame:
        """Récupère le DataFrame de test (utile pour le tableau dates pannes)."""
        if not hasattr(self, "_df_test"):
            raise RuntimeError("Lance prepare_sequences() d'abord")
        return self._df_test

    def get_info(self) -> Dict:
        """Métadonnées générales du pipeline."""
        return {
            "id":   self.PIPELINE_ID,
            "name": self.PIPELINE_NAME,
            "description": self.PIPELINE_DESCRIPTION,
            "is_ready":      self.is_ready,
            "phases_done":   self.phases_completed,
            "year":          self.year,
            "min_failures":  self.min_failures,
            "n_composants":  int(self.df_export["failure_comp"].nunique()) if self.df_export is not None else 0,
            "current_max_rul": self.current_max_rul,
            "lookback":      self.lookback,
            "num_classes_comp": self.num_classes_comp,
        }
