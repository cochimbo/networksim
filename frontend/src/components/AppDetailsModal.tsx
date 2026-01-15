import { X, Cpu, HardDrive, Heart, Server, Layers } from 'lucide-react';
import { Application } from '../services/api';

interface AppDetailsModalProps {
  app: Application;
  onClose: () => void;
}

export default function AppDetailsModal({ app, onClose }: AppDetailsModalProps) {
  // Extract values from the nested structure if necessary
  const values = (app as any).values || {};
  
  const replicas = values.replicas ?? app.replicas;
  const volumes = values.volumes ?? app.volumes ?? [];
  const resources = values.resources ?? {};
  const cpuLimit = resources.cpu_limit ?? app.cpu_limit;
  const cpuRequest = resources.cpu_request ?? app.cpu_request;
  const memLimit = resources.memory_limit ?? app.memory_limit;
  const memRequest = resources.memory_request ?? app.memory_request;
  const healthCheck = values.healthCheck ?? app.healthCheck;
  
  const env = values.env || app.envvalues?.env || app.envvalues;
  const envList = Array.isArray(env) ? env : Object.entries(env || {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-500" />
            Application Details: {app.image_name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Replicas Section */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Server className="h-4 w-4" /> Replicas
            </h3>
            <div className="text-2xl font-bold text-gray-700 dark:text-gray-200">
              {replicas || 1}
            </div>
            <p className="text-xs text-gray-500 mt-1">Number of pod instances</p>
          </div>

          {/* Resources Section */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
             <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Cpu className="h-4 w-4" /> Resources
            </h3>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">CPU</span>
                  <div className="mt-1 flex flex-col gap-1">
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Request:</span>
                          <span className="font-mono">{cpuRequest || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Limit:</span>
                          <span className="font-mono">{cpuLimit || '-'}</span>
                      </div>
                  </div>
               </div>
               <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Memory</span>
                  <div className="mt-1 flex flex-col gap-1">
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Request:</span>
                          <span className="font-mono">{memRequest || '-'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Limit:</span>
                          <span className="font-mono">{memLimit || '-'}</span>
                      </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Volumes Section */}
          {(volumes.length > 0) && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                <HardDrive className="h-4 w-4" /> Volumes
              </h3>
              <div className="space-y-2">
                {volumes.map((vol: any, i: number) => (
                  <div key={i} className="flex flex-col gap-1 p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-600 text-sm">
                     <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 border border-blue-200 dark:border-blue-800">
                          {vol.type || 'unknown'}
                        </span>
                     </div>
                     
                     <div className="grid grid-cols-[60px_1fr] gap-x-2 gap-y-1">
                        <div className="font-mono text-xs text-gray-500 text-right">Mount:</div>
                        <div className="break-all font-medium font-mono text-xs">{vol.mountPath}</div>
                        
                        {vol.type === 'hostPath' && (
                           <>
                             <div className="font-mono text-xs text-gray-500 text-right">Host:</div>
                             <div className="break-all text-gray-600 dark:text-gray-400 font-mono text-xs">{vol.source || (vol.hostPath?.path || vol.hostPath)}</div>
                           </>
                        )}
                        
                        {vol.type === 'pvc' && (
                           <>
                             {vol.source && (
                               <>
                                 <div className="font-mono text-xs text-gray-500 text-right">Claim:</div>
                                 <div className="break-all text-gray-600 dark:text-gray-400 font-mono text-xs">{vol.source}</div>
                               </>
                             )}
                             {vol.size && (
                               <>
                                 <div className="font-mono text-xs text-gray-500 text-right">Size:</div>
                                 <div className="break-all text-gray-600 dark:text-gray-400 font-mono text-xs">{vol.size}</div>
                               </>
                             )}
                           </>
                        )}

                        {vol.type === 'configMap' && (
                           <>
                             {/* Show name if it's an existing ConfigMap reference */}
                             {vol.source && (
                                <>
                                 <div className="font-mono text-xs text-gray-500 text-right">Name:</div>
                                 <div className="break-all text-gray-600 dark:text-gray-400 font-mono text-xs">{vol.source}</div>
                                </>
                             )}
                             
                             {/* Show inline items if available either via 'items' (new) or object structure (legacy) */}
                             {(vol.items || vol.configMap?.items) && (
                                 <>
                                     <div className="font-mono text-xs text-gray-500 text-right">Files:</div>
                                     <div className="text-gray-600 dark:text-gray-400 text-xs">
                                         {Object.entries(vol.items || {}).map(([key, val], k) => (
                                             <div key={k} className="mb-1">
                                                 <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{key}</span>
                                                 {typeof val === 'string' && (
                                                    <div className="mt-0.5 p-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded font-mono text-[10px] whitespace-pre-wrap max-h-20 overflow-y-auto">
                                                        {val}
                                                    </div>
                                                 )}
                                             </div>
                                         ))}
                                         {/* Handle Legacy configMap array structure if needed */}
                                         {Array.isArray(vol.configMap?.items) && vol.configMap.items.map((item: any, k: number) => (
                                              <div key={k} className="font-mono">{item.key} → {item.path}</div>
                                         ))}
                                     </div>
                                 </>
                             )}
                           </>
                        )}
                        
                        {vol.type === 'secret' && vol.source && (
                           <>
                             <div className="font-mono text-xs text-gray-500 text-right">Name:</div>
                             <div className="break-all text-gray-600 dark:text-gray-400 font-mono text-xs">{vol.source}</div>
                           </>
                        )}
                        
                        {vol.readOnly && (
                           <>
                             <div className="font-mono text-xs text-gray-500 text-right">Mode:</div>
                             <div className="text-gray-600 dark:text-gray-400 text-xs">Read Only</div>
                           </>
                        )}
                     </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Health Check Section */}
          {healthCheck && (
             <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Heart className="h-4 w-4" /> Health Check
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="text-gray-500">Type:</div>
                    <div className="font-medium uppercase">{healthCheck.type}</div>
                    
                    {healthCheck.port && (
                        <>
                            <div className="text-gray-500">Port:</div>
                            <div className="font-mono">{healthCheck.port}</div>
                        </>
                    )}
                    
                    {healthCheck.path && (
                        <>
                            <div className="text-gray-500">Path:</div>
                            <div className="font-mono">{healthCheck.path}</div>
                        </>
                    )}
                </div>
             </div>
          )}

          {/* Environment Variables */}
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
             <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <div className="flex-1">Environment Variables</div>
             </h3>
             {envList.length === 0 ? (
                 <p className="text-sm text-gray-500 italic">No environment variables set</p>
             ) : (
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-100 dark:bg-gray-800">
                            <tr>
                                <th className="px-3 py-2 rounded-tl-md">Key</th>
                                <th className="px-3 py-2 rounded-tr-md">Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {envList.map((env: any, i: number) => (
                                <tr key={i} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-100 dark:hover:bg-gray-600/50">
                                    <td className="px-3 py-2 font-mono font-medium text-blue-600 dark:text-blue-400">{env.name}</td>
                                    <td className="px-3 py-2 break-all font-mono text-gray-600 dark:text-gray-300">{env.value}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
             )}
          </div>

        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
