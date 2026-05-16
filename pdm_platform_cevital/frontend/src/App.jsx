/**
 * App.jsx — Application principale (Phase 0 — Cevital).
 *
 * Changements Phase 0 :
 *   ✅ Logo CEVITAL inline en haut à gauche (remplace l'icône Cpu générique)
 *   ✅ Toggle dark/light en haut à droite (persisté via AppContext)
 *   ✅ Onglets finaux : Préparation · Entraînement · Démo · Leaderboard
 *      (EDA + Ingestion fusionnés → Préparation Données)
 *   ✅ Bandeau "Microsoft Azure / Machine 99" supprimé → bandeau Cevital
 *   ✅ Toutes les couleurs passent par les variables CSS (theme-aware)
 *
 * Routes du backend en Phase 0 : démos OK, datasets/training renvoient 501.
 */
import { useState } from 'react';
import { BrainCircuit, Trophy, BookOpen, Sliders, Moon, Sun, Factory } from 'lucide-react';
import { AppProvider, useApp }   from './AppContext';
import TrainingPanel    from './components/TrainingPanel';
import Leaderboard      from './components/Leaderboard';
import DemoPanel        from './components/DemoPanel';
import PreparationPanel from './components/PreparationPanel';
import CevitalLogo      from './components/CevitalLogo';

const TABS = [
  { id: 'prep',   label: 'Préparation Données', icon: Sliders,      colorVar: '--accent-purple',
    subtitle: 'Cevital · EDA + Features + Prétraitement' },
  { id: 'train',  label: 'Entraînement',        icon: BrainCircuit, colorVar: '--accent-green',
    subtitle: 'Cevital · LSTM/GRU avec embedding composant' },
  { id: 'demo',   label: 'Démo',                icon: BookOpen,     colorVar: '--accent-purple',
    subtitle: 'Pédagogique · Architectures neuronales' },
  { id: 'leader', label: 'Leaderboard',         icon: Trophy,       colorVar: '--accent-orange',
    subtitle: 'Cevital · Modèles entraînés' },
];

function AppInner() {
  const [activeTab, setActiveTab] = useState('prep');
  const { theme, toggleTheme } = useApp();

  const activeMeta = TABS.find(t => t.id === activeTab);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-deep)' }}>
      {/* ─── Topbar ────────────────────────────────────────── */}
      <header className="border-b sticky top-0 z-50 theme-aware"
        style={{
          background: 'var(--header-bg-rgba)',
          borderColor: 'var(--border-default)',
          backdropFilter: 'blur(10px)',
        }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">

          {/* Logo + titre */}
          <div className="flex items-center gap-3">
            <CevitalLogo size={40} />
            <div>
              <h1 className="font-bold text-base leading-tight"
                  style={{ color: 'var(--text-primary)' }}>
                CEVITAL · PdM Platform
              </h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Maintenance Prédictive · GMAO · PFE Master 2
              </p>
            </div>
          </div>

          {/* Bandeau central — Cevital (remplace l'ancien "Machine 99 · Azure") */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono theme-aware"
            style={{
              background: 'var(--bg-card)',
              borderColor: 'var(--border-default)',
              color: 'var(--brand-primary)',
            }}>
            <Factory size={12} />
            PdM Cevital · Maintenance Prédictive GMAO
          </div>

          {/* Navigation + toggle thème */}
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 p-1 rounded-xl border theme-aware"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-default)',
              }}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      background: isActive ? 'var(--bg-elevated)' : 'transparent',
                      color:      isActive ? `var(${tab.colorVar})` : 'var(--text-muted)',
                      border:     isActive ? `1px solid var(${tab.colorVar})` : '1px solid transparent',
                    }}>
                    <Icon size={15} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Toggle thème */}
            <button onClick={toggleTheme}
              title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-all"
              style={{
                background: 'var(--bg-card)',
                borderColor: 'var(--border-default)',
                color: 'var(--brand-secondary)',
              }}>
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* ─── Contenu ─────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>cevital</span>
          <span style={{ color: 'var(--border-default)' }}>/</span>
          <span className="text-xs font-mono font-semibold"
                style={{ color: 'var(--text-tertiary)' }}>
            {activeMeta?.label}
          </span>
          {activeMeta?.subtitle && (
            <>
              <span style={{ color: 'var(--border-default)' }}>·</span>
              <span className="text-xs font-mono"
                    style={{ color: 'var(--text-muted)' }}>
                {activeMeta.subtitle}
              </span>
            </>
          )}
        </div>

        <div className="rounded-2xl border p-6 theme-aware"
          style={{
            background: 'var(--bg-panel)',
            borderColor: 'var(--border-default)',
          }}>
          {/* Tous les panels montés en permanence (préserver l'état lors des
              changements d'onglet — entraînement en arrière-plan, etc.) */}
          <div style={{ display: activeTab === 'prep'   ? 'block' : 'none' }}>
            <PreparationPanel />
          </div>
          <div style={{ display: activeTab === 'train'  ? 'block' : 'none' }}>
            <TrainingPanel />
          </div>
          <div style={{ display: activeTab === 'demo'   ? 'block' : 'none' }}>
            <DemoPanel />
          </div>
          <div style={{ display: activeTab === 'leader' ? 'block' : 'none' }}>
            <Leaderboard />
          </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────────── */}
      <footer className="border-t mt-12 theme-aware"
        style={{ borderColor: 'var(--border-default)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            PFE Master 2 — Génie Logiciel · Plateforme PdM Cevital
          </p>
          <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            FastAPI · TensorFlow · Keras Tuner · React · SQLite
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
