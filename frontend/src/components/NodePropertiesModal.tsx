import React, { useState } from 'react';

// Predefined groups with colors
export const GROUP_COLORS: Record<string, string> = {
  frontend: '#3b82f6',    // blue
  backend: '#10b981',     // emerald
  database: '#f59e0b',    // amber
  cache: '#8b5cf6',       // violet
  gateway: '#ec4899',     // pink
  worker: '#6366f1',      // indigo
  monitoring: '#14b8a6',  // teal
  external: '#64748b',    // slate
};

const PRESET_GROUPS = Object.keys(GROUP_COLORS);

interface NodePropertiesModalProps {
  open: boolean;
  node: any;
  existingGroups?: string[];
  onClose: () => void;
  onChange: (newNode: any) => void;
}

export const NodePropertiesModal: React.FC<NodePropertiesModalProps> = ({
  open,
  node,
  existingGroups = [],
  onClose,
  onChange
}) => {
  const [customGroup, setCustomGroup] = useState('');

  if (!open || !node) return null;

  const currentGroup = node.data.group || '';
  const allGroups = [...new Set([...PRESET_GROUPS, ...existingGroups])];

  const handleGroupChange = (group: string) => {
    onChange({ ...node, data: { ...node.data, group: group || undefined } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[360px] max-w-[90vw]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Node Properties</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">&times;</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={node.data.name}
              onChange={e => onChange({ ...node, data: { ...node.data, name: e.target.value } })}
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
            />
          </div>

          {/* Group selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Group</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                onClick={() => handleGroupChange('')}
                className={`px-2 py-1 text-xs rounded border ${
                  !currentGroup
                    ? 'border-gray-800 bg-gray-100 font-medium'
                    : 'border-gray-300 hover:bg-gray-50'
                }`}
              >
                None
              </button>
              {allGroups.map(group => (
                <button
                  key={group}
                  onClick={() => handleGroupChange(group)}
                  className={`px-2 py-1 text-xs rounded border flex items-center gap-1 ${
                    currentGroup === group
                      ? 'border-gray-800 font-medium'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: GROUP_COLORS[group] || '#9ca3af' }}
                  />
                  {group}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Custom group..."
                value={customGroup}
                onChange={e => setCustomGroup(e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
              />
              <button
                onClick={() => {
                  if (customGroup.trim()) {
                    handleGroupChange(customGroup.trim().toLowerCase());
                    setCustomGroup('');
                  }
                }}
                disabled={!customGroup.trim()}
                className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Done</button>
        </div>
      </div>
    </div>
  );
};
