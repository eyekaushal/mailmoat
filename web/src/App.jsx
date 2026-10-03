import { Construction } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { EmptyState } from './components/EmptyState.jsx';
import { Layout } from './components/Layout.jsx';
import { NAV_ITEMS } from './components/Sidebar.jsx';
import { ApiClient } from './lib/ApiClient.js';
import { ApiProvider } from './lib/useApi.js';

const client = new ApiClient();

// Screens arrive block by block (PLAN B25–B27); until then each route shows where it will live.
function Placeholder({ label }) {
  return (
    <EmptyState
      icon={Construction}
      title={label}
      description="This screen is being built. The sidebar, API client and shared components are ready."
    />
  );
}

export function App() {
  return (
    <ApiProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/inbox" replace />} />
            {NAV_ITEMS.map(({ path, label }) => (
              <Route key={path} path={path} element={<Placeholder label={label} />} />
            ))}
            <Route path="/setup" element={<Placeholder label="Setup" />} />
            <Route path="*" element={<Navigate to="/inbox" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
