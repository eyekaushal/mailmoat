import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ApiClient } from '../src/lib/ApiClient.js';
import { ApiProvider } from '../src/lib/useApi.js';
import { TooltipProvider } from '../src/ui/Tooltip.jsx';

/**
 * A fake server for page tests: `routes` maps `METHOD /path` to a response body or a function of
 * the parsed body. Every call is recorded in `calls`.
 */
export function fakeServer(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = url.replace(/^\/api/, '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, body });
    if (path === '/csrf') return json({ token: 't' });
    const handler = routes[`${method} ${path}`] ?? routes[`${method} ${path.split('?')[0]}`];
    if (handler === undefined) return json({ error: `No such API route: ${method} ${path}` }, 404);
    const result = typeof handler === 'function' ? handler(body, path) : handler;
    if (result instanceof Response) return result;
    return json(result);
  };
  return { fetch, calls };
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Renders `element` at `path` inside the API provider and a memory router. */
export function renderPage(element, { server, path = '/', route = '*' }) {
  const client = new ApiClient({ fetch: server.fetch });
  return render(
    <ApiProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={element} />
            <Route path="/inbox" element={<h1>Inbox screen</h1>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </ApiProvider>,
  );
}
