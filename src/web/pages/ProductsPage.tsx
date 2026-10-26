import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  Barcode,
  History,
  X,
  Check,
  AlertTriangle,
  Loader2,
  Tag,
} from 'lucide-react';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS, centsToInput, parseMoneyToCents } from '../../shared/money';
import { stockStatus, STOCK_STATUS_LABEL } from '../../shared/stock';
import { useAuth } from '../context/AuthContext';
import type { ProductListItem } from '../../worker/services/products.service';

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('1');

  // Modales
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductListItem | null>(null);
  const [movementsProduct, setMovementsProduct] = useState<ProductListItem | null>(null);
  const [productMovements, setProductMovements] = useState<any[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProducts = async (p = page) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qParams = new URLSearchParams({
        page: String(p),
        pageSize: '25',
        status: statusFilter,
        active: activeFilter,
      });
      if (search.trim()) qParams.set('q', search.trim());

      const res = await apiFetch<any>(`/products?${qParams.toString()}`);
      setProducts(res.items);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cargar productos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(1);
  }, [statusFilter, activeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProducts(1);
  };

  const handleToggleActive = async (p: ProductListItem) => {
    if (!isAdmin) return;
    const action = p.active ? 'deactivate' : 'activate';
    try {
      await apiFetch(`/products/${p.id}/${action}`, { method: 'POST' });
      fetchProducts(page);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al cambiar estado.');
    }
  };

  const openMovements = async (p: ProductListItem) => {
    setMovementsProduct(p);
    try {
      const res = await apiFetch<any>(`/products/${p.id}/movements`);
      setProductMovements(res.items || []);
    } catch {
      setProductMovements([]);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Catálogo de Productos</h2>
          <p className="text-xs text-slate-500">
            Control centralizado de rulemanes, rodamientos, sellos y repuestos ({total} en total).
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo producto</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex justify-between items-center">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-rose-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código de barras, SKU, nombre o marca..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Filtro por estado de stock */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="all">Todo el stock</option>
            <option value="alert">Requiere atención (Agotados + Bajos)</option>
            <option value="out">Solo Agotados</option>
            <option value="low">Solo Stock bajo</option>
            <option value="ok">Stock Normal</option>
            <option value="no_min">Sin mínimo configurado</option>
          </select>

          {/* Filtro activo */}
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-700"
          >
            <option value="1">Activos</option>
            <option value="0">Desactivados</option>
            <option value="all">Todos</option>
          </select>
        </div>
      </div>

      {/* Tabla de Productos */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 gap-2 text-xs">
            <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
            <span>Cargando catálogo...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No se encontraron productos con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">SKU / Código</th>
                  <th className="px-4 py-3">Nombre comercial</th>
                  <th className="px-4 py-3">Marca / Categoría</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Costo</th>}
                  <th className="px-4 py-3 text-center">Stock actual</th>
                  <th className="px-4 py-3 text-center">Mínimo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => {
                  const status = stockStatus(p.stock, p.minStock);
                  return (
                    <tr key={p.id} className={`hover:bg-slate-50/70 transition-colors ${!p.active ? 'opacity-60 bg-slate-50/30' : ''}`}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 block">{p.sku}</span>
                        {p.primaryBarcode && (
                          <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5">
                            <Barcode className="h-3 w-3" />
                            {p.primaryBarcode}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="font-medium text-slate-900 truncate">{p.name}</p>
                        {p.description && <p className="text-[10px] text-slate-400 truncate">{p.description}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {p.brand && <span className="font-semibold text-slate-700">{p.brand}</span>}
                        {p.categoryName && <span className="text-[10px] block text-slate-400">{p.categoryName}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatARS(p.priceCents)}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                          {p.costCents !== null ? formatARS(p.costCents) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-xs ${
                            status === 'out'
                              ? 'bg-rose-100 text-rose-700'
                              : status === 'low'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.stock} {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap text-slate-500">
                        {p.minStock !== null ? p.minStock : <span className="text-slate-300 italic">Sin mín.</span>}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            status === 'out'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : status === 'low'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : status === 'no_min'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {STOCK_STATUS_LABEL[status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openMovements(p)}
                            title="Ver movimientos de stock"
                            className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditProduct(p)}
                                title="Editar producto"
                                className="p-1.5 text-slate-400 hover:text-sky-600 rounded transition-colors cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleActive(p)}
                                title={p.active ? 'Desactivar producto' : 'Activar producto'}
                                className={`p-1.5 rounded transition-colors cursor-pointer ${
                                  p.active ? 'text-slate-400 hover:text-rose-600' : 'text-emerald-600 hover:text-emerald-700'
                                }`}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchProducts(page - 1)}
                className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchProducts(page + 1)}
                className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Crear Producto */}
      {createModalOpen && (
        <ProductFormModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => {
            setCreateModalOpen(false);
            fetchProducts(1);
          }}
        />
      )}

      {/* Modal: Editar Producto */}
      {editProduct && (
        <ProductFormModal
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSuccess={() => {
            setEditProduct(null);
            fetchProducts(page);
          }}
        />
      )}

      {/* Modal: Movimientos de un Producto */}
      {movementsProduct && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Historial de movimientos</h4>
                <p className="text-xs text-slate-500">{movementsProduct.name} ({movementsProduct.sku})</p>
              </div>
              <button type="button" onClick={() => setMovementsProduct(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {productMovements.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">No hay movimientos registrados para este producto.</p>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="px-3 py-2">Motivo</th>
                      <th className="px-3 py-2">Usuario</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productMovements.map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2 text-slate-500">{new Date(m.createdAt).toLocaleDateString('es-AR')}</td>
                        <td className="px-3 py-2 font-medium">{m.typeLabel}</td>
                        <td className={`px-3 py-2 text-right font-bold ${m.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{m.stockAfter}</td>
                        <td className="px-3 py-2 text-slate-600 truncate max-w-[120px]">{m.reason || '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{m.userDisplayName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Modal de Formulario de Producto (Alta o Edición)
const ProductFormModal: React.FC<{
  product?: ProductListItem;
  onClose: () => void;
  onSuccess: () => void;
}> = ({ product, onClose, onSuccess }) => {
  const isEdit = !!product;

  const [sku, setSku] = useState(product?.sku || '');
  const [name, setName] = useState(product?.name || '');
  const [description, setDescription] = useState(product?.description || '');
  const [brand, setBrand] = useState(product?.brand || '');
  const [categoryName, setCategoryName] = useState(product?.categoryName || '');
  const [unit, setUnit] = useState(product?.unit || 'unidad');
  const [priceInput, setPriceInput] = useState(product ? centsToInput(product.priceCents) : '');
  const [costInput, setCostInput] = useState(product && product.costCents !== null ? centsToInput(product.costCents) : '');
  const [initialStock, setInitialStock] = useState(0);
  const [minStock, setMinStock] = useState<number | ''>(product?.minStock ?? '');
  const [targetStock, setTargetStock] = useState<number | ''>(product?.targetStock ?? '');
  const [barcodesText, setBarcodesText] = useState((product?.barcodes || []).join('\n'));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const priceCents = parseMoneyToCents(priceInput);
    if (priceCents === null || priceCents < 0) {
      setErrorMsg('Ingresá un precio de venta válido (en pesos argentinos).');
      return;
    }

    const costCents = costInput.trim() ? parseMoneyToCents(costInput) : null;
    const barcodes = barcodesText
      .split('\n')
      .map((b) => b.trim())
      .filter(Boolean);

    const payload: any = {
      sku: sku.trim(),
      name: name.trim(),
      description: description.trim() || null,
      brand: brand.trim() || null,
      categoryName: categoryName.trim() || null,
      unit: unit.trim() || 'unidad',
      priceCents,
      costCents,
      minStock: minStock === '' ? null : Number(minStock),
      targetStock: targetStock === '' ? null : Number(targetStock),
      barcodes,
    };

    if (!isEdit) {
      payload.initialStock = Number(initialStock) || 0;
    }

    setIsSubmitting(true);
    try {
      if (isEdit) {
        // En edición, STRICTAMENTE NO SE ENVÍA STOCK
        await apiFetch(`/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4 my-8">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-bold text-base text-slate-900">
            {isEdit ? 'Editar producto' : 'Registrar nuevo producto'}
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SKU / Código interno *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ej: 6205-2RS"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Marca</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ej: SKF, FAG, Timken"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre comercial *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Rulemán 6205 2RS blindado"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría</label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ej: Rulemanes rígidos"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad de medida</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="unidad"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Precio de venta (ARS) *</label>
              <input
                type="text"
                required
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="1500,00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Costo de compra (opcional)</label>
              <input
                type="text"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="800,00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600"
              />
            </div>
          </div>

          {/* Gestión de existencias y umbrales */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <h5 className="text-xs font-bold text-slate-800">Parámetros de stock</h5>
            <div className="grid grid-cols-3 gap-2">
              {!isEdit ? (
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Stock inicial</label>
                  <input
                    type="number"
                    min="0"
                    value={initialStock}
                    onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-bold"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Stock actual</label>
                  <div className="px-2 py-1.5 bg-slate-200 border border-slate-300 rounded text-xs text-center font-bold text-slate-700">
                    {product.stock}
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5 leading-tight">No editable aquí</span>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Stock mínimo</label>
                <input
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder="Ej: 5"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Stock objetivo</label>
                <input
                  type="number"
                  min="0"
                  value={targetStock}
                  onChange={(e) => setTargetStock(e.target.value === '' ? '' : parseInt(e.target.value))}
                  placeholder="Ej: 20"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center"
                />
              </div>
            </div>
          </div>

          {/* Códigos de barra */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Códigos de barras (uno por línea, el primero es principal)
            </label>
            <textarea
              rows={2}
              value={barcodesText}
              onChange={(e) => setBarcodesText(e.target.value)}
              placeholder="7316576620527"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              <span>{isEdit ? 'Guardar cambios' : 'Crear producto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
