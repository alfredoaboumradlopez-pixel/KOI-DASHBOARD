import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UploadCloud, ChevronLeft, ChevronRight, Trash2, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { CuentasPorPagar } from "./CuentasPorPagar";
import { CategoriaChips } from "./CategoriaChips";
import { useRestaurante } from "../context/RestauranteContext";

const fmt = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

const DIAS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DIAS_LARGO = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const comprobanteBadge = (c: string) => {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    FACTURA: { label: "Factura", bg: "#F3E8FF", color: "#7C3AED" },
    TICKET: { label: "Ticket", bg: "#EFF6FF", color: "#2563EB" },
    VALE: { label: "Vale", bg: "#FFF7ED", color: "#EA580C" },
    NOTA_REMISION: { label: "Nota Rem.", bg: "#F0FDF4", color: "#059669" },
    RECIBO: { label: "Recibo", bg: "#F0FDF4", color: "#059669" },
    TRANSFERENCIA: { label: "Transf.", bg: "#EFF6FF", color: "#2563EB" },
    SIN_COMPROBANTE: { label: "Sin comp.", bg: "#F3F4F6", color: "#9CA3AF" },
  };
  return map[c] || { label: c, bg: "#F3F4F6", color: "#9CA3AF" };
};

const parseDateStr = (s: string) => new Date(s + "T12:00:00");

interface ExpenseFormData {
  fecha: string;
  proveedor: string;
  categoria: string;
  total: string;
  metodoPago: string;
  comprobante: string;
  descripcion: string;
}

