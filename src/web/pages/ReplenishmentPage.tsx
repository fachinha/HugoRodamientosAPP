import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import {
  Truck,
  PackagePlus,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  Printer,
  MessageCircle,
  Check,
  X,
  Calendar,
  Building2,
  MapPin,
  Loader2,
  RefreshCw,
  PackageCheck,
  Edit2,
  Barcode,
  UserCheck,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { formatARS, parseMoneyToCents } from '../../shared/money';
import { formatDate } from '../../shared/time';
import { formatWhatsAppPhone } from '../../shared/quotes';
import {
  type ReplenishmentCandidateItem,
  type SupplierDetail,
  type SupplierOptionComparison,
  type PurchaseOrderDetail,
  PURCHASE_ORDER_STATUS_LABELS,
} from '../../shared/replenishment';
import { Logo } from '../components/Logo';

export const ReplenishmentPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'board' | 'orders' | 'suppliers'>(() => {
    const t = searchParams.get('tab');
    return t === 'suppliers' || t === 'orders' ? t : 'board';
  });

  // Filtros de sugerencias de reposición
  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [originFilter, setOriginFilter] = useState<'all' | 'manual' | 'sold_today' | 'low_stock' | 'customer_deposit'>('all');
  const [includeAlreadyCovered, setIncludeAlreadyCovered] = useState<boolean>(false);
  const [filterSuggestedText, setFilterSuggestedText] = useState<string>('');

  // Datos principales
  const [loadingBoard, setLoadingBoard] = useState<boolean>(true);
  const [boardSummary, setBoardSummary] = useState({
    totalToOrderCount: 0,
    soldTodayItemsCount: 0,
    lowStockItemsCount: 0,
    customerDepositsCount: 0,
    alreadyOrderedCount: 0,
  });
  const [suppliers, setSuppliers] = useState<SupplierDetail[]>([]);
  const [staffUsers, setStaffUsers] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ReplenishmentCandidateItem[]>([]);

  // Productos agregados por buscador / lector de código de barras estilo POS
  const [manualItems, setManualItems] = useState<ReplenishmentCandidateItem[]>([]);
  const [posQuery, setPosQuery] = useState<string>('');
  const [posResults, setPosResults] = useState<ReplenishmentCandidateItem[]>([]);
  const [posLoading, setPosLoading] = useState<boolean>(false);
  const [posFeedback, setPosFeedback] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const posInputRef = useRef<HTMLInputElement>(null);

  // Selección de qué pedir y con qué proveedor — TODOS DESELECCIONADOS POR DEFECTO
  const [selectionMap, setSelectionMap] = useState<
    Record<string, { selected: boolean; quantity: number; supplierId: number }>
  >({});

  // Quién realiza el pedido (requerido al confirmar)
  const [orderedByName, setOrderedByName] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Órdenes de Pedido y Seguimiento de Llegada
  const [orders, setOrders] = useState<PurchaseOrderDetail[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<'all' | 'ordered' | 'received' | 'cancelled'>('all');
  const [creatingOrderForSupplierId, setCreatingOrderForSupplierId] = useState<number | null>(null);
  const [printOrder, setPrintOrder] = useState<PurchaseOrderDetail | null>(null);

  // Modal: Confirmación de llegada de pedido (quién confirma que llegó + suma al stock)
  const [receiveModalOrder, setReceiveModalOrder] = useState<PurchaseOrderDetail | null>(null);
  const [receivedByName, setReceivedByName] = useState<string>('');
  const [receptionNotes, setReceptionNotes] = useState<string>('');
  const [submittingReceive, setSubmittingReceive] = useState<boolean>(false);

  // Modal: Agregar / Editar Proveedor
  const [supplierModalOpen, setSupplierModalOpen] = useState<boolean>(false);
  const [editingSupplierId, setEditingSupplierId] = useState<number | null>(null);
  const [supName, setSupName] = useState('');
  const [supCuit, setSupCuit] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supCity, setSupCity] = useState('Buenos Aires');
  const [supLeadDays, setSupLeadDays] = useState<number>(3);
  const [supAlertDays, setSupAlertDays] = useState<number>(5);
  const [supFreightPct, setSupFreightPct] = useState<number>(6.0);
  const [supPaymentTerms, setSupPaymentTerms] = useState('Cuenta corriente 30 días');
  const [supBrands, setSupBrands] = useState('');
  const [supNotes, setSupNotes] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Modal: Cargar/editar cotización de un proveedor para un producto
  const [optionModalCandidate, setOptionModalCandidate] = useState<ReplenishmentCandidateItem | null>(null);
  const [optSupplierId, setOptSupplierId] = useState<number>(1);
  const [optSupplierCode, setOptSupplierCode] = useState('');
  const [optBrand, setOptBrand] = useState('');
  const [optCostStr, setOptCostStr] = useState('');
  const [optFreightPct, setOptFreightPct] = useState<number>(6.0);
  const [optLeadDays, setOptLeadDays] = useState<number>(3);
  const [savingOption, setSavingOption] = useState(false);

  const fetchBoard = async () => {
    setLoadingBoard(true);
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        includeAlreadyCovered: includeAlreadyCovered ? '1' : '0',
      });
      const res = await apiFetch<any>(`/replenishment/board?${params.toString()}`);
      setBoardSummary(res.summary);
      setSuppliers(res.suppliers || []);
      if (Array.isArray(res.staffUsers)) {
        setStaffUsers(res.staffUsers);
      }
      if (res.currentUserName && !orderedByName) {
        setOrderedByName(res.currentUserName);
      }
      const list: ReplenishmentCandidateItem[] = res.candidates || [];
      setCandidates(list);

      // IMPORTANTE: Todos los artículos sugeridos arrancan DESELECCIONADOS (selected: false).
      // Se preservan únicamente los que el usuario ya haya tildado manualmente en esta sesión.
      setSelectionMap((prev) => {
        const nextSel: Record<string, { selected: boolean; quantity: number; supplierId: number }> = { ...prev };
        for (const item of list) {
          if (!nextSel[item.key]) {
            const defaultSupId =
              item.recommendedSupplierId || item.supplierOptions[0]?.supplierId || res.suppliers?.[0]?.id || 1;
            nextSel[item.key] = {
              selected: false,
              quantity: item.suggestedOrderQty || 1,
              supplierId: defaultSupId,
            };
          }
        }
        return nextSel;
      });
    } catch {
      // ignore
    } finally {
      setLoadingBoard(false);
    }
  };

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await apiFetch<PurchaseOrderDetail[]>('/purchase-orders');
      setOrders(res || []);
    } catch {
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    fetchBoard();
    fetchOrders();
  }, [selectedDate, includeAlreadyCovered]);

  useEffect(() => {
    if (activeTab === 'orders') {
      fetchOrders();
    }
  }, [activeTab]);

  // Búsqueda predictiva estilo POS al tipear código / código de barras / descripción
  useEffect(() => {
    const q = posQuery.trim();
    if (q.length < 2) {
      setPosResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setPosLoading(true);
      try {
        const res = await apiFetch<{ exactMatch: boolean; items: ReplenishmentCandidateItem[] }>(
          `/replenishment/lookup?q=${encodeURIComponent(q)}`,
        );
        setPosResults(res.items || []);
      } catch {
        setPosResults([]);
      } finally {
        setPosLoading(false);
      }
    }, 260);
    return () => window.clearTimeout(timer);
  }, [posQuery]);

  // Agrega un producto buscado/escaneado a la bandeja de pedido, lo tilda y selecciona su proveedor automático
  const addItemToOrderBuilder = (item: ReplenishmentCandidateItem, incrementIfSelected = false) => {
    const defaultSupId =
      item.recommendedSupplierId || item.supplierOptions[0]?.supplierId || suppliers[0]?.id || 1;
    const detectedSupplier =
      item.defaultSupplierName ||
      item.supplierOptions.find((o) => o.supplierId === defaultSupId)?.supplierName ||
      'Proveedor asignado';

    setManualItems((prev) => {
      const existsInManual = prev.some((m) => m.key === item.key);
      if (existsInManual) {
        return prev.map((m) => (m.key === item.key ? item : m));
      }
      return [item, ...prev];
    });

    setSelectionMap((prev) => {
      const existing = prev[item.key];
      const nextQty = existing && existing.selected && incrementIfSelected
        ? existing.quantity + 1
        : existing?.quantity || item.suggestedOrderQty || 1;
      return {
        ...prev,
        [item.key]: {
          selected: true,
          quantity: nextQty,
          supplierId: existing?.supplierId || defaultSupId,
        },
      };
    });

    const otherCount = Math.max(0, item.supplierOptions.length - 1);
    setPosFeedback({
      type: 'ok',
      text: `${item.sku} agregado · Proveedor: ${detectedSupplier}${
        otherCount > 0 ? ` (+${otherCount} proveedor(es) para comparar abajo)` : ''
      }`,
    });
  };

  // Escaneo con lectora de código de barras o Enter en el buscador POS
  const handlePosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = posQuery.trim();
    if (!q) return;
    setPosLoading(true);
    try {
      const res = await apiFetch<{ exactMatch: boolean; items: ReplenishmentCandidateItem[] }>(
        `/replenishment/lookup?q=${encodeURIComponent(q)}`,
      );
      const items = res.items || [];
      if (items.length === 0) {
        setPosFeedback({
          type: 'warn',
          text: `No se encontró ningún producto con código o descripción "${q}".`,
        });
        setPosResults([]);
      } else if (res.exactMatch || items.length === 1) {
        addItemToOrderBuilder(items[0], true);
        setPosQuery('');
        setPosResults([]);
        posInputRef.current?.focus();
      } else {
        setPosResults(items);
      }
    } catch (err: any) {
      setPosFeedback({
        type: 'warn',
        text: err.message || 'Error al buscar el artículo.',
      });
    } finally {
      setPosLoading(false);
    }
  };

  // Combinar ítems agregados manualmente por buscador POS (arriba) + candidatos automáticos sin duplicar
  const allCombinedCandidates = React.useMemo(() => {
    const manualKeys = new Set(manualItems.map((m) => m.key));
    const rest = candidates.filter((c) => !manualKeys.has(c.key));
    return [...manualItems, ...rest];
  }, [manualItems, candidates]);

  const filteredCandidates = allCombinedCandidates.filter((c) => {
    const isSelected = Boolean(selectionMap[c.key]?.selected);
    // Los ítems seleccionados por el usuario siempre permanecen visibles cuando está en 'all' o 'manual'
    if (originFilter !== 'all') {
      if (originFilter === 'manual') {
        if (!c.originReasons.includes('manual') && !isSelected) return false;
      } else if (!c.originReasons.includes(originFilter)) {
        return false;
      }
    }
    if (filterSuggestedText.trim()) {
      const q = filterSuggestedText.trim().toLowerCase();
      return (
        c.sku.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.brand && c.brand.toLowerCase().includes(q)) ||
        (c.defaultSupplierName && c.defaultSupplierName.toLowerCase().includes(q)) ||
        (c.depositCustomerName && c.depositCustomerName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const selectedItemsCount = React.useMemo(
    () => allCombinedCandidates.filter((c) => selectionMap[c.key]?.selected).length,
    [allCombinedCandidates, selectionMap],
  );

  // Agrupar TODOS los ítems seleccionados por proveedor elegido para armar los pedidos
  const groupedOrdersBySupplier = React.useMemo(() => {
    const groups = new Map<
      number,
      {
        supplier:
          | SupplierDetail
          | {
              id: number;
              name: string;
              phone: string | null;
              leadTimeDays: number;
              freightPct: number;
              hasDelayAlert: boolean;
            };
        items: {
          candidate: ReplenishmentCandidateItem;
          option: SupplierOptionComparison;
          quantity: number;
        }[];
        totalLandedCents: number;
      }
    >();

    for (const c of allCombinedCandidates) {
      const sel = selectionMap[c.key];
      if (!sel || !sel.selected || sel.quantity <= 0) continue;

      const chosenOption =
        c.supplierOptions.find((o) => o.supplierId === sel.supplierId) || c.supplierOptions[0];
      if (!chosenOption) continue;

      const supInfo = suppliers.find((s) => s.id === chosenOption.supplierId) || {
        id: chosenOption.supplierId,
        name: chosenOption.supplierName,
        phone: chosenOption.supplierPhone,
        leadTimeDays: chosenOption.leadTimeDays,
        freightPct: chosenOption.freightPct,
        hasDelayAlert: chosenOption.hasDelayAlert,
      };

      let group = groups.get(chosenOption.supplierId);
      if (!group) {
        group = {
          supplier: supInfo,
          items: [],
          totalLandedCents: 0,
        };
        groups.set(chosenOption.supplierId, group);
      }

      group.items.push({
        candidate: c,
        option: chosenOption,
        quantity: sel.quantity,
      });
      group.totalLandedCents += chosenOption.landedUnitCostCents * sel.quantity;
    }

    return Array.from(groups.values());
  }, [allCombinedCandidates, selectionMap, suppliers]);

  const handleSelectAllVisible = () => {
    setSelectionMap((prev) => {
      const next = { ...prev };
      for (const item of filteredCandidates) {
        if (item.isAlreadyCoveredByOrder) continue;
        const curr = next[item.key];
        const defaultSupId =
          item.recommendedSupplierId || item.supplierOptions[0]?.supplierId || suppliers[0]?.id || 1;
        next[item.key] = {
          selected: true,
          quantity: curr?.quantity || item.suggestedOrderQty || 1,
          supplierId: curr?.supplierId || defaultSupId,
        };
      }
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectionMap((prev) => {
      const next: typeof prev = {};
      for (const [k, v] of Object.entries(prev)) {
        next[k] = { ...v, selected: false };
      }
      return next;
    });
  };

  const handleGenerateOrderForSupplier = async (group: (typeof groupedOrdersBySupplier)[0]) => {
    const whoOrdered = orderedByName.trim();
    if (whoOrdered.length < 2) {
      alert('Por favor indicá el nombre de quién realiza este pedido antes de confirmarlo.');
      return;
    }

    setCreatingOrderForSupplierId(group.supplier.id);
    try {
      const created = await apiFetch<PurchaseOrderDetail>('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: group.supplier.id > 0 ? group.supplier.id : null,
          supplierName: group.supplier.name,
          supplierPhone: group.supplier.phone,
          leadTimeDays: group.supplier.leadTimeDays,
          freightPct: group.supplier.freightPct,
          orderedByName: whoOrdered,
          notes: orderNotes.trim() || `Pedido solicitado por ${whoOrdered} (${selectedDate})`,
          items: group.items.map((it) => ({
            productId: it.candidate.productId,
            depositId: it.candidate.depositId,
            sku: it.candidate.sku,
            name: it.candidate.name,
            brand: it.option.brandOffered || it.candidate.brand,
            supplierCode: it.option.supplierCode || it.candidate.sku,
            originReason: it.candidate.originReasons[0] || 'manual',
            quantity: it.quantity,
            unitCostCents: it.option.unitCostCents,
            freightPct: it.option.freightPct,
          })),
        }),
      });

      // Desmarcar los ítems que ya acaban de pasarse a pedido
      const orderedKeys = new Set(group.items.map((it) => it.candidate.key));
      setSelectionMap((prev) => {
        const next = { ...prev };
        for (const k of orderedKeys) {
          if (next[k]) next[k] = { ...next[k], selected: false };
        }
        return next;
      });
      setManualItems((prev) => prev.filter((m) => !orderedKeys.has(m.key)));
      setOrderNotes('');

      await Promise.all([fetchBoard(), fetchOrders()]);
      // Pasar automáticamente a la pestaña de Pedidos para seguir si llegó o no
      setOrderStatusFilter('all');
      setActiveTab('orders');
      setPrintOrder(created);
    } catch (err: any) {
      alert(err.message || 'Error al generar la orden de pedido al proveedor.');
    } finally {
      setCreatingOrderForSupplierId(null);
    }
  };

  const openReceiveConfirmationModal = (order: PurchaseOrderDetail) => {
    setReceiveModalOrder(order);
    setReceivedByName(orderedByName.trim() || staffUsers[0] || '');
    setReceptionNotes('');
  };

  const handleConfirmReceiveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalOrder) return;
    const whoReceived = receivedByName.trim();
    if (whoReceived.length < 2) {
      alert('Indicá quién confirma que llegó la mercadería para ingresar el stock.');
      return;
    }

    setSubmittingReceive(true);
    try {
      await apiFetch(`/purchase-orders/${receiveModalOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'received',
          receivedByName: whoReceived,
          receptionNotes: receptionNotes.trim() || null,
        }),
      });
      setReceiveModalOrder(null);
      await Promise.all([fetchOrders(), fetchBoard()]);
    } catch (err: any) {
      alert(err.message || 'Error al registrar recepción del pedido.');
    } finally {
      setSubmittingReceive(false);
    }
  };

  const handleCancelOrder = async (order: PurchaseOrderDetail) => {
    if (!window.confirm(`¿Seguro que querés anular el pedido ${order.orderNumber} a ${order.supplierName}?`)) {
      return;
    }
    try {
      await apiFetch(`/purchase-orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      fetchOrders();
      fetchBoard();
    } catch (err: any) {
      alert(err.message || 'Error al anular el pedido.');
    }
  };

  const handleSendOrderWhatsApp = (order: PurchaseOrderDetail) => {
    const phone = formatWhatsAppPhone(order.supplierPhone);
    const lines = order.items
      .map(
        (it) =>
          `• *${it.quantity} u.* - Cód: *${it.supplierCode || it.sku}* - ${it.name} ${it.brand ? `[${it.brand}]` : ''}`,
      )
      .join('\n');

    const msg = `Hola *${order.supplierName}*, te enviamos la Orden de Pedido *${order.orderNumber}* de *Rodamientos Hugo* (San Carlos de Bariloche) solicitada por *${order.orderedByName}*:\n\n${lines}\n\nPor favor confirmar disponibilidad y despacho por expreso a Bariloche. Muchas gracias.`;
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openNewSupplierModal = () => {
    setEditingSupplierId(null);
    setSupName('');
    setSupCuit('');
    setSupPhone('');
    setSupEmail('');
    setSupContact('');
    setSupCity('Buenos Aires');
    setSupLeadDays(3);
    setSupAlertDays(5);
    setSupFreightPct(6.0);
    setSupPaymentTerms('Cuenta corriente 30 días');
    setSupBrands('');
    setSupNotes('');
    setSupplierModalOpen(true);
  };

  const openEditSupplierModal = (s: SupplierDetail) => {
    setEditingSupplierId(s.id);
    setSupName(s.name);
    setSupCuit(s.cuit || '');
    setSupPhone(s.phone || '');
    setSupEmail(s.email || '');
    setSupContact(s.contactPerson || '');
    setSupCity(s.city || 'Buenos Aires');
    setSupLeadDays(s.leadTimeDays);
    setSupAlertDays(s.leadTimeAlertDays);
    setSupFreightPct(s.freightPct);
    setSupPaymentTerms(s.paymentTerms || 'Cuenta corriente 30 días');
    setSupBrands(s.brandsSupplied || '');
    setSupNotes(s.notes || '');
    setSupplierModalOpen(true);
  };

  useEffect(() => {
    const editId = searchParams.get('editSupplier');
    if (editId && suppliers.length > 0) {
      const target = suppliers.find((s) => String(s.id) === editId);
      if (target) {
        setActiveTab('suppliers');
        openEditSupplierModal(target);
        const next = new URLSearchParams(searchParams);
        next.delete('editSupplier');
        setSearchParams(next, { replace: true });
      }
    }
  }, [suppliers, searchParams]);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSupplier(true);
    try {
      const payload = {
        name: supName.trim(),
        cuit: supCuit.trim() || null,
        phone: supPhone.trim() || null,
        email: supEmail.trim() || null,
        contactPerson: supContact.trim() || null,
        city: supCity.trim() || 'Buenos Aires',
        leadTimeDays: Number(supLeadDays) || 3,
        leadTimeAlertDays: Number(supAlertDays) || 5,
        freightPct: Number(supFreightPct) || 0,
        paymentTerms: supPaymentTerms.trim(),
        brandsSupplied: supBrands.trim() || null,
        notes: supNotes.trim() || null,
      };
      if (editingSupplierId) {
        await apiFetch(`/suppliers/${editingSupplierId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/suppliers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setSupplierModalOpen(false);
      setEditingSupplierId(null);
      fetchBoard();
    } catch (err: any) {
      alert(err.message || 'Error al guardar proveedor.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const handleSaveProductOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optionModalCandidate || !optionModalCandidate.productId) return;
    const costCents = parseMoneyToCents(optCostStr);
    if (costCents === null || costCents < 0) {
      alert('Ingresá un costo válido.');
      return;
    }
    setSavingOption(true);
    try {
      await apiFetch('/suppliers/product-option', {
        method: 'POST',
        body: JSON.stringify({
          productId: optionModalCandidate.productId,
          supplierId: optSupplierId,
          supplierCode: optSupplierCode.trim() || optionModalCandidate.sku,
          brandOffered: optBrand.trim() || optionModalCandidate.brand,
          unitCostCents: costCents,
          freightPct: Number(optFreightPct) || 0,
          leadTimeDays: Number(optLeadDays) || 3,
          isPreferred: false,
        }),
      });

      // Si era un ítem buscado manualmente, refrescar su comparador también
      if (optionModalCandidate.originReasons.includes('manual')) {
        const refreshed = await apiFetch<{ exactMatch: boolean; items: ReplenishmentCandidateItem[] }>(
          `/replenishment/lookup?q=${encodeURIComponent(optionModalCandidate.sku)}`,
        );
        const match = refreshed.items.find((x) => x.key === optionModalCandidate.key);
        if (match) {
          setManualItems((prev) => prev.map((m) => (m.key === match.key ? match : m)));
        }
      }
      setOptionModalCandidate(null);
      fetchBoard();
    } catch (err: any) {
      alert(err.message || 'Error al guardar cotización del proveedor.');
    } finally {
      setSavingOption(false);
    }
  };

  const activePartsSuppliers = React.useMemo(
    () => suppliers.filter((s) => !(s.brandsSupplied || '').toUpperCase().includes('TRANSPORTE')),
    [suppliers],
  );

  const pendingArrivalOrdersCount = React.useMemo(
    () => orders.filter((o) => o.status === 'ordered').length,
    [orders],
  );

  const receivedOrdersCount = React.useMemo(
    () => orders.filter((o) => o.status === 'received').length,
    [orders],
  );

  const filteredOrders = React.useMemo(() => {
    if (orderStatusFilter === 'all') return orders;
    return orders.filter((o) => o.status === orderStatusFilter);
  }, [orders, orderStatusFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Encabezado Principal */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Pedidos a Proveedores y Recepción de Mercadería
          </h2>
          <p className="text-xs text-slate-500">
            Escaneá o buscá productos por código o código de barras, compará precios reales entre proveedores, registrá quién pide y confirmá la llegada para sumar al stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openNewSupplierModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 hover:-translate-y-0.5 text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer active:scale-96 transition-all"
          >
            <Plus className="h-4 w-4 text-orange-400" />
            <span>Agregar Proveedor</span>
          </button>

          <button
            type="button"
            onClick={() => {
              fetchBoard();
              fetchOrders();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 hover:-translate-y-0.5 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg cursor-pointer active:scale-96 transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Sección rápida: Qué Proveedores Hay Registrados */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Proveedores Registrados en el Sistema ({activePartsSuppliers.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Catálogos vinculados, porcentaje de flete y demora estimada de entrega a Bariloche. Tocá cualquiera para editar su ficha.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer self-start sm:self-auto"
          >
            Ver directorio completo ({suppliers.length}) →
          </button>
        </div>

        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {activePartsSuppliers.slice(0, 14).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => openEditSupplierModal(s)}
              className="shrink-0 w-52 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-orange-50/60 hover:border-orange-300 text-left transition-all cursor-pointer active:scale-96"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-xs text-slate-900 truncate">{s.name}</span>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 shrink-0">
                  {s.leadTimeDays}d
                </span>
              </div>
              <p className="text-[10px] text-slate-500 truncate mt-1">
                {s.brandsSupplied || 'Repuestos y rodamientos'}
              </p>
              <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-slate-200/80 text-[10px]">
                <span className="font-semibold text-orange-700">
                  {(s.productsCount || 0).toLocaleString('es-AR')} art.
                </span>
                <span className="font-mono text-slate-600">Flete +{s.freightPct}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Pestañas de Trabajo */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs no-print">
        <button
          type="button"
          onClick={() => setActiveTab('board')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-96 transition-all ${
            activeTab === 'board'
              ? 'bg-orange-600 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <PackagePlus className="h-4 w-4" />
          <span>
            Armar Pedido ({selectedItemsCount > 0 ? `${selectedItemsCount} seleccionados` : 'Por Producto / Código'})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-96 transition-all ${
            activeTab === 'orders'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Truck className="h-4 w-4" />
          <span>Pedidos y Llegadas ({orders.length})</span>
          {pendingArrivalOrdersCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950">
              {pendingArrivalOrdersCount} en camino
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer active:scale-96 transition-all ${
            activeTab === 'suppliers'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Directorio de Proveedores ({suppliers.length})</span>
        </button>
      </div>

      {/* PESTAÑA 1: Armar Pedido estilo POS + Comparador Multi-Proveedor */}
      {activeTab === 'board' && (
        <div className="space-y-4 no-print">
          {/* BUSCADOR Y LECTOR DE CÓDIGO DE BARRAS TIPO PUNTO DE VENTA */}
          <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 shadow-md space-y-3 border border-slate-800">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Barcode className="h-4 w-4 text-orange-400" />
                  <span>Buscar o Escanear Producto para Pedir (Estilo Punto de Venta)</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Escaneá el código de barras o escribí el código técnico / SKU. El sistema detecta automáticamente de qué proveedor es y lo compara con todos los proveedores que lo trabajan.
                </p>
              </div>
            </div>

            <form onSubmit={handlePosSubmit} className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Barcode className="h-4 w-4 text-orange-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={posInputRef}
                  type="text"
                  value={posQuery}
                  onChange={(e) => {
                    setPosQuery(e.target.value);
                    if (posFeedback) setPosFeedback(null);
                  }}
                  placeholder="Escanear código de barras o escribir código (ej: VKMA05012, F00099C110, KL420, 6204)..."
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-950 border border-slate-700 focus:border-orange-500 rounded-lg text-xs text-white placeholder:text-slate-400 font-mono focus:outline-none"
                />
                {posQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setPosQuery('');
                      setPosResults([]);
                      posInputRef.current?.focus();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={posLoading}
                className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-2 cursor-pointer active:scale-96 transition-all shrink-0"
              >
                {posLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span>Buscar / Agregar</span>
              </button>
            </form>

            {posFeedback && (
              <div
                className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between gap-2 ${
                  posFeedback.type === 'ok'
                    ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-500/20 border border-amber-500/40 text-amber-200'
                }`}
              >
                <span>{posFeedback.text}</span>
                <button type="button" onClick={() => setPosFeedback(null)} className="text-slate-300 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Resultados rápidos desplegables del buscador POS */}
            {posResults.length > 0 && (
              <div className="bg-white text-slate-800 rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-80 overflow-y-auto shadow-xl">
                {posResults.map((item) => {
                  const alreadySelected = Boolean(selectionMap[item.key]?.selected);
                  const bestOpt = item.supplierOptions[0];
                  const detectedSup = item.defaultSupplierName || bestOpt?.supplierName || 'Sin proveedor';

                  return (
                    <div
                      key={item.key}
                      className="p-3 hover:bg-orange-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded bg-slate-900 text-white">
                            {item.sku}
                          </span>
                          {item.brand && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
                              {item.brand}
                            </span>
                          )}
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-300">
                            Proveedor: {detectedSup}
                          </span>
                          {item.supplierOptions.length > 1 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                              Compara {item.supplierOptions.length} proveedores
                            </span>
                          )}
                          <span className="text-[10px] text-slate-500 font-mono">
                            Stock actual: {item.currentStock}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-900 truncate">{item.name}</p>
                        {bestOpt && bestOpt.landedUnitCostCents > 0 && (
                          <p className="text-[11px] text-slate-600 font-mono">
                            Mejor costo c/flete: <strong>{formatARS(bestOpt.landedUnitCostCents)}</strong> ({bestOpt.supplierName})
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          addItemToOrderBuilder(item, false);
                          setPosResults([]);
                          setPosQuery('');
                          posInputRef.current?.focus();
                        }}
                        className={`px-3.5 py-2 rounded-lg text-xs font-bold shrink-0 cursor-pointer active:scale-96 transition-all flex items-center gap-1.5 ${
                          alreadySelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-orange-600 hover:bg-orange-700 text-white'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{alreadySelected ? 'Seleccionado (Ver comparador)' : 'Seleccionar y Comparar'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PANEL DE CIERRE Y EMISIÓN DE PEDIDO (aparece apenas seleccionás al menos 1 producto) */}
          {groupedOrdersBySupplier.length > 0 && (
            <div className="bg-white border-2 border-orange-500 rounded-xl p-4 shadow-md space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Confirmar y Generar Pedido ({selectedItemsCount} artículo(s) seleccionados)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Indicá quién solicita el pedido. Al confirmarlo, pasará automáticamente a la pestaña de Pedidos para controlar cuándo llega.
                  </p>
                </div>

                {/* Campo obligatorio: Quién realiza el pedido */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5 w-full lg:w-auto">
                  <div className="min-w-[230px]">
                    <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center gap-1">
                      <UserCheck className="h-3.5 w-3.5 text-orange-600" />
                      <span>¿Quién realiza este pedido? *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={orderedByName}
                      onChange={(e) => setOrderedByName(e.target.value)}
                      placeholder="Nombre (ej: Hugo, Lucas, Mostrador)"
                      className="w-full px-3 py-2 border border-slate-300 focus:border-orange-500 rounded-lg text-xs font-bold text-slate-900 bg-orange-50/40 focus:bg-white focus:outline-none"
                    />
                    {staffUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {staffUsers.map((uName) => (
                          <button
                            key={uName}
                            type="button"
                            onClick={() => setOrderedByName(uName)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                              orderedByName === uName
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {uName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="min-w-[210px]">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Nota / Observación (opcional)
                    </label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="Ej: Urgente por cliente / expreso"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-800"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {groupedOrdersBySupplier.map((g) => (
                  <div
                    key={g.supplier.id}
                    className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-white truncate">
                          {g.supplier.name}
                        </span>
                        {g.supplier.hasDelayAlert ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                            Demora {g.supplier.leadTimeDays} días
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            Llega en {g.supplier.leadTimeDays} días
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        <strong>{g.items.length}</strong> producto(s) · Flete +{g.supplier.freightPct}%
                      </p>
                      <ul className="text-[10px] text-slate-400 space-y-0.5 max-h-20 overflow-y-auto">
                        {g.items.map((it) => (
                          <li key={it.candidate.key} className="truncate">
                            • {it.quantity}x {it.option.supplierCode || it.candidate.sku} ({it.candidate.name})
                          </li>
                        ))}
                      </ul>
                      <p className="text-base font-mono font-black text-orange-400 pt-1">
                        Total est. c/flete: {formatARS(g.totalLandedCents)}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={creatingOrderForSupplierId === g.supplier.id}
                      onClick={() => handleGenerateOrderForSupplier(g)}
                      className="w-full py-2.5 px-3 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-96 transition-all"
                    >
                      {creatingOrderForSupplierId === g.supplier.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      <span>Confirmar Pedido a {g.supplier.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Barra de Filtros y Selección Manual de Sugeridos */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                <span className="text-slate-600 font-medium">Ventas del:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="font-bold text-slate-900 bg-transparent focus:outline-none"
                />
              </div>

              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
              >
                <option value="all">Ver todos (Buscados + Sugeridos: {allCombinedCandidates.length})</option>
                <option value="manual">Solo Buscados / Seleccionados ({selectedItemsCount})</option>
                <option value="sold_today">Vendido del Día ({boardSummary.soldTodayItemsCount})</option>
                <option value="low_stock">Faltantes de Stock ({boardSummary.lowStockItemsCount})</option>
                <option value="customer_deposit">Señas de Clientes ({boardSummary.customerDepositsCount})</option>
              </select>

              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={includeAlreadyCovered}
                  onChange={(e) => setIncludeAlreadyCovered(e.target.checked)}
                  className="rounded border-slate-300 text-orange-600"
                />
                <span>Incluir ya pedidos ({boardSummary.alreadyOrderedCount})</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
              <div className="relative flex-1 sm:w-56">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterSuggestedText}
                  onChange={(e) => setFilterSuggestedText(e.target.value)}
                  placeholder="Filtrar en lista inferior..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <button
                type="button"
                onClick={handleSelectAllVisible}
                className="px-2.5 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-[11px] font-semibold text-slate-700 cursor-pointer active:scale-96 transition-all"
              >
                Tildar visibles
              </button>

              {selectedItemsCount > 0 && (
                <button
                  type="button"
                  onClick={handleDeselectAll}
                  className="px-2.5 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg text-[11px] font-semibold text-rose-700 flex items-center gap-1 cursor-pointer active:scale-96 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Destildar todos ({selectedItemsCount})</span>
                </button>
              )}
            </div>
          </div>

          {/* Lista de Productos para Seleccionar y Comparar entre Proveedores */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingBoard ? (
              <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                <span>Cargando bandeja y comparador de proveedores...</span>
              </div>
            ) : filteredCandidates.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                <p className="text-sm font-bold text-slate-800">
                  No hay productos en esta vista
                </p>
                <p className="text-xs text-slate-500">
                  Usá el buscador superior por código o código de barras para sumar cualquier repuesto al pedido.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredCandidates.map((item) => {
                  const sel = selectionMap[item.key] || {
                    selected: false,
                    quantity: item.suggestedOrderQty || 1,
                    supplierId: item.recommendedSupplierId || item.supplierOptions[0]?.supplierId || 1,
                  };
                  const titularName =
                    item.defaultSupplierName || item.supplierOptions[0]?.supplierName || 'Sin proveedor';

                  return (
                    <div
                      key={item.key}
                      className={`p-4 transition-colors ${
                        sel.selected
                          ? 'bg-orange-50/30 ring-1 ring-inset ring-orange-200'
                          : item.isAlreadyCoveredByOrder
                            ? 'bg-emerald-50/20 opacity-80'
                            : 'bg-white hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        {/* Columna 1: Checkbox manual + Datos del Producto + Proveedor detectado */}
                        <div className="flex items-start gap-3 lg:w-4/12">
                          <input
                            type="checkbox"
                            checked={sel.selected}
                            onChange={(e) =>
                              setSelectionMap((prev) => ({
                                ...prev,
                                [item.key]: { ...sel, selected: e.target.checked },
                              }))
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600 cursor-pointer"
                          />
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                                {item.sku}
                              </span>
                              {item.brand && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white">
                                  {item.brand}
                                </span>
                              )}
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-900 border border-orange-200">
                                Prov. habitual: {titularName}
                              </span>
                              {item.location && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200">
                                  <MapPin className="h-2.5 w-2.5" />
                                  {item.location}
                                </span>
                              )}
                            </div>

                            <p className="font-bold text-xs text-slate-900">{item.name}</p>

                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {item.originReasons.includes('manual') && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900">
                                  Buscado por código · Stock: {item.currentStock}
                                </span>
                              )}
                              {item.soldTodayQty > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
                                  Vendido hoy: {item.soldTodayQty} u.
                                </span>
                              )}
                              {item.originReasons.includes('low_stock') && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900">
                                  Stock actual: {item.currentStock} (Mín: {item.minStock ?? 0})
                                </span>
                              )}
                              {item.customerDepositQty > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                                  Seña {item.depositNumber}: {item.depositCustomerName} ({item.customerDepositQty} u.)
                                </span>
                              )}
                              {item.alreadyOrderedQty > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                                  Ya pedido en viaje: {item.alreadyOrderedQty} u. ({item.pendingOrderNumbers.join(', ')})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Columna 2: Cantidad a pedir + botón agregar cotización en otro proveedor */}
                        <div className="flex items-center gap-2 lg:w-2/12">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                              Cant. a pedir
                            </label>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                value={sel.quantity}
                                onChange={(e) =>
                                  setSelectionMap((prev) => ({
                                    ...prev,
                                    [item.key]: {
                                      ...sel,
                                      selected: true,
                                      quantity: Math.max(1, parseInt(e.target.value) || 1),
                                    },
                                  }))
                                }
                                className="w-18 px-2 py-1.5 border border-slate-300 rounded-lg text-center font-mono font-black text-xs text-slate-900 bg-white"
                              />
                              {item.productId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOptionModalCandidate(item);
                                    setOptSupplierId(suppliers[0]?.id || 1);
                                    setOptSupplierCode(item.sku);
                                    setOptBrand(item.brand || '');
                                    setOptCostStr('');
                                    setOptFreightPct(suppliers[0]?.freightPct || 6);
                                    setOptLeadDays(suppliers[0]?.leadTimeDays || 3);
                                  }}
                                  className="px-2 py-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold cursor-pointer active:scale-96 transition-all"
                                  title="Vincular otro proveedor a este producto para comparar"
                                >
                                  + Prov.
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Columna 3: Comparador Real con Todos los Proveedores que tienen ese Producto */}
                        <div className="lg:w-6/12 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                          {item.supplierOptions.map((opt) => {
                            const isChosen = sel.selected && sel.supplierId === opt.supplierId;
                            return (
                              <button
                                key={`${opt.supplierId}-${opt.supplierCode}`}
                                type="button"
                                onClick={() =>
                                  setSelectionMap((prev) => ({
                                    ...prev,
                                    [item.key]: {
                                      ...sel,
                                      selected: true,
                                      supplierId: opt.supplierId,
                                    },
                                  }))
                                }
                                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer active:scale-96 flex flex-col justify-between ${
                                  isChosen
                                    ? 'bg-orange-50 border-orange-600 ring-2 ring-orange-600/30 shadow-2xs'
                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-[11px] text-slate-900 truncate">
                                      {opt.supplierName}
                                    </span>
                                    {isChosen && (
                                      <span className="h-4 w-4 rounded-full bg-orange-600 text-white flex items-center justify-center shrink-0">
                                        <Check className="h-2.5 w-2.5" />
                                      </span>
                                    )}
                                  </div>

                                  {opt.supplierCode && (
                                    <span className="block text-[10px] font-mono text-slate-500 truncate">
                                      Cód: {opt.supplierCode} {opt.brandOffered ? `· ${opt.brandOffered}` : ''}
                                    </span>
                                  )}

                                  <div>
                                    <span className="font-mono font-black text-xs text-slate-900 block">
                                      {opt.landedUnitCostCents > 0 ? formatARS(opt.landedUnitCostCents) : 'A cotizar'}{' '}
                                      {opt.landedUnitCostCents > 0 && (
                                        <span className="text-[9px] font-normal text-slate-500">c/flete</span>
                                      )}
                                    </span>
                                    {opt.unitCostCents > 0 && (
                                      <span className="text-[10px] text-slate-500 block font-mono">
                                        Costo: {formatARS(opt.unitCostCents)} (+{opt.freightPct}%)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="pt-1.5 mt-1.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1">
                                  {opt.hasDelayAlert ? (
                                    <span
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300"
                                      title={`Demora ${opt.leadTimeDays} días en entregar a Bariloche`}
                                    >
                                      <AlertTriangle className="h-2.5 w-2.5" /> {opt.leadTimeDays}d
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                      <Clock className="h-2.5 w-2.5" /> {opt.leadTimeDays}d
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1">
                                    {opt.isPreferred && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-100 text-orange-900">
                                        Habitual
                                      </span>
                                    )}
                                    {opt.isCheapest && item.supplierOptions.length > 1 && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-900">
                                        Más barato
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PESTAÑA 2: Seguimiento de Pedidos (¿Llegó o no?) y Confirmación de Llegada con Alta de Stock */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden no-print">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Seguimiento de Pedidos a Proveedores (En Camino vs Recibidos)
              </h3>
              <p className="text-xs text-slate-500">
                Controlá qué pedidos siguen en viaje y cuáles ya llegaron. Al confirmar la llegada indicando quién recibe, las unidades se suman automáticamente al stock.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setOrderStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  orderStatusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('ordered')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  orderStatusFilter === 'ordered'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                }`}
              >
                Pendientes de llegada ({pendingArrivalOrdersCount})
              </button>
              <button
                type="button"
                onClick={() => setOrderStatusFilter('received')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  orderStatusFilter === 'received'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                Ya llegaron ({receivedOrdersCount})
              </button>
            </div>
          </div>

          {loadingOrders ? (
            <div className="p-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
              <span>Cargando seguimiento de pedidos...</span>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <Truck className="h-10 w-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No hay pedidos registrados en este filtro</p>
              <p className="text-xs text-slate-500">
                Armá un pedido desde la primera pestaña buscando por código o código de barras.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">N° Pedido / Quién lo pidió</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Artículos Pedidos</th>
                    <th className="px-4 py-3 text-right">Total c/ Flete</th>
                    <th className="px-4 py-3 text-center">¿Llegó? / Recepción</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-orange-600 block">{o.orderNumber}</span>
                        <span className="text-[11px] font-semibold text-slate-800 block mt-0.5">
                          Pedido por: {o.orderedByName}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Fecha: {formatDate(o.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{o.supplierName}</p>
                        {o.supplierPhone && (
                          <span className="text-[10px] text-emerald-700 font-mono block">{o.supplierPhone}</span>
                        )}
                        {o.expectedArrivalDate && o.status === 'ordered' && (
                          <span className="text-[10px] text-slate-500 block mt-0.5">
                            Arribo est.: {formatDate(o.expectedArrivalDate)} ({o.leadTimeDays}d)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="space-y-0.5">
                          {o.items.map((it) => (
                            <p key={it.id} className="text-[11px] text-slate-700 truncate">
                              <strong>{it.quantity}x</strong> {it.supplierCode || it.sku} — {it.name}
                            </p>
                          ))}
                        </div>
                        {o.notes && (
                          <p className="text-[10px] text-slate-400 italic mt-1 truncate">{o.notes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                        {formatARS(o.totalCents)}
                        <span className="block text-[10px] font-normal text-slate-400">
                          (Flete +{o.freightPct}%)
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {o.status === 'ordered' && (
                          <div className="space-y-1">
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                              No llegó aún (En camino)
                            </span>
                          </div>
                        )}
                        {o.status === 'received' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Llegó · Stock sumado</span>
                            </span>
                            {o.receivedByName && (
                              <span className="block text-[11px] font-bold text-emerald-800">
                                Confirmó: {o.receivedByName}
                              </span>
                            )}
                            {o.receivedAt && (
                              <span className="block text-[10px] text-slate-400">
                                {formatDate(o.receivedAt)}
                              </span>
                            )}
                            {o.receptionNotes && (
                              <span className="block text-[10px] text-slate-500 italic max-w-[180px] truncate mx-auto">
                                {o.receptionNotes}
                              </span>
                            )}
                          </div>
                        )}
                        {o.status === 'cancelled' && (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                            {PURCHASE_ORDER_STATUS_LABELS[o.status]}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {o.status === 'ordered' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReceiveConfirmationModal(o)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 hover:-translate-y-0.5 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer active:scale-96 transition-all shadow-2xs"
                              >
                                <PackageCheck className="h-3.5 w-3.5" />
                                <span>Confirmar que Llegó</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelOrder(o)}
                                className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-semibold cursor-pointer"
                              >
                                Anular
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSendOrderWhatsApp(o)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer"
                            title="Enviar pedido por WhatsApp al proveedor"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintOrder(o)}
                            className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Ver / Imprimir Orden de Pedido"
                          >
                            <Printer className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: Directorio Completo de Proveedores */}
      {activeTab === 'suppliers' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden no-print">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Proveedores Activos, Catálogos, Fletes y Demoras ({suppliers.length})
              </h3>
              <p className="text-xs text-slate-500">
                Listado completo de proveedores dados de alta en el sistema con sus marcas, condiciones comerciales y cantidad de artículos asociados.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewSupplierModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg cursor-pointer active:scale-96"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo Proveedor</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Proveedor / Ciudad</th>
                  <th className="px-4 py-3 text-center">Artículos</th>
                  <th className="px-4 py-3">Contacto / WhatsApp / Mail</th>
                  <th className="px-4 py-3">Marcas que Provee</th>
                  <th className="px-4 py-3 text-center">Flete (%)</th>
                  <th className="px-4 py-3 text-center">Demora</th>
                  <th className="px-4 py-3">Condición Comercial</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-900">{s.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500">{s.city}</span>
                        {s.cuit && (
                          <span className="text-[10px] text-slate-500 font-mono">· CUIT: {s.cuit}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-orange-700">
                      {(s.productsCount || 0).toLocaleString('es-AR')}
                    </td>
                    <td className="px-4 py-3 space-y-0.5">
                      {s.contactPerson && <p className="font-medium text-slate-800">{s.contactPerson}</p>}
                      {s.phone ? (
                        <span className="text-[11px] text-emerald-700 font-semibold font-mono block">{s.phone}</span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                          Sin WhatsApp/Tel
                        </span>
                      )}
                      {s.email && <span className="text-[10px] text-indigo-700 block">{s.email}</span>}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <span className="text-[11px] font-medium text-slate-700">
                        {s.brandsSupplied || 'Línea general'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-amber-900">
                      +{s.freightPct}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.hasDelayAlert ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-300">
                          {s.leadTimeDays} días
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {s.leadTimeDays} días
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-600">
                      <p className="font-semibold">{s.paymentTerms}</p>
                      {s.notes && <p className="text-[10px] text-slate-400 truncate max-w-xs">{s.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditSupplierModal(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 rounded-lg text-[11px] font-semibold cursor-pointer transition-all active:scale-96"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Editar</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Llegada de Pedido y Sumar al Stock */}
      {receiveModalOrder && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirmar Llegada de Pedido {receiveModalOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proveedor: <strong>{receiveModalOrder.supplierName}</strong> · Pedido originalmente por{' '}
                  <strong>{receiveModalOrder.orderedByName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalOrder(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReceiveOrder} className="space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 max-h-44 overflow-y-auto">
                <p className="text-[11px] font-bold text-slate-700 uppercase">
                  Mercadería que se sumará al stock ahora:
                </p>
                {receiveModalOrder.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 text-xs py-0.5 border-b border-slate-100 last:border-none">
                    <span className="truncate text-slate-800">
                      <strong className="font-mono text-slate-950">{it.supplierCode || it.sku}</strong> — {it.name}
                    </span>
                    <span className="shrink-0 font-mono font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      +{it.quantity} u.
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <UserCheck className="h-4 w-4 text-emerald-600" />
                  <span>¿Quién confirma que llegó el pedido? *</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={receivedByName}
                  onChange={(e) => setReceivedByName(e.target.value)}
                  placeholder="Nombre de quien controla y recibe la mercadería"
                  className="w-full px-3 py-2 border border-slate-300 focus:border-emerald-600 rounded-lg font-bold text-slate-900 focus:outline-none"
                />
                {staffUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {staffUsers.map((uName) => (
                      <button
                        key={uName}
                        type="button"
                        onClick={() => setReceivedByName(uName)}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                          receivedByName === uName
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {uName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Observaciones de recepción / N° de remito o guía (opcional)
                </label>
                <input
                  type="text"
                  value={receptionNotes}
                  onChange={(e) => setReceptionNotes(e.target.value)}
                  placeholder="Ej: Llegó por Vía Cargo / Remito 0004-00123456 completo"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReceiveModalOrder(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReceive}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer active:scale-96 transition-all"
                >
                  {submittingReceive ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                  <span>Confirmar Llegada y Sumar al Stock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Agregar / Editar Proveedor */}
      {supplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingSupplierId ? 'Editar Ficha de Proveedor' : 'Agregar Nuevo Proveedor'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configurá sus datos de contacto, % de flete a Bariloche y demora habitual de entrega.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSupplierModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nombre del Proveedor *</label>
                  <input
                    type="text"
                    required
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder="Ej: Rodamientos Sur S.A."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">CUIT</label>
                  <input
                    type="text"
                    value={supCuit}
                    onChange={(e) => setSupCuit(e.target.value)}
                    placeholder="30-..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Teléfono</label>
                  <input
                    type="text"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    placeholder="11..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email de Pedidos</label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder="pedidos@proveedor.com.ar"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Contacto / Vendedor</label>
                  <input
                    type="text"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    placeholder="Ej: Martín"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ciudad origen</label>
                  <input
                    type="text"
                    value={supCity}
                    onChange={(e) => setSupCity(e.target.value)}
                    placeholder="Buenos Aires"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                <div>
                  <label className="block font-bold text-amber-950 mb-1">Flete a Bariloche (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={supFreightPct}
                    onChange={(e) => setSupFreightPct(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-950 mb-1">Demora entrega (días)</label>
                  <input
                    type="number"
                    min="1"
                    value={supLeadDays}
                    onChange={(e) => setSupLeadDays(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-amber-950 mb-1">Alerta si supera (días)</label>
                  <input
                    type="number"
                    min="1"
                    value={supAlertDays}
                    onChange={(e) => setSupAlertDays(parseInt(e.target.value) || 5)}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marcas que trabaja</label>
                  <input
                    type="text"
                    value={supBrands}
                    onChange={(e) => setSupBrands(e.target.value)}
                    placeholder="Ej: SKF, FAG, DBH, Taranto"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Condición comercial</label>
                  <input
                    type="text"
                    value={supPaymentTerms}
                    onChange={(e) => setSupPaymentTerms(e.target.value)}
                    placeholder="Cuenta corriente 30/60 días"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notas / Descuentos habituales</label>
                <input
                  type="text"
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  placeholder="Ej: -25% + -20% pago contado"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setSupplierModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSupplier}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer active:scale-96"
                >
                  {savingSupplier ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Guardar Proveedor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Cargar / Actualizar Opción de Proveedor para un Artículo */}
      {optionModalCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 no-print">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Vincular Proveedor para {optionModalCandidate.sku}
                </h4>
                <p className="text-[11px] text-slate-500">{optionModalCandidate.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setOptionModalCandidate(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductOption} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Proveedor *</label>
                <select
                  value={optSupplierId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setOptSupplierId(id);
                    const sup = suppliers.find((s) => s.id === id);
                    if (sup) {
                      setOptFreightPct(sup.freightPct);
                      setOptLeadDays(sup.leadTimeDays);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-bold"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Demora: {s.leadTimeDays}d · Flete: +{s.freightPct}%)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código en ese proveedor</label>
                  <input
                    type="text"
                    value={optSupplierCode}
                    onChange={(e) => setOptSupplierCode(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marca ofrecida</label>
                  <input
                    type="text"
                    value={optBrand}
                    onChange={(e) => setOptBrand(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Costo Neto ($) *</label>
                  <input
                    type="text"
                    required
                    value={optCostStr}
                    onChange={(e) => setOptCostStr(e.target.value)}
                    placeholder="18500"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Flete (%)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={optFreightPct}
                    onChange={(e) => setOptFreightPct(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Demora (días)</label>
                  <input
                    type="number"
                    min="1"
                    value={optLeadDays}
                    onChange={(e) => setOptLeadDays(parseInt(e.target.value) || 1)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setOptionModalCandidate(null)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-slate-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingOption}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold cursor-pointer active:scale-96"
                >
                  Guardar Opción
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE IMPRESIÓN: Orden de Pedido a Proveedor */}
      {printOrder && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <Logo className="h-10 w-10" />
                <div>
                  <h4 className="font-black text-base text-slate-900">RODAMIENTOS HUGO</h4>
                  <p className="text-[11px] text-slate-500">Fagnano 1065 · San Carlos de Bariloche</p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2.5 py-0.5 rounded bg-slate-900 text-white font-mono font-bold text-xs">
                  {printOrder.orderNumber}
                </span>
                <p className="text-[11px] font-bold text-slate-700 mt-1 uppercase">
                  ORDEN DE PEDIDO A PROVEEDOR
                </p>
                <p className="text-[10px] text-slate-500">
                  Pedido por: <strong>{printOrder.orderedByName}</strong> · {formatDate(printOrder.createdAt)}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-slate-500">Proveedor:</p>
                  <p className="font-black text-sm text-slate-900">{printOrder.supplierName}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500">Estado / Arribo estimado:</p>
                  <p className="font-bold text-slate-900">
                    {printOrder.status === 'received'
                      ? `Recibido por ${printOrder.receivedByName || 'Local'}`
                      : `En camino · ${printOrder.leadTimeDays} días (${printOrder.expectedArrivalDate ? formatDate(printOrder.expectedArrivalDate) : '—'})`}
                  </p>
                </div>
              </div>

              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="px-3 py-2">Cód. Prov / SKU</th>
                    <th className="px-3 py-2">Descripción</th>
                    <th className="px-3 py-2 text-center">Cant.</th>
                    <th className="px-3 py-2 text-right">Costo c/Flete</th>
                    <th className="px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {printOrder.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-mono font-bold">{it.supplierCode || it.sku}</td>
                      <td className="px-3 py-2">
                        {it.name} {it.brand ? `[${it.brand}]` : ''}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">{it.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatARS(it.landedUnitCostCents)}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{formatARS(it.lineTotalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between p-3 bg-slate-900 text-white rounded-lg text-sm font-black">
                <span>TOTAL ESTIMADO (FLETE +{printOrder.freightPct}% INCLUIDO)</span>
                <span className="font-mono">{formatARS(printOrder.totalCents)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 no-print">
              <button
                type="button"
                onClick={() => handleSendOrderWhatsApp(printOrder)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-96"
              >
                <MessageCircle className="h-4 w-4" />
                <span>Enviar por WhatsApp al Proveedor</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-96"
              >
                <Printer className="h-4 w-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintOrder(null)}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold cursor-pointer active:scale-96"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
