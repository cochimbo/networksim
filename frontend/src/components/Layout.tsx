import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Network, Settings, PlayCircle, ChevronLeft, ChevronRight, HardDrive } from 'lucide-react';
import clsx from 'clsx';
import { ConnectionStatus } from './ConnectionStatus';
import { ClusterStatus } from './ClusterStatus';
import { ThemeToggle } from '../contexts/ThemeContext';

const navigation = [
  { name: 'Topologies', href: '/topologies', icon: Network },
  { name: 'Scenarios', href: '/scenarios', icon: PlayCircle },
  { name: 'Volumes', href: '/volumes', icon: HardDrive },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 dark-mode-transition">
      {/* Sidebar */}
      <div 
        className={clsx(
          "bg-gray-900 dark:bg-gray-950 text-white transition-all duration-300 flex flex-col is-collapsed-sidebar relative",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 bg-gray-800 text-white p-1 rounded-full border border-gray-700 shadow-lg hover:bg-gray-700 z-50"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Logo */}
        <div className={clsx(
          "flex items-center gap-2 py-4 border-b border-gray-700 transition-all overflow-hidden whitespace-nowrap",
          isCollapsed ? "justify-center px-0" : "px-4"
        )}>
          <Network className="h-8 w-8 text-primary-400 shrink-0" />
          <span className={clsx("text-xl font-bold transition-opacity duration-300", isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>
            NetworkSim
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-4 flex-1">
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <div key={item.name} className="relative group">
                <Link
                  to={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors relative',
                    isActive
                      ? 'bg-gray-800 text-white border-l-4 border-primary-500'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white',
                    isCollapsed ? 'justify-center px-0 border-l-0' : '',
                    isActive && isCollapsed ? 'bg-gray-800' : ''
                  )}
                >
                   {isActive && isCollapsed && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500" />
                   )}
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span className={clsx("transition-opacity duration-300 whitespace-nowrap", isCollapsed ? "hidden" : "block")}>
                    {item.name}
                  </span>
                </Link>
                
                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-900 border border-gray-700 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                    {item.name}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between dark-mode-transition">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {navigation.find((item) => location.pathname.startsWith(item.href))?.name || 'NetworkSim'}
          </h1>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <ClusterStatus />
            <ConnectionStatus />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 dark-mode-transition">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
