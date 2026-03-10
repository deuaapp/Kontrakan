import React, { useState, useRef, useEffect } from 'react';

interface DropdownProps {
  value: string | number;
  options: { label: string; value: string | number }[];
  onChange: (value: string | number) => void;
  className?: string;
  name?: string;
  placeholder?: string;
}

const Dropdown: React.FC<DropdownProps> = ({ value, options, onChange, className = '', name, placeholder = 'Pilih' }) => {
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

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      {name && <input type="hidden" name={name} value={value} />}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 md:px-4 md:py-2 rounded-xl border border-slate-200 bg-white outline-none focus:border-indigo-500 text-sm md:text-base text-left transition-colors"
      >
        <span className={`truncate mr-2 ${!selectedOption && !value ? 'text-slate-400' : ''}`}>
          {selectedOption?.label || (value ? value : placeholder)}
        </span>
        <svg 
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''} shrink-0`} 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[140px] max-h-60 overflow-y-auto bg-white border border-slate-100 rounded-xl shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${
                  option.value === value ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dropdown;
