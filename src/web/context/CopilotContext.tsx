import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { apiFetch } from '../api/client';
import type { CopilotClientAction, CopilotChatResponse } from '../../shared/copilot';

export interface CopilotMessageItem {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  actions?: CopilotClientAction[];
  suggestedChips?: string[];
  timestamp: number;
}

interface CopilotContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleOpen: () => void;
  messages: CopilotMessageItem[];
  isLoading: boolean;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  executeAction: (action: CopilotClientAction) => void;
  isListening: boolean;
  hasSpeechSupport: boolean;
  startListening: () => void;
  stopListening: () => void;
  transcript: string;
  suggestedChips: string[];
}

const CopilotContext = createContext<CopilotContextType | undefined>(undefined);

const STORAGE_KEY = 'rh_copilot_messages';

const INITIAL_WELCOME_MESSAGE: CopilotMessageItem = {
  id: 'welcome',
  role: 'model',
  content:
    '¡Hola! Soy tu **Copiloto de Mostrador** en Hugo Repuestos 🛠️.\n\nPodés pedirme por voz o texto:\n• *"¿Cuánto stock de 6204 tenemos?"*\n• *"Sumame 2 crucetas ETM al carrito"*\n• *"¿Cómo cargo una factura de proveedor?"*\n• *"Buscar cliente por patente AE123XY"*\n\n¿En qué te puedo dar una mano hoy?',
  timestamp: Date.now(),
  suggestedChips: [
    'Sumame 2 crucetas ETM',
    '¿Cómo cargo una factura con IA?',
    '¿Cómo armo un presupuesto?',
    'Ir al Punto de Venta',
  ],
};

export const CopilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<CopilotMessageItem[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [INITIAL_WELCOME_MESSAGE];
  });

  const [suggestedChips, setSuggestedChips] = useState<string[]>(
    INITIAL_WELCOME_MESSAGE.suggestedChips || [],
  );

  // Reconocimiento de voz (Web Speech API)
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const hasSpeechSupport = typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const location = useLocation();
  const navigate = useNavigate();

  // Guardar mensajes en sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Inicializar Speech Recognition
  useEffect(() => {
    if (!hasSpeechSupport) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'es-AR';

    rec.onresult = (event: any) => {
      let current = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        current += event.results[i][0].transcript;
      }
      setTranscript(current);
    };

    rec.onerror = () => {
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
  }, [hasSpeechSupport]);

  const startListening = () => {
    if (!recognitionRef.current) return;
    setTranscript('');
    setIsListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!recognitionRef.current) return;
    setIsListening(false);
    try {
      recognitionRef.current.stop();
    } catch {}
  };

  const toggleOpen = () => setIsOpen((prev) => !prev);

  const clearMessages = () => {
    setMessages([INITIAL_WELCOME_MESSAGE]);
    setSuggestedChips(INITIAL_WELCOME_MESSAGE.suggestedChips || []);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  // Ejecutar acciones que manda el Copiloto
  const executeAction = (action: CopilotClientAction) => {
    if (!action) return;

    if (action.type === 'ADD_TO_CART') {
      const payload = action.payload;
      try {
        const raw = sessionStorage.getItem('rh_pos_cart');
        const cart: any[] = raw ? JSON.parse(raw) : [];

        const existingIdx = cart.findIndex((i) => i.productId === payload.productId || i.sku === payload.sku);
        if (existingIdx >= 0) {
          cart[existingIdx].quantity += payload.quantity || 1;
        } else {
          cart.push({
            productId: payload.productId,
            sku: payload.sku,
            name: payload.name,
            brand: payload.brand || null,
            unit: payload.unit || 'unidad',
            unitPriceCents: payload.unitPriceCents,
            quantity: payload.quantity || 1,
            availableStock: payload.availableStock ?? 999,
          });
        }

        sessionStorage.setItem('rh_pos_cart', JSON.stringify(cart));
        window.dispatchEvent(new Event('rh_cart_updated'));

        // Mensaje de confirmación del bot
        const confirmMsg: CopilotMessageItem = {
          id: `action_${Date.now()}`,
          role: 'system',
          content: `🛒 **${payload.name}** (x${payload.quantity || 1}) agregado al carrito del Punto de Venta.`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, confirmMsg]);

        // Si no está en POS, ofrecer ir
        if (location.pathname !== '/pos') {
          navigate('/pos');
        }
      } catch (err: any) {
        console.error('Error al agregar al carrito:', err);
      }
      return;
    }

    if (action.type === 'NAVIGATE') {
      const path = action.payload?.path || '/';
      navigate(path);
      return;
    }

    if (action.type === 'SHOW_CUSTOMER') {
      navigate('/crm');
      return;
    }

    if (action.type === 'OPEN_QUOTE') {
      navigate('/quotes');
      return;
    }

    if (action.type === 'SEARCH_PRODUCT') {
      navigate('/products');
      return;
    }
  };

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: CopilotMessageItem = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    // Calcular cuántos artículos hay actualmente en el carrito de mostrador
    let cartItemCount = 0;
    try {
      const raw = sessionStorage.getItem('rh_pos_cart');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cartItemCount = parsed.reduce((sum, item) => sum + (item.quantity || 1), 0);
        }
      }
    } catch {}

    // Formatear mensajes recientes para la API (máximo últimos 8 intercambios para contexto ágil)
    const recentMessages = newHistory
      .filter((m) => m.role === 'user' || m.role === 'model')
      .slice(-8)
      .map((m) => ({
        role: m.role as 'user' | 'model',
        content: m.content,
      }));

    try {
      const res = await apiFetch<CopilotChatResponse>('/copilot/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: recentMessages,
          currentRoute: location.pathname,
          cartItemCount,
        }),
      });

      const modelMsg: CopilotMessageItem = {
        id: `m_${Date.now()}`,
        role: 'model',
        content: res.reply,
        actions: res.actions,
        suggestedChips: res.suggestedChips,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, modelMsg]);
      if (res.suggestedChips && res.suggestedChips.length > 0) {
        setSuggestedChips(res.suggestedChips);
      }
    } catch (err: any) {
      const errorMsg: CopilotMessageItem = {
        id: `err_${Date.now()}`,
        role: 'model',
        content: `⚠️ Ocurrió una interrupción momentánea: ${err.message || 'No pude procesar tu consulta'}. Podés reintentar ahora o seleccionar una sugerencia directa.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CopilotContext.Provider
      value={{
        isOpen,
        setIsOpen,
        toggleOpen,
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
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
};

export const useCopilot = (): CopilotContextType => {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error('useCopilot debe ser utilizado dentro de un CopilotProvider');
  }
  return ctx;
};
