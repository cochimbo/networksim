import { useRef, useState, useEffect } from 'react';
import { 
  Play, Square, Save, Download, Upload, Plus,
  ZoomIn, ZoomOut, Clock
} from 'lucide-react';
import { ChaosType, ChaosParams } from '../../services/api';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTracks } from './TimelineTracks';
import { TimelineControls } from './TimelineControls';
import { calculateTrackLayout } from './layoutUtils';
import { StepPropertiesPanel } from './StepPropertiesPanel';
import './ScenarioEditor.css';

export interface ScenarioStep {
  id: string;
  type: ChaosType;
  sourceNodeId: string;
  targetNodeId?: string;
  startAt: number; // seconds
  duration: number; // seconds
  params: ChaosParams;
  laneId: string; // usually sourceNodeId
}

import { Scenario as ApiScenario } from '../../services/api';

export interface Scenario extends Omit<ApiScenario, 'steps'> {
  steps: ScenarioStep[];
}

interface ScenarioEditorProps {
  nodes: Array<{ id: string; name: string }>;
  topologyId: string;
  onRun?: (scenario: Scenario) => void;
  onStop?: () => void;
  isRunning?: boolean;
  isDeploymentReady?: boolean;
  initialScenario?: Scenario;
  onSave?: (scenario: Partial<Scenario>) => void;
}

const DEFAULT_DURATION = 60; // 1 minute default
const PIXELS_PER_SECOND_DEFAULT = 20;

