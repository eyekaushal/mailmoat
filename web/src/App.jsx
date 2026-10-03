import { Construction } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { EmptyState } from './components/EmptyState.jsx';
import { Layout } from './components/Layout.jsx';
import { NAV_ITEMS } from './components/Sidebar.jsx';
import { ApiClient } from './lib/ApiClient.js';
import { ApiProvider } from './lib/useApi.js';
import { ApprovalsPage } from './pages/approvals/ApprovalsPage.jsx';
import { AssistantPage } from './pages/assistant/AssistantPage.jsx';
import { InboxPage } from './pages/inbox/InboxPage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
import { SetupWizard } from './pages/setup/SetupWizard.jsx';

const client = new ApiClient();

const PAGES = {
  '/inbox': InboxPage,
  '/assistant': AssistantPage,
  '/approvals': ApprovalsPage,
  '/settings': SettingsPage,
};

// Screens arrive block by block (PLAN B26–B27); until then each route shows where it will live.
function Placeholder({ label }) {
  return (
    <EmptyState
      icon={Construction}
      title={label}
      description="This screen is being built. The sidebar, API client and shared components are ready."
    />
  );
}

/** `/` is where Google's sign-in lands (`?google=…`): hand that to the wizard, else to the inbox. */
function Landing() {
  const { search } = useLocation();
  const target = new URLSearchParams(search).has('google') ? `/setup${search}` : '/inbox';
  return <Navigate to={target} replace />;
}

export function App() {
  return (
    <ApiProvider client={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<SetupWizard />} />
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            {NAV_ITEMS.map(({ path, label }) => {
              const Page = PAGES[path];
              return (
                <Route
                  key={path}
                  path={path}
                  element={Page ? <Page /> : <Placeholder label={label} />}
                />
              );
            })}
            <Route path="/inbox/:gmailId" element={<InboxPage />} />
            <Route path="*" element={<Navigate to="/inbox" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ApiProvider>
  );
}
