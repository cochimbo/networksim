import { useCallback, useEffect, useRef, useState } from 'react';
import { ResizablePanel } from '../components/ResizablePanel';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import cytoscape, { Core } from 'cytoscape';
import {
  Save, Trash2, Circle, ArrowRight, Link as LinkIcon, ZoomIn, ZoomOut, Maximize,
  Play, Square, Loader2, Zap, Bookmark, Activity, TestTube, Grid3X3,
  ChevronUp, ChevronDown, Clock, Film, BarChart3, FileDown, LayoutTemplate
} from 'lucide-react';
import { topologyApi, clusterApi, deploymentApi, chaosApi, diagnosticApi, Topology, Node, Link, ContainerInfo } from '../services/api';
import { ChaosPanel } from '../components/ChaosPanel';
import { NodePropertiesModal } from '../components/NodePropertiesModal';
import { DeploymentModal, DeploymentAction, DeploymentPhase } from '../components/DeploymentModal';
import { ApplicationsPanel } from '../components/ApplicationsPanel';
import { useWebSocketEvents, WebSocketEvent } from '../contexts/WebSocketContext';
import { useToast } from '../components/Toast';

// New components
import { TabPanel, useTabs } from '../components/TabPanel';
import ChaosPresets from '../components/ChaosPresets';
import LiveMetrics from '../components/LiveMetrics';
import TestRunner from '../components/TestRunner';
import EventTimeline from '../components/EventTimeline';
import NetworkMatrix from '../components/NetworkMatrix';
import ExportImport from '../components/ExportImport';
import ChaosScenarios from '../components/ChaosScenarios';
import MetricsComparison from '../components/MetricsComparison';
import ImpactDashboard from '../components/ImpactDashboard';
import AppToAppTest from '../components/AppToAppTest';
import { TemplateSelector } from '../components/TemplateSelector';
import { ExportReport } from '../components/ExportReport';
import { applicationsApi, GeneratedTopology } from '../services/api';

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
  // Panel widths for resizable panels
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(380);
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

  // Toast notifications
  const toast = useToast();

  // Template selector and export report modals
  const [showTemplateSelector, setShowTemplateSelector] = useState(!id); // Show on new topology
  const [showExportReport, setShowExportReport] = useState(false);

  // New state for tabs and bottom panel
  const { activeTab: rightTab, setActiveTab: setRightTab } = useTabs('chaos');
  const { activeTab: leftTab, setActiveTab: setLeftTab } = useTabs('apps');
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelTab, setBottomPanelTab] = useState<'metrics' | 'events' | 'comparison'>('metrics');

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    nodeId: string;
    nodeName: string;
    apps: { name: string; status: string }[];
    chaosConditions: { type: string; status: string }[];
    nodeStatus: string;
  } | null>(null);

  // Edge context menu state
  const [edgeContextMenu, setEdgeContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    sourceId: string;
    targetId: string;
    sourceName: string;
    targetName: string;
    activeChaos: { id: string; type: string; status: string }[];
  } | null>(null);

  // Refs to access current values in event handlers
  const toolRef = useRef(tool);
  const nodesRef = useRef(nodes);
  const linkSourceRef = useRef(linkSource);
  const applicationsRef = useRef<any[]>([]);
  const chaosConditionsRef = useRef<any[]>([]);

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

    // Handle app events - refetch applications list
    if ((event.type === 'app:deployed' || event.type === 'app:uninstalled' || event.type === 'app:status_changed') &&
        event.data.topology_id === id) {
      queryClient.invalidateQueries({ queryKey: ['applications', id] });

      if (event.type === 'app:deployed') {
        toast.success(`App deployed: ${event.data.image || 'Unknown'}`);
      } else if (event.type === 'app:uninstalled') {
        toast.info('App uninstalled');
      }
    }
  }, [id, queryClient, toast]);

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
      toast.success('Topology saved successfully');
      if (isNewTopology) {
        navigate(`/topologies/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to save topology');
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

  // Applications in this topology
  const { data: applications = [] } = useQuery({
    queryKey: ['applications', id],
    queryFn: () => applicationsApi.listByTopology(id!),
    enabled: !isNewTopology,
    refetchInterval: 5000,
  });

  // Sync refs for applications and chaosConditions (for event handlers)
  useEffect(() => { applicationsRef.current = applications; }, [applications]);
  useEffect(() => { chaosConditionsRef.current = chaosConditions || []; }, [chaosConditions]);

  // Check if THIS topology is deployed
  const isThisTopologyDeployed = deploymentStatus?.status === 'running' || deploymentStatus?.status === 'pending' || deploymentStatus?.status === 'deploying';

  // Node containers (when a node is selected and topology is deployed)
  const { data: _selectedNodeContainers }: { data?: ContainerInfo[] } = useQuery({
    queryKey: ['node-containers', id, selectedElement?.data?.id],
    queryFn: () => diagnosticApi.getNodeContainers(id!, selectedElement.data.id),
    enabled: !isNewTopology && selectedElement?.type === 'node' && isThisTopologyDeployed && clusterStatus?.connected,
    refetchInterval: 5000,
  });

  // Check if ANY topology is deployed (for deploy button blocking)
  const isAnyDeployed = activeDeployment !== null && activeDeployment !== undefined;
  // For UI blocking purposes - only block if THIS topology is deployed
  const isDeployed = isThisTopologyDeployed;
  const isClusterReady = clusterStatus?.connected ?? false;

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: () => topologyApi.deploy(id!),
    onMutate: () => {
      setDeployModal({ show: true, action: 'deploy', phase: 'starting' });
    },
    onSuccess: () => {
      setDeployModal({ show: true, action: 'deploy', phase: 'success' });
      toast.success('Topology deployed successfully');
      refetchDeployment();
      queryClient.invalidateQueries({ queryKey: ['deployment-status', id] });
      queryClient.invalidateQueries({ queryKey: ['applications', id] });
      queryClient.invalidateQueries({ queryKey: ['active-deployment'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error.message || 'Deploy failed');
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
      toast.success('Topology stopped successfully');
      refetchDeployment();
      queryClient.invalidateQueries({ queryKey: ['deployment-status', id] });
      queryClient.invalidateQueries({ queryKey: ['applications', id] });
      queryClient.invalidateQueries({ queryKey: ['active-deployment'] });
      setNodeStatuses({});
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error.message || 'Stop failed');
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
          selector: 'node[appCount]',
          style: {
            'border-width': 3,
            'border-color': '#22c55e',
            'border-style': 'solid',
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
            'line-color': '#f59e0b',
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
            'line-color': '#ef4444',
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
            'line-color': '#8b5cf6',
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
            'line-color': '#f97316',
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
            'line-color': '#06b6d4',
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
            'line-color': '#dc2626',
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
        // New chaos type styles
        {
          selector: 'edge.chaos-stress-cpu',
          style: {
            'line-color': '#ec4899',
            'width': 4,
            'target-arrow-color': '#ec4899',
            'label': '💻',
            'font-size': 14,
            'text-background-color': '#ec4899',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-pod-kill',
          style: {
            'line-color': '#b91c1c',
            'width': 5,
            'target-arrow-color': '#b91c1c',
            'line-style': 'dashed',
            'label': '💀',
            'font-size': 14,
            'text-background-color': '#b91c1c',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-io-delay',
          style: {
            'line-color': '#6366f1',
            'width': 4,
            'target-arrow-color': '#6366f1',
            'label': '💾',
            'font-size': 14,
            'text-background-color': '#6366f1',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-http-abort',
          style: {
            'line-color': '#10b981',
            'width': 4,
            'target-arrow-color': '#10b981',
            'label': '🌐',
            'font-size': 14,
            'text-background-color': '#10b981',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px',
            'text-margin-y': -10,
          },
        },
        {
          selector: 'edge.chaos-multiple',
          style: {
            'line-color': '#7c3aed',
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
        // Test result edges
        {
          selector: 'edge.test-success',
          style: {
            'line-color': '#22c55e',
            'width': 3,
            'line-style': 'dashed',
            'target-arrow-color': '#22c55e',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': 11,
            'color': '#22c55e',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '3px',
            'text-margin-y': -12,
            'z-index': 1000,
          },
        },
        {
          selector: 'edge.test-failure',
          style: {
            'line-color': '#ef4444',
            'width': 3,
            'line-style': 'dashed',
            'target-arrow-color': '#ef4444',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': 11,
            'color': '#ef4444',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.9,
            'text-background-padding': '3px',
            'text-margin-y': -12,
            'z-index': 1000,
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
      } else if (event.target === cy) {
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

    // Node tooltip on mouseover
    cy.on('mouseover', 'node', (event) => {
      const node = event.target;
      const nodeId = node.id();
      const nodeName = node.data('name') || nodeId;
      const containerRect = container.getBoundingClientRect();
      const renderedPos = node.renderedPosition();

      // Get apps deployed on this node
      const nodeApps = (applicationsRef.current || [])
        .filter((app: any) => app.node_selector?.includes(nodeId))
        .map((app: any) => ({
          name: app.image_name?.split('/').pop()?.split(':')[0] || app.image_name || 'Unknown',
          status: app.status || 'unknown',
        }));

      // Get chaos conditions affecting this node
      const nodeChaos = (chaosConditionsRef.current || [])
        .filter((c: any) => c.source_node_id === nodeId || c.target_node_id === nodeId)
        .filter((c: any) => c.status === 'active')
        .map((c: any) => ({
          type: c.chaos_type,
          status: c.status,
        }));

      // Get node status from data
      const nodeStatus = node.data('status') || 'unknown';

      setTooltip({
        visible: true,
        x: containerRect.left + renderedPos.x + 20,
        y: containerRect.top + renderedPos.y - 10,
        nodeId,
        nodeName,
        apps: nodeApps,
        chaosConditions: nodeChaos,
        nodeStatus,
      });
    });

    cy.on('mouseout', 'node', () => {
      setTooltip(null);
    });

    // Edge context menu on right-click
    cy.on('cxttap', 'edge', (event) => {
      event.originalEvent.preventDefault();
      const edge = event.target;
      const sourceId = edge.data('source');
      const targetId = edge.data('target');
      const containerRect = container.getBoundingClientRect();
      const renderedPos = edge.renderedMidpoint();

      // Get source and target node names
      const sourceNode = cy.$(`#${sourceId}`);
      const targetNode = cy.$(`#${targetId}`);
      const sourceName = sourceNode.data('name') || sourceId;
      const targetName = targetNode.data('name') || targetId;

      // Get active chaos conditions on this edge
      const edgeChaos = (chaosConditionsRef.current || [])
        .filter((c: any) =>
          (c.source_node_id === sourceId && (!c.target_node_id || c.target_node_id === targetId)) ||
          (c.source_node_id === targetId && (!c.target_node_id || c.target_node_id === sourceId))
        )
        .map((c: any) => ({
          id: c.id,
          type: c.chaos_type,
          status: c.status,
        }));

      setEdgeContextMenu({
        visible: true,
        x: containerRect.left + renderedPos.x,
        y: containerRect.top + renderedPos.y,
        sourceId,
        targetId,
        sourceName,
        targetName,
        activeChaos: edgeChaos,
      });
    });

    // Close context menu on click elsewhere
    cy.on('tap', () => {
      setEdgeContextMenu(null);
    });

    setCyReady(true);
  }, []);

  // Function to update edge styles based on active chaos conditions
  const updateEdgeChaosStyles = useCallback(() => {
    if (!cyInstance.current || !chaosConditions) return;

    const cy = cyInstance.current;

    // Clear all chaos classes from edges
    cy.edges().removeClass('chaos-delay chaos-loss chaos-bandwidth chaos-corrupt chaos-duplicate chaos-partition chaos-stress-cpu chaos-pod-kill chaos-io-delay chaos-http-abort chaos-multiple');

    // Collect all conditions affecting each edge
    const edgeConditions = new Map<string, string[]>();

    chaosConditions
      .filter(condition => condition.status === 'active')
      .forEach(condition => {
        const chaosType = condition.chaos_type;

        if (condition.target_node_id) {
          const sourceNode = condition.source_node_id;
          const targetNode = condition.target_node_id;

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
          const sourceNode = condition.source_node_id;
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
        edge.addClass(`chaos-${types[0]}`);
      } else if (types.length > 1) {
        const icons = types.map(type => {
          const iconMap: Record<string, string> = {
            'delay': '⏱️',
            'loss': '📉',
            'bandwidth': '📊',
            'corrupt': '🔧',
            'duplicate': '📋',
            'partition': '🚫',
            'stress-cpu': '💻',
            'pod-kill': '💀',
            'io-delay': '💾',
            'http-abort': '🌐'
          };
          return iconMap[type] || '❓';
        }).join('');

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

      topology.nodes.forEach((node) => {
        cy.add({
          group: 'nodes',
          data: { id: node.id, name: node.name },
          position: { x: node.position.x, y: node.position.y },
        });
      });

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

  // Update node styles based on apps
  useEffect(() => {
    if (!cyInstance.current || !applications) return;

    const cy = cyInstance.current;

    // Reset all node badges
    cy.nodes().forEach(node => {
      const nodeId = node.id();
      const nodeApps = applications.filter((app: any) =>
        app.node_selector.includes(nodeId) && app.status === 'deployed'
      );

      if (nodeApps.length > 0) {
        // Node has apps - show badge
        node.style({
          'border-width': 3,
          'border-color': '#22c55e', // green
          'border-style': 'solid',
        });
        // Add app count as secondary label
        const appCount = nodeApps.length;
        node.data('appCount', appCount);
      } else {
        // Reset style (only if not selected)
        if (!node.selected()) {
          node.style({
            'border-width': 0,
          });
        }
        node.removeData('appCount');
      }
    });
  }, [applications, cyReady]);

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
      const nodeId = selectedElement.data.id;
      cy.$(`#${nodeId}`).remove();
      setNodes((prev) => prev.filter((n) => n.id !== nodeId));
      setLinks((prev) => prev.filter((l) => l.source !== nodeId && l.target !== nodeId));
    } else {
      const edgeId = selectedElement.data.id;
      cy.$(`#${edgeId}`).remove();
      setLinks((prev) => prev.filter((l) => l.id !== edgeId));
    }

    setSelectedElement(null);
  };

  // Handle preset application - refresh chaos conditions
  const handlePresetApplied = () => {
    queryClient.invalidateQueries({ queryKey: ['chaos-conditions', id] });
    toast.success('Preset applied successfully');
  };

  // Apply quick chaos from edge context menu
  const handleQuickChaos = async (chaosType: string, sourceId: string, targetId: string) => {
    if (!id) return;

    const defaultParams: Record<string, any> = {
      delay: { latency: '100ms', jitter: '20ms' },
      loss: { loss: '10' },
      bandwidth: { rate: '1mbps', buffer: 10000, limit: 10000 },
      corrupt: { corrupt: '5' },
      duplicate: { duplicate: '5' },
      partition: {},
    };

    try {
      await chaosApi.create({
        topology_id: id,
        source_node_id: sourceId,
        target_node_id: targetId,
        chaos_type: chaosType as any,
        direction: 'to',
        params: defaultParams[chaosType] || {},
      });

      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', id] });
      toast.success(`${chaosType} chaos applied`);
      setEdgeContextMenu(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to apply chaos');
    }
  };

  // Stop chaos condition from edge context menu
  const handleStopChaos = async (conditionId: string) => {
    if (!id) return;

    try {
      await chaosApi.stop(id, conditionId);
      queryClient.invalidateQueries({ queryKey: ['chaos-conditions', id] });
      toast.success('Chaos stopped');
      setEdgeContextMenu(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to stop chaos');
    }
  };

  // Handle app-to-app test result - draw temporary edge on graph
  const handleAppTestResult = useCallback((result: {
    from_app: { node_id: string; app_name: string };
    to_app: { node_id: string; app_name: string };
    success: boolean;
    latency_ms: number | null;
  }) => {
    if (!cyInstance.current) return;

    const cy = cyInstance.current;
    const edgeId = `test-${Date.now()}`;
    const sourceNodeId = result.from_app.node_id;
    const targetNodeId = result.to_app.node_id;

    // Create label with latency
    const label = result.latency_ms != null
      ? `${result.latency_ms.toFixed(1)}ms`
      : result.success ? '✓' : '✗';

    // Add temporary edge
    cy.add({
      group: 'edges',
      data: {
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        label: label,
      },
      classes: result.success ? 'test-success' : 'test-failure',
    });

    // Show toast notification
    if (result.success) {
      toast.success(`Test passed: ${result.from_app.app_name} → ${result.to_app.app_name} (${label})`);
    } else {
      toast.error(`Test failed: ${result.from_app.app_name} → ${result.to_app.app_name}`);
    }

    // Remove edge after 10 seconds
    setTimeout(() => {
      if (cyInstance.current) {
        const edge = cyInstance.current.$(`#${edgeId}`);
        if (edge.length > 0) {
          edge.remove();
        }
      }
    }, 10000);
  }, [toast]);

  // Handle topology import
  const handleImport = (data: any) => {
    if (data.topology) {
      setName(data.topology.name || 'Imported Topology');
      setDescription(data.topology.description || '');

      const importedNodes = data.topology.nodes || [];
      const importedLinks = data.topology.links || [];

      setNodes(importedNodes);
      setLinks(importedLinks);

      // Update cytoscape
      if (cyInstance.current) {
        const cy = cyInstance.current;
        cy.elements().remove();

        importedNodes.forEach((node: Node) => {
          cy.add({
            group: 'nodes',
            data: { id: node.id, name: node.name },
            position: { x: node.position.x, y: node.position.y },
          });
        });

        importedLinks.forEach((link: Link) => {
          cy.add({
            group: 'edges',
            data: { id: link.id, source: link.source, target: link.target },
          });
        });

        cy.fit();
      }

      toast.success(`Imported topology with ${importedNodes.length} nodes`);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (generated: GeneratedTopology) => {
    setName(generated.name);
    setDescription(generated.description);
    setNodes(generated.nodes);
    setLinks(generated.links);

    // Update cytoscape
    if (cyInstance.current) {
      const cy = cyInstance.current;
      cy.elements().remove();

      generated.nodes.forEach((node: Node) => {
        cy.add({
          group: 'nodes',
          data: { id: node.id, name: node.name },
          position: { x: node.position.x, y: node.position.y },
        });
      });

      generated.links.forEach((link: Link) => {
        cy.add({
          group: 'edges',
          data: { id: link.id, source: link.source, target: link.target },
        });
      });

      cy.fit();
    }

    setShowTemplateSelector(false);
    if (generated.nodes.length > 0) {
      toast.success(`Created topology from template with ${generated.nodes.length} nodes`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Chaos conditions count for badge
  const activeChaosCount = chaosConditions?.filter(c => c.status === 'active').length || 0;

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-4">
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

        {/* Bottom Panel Toggle */}
        {id && isThisTopologyDeployed && (
          <button
            onClick={() => setBottomPanelOpen(!bottomPanelOpen)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              bottomPanelOpen ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-100 text-gray-600'
            }`}
            title="Toggle metrics panel"
          >
            <Activity className="h-4 w-4" />
            <span>Metrics</span>
            {bottomPanelOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        )}

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

        {/* Export/Import */}
        <ExportImport
          topology={{ name, description, nodes, links }}
          chaosConditions={chaosConditions}
          onImport={handleImport}
        />

        {/* Template button - only for new topologies */}
        {!id && (
          <button
            onClick={() => setShowTemplateSelector(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Choose from template"
          >
            <LayoutTemplate className="h-4 w-4" />
            <span className="text-sm">Template</span>
          </button>
        )}

        {/* Export Report button - only for existing topologies */}
        {id && (
          <button
            onClick={() => setShowExportReport(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Export report"
          >
            <FileDown className="h-4 w-4" />
            <span className="text-sm">Report</span>
          </button>
        )}

        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

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

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Canvas y Panels */}
        <div className="flex-1 flex min-h-0">
          {/* Left Panel - Applications & Network */}
          {id && (
            <ResizablePanel minWidth={220} maxWidth={600} defaultWidth={leftPanelWidth} side="left" key="left"
              // @ts-ignore
              setWidth={setLeftPanelWidth}
            >
              <div className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full">
                <TabPanel
                  tabs={[
                    { id: 'apps', label: 'Apps', icon: <Circle size={14} /> },
                    { id: 'impact', label: 'Impact', icon: <Activity size={14} />, badge: (chaosConditions?.filter(c => c.status === 'active').length || 0) > 0 ? (chaosConditions?.filter(c => c.status === 'active').length || 0) : undefined, badgeColor: 'warning' as const },
                    { id: 'network', label: 'Network', icon: <Grid3X3 size={14} /> },
                  ]}
                  activeTab={leftTab}
                  onTabChange={setLeftTab}
                >
                  {leftTab === 'apps' && (
                    <ApplicationsPanel
                      topologyId={id}
                      nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
                      selectedNode={selectedElement?.type === 'node' ? { id: selectedElement.data.id, name: selectedElement.data.name } : null}
                      isTopologyDeployed={isThisTopologyDeployed}
                    />
                  )}
                  {leftTab === 'impact' && (
                    <ImpactDashboard
                      topologyId={id}
                      nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
                      isDeployed={isThisTopologyDeployed}
                    />
                  )}
                  {leftTab === 'network' && (
                    <NetworkMatrix
                      topologyId={id}
                      nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
                      onNodeSelect={(nodeId) => {
                        if (cyInstance.current) {
                          const node = cyInstance.current.$(`#${nodeId}`);
                          if (node.length > 0) {
                            cyInstance.current.nodes().unselect();
                            node.select();
                            setSelectedElement({ type: 'node', data: { id: nodeId, name: node.data('name') } });
                          }
                        }
                      }}
                    />
                  )}
                </TabPanel>
              </div>
            </ResizablePanel>
          )}

          {/* Cytoscape canvas - main area */}
          <div
            ref={cyRef}
            className="bg-gray-50 min-h-0"
            style={{ flex: '1 1 0%', minWidth: 0, width: `calc(100% - ${leftPanelWidth + rightPanelWidth}px)` }}
          />

          {/* Right Panel - Chaos, Presets, Scenarios, Tests */}
          {id && (
            <ResizablePanel minWidth={260} maxWidth={700} defaultWidth={rightPanelWidth} side="right" key="right"
              // @ts-ignore
              setWidth={setRightPanelWidth}
            >
              <div className="bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col h-full">
                <TabPanel
                  tabs={[
                    {
                      id: 'chaos',
                      label: 'Chaos',
                      icon: <Zap size={14} />,
                      badge: activeChaosCount > 0 ? activeChaosCount : undefined,
                      badgeColor: 'warning'
                    },
                    { id: 'presets', label: 'Presets', icon: <Bookmark size={14} /> },
                    { id: 'scenarios', label: 'Scenarios', icon: <Film size={14} /> },
                    { id: 'tests', label: 'Tests', icon: <TestTube size={14} /> },
                  ]}
                  activeTab={rightTab}
                  onTabChange={setRightTab}
                >
                  {rightTab === 'chaos' && (
                    <ChaosPanel
                      topologyId={id}
                      nodes={nodes}
                      links={links}
                      applications={applications}
                      onClose={() => {}}
                    />
                  )}
                  {rightTab === 'presets' && (
                    <ChaosPresets
                      topologyId={id}
                      selectedSourceNode={selectedElement?.type === 'node' ? selectedElement.data.id : undefined}
                      selectedTargetNode={undefined}
                      onApply={handlePresetApplied}
                    />
                  )}
                  {rightTab === 'scenarios' && (
                    <ChaosScenarios
                      topologyId={id}
                      nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
                    />
                  )}
                  {rightTab === 'tests' && (
                    <div className="h-full overflow-auto p-4 space-y-4">
                      <AppToAppTest
                        topologyId={id}
                        applications={applications}
                        nodes={nodes.map(n => ({ id: n.id, name: n.name }))}
                        onTestComplete={handleAppTestResult}
                      />
                      <TestRunner
                        topologyId={id}
                        onTestComplete={() => {
                          queryClient.invalidateQueries({ queryKey: ['chaos-conditions', id] });
                        }}
                      />
                    </div>
                  )}
                </TabPanel>
              </div>
            </ResizablePanel>
          )}
        </div>

        {/* Bottom Panel - Metrics, Events, Comparison (collapsible) */}
        {id && isThisTopologyDeployed && bottomPanelOpen && (
          <div className="h-72 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex flex-col">
            {/* Bottom Panel Tabs */}
            <div className="flex items-center border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-2">
              <button
                onClick={() => setBottomPanelTab('metrics')}
                className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  bottomPanelTab === 'metrics'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Activity size={14} />
                Live Metrics
              </button>
              <button
                onClick={() => setBottomPanelTab('events')}
                className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  bottomPanelTab === 'events'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Clock size={14} />
                Events
              </button>
              <button
                onClick={() => setBottomPanelTab('comparison')}
                className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 transition-colors ${
                  bottomPanelTab === 'comparison'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <BarChart3 size={14} />
                Compare
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setBottomPanelOpen(false)}
                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Bottom Panel Content */}
            <div className="flex-1 overflow-hidden">
              {bottomPanelTab === 'metrics' && (
                <div className="h-full p-2">
                  <LiveMetrics topologyId={id} refreshInterval={5000} chaosConditions={chaosConditions} />
                </div>
              )}
              {bottomPanelTab === 'events' && (
                <EventTimeline topologyId={id} maxEvents={50} compact />
              )}
              {bottomPanelTab === 'comparison' && (
                <MetricsComparison topologyId={id} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Chaos Legend Panel - horizontal */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3">
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Network chaos */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-yellow-600 text-lg">⏱️</span>
            <span className="text-gray-700 dark:text-gray-300">Delay</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-red-500 text-lg">📉</span>
            <span className="text-gray-700 dark:text-gray-300">Loss</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-purple-600 text-lg">📊</span>
            <span className="text-gray-700 dark:text-gray-300">Bandwidth</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-orange-600 text-lg">🔧</span>
            <span className="text-gray-700 dark:text-gray-300">Corrupt</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-cyan-600 text-lg">📋</span>
            <span className="text-gray-700 dark:text-gray-300">Duplicate</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-red-700 text-lg">🚫</span>
            <span className="text-gray-700 dark:text-gray-300">Partition</span>
          </div>
          {/* New chaos types */}
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-pink-500 text-lg">💻</span>
            <span className="text-gray-700 dark:text-gray-300">CPU Stress</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-red-800 text-lg">💀</span>
            <span className="text-gray-700 dark:text-gray-300">Pod Kill</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-indigo-500 text-lg">💾</span>
            <span className="text-gray-700 dark:text-gray-300">I/O Delay</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-emerald-500 text-lg">🌐</span>
            <span className="text-gray-700 dark:text-gray-300">HTTP Abort</span>
          </div>
        </div>
      </div>

      {/* Node Properties Modal */}
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

      {/* Node Tooltip */}
      {tooltip && tooltip.visible && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)',
          }}
        >
          <div className="font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <Circle className="h-3 w-3 text-primary-500" />
            {tooltip.nodeName}
          </div>

          {/* Apps */}
          {tooltip.apps.length > 0 ? (
            <div className="mb-2">
              <div className="text-xs font-medium text-gray-500 mb-1">Apps ({tooltip.apps.length})</div>
              <div className="space-y-1">
                {tooltip.apps.map((app, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className={`w-2 h-2 rounded-full ${
                      app.status === 'deployed' ? 'bg-green-500' :
                      app.status === 'pending' ? 'bg-yellow-500' :
                      app.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <span className="text-gray-700 dark:text-gray-300">{app.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mb-2">No apps deployed</div>
          )}

          {/* Chaos Conditions */}
          {tooltip.chaosConditions.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-medium text-amber-600 mb-1 flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Active Chaos ({tooltip.chaosConditions.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {tooltip.chaosConditions.map((chaos, idx) => (
                  <span
                    key={idx}
                    className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                  >
                    {chaos.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edge Context Menu */}
      {edgeContextMenu && edgeContextMenu.visible && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[200px]"
          style={{
            left: edgeContextMenu.x,
            top: edgeContextMenu.y,
            transform: 'translate(-50%, -50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500">Edge</div>
            <div className="font-medium text-gray-900 dark:text-white text-sm">
              {edgeContextMenu.sourceName} → {edgeContextMenu.targetName}
            </div>
          </div>

          {/* Active Chaos */}
          {edgeContextMenu.activeChaos.length > 0 && (
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="text-xs text-amber-600 font-medium mb-1">Active Chaos</div>
              {edgeContextMenu.activeChaos.map((chaos) => (
                <div key={chaos.id} className="flex items-center justify-between text-sm py-1">
                  <span className="text-gray-700 dark:text-gray-300">{chaos.type}</span>
                  {chaos.status === 'active' && (
                    <button
                      onClick={() => handleStopChaos(chaos.id)}
                      className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      Stop
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Quick Chaos Actions */}
          <div className="py-1">
            <div className="px-3 py-1 text-xs text-gray-500">Apply Chaos</div>
            {[
              { type: 'delay', icon: '⏱️', label: 'Delay (100ms)' },
              { type: 'loss', icon: '📉', label: 'Packet Loss (10%)' },
              { type: 'bandwidth', icon: '📊', label: 'Bandwidth (1mbps)' },
              { type: 'partition', icon: '🚫', label: 'Partition' },
            ].map((item) => (
              <button
                key={item.type}
                onClick={() => handleQuickChaos(item.type, edgeContextMenu.sourceId, edgeContextMenu.targetId)}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
              >
                <span>{item.icon}</span>
                <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
              </button>
            ))}
          </div>

          {/* Close */}
          <div className="border-t border-gray-200 dark:border-gray-700 py-1">
            <button
              onClick={() => setEdgeContextMenu(null)}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Template Selector Modal */}
      {showTemplateSelector && (
        <TemplateSelector
          onSelect={handleTemplateSelect}
          onCancel={() => setShowTemplateSelector(false)}
        />
      )}

      {/* Export Report Modal */}
      {showExportReport && id && (
        <ExportReport
          topologyId={id}
          topologyName={name}
          onClose={() => setShowExportReport(false)}
        />
      )}
    </div>
  );
}
