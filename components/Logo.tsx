
import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'colored';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Logo: React.FC<LogoProps> = ({ className = '', variant = 'colored', size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-12',
    xl: 'h-16'
  };

  const colors = {
    colored: {
      bg: 'fill-indigo-600',
      text: 'fill-white',
      accent: 'fill-emerald-400'
    },
    light: {
      bg: 'fill-white',
      text: 'fill-slate-900',
      accent: 'fill-indigo-200'
    },
    dark: {
      bg: 'fill-slate-900',
      text: 'fill-white',
      accent: 'fill-emerald-500'
    }
  };

  const activeColor = colors[variant];

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg 
        viewBox="0 0 100 100" 
        className={`${sizeClasses[size]} w-auto drop-shadow-sm`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Hexagon/Shield */}
        <path 
          d="M50 5 L90 25 L90 75 L50 95 L10 75 L10 25 Z" 
          className={activeColor.bg}
        />
        {/* Accent Line */}
        <path 
          d="M10 25 L50 45 L90 25" 
          fill="none" 
          className={`stroke-white/20`} 
          strokeWidth="2"
        />
        {/* Text AMG */}
        <text 
          x="50" 
          y="65" 
          textAnchor="middle" 
          className={`${activeColor.text} font-black`}
          style={{ fontSize: '32px', fontFamily: 'Arial, sans-serif', letterSpacing: '-1px' }}
        >
          AMG
        </text>
        {/* Small Dot Accent */}
        <circle cx="80" cy="25" r="5" className={activeColor.accent} />
      </svg>
    </div>
  );
};

export default Logo;
