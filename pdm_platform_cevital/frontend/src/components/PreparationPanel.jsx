/**
 * PreparationPanel.jsx — PLACEHOLDER Phase 0.
 *
 * Sera remplacé en Phase 2 par un container avec 5 sous-onglets stepper :
 *   1. EDA Brute          (RawEDA.jsx)
 *   2. Feature Engineering (FeatureEngineering.jsx)
 *   3. EDA Features       (FeaturesEDA.jsx)
 *   4. Prétraitement      (Preprocessing.jsx)
 *   5. Fusion / Réentr.   (MergeDatasets.jsx)
 *
 * Phase 0 = juste un écran d'attente pour ne pas casser l'App.
 */
import React from 'react';
import { BarChart3, Cog, TrendingUp, Layers, GitMerge, Clock } from 'lucide-react';

const STEPS = [
  { id: 'raw_eda',      label: 'EDA Brute',           icon: BarChart3 },
  { id: 'features',     label: 'Feature Engineering', icon: Cog },
  { id: 'features_eda', label: 'EDA Features',        icon: TrendingUp },
  { id: 'preprocessing',label: 'Prétraitement',       icon: Layers },
  { id: 'merge',        label: 'Fusion / Réentr.',    icon: GitMerge },
];

export default function PreparationPanel() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          📊 Préparation Données
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          Cevital · EDA + Features + Prétraitement
        </p>
      </div>

      {/* Aperçu des 5 sous-onglets à venir */}
      <div className="rounded-2xl border p-6"
        style={{
          background: 'var(--bg-elevated)',
          borderColor: 'var(--border-default)',
        }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} style={{ color: 'var(--brand-secondary)' }} />
          <p className="text-sm font-semibold uppercase tracking-widest"
             style={{ color: 'var(--text-tertiary)' }}>
            Phase 2 — à venir
          </p>
        </div>

        <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Cet onglet sera implémenté en <b>Phase 2</b> de la roadmap.
          Il contiendra un <b>stepper à 5 sous-onglets</b> permettant de préparer
          un dataset Cevital (failure + equipment) du chargement brut jusqu'aux
          tenseurs LSTM/GRU prêts à l'entraînement :
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.id}
                className="rounded-xl border p-4 flex flex-col items-center text-center"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-subtle)',
                }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                  style={{
                    background: 'var(--brand-primary)',
                    color: 'var(--bg-elevated)',
                    fontSize: 14,
                    fontWeight: 700,
                  }}>
                  {i + 1}
                </div>
                <Icon size={18} style={{ color: 'var(--brand-primary)' }} />
                <p className="text-xs font-semibold mt-2"
                   style={{ color: 'var(--text-primary)' }}>
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-5 px-4 py-3 rounded-lg text-xs leading-relaxed"
          style={{
            background: 'var(--bg-base)',
            color: 'var(--text-muted)',
            borderLeft: '3px solid var(--brand-secondary)',
          }}>
          ℹ️ En attendant : tu peux déjà tester les <b>démos pédagogiques</b>
          (onglet "Démo") et consulter le <b>Leaderboard</b> vierge. Les
          backends datasets/preprocessing répondent <code>501 Not Implemented</code>
          pour l'instant — c'est attendu en Phase 0.
        </div>
      </div>
    </div>
  );
}
