import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Network, Clock, Play } from 'lucide-react';
import { topologyApi, deploymentApi, Topology } from '../services/api';

export default function TopologyList() {
  const queryClient = useQueryClient();

  const { data: topologies, isLoading, error } = useQuery({
    queryKey: ['topologies'],
    queryFn: topologyApi.list,
  });

  // Get active deployment to show which topology is running
  const { data: activeDeployment } = useQuery({
    queryKey: ['active-deployment'],
    queryFn: deploymentApi.getActive,
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: topologyApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topologies'] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Error loading topologies: {(error as Error).message}
      </div>
    );
  }

  return (
    <div>
      {/* Actions */}
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-600">
          {topologies?.length || 0} topologies
        </p>
        <Link
          to="/topologies/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          New Topology
        </Link>
      </div>

      {/* Grid */}
      {topologies && topologies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topologies.map((topology: Topology) => {
            const isRunning = activeDeployment?.topology_id === topology.id;
            return (
              <div
                key={topology.id}
                className={`bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow ${
                  isRunning ? 'border-green-500 ring-2 ring-green-200' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <Link to={`/topologies/${topology.id}`} className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-medium text-gray-900 hover:text-primary-600">
                        {topology.name}
                      </h3>
                      {isRunning && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          <Play className="h-3 w-3" />
                          Running
                        </span>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={() => {
                      if (isRunning) {
                        alert('Cannot delete a running topology. Stop the deployment first.');
                        return;
                      }
                      if (confirm('Are you sure you want to delete this topology?')) {
                        deleteMutation.mutate(topology.id);
                      }
                    }}
                    disabled={isRunning}
                    className={`p-1 transition-colors ${
                      isRunning 
                        ? 'text-gray-300 cursor-not-allowed' 
                        : 'text-gray-400 hover:text-red-600'
                    }`}
                    title={isRunning ? 'Cannot delete while running' : 'Delete topology'}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>

                {topology.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {topology.description}
                  </p>
                )}

                <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Network className="h-4 w-4" />
                    {topology.nodes.length} nodes
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(topology.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Network className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No topologies</h3>
          <p className="mt-1 text-sm text-gray-500">Get started by creating a new topology.</p>
          <div className="mt-6">
            <Link
              to="/topologies/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              New Topology
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
