import { Navigate, Outlet } from 'react-router';
import { useApi } from '../lib/useApi.js';
import { LoadingState } from './LoadingState.jsx';
import { Sidebar } from './Sidebar.jsx';

/**
 * The app shell: fixed sidebar on the left, the current screen filling the rest. Until both the
 * Anthropic key and Google are set up, every screen hands over to the setup wizard (PRD F1).
 */
export function Layout() {
  const { data: health, error } = useApi('/health');
  if (!health && !error) return <LoadingState label="Starting mailmoat…" />;
  if (health && !(health.anthropic?.configured && health.google?.connected)) {
    return <Navigate to="/setup" replace />;
  }
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
