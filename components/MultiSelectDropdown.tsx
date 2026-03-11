import React, { useState, useRef, useEffect } from 'react';

interface MultiSelectDropdownProps {
  value: string[];
  options: { label: string; value: string }[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ 
  value, 
  options, 
  onChange, 
  placeholder = 'Pilih', 
  className = '' 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter(v => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const handleSelectAll = () => {
    if (value.length === options.length) {
      onChange([]);
    } else {
      onChange(options.map(o => o.value));
    }
  };

  const getDisplayLabel = () => {
    if (value.length === 0) return placeholder;
    if (value.length === options.length) return 'Semua Wilayah';
    if (value.length === 1) return options.find(o => o.value === value[0])?.label || value[0];
    return `${value.length} Wilayah`;
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 md:px-4 md:py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:border-indigo-500 text-sm md:text-base text-left transition-colors dark:text-white"
      >
        <span className="truncate mr-2">{getDisplayLabel()}</span>
        <svg 
          className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''} shrink-0`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <button 
              onClick={handleSelectAll}
              className="w-full text-left px-2 py-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
            >
              {value.length === options.length ? 'Hapus Semua' : 'Pilih Semua'}
            </button>
          </div>
          <div className="py-1">
            {options.map((option) => {
              const isSelected = value.includes(option.value);
              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                >
                  <span className={isSelected ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}>
                    {option.label}
                  </span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultiSelectDropdown;
