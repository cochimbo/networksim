import { useState, ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: number | string;
  badgeColor?: 'default' | 'success' | 'warning' | 'error';
}

interface TabPanelProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function TabPanel({
  tabs,
  activeTab,
  onTabChange,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
}: TabPanelProps) {
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className={`tab-header flex flex-wrap border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 ${headerClassName}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              tab-button flex items-center gap-2 px-4 py-2 text-sm font-medium
              transition-colors duration-200 relative whitespace-nowrap
              ${
                activeTab === tab.id
                  ? 'text-primary-600 dark:text-primary-400 bg-white dark:bg-gray-800 border-b-2 border-primary-500 -mb-px'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              }
            `}
          >
            {tab.icon && <span className="tab-icon">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`
                  tab-badge ml-1 px-1.5 py-0.5 text-xs rounded-full
                  ${
                    tab.badgeColor === 'success'
                      ? 'bg-green-100 text-green-700'
                      : tab.badgeColor === 'warning'
                      ? 'bg-yellow-100 text-yellow-700'
                      : tab.badgeColor === 'error'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-700'
                  }
                `}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className={`tab-content flex-1 overflow-auto ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}

// Hook for managing tab state
export function useTabs(defaultTab: string) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  return { activeTab, setActiveTab };
}

export default TabPanel;
