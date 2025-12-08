import { useQuery } from '@tanstack/react-query';
import { clusterApi } from '../services/api';
import { Server, ServerOff } from 'lucide-react';
import './ClusterStatus.css';

export function ClusterStatus() {
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['cluster-status'],
    queryFn: clusterApi.status,
    refetchInterval: 10000, // Poll every 10 seconds
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="cluster-status loading" title="Checking cluster...">
        <Server className="icon" />
        <span>K8s...</span>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="cluster-status error" title="Failed to check cluster status">
        <ServerOff className="icon" />
        <span>K8s Error</span>
      </div>
    );
  }

  return (
    <div 
      className={`cluster-status ${status.connected ? 'connected' : 'disconnected'}`}
      title={status.message}
    >
      {status.connected ? (
        <>
          <Server className="icon" />
          <span>K8s Ready</span>
        </>
      ) : (
        <>
          <ServerOff className="icon" />
          <span>K8s Offline</span>
        </>
      )}
    </div>
  );
}
