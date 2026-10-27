import React, { useState, useRef, useEffect } from 'react';
import { Barcode, Search, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { normalizeCode } from '../../shared/barcode';

interface BarcodeScannerProps {
  onScan: (code: string) => Promise<boolean | void> | boolean | void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  placeholder = 'Escanear código de barras o ingresar SKU...',
  autoFocus = true,
  className = '',
}) => {
  const [inputVal, setInputVal] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanTimeRef = useRef<number>(0);
  const feedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    setFeedback({ type, message });
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  const handleProcessCode = async (raw: string) => {
    const code = normalizeCode(raw);
    if (!code) return;

    // Prevención de doble disparo por lectores rápidos (debouncing de 350ms sobre el mismo código)
    const now = Date.now();
    if (now - lastScanTimeRef.current < 350) {
      return;
    }
    lastScanTimeRef.current = now;

    setIsProcessing(true);
    try {
      const res = await onScan(code);
      if (res === false) {
        showFeedback('error', `Código "${code}" no encontrado en el catálogo.`);
      } else {
        showFeedback('success', `Código "${code}" leído.`);
      }
      setInputVal('');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Error al procesar el código.');
    } finally {
      setIsProcessing(false);
      // Mantener foco en el campo para lecturas consecutivas
      if (autoFocus && inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Los lectores físicos tipo teclado suelen enviar Enter al final del código
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProcessCode(inputVal);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex items-center">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Barcode className="h-5 w-5" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isProcessing}
          placeholder={placeholder}
          className="w-full pl-11 pr-24 py-2.5 bg-white border border-slate-300 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm shadow-xs transition-colors"
          autoComplete="off"
          spellCheck="false"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 space-x-1">
          <button
            type="button"
            onClick={() => handleProcessCode(inputVal)}
            disabled={isProcessing || !inputVal.trim()}
            className="inline-flex items-center px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-medium rounded-md shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Search className="h-3.5 w-3.5 mr-1" />
                <span>Buscar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Indicador de estado / feedback de lectura */}
      {feedback && (
        <div
          className={`mt-1.5 flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{feedback.message}</span>
        </div>
      )}
    </div>
  );
};
