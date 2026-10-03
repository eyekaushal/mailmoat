import { createContext, createElement, useContext } from 'react';
import useSWR, { SWRConfig } from 'swr';

const ApiContext = createContext(null);

/**
 * Makes one `ApiClient` available to every screen and uses it as SWR's fetcher, so a component
 * reads data with `useApi('/emails/counts')` and writes with `useApiClient().post(...)`.
 * @param {{ client: import('./ApiClient.js').ApiClient, children: import('react').ReactNode }} props
 */
export function ApiProvider({ client, children }) {
  const value = {
    fetcher: (path) => client.get(path),
    // One cache per provider, so a new app (or test) never sees another's data.
    provider: () => new Map(),
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  };
  return createElement(
    ApiContext.Provider,
    { value: client },
    createElement(SWRConfig, { value }, children),
  );
}

/** @returns {import('./ApiClient.js').ApiClient} */
export function useApiClient() {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApiClient must be used inside <ApiProvider>');
  return client;
}

/**
 * Cached, revalidating read of one API path; `null` skips the request.
 * @param {string | null} path
 * @param {import('swr').SWRConfiguration} [options]
 */
export function useApi(path, options) {
  return useSWR(path, options);
}
