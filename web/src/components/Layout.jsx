import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.jsx';

/** The app shell: fixed sidebar on the left, the current screen filling the rest. */
export function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
