import React, { useState, useEffect } from 'react';
import { Wallet, Calculator, AlertTriangle, CheckCircle, ShieldAlert, Lock } from 'lucide-react';

// Formateador de moneda MXN
const formatMXN = (amount: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
};

export const ArqueoCaja: React.FC = () => {
  const [saldoTeorico, setSaldoTeorico] = useState<number | null>(null);
  const [saldoFisicoStr, setSaldoFisicoStr] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Simulación de la llamada al endpoint de FastAPI: GET /api/caja/saldo-teorico
  useEffect(() => {
    const fetchSaldoTeorico = async () => {
      setIsLoading(true);
      // Simulamos latencia de red
      setTimeout(() => {
        // Este valor vendría de la respuesta del backend
        const mockResponse = {
          saldo_teorico: 15450.50,
        };
        setSaldoTeorico(mockResponse.saldo_teorico);
        setIsLoading(false);
      }, 1000);
    };

    fetchSaldoTeorico();
  }, []);

  const saldoFisico = parseFloat(saldoFisicoStr);
  const isInputValid = !isNaN(saldoFisico);
  
  // Cálculo de diferencia
  const diferencia = isInputValid && saldoTeorico !== null ? saldoFisico - saldoTeorico : null;
  const isCuadrada = diferencia === 0;
  const hasDiscrepancy = diferencia !== null && diferencia !== 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Arqueo de Caja Fuerte</h1>
        <p className="text-sm text-slate-500 mt-1">Valida el efectivo físico contra los registros del sistema.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel Saldo Teórico (Sistema) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Calculator className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Saldo Teórico (Sistema)</h2>
          </div>
          
          {isLoading ? (
            <div className="animate-pulse h-10 bg-slate-100 rounded w-2/3 mt-2"></div>
          ) : (
            <div>
              <p className="text-4xl font-bold text-slate-900 tracking-tight">
                {saldoTeorico !== null ? formatMXN(saldoTeorico) : '$0.00'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Calculado: (Inicial + Ventas) - (Gastos + Propinas)
              </p>
            </div>
          )}
        </div>

        {/* Panel Saldo Físico (Usuario) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 border-t-4 border-t-indigo-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Wallet className="w-5 h-5 text-slate-700" />
            </div>
            <h2 className="text-sm font-semibold text-slate-800">Saldo Físico Contado</h2>
          </div>
          
          <div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-lg">$</span>
              <input
                type="number"
                step="0.01"
                value={saldoFisicoStr}
                onChange={(e) => setSaldoFisicoStr(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 text-2xl font-bold text-slate-900 border border-slate-300 rounded-lg focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Ingresa el monto exacto en efectivo dentro de la caja.
            </p>
          </div>
        </div>
      </div>

      {/* Resultados y Acciones */}
      {isInputValid && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 mb-4">Resultado del Arqueo</h3>
            
            {isCuadrada ? (
              <div className="flex items-center gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="p-3 bg-emerald-100 rounded-full">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-emerald-800">Caja Cuadrada</h4>
                  <p className="text-sm text-emerald-600">El saldo físico coincide exactamente con el sistema.</p>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-4 p-4 border rounded-xl ${
                diferencia! > 0 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
              }`}>
                <div className={`p-3 rounded-full ${
                  diferencia! > 0 ? 'bg-amber-100' : 'bg-red-100'
                }`}>
                  <AlertTriangle className={`w-8 h-8 ${
                    diferencia! > 0 ? 'text-amber-600' : 'text-red-600'
                  }`} />
                </div>
                <div>
                  <h4 className={`text-lg font-bold ${
                    diferencia! > 0 ? 'text-amber-800' : 'text-red-800'
                  }`}>
                    {diferencia! > 0 ? 'Sobrante detectado' : 'Faltante detectado'}
                  </h4>
                  <p className={`text-xl font-mono font-bold mt-1 ${
                    diferencia! > 0 ? 'text-amber-700' : 'text-red-700'
                  }`}>
                    {diferencia! > 0 ? '+' : '-'}{formatMXN(Math.abs(diferencia!))}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-slate-50 flex justify-end">
            {isCuadrada ? (
              <button className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-100 transition-all">
                <Lock className="w-5 h-5" />
                Cerrar Caja
              </button>
            ) : hasDiscrepancy ? (
              <button className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 focus:ring-4 focus:ring-red-100 transition-all shadow-sm shadow-red-200">
                <ShieldAlert className="w-5 h-5" />
                Escalar Discrepancia a Matriz
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
