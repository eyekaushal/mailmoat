import { ClockCounterClockwise, Flask, ListChecks } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router';
import { Tabs } from '../../ui/Tabs.jsx';
import { HistoryTab } from './HistoryTab.jsx';
import { RulesTab } from './RulesTab.jsx';
import { TestTab } from './TestTab.jsx';

const TABS = [
  { id: 'rules', label: 'Rules', Icon: ListChecks, Component: RulesTab },
  { id: 'test', label: 'Test', Icon: Flask, Component: TestTab },
  { id: 'history', label: 'History', Icon: ClockCounterClockwise, Component: HistoryTab },
];

/** PRD F4, PLAN §13.7: the Assistant on the main panel, with Rules / Test / History tabs. */
export function AssistantPage() {
  const [params, setParams] = useSearchParams();
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0];
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center px-5">
        <h1 className="text-xl font-medium tracking-tight">Assistant</h1>
      </header>
      <Tabs
        value={active.id}
        onChange={(id) => setParams(id === 'rules' ? {} : { tab: id })}
        label="Assistant tabs"
        items={TABS}
      />
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
        <active.Component />
      </div>
    </div>
  );
}
