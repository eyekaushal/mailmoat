import { useApi } from '../lib/useApi.js';

/** The four choices offered in Settings; `tide` is the default (DESIGN.md §7). */
export const WALLPAPERS = Object.freeze([
  { id: 'tide', label: 'Low tide', hint: 'Monet, Low Tide at Pourville' },
  { id: 'valley', label: 'Valley', hint: 'Monet, The Valley of the Nervia' },
  { id: 'gradient', label: 'Gradient', hint: 'A soft cream-to-sky gradient' },
  { id: 'none', label: 'None', hint: 'Plain canvas' },
]);

/** The fixed full-window layer behind the panels; the choice is a server setting. */
export function Wallpaper() {
  const { data: view } = useApi('/settings');
  const id = WALLPAPERS.some((w) => w.id === view?.settings?.wallpaper)
    ? view.settings.wallpaper
    : 'tide';
  return <div aria-hidden="true" className="wallpaper" data-wallpaper={id} />;
}

/** Inline style for a small preview tile of a wallpaper (the Settings picker). */
export function wallpaperPreview(id) {
  switch (id) {
    case 'tide':
      return { backgroundImage: 'url(/wallpapers/tide.jpg)' };
    case 'valley':
      return { backgroundImage: 'url(/wallpapers/valley.jpg)' };
    case 'gradient':
      return { backgroundImage: 'linear-gradient(160deg, #f6efe2 0%, #e9eef5 55%, #dfe9f3 100%)' };
    default:
      return { backgroundColor: 'var(--canvas)' };
  }
}
