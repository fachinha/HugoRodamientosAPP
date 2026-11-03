import { Errors } from '../lib/errors';
import type { InvoiceParsedHeader } from '../../shared/schemas';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export class GeminiService {
  constructor(private apiKey?: string) {}

  /**
   * Envía un archivo PDF a la API multimodal de Gemini Flash y extrae la factura estructurada en JSON.
   */
  async extractInvoiceFromPdf(pdfBytes: Uint8Array | ArrayBuffer): Promise<InvoiceParsedHeader> {
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'tu-gemini-api-key-aqui') {
      throw Errors.badRequest(
        'La API Key de Google Gemini no está configurada. Agregá GEMINI_API_KEY en las variables de entorno o secretos.',
      );
    }

    const base64Data = Buffer.from(pdfBytes).toString('base64');

    const prompt = `Sos un sistema experto en auditoría contable y compras de repuestos, retenes y rodamientos para el comercio 'Rodamientos Hugo' (San Carlos de Bariloche, Argentina).
Analizá exhaustivamente este documento PDF de factura de compra comercial (comprobante emitido por distribuidores como SKF, Movimiento Mecánico, Alfa Rodamientos, ICEPAR, Cedisa, etc.) y extraé de forma estricta todos los datos del encabezado y cada uno de los ítems facturados.

Reglas críticas de cálculo financiero y moneda:
1. TODOS los importes monetarios deben devolverse en CENTAVOS ENTEROS (pesos multiplicados por 100 y redondeados, sin decimales).
2. Si un ítem tiene descuento o bonificación por línea (ej: 20% o 55%), y además la factura tiene un descuento global al pie (ej: 25% por pronto pago o comercial), el "netUnitCostCents" DEBE reflejar el costo unitario neto real efectivo que Hugo paga por cada unidad (antes de IVA y percepciones).
3. Fecha: Formato ISO YYYY-MM-DD. Si en la factura figura DD/MM/AAAA, convertila a YYYY-MM-DD.
4. Número de factura: Incluir punto de venta y número con guion (ej: "0004-00149959" o "0008-00271167").
5. Clasificá "lineType" como "product" para rulemanes, retenes, correas, crucetas y piezas mecánicas; o "charge" para conceptos no inventariables (flete, transporte, recargos o seguros).`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            supplierName: { type: 'STRING' },
            supplierCuit: { type: 'STRING' },
            invoiceType: { type: 'STRING' },
            invoiceNumber: { type: 'STRING' },
            invoiceDate: { type: 'STRING' },
            subtotalNetCents: { type: 'INTEGER' },
            taxCents: { type: 'INTEGER' },
            totalCents: { type: 'INTEGER' },
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  supplierCode: { type: 'STRING' },
                  description: { type: 'STRING' },
                  brand: { type: 'STRING', nullable: true },
                  quantity: { type: 'INTEGER' },
                  listPriceCents: { type: 'INTEGER' },
                  discountPercent: { type: 'NUMBER' },
                  netUnitCostCents: { type: 'INTEGER' },
                  totalNetCents: { type: 'INTEGER' },
                  lineType: { type: 'STRING', enum: ['product', 'charge'] },
                },
                required: ['supplierCode', 'description', 'quantity', 'netUnitCostCents', 'lineType'],
              },
            },
          },
          required: ['supplierName', 'invoiceNumber', 'invoiceDate', 'items'],
        },
      },
    };

    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_URL}?key=${encodeURIComponent(this.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      throw Errors.badRequest(`Error de red al conectar con Google Gemini API: ${err.message}`);
    }

    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `Gemini API respondió con código ${response.status}`;
      try {
        const parsedErr = JSON.parse(errText);
        if (parsedErr?.error?.message) {
          errMsg = `Error de Gemini: ${parsedErr.error.message}`;
        }
      } catch {
        // mantener errMsg
      }
      throw Errors.badRequest(errMsg);
    }

    const data: any = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw Errors.badRequest('La IA no devolvió contenido para la factura procesada.');
    }

    try {
      const parsed = JSON.parse(candidateText) as InvoiceParsedHeader;
      // Normalizaciones básicas defensivas
      parsed.invoiceType = parsed.invoiceType || 'A';
      parsed.subtotalNetCents = parsed.subtotalNetCents || 0;
      parsed.taxCents = parsed.taxCents || 0;
      parsed.totalCents = parsed.totalCents || 0;
      parsed.items = (parsed.items || []).map((it) => ({
        ...it,
        quantity: Math.max(1, Math.round(it.quantity || 1)),
        netUnitCostCents: Math.max(0, Math.round(it.netUnitCostCents || 0)),
        listPriceCents: Math.max(0, Math.round(it.listPriceCents || it.netUnitCostCents || 0)),
        totalNetCents: Math.round(it.totalNetCents || it.netUnitCostCents * it.quantity),
        lineType: it.lineType === 'charge' ? 'charge' : 'product',
      }));
      return parsed;
    } catch (e: any) {
      throw Errors.badRequest(`Error al parsear el resultado JSON de la factura: ${e.message}`);
    }
  }
}
