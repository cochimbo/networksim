import React from 'react';

interface NodePropertiesModalProps {
  open: boolean;
  node: any;
  onClose: () => void;
  onChange: (newNode: any) => void;
}

export const NodePropertiesModal: React.FC<NodePropertiesModalProps> = ({ open, node, onClose, onChange }) => {
  if (!open || !node) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-[90vw]">
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
          {/* Puedes agregar más campos aquí según las propiedades del nodo */}
        </div>
        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Cerrar</button>
        </div>
      </div>
    </div>
  );
};
