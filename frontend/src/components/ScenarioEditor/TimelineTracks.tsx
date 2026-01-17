import React, { useRef } from 'react';
import { calculateTrackLayout, ROW_HEIGHT, ROW_GAP } from './layoutUtils';
import { ScenarioStep } from './ScenarioEditor';
import { Zap } from 'lucide-react';

const CHAOS_ICONS: Record<string, string> = {
  'delay': '⏱️',
  'loss': '📉',
  'bandwidth': '📊',
  'corrupt': '🔧',
  'duplicate': '📋',
  'partition': '🚫',
  'stress-cpu': '💻',
  'pod-kill': '💀',
  'io-delay': '💾',
  'http-abort': '🌐'
};

interface TimelineTracksProps {
  nodes: Array<{ id: string; name: string }>;
  steps: ScenarioStep[];
  zoom: number;
  totalDuration: number;
  onStepUpdate: (step: ScenarioStep) => void;
  onStepAdd: (step: ScenarioStep) => void;
  selectedStepId: string | null;
  onSelectStep: (id: string | null) => void;
  readOnly?: boolean;
}

export const TimelineTracks: React.FC<TimelineTracksProps> = ({
  nodes,
  steps,
  zoom,
  totalDuration,
  onStepUpdate,
  onStepAdd,
  selectedStepId,
  onSelectStep,
  readOnly = false
}) => {
  const [dragOverLaneId, setDragOverLaneId] = React.useState<string | null>(null);

  const handleDragOver = (e: React.DragEvent, nodeId: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (dragOverLaneId !== nodeId) {
        setDragOverLaneId(nodeId);
    }
  };


  const handleDrop = (e: React.DragEvent, nodeId: string) => {
    if (readOnly) return;
    e.preventDefault();
    setDragOverLaneId(null);
    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'chaos-tool') {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const startAt = Math.max(0, offsetX / zoom);
        
        // Create new step
        const newStep: ScenarioStep = {
            id: crypto.randomUUID(),
            type: parsed.chaosType,
            sourceNodeId: nodeId,
            laneId: nodeId,
            startAt,
            duration: 10, // Default duration 10s
            params: {} // Default params
        };
        onStepAdd(newStep);
      }
    } catch (err) {
      console.error('Invalid drag data', err);
    }
  };

  return (
    <>
      {nodes.map((node, index) => {
        const nodeSteps = steps.filter(s => s.laneId === node.id || s.sourceNodeId === node.id);
        const { rowMap, totalHeight } = calculateTrackLayout(nodeSteps);
        const isDragOver = dragOverLaneId === node.id;

        return (
        <div 
          key={node.id} 
          className={`border-b border-gray-200 dark:border-gray-700 relative timeline-track-area transition-colors duration-200
            ${isDragOver 
                ? 'bg-indigo-100 dark:bg-indigo-900/60 ring-2 ring-indigo-500 ring-inset' 
                : (index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/50')
            }`}
          style={{ width: '100%', height: totalHeight }}
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={() => isDragOver && setDragOverLaneId(null)}
          onDrop={(e) => handleDrop(e, node.id)}
        >
          {/* Grid lines for this track */}
           <div className="absolute inset-x-0 inset-y-0 pointer-events-none opacity-10" 
                style={{ 
                    backgroundImage: `linear-gradient(to right, #ccc 1px, transparent 1px)`,
                    backgroundSize: `${zoom}px 100%` 
                }} 
           />

          {nodeSteps.map(step => (
            <TimelineJob
              key={step.id}
              step={step}
              zoom={zoom}
              isSelected={selectedStepId === step.id}
              onSelect={() => onSelectStep(step.id)}
              onUpdate={onStepUpdate}
              maxDuration={totalDuration}
              top={(rowMap.get(step.id) || 0) * (ROW_HEIGHT + ROW_GAP) + 8} // 8px top padding
              height={ROW_HEIGHT}
              readOnly={readOnly}
            />
          ))}
        </div>
      );
      })}
    </>
  );
};


interface TimelineJobProps {
  step: ScenarioStep;
  zoom: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (step: ScenarioStep) => void;
  maxDuration: number;
  top: number;
  height: number;
  readOnly?: boolean;
}

