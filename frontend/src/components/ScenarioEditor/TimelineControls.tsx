import React from 'react';
import { Play, Square, SkipBack, SkipForward } from 'lucide-react';

interface TimelineControlsProps {
  isRunning: boolean;
  isDeploymentReady?: boolean;
  currentTime: number;
  totalDuration: number;
  onPlay: () => void;
  onStop: () => void;
  onSeek: (time: number) => void;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  isRunning,
  isDeploymentReady = true,
  currentTime,
  totalDuration,
  onPlay,
  onStop,
  onSeek
}) => {
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center bg-gray-200 dark:bg-gray-800 rounded-lg p-0.5">
         <button 
           className="p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
           onClick={() => onSeek(0)}
           title="Reset"
           disabled={isRunning}
         >
           <SkipBack size={16} />
         </button>
         
         {!isRunning ? (
            <button 
                className={`p-1.5 rounded 
                    ${!isDeploymentReady 
                        ? 'text-gray-400 cursor-not-allowed' 
                        : 'hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400'
                    }`}
                onClick={isDeploymentReady ? onPlay : undefined}
                disabled={!isDeploymentReady}
                title={!isDeploymentReady ? "Deployment must be running to play scenario" : "Play"}
            >
                <Play size={18} fill="currentColor" />
            </button>
         ) : (
            <button 
                className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400"
                onClick={onStop}
                title="Stop"
            >
                <Square size={16} fill="currentColor" />
            </button>
         )}

         <button 
           className="p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
           onClick={() => onSeek(totalDuration)}
            title="End"
         >
           <SkipForward size={16} />
         </button>
      </div>

      <div className="flex flex-col min-w-[100px]">
         <div className="text-xl font-mono leading-none text-gray-800 dark:text-gray-100">
             {formatTime(currentTime)} <span className="text-xs text-gray-400">/ {formatTime(totalDuration)}</span>
         </div>
         <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
             {isRunning ? 'Running' : 'Ready'}
         </div>
      </div>
    </div>
  );
};

function formatTime(seconds: number) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${min}:${sec.toString().padStart(2, '0')}.${ms}`;
}
