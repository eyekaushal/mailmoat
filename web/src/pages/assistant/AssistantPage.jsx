import { useSearchParams } from 'react-router';
import { HistoryTab } from './HistoryTab.jsx';
import { RulesTab } from './RulesTab.jsx';
import { TestTab } from './TestTab.jsx';

const TABS = [
  { id: 'rules', label: 'Rules', Component: RulesTab },
  { id: 'test', label: 'Test', Component: TestTab },
  { id: 'history', label: 'History', Component: HistoryTab },
];

/** PRD F4: the Assistant page with Rules / Test / History tabs. */
export function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0];
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Assistant</h1>
      <div
        role="tablist"
        aria-label="Assistant tabs"
        className="mt-4 mb-6 flex gap-1 border-b border-line"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === active.id}
            onClick={() => setParams(tab.id === 'rules' ? {} : { tab: tab.id })}
            className={`border-b-2 px-3 py-2 text-sm ${tab.id === active.id ? 'border-accent font-medium' : 'border-transparent text-muted hover:text-fg'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <active.Component />
    </div>
  );
}
