import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import cytoscape, { Core } from 'cytoscape';
import { Save, Trash2, Circle, ArrowRight, Link as LinkIcon, ZoomIn, ZoomOut, Maximize, Flame, Play, Square, Loader2 } from 'lucide-react';
import { topologyApi, clusterApi, deploymentApi, Topology, Node, Link } from '../services/api';
import { ChaosPanel } from '../components/ChaosPanel';
import { DeploymentModal, DeploymentAction, DeploymentPhase } from '../components/DeploymentModal';
import { useWebSocketEvents, WebSocketEvent } from '../contexts/WebSocketContext';

// Node status from K8s
type NodeStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
const STATUS_COLORS: Record<NodeStatus, string> = {
  pending: '#f59e0b',    // amber
  running: '#22c55e',    // green
  succeeded: '#3b82f6',  // blue
  failed: '#ef4444',     // red
  unknown: '#6b7280',    // gray
};

export default function TopologyEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const cyContainerRef = useRef<HTMLDivElement | null>(null);
  const cyInstance = useRef<Core | null>(null);

  const [name, setName] = useState('New Topology');
  const [description, setDescription] = useState('');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [tool, setTool] = useState<'select' | 'node' | 'link'>('select');
  const [linkSource, setLinkSource] = useState<string | null>(null);
  const [showChaosPanel, setShowChaosPanel] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
  const [cyReady, setCyReady] = useState(false);
  const [deployModal, setDeployModal] = useState<{
    show: boolean;
    action: DeploymentAction;
    phase: DeploymentPhase;
    message?: string;
  } | null>(null);

  // Refs to access current values in event handlers
  const toolRef = useRef(tool);
  const nodesRef = useRef(nodes);
  const linkSourceRef = useRef(linkSource);

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { linkSourceRef.current = linkSource; }, [linkSource]);

  // Handle real-time WebSocket events
  const handleWsEvent = useCallback((event: WebSocketEvent) => {
    if (event.type === 'node:status' && event.data.topology_id === id) {
      const nodeId = String(event.data.node_id);
      const status = (event.data.status as NodeStatus) || 'unknown';
      
      setNodeStatuses(prev => ({
        ...prev,
        [nodeId]: status
      }));
      
      // Update node color in Cytoscape
      if (cyInstance.current) {
        const node = cyInstance.current.$(`#${nodeId}`);
        if (node.length > 0) {
          const color = STATUS_COLORS[status] || STATUS_COLORS.unknown;
          node.style('background-color', color);
        }
      }
    }
  }, [id]);

  useWebSocketEvents(handleWsEvent);

  const isNewTopology = !id || id === 'new';

  // Load existing topology
  const { data: topology, isLoading } = useQuery({
    queryKey: ['topology', id],
    queryFn: () => topologyApi.get(id!),
    enabled: !isNewTopology,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<Topology>) => {
      if (!isNewTopology) {
        return topologyApi.update(id!, data);
      }
      return topologyApi.create(data as any);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['topologies'] });
      if (isNewTopology) {
        navigate(`/topologies/${data.id}`);
      }
    },
  });

  // Cluster status
  const { data: clusterStatus } = useQuery({
    queryKey: ['cluster-status'],
    queryFn: clusterApi.status,
    refetchInterval: 10000,
  });

  // Active deployment (global - any topology)
  const { data: activeDeployment } = useQuery({
    queryKey: ['active-deployment'],
    queryFn: deploymentApi.getActive,
    enabled: clusterStatus?.connected,
    refetchInterval: 5000,
  });

  // Deployment status (this topology)
  const { data: deploymentStatus, refetch: refetchDeployment } = useQuery({
    queryKey: ['deployment-status', id],
    queryFn: () => topologyApi.status(id!),
    enabled: !isNewTopology && clusterStatus?.connected,
    refetchInterval: 5000,
  });

  // Check if THIS topology is deployed
  const isThisTopologyDeployed = deploymentStatus?.status === 'running' || deploymentStatus?.status === 'pending';
  // Check if ANY topology is deployed (for global blocking)
  const isAnyDeployed = activeDeployment !== null && activeDeployment !== undefined;
  // For UI blocking purposes
  const isDeployed = isAnyDeployed;
  const isClusterReady = clusterStatus?.connected ?? false;

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: () => topologyApi.deploy(id!),
    onMutate: () => {
      setDeployModal({ show: true, action: 'deploy', phase: 'starting' });
    },
    onSuccess: () => {
      setDeployModal({ show: true, action: 'deploy', phase: 'success' });
      refetchDeployment();
      queryClient.invalidateQueries({ queryKey: ['deployment-status', id] });
      queryClient.invalidateQueries({ queryKey: ['active-deployment'] });
    },
    onError: (error: any) => {
      setDeployModal({ 
        show: true, 
        action: 'deploy', 
        phase: 'error',
        message: error?.response?.data?.message || error.message || 'Deploy failed'
      });
    },
  });

  // Destroy mutation
  const destroyMutation = useMutation({
    mutationFn: () => topologyApi.destroy(id!),
    onMutate: () => {
      setDeployModal({ show: true, action: 'destroy', phase: 'starting' });
    },
    onSuccess: () => {
      setDeployModal({ show: true, action: 'destroy', phase: 'success' });
      refetchDeployment();
      queryClient.invalidateQueries({ queryKey: ['deployment-status', id] });
      queryClient.invalidateQueries({ queryKey: ['active-deployment'] });
      setNodeStatuses({});
    },
    onError: (error: any) => {
      setDeployModal({ 
        show: true, 
        action: 'destroy', 
        phase: 'error',
        message: error?.response?.data?.message || error.message || 'Stop failed'
      });
    },
  });

  // Callback ref to initialize Cytoscape when container is available
  const cyRef = useCallback((container: HTMLDivElement | null) => {
    // Cleanup previous instance if any
    if (cyInstance.current) {
      cyInstance.current.destroy();
      cyInstance.current = null;
      setCyReady(false);
    }

    if (!container) return;

    cyContainerRef.current = container;
    
    cyInstance.current = cytoscape({
      container: container,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#0ea5e9',
            'label': 'data(name)',
            'color': '#1f2937',
            'text-valign': 'bottom',
            'text-margin-y': 8,
            'font-size': 12,
            'width': 40,
            'height': 40,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#0369a1',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#9ca3af',
            'target-arrow-color': '#9ca3af',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#0369a1',
            'width': 3,
          },
        },
        {
          selector: 'node.link-source',
          style: {
            'border-width': 3,
            'border-color': '#22c55e',
            'border-style': 'dashed',
          },
        },
      ],
      layout: { name: 'preset' },
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
    });

    const cy = cyInstance.current;

    // Click on canvas to add node
    cy.on('tap', (event) => {
      if (event.target === cy && toolRef.current === 'node') {
        const pos = event.position;
        const newNode: Node = {
          id: `node-${Date.now()}`,
          name: `Node ${nodesRef.current.length + 1}`,
          type: 'server',
          position: { x: pos.x, y: pos.y },
          config: {},
        };
        
        cy.add({
          group: 'nodes',
          data: { id: newNode.id, name: newNode.name },
          position: { x: pos.x, y: pos.y },
        });
        
        setNodes((prev) => [...prev, newNode]);
        setTool('select');
      } else if (event.target === cy) {
        // Click on empty canvas clears link source
        setLinkSource(null);
      }
    });

    // Handle node clicks for link creation
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      
      if (toolRef.current === 'link') {
        const prevSource = linkSourceRef.current;
        if (prevSource === null) {
          // First node selected - highlight it
          node.addClass('link-source');
          setLinkSource(node.id());
        } else if (prevSource !== node.id()) {
          // Second node selected - create link
          const linkId = `link-${Date.now()}`;
          const newLink: Link = {
            id: linkId,
            source: prevSource,
            target: node.id(),
          };
          
          cy.add({
            group: 'edges',
            data: { id: linkId, source: prevSource, target: node.id() },
          });
          
          // Remove highlight from source
          cy.$('.link-source').removeClass('link-source');
          
          setLinks((prev) => [...prev, newLink]);
          setLinkSource(null);
        }
        return; // Don't select when creating link
      }

      // Normal selection
      setSelectedElement({
        type: 'node',
        data: node.data(),
      });
    });

    // Select edge
    cy.on('tap', 'edge', (event) => {
      const element = event.target;
      setSelectedElement({
        type: 'edge',
        data: element.data(),
      });
    });

    // Move node
    cy.on('dragfree', 'node', (event) => {
      const node = event.target;
      const pos = node.position();
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id() ? { ...n, position: { x: pos.x, y: pos.y } } : n
        )
      );
    });

    setCyReady(true);
  }, []);

  // Load topology data into Cytoscape
  useEffect(() => {
    if (topology && cyReady && cyInstance.current) {
      setName(topology.name);
      setDescription(topology.description || '');
      setNodes(topology.nodes);
      setLinks(topology.links);

      const cy = cyInstance.current;
      cy.elements().remove();

      // Add nodes
      topology.nodes.forEach((node) => {
        cy.add({
          group: 'nodes',
          data: { id: node.id, name: node.name },
          position: { x: node.position.x, y: node.position.y },
        });
      });

      // Add edges
      topology.links.forEach((link) => {
        cy.add({
          group: 'edges',
          data: { id: link.id, source: link.source, target: link.target },
        });
      });

      cy.fit();
    }
  }, [topology, cyReady]);

  const handleSave = () => {
    saveMutation.mutate({
      name,
      description: description || undefined,
      nodes,
      links,
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedElement || !cyInstance.current) return;

    const cy = cyInstance.current;
    
    if (selectedElement.type === 'node') {
      // Remove node and connected edges
      const nodeId = selectedElement.data.id;
      cy.$(`#${nodeId}`).remove();
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setLinks((prev) => prev.filter((l) => l.source !== nodeId && l.target !== nodeId));
    } else {
      // Remove edge
      const edgeId = selectedElement.data.id;
      cy.$(`#${edgeId}`).remove();
      setLinks((prev) => prev.filter((l) => l.id !== edgeId));
    }

    setSelectedElement(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-4">
        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isDeployed}
          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          placeholder="Topology name"
        />

        <div className="h-6 w-px bg-gray-200" />

        {/* Tools */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setTool('select'); setLinkSource(null); }}
            disabled={isDeployed}
            className={`p-2 rounded ${tool === 'select' ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Select"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => { setTool('node'); setLinkSource(null); }}
            disabled={isDeployed}
            className={`p-2 rounded ${tool === 'node' ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isDeployed ? "Cannot add nodes while deployed" : "Add Node"}
          >
            <Circle className="h-5 w-5" />
          </button>
          <button
            onClick={() => { setTool('link'); setLinkSource(null); }}
            disabled={isDeployed}
            className={`p-2 rounded ${tool === 'link' ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isDeployed ? "Cannot add links while deployed" : "Add Link (click two nodes)"}
          >
            <LinkIcon className="h-5 w-5" />
          </button>
          {tool === 'link' && (
            <span className="text-xs text-gray-500 ml-1">
              {linkSource ? 'Click target node' : 'Click source node'}
            </span>
          )}
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() * 1.2)}
            className="p-2 rounded hover:bg-gray-100"
            title="Zoom In"
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            onClick={() => cyInstance.current?.zoom(cyInstance.current.zoom() / 1.2)}
            className="p-2 rounded hover:bg-gray-100"
            title="Zoom Out"
          >
            <ZoomOut className="h-5 w-5" />
          </button>
          <button
            onClick={() => cyInstance.current?.fit()}
            className="p-2 rounded hover:bg-gray-100"
            title="Fit to View"
          >
            <Maximize className="h-5 w-5" />
          </button>
        </div>

        <div className="h-6 w-px bg-gray-200" />

        {/* Chaos Engineering */}
        {id && (
          <button
            onClick={() => setShowChaosPanel(!showChaosPanel)}
            disabled={!isThisTopologyDeployed}
            className={`p-2 rounded flex items-center gap-1 ${showChaosPanel ? 'bg-red-100 text-red-700' : 'hover:bg-gray-100'} disabled:opacity-50 disabled:cursor-not-allowed`}
            title={!isThisTopologyDeployed ? "Deploy this topology first to use Chaos Engineering" : "Chaos Engineering"}
          >
            <Flame className="h-5 w-5" />
            <span className="text-sm">Chaos</span>
          </button>
        )}

        <div className="h-6 w-px bg-gray-200" />

        {/* Deploy/Destroy */}
        {id && isClusterReady && (
          <>
            {!isThisTopologyDeployed ? (
              <button
                onClick={() => deployMutation.mutate()}
                disabled={deployMutation.isPending || nodes.length === 0 || isAnyDeployed}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  isAnyDeployed 
                    ? `Another topology is deployed (${activeDeployment?.topology_id.slice(0, 8)}...). Stop it first.`
                    : nodes.length === 0 
                      ? "Add nodes before deploying" 
                      : "Deploy to Kubernetes"
                }
              >
                {deployMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                <span className="text-sm">Deploy</span>
              </button>
            ) : (
              <button
                onClick={() => destroyMutation.mutate()}
                disabled={destroyMutation.isPending}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                title="Stop and remove deployment"
              >
                {destroyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span className="text-sm">Stop</span>
              </button>
            )}
          </>
        )}

        {/* Deployment Status Badge */}
        {id && deploymentStatus && (
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            deploymentStatus.status === 'running' ? 'bg-green-100 text-green-700' :
            deploymentStatus.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            deploymentStatus.status === 'error' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {deploymentStatus.status === 'running' ? '● Running' :
             deploymentStatus.status === 'pending' ? '◐ Pending' :
             deploymentStatus.status === 'error' ? '✕ Error' :
             '○ Stopped'}
          </div>
        )}

        <div className="h-6 w-px bg-gray-200" />

        {/* Actions */}
        <button
          onClick={handleDeleteSelected}
          disabled={!selectedElement || isDeployed}
          className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={isDeployed ? "Cannot delete while deployed" : "Delete Selected"}
        >
          <Trash2 className="h-5 w-5" />
        </button>

        <div className="flex-1" />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Canvas and properties panel */}
      <div className="flex-1 flex relative">
        {/* Cytoscape canvas */}
        <div ref={cyRef} className="flex-1 bg-gray-50" />

        {/* Chaos Panel */}
        {showChaosPanel && id && (
          <ChaosPanel
            topologyId={id}
            nodes={nodes}
            onClose={() => setShowChaosPanel(false)}
          />
        )}

        {/* Properties panel */}
        <div className="w-72 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <h3 className="font-medium text-gray-900 mb-4">Properties</h3>

          {selectedElement ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Type</label>
                <p className="text-sm font-medium capitalize">{selectedElement.type}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">ID</label>
                <p className="text-sm font-mono text-xs break-all">{selectedElement.data.id}</p>
              </div>
              {selectedElement.type === 'node' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Name</label>
                    <input
                      type="text"
                      value={selectedElement.data.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedElement.data.id ? { ...n, name: newName } : n
                          )
                        );
                        if (cyInstance.current) {
                          cyInstance.current.$(`#${selectedElement.data.id}`).data('name', newName);
                        }
                        setSelectedElement({
                          ...selectedElement,
                          data: { ...selectedElement.data, name: newName },
                        });
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Node Type</label>
                    <select
                      value={nodes.find(n => n.id === selectedElement.data.id)?.type || 'server'}
                      onChange={(e) => {
                        const newType = e.target.value as Node['type'];
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedElement.data.id ? { ...n, type: newType } : n
                          )
                        );
                        // Update node color based on type
                        if (cyInstance.current) {
                          const colors: Record<string, string> = {
                            server: '#0ea5e9',
                            router: '#8b5cf6',
                            client: '#22c55e',
                            custom: '#f59e0b',
                          };
                          cyInstance.current.$(`#${selectedElement.data.id}`).style('background-color', colors[newType] || '#0ea5e9');
                        }
                      }}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="server">Server</option>
                      <option value="router">Router</option>
                      <option value="client">Client</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Container Image</label>
                    <input
                      type="text"
                      value={nodes.find(n => n.id === selectedElement.data.id)?.config.image || ''}
                      onChange={(e) => {
                        const image = e.target.value;
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedElement.data.id ? { ...n, config: { ...n.config, image } } : n
                          )
                        );
                      }}
                      placeholder="nginx:latest"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  {nodeStatuses[selectedElement.data.id] && (
                    <div>
                      <label className="block text-sm text-gray-500 mb-1">K8s Status</label>
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: STATUS_COLORS[nodeStatuses[selectedElement.data.id]] }}
                        />
                        <span className="text-sm font-medium capitalize">
                          {nodeStatuses[selectedElement.data.id]}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {selectedElement.type === 'edge' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Source</label>
                    <p className="text-sm font-mono text-xs">{selectedElement.data.source}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Target</label>
                    <p className="text-sm font-mono text-xs">{selectedElement.data.target}</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Bandwidth</label>
                    <input
                      type="text"
                      value={links.find(l => l.id === selectedElement.data.id)?.properties?.bandwidth || ''}
                      onChange={(e) => {
                        const bandwidth = e.target.value;
                        setLinks((prev) =>
                          prev.map((l) =>
                            l.id === selectedElement.data.id 
                              ? { ...l, properties: { ...l.properties, bandwidth } } 
                              : l
                          )
                        );
                      }}
                      placeholder="100Mbps"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Latency</label>
                    <input
                      type="text"
                      value={links.find(l => l.id === selectedElement.data.id)?.properties?.latency || ''}
                      onChange={(e) => {
                        const latency = e.target.value;
                        setLinks((prev) =>
                          prev.map((l) =>
                            l.id === selectedElement.data.id 
                              ? { ...l, properties: { ...l.properties, latency } } 
                              : l
                          )
                        );
                      }}
                      placeholder="10ms"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Select a node or edge to view properties</p>
          )}

          {/* Description */}
          <div className="mt-6">
            <label className="block text-sm text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
              placeholder="Add a description..."
              disabled={isDeployed}
            />
          </div>
        </div>
      </div>

      {/* Deployment Modal */}
      {deployModal?.show && (
        <DeploymentModal
          action={deployModal.action}
          phase={deployModal.phase}
          message={deployModal.message}
          nodeCount={nodes.length}
          onClose={() => setDeployModal(null)}
        />
      )}
    </div>
  );
}
