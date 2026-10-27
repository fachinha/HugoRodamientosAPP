import React from 'react';

interface LogoProps {
  variant?: 'full' | 'compact' | 'mark' | 'image';
  theme?: 'dark' | 'light';
  className?: string;
  showSubtitle?: boolean;
}

/**
 * Componente oficial de Identidad Visual para Hugo Repuestos / Rodamientos Hugo
 * Basado en la identidad visual de @hugo_repuestos (Instagram oficial)
 * - 'H' en tono Racing Orange / Industrial (#FF3500) con espolón aerodinámico
 * - 'UGO' en tipografía itálica tubular contorneada unida por barra superior
 * - 'REPUESTOS' en bloque geométrico espaciado
 * - 'INDUSTRIAL Y AUTOMOTRIZ' subtítulo técnico
 */
export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  theme = 'dark',
  className = 'h-9 w-auto',
  showSubtitle = true,
}) => {
  const textColor = theme === 'dark' ? '#FFFFFF' : '#18181B';
  const subtitleColor = theme === 'dark' ? '#A1A1AA' : '#52525B';

  if (variant === 'image') {
    return (
      <img
        src={theme === 'dark' ? '/hugo_logo_white.png' : '/hugo_logo_dark.png'}
        alt="Hugo Repuestos"
        className={`object-contain ${className}`}
      />
    );
  }

  if (variant === 'mark') {
    return (
      <div className="h-10 w-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center p-1.5 shadow-md shrink-0">
        <svg viewBox="0 0 64 64" className="w-full h-full" fill="none">
          <g transform="translate(6, 6) skewX(-14)">
            {/* H con espolón aerodinámico */}
            <path d="M 13 8 L 22 8 L 22 44 L 13 44 Z" fill="#FF3500" />
            <path d="M 30 8 L 39 8 L 39 44 L 30 44 Z" fill="#FF3500" />
            <path d="M 3 22 L 40 22 L 40 30 L 10 30 Z" fill="#FF3500" />
          </g>
        </svg>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <svg
        viewBox="0 0 380 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <g transform="translate(5, 5)">
          <g transform="skewX(-16)">
            {/* Orange Racing H */}
            <path d="M 32 10 L 53 10 L 53 68 L 32 68 Z" fill="#FF3500" />
            <path d="M 72 10 L 93 10 L 93 68 L 72 68 Z" fill="#FF3500" />
            <path d="M 7 34 L 96 34 L 96 46 L 20 46 Z" fill="#FF3500" />

            {/* Barra superior conectora U-G-O */}
            <path d="M 112 10 L 332 10 L 346 22 L 332 22 L 112 22 Z" fill={textColor} />

            {/* U contorneada */}
            <path
              d="M 114 20 L 130 20 L 130 52 Q 130 66 147 66 Q 164 66 164 52 L 164 20 L 180 20 L 180 52 Q 180 78 147 78 Q 114 78 114 52 Z"
              fill={textColor}
            />

            {/* G contorneada */}
            <path
              d="M 194 20 L 258 20 L 258 32 L 210 32 L 210 56 L 242 56 L 242 45 L 226 45 L 226 36 L 258 36 L 258 66 Q 258 78 236 78 L 210 78 Q 194 78 194 58 Z"
              fill={textColor}
            />

            {/* O contorneada */}
            <path
              d="M 272 20 L 316 20 Q 338 20 338 46 Q 338 78 316 78 L 272 78 Q 250 78 250 48 Q 250 20 272 20 Z M 274 32 Q 266 32 266 48 Q 266 66 274 66 L 314 66 Q 322 66 322 48 Q 322 32 314 32 Z"
              fill={textColor}
            />
          </g>

          <text
            x="365"
            y="20"
            fill="#71717A"
            fontFamily="system-ui, sans-serif"
            fontWeight="900"
            fontSize="8"
          >
            TM
          </text>
        </g>
      </svg>
    );
  }

  // Full variant (por defecto)
  return (
    <svg
      viewBox="0 0 420 125"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <filter id="hugoGlow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#FF3500" floodOpacity="0.3" />
        </filter>
      </defs>

      <g transform="translate(10, 8)">
        {/* Wordmark itálico */}
        <g transform="skewX(-16)">
          {/* H deportiva en Racing Orange */}
          <path d="M 32 10 L 53 10 L 53 72 L 32 72 Z" fill="#FF3500" filter="url(#hugoGlow)" />
          <path d="M 72 10 L 93 10 L 93 72 L 72 72 Z" fill="#FF3500" filter="url(#hugoGlow)" />
          <path d="M 7 36 L 96 36 L 96 49 L 20 49 Z" fill="#FF3500" filter="url(#hugoGlow)" />

          {/* Barra superior conectora U-G-O */}
          <path d="M 112 10 L 332 10 L 346 22 L 332 22 L 112 22 Z" fill={textColor} />

          {/* U contorneada */}
          <path
            d="M 114 20 L 130 20 L 130 54 Q 130 68 147 68 Q 164 68 164 54 L 164 20 L 180 20 L 180 54 Q 180 80 147 80 Q 114 80 114 54 Z"
            fill={textColor}
          />

          {/* G contorneada */}
          <path
            d="M 194 20 L 258 20 L 258 32 L 210 32 L 210 58 L 242 58 L 242 46 L 226 46 L 226 36 L 258 36 L 258 68 Q 258 80 236 80 L 210 80 Q 194 80 194 60 Z"
            fill={textColor}
          />

          {/* O contorneada */}
          <path
            d="M 272 20 L 316 20 Q 338 20 338 48 Q 338 80 316 80 L 272 80 Q 250 80 250 50 Q 250 20 272 20 Z M 274 32 Q 266 32 266 50 Q 266 68 274 68 L 314 68 Q 322 68 322 50 Q 322 32 314 32 Z"
            fill={textColor}
          />
        </g>

        {/* Marca TM */}
        <text
          x="365"
          y="22"
          fill="#71717A"
          fontFamily="system-ui, sans-serif"
          fontWeight="900"
          fontSize="8"
        >
          TM
        </text>

        {/* R E P U E S T O S */}
        <text
          x="185"
          y="94"
          fill={textColor}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="900"
          fontSize="15"
          letterSpacing="9"
          textAnchor="middle"
        >
          REPUESTOS
        </text>

        {/* INDUSTRIAL Y AUTOMOTRIZ */}
        {showSubtitle && (
          <text
            x="185"
            y="108"
            fill={subtitleColor}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="700"
            fontSize="7.5"
            letterSpacing="4"
            textAnchor="middle"
          >
            INDUSTRIAL Y AUTOMOTRIZ
          </text>
        )}
      </g>
    </svg>
  );
};
