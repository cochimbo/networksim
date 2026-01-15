import { ScenarioStep } from './ScenarioEditor';

export const ROW_HEIGHT = 28; // height of each bar
export const ROW_GAP = 4;     // gap between bars
export const BASE_TRACK_HEIGHT = 64; // min height (h-16)

export const calculateTrackLayout = (steps: ScenarioStep[]) => {
  // Sort by start time
  const sorted = [...steps].sort((a, b) => a.startAt - b.startAt);
  const rows: { id: string; rowIndex: number }[] = [];
  const rowEnds: number[] = [];

  sorted.forEach(step => {
    // Find first row where this step fits
    let placed = false;
    for (let i = 0; i < rowEnds.length; i++) {
        // Add a small buffer (0.1s) to prevent exact overlaps causing issues
      if (rowEnds[i] <= step.startAt) {
        rows.push({ id: step.id, rowIndex: i });
        rowEnds[i] = step.startAt + step.duration;
        placed = true;
        break;
      }
    }
    if (!placed) {
      // Add new row
      rows.push({ id: step.id, rowIndex: rowEnds.length });
      rowEnds.push(step.startAt + step.duration);
    }
  });

  const maxRows = rowEnds.length;
  // Calculate total height needed
  const totalHeight = Math.max(BASE_TRACK_HEIGHT, (maxRows * (ROW_HEIGHT + ROW_GAP)) + 16); // 16px padding

  return { 
    rowMap: new Map(rows.map(r => [r.id, r.rowIndex])), 
    totalHeight 
  };
};