const getChaosColorClass = (type: string) => {
  if (type.includes('stress')) return 'bg-orange-100 border-orange-500 text-orange-800 dark:bg-orange-900/50 dark:border-orange-400 dark:text-orange-100';
  if (type.includes('pod')) return 'bg-gray-200 border-gray-500 text-gray-800 dark:bg-gray-600 dark:border-gray-400 dark:text-gray-100';
  if (type === 'partition') return 'bg-slate-800 border-slate-600 text-slate-100 dark:bg-black dark:border-slate-500 dark:text-white';
  
  if (type === 'delay') return 'bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/50 dark:border-blue-400 dark:text-blue-100';
  if (type === 'loss') return 'bg-pink-100 border-pink-500 text-pink-800 dark:bg-pink-900/50 dark:border-pink-400 dark:text-pink-100';
  if (type === 'bandwidth') return 'bg-cyan-100 border-cyan-500 text-cyan-800 dark:bg-cyan-900/50 dark:border-cyan-400 dark:text-cyan-100';
  if (type === 'corrupt') return 'bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/50 dark:border-yellow-400 dark:text-yellow-100';
  if (type === 'duplicate') return 'bg-violet-100 border-violet-500 text-violet-800 dark:bg-violet-900/50 dark:border-violet-400 dark:text-violet-100';
  
  if (type === 'io-delay') return 'bg-emerald-100 border-emerald-500 text-emerald-800 dark:bg-emerald-900/50 dark:border-emerald-400 dark:text-emerald-100';
  if (type === 'http-abort') return 'bg-rose-100 border-rose-500 text-rose-800 dark:bg-rose-900/50 dark:border-rose-400 dark:text-rose-100';

  // Default
  return 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-200';
};

const TimelineJob: React.FC<TimelineJobProps> = ({ step, zoom, isSelected, onSelect, onUpdate, maxDuration, top, height, readOnly }) => {
  // Local state for smooth dragging without re-layout
  const [localStep, setLocalStep] = React.useState(step);
  const isInteracting = useRef(false);

  // Sync local state when props change (only if not interacting)
  React.useEffect(() => {
    if (!isInteracting.current) {
        setLocalStep(step);
    }
  }, [step]);

  // Dragging state
  const isDragging = useRef(false);
  const isResizing = useRef<'left' | 'right' | null>(null);
  const startX = useRef(0);
  const originalStart = useRef(0);
  const originalDuration = useRef(0);
  const dragUpdateRef = useRef(step); // To store latest value for mouseUp

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    onSelect();
    
    if (readOnly) return;

    isDragging.current = true;
    isInteracting.current = true;
    startX.current = e.clientX;
    originalStart.current = localStep.startAt;
    dragUpdateRef.current = localStep;
    
    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent, side: 'left' | 'right') => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    isResizing.current = side;
    isInteracting.current = true;
    startX.current = e.clientX;
    originalStart.current = localStep.startAt;
    originalDuration.current = localStep.duration;
    dragUpdateRef.current = localStep;
    
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    const deltaPixels = e.clientX - startX.current;
    const deltaSeconds = deltaPixels / zoom;

    let updated = { ...dragUpdateRef.current };

    if (isDragging.current) {
      const newStart = Math.max(0, Math.min(maxDuration - updated.duration, originalStart.current + deltaSeconds));
      updated.startAt = newStart;
    } else if (isResizing.current === 'right') {
        const newDuration = Math.max(1, Math.min(maxDuration - updated.startAt, originalDuration.current + deltaSeconds));
        updated.duration = newDuration;
    } else if (isResizing.current === 'left') {
        // Changing start time AND duration
        const maxDelta = originalDuration.current - 1; // Minimum 1 sec duration
        const appliedDelta = Math.min(maxDelta, Math.max(-originalStart.current, deltaSeconds));
        
        updated.startAt = originalStart.current + appliedDelta;
        updated.duration = originalDuration.current - appliedDelta;
    }
    
    setLocalStep(updated);
    dragUpdateRef.current = updated;
  };

  const handleMouseUp = () => {
    if (isInteracting.current) {
        onUpdate(dragUpdateRef.current);
    }
    
    isDragging.current = false;
    isResizing.current = null;
    isInteracting.current = false;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`absolute rounded-md border text-xs overflow-hidden select-none cursor-grab flex items-center px-2 gap-1 group transition-colors shadow-sm
        ${isSelected 
            ? 'ring-2 ring-primary-500 z-30 shadow-lg' 
            : 'z-10 hover:brightness-95 dark:hover:brightness-110'
        }
        ${getChaosColorClass(step.type)}
        ${readOnly ? 'cursor-default opacity-80' : 'cursor-grab'}
      `}
      style={{
        left: `${localStep.startAt * zoom}px`,
        width: `${localStep.duration * zoom}px`,
        top: `${top}px`,
        height: `${height}px`
      }}
      onMouseDown={handleMouseDown}
    >
        {/* Resize Handle Left */}
        {!readOnly && (
        <div 
            className="absolute top-0 bottom-0 left-0 w-2 cursor-col-resize hover:bg-black/10 dark:hover:bg-white/10 z-30" 
            onMouseDown={(e) => handleResizeStart(e, 'left')}
        />
        )}
        <span className="text-base leading-none select-none flex-shrink-0">
            {CHAOS_ICONS[step.type] || <Zap size={14} />}
        </span>
        <span className="truncate font-medium">{step.type}</span>

        {/* Resize Handle Right */}
        {!readOnly && (
        <div 
            className="absolute top-0 bottom-0 right-0 w-2 cursor-col-resize hover:bg-black/10 dark:hover:bg-white/10 z-30"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
        />
        )}
    </div>
  );
};
