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
}) => {
  if (variant === 'mark') {
    return (
      <div className="h-10 w-10 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center p-1.5 shadow-md shrink-0">
        <img
          src="/hugo_h_mark.png"
          alt="H - Hugo Repuestos"
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <img
      src={theme === 'dark' ? '/hugo_logo_white.png' : '/hugo_logo_dark.png'}
      alt="Hugo Repuestos"
      className={`object-contain ${className}`}
    />
  );
};

