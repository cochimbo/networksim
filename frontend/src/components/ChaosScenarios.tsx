import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Square,
  Plus,
  Trash2,
  Clock,
  Zap,
  ChevronRight,
  ChevronDown,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import api from '../services/api';

// Scenario step types
interface ChaosStep {
  id: string;
  type: 'chaos' | 'wait' | 'clear';
  // For chaos type
  chaosConfig?: {
    source_node_id: string;
    target_node_id?: string;
    chaos_type: string;
    direction: string;
    duration?: string;
    params: Record<string, unknown>;
  };
  // For wait type
  waitDuration?: number; // milliseconds
  // Execution state
  status?: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface Scenario {
  id: string;
  name: string;
  description?: string;
  steps: ChaosStep[];
  createdAt: string;
}

interface ChaosScenariosProps {
  topologyId: string;
  nodes: { id: string; name: string }[];
  onScenarioComplete?: () => void;
  className?: string;
}

const STORAGE_KEY = 'networksim-scenarios';

export function ChaosScenarios({
  topologyId,
  nodes,
  onScenarioComplete,
  className = '',
}: ChaosScenariosProps) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isEditing, setIsEditing] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);

  // Load scenarios from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_KEY}-${topologyId}`);
    if (stored) {
      try {
        setScenarios(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load scenarios:', e);
      }
    }
  }, [topologyId]);

  // Save scenarios to localStorage
  const saveScenarios = useCallback((newScenarios: Scenario[]) => {
    setScenarios(newScenarios);
    localStorage.setItem(`${STORAGE_KEY}-${topologyId}`, JSON.stringify(newScenarios));
  }, [topologyId]);

  // Create new scenario
  const createScenario = () => {
    const newScenario: Scenario = {
      id: `scenario-${Date.now()}`,
      name: `Scenario ${scenarios.length + 1}`,
      steps: [],
      createdAt: new Date().toISOString(),
    };
    setEditingScenario(newScenario);
    setIsEditing(true);
  };

  // Add step to editing scenario
  const addStep = (type: ChaosStep['type']) => {
    if (!editingScenario) return;

    const newStep: ChaosStep = {
      id: `step-${Date.now()}`,
      type,
      status: 'pending',
    };

    if (type === 'chaos') {
      newStep.chaosConfig = {
        source_node_id: nodes[0]?.id || '',
        chaos_type: 'delay',
        direction: 'to',
        params: { latency: '100ms' },
      };
    } else if (type === 'wait') {
      newStep.waitDuration = 5000;
    }

    setEditingScenario({
      ...editingScenario,
      steps: [...editingScenario.steps, newStep],
    });
  };

  // Update step
  const updateStep = (stepId: string, updates: Partial<ChaosStep>) => {
    if (!editingScenario) return;

    setEditingScenario({
      ...editingScenario,
      steps: editingScenario.steps.map((s) =>
        s.id === stepId ? { ...s, ...updates } : s
      ),
    });
  };

  // Remove step
  const removeStep = (stepId: string) => {
    if (!editingScenario) return;

    setEditingScenario({
      ...editingScenario,
      steps: editingScenario.steps.filter((s) => s.id !== stepId),
    });
  };

  // Save editing scenario
  const saveEditingScenario = () => {
    if (!editingScenario) return;

    const existingIndex = scenarios.findIndex((s) => s.id === editingScenario.id);
    if (existingIndex >= 0) {
      const updated = [...scenarios];
      updated[existingIndex] = editingScenario;
      saveScenarios(updated);
    } else {
      saveScenarios([...scenarios, editingScenario]);
    }

    setIsEditing(false);
    setEditingScenario(null);
  };

  // Delete scenario
  const deleteScenario = (scenarioId: string) => {
    if (confirm('Delete this scenario?')) {
      saveScenarios(scenarios.filter((s) => s.id !== scenarioId));
      if (selectedScenario?.id === scenarioId) {
        setSelectedScenario(null);
      }
    }
  };

  // Run scenario
  const runScenario = async (scenario: Scenario) => {
    if (isRunning) return;

    setIsRunning(true);
    setSelectedScenario(scenario);
    setCurrentStep(0);

    // Reset all steps
    const stepsWithStatus = scenario.steps.map((s) => ({ ...s, status: 'pending' as const }));
    setSelectedScenario({ ...scenario, steps: stepsWithStatus });

    for (let i = 0; i < scenario.steps.length; i++) {
      setCurrentStep(i);

      // Update step to running
      setSelectedScenario((prev) =>
        prev ? {
          ...prev,
          steps: prev.steps.map((s, idx) =>
            idx === i ? { ...s, status: 'running' } : s
          ),
        } : null
      );

      const step = scenario.steps[i];

      try {
        if (step.type === 'chaos' && step.chaosConfig) {
          await api.createChaos({
            topology_id: topologyId,
            source_node_id: step.chaosConfig.source_node_id,
            target_node_id: step.chaosConfig.target_node_id,
            chaos_type: step.chaosConfig.chaos_type as any,
            direction: step.chaosConfig.direction as any,
            duration: step.chaosConfig.duration,
            params: step.chaosConfig.params,
          });
        } else if (step.type === 'wait' && step.waitDuration) {
          await new Promise((resolve) => setTimeout(resolve, step.waitDuration));
        } else if (step.type === 'clear') {
          // Clear all chaos conditions
          const conditions = await api.listChaos(topologyId);
          for (const condition of conditions) {
            await api.deleteChaos(topologyId, condition.id);
          }
        }

        // Update step to completed
        setSelectedScenario((prev) =>
          prev ? {
            ...prev,
            steps: prev.steps.map((s, idx) =>
              idx === i ? { ...s, status: 'completed' } : s
            ),
          } : null
        );
      } catch (error: any) {
        // Update step to failed
        setSelectedScenario((prev) =>
          prev ? {
            ...prev,
            steps: prev.steps.map((s, idx) =>
              idx === i ? { ...s, status: 'failed', error: error.message } : s
            ),
          } : null
        );
        break;
      }
    }

    setIsRunning(false);
    setCurrentStep(-1);
    onScenarioComplete?.();
  };

  // Stop running scenario
  const stopScenario = () => {
    setIsRunning(false);
    setCurrentStep(-1);
  };

  // Get step icon
  const getStepIcon = (step: ChaosStep) => {
    if (step.type === 'chaos') return <Zap size={14} />;
    if (step.type === 'wait') return <Clock size={14} />;
    return <Square size={14} />;
  };

  // Get status icon
  const getStatusIcon = (status?: string) => {
    if (status === 'running') return <RefreshCw size={14} className="animate-spin text-blue-500" />;
    if (status === 'completed') return <CheckCircle size={14} className="text-green-500" />;
    if (status === 'failed') return <AlertCircle size={14} className="text-red-500" />;
    return null;
  };

  return (
    <div className={`chaos-scenarios flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="scenarios-header flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-purple-500" />
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">Chaos Scenarios</h3>
        </div>
        <button
          onClick={createScenario}
          disabled={isRunning}
          className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          title="Create new scenario"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Editing Mode */}
      {isEditing && editingScenario && (
        <div className="editing-panel flex-1 overflow-y-auto p-3">
          {/* Scenario name */}
          <input
            type="text"
            value={editingScenario.name}
            onChange={(e) => setEditingScenario({ ...editingScenario, name: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg mb-3 dark:bg-gray-800 dark:border-gray-600"
            placeholder="Scenario name"
          />

          {/* Steps */}
          <div className="steps space-y-2 mb-4">
            {editingScenario.steps.map((step, index) => (
              <div
                key={step.id}
                className="step-item p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">#{index + 1}</span>
                  {getStepIcon(step)}
                  <span className="font-medium text-sm capitalize">{step.type}</span>
                  <button
                    onClick={() => removeStep(step.id)}
                    className="ml-auto p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {step.type === 'chaos' && step.chaosConfig && (
                  <div className="space-y-2 text-sm">
                    <select
                      value={step.chaosConfig.source_node_id}
                      onChange={(e) =>
                        updateStep(step.id, {
                          chaosConfig: { ...step.chaosConfig!, source_node_id: e.target.value },
                        })
                      }
                      className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                      {nodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                    <select
                      value={step.chaosConfig.chaos_type}
                      onChange={(e) =>
                        updateStep(step.id, {
                          chaosConfig: { ...step.chaosConfig!, chaos_type: e.target.value },
                        })
                      }
                      className="w-full px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                    >
                      <option value="delay">Delay</option>
                      <option value="loss">Packet Loss</option>
                      <option value="bandwidth">Bandwidth</option>
                      <option value="partition">Partition</option>
                    </select>
                  </div>
                )}

                {step.type === 'wait' && (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      value={(step.waitDuration || 0) / 1000}
                      onChange={(e) =>
                        updateStep(step.id, { waitDuration: parseInt(e.target.value) * 1000 })
                      }
                      className="w-20 px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                      min={1}
                    />
                    <span className="text-gray-500">seconds</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add step buttons */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => addStep('chaos')}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30"
            >
              <Zap size={14} />
              Add Chaos
            </button>
            <button
              onClick={() => addStep('wait')}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30"
            >
              <Clock size={14} />
              Add Wait
            </button>
            <button
              onClick={() => addStep('clear')}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              <Square size={14} />
              Clear All
            </button>
          </div>

          {/* Save/Cancel */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditingScenario(null);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={saveEditingScenario}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
            >
              <Save size={14} />
              Save
            </button>
          </div>
        </div>
      )}

      {/* Scenarios List */}
      {!isEditing && (
        <div className="scenarios-list flex-1 overflow-y-auto">
          {scenarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400">
              <Zap size={24} className="mb-2" />
              <p className="text-sm">No scenarios yet</p>
              <button
                onClick={createScenario}
                className="mt-2 text-primary-500 text-sm hover:underline"
              >
                Create your first scenario
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`scenario-item p-3 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedScenario?.id === scenario.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setSelectedScenario(
                          selectedScenario?.id === scenario.id ? null : scenario
                        )
                      }
                      className="p-1"
                    >
                      {selectedScenario?.id === scenario.id ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </button>

                    <div className="flex-1">
                      <div className="font-medium text-sm">{scenario.name}</div>
                      <div className="text-xs text-gray-500">
                        {scenario.steps.length} steps
                      </div>
                    </div>

                    <button
                      onClick={() => runScenario(scenario)}
                      disabled={isRunning}
                      className="p-1.5 rounded bg-green-50 dark:bg-green-900/20 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50"
                      title="Run scenario"
                    >
                      <Play size={14} />
                    </button>

                    <button
                      onClick={() => {
                        setEditingScenario(scenario);
                        setIsEditing(true);
                      }}
                      disabled={isRunning}
                      className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      title="Edit"
                    >
                      <ChevronRight size={14} />
                    </button>

                    <button
                      onClick={() => deleteScenario(scenario.id)}
                      disabled={isRunning}
                      className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Expanded steps */}
                  {selectedScenario?.id === scenario.id && (
                    <div className="mt-3 pl-6 space-y-1">
                      {(selectedScenario.steps || scenario.steps).map((step, idx) => (
                        <div
                          key={step.id}
                          className={`flex items-center gap-2 text-xs py-1 ${
                            currentStep === idx ? 'text-blue-600 font-medium' : 'text-gray-500'
                          }`}
                        >
                          {getStatusIcon(step.status)}
                          <span>{idx + 1}.</span>
                          {getStepIcon(step)}
                          <span className="capitalize">{step.type}</span>
                          {step.type === 'chaos' && step.chaosConfig && (
                            <span className="text-gray-400">
                              ({step.chaosConfig.chaos_type})
                            </span>
                          )}
                          {step.type === 'wait' && (
                            <span className="text-gray-400">
                              ({(step.waitDuration || 0) / 1000}s)
                            </span>
                          )}
                          {step.error && (
                            <span className="text-red-500">{step.error}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Running indicator */}
      {isRunning && (
        <div className="running-indicator p-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-100 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="animate-spin text-blue-500" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Running step {currentStep + 1} of {selectedScenario?.steps.length}
            </span>
            <button
              onClick={stopScenario}
              className="ml-auto px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChaosScenarios;
