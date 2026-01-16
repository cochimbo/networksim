import React from 'react';

interface TimelineRulerProps {
  duration: number;
  zoom: number; // pixels per second
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({ duration, zoom }) => {
  const steps = [];
  // Decide interval based on zoom
  let stepSeconds = 1;
  if (zoom < 10) stepSeconds = 10;
  else if (zoom < 30) stepSeconds = 5;
  else if (zoom < 60) stepSeconds = 2;
  
  for (let i = 0; i <= duration; i += stepSeconds) {
     steps.push(i);
  }

  return (
    <div className="absolute top-0 left-0 right-0 h-8 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 select-none">
       {steps.map(second => (
         <div 
            key={second} 
            className="absolute top-0 bottom-0 border-l border-gray-300 dark:border-gray-600 flex flex-col justify-end"
            style={{ left: `${second * zoom}px` }}
         >
             <div className="pl-1 pb-0.5 text-[10px] text-gray-500">
                 {formatTime(second)}
             </div>
             <div className="h-1.5 w-px bg-gray-400" />
         </div>
       ))}
    </div>
  );
};

function formatTime(seconds: number) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}
