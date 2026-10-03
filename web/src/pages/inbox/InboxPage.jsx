import { MailOpen } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { EmptyState } from '../../components/EmptyState.jsx';
import { EmailDetail } from './EmailDetail.jsx';
import { EmailList } from './EmailList.jsx';
import { LabelTabs, queryForTab } from './LabelTabs.jsx';

/** PRD F5: tabs across the top, the list on the left, the open email on the right. */
export function InboxPage() {
  const { gmailId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = params.get('tab') ?? 'all';
  const query = queryForTab(tab);
  const suffix = tab === 'all' ? '' : `?tab=${tab}`;

  return (
    <div className="flex h-full flex-col">
      <LabelTabs active={tab} onChange={(next) => setParams(next === 'all' ? {} : { tab: next })} />
      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Emails"
          className={`w-full shrink-0 overflow-y-auto border-r border-line md:w-96 ${gmailId ? 'hidden md:block' : ''}`}
        >
          <EmailList
            key={query}
            query={query}
            selectedId={gmailId}
            onSelect={(id) => navigate(`/inbox/${id}${suffix}`)}
          />
        </section>
        <section
          aria-label="Email"
          className={`min-w-0 flex-1 overflow-y-auto ${gmailId ? '' : 'hidden md:block'}`}
        >
          {gmailId ? (
            <EmailDetail
              key={gmailId}
              gmailId={gmailId}
              onClose={() => navigate(`/inbox${suffix}`)}
            />
          ) : (
            <EmptyState
              icon={MailOpen}
              title="Select an email"
              description="Risk, summary and the full pipeline trace appear here."
            />
          )}
        </section>
      </div>
    </div>
  );
}
