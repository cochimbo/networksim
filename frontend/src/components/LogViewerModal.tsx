import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, RefreshCw, Download, Copy } from 'lucide-react';
import { applicationsApi } from '../services/api';

interface LogViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  topologyId: string;
  appId: string;
  appName: string;
}

export function LogViewerModal({ isOpen, onClose, topologyId, appId, appName }: LogViewerModalProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['app-logs', topologyId, appId],
    queryFn: () => applicationsApi.getLogs(topologyId, appId),
    enabled: isOpen,
    refetchInterval: isOpen ? 5000 : false, // Auto-refresh every 5s when open
  });

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (data?.logs) {
      navigator.clipboard.writeText(data.logs);
    }
  };

  const handleDownload = () => {
    if (data?.logs) {
      const blob = new Blob([data.logs], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appName}-logs.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            Logs: <span className="text-blue-600 font-mono text-sm">{appName}</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Copy to clipboard"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={handleDownload}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Download logs"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden bg-gray-900 text-gray-100 font-mono text-xs p-4">
          <div className="h-full overflow-auto custom-scrollbar">
            {isLoading && !data ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading logs...
              </div>
            ) : error ? (
              <div className="text-red-400 p-4">
                Error loading logs: {(error as Error).message}
              </div>
            ) : (
              <pre className="whitespace-pre-wrap break-all">
                {data?.logs || 'No logs available.'}
                <div ref={logsEndRef} />
              </pre>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500 flex justify-between">
           <span>Auto-refreshing every 5s</span>
           <span>{data?.logs?.length || 0} chars</span>
        </div>
      </div>
    </div>
  );
}
