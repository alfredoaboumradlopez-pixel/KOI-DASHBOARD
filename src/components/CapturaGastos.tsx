import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ExpenseFormData {
  fecha: string;
  proveedor: string;
  categoria: string;
  total: string;
  metodoPago: string;
}

export const CapturaGastos: React.FC = () => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'processing' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<ExpenseFormData>({
    fecha: '',
    proveedor: '',
    categoria: '',
    total: '',
    metodoPago: 'Caja Fuerte',
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile: File) => {
    setFile(selectedFile);
    setOcrState('processing');
    setError(null);
    setSuccessMsg(null);

    // Simulate OCR processing delay
    setTimeout(() => {
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        proveedor: 'CFE Suministrador de Servicios',
        categoria: 'SERVICIOS',
        total: '2500.50',
        metodoPago: 'Transferencia',
      });
      setOcrState('success');
    }, 2500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const amount = parseFloat(formData.total);
    if (isNaN(amount) || amount <= 0) {
      setError('El monto total debe ser un número mayor a cero.');
      return;
    }

    // Simulate API submission
    setSuccessMsg('Gasto aprobado y registrado exitosamente.');
    console.log('Enviando al backend:', formData);
    
    // Reset after success
    setTimeout(() => {
      setFile(null);
      setOcrState('idle');
      setSuccessMsg(null);
      setFormData({
        fecha: '',
        proveedor: '',
        categoria: '',
        total: '',
        metodoPago: 'Caja Fuerte',
      });
    }, 3000);
  };

  const showTenDaysWarning = formData.metodoPago === 'Transferencia' && formData.categoria === 'SERVICIOS';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Captura de Gastos (OCR)</h1>
        <p className="text-sm text-slate-500 mt-1">Sube el ticket o factura para extraer los datos automáticamente.</p>
      </div>

      {/* Drag & Drop Zone */}
      <div 
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white hover:bg-slate-50'
        } ${ocrState === 'processing' ? 'opacity-50 pointer-events-none' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf"
          onChange={handleChange}
        />
        
        {ocrState === 'processing' ? (
          <div className="flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
            <p className="text-sm font-medium text-slate-600">Analizando documento con IA...</p>
          </div>
        ) : file && ocrState === 'success' ? (
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-900">{file.name}</p>
            <button 
              onClick={() => { setFile(null); setOcrState('idle'); }}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Subir otro archivo
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">Arrastra y suelta tu ticket aquí</p>
              <p className="text-xs text-slate-500 mt-1">PNG, JPG o PDF hasta 5MB</p>
            </div>
            <button 
              onClick={() => inputRef.current?.click()}
              className="mt-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Seleccionar archivo
            </button>
          </div>
        )}
      </div>

      {/* Form Area */}
      {ocrState === 'success' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Validación de Datos Extraídos</h2>
          </div>
          
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Fecha del Gasto</label>
                <input 
                  type="date" 
                  name="fecha"
                  value={formData.fecha}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                  required
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Proveedor</label>
                <input 
                  type="text" 
                  name="proveedor"
                  value={formData.proveedor}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Categoría</label>
                <select 
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm bg-white"
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  <option value="PROTEINA">PROTEINA</option>
                  <option value="EMPAQUES">EMPAQUES</option>
                  <option value="PROPINAS">PROPINAS</option>
                  <option value="SERVICIOS">SERVICIOS</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">Método de Pago</label>
                <select 
                  name="metodoPago"
                  value={formData.metodoPago}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm bg-white"
                  required
                >
                  <option value="Caja Fuerte">Caja Fuerte</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Total Pagado ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  name="total"
                  value={formData.total}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow text-sm font-mono"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            {/* Business Logic Warning */}
            {showTenDaysWarning && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-amber-800">Aviso de Programación</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    Este gasto se programará para pago a 10 días por ser un Servicio pagado vía Transferencia.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                {error}
              </div>
            )}

            {/* Success Message */}
            {successMsg && (
              <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-200 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {successMsg}
              </div>
            )}

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button 
                type="submit"
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-100 transition-all"
              >
                Aprobar Gasto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
