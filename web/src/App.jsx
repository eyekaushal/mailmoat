import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { NAV_ITEMS } from './components/Rail.jsx';
import { ApiClient } from './lib/ApiClient.js';
import { ApiProvider } from './lib/useApi.js';
import { TooltipProvider } from './ui/Tooltip.jsx';
import { ApprovalsPage } from './pages/approvals/ApprovalsPage.jsx';
import { AssistantPage } from './pages/assistant/AssistantPage.jsx';
import { InboxPage } from './pages/inbox/InboxPage.jsx';
import { SecurityCenterPage } from './pages/security/SecurityCenterPage.jsx';
import { BulkUnsubscribePage } from './pages/unsubscribe/BulkUnsubscribePage.jsx';
import { SettingsPage } from './pages/settings/SettingsPage.jsx';
import { SetupWizard } from './pages/setup/SetupWizard.jsx';

const client = new ApiClient();

const PAGES = {
  '/inbox': InboxPage,
  '/assistant': AssistantPage,
  '/approvals': ApprovalsPage,
  '/unsubscribe': BulkUnsubscribePage,
  '/security': SecurityCenterPage,
  '/settings': SettingsPage,
};

/** `/` is where Google's sign-in lands (`?google=…`): hand that to the wizard, else to the inbox. */
function Landing() {
  const { search } = useLocation();
  const target = new URLSearchParams(search).has('google') ? `/setup${search}` : '/inbox';
  return <Navigate to={target} replace />;
}

export function App() {
  return (
    <ApiProvider client={client}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/setup" element={<SetupWizard />} />
            <Route element={<Layout />}>
              <Route index element={<Landing />} />
              {NAV_ITEMS.filter((item) => item.path).map(({ path }) => {
                const Page = PAGES[path];
                return <Route key={path} path={path} element={<Page />} />;
              })}
              <Route path="/inbox/:gmailId" element={<InboxPage />} />
              <Route path="*" element={<Navigate to="/inbox" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ApiProvider>
  );
}
