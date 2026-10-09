/** The assistant's turn while it streams (PRD F8.2): steps, results, cards and the final text. */
export function emptyTurn() {
  return {
    text: '',
    progress: '',
    intent: 'none',
    status: 'running',
    steps: [],
    cards: [],
    results: [],
    statusText: '',
  };
}

/** Folds one streamed event into the turn being shown live. */
export function applyEvent(turn, event) {
  switch (event.type) {
    case 'status':
      return { ...turn, statusText: event.text, progress: event.text };
    case 'step': {
      const others = turn.steps.filter((s) => s.step !== event.step);
      return {
        ...turn,
        steps: [...others, { ...event }].sort((a, b) => a.step - b.step),
        statusText: event.label,
      };
    }
    case 'result':
      return { ...turn, results: [...turn.results, event] };
    case 'card':
      return { ...turn, cards: [...turn.cards, event.card] };
    case 'message':
      return { ...turn, text: event.text, statusText: '' };
    default:
      return turn;
  }
}

/**
 * The emails an answer drew on, numbered in order of first use (PLAN §13.9): every email source
 * of a result or a card field, once per email id.
 * @param {{ results?: { sources?: object[] }[], cards?: { fields?: Record<string, { sources?: object[] }> }[] }} turn
 * @returns {{ id: string | null, from?: string, date?: string }[]}
 */
export function sourcesOf(turn) {
  const seen = new Set();
  const sources = [];
  const add = (source) => {
    if (source?.type !== 'email') return;
    const key = source.id ?? `${source.from}|${source.date}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push({ id: source.id ?? null, from: source.from, date: source.date });
  };
  for (const result of turn.results ?? []) for (const source of result.sources ?? []) add(source);
  for (const card of turn.cards ?? [])
    for (const field of Object.values(card.fields ?? {}))
      for (const source of field.sources ?? []) add(source);
  return sources;
}
