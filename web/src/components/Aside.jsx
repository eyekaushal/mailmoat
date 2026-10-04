import { useMatch } from 'react-router';
import { TodayCard } from '../pages/today/TodayCard.jsx';

/**
 * The right panel (DESIGN.md §7): Today while nothing is open in the inbox; the sender card of
 * an opened email arrives in R04. Other screens have no right panel. Hidden under 1100 px.
 */
export function Aside() {
  const inboxHome = useMatch('/inbox');
  if (!inboxHome) return null;
  return (
    <aside className="panel hidden w-[300px] shrink-0 flex-col overflow-y-auto min-[1100px]:flex">
      <TodayCard />
    </aside>
  );
}
