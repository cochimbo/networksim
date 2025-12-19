import { useState, useEffect } from 'react';
import { PlayCircle, Plus, Trash2, Clock, Zap, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SavedScenario {
  id: string;
  name: string;
  description?: string;
  topologyId?: string;
  topologyName?: string;
  steps: ScenarioStep[];
  createdAt: string;
  lastRun?: string;
}

interface ScenarioStep {
  id: string;
  type: 'chaos' | 'wait' | 'clear';
  chaosConfig?: {
    source_node_id: string;
    target_node_id?: string;
    chaos_type: string;
    params: Record<string, unknown>;
  };
  waitSeconds?: number;
}

const STORAGE_KEY = 'networksim-saved-scenarios';

export default function Scenarios() {
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [topologies, setTopologies] = useState<{ id: string; name: string }[]>([]);

  // Load scenarios from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setScenarios(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load scenarios:', e);
      }
    }

    // Fetch topologies
    fetch('http://localhost:8080/api/topologies')
      .then((res) => res.json())
      .then((data) => setTopologies(data))
      .catch((err) => console.error('Failed to fetch topologies:', err));
  }, []);

  const deleteScenario = (id: string) => {
    if (confirm('Delete this scenario?')) {
      const updated = scenarios.filter((s) => s.id !== id);
      setScenarios(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'chaos':
        return <Zap size={14} className="text-yellow-500" />;
      case 'wait':
        return <Clock size={14} className="text-blue-500" />;
      case 'clear':
        return <XCircle size={14} className="text-red-500" />;
      default:
        return <ChevronRight size={14} />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PlayCircle className="h-8 w-8 text-gray-600" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Chaos Scenarios</h1>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
        <p className="text-blue-700 dark:text-blue-300 text-sm">
          Scenarios are sequences of chaos actions that can be saved and replayed.
          Create scenarios from the <strong>Scenarios tab</strong> in the topology editor,
          then find them here for quick access.
        </p>
      </div>

      {/* Scenarios List */}
      {scenarios.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <PlayCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-300 mb-2">No Saved Scenarios</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Create chaos scenarios from the topology editor to see them here.
          </p>
          {topologies.length > 0 ? (
            <Link
              to={`/topologies/${topologies[0].id}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus size={18} />
              Open Topology Editor
            </Link>
          ) : (
            <Link
              to="/topologies/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus size={18} />
              Create First Topology
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {scenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-200">{scenario.name}</h3>
                  {scenario.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{scenario.description}</p>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      Created: {formatDate(scenario.createdAt)}
                    </span>
                    {scenario.lastRun && (
                      <span className="flex items-center gap-1">
                        <CheckCircle size={12} className="text-green-500" />
                        Last run: {formatDate(scenario.lastRun)}
                      </span>
                    )}
                  </div>

                  {/* Steps preview */}
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-xs text-gray-500">Steps:</span>
                    <div className="flex items-center gap-1">
                      {scenario.steps.slice(0, 5).map((step) => (
                        <div
                          key={step.id}
                          className="p-1 bg-gray-100 dark:bg-gray-700 rounded"
                          title={`${step.type}${step.waitSeconds ? ` (${step.waitSeconds}s)` : ''}`}
                        >
                          {getStepIcon(step.type)}
                        </div>
                      ))}
                      {scenario.steps.length > 5 && (
                        <span className="text-xs text-gray-400">+{scenario.steps.length - 5} more</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {scenario.topologyId && (
                    <Link
                      to={`/topologies/${scenario.topologyId}`}
                      className="px-3 py-1.5 text-sm bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50"
                    >
                      Open Topology
                    </Link>
                  )}
                  <button
                    onClick={() => deleteScenario(scenario.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                    title="Delete scenario"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Links */}
      <div className="mt-8 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <h3 className="font-medium text-gray-700 dark:text-gray-200 mb-3">Available Topologies</h3>
        {topologies.length === 0 ? (
          <p className="text-sm text-gray-500">No topologies created yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {topologies.map((t) => (
              <Link
                key={t.id}
                to={`/topologies/${t.id}`}
                className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600"
              >
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
