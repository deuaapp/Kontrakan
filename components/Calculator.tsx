import React, { useState } from 'react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

const Calculator: React.FC<CalculatorProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [shouldReset, setShouldReset] = useState(false);

  if (!isOpen) return null;

  const handleNumber = (num: string) => {
    if (display === '0' || shouldReset) {
      setDisplay(num);
      setShouldReset(false);
    } else {
      setDisplay(display + num);
    }
  };

  const handleOperator = (op: string) => {
    setEquation(display + ' ' + op + ' ');
    setShouldReset(true);
  };

  const calculate = () => {
    if (!equation) return;
    const parts = equation.split(' ');
    const num1 = parseFloat(parts[0]);
    const op = parts[1];
    const num2 = parseFloat(display);
    let result = 0;
    
    if (isNaN(num1) || isNaN(num2)) return;

    switch (op) {
      case '+': result = num1 + num2; break;
      case '-': result = num1 - num2; break;
      case '*': result = num1 * num2; break;
      case '/': 
        if (num2 === 0) {
          setDisplay('Error');
          setEquation('');
          setShouldReset(true);
          return;
        }
        result = num1 / num2; 
        break;
    }
    
    // Limit decimal places
    const finalResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(8));
    setDisplay(String(finalResult));
    setEquation('');
    setShouldReset(true);
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
  };

  return (
    <div className="fixed bottom-20 right-6 z-[100] w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-emerald-600 p-4 flex justify-between items-center">
        <h3 className="text-white font-bold flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Kalkulator
        </h3>
        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl text-right">
          <div className="text-xs text-slate-500 dark:text-slate-400 h-4 overflow-hidden">{equation}</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-white truncate">{display}</div>
        </div>
        
        <div className="grid grid-cols-4 gap-2">
          <button onClick={clear} className="col-span-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">C</button>
          <button onClick={() => handleOperator('/')} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">/</button>
          
          {['7', '8', '9'].map(n => (
            <button key={n} onClick={() => handleNumber(n)} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('*')} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">*</button>
          
          {['4', '5', '6'].map(n => (
            <button key={n} onClick={() => handleNumber(n)} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('-')} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">-</button>
          
          {['1', '2', '3'].map(n => (
            <button key={n} onClick={() => handleNumber(n)} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">{n}</button>
          ))}
          <button onClick={() => handleOperator('+')} className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">+</button>
          
          <button onClick={() => handleNumber('0')} className="col-span-2 p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">0</button>
          <button onClick={() => handleNumber('.')} className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">.</button>
          <button onClick={calculate} className="p-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-md">=</button>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
