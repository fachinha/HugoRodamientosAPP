import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  X,
  Send,
  Mic,
  MicOff,
  RotateCcw,
  ShoppingCart,
  ArrowRight,
  ExternalLink,
  User,
  Package,
  Layers,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { useCopilot, type CopilotMessageItem } from '../context/CopilotContext';
import type { CopilotClientAction } from '../../shared/copilot';

export const CopilotDrawer: React.FC = () => {
  const {
    isOpen,
    toggleOpen,
    setIsOpen,
    messages,
    isLoading,
    sendMessage,
    clearMessages,
    executeAction,
    isListening,
    hasSpeechSupport,
    startListening,
    stopListening,
    transcript,
    suggestedChips,
  } = useCopilot();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll al final al recibir nuevos mensajes
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  // Si hay transcripción de voz activa, actualizar input
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  // Focus en el input al abrir el drawer
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (isListening) stopListening();
    const query = input;
    setInput('');
    sendMessage(query);
  };

  const handleChipClick = (chip: string) => {
    if (isLoading) return;
    sendMessage(chip);
  };

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-1.5 text-xs leading-relaxed">
        {lines.map((line, idx) => {
          if (!line.trim()) {
            return <div key={idx} className="h-1.5" />;
          }

          // Procesar negrita (**texto**) y código (`texto`)
          const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);

          return (
            <p key={idx} className={line.startsWith('•') || line.startsWith('-') ? 'pl-2' : ''}>
              {parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <strong key={pIdx} className="font-semibold text-slate-900">
                      {part.slice(2, -2)}
                    </strong>
                  );
                }
                if (part.startsWith('`') && part.endsWith('`')) {
                  return (
                    <code
                      key={pIdx}
                      className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[11px]"
                    >
                      {part.slice(1, -1)}
                    </code>
                  );
                }
                return part;
              })}
            </p>
          );
        })}
      </div>
    );
  };

  const renderActionCard = (action: CopilotClientAction, idx: number) => {
    if (action.type === 'ADD_TO_CART') {
      return (
        <button
          key={idx}
          type="button"
          onClick={() => executeAction(action)}
          className="mt-2 w-full flex items-center justify-between gap-2 p-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg text-left transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShoppingCart className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-orange-950 truncate">{action.title}</p>
              <p className="text-[11px] text-orange-800 truncate">{action.summary}</p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-medium text-orange-600 group-hover:translate-x-0.5 transition-transform">
            Sumar 🛒
          </span>
        </button>
      );
    }

    if (action.type === 'NAVIGATE') {
      return (
        <button
          key={idx}
          type="button"
          onClick={() => executeAction(action)}
          className="mt-2 w-full flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-left transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-7 w-7 rounded-full bg-slate-700 text-white flex items-center justify-center shrink-0">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-900 truncate">{action.title}</p>
              <p className="text-[10px] text-slate-500 truncate">{action.summary}</p>
            </div>
          </div>
          <span className="shrink-0 text-xs text-slate-500 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all">
            Ir ➔
          </span>
        </button>
      );
    }

    if (action.type === 'SHOW_CUSTOMER') {
      return (
        <button
          key={idx}
          type="button"
          onClick={() => executeAction(action)}
          className="mt-2 w-full flex items-center justify-between gap-2 p-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-indigo-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-indigo-950 truncate">{action.title}</p>
              <p className="text-[10px] text-indigo-700 truncate">{action.summary}</p>
            </div>
          </div>
          <span className="shrink-0 text-xs font-medium text-indigo-600">Ver Ficha</span>
        </button>
      );
    }

    return null;
  };

  return (
    <>
      {/* Botón flotante siempre visible para abrir el Copiloto (compacto 48px en móvil para no tapar UI) */}
      {!isOpen && (
        <button
          type="button"
          onClick={toggleOpen}
          aria-label="Abrir Copiloto de Mostrador"
          title="Abrir Copiloto IA"
          className="fixed bottom-4 right-4 z-40 h-12 w-12 sm:h-auto sm:w-auto sm:px-3.5 sm:py-2 flex items-center justify-center gap-2 bg-linear-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white rounded-full shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-96 opacity-100 pointer-events-auto translate-y-0 transition-all duration-200 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 no-print"
        >
          <Sparkles className="h-5 w-5 sm:h-4 sm:w-4 animate-pulse text-amber-200 shrink-0" />
          <span className="hidden sm:inline text-xs font-semibold tracking-wide">Copiloto IA</span>
        </button>
      )}

      {/* Drawer desplegable lateral */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 sm:bottom-5 sm:right-5 z-50 w-full sm:w-96 max-w-full h-[580px] sm:h-[620px] max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 no-print">
          {/* Encabezado */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shrink-0 shadow-xs">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white truncate flex items-center gap-1.5">
                  Copiloto Hugo Repuestos
                </h3>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[10px] text-zinc-300 font-medium truncate">
                    Asistente de Mostrador y Stock
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearMessages}
                title="Reiniciar conversación"
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Cerrar copiloto"
                className="p-1.5 text-zinc-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Historial de mensajes */}
          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 bg-slate-50/80">
            {messages.map((msg) => {
              if (msg.role === 'user') {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-orange-600 text-white rounded-2xl rounded-tr-xs px-3.5 py-2 shadow-xs text-xs">
                      <p>{msg.content}</p>
                    </div>
                  </div>
                );
              }

              if (msg.role === 'system') {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="max-w-[90%] bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg px-3 py-1.5 text-[11px] text-center shadow-2xs font-medium">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Model
              return (
                <div key={msg.id} className="flex gap-2 items-start">
                  <div className="h-6 w-6 rounded-full bg-slate-900 text-orange-400 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold">
                    H
                  </div>
                  <div className="max-w-[88%] bg-white border border-slate-200 rounded-2xl rounded-tl-xs px-3.5 py-2.5 shadow-xs text-slate-800">
                    {renderFormattedText(msg.content)}

                    {/* Acciones interactivas asociadas */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {msg.actions.map((act, aIdx) => renderActionCard(act, aIdx))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Indicador de carga cuando el modelo piensa */}
            {isLoading && (
              <div className="flex gap-2 items-center text-xs text-slate-500 pl-2">
                <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
                <span>Consultando stock y sistema...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Chips de sugerencias rápidas */}
          {suggestedChips.length > 0 && (
            <div className="p-2 bg-slate-100/90 border-t border-slate-200 flex gap-1.5 overflow-x-auto no-scrollbar">
              {suggestedChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  disabled={isLoading}
                  className="shrink-0 text-[11px] font-medium px-2.5 py-1 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 hover:border-orange-300 rounded-full shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          {/* Pie: formulario de entrada de texto o voz */}
          <form
            onSubmit={handleSubmit}
            className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-1.5"
          >
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                title={isListening ? 'Detener micrófono' : 'Hablar por micrófono (es-AR)'}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-md'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening
                  ? 'Escuchando tu voz...'
                  : 'Escribí o hablá: ej. "Stock de 6204"...'
              }
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
