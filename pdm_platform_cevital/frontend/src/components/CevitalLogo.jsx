/**
 * CevitalLogo.jsx — Logo CEVITAL inline (SVG vectoriel, thème-aware).
 *
 * Pas d'asset image : le logo est entièrement défini en SVG inline pour :
 *   - rester net à toute taille
 *   - respecter automatiquement la palette CEVITAL via les variables CSS
 *     (--brand-primary = bleu, --brand-secondary = jaune)
 *
 * Usage :
 *   <CevitalLogo size={36} />
 *   <CevitalLogo size={48} withText />   // affiche aussi "CEVITAL" à droite
 */
import React from 'react';

export default function CevitalLogo({
  size = 36,
  withText = false,
  className = '',
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* ─── Marque SVG ──────────────────────────────────────── */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Logo CEVITAL"
      >
        {/* Fond arrondi bleu */}
        <rect
          x="2" y="2" width="60" height="60" rx="14"
          fill="var(--brand-primary)"
        />

        {/* Arc supérieur jaune (épi stylisé) */}
        <path
          d="M14 22 Q32 6 50 22"
          stroke="var(--brand-secondary)"
          strokeWidth="4.5"
          strokeLinecap="round"
          fill="none"
        />

        {/* Lettre "C" en blanc, large */}
        <path
          d="M44 24
             a16 16 0 1 0 0 16"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Point jaune (accent) */}
        <circle
          cx="46" cy="46" r="3.5"
          fill="var(--brand-secondary)"
        />
      </svg>

      {/* ─── Wordmark optionnel ──────────────────────────────── */}
      {withText && (
        <div className="leading-none">
          <p
            className="font-bold tracking-wider"
            style={{
              color: 'var(--brand-primary)',
              fontSize: size * 0.45,
              letterSpacing: '0.08em',
            }}
          >
            CEVITAL
          </p>
          <p
            className="font-mono uppercase"
            style={{
              color: 'var(--text-tertiary)',
              fontSize: size * 0.22,
              letterSpacing: '0.18em',
              marginTop: 2,
            }}
          >
            PdM Platform
          </p>
        </div>
      )}
    </div>
  );
}