export const CapturaGastos: React.FC = () => {
  const { restauranteId } = useRestaurante();

  // ── Categorías ──
  const [CATEGORIAS, setCATEGORIAS] = useState<string[]>([]);
  useEffect(() => {
    api.get("/api/categorias").then((data: any[]) => setCATEGORIAS(data.map(c => c.nombre))).catch(() => {});
  }, []);

  // ── Action mode state ──
  const [showNuevoGasto, setShowNuevoGasto] = useState(false);
  const [gastoRapido, setGastoRapido] = useState(false);
  const [bitacoraMode, setBitacoraMode] = useState(false);

  // ── Bitácora state ──
  const [bitacoraData, setBitacoraData] = useState<any>(null);
  const [bitacoraLoading, setBitacoraLoading] = useState(false);
  const [bitacoraFecha, setBitacoraFecha] = useState(new Date().toISOString().split("T")[0]);
  const [rompiendoIdx, setRompiendoIdx] = useState<number | null>(null);
  const [romperLineas, setRomperLineas] = useState<{ categoria: string; descripcion: string; monto: string }[]>([]);
  const [bitacoraFile, setBitacoraFile] = useState<File | null>(null);

  const iniciarRomper = (idx: number) => {
    const g = bitacoraData.gastos[idx];
    setRompiendoIdx(idx);
    setRomperLineas([{ categoria: g.categoria, descripcion: g.descripcion, monto: String(g.monto) }]);
  };
  const addRomperLinea = () => setRomperLineas([...romperLineas, { categoria: "", descripcion: "", monto: "" }]);
  const confirmarRomper = () => {
    if (rompiendoIdx === null || !bitacoraData) return;
    const lineasValidas = romperLineas.filter(l => l.categoria && parseFloat(l.monto) > 0);
    if (!lineasValidas.length) return;
    const original = bitacoraData.gastos[rompiendoIdx];
    const nuevos = lineasValidas.map(l => ({ ...original, categoria: l.categoria, descripcion: l.descripcion, monto: parseFloat(l.monto) }));
    const gastosNuevos = [...bitacoraData.gastos];
    gastosNuevos.splice(rompiendoIdx, 1, ...nuevos);
    setBitacoraData({ ...bitacoraData, gastos: gastosNuevos, gastos_count: gastosNuevos.length, total_gastos: gastosNuevos.reduce((s: number, g: any) => s + g.monto, 0) });
    setRompiendoIdx(null);
    setRomperLineas([]);
  };

  const handleBitacoraUpload = async (file: File) => {
    setBitacoraLoading(true);
    setBitacoraFile(file);
    try {
      const result = await api.upload("/api/gastos/importar-bitacora", file);
      if (result.fecha) setBitacoraFecha(result.fecha);
      setBitacoraData(result);
    } catch (e: any) { alert("Error al procesar: " + (e.message || e)); }
    setBitacoraLoading(false);
  };

  const confirmarBitacora = async () => {
    if (!bitacoraData?.gastos?.length) return;
    setBitacoraLoading(true);
    let ok = 0;
    const errores: string[] = [];
    for (const g of bitacoraData.gastos) {
      try {
        await api.post("/api/gastos", {
          fecha: bitacoraFecha,
          proveedor: g.proveedor || "DESCONOCIDO",
          categoria: g.categoria || "OTROS",
          monto: g.monto,
          metodo_pago: g.metodo_pago || "EFECTIVO",
          comprobante: g.comprobante || "SIN_COMPROBANTE",
          descripcion: g.descripcion || null,
          restaurante_id: restauranteId,
        });
        ok++;
      } catch (e: any) {
        const msg = e?.message || e?.detail || String(e);
        errores.push(`${g.proveedor} $${g.monto}: ${msg}`);
      }
    }
    if (errores.length) {
      alert(`${ok} gastos guardados. ${errores.length} errores:\n${errores.slice(0, 5).join("\n")}`);
    } else {
      alert(`✓ ${ok} gastos registrados correctamente`);
    }
    setBitacoraData(null);
    setBitacoraMode(false);
    setBitacoraFile(null);
    fetchCajaData(cajaMes, cajaAnio);
    setBitacoraLoading(false);
  };

  // ── Gasto Rápido state ──
  const [rapidoProv, setRapidoProv] = useState<any>(null);
  const [rapidoMonto, setRapidoMonto] = useState("");
  const [rapidoDesc, setRapidoDesc] = useState("");
  const [rapidoComprobante, setRapidoComprobante] = useState("SIN_COMPROBANTE");
  const [rapidoMetodo, setRapidoMetodo] = useState("EFECTIVO");
  const [rapidoCategoria, setRapidoCategoria] = useState("");
  const [rapidoFecha, setRapidoFecha] = useState(new Date().toISOString().split("T")[0]);
  const [rapidoLineas, setRapidoLineas] = useState([{ categoria: "", descripcion: "", monto: "" }]);
  const addRapidoLinea = () => setRapidoLineas([...rapidoLineas, { categoria: "", descripcion: "", monto: "" }]);
  const removeRapidoLinea = (i: number) => { if (rapidoLineas.length > 1) setRapidoLineas(rapidoLineas.filter((_, idx) => idx !== i)); };
  const updateRapidoLinea = (i: number, field: string, value: string) => { const u = [...rapidoLineas]; (u[i] as any)[field] = value; setRapidoLineas(u); };
  const rapidoLineasTotal = rapidoLineas.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0);
  const [rapidoSaving, setRapidoSaving] = useState(false);
  const [gastosSession, setGastosSession] = useState<any[]>([]);
  const [rapidoSuccess, setRapidoSuccess] = useState(false);

  const selectRapidoProv = (p: any) => { setRapidoProv(p); setRapidoCategoria(p.categoria_default || "OTROS"); };

  const guardarRapido = async () => {
    const lineasValidas = rapidoLineas.filter(l => l.categoria && parseFloat(l.monto) > 0);
    if (!rapidoProv) return;
    if (!lineasValidas.length && (!rapidoMonto || parseFloat(rapidoMonto) <= 0)) return;
    setRapidoSaving(true);
    try {
      if (lineasValidas.length > 0) {
        for (const linea of lineasValidas) {
          await api.post("/api/gastos", { fecha: rapidoFecha, proveedor: rapidoProv.nombre, categoria: linea.categoria, monto: parseFloat(linea.monto), metodo_pago: rapidoMetodo, comprobante: rapidoComprobante, descripcion: linea.descripcion || null, restaurante_id: restauranteId });
        }
        setGastosSession(prev => [...prev, ...lineasValidas.map(l => ({ proveedor: rapidoProv.nombre, categoria: l.categoria, monto: parseFloat(l.monto), descripcion: l.descripcion, fecha: rapidoFecha, comprobante: rapidoComprobante }))]);
        setRapidoLineas([{ categoria: "", descripcion: "", monto: "" }]);
      } else {
        await api.post("/api/gastos", { fecha: rapidoFecha, proveedor: rapidoProv.nombre, categoria: rapidoCategoria, monto: parseFloat(rapidoMonto), metodo_pago: rapidoMetodo, comprobante: rapidoComprobante, descripcion: rapidoDesc || null, restaurante_id: restauranteId });
        setGastosSession(prev => [...prev, { proveedor: rapidoProv.nombre, categoria: rapidoCategoria, monto: parseFloat(rapidoMonto), descripcion: rapidoDesc, fecha: rapidoFecha, comprobante: rapidoComprobante }]);
      }
      setRapidoSuccess(true);
      setRapidoMonto("");
      setRapidoDesc("");
      setTimeout(() => setRapidoSuccess(false), 1500);
      fetchCajaData(cajaMes, cajaAnio);
    } catch (e) { alert("Error al guardar"); }
    setRapidoSaving(false);
  };

  // ── Manual form state ──
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lineasGasto, setLineasGasto] = useState([{ categoria: "", descripcion: "", monto: "" }]);
  const addLinea = () => setLineasGasto([...lineasGasto, { categoria: "", descripcion: "", monto: "" }]);
  const removeLinea = (i: number) => { if (lineasGasto.length > 1) setLineasGasto(lineasGasto.filter((_, idx) => idx !== i)); };
  const updateLinea = (i: number, field: string, value: string) => { const u = [...lineasGasto]; (u[i] as any)[field] = value; setLineasGasto(u); };
  const [formData, setFormData] = useState<ExpenseFormData>({ fecha: new Date().toISOString().split("T")[0], proveedor: "", categoria: "", total: "", metodoPago: "EFECTIVO", comprobante: "", descripcion: "" });

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.type === "dragenter" || e.type === "dragover") setDragActive(true); else if (e.type === "dragleave") setDragActive(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]); };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { e.preventDefault(); if (e.target.files?.[0]) handleFile(e.target.files[0]); };
  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile); setOcrState("processing"); setError(null); setSuccessMsg(null);
    try {
      const result = await api.upload("/api/gastos/ocr", selectedFile);
      setFormData({ fecha: result.fecha || new Date().toISOString().split("T")[0], proveedor: result.proveedor || "", categoria: result.categoria || "", total: result.total ? String(result.total) : "", metodoPago: "EFECTIVO", descripcion: result.descripcion || "", comprobante: "" });
      setOcrState("success");
      if (result.items?.length) setLineasGasto(result.items.map((item: any) => ({ categoria: item.categoria || "", descripcion: item.descripcion || "", monto: String(item.monto || "") })));
    } catch (e: any) { setOcrState("error"); setError("No se pudo procesar el ticket."); setOcrState("success"); }
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { const { name, value } = e.target; setFormData(prev => ({ ...prev, [name]: value })); };
  const handleManual = () => { setOcrState("success"); setFile(null); };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setSuccessMsg(null);
    const lineasValidas = lineasGasto.filter(l => l.categoria && parseFloat(l.monto) > 0);
    const amount = parseFloat(formData.total) || 0;
    if (amount <= 0 && !lineasValidas.length) { setError("Ingresa un monto o agrega líneas de desglose."); return; }
    if (!formData.proveedor || !formData.categoria) { setError("Completa todos los campos requeridos."); return; }
    setSaving(true);
    try {
      await api.post("/api/gastos", { fecha: formData.fecha, proveedor: formData.proveedor, categoria: formData.categoria, monto: amount, metodo_pago: formData.metodoPago, comprobante: formData.comprobante || "SIN_COMPROBANTE", descripcion: formData.descripcion || null, restaurante_id: restauranteId });
      setSuccessMsg("Gasto registrado exitosamente.");
      setTimeout(() => { setFile(null); setOcrState("idle"); setSuccessMsg(null); setFormData({ fecha: new Date().toISOString().split("T")[0], proveedor: "", categoria: "", total: "", metodoPago: "EFECTIVO", comprobante: "", descripcion: "" }); setLineasGasto([{ categoria: "", descripcion: "", monto: "" }]); }, 2000);
      fetchCajaData(cajaMes, cajaAnio);
    } catch (e: any) { setError(e.message || "Error al guardar el gasto"); }
    setSaving(false);
  };

  // ── Proveedores (for Gasto Rápido) ──
  const [proveedores, setProveedores] = useState<{ id: number; nombre: string; categoria_default: string }[]>([]);
  useEffect(() => {
    api.get(`/api/proveedores?restaurante_id=${restauranteId}`).then(setProveedores).catch(() => {});
  }, [restauranteId]);

  // ── Tab state ──
  const [tabGastos, setTabGastos] = useState<"caja" | "rbs" | "proveedores" | "categorias">("caja");

  // ── RBS state ──
  const [rbsData, setRbsData] = useState<any[]>([]);
  const [rbsLoading, setRbsLoading] = useState(false);
  const [showNuevaFactura, setShowNuevaFactura] = useState(false);
  const [rbsToast, setRbsToast] = useState<string | null>(null);
  const [rbsMes, setRbsMes] = useState(new Date().getMonth() + 1);
  const [rbsAnio, setRbsAnio] = useState(new Date().getFullYear());
  const [rbsForm, setRbsForm] = useState({ proveedor: "", categoria: "", descripcion: "", monto: "", fecha_factura: new Date().toISOString().split("T")[0], fecha_vencimiento: "" });
  const [rbsSaving, setRbsSaving] = useState(false);

  const showRbsToast = (msg: string) => { setRbsToast(msg); setTimeout(() => setRbsToast(null), 3000); };

  const fetchRbs = async (mes = rbsMes, anio = rbsAnio) => {
    setRbsLoading(true);
    try {
      const data = await api.get(`/api/rbs/${restauranteId}?mes=${mes}&anio=${anio}`);
      setRbsData(Array.isArray(data) ? data : []);
    } catch { setRbsData([]); }
    setRbsLoading(false);
  };

  useEffect(() => { if (tabGastos === "rbs" && restauranteId) fetchRbs(rbsMes, rbsAnio); }, [tabGastos, restauranteId, rbsMes, rbsAnio]);

  const crearFactura = async () => {
    if (!rbsForm.proveedor.trim() || !rbsForm.monto || parseFloat(rbsForm.monto) <= 0) return;
    setRbsSaving(true);
    try {
      await api.post(`/api/rbs/${restauranteId}`, {
        proveedor: rbsForm.proveedor.trim(), categoria: rbsForm.categoria || "OTROS",
        descripcion: rbsForm.descripcion || null, monto: parseFloat(rbsForm.monto),
        fecha_factura: rbsForm.fecha_factura,
        fecha_vencimiento: rbsForm.fecha_vencimiento || null,
      });
      setShowNuevaFactura(false);
      setRbsForm({ proveedor: "", categoria: "", descripcion: "", monto: "", fecha_factura: new Date().toISOString().split("T")[0], fecha_vencimiento: "" });
      fetchRbs(rbsMes, rbsAnio);
      showRbsToast("✓ Factura registrada");
    } catch (e: any) { alert("Error: " + (e?.message || String(e))); }
    setRbsSaving(false);
  };

  const subirArchivo = async (gastoId: number, tipo: "factura" | "comprobante") => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".pdf,.jpg,.jpeg,.png";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        await api.upload(`/api/rbs/${restauranteId}/${gastoId}/${tipo}`, file);
        fetchRbs(rbsMes, rbsAnio);
        showRbsToast(tipo === "comprobante" ? "✓ Factura marcada como pagada" : "✓ Factura subida correctamente");
      } catch (e: any) { alert("Error al subir: " + (e?.message || String(e))); }
    };
    input.click();
  };

  const eliminarRbs = async (id: number) => {
    if (!window.confirm("¿Eliminar esta factura?")) return;
    try { await api.del(`/api/rbs/${restauranteId}/${id}`); fetchRbs(rbsMes, rbsAnio); showRbsToast("Factura eliminada"); }
    catch (e: any) { alert("Error: " + (e?.message || String(e))); }
  };

  const rbsHoy = new Date().toISOString().split("T")[0];
  const rbsPendientes = rbsData.filter(g => g.estado === "PENDIENTE");
  const rbsVencidos = rbsData.filter(g => g.estado === "VENCIDO");
  const rbsPagados = rbsData.filter(g => g.estado === "PAGADO");
  const rbsTotalPendiente = rbsPendientes.reduce((s, g) => s + g.monto, 0);
  const rbsTotalVencido = rbsVencidos.reduce((s, g) => s + g.monto, 0);
  const rbsTotalPagado = rbsPagados.reduce((s, g) => s + g.monto, 0);

  // ── Calendar popover state ──
  const [showCalPopover, setShowCalPopover] = useState(false);
  const [calPopoverMes, setCalPopoverMes] = useState(0);
  const [calPopoverAnio, setCalPopoverAnio] = useState(0);
  const calContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showCalPopover) { setCalPopoverMes(cajaMes); setCalPopoverAnio(cajaAnio); }
  }, [showCalPopover]);
  useEffect(() => {
    if (!showCalPopover) return;
    const handler = (e: MouseEvent) => {
      if (calContainerRef.current && !calContainerRef.current.contains(e.target as Node)) {
        setShowCalPopover(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCalPopover]);

  // ── NEW: Caja KOI day-navigator state ──
  const hoyDate = useMemo(() => new Date(), []);
  const [cajaMes, setCajaMes] = useState(hoyDate.getMonth() + 1);
  const [cajaAnio, setCajaAnio] = useState(hoyDate.getFullYear());
  const [cajaData, setCajaData] = useState<any[]>([]);
  const [cajaLoading, setCajaLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"dia" | "semana" | "mes">("dia");
  const [filtroSearch, setFiltroSearch] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  const fetchCajaData = async (mes: number, anio: number) => {
    setCajaLoading(true);
    try {
      const data = await api.get(`/api/gastos-caja/${restauranteId}?mes=${mes}&anio=${anio}`);
      const arr: any[] = Array.isArray(data) ? data : [];
      setCajaData(arr);
      if (arr.length > 0 && !selectedDay) {
        const fechas = [...new Set(arr.map(g => g.fecha))].sort();
        setSelectedDay(fechas[fechas.length - 1]);
      }
    } catch (e) { setCajaData([]); }
    setCajaLoading(false);
  };

  useEffect(() => {
    fetchCajaData(cajaMes, cajaAnio);
  }, [restauranteId, cajaMes, cajaAnio]);

  // ── Computed: all days of month ──
  const allDaysOfMonth = useMemo(() => {
    const days: string[] = [];
    const daysInMonth = new Date(cajaAnio, cajaMes, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(`${cajaAnio}-${String(cajaMes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return days;
  }, [cajaMes, cajaAnio]);

  // ── Computed: totals per day ──
  const totalesPorDia = useMemo(() => {
    const t: Record<string, number> = {};
    cajaData.forEach(g => { t[g.fecha] = (t[g.fecha] || 0) + (g.monto || 0); });
    return t;
  }, [cajaData]);

  // ── Computed: summary cards ──
  const totalMes = useMemo(() => cajaData.reduce((s, g) => s + (g.monto || 0), 0), [cajaData]);
  const diasConGastos = useMemo(() => new Set(cajaData.map(g => g.fecha)).size, [cajaData]);
  const promedioDiario = diasConGastos > 0 ? totalMes / diasConGastos : 0;

  const { estaSemanaTotal, semanaLabel } = useMemo(() => {
    const hoy = new Date();
    const diasDesdeL = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeL);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    const lunesStr = lunes.toISOString().split("T")[0];
    const domingoStr = domingo.toISOString().split("T")[0];
    const total = cajaData
      .filter(g => g.fecha >= lunesStr && g.fecha <= domingoStr)
      .reduce((s, g) => s + (g.monto || 0), 0);
    const label = `${DIAS_ES[lunes.getDay()].toLowerCase()} ${lunes.getDate()} - ${DIAS_ES[domingo.getDay()].toLowerCase()} ${domingo.getDate()} ${MESES_CORTO[domingo.getMonth()]}`;
    return { estaSemanaTotal: total, semanaLabel: label };
  }, [cajaData]);

  // ── Computed: 5-day navigator window ──
  const navWindow = useMemo(() => {
    if (!allDaysOfMonth.length) return [];
    const idx = selectedDay ? allDaysOfMonth.indexOf(selectedDay) : allDaysOfMonth.length - 1;
    const center = idx >= 0 ? idx : allDaysOfMonth.length - 1;
    const start = Math.max(0, Math.min(center - 2, allDaysOfMonth.length - 5));
    return allDaysOfMonth.slice(start, start + 5);
  }, [selectedDay, allDaysOfMonth]);

  const navPrev = () => {
    if (!selectedDay) return;
    const idx = allDaysOfMonth.indexOf(selectedDay);
    if (idx > 0) { setSelectedDay(allDaysOfMonth[idx - 1]); setViewMode("dia"); }
  };
  const navNext = () => {
    if (!selectedDay) return;
    const idx = allDaysOfMonth.indexOf(selectedDay);
    if (idx < allDaysOfMonth.length - 1) { setSelectedDay(allDaysOfMonth[idx + 1]); setViewMode("dia"); }
  };

  const selectDay = (day: string) => { setSelectedDay(day); setViewMode("dia"); };

  // ── Inline edit state ──
  const [editandoGastoId, setEditandoGastoId] = useState<number | null>(null);
  const [editandoTabla, setEditandoTabla] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ proveedor: string; categoria: string; descripcion: string; metodo_pago: string; comprobante: string; monto: string }>({ proveedor: "", categoria: "", descripcion: "", metodo_pago: "EFECTIVO", comprobante: "SIN_COMPROBANTE", monto: "" });
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const startEdit = (g: any) => {
    setEditandoGastoId(g.id);
    setEditandoTabla(g.tabla);
    setEditForm({ proveedor: g.proveedor || "", categoria: g.categoria || "", descripcion: g.descripcion || "", metodo_pago: g.metodo_pago || "EFECTIVO", comprobante: g.comprobante || "SIN_COMPROBANTE", monto: String(g.monto || "") });
  };

  const cancelEdit = () => { setEditandoGastoId(null); setEditandoTabla(null); };

  const showToast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  const saveEdit = async (g: any) => {
    const monto = parseFloat(editForm.monto);
    if (!editForm.proveedor.trim() || isNaN(monto) || monto <= 0) return;
    try {
      await api.put(`/api/gastos/${g.id}`, {
        fecha: g.fecha,
        proveedor: editForm.proveedor.trim(),
        categoria: editForm.categoria,
        monto,
        metodo_pago: editForm.metodo_pago,
        comprobante: editForm.comprobante,
        descripcion: editForm.descripcion || null,
        restaurante_id: restauranteId,
      });
      setCajaData(prev => prev.map(item => item.id === g.id && item.tabla === g.tabla ? { ...item, proveedor: editForm.proveedor.trim(), categoria: editForm.categoria, descripcion: editForm.descripcion, metodo_pago: editForm.metodo_pago, comprobante: editForm.comprobante, monto } : item));
      setEditandoGastoId(null);
      setEditandoTabla(null);
      showToast("✓ Gasto actualizado");
    } catch (e: any) {
      alert("Error al guardar: " + (e?.message || String(e)));
    }
  };

  const deleteGasto = async (g: any) => {
    if (!window.confirm("¿Eliminar este gasto? Esta acción no se puede deshacer.")) return;
    try {
      await api.del(`/api/gastos/${g.id}`);
      setCajaData(prev => prev.filter(item => !(item.id === g.id && item.tabla === g.tabla)));
      showToast("Gasto eliminado");
    } catch (e: any) {
      alert("Error al eliminar: " + (e?.message || String(e)));
    }
  };

  // ── Computed: gastos for selected day (with filters) ──
  const selectedDayGastos = useMemo(() => {
    if (!selectedDay) return [];
    let list = cajaData.filter(g => g.fecha === selectedDay);
    if (filtroSearch.trim()) {
      const s = filtroSearch.toLowerCase();
      list = list.filter(g => (g.proveedor || "").toLowerCase().includes(s) || (g.descripcion || "").toLowerCase().includes(s));
    }
    if (filtroCat) list = list.filter(g => g.categoria === filtroCat);
    if (filtroTipo === "con_factura") list = list.filter(g => g.comprobante !== "SIN_COMPROBANTE");
    if (filtroTipo === "sin_factura") list = list.filter(g => g.comprobante === "SIN_COMPROBANTE");
    return list;
  }, [cajaData, selectedDay, filtroSearch, filtroCat, filtroTipo]);

  const totalDia = selectedDayGastos.reduce((s, g) => s + (g.monto || 0), 0);

  const selectedDayLabel = useMemo(() => {
    if (!selectedDay) return "";
    const d = parseDateStr(selectedDay);
    return `${DIAS_LARGO[d.getDay()]} ${d.getDate()} de ${MESES_LARGO[d.getMonth()]}`;
  }, [selectedDay]);

  // ── Semana view: current week's 7 days ──
  const semanaView = useMemo(() => {
    const hoy = new Date();
    const diasDesdeL = (hoy.getDay() + 6) % 7;
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - diasDesdeL);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      const str = d.toISOString().split("T")[0];
      return { fecha: str, dia: DIAS_ES[d.getDay()], num: d.getDate(), mes: MESES_CORTO[d.getMonth()], total: totalesPorDia[str] || 0 };
    });
  }, [totalesPorDia]);

  // ── Month view: all days of month ──
  const mesView = useMemo(() => {
    return allDaysOfMonth.map(fecha => {
      const d = parseDateStr(fecha);
      return { fecha, dia: DIAS_ES[d.getDay()], num: d.getDate(), total: totalesPorDia[fecha] || 0 };
    });
  }, [allDaysOfMonth, totalesPorDia]);

  const mesLabel = `${MESES_LARGO[cajaMes - 1]} ${cajaAnio}`;

  const calPopoverDays = useMemo(() => {
    if (!calPopoverMes || !calPopoverAnio) return [];
    const n = new Date(calPopoverAnio, calPopoverMes, 0).getDate();
    return Array.from({ length: n }, (_, i) =>
      `${calPopoverAnio}-${String(calPopoverMes).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
    );
  }, [calPopoverMes, calPopoverAnio]);

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
      {/* ── Toast ── */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)", background: "#111827", color: "#FFF", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", pointerEvents: "none" }}>{toastMsg}</div>
      )}
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #3D1C1E 0%, #5C2D30 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText style={{ width: "20px", height: "20px", color: "#C8FF00" }} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#111827", margin: 0 }}>Gastos & Proveedores</h1>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Facturas, gastos y gestión de proveedores</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: "4px", background: "#FFF", borderRadius: "12px", padding: "4px", marginBottom: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <button onClick={() => setTabGastos("caja")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tabGastos === "caja" ? "#059669" : "transparent", color: tabGastos === "caja" ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>Caja KOI</button>
        <button onClick={() => setTabGastos("rbs")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tabGastos === "rbs" ? "#7C3AED" : "transparent", color: tabGastos === "rbs" ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>RBS</button>
        <button onClick={() => setTabGastos("proveedores")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tabGastos === "proveedores" ? "#3D1C1E" : "transparent", color: tabGastos === "proveedores" ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>Proveedores</button>
        <button onClick={() => setTabGastos("categorias")} style={{ flex: 1, padding: "10px 16px", borderRadius: "10px", border: "none", cursor: "pointer", background: tabGastos === "categorias" ? "#F59E0B" : "transparent", color: tabGastos === "categorias" ? "#FFF" : "#6B7280", fontSize: "13px", fontWeight: "600", transition: "all 0.15s" }}>Categorías</button>
      </div>

      {/* ── PROVEEDORES TAB ── */}
      {tabGastos === "proveedores" && <CuentasPorPagar />}

      {/* ── CATEGORÍAS TAB ── */}
      {tabGastos === "categorias" && (
        <div style={{ background: "#FFF", borderRadius: "14px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
          <CategoriaChips />
        </div>
      )}

      {/* ── RBS TAB ── */}
      {tabGastos === "rbs" && !showNuevoGasto && (
        <div>
          {/* Toast */}
          {rbsToast && <div style={{ position: "fixed", bottom: "100px", left: "50%", transform: "translateX(-50%)", background: "#111827", color: "#FFF", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: "700", zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", pointerEvents: "none" }}>{rbsToast}</div>}

          {/* Header + mes selector */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button onClick={() => { const d = new Date(rbsAnio, rbsMes - 2, 1); setRbsMes(d.getMonth() + 1); setRbsAnio(d.getFullYear()); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft style={{ width: "14px", height: "14px", color: "#6B7280" }} /></button>
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#111827", minWidth: "120px", textAlign: "center" }}>{MESES_LARGO[rbsMes - 1]} {rbsAnio}</span>
              <button onClick={() => { const d = new Date(rbsAnio, rbsMes, 1); setRbsMes(d.getMonth() + 1); setRbsAnio(d.getFullYear()); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight style={{ width: "14px", height: "14px", color: "#6B7280" }} /></button>
            </div>
            <button onClick={() => setShowNuevaFactura(true)} style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "#7C3AED", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+ Nueva factura</button>
          </div>

          {/* Métricas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
            {[
              { label: "PENDIENTE DE PAGO", value: rbsTotalPendiente, color: "#F59E0B", bg: "#FFFBEB", count: rbsPendientes.length },
              { label: "PAGADO ESTE MES", value: rbsTotalPagado, color: "#059669", bg: "#F0FDF4", count: rbsPagados.length },
              { label: "VENCIDOS", value: rbsTotalVencido, color: "#EF4444", bg: "#FEF2F2", count: rbsVencidos.length },
            ].map(m => (
              <div key={m.label} style={{ background: m.bg, borderRadius: "12px", padding: "14px 16px", border: `1px solid ${m.color}22` }}>
                <div style={{ fontSize: "9px", fontWeight: "800", color: m.color, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>{m.label}</div>
                <div style={{ fontSize: "18px", fontWeight: "900", color: "#111827" }}>{fmt(m.value)}</div>
                <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{m.count} factura{m.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>

          {rbsLoading ? (
            <div style={{ padding: "40px", textAlign: "center" }}><Loader2 style={{ width: "24px", height: "24px", color: "#9CA3AF", margin: "0 auto", animation: "spin 1s linear infinite" }} /></div>
          ) : (
            <>
              {/* Banner vencidos */}
              {rbsVencidos.length > 0 && (
                <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>⚠️</span>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#DC2626" }}>
                    {rbsVencidos.length} factura{rbsVencidos.length !== 1 ? "s" : ""} vencida{rbsVencidos.length !== 1 ? "s" : ""} por {fmt(rbsTotalVencido)} — pagar inmediatamente
                  </span>
                </div>
              )}

              {/* Lista agrupada por estado */}
              {rbsData.length === 0 ? (
                <div style={{ background: "#FFF", borderRadius: "14px", padding: "40px", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Sin facturas registradas para este mes</p>
                  <button onClick={() => setShowNuevaFactura(true)} style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#7C3AED", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+ Nueva factura</button>
                </div>
              ) : (
                <>
                  {(["VENCIDO", "PENDIENTE", "PAGADO"] as const).map(estado => {
                    const grupo = rbsData.filter(g => g.estado === estado);
                    if (!grupo.length) return null;
                    const labels: Record<string, string> = { VENCIDO: "🔴 Vencidos", PENDIENTE: "🟡 Pendientes de pago", PAGADO: "✅ Pagados este mes" };
                    return (
                      <div key={estado} style={{ marginBottom: "20px" }}>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", paddingLeft: "4px" }}>{labels[estado]}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {grupo.map(g => {
                            const esHoy = g.fecha_vencimiento === rbsHoy;
                            const dotColor = estado === "VENCIDO" ? "#EF4444" : estado === "PAGADO" ? "#059669" : g.fecha_vencimiento ? "#F59E0B" : "#9CA3AF";
                            const cardBg = estado === "VENCIDO" ? "#FFF5F5" : estado === "PAGADO" ? "#F9FFFE" : "#FFFDF5";
                            const cardBorder = estado === "VENCIDO" ? "#FECACA" : estado === "PAGADO" ? "#A7F3D0" : "#FDE68A";
                            return (
                              <div key={g.id} style={{ background: cardBg, borderRadius: "12px", border: `1px solid ${cardBorder}`, padding: "14px 16px" }}>
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                                    <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#111827" }}>{g.proveedor} <span style={{ fontSize: "11px", fontWeight: "500", color: "#6B7280", background: "#F3F4F6", padding: "1px 6px", borderRadius: "4px", marginLeft: "4px" }}>{(g.categoria || "").replace(/_/g, " ")}</span></div>
                                      {g.descripcion && <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.descripcion}</div>}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: "15px", fontWeight: "900", color: "#111827" }}>{fmt(g.monto)}</div>
                                    {g.fecha_vencimiento && (
                                      <div style={{ fontSize: "11px", color: estado === "VENCIDO" ? "#EF4444" : "#9CA3AF", marginTop: "1px" }}>
                                        {estado === "PAGADO" ? `Pagado: ${g.fecha_pago}` : esHoy ? "⚡ Vence hoy" : `Vence: ${g.fecha_vencimiento}`}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {/* Archivos */}
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                                  {g.tiene_factura ? (
                                    <a href={`/api/rbs/${restauranteId}/${g.id}/factura/archivo`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", background: "#EFF6FF", color: "#2563EB", fontSize: "11px", fontWeight: "700", textDecoration: "none" }}>📄 Factura ✓</a>
                                  ) : estado !== "PAGADO" ? (
                                    <button onClick={() => subirArchivo(g.id, "factura")} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px dashed #D1D5DB", background: "#FFF", color: "#6B7280", fontSize: "11px", cursor: "pointer" }}>📄 Subir factura</button>
                                  ) : (
                                    <span style={{ fontSize: "11px", color: "#9CA3AF" }}>📄 Sin factura</span>
                                  )}
                                  {g.tiene_comprobante ? (
                                    <a href={`/api/rbs/${restauranteId}/${g.id}/comprobante/archivo`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", background: "#F0FDF4", color: "#059669", fontSize: "11px", fontWeight: "700", textDecoration: "none" }}>📎 Comprobante ✓</a>
                                  ) : estado !== "PAGADO" ? (
                                    <button onClick={() => subirArchivo(g.id, "comprobante")} style={{ padding: "4px 12px", borderRadius: "6px", border: "none", background: "#7C3AED", color: "#FFF", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>📎 Subir comprobante de pago</button>
                                  ) : null}
                                  <button onClick={() => eliminarRbs(g.id)} style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: "6px", border: "1px solid #FEE2E2", background: "#FFF", color: "#EF4444", fontSize: "11px", cursor: "pointer" }}>🗑</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}

          {/* Modal nueva factura */}
          {showNuevaFactura && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={e => { if (e.target === e.currentTarget) setShowNuevaFactura(false); }}>
              <div style={{ background: "#FFF", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <h3 style={{ fontSize: "16px", fontWeight: "800", color: "#111827", margin: 0 }}>Nueva factura / transferencia</h3>
                  <button onClick={() => setShowNuevaFactura(false)} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#F3F4F6", color: "#6B7280", cursor: "pointer" }}>✕</button>
                </div>
                {[
                  { label: "Proveedor *", key: "proveedor", type: "text", placeholder: "COCA COLA, SAMS..." },
                  { label: "Descripción", key: "descripcion", type: "text", placeholder: "Pedido semanal..." },
                  { label: "Monto *", key: "monto", type: "number", placeholder: "0.00" },
                  { label: "Fecha de factura *", key: "fecha_factura", type: "date", placeholder: "" },
                  { label: "Fecha de vencimiento", key: "fecha_vencimiento", type: "date", placeholder: "" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
                    <input type={f.type} value={(rbsForm as any)[f.key]} onChange={e => setRbsForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", boxSizing: "border-box" as const }} />
                  </div>
                ))}
                <div style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Categoría</label>
                  <select value={rbsForm.categoria} onChange={e => setRbsForm(prev => ({ ...prev, categoria: e.target.value }))} style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}>
                    <option value="">— Seleccionar —</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => setShowNuevaFactura(false)} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Cancelar</button>
                  <button onClick={crearFactura} disabled={rbsSaving || !rbsForm.proveedor.trim() || !rbsForm.monto} style={{ flex: 2, padding: "10px", borderRadius: "10px", border: "none", background: rbsSaving || !rbsForm.proveedor.trim() ? "#E5E7EB" : "#7C3AED", color: rbsSaving || !rbsForm.proveedor.trim() ? "#9CA3AF" : "#FFF", fontSize: "13px", fontWeight: "800", cursor: rbsSaving || !rbsForm.proveedor.trim() ? "not-allowed" : "pointer" }}>
                    {rbsSaving ? "Guardando..." : "Guardar factura"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CAJA KOI MAIN VIEW ── */}
      {tabGastos === "caja" && !showNuevoGasto && !gastoRapido && !bitacoraMode && (
        <div>
          {/* Month selector */}
          <div ref={calContainerRef} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
            <button onClick={() => { const d = new Date(cajaAnio, cajaMes - 2, 1); setCajaMes(d.getMonth() + 1); setCajaAnio(d.getFullYear()); setSelectedDay(null); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft style={{ width: "14px", height: "14px", color: "#6B7280" }} />
            </button>
            <button
              onClick={() => setShowCalPopover(v => !v)}
              style={{ fontSize: "14px", fontWeight: "700", color: "#111827", minWidth: "140px", textAlign: "center", background: showCalPopover ? "#F3F4F6" : "transparent", border: "1px solid " + (showCalPopover ? "#D1D5DB" : "transparent"), borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}
            >
              {mesLabel}
            </button>
            <button onClick={() => { const d = new Date(cajaAnio, cajaMes, 1); setCajaMes(d.getMonth() + 1); setCajaAnio(d.getFullYear()); setSelectedDay(null); }} style={{ width: "28px", height: "28px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronRight style={{ width: "14px", height: "14px", color: "#6B7280" }} />
            </button>
            {cajaLoading && <Loader2 style={{ width: "16px", height: "16px", color: "#9CA3AF", animation: "spin 1s linear infinite" }} />}

            {/* Calendar popover */}
            {showCalPopover && calPopoverDays.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", width: "300px", background: "#FFF", borderRadius: "14px", boxShadow: "0 8px 32px rgba(0,0,0,0.14)", border: "1px solid #E5E7EB", zIndex: 50, padding: "14px" }}>
                {/* Month nav header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <button
                    onClick={() => { const d = new Date(calPopoverAnio, calPopoverMes - 2, 1); setCalPopoverMes(d.getMonth() + 1); setCalPopoverAnio(d.getFullYear()); }}
                    style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <ChevronLeft style={{ width: "12px", height: "12px", color: "#6B7280" }} />
                  </button>
                  <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                    {MESES_LARGO[calPopoverMes - 1]} {calPopoverAnio}
                  </span>
                  <button
                    onClick={() => { const d = new Date(calPopoverAnio, calPopoverMes, 1); setCalPopoverMes(d.getMonth() + 1); setCalPopoverAnio(d.getFullYear()); }}
                    style={{ width: "26px", height: "26px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <ChevronRight style={{ width: "12px", height: "12px", color: "#6B7280" }} />
                  </button>
                </div>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: "4px" }}>
                  {["L", "M", "X", "J", "V", "S", "D"].map(d => (
                    <div key={d} style={{ textAlign: "center", fontSize: "9px", fontWeight: "700", color: "#9CA3AF", padding: "2px 0" }}>{d}</div>
                  ))}
                </div>
                {/* Day cells */}
                {(() => {
                  const firstDay = parseDateStr(calPopoverDays[0]);
                  const offsetDay = (firstDay.getDay() + 6) % 7;
                  const cells: (string | null)[] = Array(offsetDay).fill(null).concat(calPopoverDays);
                  while (cells.length % 7 !== 0) cells.push(null);
                  const weeks: (string | null)[][] = [];
                  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                  return weeks.map((week, wi) => (
                    <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: "2px" }}>
                      {week.map((dateStr, ci) => {
                        if (!dateStr) return <div key={ci} style={{ height: "34px" }} />;
                        const d = parseDateStr(dateStr);
                        const isSelected = dateStr === selectedDay;
                        const hasGastos = !!totalesPorDia[dateStr];
                        return (
                          <button
                            key={ci}
                            onClick={() => {
                              if (calPopoverMes !== cajaMes || calPopoverAnio !== cajaAnio) {
                                setCajaMes(calPopoverMes);
                                setCajaAnio(calPopoverAnio);
                                setSelectedDay(dateStr);
                                setViewMode("dia");
                              } else {
                                selectDay(dateStr);
                              }
                              setShowCalPopover(false);
                            }}
                            style={{ height: "34px", borderRadius: "8px", border: "none", background: isSelected ? "#3D1C1E" : hasGastos ? "#F0FDF4" : "transparent", color: isSelected ? "#C8FF00" : hasGastos ? "#111827" : "#9CA3AF", fontSize: "11px", fontWeight: isSelected ? "800" : hasGastos ? "700" : "400", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px" }}
                          >
                            {d.getDate()}
                            {hasGastos && (
                              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: isSelected ? "#C8FF00" : "#059669" }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "20px" }}>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Total Mes</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827" }}>{fmt(totalMes)}</div>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{mesLabel}</div>
            </div>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Esta Semana</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827" }}>{fmt(estaSemanaTotal)}</div>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{semanaLabel}</div>
            </div>
            <div style={{ background: "#FFF", borderRadius: "14px", padding: "16px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Promedio Diario</div>
              <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827" }}>{fmt(promedioDiario)}</div>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{diasConGastos} días con gastos</div>
            </div>
          </div>

          {/* View mode toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", color: "#9CA3AF", marginRight: "4px" }}>Vista:</span>
            {(["dia", "semana", "mes"] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{ padding: "5px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", background: viewMode === v ? "#3D1C1E" : "#FFF", color: viewMode === v ? "#C8FF00" : "#6B7280", fontSize: "12px", fontWeight: "600", cursor: "pointer", textTransform: "capitalize" }}>
                {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>

          {/* ── VISTA DÍA ── */}
          {viewMode === "dia" && (
            <>
              {/* 5-Day Navigator */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "16px", background: "#FFF", borderRadius: "14px", padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <button onClick={navPrev} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ChevronLeft style={{ width: "14px", height: "14px", color: "#6B7280" }} />
                </button>
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "4px" }}>
                  {navWindow.map(day => {
                    const d = parseDateStr(day);
                    const isSelected = day === selectedDay;
                    const hasGastos = !!totalesPorDia[day];
                    return (
                      <button
                        key={day}
                        onClick={() => selectDay(day)}
                        style={{ padding: "8px 4px", borderRadius: "10px", border: "none", background: isSelected ? "#3D1C1E" : hasGastos ? "#F9FAFB" : "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", transition: "all 0.15s" }}
                      >
                        <span style={{ fontSize: "10px", fontWeight: "600", color: isSelected ? "#C8FF00" : "#9CA3AF", textTransform: "uppercase" }}>{DIAS_ES[d.getDay()]}</span>
                        <span style={{ fontSize: "16px", fontWeight: "800", color: isSelected ? "#FFF" : "#111827" }}>{d.getDate()}</span>
                        <span style={{ fontSize: "9px", color: isSelected ? "rgba(255,255,255,0.6)" : "#9CA3AF" }}>{MESES_CORTO[d.getMonth()]}</span>
                        {hasGastos && (
                          <span style={{ fontSize: "9px", fontWeight: "700", color: isSelected ? "#C8FF00" : "#059669", marginTop: "1px" }}>
                            ${(totalesPorDia[day] / 1000).toFixed(1)}k
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button onClick={navNext} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ChevronRight style={{ width: "14px", height: "14px", color: "#6B7280" }} />
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <input
                  value={filtroSearch}
                  onChange={e => setFiltroSearch(e.target.value)}
                  placeholder="🔍 Buscar proveedor o descripción..."
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px", background: "#FFF" }}
                />
                <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "12px", background: "#FFF", color: filtroCat ? "#111827" : "#9CA3AF" }}>
                  <option value="">Categoría</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "12px", background: "#FFF", color: filtroTipo ? "#111827" : "#9CA3AF" }}>
                  <option value="">Tipo</option>
                  <option value="con_factura">Con comprobante</option>
                  <option value="sin_factura">Sin comprobante</option>
                </select>
              </div>

              {/* Day header + action buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <span style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>{selectedDayLabel}</span>
                  {selectedDay && (
                    <span style={{ fontSize: "12px", color: "#9CA3AF", marginLeft: "10px" }}>
                      {selectedDayGastos.length} gasto{selectedDayGastos.length !== 1 ? "s" : ""} · {fmt(totalDia)}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => { setBitacoraMode(true); setGastoRapido(false); setShowNuevoGasto(false); }} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "#2563EB", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>📄 Bitácora</button>
                  <button onClick={() => { setGastoRapido(true); setShowNuevoGasto(false); setBitacoraMode(false); setRapidoProv(null); }} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "#059669", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>⚡ Gasto rápido</button>
                  <button onClick={() => { setShowNuevoGasto(true); setGastoRapido(false); setBitacoraMode(false); }} style={{ padding: "6px 12px", borderRadius: "8px", border: "none", background: "#3D1C1E", color: "#C8FF00", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+ Manual</button>
                </div>
              </div>

              {/* Flat gastos list */}
              <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
                {cajaLoading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <Loader2 style={{ width: "24px", height: "24px", color: "#9CA3AF", margin: "0 auto", animation: "spin 1s linear infinite" }} />
                  </div>
                ) : !selectedDay || selectedDayGastos.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>Sin gastos registrados para este día</p>
                    <button onClick={() => { setGastoRapido(true); setRapidoProv(null); }} style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#059669", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>⚡ Agregar gasto</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px 90px 90px 64px", padding: "8px 20px", borderBottom: "1px solid #F3F4F6", background: "#FAFBFC" }}>
                      {["Proveedor", "Categoría", "Descripción", "Tipo", "Monto", ""].map(h => (
                        <span key={h} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</span>
                      ))}
                    </div>
                    {selectedDayGastos.map((g, i) => {
                      const badge = comprobanteBadge(g.comprobante || "SIN_COMPROBANTE");
                      const isEditing = editandoGastoId === g.id && editandoTabla === g.tabla;
                      if (isEditing) {
                        return (
                          <div key={`${g.tabla}-${g.id}-${i}`} style={{ padding: "12px 20px", borderBottom: "1px solid #F9FAFB", background: "#FFFBEB" }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px 90px 90px 64px", gap: "6px", alignItems: "center" }}>
                              <input value={editForm.proveedor} onChange={e => setEditForm(f => ({ ...f, proveedor: e.target.value }))} style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: "6px", outline: "none" }} placeholder="Proveedor" />
                              <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} style={{ fontSize: "11px", padding: "5px 6px", border: "1px solid #D1D5DB", borderRadius: "6px", outline: "none" }}>
                                {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                              </select>
                              <input value={editForm.descripcion} onChange={e => setEditForm(f => ({ ...f, descripcion: e.target.value }))} style={{ fontSize: "11px", padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: "6px", outline: "none" }} placeholder="Descripción" />
                              <select value={editForm.comprobante} onChange={e => setEditForm(f => ({ ...f, comprobante: e.target.value }))} style={{ fontSize: "11px", padding: "5px 6px", border: "1px solid #D1D5DB", borderRadius: "6px", outline: "none" }}>
                                {["TICKET", "VALE", "FACTURA", "NOTA_REMISION", "RECIBO", "TRANSFERENCIA", "SIN_COMPROBANTE"].map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                              </select>
                              <input type="number" value={editForm.monto} onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))} style={{ fontSize: "12px", padding: "5px 8px", border: "1px solid #D1D5DB", borderRadius: "6px", outline: "none", textAlign: "right" }} />
                              <div style={{ display: "flex", gap: "4px" }}>
                                <button onClick={() => saveEdit(g)} style={{ flex: 1, padding: "5px 0", borderRadius: "6px", border: "none", background: "#059669", color: "#FFF", fontSize: "11px", fontWeight: "700", cursor: "pointer" }}>✓</button>
                                <button onClick={cancelEdit} style={{ flex: 1, padding: "5px 0", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "11px", cursor: "pointer" }}>✕</button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={`${g.tabla}-${g.id}-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 120px 160px 90px 90px 64px", padding: "12px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.proveedor}</span>
                          <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "6px", background: "#F3F4F6", color: "#374151", width: "fit-content" }}>{(g.categoria || "").replace(/_/g, " ")}</span>
                          <span style={{ fontSize: "12px", color: "#9CA3AF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.descripcion || "—"}</span>
                          <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "6px", background: badge.bg, color: badge.color, fontWeight: "600", width: "fit-content" }}>{badge.label}</span>
                          <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", textAlign: "right" }}>{fmt(g.monto || 0)}</span>
                          <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                            <button onClick={() => startEdit(g)} title="Editar" style={{ padding: "4px 7px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", fontSize: "12px", cursor: "pointer" }}>✏️</button>
                            <button onClick={() => deleteGasto(g)} title="Eliminar" style={{ padding: "4px 7px", borderRadius: "6px", border: "1px solid #FEE2E2", background: "#FFF", color: "#EF4444", fontSize: "12px", cursor: "pointer" }}>🗑</button>
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 20px", background: "#3D1C1E", borderTop: "2px solid #3D1C1E" }}>
                      <span style={{ fontSize: "13px", fontWeight: "900", color: "#C8FF00" }}>{fmt(totalDia)}</span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── VISTA SEMANA ── */}
          {viewMode === "semana" && (
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Semana actual</span>
                <span style={{ fontSize: "12px", color: "#9CA3AF" }}>{semanaLabel}</span>
              </div>
              {semanaView.map(({ fecha, dia, num, mes, total }) => (
                <button key={fecha} onClick={() => selectDay(fecha)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #F9FAFB", background: fecha === selectedDay ? "#F9FAFB" : "#FFF", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: total > 0 ? "#3D1C1E" : "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "13px", fontWeight: "800", color: total > 0 ? "#C8FF00" : "#9CA3AF" }}>{num}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#374151" }}>{dia} {num} {mes}</span>
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: total > 0 ? "#111827" : "#D1D5DB" }}>{total > 0 ? fmt(total) : "—"}</span>
                </button>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 20px", background: "#FAFBFC" }}>
                <span style={{ fontSize: "12px", color: "#9CA3AF" }}>Total semana</span>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>{fmt(semanaView.reduce((s, d) => s + d.total, 0))}</span>
              </div>
            </div>
          )}

          {/* ── VISTA MES ── */}
          {viewMode === "mes" && (
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Todos los días — {mesLabel}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => (
                  <div key={d} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase", borderBottom: "1px solid #F3F4F6" }}>{d}</div>
                ))}
              </div>
              {/* Build a week-aligned grid */}
              {(() => {
                const firstDay = parseDateStr(allDaysOfMonth[0]);
                const offsetDay = (firstDay.getDay() + 6) % 7; // Mon=0
                const cells: (typeof mesView[0] | null)[] = Array(offsetDay).fill(null).concat(mesView);
                while (cells.length % 7 !== 0) cells.push(null);
                const weeks: (typeof mesView[0] | null)[][] = [];
                for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
                return weeks.map((week, wi) => (
                  <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                    {week.map((cell, ci) => cell ? (
                      <button key={ci} onClick={() => selectDay(cell.fecha)} style={{ padding: "8px 4px", borderBottom: "1px solid #F9FAFB", borderRight: "1px solid #F9FAFB", background: cell.fecha === selectedDay ? "#3D1C1E" : cell.total > 0 ? "#FAFAFA" : "#FFF", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", minHeight: "56px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: cell.fecha === selectedDay ? "#C8FF00" : "#374151" }}>{cell.num}</span>
                        {cell.total > 0 && <span style={{ fontSize: "9px", fontWeight: "700", color: cell.fecha === selectedDay ? "#C8FF00" : "#059669" }}>${(cell.total / 1000).toFixed(1)}k</span>}
                      </button>
                    ) : (
                      <div key={ci} style={{ minHeight: "56px", borderBottom: "1px solid #F9FAFB", borderRight: "1px solid #F9FAFB" }} />
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── BITÁCORA MODE ── */}
      {tabGastos === "caja" && bitacoraMode && (
        <div>
          <div style={{ marginBottom: "12px" }}>
            <button onClick={() => { setBitacoraMode(false); setBitacoraData(null); fetchCajaData(cajaMes, cajaAnio); }} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", color: "#6B7280", cursor: "pointer" }}>← Volver</button>
          </div>
          <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", marginBottom: "4px" }}>📄 Importar Bitácora de Gastos</h3>
            <p style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "16px" }}>Sube PDF de la bitácora diaria y se registran todos los gastos automáticamente</p>
            {!bitacoraData ? (
              <div>
                <input type="file" accept=".pdf" onChange={e => e.target.files?.[0] && handleBitacoraUpload(e.target.files[0])} style={{ display: "none" }} id="bitacora-input" />
                <label htmlFor="bitacora-input" style={{ display: "block", padding: "30px", border: "2px dashed #E5E7EB", borderRadius: "12px", textAlign: "center", cursor: "pointer", background: "#FAFBFC" }}>
                  {bitacoraLoading ? <span style={{ fontSize: "14px", color: "#6B7280" }}>Procesando PDF...</span> : <div><span style={{ fontSize: "14px", fontWeight: "600", color: "#111827" }}>Click para seleccionar PDF de bitácora</span><br /><span style={{ fontSize: "12px", color: "#9CA3AF" }}>El formato debe ser la bitácora de gastos diaria</span></div>}
                </label>
              </div>
            ) : (
              <div>
                <div style={{ padding: "12px 14px", borderRadius: "8px", background: "#EFF6FF", marginBottom: "8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <div><span style={{ fontSize: "13px", fontWeight: "700", color: "#2563EB" }}>Bitácora procesada</span><span style={{ fontSize: "12px", color: "#6B7280", marginLeft: "8px" }}>{bitacoraData.responsable}</span></div>
                    <span style={{ fontSize: "14px", fontWeight: "800", color: "#2563EB" }}>{bitacoraData.gastos_count} gastos | {fmt(bitacoraData.total_gastos)}</span>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280" }}>Fecha:</label>
                    <input type="date" value={bitacoraFecha} onChange={e => setBitacoraFecha(e.target.value)} style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #BFDBFE", fontSize: "13px", fontWeight: "600" }} />
                  </div>
                </div>
                {/* Total validation banner */}
                <div style={{ padding: "10px 14px", borderRadius: "8px", background: bitacoraData.coincide_total ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${bitacoraData.coincide_total ? "#BBF7D0" : "#FDE68A"}`, marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "15px" }}>{bitacoraData.coincide_total ? "✓" : "⚠️"}</span>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: bitacoraData.coincide_total ? "#059669" : "#92400E" }}>
                    {bitacoraData.coincide_total
                      ? `Total extraído ${fmt(bitacoraData.total_gastos)} coincide con TOTAL del PDF ${fmt(bitacoraData.total_pdf ?? bitacoraData.total_gastos)}`
                      : `Total extraído ${fmt(bitacoraData.total_gastos)} no coincide con TOTAL del PDF ${fmt(bitacoraData.total_pdf ?? 0)} — revisa las filas marcadas`}
                  </span>
                </div>
                <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid #F3F4F6" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "22px 1fr 52px 100px 80px 80px 52px", padding: "8px 14px", background: "#FAFBFC", borderBottom: "1px solid #F3F4F6", gap: "6px" }}>
                    {["", "Proveedor", "Tipo", "Categoría", "Comprobante", "Monto", ""].map((h, hi) => <span key={hi} style={{ fontSize: "10px", fontWeight: "700", color: "#9CA3AF", textTransform: "uppercase" }}>{h}</span>)}
                  </div>
                  {bitacoraData.gastos.map((g: any, i: number) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr 52px 100px 80px 80px 52px", padding: "8px 14px", borderBottom: "1px solid #F9FAFB", alignItems: "center", gap: "6px", background: g.valido === false ? "#FFFBEB" : "transparent" }}>
                      {/* status badge */}
                      <span title={g.valido === false ? (g.advertencias || []).join(", ") : "Correcto"} style={{ fontSize: "13px", cursor: g.valido === false ? "help" : "default" }}>
                        {g.valido === false ? "⚠️" : "✓"}
                      </span>
                      {/* proveedor: editable if invalid */}
                      <div>
                        {g.valido === false ? (
                          <input
                            value={g.proveedor}
                            onChange={e => {
                              const updated = [...bitacoraData.gastos];
                              updated[i] = { ...updated[i], proveedor: e.target.value };
                              setBitacoraData({ ...bitacoraData, gastos: updated });
                            }}
                            style={{ width: "100%", padding: "3px 6px", borderRadius: "5px", border: "1px solid #FDE68A", fontSize: "12px", fontWeight: "600", color: "#92400E", background: "#FFFBEB" }}
                          />
                        ) : (
                          <span style={{ fontSize: "13px", fontWeight: "600", color: "#111827" }}>{g.proveedor}</span>
                        )}
                        {g.descripcion && <div style={{ fontSize: "11px", color: "#9CA3AF" }}>{g.descripcion.slice(0, 50)}</div>}
                      </div>
                      {/* clase MP/NMP badge */}
                      <span style={{ fontSize: "10px", padding: "2px 5px", borderRadius: "4px", background: g.clase === "MP" ? "#EFF6FF" : "#FFF7ED", color: g.clase === "MP" ? "#2563EB" : "#EA580C", fontWeight: "700", textAlign: "center" }}>{g.clase || "—"}</span>
                      <span style={{ fontSize: "11px", padding: "2px 6px", borderRadius: "4px", background: "#F3F4F6", color: "#374151" }}>{(g.categoria || "").replace(/_/g, " ")}</span>
                      <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "#FDF4FF", color: "#7C3AED" }}>{(g.comprobante || "").replace(/_/g, " ")}</span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", textAlign: "right" }}>{fmt(g.monto)}</span>
                      <button onClick={() => iniciarRomper(i)} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer" }}>Romper</button>
                    </div>
                  ))}
                </div>
                {rompiendoIdx !== null && (
                  <div style={{ padding: "14px", borderRadius: "10px", background: "#FFFBEB", border: "1px solid #FDE68A", marginTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "#92400E" }}>Romper gasto: {bitacoraData.gastos[rompiendoIdx]?.proveedor} ({fmt(bitacoraData.gastos[rompiendoIdx]?.monto || 0)})</span>
                      <button onClick={addRomperLinea} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", border: "none", background: "#FDE68A", color: "#92400E", fontWeight: "600", cursor: "pointer" }}>+ Línea</button>
                    </div>
                    {romperLineas.map((l, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 30px", gap: "6px", marginBottom: "6px" }}>
                        <select value={l.categoria} onChange={e => { const u = [...romperLineas]; u[i].categoria = e.target.value; setRomperLineas(u); }} style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px" }}>
                          <option value="">Categoría...</option>
                          {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>)}
                        </select>
                        <input value={l.descripcion} onChange={e => { const u = [...romperLineas]; u[i].descripcion = e.target.value; setRomperLineas(u); }} placeholder="Detalle" style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px" }} />
                        <input type="number" step="0.01" value={l.monto} onChange={e => { const u = [...romperLineas]; u[i].monto = e.target.value; setRomperLineas(u); }} placeholder="$0" style={{ padding: "6px 8px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px", fontWeight: "700" }} />
                        {romperLineas.length > 1 && <button onClick={() => setRomperLineas(romperLineas.filter((_, idx) => idx !== i))} style={{ border: "none", background: "none", cursor: "pointer", color: "#DC2626", fontSize: "14px" }}>×</button>}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <button onClick={confirmarRomper} style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#92400E", color: "#FFF", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Confirmar Desglose</button>
                      <button onClick={() => { setRompiendoIdx(null); setRomperLineas([]); }} style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", cursor: "pointer" }}>Cancelar</button>
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                  <button onClick={confirmarBitacora} disabled={bitacoraLoading} style={{ flex: 1, padding: "12px", borderRadius: "10px", border: "none", background: "#2563EB", color: "#FFF", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>{bitacoraLoading ? "Registrando..." : "Confirmar y Registrar " + bitacoraData.gastos_count + " Gastos"}</button>
                  <button onClick={() => { setBitacoraData(null); setBitacoraFile(null); }} style={{ padding: "12px 20px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "13px", cursor: "pointer" }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── GASTO RÁPIDO ── */}
      {tabGastos === "caja" && gastoRapido && (
        <div>
          <div style={{ marginBottom: "12px" }}>
            <button onClick={() => { setGastoRapido(false); setGastosSession([]); fetchCajaData(cajaMes, cajaAnio); }} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", color: "#6B7280", cursor: "pointer" }}>← Volver</button>
          </div>
          <div style={{ background: "#FFF", borderRadius: "14px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04),0 4px 12px rgba(0,0,0,0.02)" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "#111827", marginBottom: "4px" }}>⚡ Gasto Rápido</h3>
            <p style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "16px" }}>Selecciona proveedor → se auto-llena la categoría → solo pon monto y descripción</p>
            {!rapidoProv ? (
              <div>
                <p style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "10px" }}>Selecciona proveedor:</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px" }}>
                  {proveedores.map(p => (
                    <button key={p.id} onClick={() => selectRapidoProv(p)} style={{ padding: "14px 12px", borderRadius: "10px", border: "2px solid #F3F4F6", background: "#FFF", cursor: "pointer", textAlign: "left" }}>
                      <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>{p.nombre}</div>
                      <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "2px" }}>{(p.categoria_default || "").replace(/_/g, " ")}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", padding: "12px 16px", borderRadius: "10px", background: "#F0FDF4", border: "2px solid #059669" }}>
                  <div><span style={{ fontSize: "16px", fontWeight: "800", color: "#059669" }}>{rapidoProv.nombre}</span><span style={{ fontSize: "12px", color: "#6B7280", marginLeft: "12px" }}>{(rapidoCategoria || "").replace(/_/g, " ")}</span></div>
                  <button onClick={() => setRapidoProv(null)} style={{ fontSize: "11px", color: "#059669", border: "none", background: "none", cursor: "pointer", fontWeight: "700" }}>Cambiar</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                  <div><label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Fecha</label><input type="date" value={rapidoFecha} onChange={e => setRapidoFecha(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }} /></div>
                  <div><label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Monto $</label><input type="number" step="0.01" value={rapidoMonto} onChange={e => setRapidoMonto(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarRapido()} placeholder="0.00" autoFocus style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "16px", fontWeight: "700" }} /></div>
                  <div><label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Descripción</label><input value={rapidoDesc} onChange={e => setRapidoDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarRapido()} placeholder="Detalle del gasto" style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }} /></div>
                  <div><label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Método</label><select value={rapidoMetodo} onChange={e => setRapidoMetodo(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></select></div>
                  <div><label style={{ fontSize: "11px", fontWeight: "600", color: "#6B7280", display: "block", marginBottom: "4px" }}>Comprobante</label><select value={rapidoComprobante} onChange={e => setRapidoComprobante(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E7EB", fontSize: "13px" }}><option value="SIN_COMPROBANTE">Sin comprobante</option><option value="FACTURA">Factura</option><option value="TICKET">Ticket</option><option value="VALE">Vale</option><option value="TRANSFERENCIA">Transferencia</option><option value="NOTA_REMISION">Nota de Remisión</option><option value="RECIBO">Recibo</option></select></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button onClick={guardarRapido} disabled={rapidoSaving || !rapidoMonto} style={{ padding: "12px 24px", borderRadius: "10px", border: "none", background: rapidoSaving ? "#9CA3AF" : "#059669", color: "#FFF", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>{rapidoSaving ? "Guardando..." : "Guardar Gasto"}</button>
                  {rapidoSuccess && <span style={{ fontSize: "13px", color: "#059669", fontWeight: "600" }}>✓ Guardado!</span>}
                  <span style={{ fontSize: "12px", color: "#9CA3AF", marginLeft: "auto" }}>Tip: Enter para guardar rápido</span>
                </div>
                <div style={{ marginTop: "14px", borderTop: "1px solid #F3F4F6", paddingTop: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: "#374151" }}>Desglose (si el ticket tiene múltiples categorías)</span>
                    <button onClick={addRapidoLinea} style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "6px", border: "none", background: "#EFF6FF", color: "#2563EB", fontWeight: "600", cursor: "pointer" }}>+ Línea</button>
                  </div>
                  {rapidoLineas.map((l, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 30px", gap: "6px", marginBottom: "6px", alignItems: "end" }}>
                      <select value={l.categoria} onChange={e => updateRapidoLinea(i, "categoria", e.target.value)} style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px" }}><option value="">Categoría...</option>{CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g, " ")}</option>)}</select>
                      <input value={l.descripcion} onChange={e => updateRapidoLinea(i, "descripcion", e.target.value)} placeholder="Detalle" style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px" }} />
                      <input type="number" step="0.01" value={l.monto} onChange={e => updateRapidoLinea(i, "monto", e.target.value)} placeholder="$0.00" style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #E5E7EB", fontSize: "12px", fontWeight: "700" }} />
                      {rapidoLineas.length > 1 && <button onClick={() => removeRapidoLinea(i)} style={{ border: "none", background: "none", cursor: "pointer", padding: "4px" }}><Trash2 style={{ width: "14px", height: "14px", color: "#DC2626" }} /></button>}
                    </div>
                  ))}
                  {rapidoLineasTotal > 0 && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}><span style={{ fontSize: "12px", color: "#6B7280" }}>Total desglose: </span><span style={{ fontSize: "13px", fontWeight: "700", color: "#111827", marginLeft: "6px" }}>{fmt(rapidoLineasTotal)}</span></div>}
                </div>
              </div>
            )}
          </div>
          {gastosSession.length > 0 && (
            <div style={{ background: "#FFF", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", marginTop: "16px" }}>
              <div style={{ padding: "12px 20px", borderBottom: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>Gastos registrados en esta sesión ({gastosSession.length})</span>
                <span style={{ fontSize: "14px", fontWeight: "800", color: "#059669" }}>{fmt(gastosSession.reduce((s, g) => s + g.monto, 0))}</span>
              </div>
              {gastosSession.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 100px 90px 90px", padding: "8px 20px", borderBottom: "1px solid #F9FAFB", alignItems: "center", fontSize: "12px" }}>
                  <span style={{ color: "#6B7280" }}>{g.fecha}</span>
                  <div><span style={{ fontWeight: "600", color: "#111827" }}>{g.proveedor}</span>{g.descripcion && <span style={{ color: "#9CA3AF", marginLeft: "8px" }}>{g.descripcion}</span>}</div>
                  <span style={{ fontWeight: "700", color: "#111827", textAlign: "right" }}>{fmt(g.monto)}</span>
                  <span style={{ color: "#6B7280", textAlign: "center" }}>{(g.categoria || "").replace(/_/g, " ").slice(0, 12)}</span>
                  <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "#FDF4FF", color: "#7C3AED", textAlign: "center" }}>{(g.comprobante || "").replace(/_/g, " ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL FORM (shared between caja and rbs) ── */}
      {(tabGastos === "caja" || tabGastos === "rbs") && showNuevoGasto && (
        <>
          <div style={{ marginBottom: "12px" }}>
            <button onClick={() => { setShowNuevoGasto(false); fetchCajaData(cajaMes, cajaAnio); }} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #E5E7EB", background: "#FFF", fontSize: "12px", color: "#6B7280", cursor: "pointer" }}>← Volver</button>
          </div>
          <div className="max-w-3xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Captura de Gastos</h1>
              <p className="text-sm text-slate-500 mt-1">Sube un ticket para OCR o captura manualmente.</p>
            </div>
            {ocrState === "idle" && (
              <>
                <div className={"relative border-2 border-dashed rounded-xl p-8 text-center transition-colors " + (dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50")} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
                  <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleChange} />
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"><UploadCloud className="w-6 h-6" /></div>
                    <div><p className="text-sm font-medium text-slate-900">Arrastra y suelta tu ticket aquí</p><p className="text-xs text-slate-500 mt-1">PNG, JPG o PDF hasta 5MB</p></div>
                    <button onClick={() => inputRef.current?.click()} className="mt-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">Seleccionar archivo</button>
                  </div>
                </div>
                <div className="text-center"><button onClick={handleManual} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">O captura manualmente sin ticket</button></div>
              </>
            )}
            {ocrState === "processing" && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-medium text-slate-600 mt-3">Analizando documento con Gemini AI...</p>
              </div>
            )}
            {ocrState === "success" && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-slate-500" /><h2 className="text-sm font-semibold text-slate-800">{file ? "Datos Extraídos por OCR" : "Captura Manual"}</h2></div>
                  {file && <button onClick={() => { setFile(null); setOcrState("idle"); }} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Subir otro</button>}
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Fecha</label><input type="date" name="fecha" value={formData.fecha} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Proveedor</label>
                      <select name="proveedor" value={formData.proveedor} onChange={e => { const val = e.target.value; const prov = proveedores.find(p => p.nombre === val); setFormData(prev => ({ ...prev, proveedor: val, ...(prov ? { categoria: prov.categoria_default } : {}) })); }} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                        <option value="">Seleccionar proveedor...</option>
                        {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Categoría</label><select name="categoria" value={formData.categoria} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"><option value="">Selecciona</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Método de Pago</label><select name="metodoPago" value={formData.metodoPago} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required><option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option></select></div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Comprobante</label><select name="comprobante" value={formData.comprobante} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"><option value="">Selecciona tipo...</option><option value="FACTURA">Factura</option><option value="TICKET">Ticket</option><option value="VALE">Vale</option><option value="NOTA_REMISION">Nota de Remisión</option><option value="RECIBO">Recibo</option><option value="TRANSFERENCIA">Transferencia</option><option value="SIN_COMPROBANTE">Sin comprobante</option></select></div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Descripción</label><input type="text" name="descripcion" value={formData.descripcion} onChange={handleInputChange} placeholder="Descripción breve" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
                    <div className="space-y-1"><label className="text-sm font-medium text-slate-700">Total $</label><input type="number" step="0.01" name="total" value={formData.total} onChange={handleInputChange} placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" required /></div>
                  </div>
                  {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}
                  {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{successMsg}</div>}
                  <div className="pt-4 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-slate-700">Desglose por categoría</label>
                      <button type="button" onClick={addLinea} className="text-xs px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100">+ Agregar línea</button>
                    </div>
                    {lineasGasto.map((l, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                        <div className="col-span-4">{i === 0 && <label className="text-xs text-slate-500">Categoría</label>}<select value={l.categoria} onChange={e => updateLinea(i, "categoria", e.target.value)} className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"><option value="">Selecciona</option>{CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
                        <div className="col-span-4">{i === 0 && <label className="text-xs text-slate-500">Descripción</label>}<input value={l.descripcion} onChange={e => updateLinea(i, "descripcion", e.target.value)} placeholder="Detalle" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm" /></div>
                        <div className="col-span-3">{i === 0 && <label className="text-xs text-slate-500">Monto $</label>}<input type="number" step="0.01" value={l.monto} onChange={e => updateLinea(i, "monto", e.target.value)} placeholder="0.00" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono" /></div>
                        <div className="col-span-1 flex justify-center">{lineasGasto.length > 1 && <button type="button" onClick={() => removeLinea(i)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}</div>
                      </div>
                    ))}
                    {lineasGasto.filter(l => parseFloat(l.monto) > 0).length > 0 && (
                      <div className="text-right text-sm mt-2 mb-3"><span className="text-slate-500">Total desglose: </span><span className="font-bold text-slate-900 font-mono">${lineasGasto.reduce((s, l) => s + (parseFloat(l.monto) || 0), 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span></div>
                    )}
                  </div>
                  <div className="pt-4 border-t border-slate-200 flex justify-end">
                    <button type="submit" disabled={saving} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "Guardando..." : "Registrar Gasto"}</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
