import { useState } from 'react';
import { reportsApi } from '../services/api';
import { FileDown, FileText, Loader2, X, CheckCircle, AlertCircle } from 'lucide-react';

interface ExportReportProps {
  topologyId: string;
  topologyName: string;
  onClose: () => void;
}

export function ExportReport({ topologyId, topologyName, onClose }: ExportReportProps) {
  const [exporting, setExporting] = useState<'json' | 'html' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExportJson = async () => {
    try {
      setExporting('json');
      setError(null);
      const report = await reportsApi.getJson(topologyId);

      // Download as JSON file
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-${topologyName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess('JSON report downloaded successfully!');
    } catch (err) {
      setError('Failed to generate JSON report');
      console.error(err);
    } finally {
      setExporting(null);
    }
  };

  const handleExportHtml = async () => {
    try {
      setExporting('html');
      setError(null);
      await reportsApi.downloadHtml(topologyId);
      setSuccess('HTML report downloaded successfully!');
    } catch (err) {
      setError('Failed to generate HTML report');
      console.error(err);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Export Report
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {topologyName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Success message */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg">
              <CheckCircle size={18} />
              <span>{success}</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {/* Export options */}
          <div className="space-y-3">
            <button
              onClick={handleExportHtml}
              disabled={exporting !== null}
              className="w-full flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                {exporting === 'html' ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <FileText size={24} />
                )}
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  HTML Report
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Visual report with charts and tables, ready to print or share
                </p>
              </div>
            </button>

            <button
              onClick={handleExportJson}
              disabled={exporting !== null}
              className="w-full flex items-center gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all disabled:opacity-50"
            >
              <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                {exporting === 'json' ? (
                  <Loader2 className="animate-spin" size={24} />
                ) : (
                  <FileDown size={24} />
                )}
              </div>
              <div className="text-left flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  JSON Data
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Raw data export for analysis or integration with other tools
                </p>
              </div>
            </button>
          </div>

          {/* Report contents info */}
          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Report includes:
            </h4>
            <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                Topology structure (nodes & links)
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                Chaos conditions & experiments
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                Deployed applications
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                Recent events & timeline
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                Summary statistics
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
