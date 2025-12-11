import { useState } from 'react';

interface EnvVar {
  name: string;
  value: string;
}

interface EnvVarsEditorProps {
  initialVars: EnvVar[];
  onSave: (vars: EnvVar[]) => void;
  onClose: () => void;
}

export default function EnvVarsEditor({ initialVars, onSave, onClose }: EnvVarsEditorProps) {
  const [vars, setVars] = useState<EnvVar[]>(initialVars);

  const handleChange = (idx: number, field: 'name' | 'value', value: string) => {
    setVars(vars => vars.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const handleAdd = () => setVars([...vars, { name: '', value: '' }]);
  const handleDelete = (idx: number) => setVars(vars => vars.filter((_, i) => i !== idx));

  const handleSave = () => onSave(vars.filter(v => v.name.trim() !== ''));

  const handleLoad = () => {
    const saved = localStorage.getItem('envVarsPreset');
    if (saved) setVars(JSON.parse(saved));
  };
  const handleSavePreset = () => {
    localStorage.setItem('envVarsPreset', JSON.stringify(vars));
    alert('Configuración guardada');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Variables de entorno</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black">✕</button>
        </div>
        <div className="overflow-auto border rounded mb-4" style={{ maxHeight: 320 }}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Nombre</th>
                <th className="p-2 text-left">Valor</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {vars.map((v, i) => (
                <tr key={i}>
                  <td className="p-2"><input className="input input-bordered w-full" value={v.name} onChange={e => handleChange(i, 'name', e.target.value)} /></td>
                  <td className="p-2"><input className="input input-bordered w-full" value={v.value} onChange={e => handleChange(i, 'value', e.target.value)} /></td>
                  <td className="p-2"><button onClick={() => handleDelete(i)} className="text-red-500">Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 mb-4">
          <button onClick={handleAdd} className="px-3 py-1 bg-blue-100 rounded hover:bg-blue-200">Añadir variable</button>
          <button onClick={handleLoad} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">Cargar preset</button>
          <button onClick={handleSavePreset} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">Guardar preset</button>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Guardar y aplicar</button>
        </div>
      </div>
    </div>
  );
}
