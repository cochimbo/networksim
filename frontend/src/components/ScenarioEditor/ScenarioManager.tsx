import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit, Trash2, Play, Clock, FileText, 
  ChevronRight, Calendar 
} from 'lucide-react';
import { ScenarioEditor } from './ScenarioEditor';
import { scenariosApi, chaosApi, Scenario } from '../../services/api';

interface ScenarioManagerProps {
  topologyId: string;
  nodes: Array<{ id: string; name: string }>;
  isDeploymentReady?: boolean;
}

export const ScenarioManager: React.FC<ScenarioManagerProps> = ({ 
  topologyId, 
  nodes,
  isDeploymentReady = false,
}) => {
  const [mode, setMode] = useState<'list' | 'edit'>('list');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (mode === 'list') {
      loadScenarios();
    }
  }, [mode, topologyId]);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      const data = await scenariosApi.list(topologyId);
      setScenarios(data);
    } catch (err) {
      console.error('Failed to load scenarios', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedScenario(null); // New scenario
    setMode('edit');
  };

  const handleEdit = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setMode('edit');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scenario?')) return;
    try {
      await scenariosApi.delete(id);
      loadScenarios();
    } catch (err) {
      console.error('Failed to delete scenario', err);
    }
  };

  const handleRun = async (scenario: Scenario) => {
      // If we are in list mode, we can run directly? 
      // Or maybe scenarios are run from the editor?
      // Let's support run from list.
      try {
          await scenariosApi.run(scenario.id);
          alert(`Scenario "${scenario.name}" started!`);
      } catch (err) {
          console.error("Failed to run scenario", err);
      }
  };
  
  const handleSave = async (scenarioData: Partial<Scenario>) => {
      try {
          if (selectedScenario?.id) {
              // Update
              const updated = await scenariosApi.update(selectedScenario.id, scenarioData);
              setSelectedScenario(updated);
          } else {
              // Create
              const created = await scenariosApi.create(topologyId, scenarioData as any);
              setSelectedScenario(created);
          }
          // Don't switch back to list mode, let user continue editing
          // setMode('list');
          
          // Optional: Show success feedback (could be replaced by a Toast)
          // alert('Scenario saved successfully');
      } catch (err: any) {
           console.error("Failed to save scenario", err);
           const msg = err.response?.data?.error || err.message || "Unknown error";
           alert(`Failed to save scenario: ${msg}`);
      }
  };

  if (mode === 'edit') {
     return (
        <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 p-2 bg-gray-50 border-b border-gray-200">
                <button 
                    onClick={() => setMode('list')}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                >
                    <ChevronRight className="rotate-180" size={16} />
                    Back to List
                </button>
                <div className="w-px h-4 bg-gray-300 mx-2" />
                <span className="font-semibold text-sm">
                    {selectedScenario ? `Editing: ${selectedScenario.name}` : 'New Scenario'}
                </span>
            </div>
            <div className="flex-1 overflow-hidden">
                <ScenarioEditor 
                    nodes={nodes}
                    topologyId={topologyId}
                    initialScenario={selectedScenario || undefined}
                    onSave={handleSave}
                    onRun={async (s) => {
                         if (!s.id) return; // Must be saved
                         setIsRunning(true);
                         try {
                            await scenariosApi.run(s.id);
                         } catch (err) {
                            console.error("Failed to run scenario", err);
                            setIsRunning(false);
                         }
                    }}
                    onStop={async () => {
                        setIsRunning(false);
                        try {
                             await chaosApi.stopAll(topologyId);
                        } catch (err) {
                             console.error("Failed to stop chaos", err);
                        }
                    }}
                    isRunning={isRunning}
                    isDeploymentReady={isDeploymentReady}
                />
            </div>
        </div>
     );
  }

  // List Mode
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold text-lg flex items-center gap-2">
                <Clock size={20} className="text-primary-600" />
                Scenarios
            </h3>
            <button 
                onClick={handleCreate}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded hover:bg-primary-700 text-sm font-medium transition-colors"
            >
                <Plus size={16} />
                New Scenario
            </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
            {loading ? (
                <div className="text-center py-10 text-gray-400">Loading scenarios...</div>
            ) : scenarios.length === 0 ? (
                <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <FileText size={48} className="mx-auto text-gray-300 mb-2" />
                    <p>No scenarios found for this topology.</p>
                    <button onClick={handleCreate} className="text-primary-600 font-medium hover:underline mt-2">Create your first scenario</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {scenarios.map(scenario => (
                        <div key={scenario.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate pr-2" title={scenario.name}>
                                    {scenario.name}
                                </h4>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleEdit(scenario)}
                                        className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                                        title="Edit"
                                    >
                                        <Edit size={14} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(scenario.id)}
                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                                        title="Delete"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                            
                            <p className="text-xs text-gray-500 mb-4 line-clamp-2 h-8">
                                {scenario.description || 'No description provided.'}
                            </p>
                            
                            <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                                <span className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {scenario.total_duration}s
                                </span>
                                <span className="flex items-center gap-1">
                                    <Calendar size={12} />
                                    {new Date(scenario.created_at).toLocaleDateString()}
                                </span>
                            </div>

                            <button 
                                onClick={() => handleRun(scenario)}
                                disabled={!isDeploymentReady}
                                className={`w-full mt-4 flex items-center justify-center gap-2 py-2 rounded transition-colors text-sm font-medium
                                    ${!isDeploymentReady 
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                        : 'bg-gray-50 dark:bg-gray-800 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-gray-700 dark:text-gray-300 hover:text-primary-700 border border-gray-200 dark:border-gray-700'
                                    }`}
                                title={!isDeploymentReady ? "Deployment must be running to execute scenarios" : ""}
                            >
                                <Play size={14} />
                                Run Scenario
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};
