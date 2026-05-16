import os
import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, Any, Optional

SENSOR_COLS   = ["volt", "rotate", "pressure", "vibration"]
SENSOR_LABELS = {"volt": "Voltage", "rotate": "Rotation", "pressure": "Pression", "vibration": "Vibration"}
ERROR_COLS    = ["error1", "error2", "error3", "error4", "error5"]

class EDAEngine:
    def __init__(self, data_dir, machine_id=99):
        self.data_dir   = data_dir
        self.machine_id = machine_id
        self._loaded    = False
        self.telemetry = self.machines = self.failures = self.errors = self.maint = None

    def load(self):
        files = {"telemetry": "PdM_telemetry.csv", "machines": "PdM_machines.csv",
                 "failures": "PdM_failures.csv", "errors": "PdM_errors.csv", "maint": "PdM_maint.csv"}
        dfs = {}
        for name, fname in files.items():
            path = os.path.join(self.data_dir, fname)
            if not os.path.exists(path):
                raise FileNotFoundError(f"Fichier manquant : {path}")
            dfs[name] = pd.read_csv(path)
        for name in ["telemetry", "failures", "errors", "maint"]:
            dfs[name]["datetime"] = pd.to_datetime(dfs[name]["datetime"])
        self.telemetry = dfs["telemetry"]
        self.machines  = dfs["machines"]
        self.failures  = dfs["failures"]
        self.errors    = dfs["errors"]
        self.maint     = dfs["maint"]
        self._loaded   = True

    def _check(self):
        if not self._loaded: self.load()

    def health_report(self):
        self._check()
        dfs = {"telemetry": self.telemetry, "machines": self.machines,
               "failures": self.failures, "errors": self.errors, "maint": self.maint}
        report = []
        for name, df in dfs.items():
            nan_c = int(df.isnull().sum().sum())
            dup_c = int(df.duplicated().sum())
            report.append({"fichier": name, "lignes": int(df.shape[0]), "colonnes": int(df.shape[1]),
                           "nan": nan_c, "nan_pct": round(nan_c/(df.shape[0]*df.shape[1])*100,2),
                           "doublons": dup_c, "statut": "OK" if nan_c==0 and dup_c==0 else "Attention"})
        tel = self.telemetry
        diffs = tel.groupby("machineID")["datetime"].diff().dropna().dt.total_seconds().mode()
        freq_ok = bool(len(diffs) > 0 and diffs.iloc[0] == 3600)
        return {"fichiers": report, "periode_debut": str(tel["datetime"].min()),
                "periode_fin": str(tel["datetime"].max()), "machines_total": int(tel["machineID"].nunique()),
                "frequence_ok": freq_ok,
                "types_telemetry": {col: str(dtype) for col, dtype in tel.dtypes.items()}}

    def failures_analysis(self):
        self._check()
        failures = self.failures
        per_machine = failures.groupby("machineID").size().sort_values(ascending=False).head(20)
        target = self.machine_id or int(per_machine.idxmax())
        type_counts = failures["failure"].value_counts()
        target_failures = failures[failures["machineID"] == target].copy()
        target_failures["datetime"] = target_failures["datetime"].astype(str)
        failures["month"] = failures["datetime"].dt.to_period("M").astype(str)
        monthly = failures.groupby("month").size().reset_index(name="count")
        return {
            "par_machine": [{"machineID": int(mid), "pannes": int(cnt), "est_cible": mid == target} for mid, cnt in per_machine.items()],
            "types_globaux": [{"type": t, "count": int(c), "pct": round(c/len(failures)*100,1)} for t, c in type_counts.items()],
            "machine_cible": target, "pannes_cible": int(len(target_failures)),
            "detail_cible": target_failures[["datetime","failure"]].to_dict("records"),
            "timeline_mensuelle": monthly.to_dict("records")}

    def time_series(self, days=90):
        self._check()
        tel = self.telemetry
        tm  = tel[tel["machineID"] == self.machine_id].copy().sort_values("datetime")
        date_start = tm["datetime"].min()
        date_end   = date_start + pd.Timedelta(days=days)
        tm_plot    = tm[tm["datetime"] <= date_end].copy()
        step = max(1, len(tm_plot) // 500)
        tm_plot = tm_plot.iloc[::step].copy()
        tm_plot["datetime"] = tm_plot["datetime"].astype(str)
        fail_m = self.failures[(self.failures["machineID"] == self.machine_id) &
                               (self.failures["datetime"] >= date_start) &
                               (self.failures["datetime"] <= date_end)].copy()
        fail_m["datetime"] = fail_m["datetime"].astype(str)
        return {"series": {col: tm_plot[["datetime", col]].rename(columns={col: "value"}).to_dict("records") for col in SENSOR_COLS},
                "pannes": fail_m[["datetime","failure"]].to_dict("records"),
                "periode": {"debut": str(date_start.date()), "fin": str(date_end.date())},
                "machine_id": self.machine_id}

    def correlation_matrix(self):
        self._check()
        tm   = self.telemetry[self.telemetry["machineID"] == self.machine_id]
        corr = tm[SENSOR_COLS].corr().round(4)
        cells = [{"row": r, "col": c, "value": float(corr.loc[r, c])} for r in SENSOR_COLS for c in SENSOR_COLS]
        return {"cells": cells, "sensors": SENSOR_COLS, "labels": SENSOR_LABELS}

    def pre_failure_stats(self, window_hours=24):
        self._check()
        tm  = self.telemetry[self.telemetry["machineID"] == self.machine_id].copy().sort_values("datetime")
        fai = self.failures[self.failures["machineID"] == self.machine_id]
        pre_failure_data = []
        for _, row in fai.iterrows():
            w_start = row["datetime"] - pd.Timedelta(hours=window_hours)
            window  = tm[(tm["datetime"] >= w_start) & (tm["datetime"] < row["datetime"])]
            if len(window) > 0:
                w_stats = window[SENSOR_COLS].mean()
                w_stats["panne"] = row["failure"]
                pre_failure_data.append(w_stats)
        pre_df = pd.DataFrame(pre_failure_data) if pre_failure_data else pd.DataFrame(columns=SENSOR_COLS)
        result = []
        for col in SENSOR_COLS:
            normal_vals = tm[col]
            pre_vals    = pre_df[col] if not pre_df.empty and col in pre_df.columns else pd.Series([], dtype=float)
            delta = round((pre_vals.mean() - normal_vals.mean()) / normal_vals.mean() * 100, 2) if len(pre_vals) > 0 and normal_vals.mean() != 0 else None
            result.append({"capteur": col, "label": SENSOR_LABELS[col],
                           "moy_normal": round(float(normal_vals.mean()), 3), "std_normal": round(float(normal_vals.std()), 3),
                           "moy_pre_panne": round(float(pre_vals.mean()), 3) if len(pre_vals) > 0 else None,
                           "std_pre_panne": round(float(pre_vals.std()), 3) if len(pre_vals) > 0 else None,
                           "delta_pct": delta, "alerte": delta is not None and abs(delta) > 5})
        return {"stats": result, "window_hours": window_hours, "nb_pannes": int(len(fai)), "machine_id": self.machine_id}

    def outliers_report(self, zscore_threshold=3.0, iqr_factor=3.0):
        self._check()
        result = []
        for col in SENSOR_COLS:
            data = self.telemetry[col].dropna()
            z_scores     = np.abs(stats.zscore(data))
            zscore_count = int((z_scores > zscore_threshold).sum())
            Q1, Q3 = float(data.quantile(0.25)), float(data.quantile(0.75))
            IQR    = Q3 - Q1
            lower, upper = Q1 - iqr_factor * IQR, Q3 + iqr_factor * IQR
            iqr_count = int(((data < lower) | (data > upper)).sum())
            result.append({"capteur": col, "label": SENSOR_LABELS[col],
                           "min": round(float(data.min()),3), "max": round(float(data.max()),3),
                           "mean": round(float(data.mean()),3), "std": round(float(data.std()),3),
                           "Q1": round(Q1,3), "Q3": round(Q3,3), "IQR": round(IQR,3),
                           "lower_iqr": round(lower,3), "upper_iqr": round(upper,3),
                           "outliers_z": zscore_count, "outliers_iqr": iqr_count,
                           "pct_outliers": round(iqr_count/len(data)*100,3)})
        return {"rapport": result, "zscore_seuil": zscore_threshold, "iqr_facteur": iqr_factor,
                "decision": "Outliers conserves — le modele LSTM apprendra a distinguer le bruit des signaux de degradation."}

    def boxplot_stats(self):
        self._check()
        result = []
        for col in SENSOR_COLS:
            data = self.telemetry[col].dropna()
            Q1, Q3 = float(data.quantile(0.25)), float(data.quantile(0.75))
            IQR    = Q3 - Q1
            sample = data.sample(min(300, len(data)), random_state=42).tolist()
            result.append({"capteur": col, "label": SENSOR_LABELS[col],
                           "min": round(float(data.min()),3), "Q1": round(Q1,3),
                           "median": round(float(data.median()),3), "Q3": round(Q3,3),
                           "max": round(float(data.max()),3), "mean": round(float(data.mean()),3),
                           "std": round(float(data.std()),3),
                           "whisker_low": round(max(float(data.min()), Q1-1.5*IQR),3),
                           "whisker_high": round(min(float(data.max()), Q3+1.5*IQR),3),
                           "sample": [round(v,3) for v in sample]})
        return {"capteurs": result}

    def errors_analysis(self):
        self._check()
        errors = self.errors
        type_counts = errors["errorID"].value_counts()
        per_machine = errors.groupby("machineID").size().sort_values(ascending=False).head(15)
        err_target  = errors[errors["machineID"] == self.machine_id].copy()
        errors["month"] = errors["datetime"].dt.to_period("M").astype(str)
        monthly = errors.groupby(["month","errorID"]).size().reset_index(name="count")
        return {"par_type": [{"errorID": str(eid), "count": int(cnt), "pct": round(cnt/len(errors)*100,1)} for eid,cnt in type_counts.items()],
                "par_machine": [{"machineID": int(mid), "count": int(cnt)} for mid,cnt in per_machine.items()],
                "machine_cible_total": int(len(err_target)),
                "machine_cible_types": {str(k): int(v) for k,v in err_target["errorID"].value_counts().items()},
                "timeline_mensuelle": monthly.to_dict("records")}

    def full_report(self):
        self.load()
        return {"health": self.health_report(), "failures": self.failures_analysis(),
                "time_series": self.time_series(), "correlation": self.correlation_matrix(),
                "pre_failure": self.pre_failure_stats(), "outliers": self.outliers_report(),
                "boxplot": self.boxplot_stats(), "errors": self.errors_analysis()}
