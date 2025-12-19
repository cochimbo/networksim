import React, { useRef, useState } from 'react';
import { Download, Upload, FileJson, Check, AlertCircle, Copy } from 'lucide-react';

interface TopologyExport {
  version: string;
  exportedAt: string;
  topology: {
    name: string;
    description?: string;
    nodes: any[];
    links: any[];
  };
  chaosConditions?: any[];
  applications?: any[];
}

interface ExportImportProps {
  topology: {
    name: string;
    description?: string;
    nodes: any[];
    links: any[];
  };
  chaosConditions?: any[];
  applications?: any[];
  onImport: (data: TopologyExport) => void;
  className?: string;
}

export function ExportImport({
  topology,
  chaosConditions,
  applications,
  onImport,
  className = '',
}: ExportImportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [importError, setImportError] = useState<string>('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate export data
  const generateExportData = (): TopologyExport => {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      topology: {
        name: topology.name,
        description: topology.description,
        nodes: topology.nodes.map(n => ({
          id: n.id,
          name: n.name,
          position: n.position,
          config: n.config,
        })),
        links: topology.links.map(l => ({
          id: l.id,
          source: l.source,
          target: l.target,
          properties: l.properties,
        })),
      },
      chaosConditions: chaosConditions?.map(c => ({
        source_node_id: c.source_node_id,
        target_node_id: c.target_node_id,
        chaos_type: c.chaos_type,
        direction: c.direction,
        duration: c.duration,
        params: c.params,
      })),
      applications: applications?.map(a => ({
        node_selector: a.node_selector,
        image_name: a.image_name,
        values: a.values,
      })),
    };
  };

  // Export to JSON file
  const handleExport = () => {
    const data = generateExportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topology.name.replace(/\s+/g, '-').toLowerCase()}-topology.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy to clipboard
  const handleCopy = async () => {
    const data = generateExportData();
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Import from file
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content) as TopologyExport;

        // Validate structure
        if (!data.topology || !data.topology.nodes || !data.topology.links) {
          throw new Error('Invalid topology structure');
        }

        onImport(data);
        setImportStatus('success');
        setTimeout(() => setImportStatus('idle'), 3000);
      } catch (err: any) {
        setImportError(err.message || 'Failed to parse file');
        setImportStatus('error');
        setTimeout(() => setImportStatus('idle'), 5000);
      }
    };

    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  // Import from clipboard - kept for future use
  const _handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const data = JSON.parse(text) as TopologyExport;

      if (!data.topology || !data.topology.nodes || !data.topology.links) {
        throw new Error('Invalid topology structure');
      }

      onImport(data);
      setImportStatus('success');
      setTimeout(() => setImportStatus('idle'), 3000);
    } catch (err: unknown) {
      const error = err as Error;
      setImportError(error.message || 'Failed to parse clipboard content');
      setImportStatus('error');
      setTimeout(() => setImportStatus('idle'), 5000);
    }
  };
  void _handlePaste; // Prevent unused warning

  return (
    <div className={`export-import flex items-center gap-2 ${className}`}>
      {/* Export Button */}
      <div className="relative">
        <button
          onClick={() => setShowExportModal(!showExportModal)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          title="Export topology"
        >
          <Download size={16} />
          Export
        </button>

        {/* Export Dropdown */}
        {showExportModal && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
            <button
              onClick={() => {
                handleExport();
                setShowExportModal(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FileJson size={16} />
              Download JSON
            </button>
            <button
              onClick={() => {
                handleCopy();
                setShowExportModal(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
        )}
      </div>

      {/* Import Button */}
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border rounded-lg transition-colors ${
            importStatus === 'success'
              ? 'border-green-500 text-green-600'
              : importStatus === 'error'
              ? 'border-red-500 text-red-600'
              : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title="Import topology"
        >
          {importStatus === 'success' ? (
            <Check size={16} className="text-green-500" />
          ) : importStatus === 'error' ? (
            <AlertCircle size={16} className="text-red-500" />
          ) : (
            <Upload size={16} />
          )}
          {importStatus === 'success' ? 'Imported!' : importStatus === 'error' ? 'Error' : 'Import'}
        </button>
      </div>

      {/* Error message */}
      {importStatus === 'error' && importError && (
        <span className="text-xs text-red-500">{importError}</span>
      )}

      {/* Click outside to close */}
      {showExportModal && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

export default ExportImport;
