
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, trend, color }) => {
  return (
    <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between h-full transition-colors duration-300">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">{label}</p>
          <h3 className="text-lg sm:text-xl md:text-2xl font-bold mt-1 text-slate-800 dark:text-white truncate">{value}</h3>
        </div>
        <div className={`p-2 md:p-3 rounded-xl ${color} bg-opacity-10 dark:bg-opacity-20 shrink-0`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center text-xs md:text-sm">
          <span className="text-emerald-500 font-medium">{trend}</span>
          <span className="text-slate-400 dark:text-slate-500 ml-1 truncate">dibanding bulan lalu</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;
