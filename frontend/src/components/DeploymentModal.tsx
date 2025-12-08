import { useEffect, useState } from 'react';
import { Loader2, CheckCircle, XCircle, Server } from 'lucide-react';
import './DeploymentModal.css';

export type DeploymentAction = 'deploy' | 'destroy';
export type DeploymentPhase = 'starting' | 'in-progress' | 'success' | 'error';

interface DeploymentModalProps {
  action: DeploymentAction;
  phase: DeploymentPhase;
  message?: string;
  nodeCount?: number;
  onClose?: () => void;
}

export function DeploymentModal({ action, phase, message, nodeCount = 0, onClose }: DeploymentModalProps) {
  const [dots, setDots] = useState('');

  // Animate dots
  useEffect(() => {
    if (phase === 'starting' || phase === 'in-progress') {
      const interval = setInterval(() => {
        setDots(prev => prev.length >= 3 ? '' : prev + '.');
      }, 500);
      return () => clearInterval(interval);
    }
  }, [phase]);

  const isDeploying = action === 'deploy';
  const title = isDeploying ? 'Deploying Topology' : 'Stopping Deployment';
  
  const getStatusIcon = () => {
    switch (phase) {
      case 'starting':
      case 'in-progress':
        return <Loader2 className="icon spinning" />;
      case 'success':
        return <CheckCircle className="icon success" />;
      case 'error':
        return <XCircle className="icon error" />;
    }
  };

  const getStatusText = () => {
    switch (phase) {
      case 'starting':
        return isDeploying ? `Starting deployment${dots}` : `Stopping pods${dots}`;
      case 'in-progress':
        return isDeploying 
          ? `Creating ${nodeCount} pods${dots}` 
          : `Removing resources${dots}`;
      case 'success':
        return isDeploying ? 'Deployment successful!' : 'Deployment stopped';
      case 'error':
        return message || 'An error occurred';
    }
  };

  const canClose = phase === 'success' || phase === 'error';

  return (
    <div className="deployment-modal-overlay">
      <div className="deployment-modal">
        <div className="modal-header">
          <Server className="header-icon" />
          <h2>{title}</h2>
        </div>
        
        <div className="modal-content">
          <div className={`status-indicator ${phase}`}>
            {getStatusIcon()}
          </div>
          <p className="status-text">{getStatusText()}</p>
          
          {phase === 'in-progress' && isDeploying && (
            <div className="progress-bar">
              <div className="progress-fill" />
            </div>
          )}
        </div>

        {canClose && (
          <div className="modal-footer">
            <button onClick={onClose} className="close-button">
              {phase === 'success' ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
