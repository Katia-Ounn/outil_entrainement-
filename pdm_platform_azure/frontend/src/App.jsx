/**
 * App.jsx — Application principale
 * Plateforme PdM — PFE Master 2 Génie Logiciel
 */
import { useState } from 'react';
import { Database, BrainCircuit, Trophy, Activity, Cpu, BarChart2, BookOpen } from 'lucide-react';
import { AppProvider } from './AppContext';
import IngestionPanel from './components/IngestionPanel';
import TrainingPanel  from './components/TrainingPanel';
import Leaderboard    from './components/Leaderboard';
import EDAPanel       from './components/EDAPanel';
import DemoPanel      from './components/DemoPanel';

const TABS = [
  { id:'eda',    label:'EDA',          icon:BarChart2,    color:'#ce93d8' },
  { id:'ingest', label:'Ingestion',    icon:Database,     color:'#4fc3f7' },
  { id:'train',  label:'Entraînement', icon:BrainCircuit, color:'#81c784' },
  { id:'demo',   label:'Démo',         icon:BookOpen,     color:'#ce93d8' },
  { id:'leader', label:'Leaderboard',  icon:Trophy,       color:'#ffb74d' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('eda');

  return (
    <AppProvider>
      <div className="min-h-screen" style={{ background:'var(--bg-deep)' }}>

        {/* Topbar */}
        <header className="border-b sticky top-0 z-50" style={{
          background:'rgba(15,17,23,0.95)',
          borderColor:'#2a2d45',
          backdropFilter:'blur(10px)',
        }}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{
                background:'linear-gradient(135deg,#0d4a6b,#4fc3f730)',
                border:'1px solid #4fc3f740',
              }}>
                <Cpu size={18} style={{ color:'#4fc3f7' }} />
              </div>
              <div>
                <h1 className="font-bold text-base leading-tight" style={{ color:'#e4e6f0' }}>
                  PdM Platform
                </h1>
                <p className="text-xs" style={{ color:'#4a4d6a' }}>
                  Predictive Maintenance · AutoML · PFE Master 2
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono"
              style={{ background:'#1a1d2e', borderColor:'#2a2d45', color:'#8a8d9f' }}>
              <Activity size={12} style={{ color:'#4caf50' }} />
              Microsoft Azure PdM Dataset · Machine 99 · 876k lignes
            </div>

            <nav className="flex items-center gap-1 p-1 rounded-xl border"
              style={{ background:'#1a1d2e', borderColor:'#2a2d45' }}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background:  isActive ? '#232640' : 'transparent',
                      color:       isActive ? tab.color : '#4a4d6a',
                      border:      isActive ? `1px solid ${tab.color}30` : '1px solid transparent',
                    }}>
                    <Icon size={15} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        {/* Contenu */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="text-xs font-mono" style={{ color:'#4a4d6a' }}>plateforme</span>
            <span style={{ color:'#2a2d45' }}>/</span>
            <span className="text-xs font-mono font-semibold" style={{ color:'#8a8d9f' }}>
              {TABS.find(t => t.id === activeTab)?.label}
            </span>
          </div>

          <div className="rounded-2xl border p-6" style={{ background:'#0f1117', borderColor:'#2a2d45' }}>
            {/* Tous les panels sont montés en permanence — display:none quand inactif */}
            <div style={{ display: activeTab === 'ingest' ? 'block' : 'none' }}>
              <IngestionPanel />
            </div>
            <div style={{ display: activeTab === 'eda' ? 'block' : 'none' }}>
              <EDAPanel />
            </div>
            <div style={{ display: activeTab === 'train' ? 'block' : 'none' }}>
              <TrainingPanel />
            </div>
            <div style={{ display: activeTab === 'demo' ? 'block' : 'none' }}>
              <DemoPanel />
            </div>
            <div style={{ display: activeTab === 'leader' ? 'block' : 'none' }}>
              <Leaderboard />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t mt-12" style={{ borderColor:'#2a2d45' }}>
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <p className="text-xs font-mono" style={{ color:'#4a4d6a' }}>
              PFE Master 2 — Génie Logiciel · Plateforme d'expérimentation PdM
            </p>
            <p className="text-xs font-mono" style={{ color:'#4a4d6a' }}>
              FastAPI · TensorFlow · Keras Tuner · React · SQLite
            </p>
          </div>
        </footer>
      </div>
    </AppProvider>
  );
}