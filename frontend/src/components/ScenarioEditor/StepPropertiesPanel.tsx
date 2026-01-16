import React from 'react';
import { ScenarioStep } from './ScenarioEditor';
import { X } from 'lucide-react';

interface StepPropertiesPanelProps {
  step: ScenarioStep | null;
  onUpdate: (step: ScenarioStep) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  nodeName: string;
}

export const StepPropertiesPanel: React.FC<StepPropertiesPanelProps> = ({
  step,
  onUpdate,
  onClose,
  onDelete,
  nodeName,
}) => {
  if (!step) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 text-sm p-4 text-center">
        Select a chaos block in the timeline to edit properties
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900">
        <h3 className="font-semibold text-sm">Properties</h3>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
          <X size={14} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="space-y-0.5">
          <label className="text-xs font-medium text-gray-500 uppercase">Type</label>
          <div className="text-sm font-semibold">{step.type}</div>
        </div>

        <div className="space-y-0.5">
          <label className="text-xs font-medium text-gray-500 uppercase">Target Node</label>
          <div className="text-sm">{nodeName}</div>
        </div>

        <hr className="dark:border-gray-700" />

        {/* Dynamic Fields based on Type */}
        <ChaosParamsForm step={step} onChange={(newParams) => onUpdate({ ...step, params: newParams })} />
        
        <hr className="dark:border-gray-700" />
        
        <div className="pt-1">
            <button 
                onClick={() => onDelete(step.id)}
                className="w-full py-1 px-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded text-xs transition-colors"
            >
                Delete Block
            </button>
        </div>
      </div>
    </div>
  );
};

const ChaosParamsForm: React.FC<{ step: ScenarioStep; onChange: (params: any) => void }> = ({ step, onChange }) => {
  const handleChange = (key: string, value: any) => {
    onChange({ ...step.params, [key]: value });
  };

  switch (step.type) {
    case 'delay':
      return (
        <>
          <InputField label="Latency" value={step.params.latency || '100ms'} onChange={(v) => handleChange('latency', v)} placeholder="100ms" />
          <InputField label="Jitter" value={step.params.jitter || '0ms'} onChange={(v) => handleChange('jitter', v)} placeholder="20ms" />
          <InputField label="Correlation" value={step.params.correlation || ''} onChange={(v) => handleChange('correlation', v)} placeholder="0" />
        </>
      );
    case 'loss':
      return (
        <>
           <InputField label="Loss Percentage" value={step.params.loss || '10'} onChange={(v) => handleChange('loss', v)} placeholder="10" type="number" />
           <InputField label="Correlation" value={step.params.correlation || ''} onChange={(v) => handleChange('correlation', v)} placeholder="0" />
        </>
      );
    case 'duplicate':
      return (
          <InputField label="Duplicate Percentage" value={step.params.duplicate || '10'} onChange={(v) => handleChange('duplicate', v)} placeholder="10" type="number" />
      );
    case 'corrupt':
      return (
           <InputField label="Corrupt Percentage" value={step.params.corrupt || '10'} onChange={(v) => handleChange('corrupt', v)} placeholder="10" type="number" />
      );
     case 'bandwidth':
      return (
        <>
           <InputField label="Rate" value={step.params.rate || '1mbps'} onChange={(v) => handleChange('rate', v)} placeholder="1mbps" />
           <InputField label="Limit" value={step.params.limit || ''} onChange={(v) => handleChange('limit', v)} placeholder="Bytes" />
           <InputField label="Buffer" value={step.params.buffer || ''} onChange={(v) => handleChange('buffer', v)} placeholder="Bytes" />
        </>
      );
    case 'stress-cpu':
       return (
        <>
           <InputField label="Load %" value={step.params.load || '80'} onChange={(v) => handleChange('load', v)} placeholder="80" type="number" />
           <InputField label="Workers" value={step.params.workers || '1'} onChange={(v) => handleChange('workers', v)} placeholder="1" type="number" />
        </>
      );
    case 'io-delay':
        return (
             <InputField label="Delay" value={step.params.delay || '100ms'} onChange={(v) => handleChange('delay', v)} placeholder="100ms" />
        );
    case 'http-abort': 
        return (
             <InputField label="Error Code" value={step.params.code || '500'} onChange={(v) => handleChange('code', v)} type="number" />
        );
    default:
      return <div className="text-xs text-gray-500 italic">No configuration available for this type.</div>;
  }
};

interface InputFieldProps {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

const InputField: React.FC<InputFieldProps> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div className="space-y-0.5">
    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
    <input
      type={type}
      className="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 focus:ring-1 focus:ring-primary-500 outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  </div>
);
