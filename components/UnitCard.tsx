
import React from 'react';
import { RentalUnit, UnitStatus, Tenant } from '../types';

interface UnitCardProps {
  unit: RentalUnit;
  tenant?: Tenant;
  arrears?: number;
  onAction: (unit: RentalUnit) => void;
  onEdit: (unit: RentalUnit) => void;
  onDelete: (unitId: string) => void;
  onEditTenant?: (tenant: Tenant) => void;
  onDeleteTenant?: (tenantId: string) => void;
  userRole?: 'admin' | 'user' | 'viewer';
  canEdit?: boolean;
}

const UnitCard: React.FC<UnitCardProps> = ({ unit, tenant, arrears, onAction, onEdit, onDelete, onEditTenant, onDeleteTenant, userRole, canEdit = true }) => {
  const getStatusColor = (status: UnitStatus) => {
    switch (status) {
      case UnitStatus.OCCUPIED: return 'bg-blue-100 text-blue-700 border-blue-200';
      case UnitStatus.VACANT: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case UnitStatus.MAINTENANCE: return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusLabel = (status: UnitStatus) => {
    switch (status) {
      case UnitStatus.OCCUPIED: return 'Terisi';
      case UnitStatus.VACANT: return 'Tersedia';
      case UnitStatus.MAINTENANCE: return 'Perbaikan';
      default: return status;
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h4 className="font-bold text-lg text-slate-800">{unit.name}</h4>
            <p className="text-sm text-slate-500">{unit.area}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(unit.status)}`}>
              {getStatusLabel(unit.status)}
            </span>
            {userRole === 'admin' && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                  onClick={(e) => { e.stopPropagation(); onEdit(unit); }}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title="Edit Unit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(unit.id); }}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="Hapus Unit"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Harga Sewa:</span>
            <span className="font-semibold text-slate-700">Rp {unit.monthlyPrice.toLocaleString('id-ID')}/bln</span>
          </div>
          
          {tenant && (
            <div className="pt-3 border-t border-slate-50">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 uppercase font-medium mb-1">Penyewa Aktif</p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-700">{tenant.name}</p>
                    {tenant.documentUrl && (
                      <div className="group/doc relative">
                        <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <div className="hidden group-hover/doc:block absolute left-full ml-2 top-0 z-50 w-48 bg-white p-1 rounded-lg shadow-xl border border-slate-200">
                          <img src={tenant.documentUrl} alt="Dokumen" className="w-full h-auto rounded-md" />
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Jatuh tempo: Tgl {tenant.dueDay}</p>
                  {arrears !== undefined && arrears > 0 && (
                     <p className="text-xs text-rose-500 font-medium mt-1">Tunggakan: Rp {arrears.toLocaleString('id-ID')}</p>
                  )}
                </div>
                {userRole !== 'viewer' && canEdit && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onEditTenant?.(tenant)}
                      className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                      title="Edit Penyewa"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button 
                      onClick={() => onDeleteTenant?.(tenant.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      title="Keluarkan Penyewa"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {userRole !== 'viewer' && canEdit && (
        <div className="bg-slate-50 p-3 px-5 flex justify-end">
          <button 
            onClick={() => onAction(unit)}
            className={`text-xs font-semibold transition-colors ${
              unit.status === UnitStatus.OCCUPIED 
                ? (arrears !== undefined && arrears <= 0 
                    ? 'text-emerald-600 hover:text-emerald-800 flex items-center gap-1' 
                    : 'text-indigo-600 hover:text-indigo-800')
                : 'text-emerald-600 hover:text-emerald-800'
            }`}
          >
            {unit.status === UnitStatus.OCCUPIED 
              ? (arrears !== undefined && arrears <= 0 
                  ? <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Lunas</> 
                  : 'Kelola Pembayaran') 
              : '+ Input Penyewa Baru'}
          </button>
        </div>
      )}
    </div>
  );
};

export default UnitCard;
