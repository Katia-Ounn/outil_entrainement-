import os, json, joblib
import numpy as np
import pandas as pd
from typing import Callable, Optional, Dict, Any, Tuple
from sklearn.preprocessing import MinMaxScaler

SENSOR_COLS    = ["volt", "rotate", "pressure", "vibration"]
COMPONENT_COLS = ["comp1", "comp2", "comp3", "comp4"]
ERROR_COLS     = ["error1", "error2", "error3", "error4", "error5"]

class MaintenancePipeline:
    def __init__(self, data_dir, exports_dir, machine_id=99, lookback=24, log_callback=None):
        self.data_dir    = data_dir
        self.exports_dir = exports_dir
        self.machine_id  = machine_id
        self.lookback    = lookback
        self.log         = log_callback or print
        self.df_raw      = None
        self.df_features = None
        self.feature_cols = []
        self.scaler_x    = None
        self.scaler_y    = None
        self.X_train = self.y_train = self.X_test = self.y_test = None
        self.test_dates  = None
        self.health_report_data = {}
        self._dfs        = {}

    def load_and_validate(self):
        self.log("=" * 60)
        self.log("  PHASE 1 -- Chargement & Validation")
        self.log("=" * 60)
        files = {
            "telemetry": "PdM_telemetry.csv", "machines": "PdM_machines.csv",
            "failures":  "PdM_failures.csv",  "errors":   "PdM_errors.csv",
            "maint":     "PdM_maint.csv",
        }
        dfs = {}
        for name, fname in files.items():
            path = os.path.join(self.data_dir, fname)
            if not os.path.exists(path):
                raise FileNotFoundError(f"Fichier manquant : {path}")
            dfs[name] = pd.read_csv(path)
            self.log(f"  OK {name:<12} -> {len(dfs[name]):>7,} lignes")

        for name in ["telemetry", "failures", "errors", "maint"]:
            dfs[name]["datetime"] = pd.to_datetime(dfs[name]["datetime"])

        report = {}
        for name, df in dfs.items():
            nan_c = int(df.isnull().sum().sum())
            dup_c = int(df.duplicated().sum())
            report[name] = {"rows": int(df.shape[0]), "cols": int(df.shape[1]),
                            "nan": nan_c, "dup": dup_c,
                            "status": "OK" if nan_c == 0 and dup_c == 0 else "WARNING"}

        tel       = dfs["telemetry"]
        diffs     = tel.groupby("machineID")["datetime"].diff().dropna().dt.total_seconds()
        mode_vals = diffs.mode()
        freq_ok   = bool(len(mode_vals) > 0 and mode_vals.iloc[0] == 3600)
        report["frequency_ok"]   = freq_ok
        report["period_start"]   = str(tel["datetime"].min())
        report["period_end"]     = str(tel["datetime"].max())
        report["machines_total"] = int(tel["machineID"].nunique())

        if self.machine_id is None:
            self.machine_id = int(dfs["failures"].groupby("machineID").size().idxmax())

        self.log(f"  -> Machine cible : {self.machine_id}")
        self.health_report_data = report
        self._dfs = dfs
        return report

    def merge_datasets(self):
        self.log("\n" + "-" * 60)
        self.log("  PHASE 2 -- Fusion des datasets")
        self.log("-" * 60)
        tel      = self._dfs["telemetry"].copy()
        machines = self._dfs["machines"].copy()
        failures = self._dfs["failures"].copy()
        errors   = self._dfs["errors"].copy()

        df = tel.copy()
        self.log(f"  [1/4] Base telemetrie : {len(df):,} lignes")

        if "age" in machines.columns:
            machines = machines.rename(columns={"age": "machine_age_years"})
        if "model" in machines.columns:
            machines["model_encoded"] = machines["model"].astype("category").cat.codes.astype(int)
        keep = ["machineID"] + [c for c in ["model_encoded", "machine_age_years"] if c in machines.columns]
        df = pd.merge(df, machines[keep], on="machineID", how="left")
        self.log(f"  [2/4] Apres fusion machines : {len(df):,} lignes")

        if "errorID" in errors.columns:
            for eid in sorted(errors["errorID"].unique()):
                col_name = str(eid).lower()
                sub = errors[errors["errorID"] == eid].groupby(["datetime", "machineID"]).size().reset_index(name=col_name)
                df = pd.merge(df, sub, on=["datetime", "machineID"], how="left")

        for col in ERROR_COLS:
            if col not in df.columns: df[col] = 0
            else: df[col] = df[col].fillna(0).astype(int)
        self.log(f"  [3/4] Erreurs integrees : {int(df[ERROR_COLS].sum().sum())}")

        df = pd.merge(df, failures[["datetime", "machineID", "failure"]], on=["datetime", "machineID"], how="left")
        df["failure"] = df["failure"].fillna("none")
        self.log(f"  [4/4] Colonne failure alignee")

        df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)
        self.df_raw = df
        self.log(f"\n  OK Fusion : {len(df):,} lignes | {df.shape[1]} colonnes")
        return df

    def feature_engineering(self):
        self.log("\n" + "-" * 60)
        self.log("  PHASE 3 -- Feature Engineering")
        self.log("-" * 60)
        df = self.df_raw.copy()

        self.log("  [1/4] Rolling features...")
        new_cols = []
        for window, label in [(3, "3h"), (24, "24h")]:
            for col in SENSOR_COLS:
                if col not in df.columns: continue
                df[f"{col}_mean_{label}"] = df.groupby("machineID")[col].transform(lambda x: x.rolling(window=window, min_periods=1).mean())
                df[f"{col}_std_{label}"]  = df.groupby("machineID")[col].transform(lambda x: x.rolling(window=window, min_periods=1).std().fillna(0))
                new_cols.extend([f"{col}_mean_{label}", f"{col}_std_{label}"])
        self.log(f"     OK {len(new_cols)} colonnes creees")

        self.log("  [2/4] Age des composants...")
        maint    = self._dfs["maint"].copy().sort_values("datetime")
        comp_col = next((c for c in ["comp", "component", "comp_id"] if c in maint.columns), None)
        # Work on a sorted copy for merge_asof; we'll rebuild the original index order after
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
                        # Fill NaN (no prior maintenance) with time since machine start
                        start_dates = df_sorted.groupby("machineID")["datetime"].transform("min")
                        age_filled = (df_sorted["datetime"] - start_dates).dt.total_seconds() / 86400.0
                        age_from_maint = (df_sorted["datetime"] - tmp["last_maint_date"]).dt.total_seconds() / 86400.0
                        df_sorted[f"{comp}_age"] = age_from_maint.fillna(age_filled).values
                new_cols.append(f"{comp}_age")
            except Exception as e:
                self.log(f"     WARN {comp}: {e}")
                df_sorted[f"{comp}_age"] = 0.0
                new_cols.append(f"{comp}_age")
        df = df_sorted.sort_values(["machineID", "datetime"]).reset_index(drop=True)
        self.log("     OK Age calcule")

        self.log("  [3/4] Calcul RUL...")
        df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)
        failures_only = self._dfs["failures"][["machineID", "datetime"]].copy()
        failures_only = failures_only.rename(columns={"datetime": "fail_date"})
        failures_only = failures_only.sort_values("fail_date").reset_index(drop=True)
        # Pour chaque ligne de df, trouver la prochaine panne de la même machine
        df = pd.merge_asof(
            df.sort_values("datetime"),
            failures_only,
            left_on="datetime",
            right_on="fail_date",
            by="machineID",
            direction="forward"
        )
        df["RUL"] = (df["fail_date"] - df["datetime"]).dt.total_seconds() / 3600.0
        df = df.drop(columns=["fail_date"])
        df = df.sort_values(["machineID", "datetime"]).reset_index(drop=True)
        before = len(df)
        df = df.dropna(subset=["RUL"]).reset_index(drop=True)
        df["RUL"] = df["RUL"].astype(float)
        self.log(f"     OK RUL : {len(df):,}/{before:,} lignes")

        self.log("  [4/4] Features finales...")
        error_ok = [c for c in ERROR_COLS if c in df.columns]
        extra    = [c for c in ["model_encoded", "machine_age_years"] if c in df.columns]
        # Deduplicate while preserving order
        seen = set()
        ordered = []
        for c in SENSOR_COLS + new_cols + error_ok + extra:
            if c not in seen and c in df.columns:
                seen.add(c)
                ordered.append(c)
        self.feature_cols = ordered
        self.df_features  = df
        self.log(f"\n  OK {len(self.feature_cols)} features | {len(df):,} lignes")
        return df

    @staticmethod
    def _calculate_rul(group):
        group = group.sort_values("datetime").copy()
        group["RUL"] = np.nan
        fail_dates = group.loc[group["failure"] != "none", "datetime"].tolist()
        if not fail_dates: return group
        for f_date in fail_dates:
            mask = (group["datetime"] <= f_date) & (group["RUL"].isna())
            group.loc[mask, "RUL"] = (f_date - group.loc[mask, "datetime"]).dt.total_seconds() / 3600.0
        return group

    def prepare_tensors(self, train_ratio=0.8):
        self.log("\n" + "-" * 60)
        self.log(f"  PHASE 4 -- Tenseurs (Machine {self.machine_id})")
        self.log("-" * 60)

        df = self.df_features[self.df_features["machineID"] == self.machine_id].copy()
        df = df.sort_values("datetime").reset_index(drop=True)
        if len(df) == 0:
            raise ValueError(f"Aucune donnée pour machine {self.machine_id} après feature engineering")

        self.log(f"  [1/6] Lignes avant suppression lookback : {len(df):,}")
        df = df.iloc[self.lookback:].reset_index(drop=True)
        self.log(f"  [1/6] Lignes après suppression lookback : {len(df):,}")

        if len(df) == 0:
            raise ValueError(f"Plus aucune ligne après suppression des {self.lookback} premières (lookback)")

        self.feature_cols = [c for c in self.feature_cols if c in df.columns]
        self.log(f"  [2/6] Features valides : {len(self.feature_cols)}")

        if len(self.feature_cols) == 0:
            raise ValueError("Aucune feature valide trouvée dans le DataFrame")

        nan_count = df[self.feature_cols].isnull().sum().sum()
        if nan_count > 0:
            self.log(f"  [3/6] {nan_count} NaN -> remplacement par 0")
        df[self.feature_cols] = df[self.feature_cols].fillna(0).replace([np.inf, -np.inf], 0)
        df = df.dropna(subset=["RUL"]).reset_index(drop=True)
        self.log(f"  [3/6] Nettoyage OK : {len(df):,} lignes")

        if len(df) < self.lookback * 2 + 10:
            raise ValueError(f"Trop peu de lignes ({len(df)}) pour créer des séquences avec lookback={self.lookback}")

        split_idx = int(len(df) * train_ratio)
        df_train  = df.iloc[:split_idx].copy()
        df_test   = df.iloc[split_idx:].copy()
        self.log(f"  [4/6] Split : Train={len(df_train)} | Test={len(df_test)}")

        if len(df_test) <= self.lookback:
            raise ValueError(f"Jeu de test trop petit ({len(df_test)} lignes) pour lookback={self.lookback}")

        # test_dates corresponds to rows that will become y values in sequences
        self.test_dates = df_test.iloc[self.lookback:]["datetime"].reset_index(drop=True)

        self.log("  [5/6] Normalisation MinMaxScaler...")
        self.scaler_x = MinMaxScaler(feature_range=(0, 1))
        self.scaler_y = MinMaxScaler(feature_range=(0, 1))

        X_train_arr = np.nan_to_num(df_train[self.feature_cols].values.astype(np.float32))
        X_test_arr  = np.nan_to_num(df_test[self.feature_cols].values.astype(np.float32))
        y_train_arr = np.nan_to_num(df_train[["RUL"]].values.astype(np.float32))
        y_test_arr  = np.nan_to_num(df_test[["RUL"]].values.astype(np.float32))

        X_train_s = self.scaler_x.fit_transform(X_train_arr)
        X_test_s  = self.scaler_x.transform(X_test_arr)
        y_train_s = self.scaler_y.fit_transform(y_train_arr)
        y_test_s  = self.scaler_y.transform(y_test_arr)

        self.log(f"  [6/6] Séquençage 3D (lookback={self.lookback})...")
        self.X_train, self.y_train = self._create_sequences(X_train_s, y_train_s)
        self.X_test,  self.y_test  = self._create_sequences(X_test_s,  y_test_s)

        if len(self.X_train) == 0 or len(self.X_test) == 0:
            raise ValueError(
                f"Séquençage produit des tenseurs vides : X_train={self.X_train.shape}, X_test={self.X_test.shape}"
            )

        self.log(f"       X_train : {self.X_train.shape}")
        self.log(f"       X_test  : {self.X_test.shape}")
        self.log(f"\n  OK Tenseurs prêts !")
        return self.X_train, self.y_train, self.X_test, self.y_test

    def _create_sequences(self, X, y):
        X_seq, y_seq = [], []
        for i in range(len(X) - self.lookback):
            X_seq.append(X[i: i + self.lookback])
            y_seq.append(y[i + self.lookback])
        return np.array(X_seq), np.array(y_seq)

    def save_scalers(self, experiment_name):
        os.makedirs(self.exports_dir, exist_ok=True)
        safe = experiment_name.replace(" ", "_").replace("/", "-")
        px   = os.path.join(self.exports_dir, f"scaler_x_{safe}.pkl")
        py   = os.path.join(self.exports_dir, f"scaler_y_{safe}.pkl")
        joblib.dump(self.scaler_x, px)
        joblib.dump(self.scaler_y, py)
        return {"scaler_x_path": px, "scaler_y_path": py}

    def denormalize_rul(self, y_scaled):
        return self.scaler_y.inverse_transform(y_scaled.reshape(-1, 1)).flatten()

    def run_full_pipeline(self):
        health = self.load_and_validate()
        self.merge_datasets()
        self.feature_engineering()
        self.prepare_tensors()
        return {
            "health": health, "n_features": len(self.feature_cols),
            "feature_cols": self.feature_cols,
            "X_train": self.X_train.shape, "X_test": self.X_test.shape,
        }