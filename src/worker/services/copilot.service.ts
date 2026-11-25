import type { ServiceContext } from '../env';
import { Errors } from '../lib/errors';
import { formatARS } from '../../shared/money';
import { parseSmartSearchQuery } from '../../shared/smartSearch';
import { AnalyticsService } from './analytics.service';
import type {
  CopilotChatRequest,
  CopilotChatResponse,
  CopilotClientAction,
} from '../../shared/copilot';

const CANDIDATE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
];

const SEARCH_STOPWORDS = new Set([
  'a', 'al', 'algo', 'algun', 'algún', 'alguna', 'articulo', 'artículo', 'articulos',
  'busca', 'buscar', 'buscame', 'búscame', 'catalogo', 'catálogo', 'codigo', 'código',
  'como', 'cómo', 'con', 'consulta', 'consultar', 'cual', 'cuál', 'cuanto', 'cuánto',
  'cuantos', 'cuántos', 'dame', 'de', 'decime', 'del', 'disponible', 'disponibles',
  'donde', 'dónde', 'el', 'en', 'es', 'esta', 'está', 'estan', 'están', 'fijate',
  'fíjate', 'hay', 'hola', 'la', 'las', 'le', 'lo', 'los', 'me', 'mi', 'mostrar',
  'mostrame', 'necesito', 'nos', 'o', 'para', 'pieza', 'piezas', 'por', 'precio',
  'precios', 'puedo', 'que', 'qué', 'queda', 'quedan', 'quiero', 'repuesto', 'repuestos',
  'rodamiento', 'rodamientos', 'ruleman', 'rulemán', 'rulemanes', 'saber', 'se', 'si',
  'sin', 'sobre', 'stock', 'su', 'te', 'tenemos', 'tenes', 'tenés', 'tiene', 'tienen',
  'un', 'una', 'unidades', 'uno', 'unos', 'ver', 'y',
]);

function extractSearchTokens(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'()[\]{}]/g, ' ')
    .trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const filtered = parts.filter((w) => w.length >= 2 && !SEARCH_STOPWORDS.has(w));
  return filtered.slice(0, 6);
}

const KNOWLEDGE_GUIDES: Record<string, string> = {
  carga_facturas: `Para cargar una factura de compra con IA:
1. Andá al menú lateral 'Inventario' -> pestaña 'Facturas de Compra' -> botón 'Cargar Factura (PDF / IA)'.
2. Arrastrá el PDF de la factura emitida por tu proveedor (ej: Movimiento Mecánico, SKF, Alfa Rodamientos, ICEPAR, Cedisa).
3. La IA extraerá los códigos, cantidades y costos unitarios netos.
4. En la pantalla de revisión (Dry-Run), verificá las variaciones de costo (+14%, -5%) y decidí si actualizar precios de mostrador.
5. Al hacer clic en 'Confirmar Ingreso', el sistema sumará automáticamente el stock en el Kardex y recordará las equivalencias de códigos para futuras compras.`,

  presupuestos: `Para armar un presupuesto de repuestos:
1. Andá a la sección 'Presupuestos' en el menú lateral y hacé clic en '+ Nuevo Presupuesto'.
2. Seleccioná si es 'Particular' o 'Empresa / Taller' (permite desglose de IVA 21% para Factura A).
3. Completá los datos del vehículo: Marca, Modelo, Año, Motor y Patente.
4. En la tabla de repuestos, buscá productos del catálogo o agregá ítems libres a pedido.
5. Indicá la disponibilidad ('En stock', 'A pedido 24/48hs' o 'A confirmar').
6. Al guardar, se generará el presupuesto con formato correlativo (ej: COT-00001).
7. Podés presionar 'Enviar WhatsApp' para enviarlo formateado al cliente en 1 clic o imprimir la hoja oficial en PDF.`,

  ventas_pos: `Para registrar una venta en el mostrador:
1. Andá a 'Punto de Venta'.
2. Escaneá el código de barras o buscá el repuesto por SKU/nombre.
3. Indicá cantidades y seleccioná el medio de pago (Efectivo, Transferencia, Débito, Crédito).
4. Presioná 'Confirmar Venta' para descontar el stock e imprimir el comprobante interno.`,

  alertas_stock: `Para controlar el stock crítico:
1. Andá a 'Alertas de stock'.
2. El sistema clasifica los productos en: 'Agotados' (stock en 0) y 'Stock bajo' (por debajo del mínimo configurado).
3. Podés filtrar por marca o categoría para planificar los pedidos a fábrica.`,

  crm_clientes: `Para gestionar clientes y flotas:
1. Andá a 'CRM y Rentabilidad' -> pestaña 'Directorio CRM de Clientes & Flotas'.
2. Podés buscar clientes por nombre, CUIT, teléfono o por la PATENTE del auto/camión.
3. Abrí la 'Ficha 360°' para ver su historial de compras, efectividad de presupuestos y vehículos registrados.
4. Podés contactarlo directamente por WhatsApp con mensajes de fidelización predefinidos.`,

  rentabilidad: `Para analizar la rentabilidad del local (Solo Administradores):
1. Andá a 'CRM y Rentabilidad' -> pestaña 'Rendimiento del Local'.
2. Seleccioná el período (Este mes, Mes anterior, Últimos 30 días, etc.).
3. Podés auditar la Facturación Neta, el Costo de Mercadería Vendida (CMV), la Ganancia Bruta Real ($) y el Margen Comercial (%).
4. En la pestaña 'Rentabilidad de Repuestos', consultá la matriz ABC para ver los productos 'Estrella' y los de 'Margen Bajo'.`,
};

