/**
 * AppContext.jsx — État global partagé entre tous les panels
 * Persist dans localStorage pour survivre aux refreshs
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AppContext = createContext(null);

// Helpers localStorage
const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch(_) {} };
const load = (key, def)  => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch(_) { return def; } };

export function AppProvider({ children }) {

  // ── Ingestion ──────────────────────────────────────────────
  const [ingestionStatus,   setIngestionStatus]   = useState(() => load('pdm_ingestion_status', 'idle'));
  const [ingestionResult,   setIngestionResult]   = useState(() => load('pdm_ingestion_result', null));
  const [ingestionPhases,   setIngestionPhases]   = useState(() => load('pdm_ingestion_phases', {}));
  const [ingestionDone,     setIngestionDone]     = useState(() => load('pdm_ingestion_done', []));
  const [filesData,         setFilesData]         = useState(() => load('pdm_files_data', {}));
  const [validation,        setValidation]        = useState(() => load('pdm_validation', null));
  const [mergeSteps,        setMergeSteps]        = useState(() => load('pdm_merge_steps', []));
  const [featSteps,         setFeatSteps]         = useState(() => load('pdm_feat_steps', []));
  const [tensorSteps,       setTensorSteps]       = useState(() => load('pdm_tensor_steps', []));

  // ── Entraînement ───────────────────────────────────────────
  const [currentEpochCtx,   setCurrentEpochCtx]   = useState(null);
  const [trainingStatus,    setTrainingStatus]    = useState(() => load('pdm_training_status', 'idle'));
  const [epochData,         setEpochData]         = useState(() => load('pdm_epoch_data', []));
  const [trialData,         setTrialData]         = useState(() => load('pdm_trial_data', []));
  const [trainingResult,    setTrainingResult]    = useState(() => load('pdm_training_result', null));
  const [predictions,       setPredictions]       = useState(() => load('pdm_predictions', null));
  const [lastExpId,         setLastExpId]         = useState(() => load('pdm_last_exp_id', null));
  const [trainingLogs,      setTrainingLogs]      = useState(() => load('pdm_training_logs', []));

  // ── Persist automatique ────────────────────────────────────
  useEffect(() => { save('pdm_ingestion_status', ingestionStatus); },   [ingestionStatus]);
  useEffect(() => { save('pdm_ingestion_result', ingestionResult); },   [ingestionResult]);
  useEffect(() => { save('pdm_ingestion_phases', ingestionPhases); },   [ingestionPhases]);
  useEffect(() => { save('pdm_ingestion_done',   ingestionDone); },     [ingestionDone]);
  useEffect(() => { save('pdm_files_data',       filesData); },         [filesData]);
  useEffect(() => { save('pdm_validation',       validation); },        [validation]);
  useEffect(() => { save('pdm_merge_steps',      mergeSteps); },        [mergeSteps]);
  useEffect(() => { save('pdm_feat_steps',       featSteps); },         [featSteps]);
  useEffect(() => { save('pdm_tensor_steps',     tensorSteps); },       [tensorSteps]);
  useEffect(() => { save('pdm_training_status',  trainingStatus); },    [trainingStatus]);
  useEffect(() => { save('pdm_epoch_data',       epochData); },         [epochData]);
  useEffect(() => { save('pdm_trial_data',        trialData); },        [trialData]);
  useEffect(() => { save('pdm_training_result',  trainingResult); },    [trainingResult]);
  useEffect(() => { save('pdm_predictions',      predictions); },       [predictions]);
  useEffect(() => { save('pdm_last_exp_id',      lastExpId); },         [lastExpId]);
  useEffect(() => { save('pdm_training_logs',    trainingLogs.slice(-100)); }, [trainingLogs]);

  // ── Actions ingestion ──────────────────────────────────────
  const resetIngestion = useCallback(() => {
    setIngestionStatus('idle');
    setIngestionResult(null);
    setIngestionPhases({});
    setIngestionDone([]);
    setFilesData({});
    setValidation(null);
    setMergeSteps([]);
    setFeatSteps([]);
    setTensorSteps([]);
    ['pdm_ingestion_status','pdm_ingestion_result','pdm_ingestion_phases',
     'pdm_ingestion_done','pdm_files_data','pdm_validation',
     'pdm_merge_steps','pdm_feat_steps','pdm_tensor_steps'
    ].forEach(k => localStorage.removeItem(k));
  }, []);

  // ── Actions entraînement ───────────────────────────────────
  const resetTraining = useCallback(() => {
    setTrainingStatus('idle');
    setEpochData([]);
    setTrialData([]);
    setTrainingResult(null);
    setPredictions(null);
    setLastExpId(null);
    setTrainingLogs([]);
    ['pdm_training_status','pdm_epoch_data','pdm_trial_data',
     'pdm_training_result','pdm_predictions','pdm_last_exp_id','pdm_training_logs'
    ].forEach(k => localStorage.removeItem(k));
  }, []);

  const addLog = useCallback((msg) => {
    setTrainingLogs(prev => [...prev.slice(-300), { ts: Date.now(), text: msg }]);
  }, []);

  const addEpoch = useCallback((ep) => {
    setEpochData(prev => [...prev, ep]);
  }, []);

  const addTrial = useCallback((trial) => {
    setTrialData(prev => [...prev, trial]);
  }, []);

  // ── WebSocket entraînement — vit dans le contexte ────────────
  const wsRef = useRef(null);

  const connectTrainingWS = useCallback((expId) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`ws://localhost:8000/ws/${expId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      addLog('🔌 Connexion WebSocket établie...');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch(data.type) {
          case 'log':
            addLog(data.message);
            break;
          case 'epoch':
            const ep = {
              epoch: data.epoch, total: data.total,
              loss: data.loss, val_loss: data.val_loss,
              mae: data.mae, val_mae: data.val_mae,
              elapsed: data.elapsed,
            };
            addEpoch(ep);
            setCurrentEpochCtx(ep);
            break;
          case 'trial_start':
            addLog(`\n🔍 Essai ${data.trial}/${data.total} en cours...`);
            break;
          case 'trial_end':
            addTrial({ trial: data.trial, avg_cv_loss: data.avg_cv_loss, duration: data.duration });
            addLog(`  ✅ Essai ${data.trial} terminé — CV Loss: ${data.avg_cv_loss?.toFixed(5)}`);
            break;
          case 'result':
            setTrainingResult(data);
            addLog(data.message);
            break;
          case 'completed':
            setTrainingStatus('completed');
            if (data.predictions) setPredictions(data.predictions);
            addLog(`\n🏁 Terminé ! R²=${data.r2?.toFixed(4)} | MAE=${data.mae_hours?.toFixed(1)}h`);
            ws.close();
            break;
          case 'error':
            setTrainingStatus('error');
            addLog(`\n❌ Erreur : ${data.message}`);
            ws.close();
            break;
        }
      } catch(_) {}
    };

    ws.onerror = () => addLog('❌ Erreur WebSocket');
    ws.onclose = () => addLog('🔌 Connexion fermée.');
  }, [addLog, addEpoch, addTrial]);

  const disconnectTrainingWS = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
  }, []);

  return (
    <AppContext.Provider value={{
      // Ingestion
      ingestionStatus, setIngestionStatus,
      ingestionResult, setIngestionResult,
      ingestionPhases, setIngestionPhases,
      ingestionDone,   setIngestionDone,
      filesData,       setFilesData,
      validation,      setValidation,
      mergeSteps,      setMergeSteps,
      featSteps,       setFeatSteps,
      tensorSteps,     setTensorSteps,
      resetIngestion,

      // Entraînement
      trainingStatus,  setTrainingStatus,
      epochData,       setEpochData,
      trialData,       setTrialData,
      trainingResult,  setTrainingResult,
      predictions,     setPredictions,
      lastExpId,       setLastExpId,
      trainingLogs,    setTrainingLogs,
      addLog, addEpoch, addTrial,
      resetTraining,
      currentEpochCtx, setCurrentEpochCtx,
      connectTrainingWS, disconnectTrainingWS,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}