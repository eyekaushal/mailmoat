import { useMatch } from 'react-router';
import { SenderCard } from '../pages/inbox/SenderCard.jsx';
import { TodayCard } from '../pages/today/TodayCard.jsx';

/**
 * The right panel (DESIGN.md §7): Today while nothing is open in the inbox, the sender card of
 * the opened email otherwise. Other screens have no right panel. Hidden under 1100 px.
 */
export function Aside() {
  const inboxHome = useMatch('/inbox');
  const opened = useMatch('/inbox/:gmailId');
  if (!inboxHome && !opened) return null;
  return (
    <aside className="panel hidden w-[300px] shrink-0 flex-col overflow-y-auto min-[1100px]:flex">
      {opened ? (
        <SenderCard key={opened.params.gmailId} gmailId={opened.params.gmailId} />
      ) : (
        <TodayCard />
      )}
    </aside>
  );
}
