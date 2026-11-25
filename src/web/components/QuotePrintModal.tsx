import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  MessageCircle,
  Copy,
  Check,
  User,
  Car,
  Phone,
  Mail,
  Send,
} from 'lucide-react';
import { Logo } from './Logo';
import { formatARS } from '../../shared/money';
import { formatDateTime, formatDate } from '../../shared/time';
import { apiFetch } from '../api/client';
import {
  type QuoteDetail,
  formatWhatsAppPhone,
  buildWhatsAppQuoteMessage,
  buildMailtoQuoteUrl,
  buildGmailComposeQuoteUrl,
} from '../../shared/quotes';

interface QuotePrintModalProps {
  quote: QuoteDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onQuoteSent?: () => void;
}

export const QuotePrintModal: React.FC<QuotePrintModalProps> = ({
  quote,
  isOpen,
  onClose,
  onQuoteSent,
}) => {
  const [copied, setCopied] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  useEffect(() => {
    if (quote && isOpen) {
      setRecipientEmail(quote.customerEmail || '');
      setRecipientPhone(quote.customerPhone || '');
    }
  }, [quote, isOpen]);

  if (!isOpen || !quote) return null;

  const markAsSentIfNeeded = async () => {
    if (quote.status === 'draft') {
      try {
        await apiFetch(`/quotes/${quote.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent' }),
        });
        onQuoteSent?.();
      } catch {
        // Ignorar si ya fue actualizado
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyWhatsApp = async () => {
    const text = buildWhatsAppQuoteMessage(quote);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleOpenWhatsApp = () => {
    markAsSentIfNeeded();
    const phone = formatWhatsAppPhone(recipientPhone || quote.customerPhone);
    const text = encodeURIComponent(buildWhatsAppQuoteMessage(quote));
    const url = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSendMailto = () => {
    markAsSentIfNeeded();
    const url = buildMailtoQuoteUrl(quote, recipientEmail);
    window.location.href = url;
  };

  const handleOpenGmailWeb = () => {
    markAsSentIfNeeded();
    const url = buildGmailComposeQuoteUrl(quote, recipientEmail);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const vehicleDetails = [
    quote.vehicleBrand,
    quote.vehicleModel,
    quote.vehicleYear ? `Año ${quote.vehicleYear}` : null,
    quote.vehicleEngine ? `Motor: ${quote.vehicleEngine}` : null,
    quote.vehiclePlate ? `Patente: ${quote.vehiclePlate.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const segNum = quote.trackingNumber || quote.quoteNumber.replace('COT-', 'SEG-');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:static print:bg-white print:overflow-visible">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl flex flex-col overflow-hidden max-h-[96vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none">
        {/* Barra superior de envío rápido de Comprobante Interno (no-print) */}
        <div className="bg-slate-900 text-white px-5 py-3.5 space-y-3 no-print border-b border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-600/20 text-orange-400 rounded-lg">
                <Printer className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  Comprobante Interno de Presupuesto {quote.quoteNumber}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Cliente: {quote.customerName} · Seguimiento: {segNum}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all active:scale-96 cursor-pointer"
                title="Enviar comprobante interno por WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Enviar por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleSendMailto}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all active:scale-96 cursor-pointer"
                title="Enviar comprobante interno por Correo Electrónico"
              >
                <Mail className="h-4 w-4" />
                <span>Enviar por Mail</span>
              </button>

              <button
                type="button"
                onClick={handleOpenGmailWeb}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold rounded-lg transition-all active:scale-96 cursor-pointer"
                title="Abrir redacción directa en Gmail Web con el comprobante cargado"
              >
                <Send className="h-3.5 w-3.5 text-sky-400" />
                <span>Gmail Web</span>
              </button>

              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-all active:scale-96 cursor-pointer"
                title="Copiar comprobante formateado"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    <span>Copiar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all active:scale-96 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir / PDF</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ml-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Campos editables al vuelo para destinatario de WhatsApp y Mail */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800 text-xs">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Phone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-slate-400 shrink-0">WhatsApp:</span>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="Ej: 294 4629707"
                className="bg-transparent text-white text-xs w-full focus:outline-hidden"
              />
            </div>
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700">
              <Mail className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span className="text-[11px] text-slate-400 shrink-0">Mail cliente:</span>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="Ingresá el correo para enviar el comprobante..."
                className="bg-transparent text-white text-xs w-full focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Hoja oficial de Comprobante Interno de Presupuesto imprimible */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 text-slate-900 print:p-4 print:space-y-4 print:overflow-visible">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b-2 border-slate-800 print:pb-3">
            <div className="flex items-start gap-4">
              <Logo theme="light" className="h-14 w-auto object-contain" />
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  Hugo Repuestos
                </h1>
                <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                  Rodamientos · Rulemanes · Retenes · Repuestos Automotor e Industrial
                </p>
                <div className="text-[11px] text-slate-600 space-y-0.5 mt-1">
                  <p>
                    <span className="font-semibold">CUIT:</span> 20-29045532-5 · IVA Responsable Inscripto
                  </p>
                  <p>
                    <span className="font-semibold">Dirección:</span> Fagnano 1065, San Carlos de Bariloche, Río Negro
                  </p>
                  <p>
                    <span className="font-semibold">Teléfono / WhatsApp:</span> (294) 462-9707 · <span className="font-semibold">Email:</span> rodamientoshugo@gmail.com
                  </p>
                </div>
              </div>
            </div>

            <div className="sm:text-right bg-slate-50 border border-slate-200 rounded-lg p-3 min-w-[225px] print:bg-transparent print:border-slate-300">
              <div className="inline-block bg-orange-600 text-white font-mono font-bold text-[11px] px-2.5 py-0.5 rounded tracking-wider uppercase mb-1">
                COMPROBANTE INTERNO
              </div>
              <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                {quote.quoteNumber}
              </p>
              <p className="text-[11px] font-mono font-bold text-slate-600">
                Seguimiento: {segNum}
              </p>
              <div className="text-[11px] text-slate-600 space-y-0.5 mt-1 font-sans">
                <p>
                  <span className="font-semibold">Fecha:</span> {formatDateTime(quote.createdAt)}
                </p>
                <p>
                  <span className="font-semibold">Validez:</span> {quote.validDays} días corridos (hasta {formatDate(quote.validUntil)})
                </p>
                <p>
                  <span className="font-semibold">Asesor:</span> {quote.userName}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 print:bg-transparent print:border-slate-300">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <User className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Datos del Cliente {quote.customerType === 'empresa' ? '(Empresa / Taller)' : ''}
                </h4>
              </div>
              <div className="text-xs space-y-1">
                <p className="font-bold text-slate-900 text-sm">{quote.customerName}</p>
                {quote.customerCuit && (
                  <p className="text-slate-600">
                    <span className="font-semibold">CUIT / DNI:</span> {quote.customerCuit}
                  </p>
                )}
                {(quote.customerPhone || recipientPhone) && (
                  <p className="text-slate-600 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    <span>{quote.customerPhone || recipientPhone}</span>
                  </p>
                )}
                {(quote.customerEmail || recipientEmail) && (
                  <p className="text-slate-600 flex items-center gap-1">
                    <Mail className="h-3 w-3 text-slate-400" />
                    <span>{quote.customerEmail || recipientEmail}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 print:bg-transparent print:border-slate-300">
              <div className="flex items-center gap-2 mb-2 text-slate-800">
                <Car className="h-4 w-4 text-orange-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  Datos del Vehículo / Aplicación
                </h4>
              </div>
              {vehicleDetails ? (
                <div className="text-xs space-y-1 text-slate-700">
                  <p className="font-semibold text-slate-900 text-sm">
                    {quote.vehicleBrand || ''} {quote.vehicleModel || 'Sin modelo especificado'}
                  </p>
                  <p className="text-slate-600">
                    {quote.vehicleYear ? `Año: ${quote.vehicleYear}` : ''}
                    {quote.vehicleYear && quote.vehicleEngine ? ' · ' : ''}
                    {quote.vehicleEngine ? `Motor: ${quote.vehicleEngine}` : ''}
                  </p>
                  {quote.vehiclePlate && (
                    <p className="text-slate-900 font-mono font-bold">
                      Patente:{' '}
                      <span className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800 uppercase">
                        {quote.vehiclePlate}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  No se especificó vehículo (repuestos generales o mostrador).
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg print:border-slate-300">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 print:bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-center w-12">Cant.</th>
                    <th className="px-3 py-2 w-28">Código / SKU</th>
                    <th className="px-3 py-2">Descripción del Repuesto</th>
                    <th className="px-3 py-2 w-24">Marca</th>
                    <th className="px-3 py-2 text-center w-28">Disponibilidad</th>
                    <th className="px-3 py-2 text-right w-24">P. Unitario</th>
                    <th className="px-3 py-2 text-right w-16">Dto %</th>
                    <th className="px-3 py-2 text-right w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 print:divide-slate-200 font-sans">
                  {quote.items.map((item, idx) => {
                    const availBadge =
                      item.availability === 'in_stock' ? (
                        <span className="text-emerald-700 font-medium">En stock</span>
                      ) : item.availability === 'to_order' ? (
                        <span className="text-amber-700 font-medium">A pedido (24/48hs)</span>
                      ) : (
                        <span className="text-slate-600 font-medium">A confirmar</span>
                      );

                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                          {item.sku || '-'}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {item.description}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{item.brand || '-'}</td>
                        <td className="px-3 py-2.5 text-center text-[10px]">{availBadge}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-700">
                          {formatARS(item.unitPriceCents)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                          {item.discountPct > 0 ? `${item.discountPct}%` : '-'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                          {formatARS(item.lineTotalCents)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2">
            <div className="sm:col-span-7 space-y-3">
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 space-y-1 print:border-slate-300 print:bg-transparent">
                <p className="font-bold uppercase tracking-wider text-[10px] text-amber-800">
                  Condiciones Comerciales y Validez:
                </p>
                <p>
                  • <span className="font-semibold">Forma de pago:</span> {quote.paymentTerms}
                </p>
                <p>
                  • <span className="font-semibold">Plazo de validez:</span> {quote.validDays} días corridos ({formatDate(quote.validUntil)}).
                </p>
                <p className="font-bold text-amber-900 uppercase pt-1">
                  Los valores y la disponibilidad están sujetos a confirmación al momento del retiro.
                </p>
              </div>

              {quote.notes && (
                <div className="border border-slate-200 rounded-lg p-3 text-[11px] text-slate-700 bg-slate-50/50 print:bg-transparent">
                  <span className="font-bold text-slate-900">Observaciones: </span>
                  {quote.notes}
                </div>
              )}
            </div>

            <div className="sm:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 font-mono text-xs print:bg-transparent print:border-slate-300">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal bruto:</span>
                <span>{formatARS(quote.subtotalCents)}</span>
              </div>

              {quote.discountCents > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Descuentos aplicados:</span>
                  <span>- {formatARS(quote.discountCents)}</span>
                </div>
              )}

              {!quote.includesTax && quote.taxCents > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>IVA (21%):</span>
                  <span>+ {formatARS(quote.taxCents)}</span>
                </div>
              )}

              <div className="border-t-2 border-slate-800 pt-2 flex justify-between items-baseline text-slate-900">
                <span className="text-sm font-black uppercase font-sans">Total Final:</span>
                <span className="text-xl font-black text-orange-600">
                  {formatARS(quote.totalCents)}
                </span>
              </div>

              <p className="text-[10px] text-slate-500 font-sans text-right">
                {quote.includesTax
                  ? 'Precios finales con IVA incluido'
                  : 'Precios netos sin IVA (desglosado)'}
              </p>
            </div>
          </div>

          <div className="pt-8 mt-6 border-t border-slate-200 flex justify-between items-end text-[10px] text-slate-500 print:pt-4">
            <div>
              <p>Comprobante Interno de Presupuesto (No válido como factura fiscal).</p>
              <p>Rodamientos Hugo · Fagnano 1065, San Carlos de Bariloche</p>
            </div>
            <div className="text-right">
              <div className="border-t border-slate-400 w-48 mb-1 ml-auto"></div>
              <p className="font-semibold text-slate-700">{quote.userName}</p>
              <p>Hugo Repuestos Bariloche</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
