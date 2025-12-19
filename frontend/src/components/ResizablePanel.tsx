/*
ResizablePanel: Simple horizontal resizable wrapper for panels
Usage:
<ResizablePanel minWidth={250} maxWidth={600} defaultWidth={350}>
  <YourPanelComponent />
</ResizablePanel>
*/
import React, { useRef, useState } from 'react';
import './ResizablePanel.css';


interface ResizablePanelProps {
  minWidth?: number;
  maxWidth?: number;
  defaultWidth?: number;
  side?: 'left' | 'right';
  setWidth?: (w: number) => void;
  children: React.ReactNode;
}

export const ResizablePanel: React.FC<ResizablePanelProps> = ({
  minWidth = 250,
  maxWidth = 600,
  defaultWidth = 350,
  side = 'left',
  setWidth,
  children,
}) => {
  const [width, setLocalWidth] = useState(defaultWidth);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    resizing.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!resizing.current) return;
    let newWidth;
    if (side === 'left') {
      newWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth.current + (e.clientX - startX.current))
      );
    } else {
      newWidth = Math.min(
        maxWidth,
        Math.max(minWidth, startWidth.current - (e.clientX - startX.current))
      );
    }
    setLocalWidth(newWidth);
    if (setWidth) setWidth(newWidth);
  };

  const handleMouseUp = () => {
    resizing.current = false;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="resizable-panel" ref={panelRef} style={{ width }}>
      {side === 'right' && (
        <div
          className="resizable-panel-handle"
          onMouseDown={handleMouseDown}
          title="Resize panel"
          style={{ left: 0, right: 'auto', cursor: 'col-resize' }}
        />
      )}
      <div className="resizable-panel-content">{children}</div>
      {side === 'left' && (
        <div
          className="resizable-panel-handle"
          onMouseDown={handleMouseDown}
          title="Resize panel"
        />
      )}
    </div>
  );
};
