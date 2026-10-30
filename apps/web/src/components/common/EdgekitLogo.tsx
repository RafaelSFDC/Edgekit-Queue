import React, { useId, type SVGProps } from 'react';

export type EdgekitModuleId = 'platform' | 'auth' | 'storage' | 'queue' | 'events';

// Legacy compatibility type
export type DioramaAppId = EdgekitModuleId | 'desktop' | 'driver' | 'update' | 'library' | 'care';

/**
 * Mapeamento das cores oficiais da família Edgekit.
 * Cada módulo possui uma cor de destaque no ecossistema, compartilhando o mesmo formato de logo.
 */
export const EDGEKIT_MODULE_HEX: Record<EdgekitModuleId, string> = {
  platform: '#F38020', // Orange (Cloudflare / Hub)
  auth: '#6366F1',     // Indigo (Auth / Sessions)
  storage: '#10B981',  // Emerald (Buckets / R2)
  queue: '#EC4899',    // Pink (Jobs / Messages)
  events: '#0EA5E9',   // Sky Blue (Realtime / WebSockets)
};

export const EDGEKIT_MODULE_COLORS: Record<EdgekitModuleId, string> = {
  platform: 'var(--primary, #0EA5E9)',
  auth: 'var(--primary, #0EA5E9)',
  storage: 'var(--primary, #0EA5E9)',
  queue: 'var(--primary, #0EA5E9)',
  events: 'var(--primary, #0EA5E9)',
};

export const EDGEKIT_MODULE_CSS_VARS: Record<EdgekitModuleId, string> = {
  platform: '--edgekit-platform',
  auth: '--edgekit-auth',
  storage: '--edgekit-storage',
  queue: '--edgekit-queue',
  events: '--edgekit-events',
};

// Backwards compatibility aliases
export const DIORAMA_APP_COLORS: Record<string, string> = {
  ...EDGEKIT_MODULE_COLORS,
  desktop: 'var(--edgekit-platform, #F38020)',
  driver: 'var(--edgekit-auth, #6366F1)',
  update: 'var(--edgekit-storage, #10B981)',
  library: 'var(--edgekit-queue, #EC4899)',
  care: 'var(--edgekit-events, #0EA5E9)',
};

export interface EdgekitLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
  variant?: 'app-icon' | 'symbol' | 'glow';
  module?: EdgekitModuleId;
  app?: DioramaAppId; // Alias for module
}

/**
 * Componente oficial de Logo do Edgekit.
 * No ecossistema Edgekit (como no Diorama), todos os projetos compartilham a mesma marca vetorial
 * de alta performance, variando apenas a cor de identificação de cada módulo.
 */
export function EdgekitLogo({
  size = 24,
  variant = 'app-icon',
  module = 'events',
  app,
  className = '',
  fill,
  ...props
}: EdgekitLogoProps) {
  const gradientId = useId();
  const activeModule = (app as EdgekitModuleId) ?? module;

  const brandColor =
    fill ??
    (activeModule && EDGEKIT_MODULE_COLORS[activeModule]
      ? EDGEKIT_MODULE_COLORS[activeModule]
      : 'var(--edgekit-events, #0EA5E9)');

  const coreFill = variant === 'symbol' ? (fill ?? 'currentColor') : brandColor;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id={`edge-grad-${gradientId}`}
          x1="5"
          y1="3"
          x2="35"
          y2="37"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={coreFill} stopOpacity="0.8" />
          <stop offset="1" stopColor={coreFill} stopOpacity="0.15" />
        </linearGradient>
      </defs>

      {/* Hexagonal Edge Network Node */}
      <path
        d="M20 3.5L34.5 11.87V28.13L20 36.5L5.5 28.13V11.87L20 3.5Z"
        stroke={`url(#edge-grad-${gradientId})`}
        strokeWidth="2.2"
        strokeLinejoin="round"
        fill={coreFill}
        fillOpacity="0.08"
      />

      {/* Micro-nodes at vertices */}
      <circle cx="20" cy="3.5" r="1.5" fill={coreFill} />
      <circle cx="34.5" cy="11.87" r="1.5" fill={coreFill} />
      <circle cx="34.5" cy="28.13" r="1.5" fill={coreFill} />
      <circle cx="20" cy="36.5" r="1.5" fill={coreFill} />
      <circle cx="5.5" cy="28.13" r="1.5" fill={coreFill} />
      <circle cx="5.5" cy="11.87" r="1.5" fill={coreFill} />

      {/* Lightning Speed Core */}
      <path
        d="M21.5 8L11 21H19.5L17.5 32L29 19H20.5L22.5 8Z"
        fill={coreFill}
      />
    </svg>
  );
}
