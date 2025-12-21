import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Network, Clock, Play, Copy, Search, X } from 'lucide-react';
import { topologyApi, deploymentApi, Topology } from '../services/api';
import { SkeletonTopologyGrid } from '../components/Skeleton';

export default function TopologyList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDeployed, setFilterDeployed] = useState<'all' | 'deployed' | 'not-deployed'>('all');

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

  const duplicateMutation = useMutation({
    mutationFn: topologyApi.duplicate,
    onSuccess: (newTopology) => {
      queryClient.invalidateQueries({ queryKey: ['topologies'] });
      navigate(`/topologies/${newTopology.id}`);
    },
  });

  // Filter topologies based on search and filter
  const filteredTopologies = useMemo(() => {
    if (!topologies) return [];

    return topologies.filter((topology: Topology) => {
      // Search filter
      const matchesSearch = searchQuery === '' ||
        topology.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (topology.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      // Deployed filter
      const isRunning = activeDeployment?.topology_id === topology.id;
      const matchesFilter =
        filterDeployed === 'all' ||
        (filterDeployed === 'deployed' && isRunning) ||
        (filterDeployed === 'not-deployed' && !isRunning);

      return matchesSearch && matchesFilter;
    });
  }, [topologies, searchQuery, filterDeployed, activeDeployment]);

  if (isLoading) {
    return (
      <div>
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <div className="w-full h-10 bg-gray-100 rounded-lg animate-pulse" />
          </div>
          <div className="w-32 h-10 bg-gray-100 rounded-lg animate-pulse" />
          <div className="w-36 h-10 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <SkeletonTopologyGrid count={6} />
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
      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search topologies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            aria-label="Search topologies"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Filter dropdown */}
        <select
          value={filterDeployed}
          onChange={(e) => setFilterDeployed(e.target.value as 'all' | 'deployed' | 'not-deployed')}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
          aria-label="Filter by deployment status"
        >
          <option value="all">All ({topologies?.length || 0})</option>
          <option value="deployed">Deployed</option>
          <option value="not-deployed">Not Deployed</option>
        </select>

        {/* New topology button */}
        <Link
          to="/topologies/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors whitespace-nowrap"
        >
          <Plus className="h-5 w-5" />
          New Topology
        </Link>
      </div>

      {/* Results count */}
      <p className="text-sm text-gray-500 mb-4">
        Showing {filteredTopologies.length} of {topologies?.length || 0} topologies
      </p>

      {/* Grid */}
      {filteredTopologies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopologies.map((topology: Topology) => {
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
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => duplicateMutation.mutate(topology.id)}
                      disabled={duplicateMutation.isPending}
                      className="p-1 text-gray-400 hover:text-primary-600 transition-colors disabled:opacity-50"
                      title="Duplicate topology"
                      aria-label="Duplicate topology"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
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
                      aria-label={isRunning ? 'Cannot delete while running' : 'Delete topology'}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            {searchQuery || filterDeployed !== 'all' ? 'No matching topologies' : 'No topologies'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchQuery || filterDeployed !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Get started by creating a new topology.'}
          </p>
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
