/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Layout } from './components/Layout';
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity } from 'lucide-react';
import { useStore } from './store/useStore';
import { CapturaGastos } from './components/CapturaGastos';
import { ArqueoCaja } from './components/ArqueoCaja';

export default function App() {
  const { currentRoute } = useStore();

  return (
    <Layout>
      {currentRoute === '/' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard Directivo</h1>
            <p className="text-sm text-slate-500 mt-1">Resumen financiero y operativo de El Koi.</p>
          </div>

          {/* Example Dashboard Content to show status colors */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-500">Ingresos del Día</h3>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-slate-900">$45,231.00</p>
                <div className="flex items-center gap-1 mt-2 text-sm">
                  <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                  <span className="text-emerald-600 font-medium">+12.5%</span>
                  <span className="text-slate-400">vs ayer</span>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-500">Gastos Pendientes</h3>
                <div className="p-2 bg-red-50 rounded-lg">
                  <Activity className="w-5 h-5 text-red-600" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-slate-900">12</p>
                <div className="flex items-center gap-1 mt-2 text-sm">
                  <ArrowDownRight className="w-4 h-4 text-red-500" />
                  <span className="text-red-600 font-medium">Requieren atención</span>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-slate-500">Estado de Caja</h3>
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <DollarSign className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-3xl font-bold text-slate-900">Cuadrada</p>
                <div className="flex items-center gap-1 mt-2 text-sm">
                  <span className="text-emerald-600 font-medium">Último arqueo: 14:30</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Placeholder for more content */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-96 flex items-center justify-center">
            <p className="text-slate-400">Área de contenido principal</p>
          </div>
        </div>
      )}

      {currentRoute === '/gastos' && <CapturaGastos />}
      
      {currentRoute === '/arqueo' && <ArqueoCaja />}

      {currentRoute === '/cuentas' && (
        <div className="flex items-center justify-center h-full">
          <p className="text-slate-500">Módulo de Cuentas por Pagar (En construcción)</p>
        </div>
      )}
    </Layout>
  );
}
