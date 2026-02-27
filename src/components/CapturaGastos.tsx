import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../services/api';

const CATEGORIAS = [
  "COMIDA_PERSONAL", "PROPINAS", "COMPRAS_INSUMOS", "SERVICIOS",
  "MANTENIMIENTO", "LIMPIEZA", "OTROS"
];

interface ExpenseFormData {
  fecha: string;
  proveedor: string;
  categoria: string;
  total: string;
  metodoPago: string;
  descripcion: string;
}

export const CapturaGastos: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<ExpenseFormData>({
    fecha: new Date().toISOString().split('T')[0],
    proveedor: '',
    categoria: '',
    total: '',
    metodoPago: 'EFECTIVO',
    descripcion: '',
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  };

  const handleFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setOcrState('processing');
    setError(null);
    setSuccessMsg(null);
    try {
      const result = await api.upload('/api/gastos/ocr', selectedFile);
      setFormData({
        fecha: result.fecha || new Date().toISOString().split('T')[0],
        proveedor: result.proveedor || '',
        categoria: result.categoria || '',
        total: result.total ? String(result.total) : '',
        metodoPago: 'EFECTIVO',
        descripcion: result.descripcion || '',
      });
      setOcrState('success');
    } catch (e: any) {
      setOcrState('error');
      setError('No se pudo procesar el ticket. Puedes llenar los datos manualmente.');
      setOcrState('success');
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    const amount = parseFloat(formData.total);
    if (amount !== amount || amount <= 0) {
      setError('El monto total debe ser un numero mayor a cero.');
      return;
    }
    if (formData.proveedor === '' || formData.categoria === '') {
      setError('Completa todos los campos requeridos.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/gastos', {
        fecha: formData.fecha,
        proveedor: formData.proveedor,
        categoria: formData.categoria,
        monto: amount,
        metodo_pago: formData.metodoPago,
        descripcion: formData.descripcion || null,
      });
      setSuccessMsg('Gasto registrado exitosamente.');
      setTimeout(() => {
        setFile(null);
        setOcrState('idle');
        setSuccessMsg(null);
        setFormData({ fecha: new Date().toISOString().split('T')[0], proveedor: '', categoria: '', total: '', metodoPago: 'EFECTIVO', descripcion: '' });
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Error al guardar el gasto');
    }
    setSaving(false);
  };

  const handleManual = () => {
    setOcrState('success');
    setFile(null);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Captura de Gastos</h1>
        <p className="text-sm text-slate-500 mt-1">Sube un ticket para OCR o captura manualmente.</p>
      </div>

      {ocrState === 'idle' && (
        <>
          <div
            className={"relative border-2 border-dashed rounded-xl p-8 text-center transition-colors " + (dragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50")}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
            <input ref={inputRef} type="file" className="hidden" accept="image/*,.pdf" onChange={handleChange} />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
                <UploadCloud className="w-6 h-6" /></div>
              <div>
                <p className="text-sm font-medium text-slate-900">Arrastra y suelta tu ticket aqui</p>
                <p className="text-xs text-slate-500 mt-1">PNG, JPG o PDF hasta 5MB</p></div>
              <button onClick={() => inputRef.current?.click()}
                className="mt-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
                Seleccionar archivo</button>
            </div>
          </div>
          <div className="text-center">
            <button onClick={handleManual} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              O captura manualmente sin ticket</button>
          </div>
        </>
      )}

      {ocrState === 'processing' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600 mt-3">Analizando documento con Gemini AI...</p>
        </div>
      )}

      {ocrState === 'success' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-800">{file ? "Datos Extraidos por OCR" : "Captura Manual"}</h2>
            </div>
            {file && <button onClick={() => { setFile(null); setOcrState('idle'); }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Subir otro</button>}
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Fecha</label>
                <input type="date" name="fecha" value={formData.fecha} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Proveedor</label>
                <input type="text" name="proveedor" value={formData.proveedor} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Categoria</label>
                <select name="categoria" value={formData.categoria} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                  <option value="">Selecciona</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c.replace(/_/g," ")}</option>)}
                </select></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Metodo de Pago</label>
                <select name="metodoPago" value={formData.metodoPago} onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" required>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Descripcion</label>
                <input type="text" name="descripcion" value={formData.descripcion} onChange={handleInputChange}
                  placeholder="Descripcion breve" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" /></div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Total $</label>
                <input type="number" step="0.01" name="total" value={formData.total} onChange={handleInputChange}
                  placeholder="0.00" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" required /></div>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">{error}</div>}
            {successMsg && <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200 flex items-center gap-2"><CheckCircle className="w-4 h-4" />{successMsg}</div>}
            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button type="submit" disabled={saving}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "Guardando..." : "Registrar Gasto"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
