import { useState, useEffect } from 'react';
import { templatesApi, TopologyTemplate, GeneratedTopology } from '../services/api';
import {
  Grid3X3,
  Layers,
  Star,
  Circle,
  Share2,
  ArrowRight,
  Loader2,
  X,
} from 'lucide-react';

interface TemplateSelectorProps {
  onSelect: (generated: GeneratedTopology) => void;
  onCancel: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
  'grid-3x3': <Grid3X3 size={24} />,
  'layers': <Layers size={24} />,
  'star': <Star size={24} />,
  'circle': <Circle size={24} />,
  'share-2': <Share2 size={24} />,
  'arrow-right': <ArrowRight size={24} />,
};

export function TemplateSelector({ onSelect, onCancel }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TopologyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await templatesApi.list();
      setTemplates(data);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (templateId: string) => {
    try {
      setGenerating(templateId);
      const generated = await templatesApi.generate(templateId);
      onSelect(generated);
    } catch (err) {
      setError('Failed to generate topology from template');
      console.error(err);
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 flex items-center gap-3">
          <Loader2 className="animate-spin text-indigo-600" size={24} />
          <span className="text-gray-700 dark:text-gray-300">Loading templates...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Choose a Template
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Start with a predefined topology or create from scratch
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
            {error}
          </div>
        )}

        {/* Templates grid */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Empty/Blank template */}
            <button
              onClick={() => onSelect({ name: 'New Topology', description: '', nodes: [], links: [] })}
              className="p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors text-left group"
            >
              <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/30 transition-colors">
                <span className="text-2xl">+</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                Blank Canvas
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Start from scratch with an empty topology
              </p>
            </button>

            {/* Template cards */}
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSelectTemplate(template.id)}
                disabled={generating !== null}
                className="p-6 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-lg transition-all text-left group disabled:opacity-50"
              >
                <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/30 transition-colors">
                  {generating === template.id ? (
                    <Loader2 className="animate-spin" size={24} />
                  ) : (
                    iconMap[template.icon] || <Grid3X3 size={24} />
                  )}
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {template.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {template.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    {template.node_count} nodes
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                    {template.preview.links.length} links
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            Templates provide a starting point - you can modify them after creation
          </p>
        </div>
      </div>
    </div>
  );
}