export const ScenarioEditor: React.FC<ScenarioEditorProps> = ({ 
  nodes, 
  onRun,
  onStop,
  isRunning = false,
  isDeploymentReady = false,
  initialScenario,
  onSave
}) => {
  const [scenario, setScenario] = useState<Scenario>(initialScenario || {
    id: crypto.randomUUID(),
    name: 'New Scenario',
    total_duration: DEFAULT_DURATION,
    steps: []
  });

  // Reset when initialScenario changes
  useEffect(() => {
    if (initialScenario) {
        setScenario(initialScenario);
    }
  }, [initialScenario]);
  
  const [currentTime, setCurrentTime] = useState(0); // Playhead position
  const [zoom, setZoom] = useState(PIXELS_PER_SECOND_DEFAULT);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  
  // Scroller ref to sync ruler and tracks
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Real-time playback simulation (just visual for now)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      const startTime = Date.now() - (currentTime * 1000);
      interval = setInterval(() => {
        const newTime = (Date.now() - startTime) / 1000;
        if (newTime >= scenario.total_duration) {
          onStop?.();
          setCurrentTime(scenario.total_duration);
        } else {
          setCurrentTime(newTime);
        }
      }, 50); // 20fps update
    }
    return () => clearInterval(interval);
  }, [isRunning, scenario.total_duration, onStop]);

  const handleStepChange = (updatedStep: ScenarioStep) => {
    setScenario(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === updatedStep.id ? updatedStep : s)
    }));
  };
  
  const handleStepAdd = (newStep: ScenarioStep) => {
    setScenario(prev => ({
        ...prev,
        steps: [...prev.steps, newStep]
    }));
    setSelectedStepId(newStep.id);
  };

  const handleStepDelete = (stepId: string) => {
    setScenario(prev => ({
        ...prev,
        steps: prev.steps.filter(s => s.id !== stepId)
    }));
    setSelectedStepId(null);
  };

  // Handle keyboard shortcuts (Delete/Backspace)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedStepId || isRunning) return;

      const target = e.target as HTMLElement;
      // Ignore if user is typing in an input/textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
         e.preventDefault();
         handleStepDelete(selectedStepId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedStepId, isRunning]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    // Deselect if clicking empty space
     if ((e.target as HTMLElement).classList.contains('timeline-track-area')) {
        setSelectedStepId(null);
     }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <TimelineControls 
          isRunning={isRunning} 
          isDeploymentReady={isDeploymentReady}
          currentTime={currentTime}
          totalDuration={scenario.total_duration}
          // The backend always runs from t=0, so we must reset time on play to match visual state
          onPlay={() => {
            setCurrentTime(0);
            onRun?.(scenario);
          }}
          // Reset time on stop as resume is not supported
          onStop={() => {
            setCurrentTime(0);
            onStop?.();
          }}
          onSeek={setCurrentTime}
        />
        
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
        
        {/* Total Duration Config */}
        <div className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
           <Clock size={14} />
           <span>Duration:</span>
           <input 
             type="number" 
             className="w-16 h-7 px-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
             value={scenario.total_duration}
             onChange={(e) => {
                const val = parseInt(e.target.value) || 60;
                setScenario(prev => ({ ...prev, total_duration: val }));
             }}
             min={10}
             max={3600}
           />
           <span>s</span>
        </div>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
        
        <button title="Zoom Out" className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" onClick={() => setZoom(z => Math.max(5, z / 1.2))}>
          <ZoomOut size={16} />
        </button>
        <button title="Zoom In" className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700" onClick={() => setZoom(z => Math.min(100, z * 1.2))}>
          <ZoomIn size={16} />
        </button>
        
        <div className="flex-1" />
        
        <input 
            type="text" 
            value={scenario.name}
            onChange={(e) => setScenario(prev => ({ ...prev, name: e.target.value }))}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-transparent"
            placeholder="Scenario Name"
        />

        <button 
            onClick={() => onSave?.(scenario)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
        >
            <Save size={14} /> Save
        </button>
      </div>

      {/* Main Timeline Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar (Lane Headers) */}
        <div className="w-48 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 z-10 flex flex-col">
            <div className="h-8 border-b border-gray-200 dark:border-gray-700 flex items-center px-2 text-xs font-semibold text-gray-500">
                NODES / LANES
            </div>
            <div className="flex-1 overflow-hidden relative">
                <div style={{ transform: `translateY(-${scrollContainerRef.current?.scrollTop || 0}px)` }}>
                    {nodes.map(node => {
                        const nodeSteps = scenario.steps.filter(s => s.laneId === node.id || s.sourceNodeId === node.id);
                        const { totalHeight } = calculateTrackLayout(nodeSteps);
                        
                        return (
                        <div 
                            key={node.id} 
                            className="border-b border-gray-200 dark:border-gray-700 px-3 flex items-center font-medium text-sm"
                            style={{ height: totalHeight }}
                        >
                            {node.name}
                        </div>
                    )})}
                </div>
            </div>
        </div>

        {/* Scrollable Timeline */}
        <div 
            className="flex-1 overflow-auto relative" 
            ref={scrollContainerRef}
            onClick={handleTimelineClick}
        >
            <div 
                className="relative min-h-full"
                style={{ width: `${scenario.total_duration * zoom + 100}px` }}
            >
                {/* Ruler */}
                <TimelineRuler 
                    duration={scenario.total_duration} 
                    zoom={zoom} 
                />
                
                {/* Tracks Grid */}
                <div className="relative pt-8">
                    {/* Playhead Line */}
                    <div 
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none"
                        style={{ left: `${currentTime * zoom}px` }}
                    >
                         <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-red-500 -ml-[4.5px]" />
                    </div>

                    <TimelineTracks
                        nodes={nodes}
                        steps={scenario.steps}
                        zoom={zoom}
                        totalDuration={scenario.total_duration}
                        onStepUpdate={handleStepChange}
                        onStepAdd={handleStepAdd}
                        selectedStepId={selectedStepId}
                        onSelectStep={setSelectedStepId}
                        readOnly={isRunning}
                    />
                </div>
            </div>
        </div>

        {/* Properties Panel (Right Side) */}
        {selectedStepId && (
            <div className="w-80 flex-shrink-0 z-20 h-full shadow-xl">
                <StepPropertiesPanel 
                    step={scenario.steps.find(s => s.id === selectedStepId) || null}
                    onUpdate={handleStepChange}
                    onClose={() => setSelectedStepId(null)}
                    onDelete={handleStepDelete}
                    nodeName={nodes.find(n => n.id === (scenario.steps.find(s => s.id === selectedStepId)?.sourceNodeId))?.name || 'Unknown Node'}
                />
            </div>
        )}
      </div>
    </div>
  );
};
