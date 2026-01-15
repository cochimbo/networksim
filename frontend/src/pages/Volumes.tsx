import React, { useState, useEffect } from 'react';
import { HardDrive, FileText, Plus, Trash2, Upload, Box, RefreshCw } from 'lucide-react';
import apiWrapper, { PvcDto, ConfigMapDto } from '../services/api';
import { useDropzone } from 'react-dropzone';
import { useToast } from '../components/Toast';

export default function Volumes() {
  const [activeTab, setActiveTab] = useState<'pvc' | 'config'>('pvc');
  
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
            <HardDrive className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Volumes & Configurations</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Manage persistent storage and configuration files</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pvc' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab('pvc')}
        >
          <HardDrive className="h-4 w-4" />
          Persistent Storage
        </button>
        <button
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'config' ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
          onClick={() => setActiveTab('config')}
        >
          <FileText className="h-4 w-4" />
          Configuration Files
        </button>
      </div>

      {activeTab === 'pvc' ? <PvcList /> : <ConfigList />}
    </div>
  );
}

function PvcList() {
  const [pvcs, setPvcs] = useState<PvcDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const toast = useToast();
  
  // Create Form State
  const [newName, setNewName] = useState('');
  const [newSize, setNewSize] = useState('1Gi');

  const isValidName = (name: string) => {
    return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name);
  };

  const loadPvcs = async () => {
    setLoading(true);
    try {
      const list = await apiWrapper.listPVCs();
      setPvcs(list);
    } catch (error) {
      console.error("Failed to load PVCs", error);
      toast.error("Failed to load volumes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPvcs(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;
    
    if (!isValidName(newName)) {
      toast.error("Invalid name. Use lowercase letters, numbers, and hyphens only.");
      return;
    }

    try {
      await apiWrapper.createPVC(newName, newSize);
      setShowCreate(false);
      setNewName('');
      toast.success(`Volume ${newName} created successfully`);
      loadPvcs();
    } catch (error) {
      console.error("Failed to create PVC", error);
      // @ts-ignore
      const msg = error?.response?.data || error?.message || "Unknown error";
      toast.error(`Failed to create volume: ${msg}`);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete volume ${name}? Data will be lost forever.`)) return;
    try {
      await apiWrapper.deletePVC(name);
      toast.success(`Volume ${name} deleted`);
      loadPvcs();
    } catch (error) {
      console.error("Failed to delete PVC", error);
      toast.error("Failed to delete volume");
    }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button 
           onClick={() => setShowCreate(true)}
           className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> Create Volume
        </button>
      </div>

      {showCreate && (
         <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Create New Volume</h3>
            <form onSubmit={handleCreate} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Volume Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  placeholder="my-db-data"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div className="w-32">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Size</label>
                <select 
                  value={newSize} 
                  onChange={e => setNewSize(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="100Mi">100 MiB</option>
                  <option value="500Mi">500 MiB</option>
                  <option value="1Gi">1 GiB</option>
                  <option value="5Gi">5 GiB</option>
                  <option value="10Gi">10 GiB</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Create</button>
                <button type="button" onClick={() => setShowCreate(false)} className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded text-sm">Cancel</button>
              </div>
            </form>
         </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading volumes...</div>
      ) : pvcs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
          <HardDrive className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No storage volumes found</p>
          <p className="text-sm text-gray-400 mb-4">Create a Persistent Volume to store application data</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Size</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {pvcs.map((pvc) => (
                <tr key={pvc.name}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-gray-400" />
                    {pvc.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{pvc.size}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${pvc.status === 'Bound' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'}`}>
                      {pvc.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {pvc.created_at ? new Date(pvc.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => handleDelete(pvc.name)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ConfigList() {
  const [configs, setConfigs] = useState<ConfigMapDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [expandedConfig, setExpandedConfig] = useState<string | null>(null);
  const toast = useToast();

  const isValidName = (name: string) => {
    return /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name);
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const list = await apiWrapper.listConfigs();
      setConfigs(list);
    } catch (error) {
      console.error("Failed to load Configs", error);
      toast.error("Failed to load configuration groups");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName) return;

    if (!isValidName(newName)) {
      toast.error("Invalid name. Use lowercase letters, numbers, and hyphens only.");
      return;
    }

    try {
      await apiWrapper.createConfig(newName);
      setShowCreate(false);
      setNewName('');
      toast.success(`Config group ${newName} created`);
      loadConfigs();
    } catch (error) {
      toast.error("Failed to create config group");
    }
  };

  const handleDelete = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete config group ${name}?`)) return;
    try {
      await apiWrapper.deleteConfig(name);
      if (expandedConfig === name) setExpandedConfig(null);
      toast.success(`Config group ${name} deleted`);
      loadConfigs();
    } catch (error) {
      toast.error("Failed to delete config group");
    }
  };

  return (
    <div>
        <div className="flex justify-end mb-4">
        <button 
           onClick={() => setShowCreate(true)}
           className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
        >
          <Plus className="h-4 w-4" /> New Config Group
        </button>
      </div>

      {showCreate && (
         <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Create New Config Group</h3>
            <form onSubmit={handleCreate} className="flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Group Name</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)}
                  placeholder="nginx-config"
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Create</button>
                <button type="button" onClick={() => setShowCreate(false)} className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded text-sm">Cancel</button>
              </div>
            </form>
         </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">Loading configuration groups...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {configs.map(config => (
                <ConfigCard 
                   key={config.name} 
                   config={config} 
                   onDelete={(e) => handleDelete(config.name, e)}
                   onRefresh={loadConfigs}
                />
            ))}
            {configs.length === 0 && (
                <div className="col-span-full text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <FileText className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No configuration groups found</p>
                    <p className="text-sm text-gray-400">Create a group to organize your config files</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
}

function ConfigCard({ config, onDelete, onRefresh }: { config: ConfigMapDto, onDelete: (e: React.MouseEvent) => void, onRefresh: () => void }) {
  const toast = useToast();
  const onDrop = async (acceptedFiles: File[]) => {
      for (const file of acceptedFiles) {
          try {
              await apiWrapper.uploadConfigFile(config.name, file);
              toast.success(`Uploaded ${file.name}`);
          } catch(e) {
              console.error(e);
              toast.error(`Failed to upload ${file.name}`);
          }
      }
      onRefresh();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start">
            <div className="flex items-center gap-2">
                <Box className="h-5 w-5 text-blue-500" />
                <h3 className="font-bold text-gray-900 dark:text-white text-base">{config.name}</h3>
            </div>
            <button onClick={onDelete} className="text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
            </button>
        </div>
        
        <div className="p-4 flex-1">
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Files ({config.keys.length})</h4>
            <div className="space-y-1 mb-4">
                {config.keys.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">No files yet.</p>
                ) : (
                    config.keys.map(key => (
                        <div key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-1.5 rounded">
                            <FileText className="h-3 w-3" />
                            {key}
                        </div>
                    ))
                )}
            </div>
        </div>

        <div {...getRootProps()} className={`p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 text-center cursor-pointer transition-colors ${isDragActive ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-1">
                <Upload className="h-5 w-5 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {isDragActive ? "Drop files here..." : "Drag files or click to upload"}
                </p>
            </div>
        </div>
    </div>
  );
}
