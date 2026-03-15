import React, { useState, useRef, useEffect } from 'react';

interface CalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

const Calculator: React.FC<CalculatorProps> = ({ isOpen, onClose }) => {
  const [display, setDisplay] = useState('0');
  const [equation, setEquation] = useState('');
  const [shouldReset, setShouldReset] = useState(false);
  
  // Position and Size State
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 280, height: 420 });
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Dragging and Resizing Refs
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  // Initialize position
  useEffect(() => {
    if (isOpen && !isInitialized) {
      const isMobile = window.innerWidth < 768;
      const initialX = isMobile ? (window.innerWidth - 280) / 2 : window.innerWidth - 320;
      const initialY = isMobile ? (window.innerHeight - 420) / 2 : window.innerHeight - 460;
      
      setPosition({ x: Math.max(0, initialX), y: Math.max(0, initialY) });
      setIsInitialized(true);
    }
  }, [isOpen, isInitialized]);

  // Handle window resize to keep calculator in bounds
  useEffect(() => {
    const handleWindowResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - size.width),
        y: Math.min(prev.y, window.innerHeight - size.height)
      }));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [size]);

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (isDragging.current) {
        const newX = clientX - dragOffset.current.x;
        const newY = clientY - dragOffset.current.y;
        
        // Keep in bounds
        setPosition({
          x: Math.max(0, Math.min(newX, window.innerWidth - size.width)),
          y: Math.max(0, Math.min(newY, window.innerHeight - size.height))
        });
      }
      
      if (isResizing.current) {
        const dw = clientX - resizeStart.current.x;
        const dh = clientY - resizeStart.current.y;
        
        const newWidth = Math.max(240, Math.min(resizeStart.current.w + dw, window.innerWidth - position.x));
        const newHeight = Math.max(350, Math.min(resizeStart.current.h + dh, window.innerHeight - position.y));
        
        setSize({
          width: newWidth,
          height: newHeight
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging.current || isResizing.current) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      isDragging.current = false;
      isResizing.current = false;
      document.body.style.userSelect = 'auto';
      document.body.style.overflow = 'auto';
    };

    if (isOpen) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const startDrag = (clientX: number, clientY: number) => {
    isDragging.current = true;
    dragOffset.current = { 
      x: clientX - position.x, 
      y: clientY - position.y 
    };
    document.body.style.userSelect = 'none';
    // Prevent scrolling on mobile while dragging
    document.body.style.overflow = 'hidden';
  };

  const startResize = (clientX: number, clientY: number) => {
    isResizing.current = true;
    resizeStart.current = { x: clientX, y: clientY, w: size.width, h: size.height };
    document.body.style.userSelect = 'none';
    document.body.style.overflow = 'hidden';
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startDrag(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    startResize(e.clientX, e.clientY);
  };

  const handleResizeTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    startResize(e.touches[0].clientX, e.touches[0].clientY);
  };

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
    
    const finalResult = Number.isInteger(result) ? result : parseFloat(result.toFixed(8));
    setDisplay(String(finalResult));
    setEquation('');
    setShouldReset(true);
  };

  const clear = () => {
    setDisplay('0');
    setEquation('');
  };

  // Calculate scaling factors based on size
  const scaleBase = Math.min(size.width / 280, size.height / 420);
  const displayFontSize = Math.max(16, Math.min(64, 24 * scaleBase));
  const buttonFontSize = Math.max(14, Math.min(40, 18 * scaleBase));
  const headerFontSize = Math.max(12, Math.min(28, 16 * scaleBase));
  const gapSize = Math.max(4, Math.min(16, 8 * scaleBase));
  const paddingSize = Math.max(8, Math.min(24, 16 * scaleBase));

  return (
    <div 
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        position: 'fixed'
      }}
      className="z-[100] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors duration-300"
    >
      <div 
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{ padding: `${paddingSize * 0.75}px ${paddingSize}px` }}
        className="bg-emerald-600 flex justify-between items-center cursor-move shrink-0 touch-none"
      >
        <h3 
          style={{ fontSize: `${headerFontSize}px` }}
          className="text-white font-bold flex items-center gap-2 pointer-events-none"
        >
          <svg 
            style={{ width: `${headerFontSize * 1.2}px`, height: `${headerFontSize * 1.2}px` }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          Kalkulator
        </h3>
        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors p-1">
          <svg style={{ width: `${headerFontSize * 1.2}px`, height: `${headerFontSize * 1.2}px` }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div 
        style={{ padding: `${paddingSize}px`, gap: `${gapSize * 1.5}px` }}
        className="flex-1 flex flex-col min-h-0"
      >
        <div 
          style={{ padding: `${paddingSize * 0.75}px` }}
          className="bg-slate-100 dark:bg-slate-800 rounded-xl text-right shrink-0"
        >
          <div 
            style={{ fontSize: `${Math.max(10, displayFontSize * 0.5)}px`, height: `${displayFontSize * 0.7}px` }}
            className="text-slate-500 dark:text-slate-400 overflow-hidden"
          >
            {equation}
          </div>
          <div 
            style={{ fontSize: `${displayFontSize}px` }}
            className="font-bold text-slate-800 dark:text-white truncate"
          >
            {display}
          </div>
        </div>
        
        <div 
          style={{ gap: `${gapSize}px` }}
          className="grid grid-cols-4 flex-1 min-h-0"
        >
          <button 
            onClick={clear} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="col-span-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
          >
            C
          </button>
          <button 
            onClick={() => handleOperator('/')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center"
          >
            /
          </button>
          
          {['7', '8', '9'].map(n => (
            <button 
              key={n} 
              onClick={() => handleNumber(n)} 
              style={{ fontSize: `${buttonFontSize}px` }}
              className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
            >
              {n}
            </button>
          ))}
          <button 
            onClick={() => handleOperator('*')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center"
          >
            *
          </button>
          
          {['4', '5', '6'].map(n => (
            <button 
              key={n} 
              onClick={() => handleNumber(n)} 
              style={{ fontSize: `${buttonFontSize}px` }}
              className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
            >
              {n}
            </button>
          ))}
          <button 
            onClick={() => handleOperator('-')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center"
          >
            -
          </button>
          
          {['1', '2', '3'].map(n => (
            <button 
              key={n} 
              onClick={() => handleNumber(n)} 
              style={{ fontSize: `${buttonFontSize}px` }}
              className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
            >
              {n}
            </button>
          ))}
          <button 
            onClick={() => handleOperator('+')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center justify-center"
          >
            +
          </button>
          
          <button 
            onClick={() => handleNumber('0')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="col-span-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
          >
            0
          </button>
          <button 
            onClick={() => handleNumber('.')} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center justify-center"
          >
            .
          </button>
          <button 
            onClick={calculate} 
            style={{ fontSize: `${buttonFontSize}px` }}
            className="rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition-colors shadow-md flex items-center justify-center"
          >
            =
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      <div 
        onMouseDown={handleResizeMouseDown}
        onTouchStart={handleResizeTouchStart}
        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-1 group touch-none"
      >
        <div className="w-2 h-2 border-r-2 border-b-2 border-slate-300 dark:border-slate-600 group-hover:border-emerald-500 transition-colors" />
      </div>
    </div>
  );
};

export default Calculator;
