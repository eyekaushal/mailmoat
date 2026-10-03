import { LoaderCircle } from 'lucide-react';

/** @param {{ label?: string }} props */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      className="flex h-full min-h-32 items-center justify-center gap-2 p-8 text-sm text-muted"
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      {label}
    </div>
  );
}
