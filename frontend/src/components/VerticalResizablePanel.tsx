import React, { useRef, useState } from 'react';

interface VerticalResizablePanelProps {
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
  setHeight?: (h: number) => void;
  children: React.ReactNode;
  className?: string;
}

export const VerticalResizablePanel: React.FC<VerticalResizablePanelProps> = ({
  minHeight = 150,
  maxHeight = 600,
  defaultHeight = 300,
  setHeight,
  children,
  className = '',
}) => {
  const [height, setLocalHeight] = useState(defaultHeight);
  const resizing = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(height);

  const handleMouseDown = (e: React.MouseEvent) => {
    resizing.current = true;
    startY.current = e.clientY;
    startHeight.current = height;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return;
    // Assuming panel is at bottom, moving mouse UP increases height
    const newHeight = Math.min(
      maxHeight,
      Math.max(minHeight, startHeight.current - (e.clientY - startY.current))
    );
    setLocalHeight(newHeight);
    if (setHeight) setHeight(newHeight);
  };

  const handleMouseUp = () => {
    resizing.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      className={`flex flex-col border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-none ${className}`} 
      style={{ height }}
    >
      {/* Handle at top */}
      <div
        className="h-1.5 w-full cursor-row-resize hover:bg-primary-500/50 flex items-center justify-center group"
        onMouseDown={handleMouseDown}
        title="Resize panel"
      >
        <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full group-hover:bg-primary-500 transition-colors" />
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
};
