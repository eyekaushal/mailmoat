/** A failed API call: the server's message plus the HTTP status, so screens can branch on it. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status: number, path: string }} details
   */
  constructor(message, { status, path }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

const JSON_TYPE = 'application/json';

/**
 * The browser's only way to the local server (PRD §13). Same-origin `fetch` with the session
 * cookie; every non-GET carries the session's CSRF token (SECURITY_APPROACH §9), fetched once from
 * `GET /api/csrf` and refreshed when the server has restarted and no longer knows it.
 */
export class ApiClient {
  #baseUrl;
  #fetch;
  /** @type {Promise<string> | null} */
  #token = null;

  /**
   * @param {{ baseUrl?: string, fetch?: typeof globalThis.fetch }} [options] `fetch` is injectable for tests
   */
  constructor({ baseUrl = '/api', fetch = globalThis.fetch.bind(globalThis) } = {}) {
    this.#baseUrl = baseUrl;
    this.#fetch = fetch;
  }

  /** @param {string} path e.g. `/emails?limit=50` */
  get(path) {
    return this.#request('GET', path);
  }

  post(path, body) {
    return this.#request('POST', path, body);
  }

  put(path, body) {
    return this.#request('PUT', path, body);
  }

  patch(path, body) {
    return this.#request('PATCH', path, body);
  }

  delete(path) {
    return this.#request('DELETE', path);
  }

  /**
   * A POST whose reply is a Server-Sent-Events stream (the chat). Each `event:`/`data:` block is
   * handed to `onEvent(name, data)` as it arrives; resolves when the server ends the stream.
   * @param {string} path
   * @param {unknown} body
   * @param {(name: string, data: unknown) => void} onEvent
   */
  async stream(path, body, onEvent) {
    const response = await this.#fetch(this.#baseUrl + path, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': JSON_TYPE,
        'X-CSRF-Token': await this.#csrfToken(),
      },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await ApiClient.#parse(response);
      throw new ApiError(data?.error ?? response.statusText, { status: response.status, path });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? '' : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        ApiClient.#dispatch(buffer.slice(0, boundary), onEvent);
        buffer = buffer.slice(boundary + 2);
      }
      if (done) {
        if (buffer.trim()) ApiClient.#dispatch(buffer, onEvent);
        return;
      }
    }
  }

  static #dispatch(block, onEvent) {
    let name = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (data.length === 0) return;
    let parsed;
    try {
      parsed = JSON.parse(data.join('\n'));
    } catch {
      parsed = data.join('\n');
    }
    onEvent(name, parsed);
  }

  async #request(method, path, body, retried = false) {
    const headers = { Accept: JSON_TYPE };
    if (body !== undefined) headers['Content-Type'] = JSON_TYPE;
    if (method !== 'GET') headers['X-CSRF-Token'] = await this.#csrfToken();

    const response = await this.#fetch(this.#baseUrl + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await ApiClient.#parse(response);
    if (response.ok) return data;

    const message = data?.error ?? response.statusText ?? 'Request failed';
    // After a server restart the session is gone: fetch a fresh token and try exactly once more.
    if (response.status === 403 && !retried && /CSRF/i.test(message)) {
      this.#token = null;
      return this.#request(method, path, body, true);
    }
    throw new ApiError(message, { status: response.status, path });
  }

  #csrfToken() {
    this.#token ??= this.get('/csrf')
      .then(({ token }) => token)
      .catch((error) => {
        this.#token = null;
        throw error;
      });
    return this.#token;
  }

  static async #parse(response) {
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type.includes(JSON_TYPE)) return response.json();
    const text = await response.text();
    return text ? { error: text } : null;
  }
}
