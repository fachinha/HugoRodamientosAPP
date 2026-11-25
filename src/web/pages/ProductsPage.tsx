import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
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
  MapPin,
  Ruler,
  Truck,
  Layers,
  Sparkles,
} from 'lucide-react';
import { apiFetch, ApiClientError } from '../api/client';
import { formatARS, centsToInput, parseMoneyToCents } from '../../shared/money';
import { stockStatus, STOCK_STATUS_LABEL } from '../../shared/stock';
import { useAuth } from '../context/AuthContext';
import type { ProductListItem } from '../../worker/services/products.service';

export const ProductsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filtros (inicializados desde URL si vienen desde Auditoría de Datos Faltantes)
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [shelfFilter, setShelfFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string>(() => searchParams.get('supplier') || '');
  const [suppliersList, setSuppliersList] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || 'all');
  const [missingFilter, setMissingFilter] = useState<string>(() => searchParams.get('missing') || 'all');
  const [activeFilter, setActiveFilter] = useState<string>('1');

  // Modales
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductListItem | null>(null);
  const [movementsProduct, setMovementsProduct] = useState<ProductListItem | null>(null);
  const [productMovements, setProductMovements] = useState<any[]>([]);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<any>('/suppliers')
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.items || [];
        const names = list.map((s: any) => s.name).filter(Boolean);
        setSuppliersList(names);
      })
      .catch(() => {});
  }, []);

  const fetchProducts = async (p = page) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qParams = new URLSearchParams({
        page: String(p),
        pageSize: '25',
        status: statusFilter,
        missing: missingFilter,
        active: activeFilter,
      });
      if (search.trim()) qParams.set('q', search.trim());
      if (shelfFilter.trim()) qParams.set('shelfNumber', shelfFilter.trim());
      if (supplierFilter.trim()) qParams.set('supplierName', supplierFilter.trim());

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
  }, [statusFilter, missingFilter, activeFilter, supplierFilter]);

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
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
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
              placeholder="Buscar en cualquier orden (sin importar espacios ni comas): ej. 'Chevrolet corsa 05012', 'bomba agua dolz vmg skf', 'chivilcoy alfa'..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
          <div className="w-36 relative">
            <MapPin className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={shelfFilter}
              onChange={(e) => setShelfFilter(e.target.value)}
              placeholder="Estantería (E01)"
              className="w-full pl-8 pr-2 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 font-mono"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer active:scale-95 transition-all"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Filtro por proveedor */}
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            className={`px-3 py-2 border rounded-lg text-xs font-medium max-w-[180px] ${
              supplierFilter
                ? 'border-orange-500 bg-orange-50 text-orange-900 font-bold'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <option value="">Todos los proveedores</option>
            {suppliersList.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Filtro por datos faltantes */}
          <select
            value={missingFilter}
            onChange={(e) => {
              const val = e.target.value;
              setMissingFilter(val);
              const next = new URLSearchParams(searchParams);
              if (val === 'all') next.delete('missing');
              else next.set('missing', val);
              setSearchParams(next, { replace: true });
            }}
            className={`px-3 py-2 border rounded-lg text-xs font-medium ${
              missingFilter !== 'all'
                ? 'border-orange-500 bg-orange-50 text-orange-900 font-bold'
                : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            <option value="all">Ficha: Todos</option>
            <option value="price">Falta Precio ($0)</option>
            <option value="cost">Falta Costo</option>
            <option value="supplier">Falta Proveedor</option>
            <option value="location">Falta Estantería</option>
            <option value="brand">Falta Marca</option>
            <option value="dimensions">Falta Medidas</option>
            <option value="min_stock">Falta Mínimo Stock</option>
          </select>

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
            <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
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
                  <th className="px-4 py-3">Ubicación / Medidas</th>
                  <th className="px-4 py-3">Marca / Proveedor</th>
                  <th className="px-4 py-3">Fechas Compra / Venta</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Costo (+Flete)</th>}
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
                      <td className="px-4 py-3 max-w-sm">
                        <p className="font-semibold text-slate-900 truncate" title={p.name}>{p.name}</p>
                        {p.description && p.description !== p.name && (
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-snug mt-0.5" title={p.description}>
                            {p.description}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.location ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                            <MapPin className="h-3 w-3 text-amber-600" />
                            {p.location}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300 italic">Sin estantería</span>
                        )}
                        {p.dimensions && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-600 font-mono mt-0.5 font-medium">
                            <Ruler className="h-2.5 w-2.5 text-slate-400" />
                            {p.dimensions}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {p.brand && <span className="font-semibold text-slate-700 block">{p.brand}</span>}
                        {p.categoryName && <span className="text-[10px] block text-slate-400">{p.categoryName}</span>}
                        {p.supplierName && (
                          <span className="text-[10px] block text-orange-600 font-medium truncate max-w-[130px]" title={`Proveedor: ${p.supplierName}`}>
                            {p.supplierName} {p.supplierCode ? `(${p.supplierCode})` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[11px] text-slate-600">
                        <div className="space-y-0.5">
                          <span className="block" title="Fecha de última entrada / compra">
                            <strong className="text-slate-500 font-semibold">Compra:</strong>{' '}
                            {p.lastPurchaseAt ? new Date(p.lastPurchaseAt).toLocaleDateString('es-AR') : <span className="text-slate-300 italic">Sin reg.</span>}
                          </span>
                          <span className="block" title="Fecha de última salida / venta">
                            <strong className="text-slate-500 font-semibold">Venta:</strong>{' '}
                            {p.lastSaleAt ? new Date(p.lastSaleAt).toLocaleDateString('es-AR') : <span className="text-slate-300 italic">Sin reg.</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                        {p.priceCents > 0 ? (
                          formatARS(p.priceCents)
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            <AlertTriangle className="h-3 w-3" />
                            Sin precio ($0)
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right text-slate-500 whitespace-nowrap">
                          {p.costCents !== null ? (
                            <div>
                              <span className="block font-medium text-slate-700">{formatARS(p.costCents)}</span>
                              {(p.freightPct || 0) > 0 && (
                                <span className="text-[10px] text-amber-700 font-semibold block">
                                  +{p.freightPct}% flete = {formatARS(Math.round(p.costCents * (1 + p.freightPct / 100)))}
                                </span>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
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
                                className="p-1.5 text-slate-400 hover:text-orange-600 rounded transition-colors cursor-pointer"
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
          <div className="p-4 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-medium">
              Página <strong className="text-slate-900">{page.toLocaleString('es-AR')}</strong> de{' '}
              <strong className="text-slate-900">{totalPages.toLocaleString('es-AR')}</strong> ({total.toLocaleString('es-AR')} artículos)
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchProducts(1)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:-translate-y-0.5 active:scale-96 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                « Primera
              </button>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => fetchProducts(page - 1)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-medium hover:bg-slate-50 hover:-translate-y-0.5 active:scale-96 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchProducts(page + 1)}
                className="px-3 py-1.5 bg-slate-800 text-white border border-slate-800 rounded-lg font-semibold hover:bg-slate-900 hover:-translate-y-0.5 active:scale-96 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Siguiente
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => fetchProducts(totalPages)}
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:-translate-y-0.5 active:scale-96 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Última »
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

  // Ubicación física
  const [shelfNumber, setShelfNumber] = useState(product?.shelfNumber || '');
  const [shelfLevel, setShelfLevel] = useState(product?.shelfLevel || '');
  const [compartment, setCompartment] = useState(product?.compartment || '');

  // Medidas técnicas
  const [innerDiameterMm, setInnerDiameterMm] = useState<number | ''>(product?.innerDiameterMm ?? '');
  const [outerDiameterMm, setOuterDiameterMm] = useState<number | ''>(product?.outerDiameterMm ?? '');
  const [widthMm, setWidthMm] = useState<number | ''>(product?.widthMm ?? '');

  // Proveedor, Flete y Fechas Compra/Venta
  const [supplierName, setSupplierName] = useState(product?.supplierName || '');
  const [supplierCode, setSupplierCode] = useState(product?.supplierCode || '');
  const [freightPct, setFreightPct] = useState<number>(product?.freightPct ?? 0);
  const [lastPurchaseAt, setLastPurchaseAt] = useState(
    product?.lastPurchaseAt ? product.lastPurchaseAt.slice(0, 10) : '',
  );
  const [lastSaleAt, setLastSaleAt] = useState(
    product?.lastSaleAt ? product.lastSaleAt.slice(0, 10) : '',
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingAiDesc, setIsGeneratingAiDesc] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleGenerateAiDescription = async () => {
    setErrorMsg(null);
    setIsGeneratingAiDesc(true);
    try {
      const dimsStr =
        innerDiameterMm || outerDiameterMm || widthMm
          ? `${innerDiameterMm || ''}x${outerDiameterMm || ''}x${widthMm || ''}`
          : product?.dimensions || null;
      const res = await apiFetch<{
        description: string;
        suggestedBrand: string | null;
        suggestedCategory: string | null;
      }>('/products/ai-describe', {
        method: 'POST',
        body: JSON.stringify({
          sku,
          name,
          brand: brand || null,
          dimensions: dimsStr,
          supplierName: supplierName || null,
          supplierCode: supplierCode || null,
        }),
      });
      if (res.description) setDescription(res.description);
      if (!brand.trim() && res.suggestedBrand) setBrand(res.suggestedBrand);
      if (!categoryName.trim() && res.suggestedCategory) setCategoryName(res.suggestedCategory);
    } catch (err: any) {
      setErrorMsg(err.message || 'No se pudo generar la descripción con IA.');
    } finally {
      setIsGeneratingAiDesc(false);
    }
  };

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
      shelfNumber: shelfNumber.trim() || null,
      shelfLevel: shelfLevel.trim() || null,
      compartment: compartment.trim() || null,
      innerDiameterMm: innerDiameterMm === '' ? null : Number(innerDiameterMm),
      outerDiameterMm: outerDiameterMm === '' ? null : Number(outerDiameterMm),
      widthMm: widthMm === '' ? null : Number(widthMm),
      supplierName: supplierName.trim() || null,
      supplierCode: supplierCode.trim() || null,
      freightPct: Number(freightPct) || 0,
      lastPurchaseAt: lastPurchaseAt ? `${lastPurchaseAt}T12:00:00.000Z` : null,
      lastSaleAt: lastSaleAt ? `${lastSaleAt}T12:00:00.000Z` : null,
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Descripción técnica, vehículos compatibles y equivalencias
              </label>
              <button
                type="button"
                disabled={isGeneratingAiDesc || (!sku.trim() && !name.trim())}
                onClick={handleGenerateAiDescription}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 rounded-lg text-[11px] font-semibold cursor-pointer active:scale-96 transition-all disabled:opacity-40"
              >
                {isGeneratingAiDesc ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 text-orange-600" />
                )}
                <span>Completar con IA</span>
              </button>
            </div>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aplicación vehicular (ej. Chevrolet Corsa 1.4/1.6 8V), tipo de pieza y equivalencias (DOLZ O106, VMG BA193, SKF VKPC85206, CHIVILCOY CH0119)..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-700 leading-relaxed"
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

          <div className="grid grid-cols-3 gap-3">
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Costo de compra</label>
              <input
                type="text"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                placeholder="800,00"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Flete a Bariloche (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="200"
                value={freightPct}
                onChange={(e) => setFreightPct(parseFloat(e.target.value) || 0)}
                placeholder="6.5"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-amber-900 bg-amber-50/40"
              />
            </div>
          </div>

          {costInput.trim() && (parseMoneyToCents(costInput) || 0) > 0 && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-900">
              <span>Costo puesto en Bariloche (Costo + {freightPct}% flete):</span>
              <strong className="font-mono font-bold">
                {formatARS(Math.round((parseMoneyToCents(costInput) || 0) * (1 + (Number(freightPct) || 0) / 100)))}
              </strong>
            </div>
          )}

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

          {/* Ubicación física en estantería */}
          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-600" />
                Ubicación en estantería
              </span>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white text-amber-900 border border-amber-200 shadow-2xs">
                {shelfNumber
                  ? `${shelfNumber.toUpperCase().trim()}${shelfLevel ? `-${shelfLevel.toUpperCase().trim()}` : ''}${compartment ? `-${compartment.trim()}` : ''}`
                  : 'Sin ubicación asignada'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Estantería</label>
                <input
                  type="text"
                  value={shelfNumber}
                  onChange={(e) => setShelfNumber(e.target.value.toUpperCase())}
                  placeholder="Ej: E01"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Nivel</label>
                <input
                  type="text"
                  value={shelfLevel}
                  onChange={(e) => setShelfLevel(e.target.value.toUpperCase())}
                  placeholder="Ej: A"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Compartimento</label>
                <input
                  type="text"
                  value={compartment}
                  onChange={(e) => setCompartment(e.target.value)}
                  placeholder="Ej: 1"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Medidas Técnicas (Calibre / Rodamiento) */}
          <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5 text-blue-600" />
                Medidas técnicas (Calibre en mm)
              </span>
              <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white text-blue-900 border border-blue-200 shadow-2xs">
                {innerDiameterMm || outerDiameterMm || widthMm
                  ? `${innerDiameterMm || '—'}x${outerDiameterMm || '—'}x${widthMm || '—'} mm`
                  : 'Sin medidas'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">d (Interior mm)</label>
                <input
                  type="number"
                  step="any"
                  value={innerDiameterMm}
                  onChange={(e) => setInnerDiameterMm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Ej: 25"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">D (Exterior mm)</label>
                <input
                  type="number"
                  step="any"
                  value={outerDiameterMm}
                  onChange={(e) => setOuterDiameterMm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Ej: 52"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">B (Ancho / Espesor mm)</label>
                <input
                  type="number"
                  step="any"
                  value={widthMm}
                  onChange={(e) => setWidthMm(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="Ej: 15"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                />
              </div>
            </div>
          </div>

          {/* Proveedor de Origen y Fechas de Compra / Venta */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-slate-600" />
              Proveedor de origen y fechas de compra / venta
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Nombre proveedor</label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Ej: Alfa Rodamientos"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Código en proveedor</label>
                <input
                  type="text"
                  value={supplierCode}
                  onChange={(e) => setSupplierCode(e.target.value)}
                  placeholder="Ej: 6205-2RS-C3"
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/70">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Fecha última compra</label>
                <input
                  type="date"
                  value={lastPurchaseAt}
                  onChange={(e) => setLastPurchaseAt(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Fecha última venta</label>
                <input
                  type="date"
                  value={lastSaleAt}
                  onChange={(e) => setLastSaleAt(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
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
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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
