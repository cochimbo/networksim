import { useState, useEffect } from 'react';

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
  const [presets, setPresets] = useState<Array<{ name: string; vars: EnvVar[]; created_at: string }>>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showPresetList, setShowPresetList] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('envVarsPresets');
    if (raw) {
      try {
        setPresets(JSON.parse(raw));
      } catch (e) {
        console.error('Failed to parse envVarsPresets', e);
        setPresets([]);
      }
    }
  }, []);

  const persistPresets = (next: typeof presets) => {
    setPresets(next);
    localStorage.setItem('envVarsPresets', JSON.stringify(next));
  };

  const handleChange = (idx: number, field: 'name' | 'value', value: string) => {
    setVars(vars => vars.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  const handleAdd = () => setVars([...vars, { name: '', value: '' }]);
  const handleDelete = (idx: number) => setVars(vars => vars.filter((_, i) => i !== idx));

  // Log when user saves from the editor to help debugging persistence
  const handleSaveWithLog = () => {
    const filtered = vars.filter(v => v.name.trim() !== '');
    console.log('EnvVarsEditor: saving vars', filtered);
    onSave(filtered);
  };

  

  // Save preset flow: ask for name, if exists show preview/confirm overwrite
  const openSavePreset = () => {
    setSaveName('');
    setShowSaveModal(true);
  };

  const confirmSavePreset = (name: string) => {
    const existing = presets.find(p => p.name === name);
    if (existing) {
      // preview overwrite existing
      setSelectedPreset(name);
      setShowPreviewModal(true);
      // preview modal will handle overwrite confirmation for save flow (we'll detect selectedPreset)
    } else {
      const next = [{ name, vars: vars.filter(v => v.name.trim() !== ''), created_at: new Date().toISOString() }, ...presets];
      persistPresets(next);
      setShowSaveModal(false);
      alert('Preset guardado');
    }
  };

  const actuallyOverwritePreset = (name: string) => {
    const next = presets.map(p => p.name === name ? { ...p, vars: vars.filter(v => v.name.trim() !== ''), created_at: new Date().toISOString() } : p);
    persistPresets(next);
    setShowPreviewModal(false);
    setShowSaveModal(false);
    setSelectedPreset(null);
    alert('Preset sobrescrito');
  };

  // Load preset flow: select preset, preview and confirm overwrite current table
  const openPresetList = () => {
    setShowPresetList(true);
  };

  const previewAndLoadPreset = (name: string) => {
    setSelectedPreset(name);
    setShowPreviewModal(true);
  };

  const actuallyLoadPreset = (name: string) => {
    const p = presets.find(x => x.name === name);
    if (!p) return;
    setVars(p.vars.map(v => ({ ...v })));
    setShowPreviewModal(false);
    setShowPresetList(false);
    setSelectedPreset(null);
    alert('Preset cargado');
  };

  const deletePreset = (name: string) => {
    if (!confirm(`Eliminar preset "${name}"?`)) return;
    persistPresets(presets.filter(p => p.name !== name));
  };

  return (
    <>
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
            <button onClick={openPresetList} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">Cargar preset</button>
            <button onClick={openSavePreset} className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200">Guardar preset</button>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 border rounded">Cancelar</button>
            <button onClick={handleSaveWithLog} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Guardar y aplicar</button>
          </div>
        </div>
      </div>

      {/* Save modal */}
      {showSaveModal && !showPreviewModal && (
        <ModalWrapper onClose={() => setShowSaveModal(false)}>
          <h3 className="font-semibold mb-2">Guardar preset</h3>
          <div className="mb-2">
            <label className="block text-sm mb-1">Nombre del preset</label>
            <input value={saveName} onChange={e => setSaveName(e.target.value)} className="input input-bordered w-full" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowSaveModal(false)} className="px-3 py-1 border rounded">Cancelar</button>
            <button onClick={() => confirmSavePreset(saveName.trim() || `preset-${Date.now()}`)} className="px-3 py-1 bg-blue-600 text-white rounded">Guardar</button>
          </div>
        </ModalWrapper>
      )}

      {/* Preset list modal */}
      {showPresetList && (
        <ModalWrapper onClose={() => setShowPresetList(false)}>
          <h3 className="font-semibold mb-2">Presets guardados</h3>
          {presets.length === 0 ? (
            <div className="text-sm text-gray-500">No hay presets guardados.</div>
          ) : (
            <div className="overflow-auto" style={{ maxHeight: '50vh' }}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2 text-left">Nombre</th>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {presets.map(p => (
                    <tr key={p.name}>
                      <td className="p-2">{p.name}</td>
                      <td className="p-2 text-xs text-gray-500">{new Date(p.created_at).toLocaleString()}</td>
                      <td className="p-2">
                        <div className="flex gap-2">
                          <button onClick={() => previewAndLoadPreset(p.name)} className="px-2 py-1 text-sm border rounded">Previsualizar</button>
                          <button onClick={() => { if (confirm(`Cargar preset "${p.name}" y sobrescribir variables actuales?`)) actuallyLoadPreset(p.name); }} className="px-2 py-1 text-sm bg-green-100 rounded">Cargar</button>
                          <button onClick={() => deletePreset(p.name)} className="px-2 py-1 text-sm text-red-600">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ModalWrapper>
      )}

      {/* Preview modal: reuse for save-overwrite and load-preview */}
      {showPreviewModal && selectedPreset && (() => {
        const preset = presets.find(p => p.name === selectedPreset);
        if (!preset) return null;
        // If showSaveModal is true then we are previewing overwrite of an existing preset
        const isSaveOverwrite = showSaveModal;
        const left = isSaveOverwrite ? preset.vars : vars; // existing preset (left) vs current (right) for save-overwrite; current (left) vs preset (right) for load
        const right = isSaveOverwrite ? vars : preset.vars;
        
        return (
          <ModalWrapper onClose={() => { setShowPreviewModal(false); setSelectedPreset(null); }}>
            <h3 className="font-semibold mb-2">Comparación: {isSaveOverwrite ? `Preset existente → Tabla actual` : `Tabla actual → Preset ${preset.name}`}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">Izquierda: {isSaveOverwrite ? 'Preset existente' : 'Actual'}</div>
                <div className="overflow-auto border rounded" style={{ maxHeight: 240 }}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100"><th className="p-2">Nombre</th><th className="p-2">Valor</th></tr>
                    </thead>
                    <tbody>
                      {left.map((v, i) => (
                        <tr key={i}><td className="p-2">{v.name}</td><td className="p-2">{v.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Derecha: {isSaveOverwrite ? 'Actual' : `Preset ${preset.name}`}</div>
                <div className="overflow-auto border rounded" style={{ maxHeight: 240 }}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100"><th className="p-2">Nombre</th><th className="p-2">Valor</th></tr>
                    </thead>
                    <tbody>
                      {right.map((v, i) => (
                        <tr key={i}><td className="p-2">{v.name}</td><td className="p-2">{v.value}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setShowPreviewModal(false); setSelectedPreset(null); }} className="px-3 py-1 border rounded">Cancelar</button>
              {isSaveOverwrite ? (
                <button onClick={() => actuallyOverwritePreset(preset.name)} className="px-3 py-1 bg-red-600 text-white rounded">Sobrescribir preset</button>
              ) : (
                <button onClick={() => actuallyLoadPreset(preset.name)} className="px-3 py-1 bg-green-600 text-white rounded">Sobrescribir tabla actual</button>
              )}
            </div>
          </ModalWrapper>
        );
      })()}
    </>
  );
}

// --- Modals ---
function ModalWrapper({ children, onClose }: { children: any; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-auto p-6">
        {children}
        <div className="mt-4 text-right">
          <button onClick={onClose} className="px-3 py-1 border rounded">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

