"""
test_pipeline.py — Tester le pipeline SANS FastAPI
Placez ce fichier dans pdm_platform/backend/ et lancez :
    python test_pipeline.py
"""
import os, sys, traceback

# Ajuster le chemin selon votre structure
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, "..", "data")
EXPORTS_DIR = os.path.join(BASE_DIR, "..", "exports")

print(f"DATA_DIR    = {DATA_DIR}")
print(f"EXPORTS_DIR = {EXPORTS_DIR}")
print(f"data exists = {os.path.exists(DATA_DIR)}")
print()

from pipeline import MaintenancePipeline

pipeline = MaintenancePipeline(
    data_dir=DATA_DIR,
    exports_dir=EXPORTS_DIR,
    machine_id=99,
    lookback=24,
)

try:
    print("=== PHASE 1 ===")
    health = pipeline.load_and_validate()
    print("OK\n")

    print("=== PHASE 2 ===")
    pipeline.merge_datasets()
    print("OK\n")

    print("=== PHASE 3 ===")
    pipeline.feature_engineering()
    print(f"Colonnes df_features : {list(pipeline.df_features.columns)}")
    print(f"'machineID' présent  : {'machineID' in pipeline.df_features.columns}")
    print(f"Nb features          : {len(pipeline.feature_cols)}")
    print("OK\n")

    print("=== PHASE 4 ===")
    pipeline.prepare_tensors()
    print(f"X_train : {pipeline.X_train.shape}")
    print(f"X_test  : {pipeline.X_test.shape}")
    print("OK\n")

    print("=== PIPELINE COMPLET — SUCCÈS ===")

except Exception as e:
    print(f"\n ERREUR : {e}")
    traceback.print_exc()
    sys.exit(1)
