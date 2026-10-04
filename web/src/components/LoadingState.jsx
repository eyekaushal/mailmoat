import { CircleNotch } from '@phosphor-icons/react';

/** @param {{ label?: string }} props */
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div
      role="status"
      className="flex h-full min-h-32 items-center justify-center gap-2 p-8 text-base text-secondary"
    >
      <CircleNotch aria-hidden="true" size={16} className="animate-spin" />
      {label}
    </div>
  );
}
