import { Outlet, Link, useLocation } from 'react-router-dom';
import { Network, Settings, PlayCircle } from 'lucide-react';
import clsx from 'clsx';
import { ConnectionStatus } from './ConnectionStatus';
import { ClusterStatus } from './ClusterStatus';

const navigation = [
  { name: 'Topologies', href: '/topologies', icon: Network },
  { name: 'Scenarios', href: '/scenarios', icon: PlayCircle },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-700">
          <Network className="h-8 w-8 text-primary-400" />
          <span className="text-xl font-bold">NetworkSim</span>
        </div>

        {/* Navigation */}
        <nav className="mt-4">
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-gray-800 text-white border-l-4 border-primary-500'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">
            {navigation.find((item) => location.pathname.startsWith(item.href))?.name || 'NetworkSim'}
          </h1>
          <div className="flex items-center gap-4">
            <ClusterStatus />
            <ConnectionStatus />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
