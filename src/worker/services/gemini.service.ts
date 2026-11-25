import { Errors } from '../lib/errors';
import type { InvoiceParsedHeader } from '../../shared/schemas';
import { extractText } from 'unpdf';

const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
];

export class GeminiService {
  private customModel?: string;

  constructor(private apiKey?: string, model?: string) {
    this.customModel = model?.trim() || undefined;
  }

  /**
   * Envía un archivo PDF a la API de Gemini y extrae la factura estructurada en JSON.
   * Utiliza extracción directa de texto para vector PDFs (rápido, sin saturación 503)
   * y fallback automático en cascada entre modelos.
   */
  async extractInvoiceFromPdf(pdfBytes: Uint8Array | ArrayBuffer): Promise<InvoiceParsedHeader> {
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'tu-gemini-api-key-aqui') {
      throw Errors.badRequest(
        'La API Key de Google Gemini no está configurada. Agregá GEMINI_API_KEY en las variables de entorno o secretos.',
      );
    }

    // Hacemos una copia independiente para evitar que pdfjs-dist transfiera o desmonte (detach) el buffer
    const bytesCopy = pdfBytes instanceof Uint8Array
      ? new Uint8Array(pdfBytes)
      : new Uint8Array(pdfBytes.slice(0));

    // 1. Intentar extracción de texto directo para evitar saturación de clusters visuales
    let extractedText = '';
    try {
      const bufferForUnpdf = bytesCopy.buffer.slice(0);
      const { text } = await extractText(new Uint8Array(bufferForUnpdf));
      extractedText = (Array.isArray(text) ? text.join('\n') : text || '').trim();
    } catch {
      extractedText = '';
    }

    const promptInstructions = `Sos un sistema experto en auditoría contable y compras de repuestos, retenes y rodamientos para el comercio 'Rodamientos Hugo' (San Carlos de Bariloche, Argentina).
Analizá exhaustivamente este documento de factura de compra comercial (comprobante emitido por distribuidores como SKF, Movimiento Mecánico, Alfa Rodamientos, ICEPAR, Cedisa, etc.) y extraé de forma estricta todos los datos del encabezado y cada uno de los ítems facturados.

Reglas críticas de cálculo financiero y moneda:
1. TODOS los importes monetarios deben devolverse en CENTAVOS ENTEROS (pesos multiplicados por 100 y redondeados, sin decimales).
2. Si un ítem tiene descuento o bonificación por línea (ej: 20% o 55%), y además la factura tiene un descuento global al pie (ej: 25% por pronto pago o comercial), el "netUnitCostCents" DEBE reflejar el costo unitario neto real efectivo que Hugo paga por cada unidad (antes de IVA y percepciones).
3. Fecha: Formato ISO YYYY-MM-DD. Si en la factura figura DD/MM/AAAA, convertila a YYYY-MM-DD.
4. Número de factura: Incluir punto de venta y número con guion (ej: "0004-00149959" o "0008-00271167").
5. Clasificá "lineType" como "product" para rulemanes, retenes, correas, crucetas y piezas mecánicas; o "charge" para conceptos no inventariables (flete, transporte, recargos o seguros).
6. Identificación de código y marca: El 'supplierCode' es el código o número de catálogo de parte/pieza (ej: '6711', 'CR1163', '6204-2RSH/C3', 'TR1100', '8399POL /7942.5', '6PK1820', 'VKM 31041'). La 'brand' es el fabricante o marca (ej: 'DBH', 'SKF', 'ETM', 'MICHELIN'). Si en el texto el código aparece pegado a un importe precedente (ej: '16.531,486711 DBH' -> el importe es 16.531,48 y el código de pieza es '6711'), separalo correctamente sin incluir el número monetario en el código.`;

    // Si pudimos extraer el texto digital (vector PDF), enviamos texto que consume pocos tokens y evita 503
    let parts: any[];
    if (extractedText.length > 50) {
      parts = [
        {
          text: `${promptInstructions}\n\nCONTENIDO TEXTUAL DE LA FACTURA:\n${extractedText}`,
        },
      ];
    } else {
      const base64Data = Buffer.from(bytesCopy).toString('base64');
      parts = [
        { text: promptInstructions },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64Data,
          },
        },
      ];
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts,
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

    const modelsToTry = this.customModel
      ? [this.customModel, ...CANDIDATE_MODELS.filter((m) => m !== this.customModel)]
      : CANDIDATE_MODELS;

    let lastError = 'No se pudo conectar con los modelos de Gemini';

    for (const currentModel of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent`;
      let response: Response;
      try {
        response = await fetch(`${endpoint}?key=${encodeURIComponent(this.apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err: any) {
        lastError = `Error de red al conectar con Google Gemini (${currentModel}): ${err.message}`;
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `Gemini API (${currentModel}) respondió con código ${response.status}`;
        try {
          const parsedErr = JSON.parse(errText);
          if (parsedErr?.error?.message) {
            errMsg = `Error de Gemini (${currentModel}): ${parsedErr.error.message}`;
          }
        } catch {
          // mantener errMsg
        }

        // Si el modelo está congestionado (503), rate-limited (429) o no disponible (404), probamos automáticamente el siguiente modelo
        if (response.status === 503 || response.status === 429 || response.status === 404) {
          lastError = errMsg;
          continue;
        }

        throw Errors.badRequest(errMsg);
      }

      const data: any = await response.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        lastError = `La IA (${currentModel}) no devolvió contenido para la factura procesada.`;
        continue;
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
        lastError = `Error al parsear el resultado JSON de la factura con ${currentModel}: ${e.message}`;
        continue;
      }
    }

    throw Errors.badRequest(lastError);
  }
}
