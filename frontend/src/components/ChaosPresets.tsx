import { useEffect, useState, useCallback } from 'react';
import {
  Zap,
  RefreshCw,
  Clock,
  Gauge,
  ArrowDownUp,
  WifiOff,
  AlertTriangle,
  Trash2,
  Plus,
  Check,
} from 'lucide-react';
import api from '../services/api';

interface ChaosPreset {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  chaos_type: string;
  direction: string;
  duration?: string;
  params: Record<string, unknown>;
  is_builtin: boolean;
}

interface ChaosPresetsProps {
  topologyId: string;
  selectedSourceNode?: string;
  selectedTargetNode?: string;
  onApply?: (preset: ChaosPreset) => void;
  className?: string;
}

const categoryIcons: Record<string, React.ReactNode> = {
  latency: <Clock size={16} />,
  loss: <ArrowDownUp size={16} />,
  bandwidth: <Gauge size={16} />,
  partition: <WifiOff size={16} />,
  corruption: <AlertTriangle size={16} />,
  mixed: <Zap size={16} />,
  custom: <Plus size={16} />,
};

const categoryColors: Record<string, string> = {
  latency: 'bg-amber-50 border-amber-200 text-amber-700',
  loss: 'bg-red-50 border-red-200 text-red-700',
  bandwidth: 'bg-violet-50 border-violet-200 text-violet-700',
  partition: 'bg-gray-100 border-gray-300 text-gray-700',
  corruption: 'bg-orange-50 border-orange-200 text-orange-700',
  mixed: 'bg-purple-50 border-purple-200 text-purple-700',
  custom: 'bg-blue-50 border-blue-200 text-blue-700',
};

export function ChaosPresets({
  topologyId,
  selectedSourceNode,
  selectedTargetNode,
  onApply,
  className = '',
}: ChaosPresetsProps) {
  const [presets, setPresets] = useState<ChaosPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  // Fetch presets
  const fetchPresets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.listPresets();
      setPresets(data);
    } catch (err) {
      console.error('Error fetching presets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Apply preset
  const applyPreset = async (preset: ChaosPreset) => {
    if (!selectedSourceNode) {
      alert('Please select a source node first');
      return;
    }

    setApplying(preset.id);
    try {
      // Create chaos condition from preset
      // Map preset direction to API direction type
      const directionMap: Record<string, 'to' | 'from' | 'both'> = {
        'egress': 'to',
        'ingress': 'from',
        'both': 'both',
        'to': 'to',
        'from': 'from',
      };

      await api.createChaos({
        topology_id: topologyId,
        source_node_id: selectedSourceNode,
        target_node_id: selectedTargetNode || undefined,
        chaos_type: preset.chaos_type as 'delay' | 'loss' | 'bandwidth' | 'partition' | 'corrupt' | 'duplicate',
        direction: directionMap[preset.direction] || 'both',
        duration: preset.duration,
        params: preset.params,
      });

      setAppliedPreset(preset.id);
      setTimeout(() => setAppliedPreset(null), 2000);
      onApply?.(preset);
    } catch (err: any) {
      alert(err.message || 'Failed to apply preset');
    } finally {
      setApplying(null);
    }
  };

  // Group presets by category
  const categories = ['all', ...new Set(presets.map((p) => p.category))];

  const filteredPresets =
    selectedCategory === 'all'
      ? presets
      : presets.filter((p) => p.category === selectedCategory);

  const builtinPresets = filteredPresets.filter((p) => p.is_builtin);
  const customPresets = filteredPresets.filter((p) => !p.is_builtin);

  return (
    <div className={`chaos-presets ${className}`}>
      {/* Header */}
      <div className="presets-header flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-purple-500" />
          <h3 className="font-semibold text-gray-700">Chaos Presets</h3>
        </div>
        <button
          onClick={fetchPresets}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors"
        >
          <RefreshCw size={14} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Selected Nodes Info */}
      {selectedSourceNode && (
        <div className="selected-nodes px-3 py-2 bg-blue-50 border-b border-blue-100 text-xs">
          <span className="text-blue-700">
            Source: <strong>{selectedSourceNode}</strong>
            {selectedTargetNode && (
              <>
                {' → '}Target: <strong>{selectedTargetNode}</strong>
              </>
            )}
          </span>
        </div>
      )}

      {/* Category Filter */}
      <div className="category-filter flex gap-1 p-2 overflow-x-auto border-b border-gray-100">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`
              px-2 py-1 text-xs rounded-full whitespace-nowrap transition-colors
              ${
                selectedCategory === cat
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Presets List */}
      <div className="presets-list flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-24 text-gray-400">
            <RefreshCw size={20} className="animate-spin" />
          </div>
        ) : filteredPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-gray-400">
            <Zap size={24} className="mb-1" />
            <span className="text-sm">No presets available</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Built-in Presets */}
            {builtinPresets.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 px-1 mb-2">Built-in Presets</div>
                <div className="space-y-2">
                  {builtinPresets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      onApply={() => applyPreset(preset)}
                      applying={applying === preset.id}
                      applied={appliedPreset === preset.id}
                      disabled={!selectedSourceNode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Custom Presets */}
            {customPresets.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 px-1 mb-2">Custom Presets</div>
                <div className="space-y-2">
                  {customPresets.map((preset) => (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      onApply={() => applyPreset(preset)}
                      applying={applying === preset.id}
                      applied={appliedPreset === preset.id}
                      disabled={!selectedSourceNode}
                      onDelete={async () => {
                        if (confirm(`Delete preset "${preset.name}"?`)) {
                          await api.deletePreset(preset.id);
                          fetchPresets();
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help Text */}
      {!selectedSourceNode && (
        <div className="presets-help p-3 bg-yellow-50 border-t border-yellow-100 text-xs text-yellow-700">
          Select a source node in the graph to apply presets
        </div>
      )}
    </div>
  );
}

// Preset Card Component
function PresetCard({
  preset,
  onApply,
  applying,
  applied,
  disabled,
  onDelete,
}: {
  preset: ChaosPreset;
  onApply: () => void;
  applying: boolean;
  applied: boolean;
  disabled: boolean;
  onDelete?: () => void;
}) {
  const colorClass = categoryColors[preset.category] || categoryColors.custom;
  const icon = preset.icon || categoryIcons[preset.category] || <Zap size={16} />;

  return (
    <div
      className={`
        preset-card p-3 rounded-lg border transition-all
        ${colorClass}
        ${disabled ? 'opacity-60' : 'hover:shadow-md'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="preset-icon text-2xl flex-shrink-0">
          {typeof icon === 'string' ? icon : icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm">{preset.name}</h4>
            <span className="text-xs opacity-70">{preset.chaos_type}</span>
          </div>

          {preset.description && (
            <p className="text-xs opacity-80 mt-0.5">{preset.description}</p>
          )}

          <div className="text-xs opacity-60 mt-1">
            {Object.keys(preset.params).length > 0
              ? Object.entries(preset.params)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' • ')
              : 'No parameters'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded hover:bg-white/50 transition-colors"
              title="Delete preset"
            >
              <Trash2 size={14} />
            </button>
          )}

          <button
            onClick={onApply}
            disabled={disabled || applying}
            className={`
              p-2 rounded transition-all
              ${
                applied
                  ? 'bg-green-500 text-white'
                  : applying
                  ? 'bg-gray-300'
                  : 'bg-white/80 hover:bg-white'
              }
            `}
            title={disabled ? 'Select a source node first' : 'Apply preset'}
          >
            {applied ? (
              <Check size={16} />
            ) : applying ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Zap size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChaosPresets;
