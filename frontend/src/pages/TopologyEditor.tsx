import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import cytoscape, { Core } from 'cytoscape';
import { Save, Trash2, Circle, ArrowRight, Link as LinkIcon, ZoomIn, ZoomOut, Maximize, Play, Square, Loader2 } from 'lucide-react';
import { topologyApi, clusterApi, deploymentApi, chaosApi, diagnosticApi, Topology, Node, Link, ContainerInfo } from '../services/api';
import { ChaosPanel } from '../components/ChaosPanel';
import { NodePropertiesModal } from '../components/NodePropertiesModal';
import { DeploymentModal, DeploymentAction, DeploymentPhase } from '../components/DeploymentModal';
import { ApplicationsPanel } from '../components/ApplicationsPanel';
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
    // Estado para el modal de propiedades de nodo
    const [nodeModal, setNodeModal] = useState<{ open: boolean; node: any } | null>(null);
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
  const [_nodeStatuses, setNodeStatuses] = useState<Record<string, NodeStatus>>({});
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

  // Active chaos conditions (this topology)
  const { data: chaosConditions } = useQuery({
    queryKey: ['chaos-conditions', id],
    queryFn: () => chaosApi.list(id!),
    enabled: !isNewTopology && clusterStatus?.connected,
    refetchInterval: 3000,
  });

  // Check if THIS topology is deployed
  const isThisTopologyDeployed = deploymentStatus?.status === 'running' || deploymentStatus?.status === 'pending' || deploymentStatus?.status === 'deploying';

  // Node containers (when a node is selected and topology is deployed)
  const { data: _selectedNodeContainers }: { data?: ContainerInfo[] } = useQuery({
    queryKey: ['node-containers', id, selectedElement?.data?.id],
    queryFn: () => diagnosticApi.getNodeContainers(id!, selectedElement.data.id),
    enabled: !isNewTopology && selectedElement?.type === 'node' && isThisTopologyDeployed && clusterStatus?.connected,
    refetchInterval: 5000,
  });

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
      queryClient.invalidateQueries({ queryKey: ['applications', id] });
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
      queryClient.invalidateQueries({ queryKey: ['applications', id] });
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
        // Chaos condition styles
        {
          selector: 'edge.chaos-delay',
          style: {
            'line-color': '#f59e0b', // amber
            'width': 4,
            'target-arrow-color': '#f59e0b',
            'label': '⏱️',
            'font-size': 14,
            'text-background-color': '#f59e0b',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-loss',
          style: {
            'line-color': '#ef4444', // red
            'width': 4,
            'target-arrow-color': '#ef4444',
            'line-style': 'dashed',
            'label': '📉',
            'font-size': 14,
            'text-background-color': '#ef4444',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-bandwidth',
          style: {
            'line-color': '#8b5cf6', // violet
            'width': 4,
            'target-arrow-color': '#8b5cf6',
            'label': '📊',
            'font-size': 14,
            'text-background-color': '#8b5cf6',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-corrupt',
          style: {
            'line-color': '#f97316', // orange
            'width': 4,
            'target-arrow-color': '#f97316',
            'line-style': 'dotted',
            'label': '🔧',
            'font-size': 14,
            'text-background-color': '#f97316',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-duplicate',
          style: {
            'line-color': '#06b6d4', // cyan
            'width': 4,
            'target-arrow-color': '#06b6d4',
            'label': '📋',
            'font-size': 14,
            'text-background-color': '#06b6d4',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-partition',
          style: {
            'line-color': '#dc2626', // red-600
            'width': 6,
            'target-arrow-color': '#dc2626',
            'line-style': 'dashed',
            'label': '🚫',
            'font-size': 16,
            'text-background-color': '#dc2626',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -12,
          },
        },
        {
          selector: 'edge.chaos-multiple',
          style: {
            'line-color': '#7c3aed', // purple-600
            'width': 5,
            'target-arrow-color': '#7c3aed',
            'line-style': 'solid',
            'font-size': 12,
            'text-background-color': '#7c3aed',
            'text-background-opacity': 0.9,
            'text-background-padding': '2px',
            'text-margin-y': -8,
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
        // Click on empty canvas clears link source and selection
        setLinkSource(null);
        setSelectedElement(null);
      }
    });

    // Handle node clicks for link creation
    cy.on('tap', 'node', (event) => {
      const node = event.target;
      if (toolRef.current === 'link') {
        const prevSource = linkSourceRef.current;
        if (prevSource === null) {
          node.addClass('link-source');
          setLinkSource(node.id());
        } else if (prevSource !== node.id()) {
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
          cy.$('.link-source').removeClass('link-source');
          setLinks((prev) => [...prev, newLink]);
          setLinkSource(null);
        }
        return;
      }
      setSelectedElement({
        type: 'node',
        data: node.data(),
      });
    });

    // Doble click en nodo: abrir modal de propiedades
    cy.on('dbltap', 'node', (event) => {
      const node = event.target;
      setNodeModal({ open: true, node: { ...node, data: node.data() } });
    });
      {/* Modal de propiedades de nodo */}
      <NodePropertiesModal
        open={!!nodeModal?.open}
        node={nodeModal?.node}
        onClose={() => setNodeModal(null)}
        onChange={newNode => {
          // Actualizar nombre en el grafo y en el estado
          if (cyInstance.current && newNode?.data?.id) {
            cyInstance.current.$(`#${newNode.data.id}`).data('name', newNode.data.name);
          }
          setNodes(prev => prev.map(n => n.id === newNode.data.id ? { ...n, name: newNode.data.name } : n));
          setNodeModal(modal => modal ? { ...modal, node: newNode } : null);
          // Actualizar selectedElement si es el nodo seleccionado
          if (selectedElement?.type === 'node' && selectedElement.data.id === newNode.data.id) {
            setSelectedElement({
              type: 'node',
              data: { id: newNode.data.id, name: newNode.data.name }
            });
          }
        }}
      />

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

  // Function to update edge styles based on active chaos conditions
  const updateEdgeChaosStyles = useCallback(() => {
    if (!cyInstance.current || !chaosConditions) return;

    const cy = cyInstance.current;

    // Clear all chaos classes from edges
    cy.edges().removeClass('chaos-delay chaos-loss chaos-bandwidth chaos-corrupt chaos-duplicate chaos-partition chaos-multiple');

    // Collect all conditions affecting each edge
    const edgeConditions = new Map<string, string[]>();

    chaosConditions
      .filter(condition => condition.status === 'active')
      .forEach(condition => {
        const chaosType = condition.chaos_type;

        if (condition.target_node_id) {
          // Condition targets a specific node pair
          const sourceNode = condition.source_node_id;
          const targetNode = condition.target_node_id;

          // Find edges between these nodes (in both directions)
          const edges = cy.edges().filter(edge => {
            const source = edge.data('source');
            const target = edge.data('target');
            return (source === sourceNode && target === targetNode) ||
                   (source === targetNode && target === sourceNode);
          });

          edges.forEach(edge => {
            const edgeId = edge.id();
            if (!edgeConditions.has(edgeId)) {
              edgeConditions.set(edgeId, []);
            }
            edgeConditions.get(edgeId)!.push(chaosType);
          });
        } else {
          // Condition affects all traffic from source node
          const sourceNode = condition.source_node_id;

          // Find all edges from this source node
          const edges = cy.edges().filter(edge => edge.data('source') === sourceNode);
          edges.forEach(edge => {
            const edgeId = edge.id();
            if (!edgeConditions.has(edgeId)) {
              edgeConditions.set(edgeId, []);
            }
            edgeConditions.get(edgeId)!.push(chaosType);
          });
        }
      });

    // Apply appropriate classes based on conditions
    edgeConditions.forEach((types, edgeId) => {
      const edge = cy.$(`#${edgeId}`);
      if (edge.length === 0) return;

      if (types.length === 1) {
        // Single condition - apply specific class
        edge.addClass(`chaos-${types[0]}`);
      } else if (types.length > 1) {
        // Multiple conditions - create combined label
        const icons = types.map(type => {
          const iconMap: Record<string, string> = {
            'delay': '⏱️',
            'loss': '📉',
            'bandwidth': '📊',
            'corrupt': '🔧',
            'duplicate': '📋',
            'partition': '🚫'
          };
          return iconMap[type] || '❓';
        }).join('');

        // Apply multiple class and set custom label
        edge.addClass('chaos-multiple');
        edge.style('label', icons);
      }
    });
  }, [chaosConditions]);

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

  // Update edge chaos styles when conditions change
  useEffect(() => {
    updateEdgeChaosStyles();
  }, [updateEdgeChaosStyles]);

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

        {/* Deploy/Destroy */}
        {id && isClusterReady && (
          <>
            <button
              onClick={() => !isThisTopologyDeployed && !isAnyDeployed && deployMutation.mutate()}
              disabled={deployMutation.isPending || nodes.length === 0 || isThisTopologyDeployed || isAnyDeployed}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={
                isThisTopologyDeployed
                  ? "Topology is already deployed. Stop it first to redeploy."
                  : isAnyDeployed 
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

            {isThisTopologyDeployed && (
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
            deploymentStatus.status === 'deploying' ? 'bg-blue-100 text-blue-700' :
            deploymentStatus.status === 'error' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {deploymentStatus.status === 'running' ? '● Running' :
             deploymentStatus.status === 'pending' ? '◐ Pending' :
             deploymentStatus.status === 'deploying' ? '⟳ Deploying' :
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

      {/* Canvas y Chaos Panel en el centro */}
      <div className="flex-1 flex">
        {/* Left Panel - Applications */}
        {id && (
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
            <ApplicationsPanel
              topologyId={id}
              nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
              selectedNode={selectedElement?.type === 'node' ? { id: selectedElement.data.id, name: selectedElement.data.name } : null}
              isTopologyDeployed={isThisTopologyDeployed}
            />
          </div>
        )}

        {/* Cytoscape canvas - columna principal */}
        <div ref={cyRef} className="flex-1 bg-gray-50" />

        {/* Right Panel - Chaos */}
        {id && (
          <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
            <ChaosPanel
              topologyId={id}
              nodes={nodes}
              links={links}
              onClose={() => {}} // No close button, always visible
            />
          </div>
        )}
      </div>

      {/* Modal de propiedades de nodo (siempre fuera de cualquier callback) */}
      <NodePropertiesModal
        open={!!nodeModal?.open}
        node={nodeModal?.node}
        onClose={() => setNodeModal(null)}
        onChange={newNode => {
          if (cyInstance.current && newNode?.data?.id) {
            cyInstance.current.$(`#${newNode.data.id}`).data('name', newNode.data.name);
          }
          setNodes(prev => prev.map(n => n.id === newNode.data.id ? { ...n, name: newNode.data.name } : n));
          setNodeModal(modal => modal ? { ...modal, node: newNode } : null);
        }}
      />

      {/* Chaos Legend Panel - horizontal distribution */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex flex-wrap gap-6 justify-center">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-yellow-600 text-lg">⏱️</span>
            <span className="text-gray-700">Delay</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-red-500 text-lg">📉</span>
            <span className="text-gray-700">Packet Loss</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-purple-600 text-lg">📊</span>
            <span className="text-gray-700">Bandwidth</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-orange-600 text-lg">🔧</span>
            <span className="text-gray-700">Corrupt</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-cyan-600 text-lg">📋</span>
            <span className="text-gray-700">Duplicate</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-red-700 text-lg">🚫</span>
            <span className="text-gray-700">Partition</span>
          </div>
        </div>
      </div>

      {/* Panel de propiedades eliminado. Ahora se usará un modal al hacer doble click en un nodo. */}

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