export class CopilotService {
  constructor(private ctx: ServiceContext) {}

  /**
   * Procesa la conversación del copiloto con Function Calling sobre Cloudflare D1.
   */
  async chat(request: CopilotChatRequest): Promise<CopilotChatResponse> {
    const userRole = this.ctx.user.role;
    const userName = this.ctx.user.displayName;
    const currentRoute = request.currentRoute || '/';
    const lastUserMessage = request.messages[request.messages.length - 1]?.content || '';

    // Si no hay API key configurada, usamos el motor de contingencia local
    if (!this.ctx.geminiApiKey || this.ctx.geminiApiKey === 'tu-gemini-api-key-aqui') {
      return this.fallbackLocalResponse(lastUserMessage, currentRoute, userRole);
    }

    try {
      return await this.callGeminiWithTools(request, userRole, userName, currentRoute);
    } catch (err: any) {
      // Fallback amigable si falla la conexión externa
      return this.fallbackLocalResponse(lastUserMessage, currentRoute, userRole);
    }
  }

  /**
   * Invoca a Google Gemini con herramientas de Function Calling conectadas a D1.
   */
  private async callGeminiWithTools(
    request: CopilotChatRequest,
    userRole: string,
    userName: string,
    currentRoute: string,
  ): Promise<CopilotChatResponse> {
    const lastUserMessage = request.messages[request.messages.length - 1]?.content || '';
    const systemPrompt = `Sos el Copiloto Asistente de Mostrador de 'Rodamientos Hugo' (Fagnano 1065, San Carlos de Bariloche, Tel (294) 462-9707).
Estás atendiendo al empleado '${userName}' (Rol: ${userRole === 'admin' ? 'Administrador' : 'Vendedor'}).
Pantalla actual del usuario: '${currentRoute}'.

Tu función:
1. Ayudar a resolver consultas de repuestos, medidas, equivalencias de marcas (SKF, DOLZ, VMG, CHIVILCOY en Alfa Rodamientos, FAG, INA, Timken, DBH, SAV, Corteco, Taranto, Continental, Gates, Dayco, Bosch, Sachs, LuK) y stock real en el local.
2. IMPORTANTE SOBRE EL CATÁLOGO Y EQUIVALENCIAS: Muchos repuestos tienen múltiples opciones de marca (ej: Bombas de agua en DOLZ [O106/O256/O262], VMG [BA193/BA504/BA473], SKF [VKPC85206/VKPC85624] y CHIVILCOY [CH0119/CH4994/CH2262 en Alfa Rodamientos]; Kits de distribución en SKF [VKMA05012], INA [530063010], Continental [CT874], Gates o DOLZ [KD021]). Cuando el usuario consulte por vehículo, bomba de agua o kit, pasá en 'alternativeCodes' los códigos universales equivalentes en esas marcas para traer todas las opciones disponibles en el sistema.
3. Si el usuario te pide una acción operativa (ej: "sumame 3 crucetas ETM", "llevame a presupuestos", "buscame el cliente de la patente AD123XY"), utilizá las herramientas (functions) correspondientes para buscar en la base de datos o preparar la acción en pantalla.
4. Si un producto figura con stock 0 en el sistema, informá igualmente el código encontrado, la marca y su precio de lista registrado en el catálogo, aclarando que figura con stock 0 en mostrador.
5. Si el usuario está perdido o pregunta cómo hacer algo en la app, explicáselo paso a paso con amabilidad y claridad.
6. Regla de seguridad financiera: Si un vendedor te consulta sobre costos de compra en dinero o ganancias totales del negocio, informale amablemente que esa información estratégica solo está disponible para el Administrador.
7. Tono: Profesional, ágil, servicial, en español argentino (usá 'vos', 'tenés', 'podés', etc.).`;

    const toolDeclarations = [
      {
        name: 'search_catalog',
        description: 'Busca repuestos, rulemanes, kits de distribución, retenes o crucetas en el catálogo por nombre, SKU, código técnico o marca.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Término principal o código buscado, ej: "6204", "VKMA05012", "12765", "cruceta etm"' },
            brand: { type: 'STRING', description: 'Marca específica opcional, ej: "SKF", "ETM", "DBH", "INA"' },
            alternativeCodes: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Códigos técnicos universales equivalentes (SKF, INA, Gates, Dayco, Bosch) sin espacios cuando el usuario consulta por modelo de vehículo, ej: ["VKMA05012", "CT874", "530063010"]',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'lookup_customer',
        description: 'Busca un cliente o empresa en el CRM por nombre, CUIT o patente del vehículo.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Nombre, CUIT o patente del vehículo, ej: "AE123XY", "Transporte"' },
          },
          required: ['query'],
        },
      },
      {
        name: 'action_add_to_cart',
        description: 'Prepara la acción de agregar una cantidad de un repuesto al carrito de venta de mostrador (POS).',
        parameters: {
          type: 'OBJECT',
          properties: {
            sku: { type: 'STRING', description: 'SKU, código o nombre del repuesto a agregar' },
            quantity: { type: 'INTEGER', description: 'Cantidad de unidades a sumar al carrito' },
          },
          required: ['sku', 'quantity'],
        },
      },
      {
        name: 'action_navigate',
        description: 'Indica al navegador que cambie de pantalla o sección dentro de la app.',
        parameters: {
          type: 'OBJECT',
          properties: {
            targetRoute: {
              type: 'STRING',
              description: 'Ruta de destino: /pos, /quotes, /crm, /inventory, /products, /alerts, /settings',
            },
            reason: { type: 'STRING', description: 'Motivo de la navegación' },
          },
          required: ['targetRoute'],
        },
      },
      {
        name: 'get_knowledge_guide',
        description: 'Obtiene instrucciones paso a paso sobre cómo realizar procesos dentro de la aplicación.',
        parameters: {
          type: 'OBJECT',
          properties: {
            topic: {
              type: 'STRING',
              description: 'Tema de ayuda: carga_facturas, presupuestos, ventas_pos, alertas_stock, crm_clientes, rentabilidad',
            },
          },
          required: ['topic'],
        },
      },
      {
        name: 'get_store_metrics',
        description: 'Consulta métricas financieras y ventas del local (SOLO ADMINISTRADORES).',
        parameters: {
          type: 'OBJECT',
          properties: {
            period: { type: 'STRING', description: 'Período: this_month, last_month' },
          },
        },
      },
    ];

    // Filtrar mensajes de plantilla de bienvenida para no contaminar el historial y asegurar que empiece con 'user'
    const cleanedHistory = request.messages.filter(
      (m) => !m.content.includes('Soy tu **Copiloto de Mostrador**') && !m.content.includes('Soy tu Copiloto de Mostrador'),
    );
    while (cleanedHistory.length > 0 && cleanedHistory[0].role === 'model') {
      cleanedHistory.shift();
    }

    const formattedContents: any[] =
      cleanedHistory.length > 0
        ? cleanedHistory.map((m) => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: [{ text: m.content }],
          }))
        : [{ role: 'user', parts: [{ text: lastUserMessage }] }];

    const modelsToTry = this.ctx.geminiModel
      ? [this.ctx.geminiModel, ...CANDIDATE_MODELS.filter((m) => m !== this.ctx.geminiModel)]
      : CANDIDATE_MODELS;

    for (const model of modelsToTry) {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.ctx.geminiApiKey!)}`;

      const initialPayload = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: formattedContents,
        tools: [{ functionDeclarations: toolDeclarations }],
      };

      let initialRes: Response;
      try {
        initialRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(initialPayload),
          signal: AbortSignal.timeout(9000),
        });
      } catch {
        continue;
      }

      if (!initialRes.ok) continue;

      const initialData: any = await initialRes.json();
      const candidateParts: any[] = initialData?.candidates?.[0]?.content?.parts || [];
      const functionCallPart = candidateParts.find((p: any) => p?.functionCall);
      const textPart = candidateParts.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);

      // Caso 1: Gemini llamó a una función
      if (functionCallPart?.functionCall) {
        const clientActions: CopilotClientAction[] = [];
        const { name, args } = functionCallPart.functionCall;
        const toolResult = await this.executeServerTool(name, args, clientActions);

        // Enviar resultado de vuelta a Gemini con role: 'user' (requerido por Gemini REST API) y preservando thoughtSignature
        const followUpPayload = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            ...formattedContents,
            {
              role: 'model',
              parts: candidateParts,
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name,
                    response: { result: toolResult },
                  },
                },
              ],
            },
          ],
        };

        for (const followUpModel of [model, ...modelsToTry.filter((m) => m !== model)]) {
          const followUpEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(followUpModel)}:generateContent?key=${encodeURIComponent(this.ctx.geminiApiKey!)}`;
          try {
            const followUpRes = await fetch(followUpEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(followUpPayload),
              signal: AbortSignal.timeout(9000),
            });
            if (followUpRes.ok) {
              const followUpData: any = await followUpRes.json();
              const followUpParts: any[] = followUpData?.candidates?.[0]?.content?.parts || [];
              const finalTextPart = followUpParts.find((p: any) => typeof p?.text === 'string' && p.text.trim().length > 0);
              if (finalTextPart?.text) {
                return {
                  reply: finalTextPart.text,
                  actions: clientActions,
                  suggestedChips: this.generateChipsFromTool(name, clientActions),
                };
              }
            }
          } catch {
            // Intentar siguiente modelo o formateo directo
          }
        }

        // Si el segundo viaje a Gemini falló por congestión, respondemos con los datos reales que ya obtuvimos de D1
        return this.formatDirectToolReply(name, args, toolResult, clientActions, currentRoute);
      }

      // Caso 2: Gemini responde directamente con texto
      if (textPart?.text) {
        const directActions: CopilotClientAction[] = [];
        const lowerMsg = lastUserMessage.toLowerCase();
        if (lowerMsg.includes('factura') || lowerMsg.includes('proveedor')) {
          directActions.push({
            type: 'NAVIGATE',
            title: 'Ir a Facturas de Compra',
            summary: 'Sección Inventario para cargar comprobantes en PDF.',
            payload: { path: '/inventory' },
          });
        } else if (lowerMsg.includes('presupuesto') || lowerMsg.includes('cotiz')) {
          directActions.push({
            type: 'NAVIGATE',
            title: 'Ir a Presupuestos',
            summary: 'Armar cotización para vehículo o empresa.',
            payload: { path: '/quotes' },
          });
        }
        return {
          reply: textPart.text,
          actions: directActions,
          suggestedChips: this.generateDefaultChips(currentRoute),
        };
      }
    }

    // Si falló la comunicación remota inicial
    return this.fallbackLocalResponse(lastUserMessage, currentRoute, userRole);
  }

  /**
   * Formatea una respuesta directa a partir del resultado de base de datos si el segundo llamado a Gemini sufre un corte.
   */
  private formatDirectToolReply(
    toolName: string,
    args: any,
    toolResult: any,
    clientActions: CopilotClientAction[],
    currentRoute: string,
  ): CopilotChatResponse {
    if (toolName === 'search_catalog') {
      const products: any[] = toolResult?.products || [];
      if (products.length > 0) {
        const lines = products.slice(0, 5).map(
          (p) =>
            `• **${p.name}** (SKU: \`${p.sku}\`${p.brand ? ` · ${p.brand}` : ''}) — Stock: **${p.stock}** u. · Precio: **${p.priceFormatted}**`,
        );
        return {
          reply: `Encontré **${products.length}** repuesto(s) en el catálogo:\n\n${lines.join('\n')}\n\n¿Querés sumar alguno al carrito o armar un presupuesto?`,
          actions: clientActions,
          suggestedChips: this.generateChipsFromTool(toolName, clientActions),
        };
      }
      const q = args?.query || 'esa búsqueda';
      return {
        reply: `Busqué **"${q}"** en el catálogo pero no encontré coincidencias directas. Probá indicando el código técnico (ej: \`6204\`, \`VKMA05012\`) o el número de artículo interno.`,
        actions: clientActions,
        suggestedChips: this.generateDefaultChips(currentRoute),
      };
    }

    if (toolName === 'get_knowledge_guide' && toolResult?.guide) {
      return {
        reply: toolResult.guide,
        actions: clientActions,
        suggestedChips: this.generateDefaultChips(currentRoute),
      };
    }

    return {
      reply: toolResult?.message || 'Operación procesada correctamente.',
      actions: clientActions,
      suggestedChips: this.generateChipsFromTool(toolName, clientActions),
    };
  }

  /**
   * Ejecuta una herramienta de base de datos invocada por Gemini.
   */
  async executeServerTool(
    name: string,
    args: any,
    clientActions: CopilotClientAction[],
  ): Promise<any> {
    if (name === 'search_catalog') {
      const q = String(args?.query || '').trim();
      const brand = args?.brand ? String(args.brand).trim() : null;
      const rawAltCodes: string[] = Array.isArray(args?.alternativeCodes)
        ? args.alternativeCodes.map((c: any) => String(c || '').trim()).filter(Boolean)
        : [];

      // Agregar variantes sin espacios ni guiones para códigos técnicos (ej: "VKMA 05012" -> "VKMA05012")
      const altCodes = Array.from(
        new Set(
          rawAltCodes
            .flatMap((c) => [c, c.replace(/[\s-]+/g, '')])
            .filter((c) => c.length >= 2),
        ),
      ).slice(0, 6);

      const tokens = extractSearchTokens(q);
      // Si el query original era un código corto o no dejó tokens tras filtrar stopwords, usamos q limpio
      const cleanQ = q.replace(/[¿?¡!.,;:"'()[\]{}]/g, '').trim();
      if (tokens.length === 0 && cleanQ.length > 0) {
        tokens.push(cleanQ);
      }

      const orBranches: string[] = [];
      const params: any[] = [];

      const smartParsed = parseSmartSearchQuery(q, 6);

      // 1. Coincidencia directa por frase/código limpio
      if (cleanQ.length > 0) {
        orBranches.push('(sku = ? COLLATE NOCASE OR sku LIKE ? OR name LIKE ? OR description LIKE ? OR brand LIKE ? OR supplier_name LIKE ? OR dimensions LIKE ?)');
        params.push(cleanQ, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`, `%${cleanQ}%`);
      }

      // 2. Coincidencia sin orden de todos los grupos inteligentes (soporta chivilcoi->chivilcoy, dolzamg->dolz/vmg, izquierda<->derecha)
      if (smartParsed.groups.length > 0) {
        const grpAndClauses: string[] = [];
        for (const grp of smartParsed.groups) {
          const vOr: string[] = [];
          for (const v of grp.variants) {
            vOr.push('(sku LIKE ? OR name LIKE ? OR description LIKE ? OR brand LIKE ? OR supplier_name LIKE ? OR dimensions LIKE ?)');
            params.push(`%${v}%`, `%${v}%`, `%${v}%`, `%${v}%`, `%${v}%`, `%${v}%`);
          }
          grpAndClauses.push(`(${vOr.join(' OR ')})`);
        }
        orBranches.push(`(${grpAndClauses.join(' AND ')})`);
      }

      // 3. Códigos técnicos equivalentes (ej: VKMA05012, O106, BA193, CH0119)
      for (const code of altCodes) {
        orBranches.push('(sku LIKE ? OR name LIKE ? OR description LIKE ? OR supplier_code LIKE ?)');
        params.push(`%${code}%`, `%${code}%`, `%${code}%`, `%${code}%`);
      }

      if (orBranches.length === 0) {
        return { foundCount: 0, products: [] };
      }

      let sql = `SELECT id, sku, name, brand, price_cents, cost_cents, stock, unit, location, dimensions, supplier_name
                 FROM products
                 WHERE active = 1 AND (${orBranches.join(' OR ')})`;

      if (brand) {
        sql += ' AND (brand LIKE ? OR name LIKE ?)';
        params.push(`%${brand}%`, `%${brand}%`);
      }

      const primaryCode = altCodes[0] || tokens[0] || cleanQ;
      sql += ` ORDER BY CASE WHEN sku = ? COLLATE NOCASE THEN 0 WHEN name LIKE ? THEN 1 ELSE 2 END, stock DESC, price_cents DESC, id DESC LIMIT 8`;
      params.push(primaryCode, `%${primaryCode}%`);

      let res = await this.ctx.db.prepare(sql).bind(...params).all<any>();
      let rows = res.results || [];

      // Fallback flexible: si había varios tokens y no hubo match con AND, probamos con OR priorizando los términos más específicos
      if (rows.length === 0 && tokens.length > 1) {
        const specificTokens = tokens.filter((t) => !['kit', 'correa', 'tensor', 'bomba', 'filtro', 'delantero', 'trasero'].includes(t));
        const fallbackTokens = specificTokens.length > 0 ? specificTokens : tokens;
        const fbClauses: string[] = [];
        const fbParams: any[] = [];
        for (const t of fallbackTokens) {
          fbClauses.push('(sku LIKE ? OR name LIKE ? OR brand LIKE ?)');
          fbParams.push(`%${t}%`, `%${t}%`, `%${t}%`);
        }
        const fbSql = `SELECT id, sku, name, brand, price_cents, cost_cents, stock, unit, location, dimensions, supplier_name
                       FROM products
                       WHERE active = 1 AND (${fbClauses.join(' OR ')})
                       ORDER BY stock DESC, price_cents DESC, id DESC LIMIT 8`;
        res = await this.ctx.db.prepare(fbSql).bind(...fbParams).all<any>();
        rows = res.results || [];
      }

      const results = rows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        stock: p.stock,
        unit: p.unit,
        location: p.location || 'Sin estantería asignada',
        dimensions: p.dimensions || null,
        supplierName: p.supplier_name || null,
        priceFormatted: formatARS(p.price_cents),
        priceCents: p.price_cents,
      }));

      if (results.length > 0) {
        clientActions.push({
          type: 'SEARCH_PRODUCT',
          title: `Resultados encontrados (${results.length})`,
          summary: `Se encontraron ${results.length} coincidencias para "${q}".`,
          payload: { items: results },
        });
      }

      return { foundCount: results.length, products: results };
    }

    if (name === 'lookup_customer') {
      const q = String(args?.query || '').trim();
      const searchPattern = `%${q}%`;

      const sql = `
        SELECT c.id, c.name, c.customer_type, c.phone, c.cuit, c.city,
               (SELECT COUNT(*) FROM customer_vehicles cv WHERE cv.customer_id = c.id) AS vehicles_count,
               (SELECT plate FROM customer_vehicles cv WHERE cv.customer_id = c.id LIMIT 1) AS primary_plate
        FROM customers c
        WHERE c.name LIKE ? OR c.cuit LIKE ? OR c.phone LIKE ? OR EXISTS (
          SELECT 1 FROM customer_vehicles cv WHERE cv.customer_id = c.id AND cv.plate LIKE ?
        )
        LIMIT 3
      `;

      const res = await this.ctx.db.prepare(sql).bind(searchPattern, searchPattern, searchPattern, searchPattern).all<any>();
      const customers = res.results || [];

      if (customers.length > 0) {
        clientActions.push({
          type: 'SHOW_CUSTOMER',
          title: `Cliente: ${customers[0].name}`,
          summary: `Tel: ${customers[0].phone || 'Sin tel'} · CUIT: ${customers[0].cuit || 'S/D'}`,
          payload: { customerId: customers[0].id, name: customers[0].name },
        });
      }

      return { foundCount: customers.length, customers };
    }

    if (name === 'action_add_to_cart' || name === 'action_add_to_pos') {
      const sku = String(args?.sku || '').trim();
      const qty = Math.max(1, Number(args?.quantity) || 1);

      let prod = await this.ctx.db
        .prepare('SELECT id, sku, name, brand, price_cents, stock, unit FROM products WHERE active = 1 AND sku = ? COLLATE NOCASE LIMIT 1')
        .bind(sku)
        .first<any>();

      if (!prod && sku.length > 0) {
        prod = await this.ctx.db
          .prepare('SELECT id, sku, name, brand, price_cents, stock, unit FROM products WHERE active = 1 AND (sku LIKE ? OR name LIKE ?) ORDER BY stock DESC, price_cents DESC LIMIT 1')
          .bind(`%${sku}%`, `%${sku}%`)
          .first<any>();
      }

      if (!prod) {
        return { success: false, message: `No se encontró en catálogo ningún repuesto con código o nombre '${sku}'.` };
      }

      clientActions.push({
        type: 'ADD_TO_CART',
        title: `Sumar ${qty}x ${prod.name}`,
        summary: `SKU: ${prod.sku} · ${formatARS(prod.price_cents)} c/u · Stock: ${prod.stock}`,
        payload: {
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          brand: prod.brand,
          unitPriceCents: prod.price_cents,
          quantity: qty,
          availableStock: prod.stock,
          unit: prod.unit,
        },
      });

      return {
        success: true,
        productName: prod.name,
        sku: prod.sku,
        quantity: qty,
        unitPriceFormatted: formatARS(prod.price_cents),
        availableStock: prod.stock,
      };
    }

    if (name === 'action_navigate') {
      const targetRoute = String(args?.targetRoute || '/').trim();
      const reason = String(args?.reason || 'Acceso directo');

      clientActions.push({
        type: 'NAVIGATE',
        title: `Ir a ${this.getRouteLabel(targetRoute)}`,
        summary: reason,
        payload: { path: targetRoute },
      });

      return { success: true, targetRoute, label: this.getRouteLabel(targetRoute) };
    }

    if (name === 'get_knowledge_guide') {
      const topic = String(args?.topic || 'general').trim();
      const guide = KNOWLEDGE_GUIDES[topic] || KNOWLEDGE_GUIDES.general || 'Consultá con el administrador.';
      const topicRoutes: Record<string, { path: string; title: string; summary: string }> = {
        carga_facturas: {
          path: '/inventory',
          title: 'Ir a Facturas de Compra',
          summary: 'Sección Inventario para cargar comprobantes en PDF con IA.',
        },
        presupuestos: {
          path: '/quotes',
          title: 'Ir a Presupuestos',
          summary: 'Crear y enviar cotizaciones por WhatsApp o mail.',
        },
        ventas_pos: {
          path: '/pos',
          title: 'Ir a Punto de Venta',
          summary: 'Mostrador de facturación y carrito.',
        },
        alertas_stock: {
          path: '/alerts',
          title: 'Ir a Alertas de Stock',
          summary: 'Control de faltantes y datos pendientes.',
        },
        crm_clientes: {
          path: '/crm',
          title: 'Ir a Directorio CRM',
          summary: 'Gestión de clientes, vehículos y cuentas corrientes.',
        },
        rentabilidad: {
          path: '/crm',
          title: 'Ir a Rentabilidad',
          summary: 'Métricas financieras y margen comercial.',
        },
      };
      const routeInfo = topicRoutes[topic];
      if (routeInfo) {
        clientActions.push({
          type: 'NAVIGATE',
          title: routeInfo.title,
          summary: routeInfo.summary,
          payload: { path: routeInfo.path },
        });
      }
      return { topic, guide };
    }

    if (name === 'get_store_metrics') {
      if (this.ctx.user.role !== 'admin') {
        return { error: 'Acceso restringido: las métricas financieras solo son accesibles para Administradores.' };
      }
      const analyticsService = new AnalyticsService(this.ctx);
      const metrics = await analyticsService.getStorePerformance({ period: args?.period || 'this_month' });
      return {
        period: metrics.periodLabel,
        revenueFormatted: formatARS(metrics.revenueCents),
        costFormatted: formatARS(metrics.costCents),
        grossProfitFormatted: formatARS(metrics.grossProfitCents),
        marginPct: metrics.grossMarginPct,
        salesCount: metrics.salesCount,
      };
    }

    return { error: `Herramienta desconocida: ${name}` };
  }

  /**
   * Genera sugerencias rápidas según la ruta actual.
   */
  private generateDefaultChips(currentRoute: string): string[] {
    if (currentRoute === '/pos') {
      return ['Sumame 2 crucetas ETM', '¿Hay stock de rulemán 6204?', '¿Cómo aplico un descuento?'];
    }
    if (currentRoute === '/quotes') {
      return ['¿Cómo envío el presupuesto por WhatsApp?', '¿Cómo paso una cotización a venta?', 'Buscar cliente'];
    }
    if (currentRoute === '/inventory') {
      return ['¿Cómo cargo una factura de compra?', 'Ver alertas de stock bajo', 'Llevame al Punto de Venta'];
    }
    if (currentRoute === '/crm') {
      return ['Buscar cliente por patente', '¿Cómo registro un vehículo?', '¿Cuánto vendimos este mes?'];
    }
    return ['¿Cuánto stock nos queda de 6204?', '¿Cómo cargo una factura?', 'Llevame al Punto de Venta'];
  }

  private generateChipsFromTool(toolName: string, actions: CopilotClientAction[]): string[] {
    if (actions.some((a) => a.type === 'ADD_TO_CART')) {
      return ['Ir al Punto de Venta', 'Buscar otro repuesto', 'Armar presupuesto'];
    }
    if (toolName === 'search_catalog') {
      return ['Sumar al carrito', 'Crear presupuesto', 'Consultar stock de otra medida'];
    }
    return ['¿En qué más te puedo ayudar?', 'Ir al Punto de Venta', 'Ver alertas de stock'];
  }

  private getRouteLabel(route: string): string {
    const map: Record<string, string> = {
      '/': 'Inicio',
      '/pos': 'Punto de Venta',
      '/quotes': 'Presupuestos',
      '/crm': 'CRM y Rentabilidad',
      '/products': 'Catálogo de Productos',
      '/inventory': 'Inventario y Facturas',
      '/alerts': 'Alertas de Stock',
      '/movements': 'Movimientos de Stock',
      '/settings': 'Configuración',
    };
    return map[route] || route;
  }

  /**
   * Motor de contingencia local que responde si no hay conexión externa o falta la API key.
   */
  private async fallbackLocalResponse(
    text: string,
    currentRoute: string,
    _userRole: string,
  ): Promise<CopilotChatResponse> {
    const q = text.toLowerCase().trim();
    const actions: CopilotClientAction[] = [];

    // 1. Detección de intención: Ayuda sobre facturas
    if (q.includes('factura') || q.includes('proveedor') || q.includes('cargar factura')) {
      actions.push({
        type: 'NAVIGATE',
        title: 'Ir a Facturas de Compra',
        summary: 'Sección Inventario para cargar comprobantes en PDF.',
        payload: { path: '/inventory' },
      });
      return {
        reply: `Para cargar una factura de compra con IA:\n\n1. Entrá en **Inventario** -> pestaña **Facturas de Compra**.\n2. Presioná el botón naranja **"Cargar Factura (PDF / IA)"**.\n3. Arrastrá el PDF emitido por tu proveedor.\n4. La IA revisará precios y variaciones de costo antes de confirmar el stock.\n\n¿Querés que te lleve directamente?`,
        actions,
        suggestedChips: ['Ir a Facturas de Compra', '¿Cómo hago un presupuesto?', 'Ir al POS'],
      };
    }

    // 2. Detección de intención: Presupuestos
    if (q.includes('presupuesto') || q.includes('cotiz') || q.includes('whatsapp')) {
      actions.push({
        type: 'NAVIGATE',
        title: 'Ir a Presupuestos',
        summary: 'Armar cotización para vehículo o empresa.',
        payload: { path: '/quotes' },
      });
      return {
        reply: `Para armar un presupuesto:\n\n1. Andá a **Presupuestos** y hacé clic en **"+ Nuevo Presupuesto"**.\n2. Ingresá el cliente y los datos del auto (Marca, Modelo, Patente).\n3. Agregá los repuestos del catálogo o líneas libres a pedido.\n4. Al guardar, podés presionar el botón verde de **WhatsApp** para mandárselo al cliente en 1 clic.\n\n¡Hacé clic abajo para abrir Presupuestos!`,
        actions,
        suggestedChips: ['Ir a Presupuestos', 'Buscar cliente', 'Ver stock 6204'],
      };
    }

    // 3. Detección de intención: Navegación simple
    if (q.includes('pos') || q.includes('punto de venta') || q.includes('vender') || q.includes('caja')) {
      actions.push({
        type: 'NAVIGATE',
        title: 'Ir a Punto de Venta',
        summary: 'Mostrador de ventas y cobros.',
        payload: { path: '/pos' },
      });
      return {
        reply: `¡Te acompaño al **Punto de Venta**! Hacé clic abajo para ir directamente al mostrador de facturación.`,
        actions,
        suggestedChips: ['Ir a Punto de Venta', '¿Hay stock de 6204?'],
      };
    }

    // 4. Saludo corto
    const cleanWord = q.replace(/[¿?¡!.,;:]/g, '').trim();
    if (['hola', 'buenas', 'buen dia', 'buen día', 'buenas tardes', 'buenas noches', 'ayuda'].includes(cleanWord)) {
      return {
        reply: `¡Hola! Soy tu **Copiloto de Mostrador** en Hugo Repuestos 🛠️.\n\nPuedo ayudarte a:\n• Buscar stock y precios de repuestos (ej: *"¿Cuánto stock de 6204 SKF?"*).\n• Sumar piezas al carrito de mostrador (ej: *"Sumame 2 crucetas ETM"*).\n• Buscar clientes por patente en el CRM (ej: *"¿De quién es la patente AE123XY?"*).\n• Explicarte cómo cargar facturas, armar presupuestos o revisar alertas.\n\n¿Qué necesitás hacer hoy?`,
        actions,
        suggestedChips: this.generateDefaultChips(currentRoute),
      };
    }

    // 5. Búsqueda de stock inteligente directa en base de datos
    const tokens = extractSearchTokens(q);
    if (tokens.length > 0) {
      const altCodes: string[] = [];
      if ((q.includes('distribucion') || q.includes('distribución')) && q.includes('corsa')) {
        altCodes.push('VKMA05012', 'CT874');
      }

      const searchResult = await this.executeServerTool(
        'search_catalog',
        { query: tokens.join(' '), alternativeCodes: altCodes },
        actions,
      );

      if (searchResult.products && searchResult.products.length > 0) {
        const prod = searchResult.products[0];
        actions.unshift({
          type: 'ADD_TO_CART',
          title: `Sumar ${prod.name}`,
          summary: `SKU: ${prod.sku} · ${prod.priceFormatted} · Stock: ${prod.stock}`,
          payload: {
            productId: prod.id,
            sku: prod.sku,
            name: prod.name,
            brand: prod.brand,
            unitPriceCents: prod.priceCents,
            quantity: 1,
            availableStock: prod.stock,
            unit: prod.unit,
          },
        });

        if (searchResult.products.length === 1) {
          return {
            reply: `Encontré **${prod.name}** (SKU: \`${prod.sku}\`${prod.brand ? `, Marca: ${prod.brand}` : ''}).\n\n📦 **Stock en sistema:** ${prod.stock} unidades.\n💰 **Precio de venta:** ${prod.priceFormatted}.\n\n¿Querés que lo sume al carrito de venta?`,
            actions,
            suggestedChips: ['Sumar al carrito', 'Ir al Punto de Venta', 'Buscar otro repuesto'],
          };
        }

        const listText = searchResult.products
          .slice(0, 5)
          .map(
            (p: any) =>
              `• **${p.name}** (SKU: \`${p.sku}\`${p.brand ? ` · ${p.brand}` : ''}) — Stock: **${p.stock}** u. · **${p.priceFormatted}**`,
          )
          .join('\n');

        return {
          reply: `Encontré **${searchResult.products.length}** opciones en el catálogo:\n\n${listText}\n\n¿Querés sumar alguna al carrito de mostrador?`,
          actions,
          suggestedChips: ['Sumar al carrito', 'Ir al Punto de Venta', 'Buscar otro repuesto'],
        };
      }

      return {
        reply: `Busqué en el catálogo por **"${tokens.join(' ')}"** pero no encontré repuestos que coincidan con ese término. Probá buscando por el código técnico (ej: \`6204\`, \`VKMA05012\`) o número de artículo interno.`,
        actions,
        suggestedChips: this.generateDefaultChips(currentRoute),
      };
    }

    // Respuesta general
    return {
      reply: `¡Hola! Soy tu **Copiloto de Mostrador** en Hugo Repuestos 🛠️.\n\nPuedo ayudarte a:\n• Buscar stock y precios de repuestos (ej: *"¿Cuánto stock de 6204 SKF?"*).\n• Sumar piezas al carrito de mostrador (ej: *"Sumame 2 crucetas ETM"*).\n• Buscar clientes por patente en el CRM (ej: *"¿De quién es la patente AE123XY?"*).\n• Explicarte cómo cargar facturas, armar presupuestos o revisar alertas.\n\n¿Qué necesitás hacer hoy?`,
      actions,
      suggestedChips: this.generateDefaultChips(currentRoute),
    };
  }
}
