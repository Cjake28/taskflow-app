import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { toSearchString } from '../url-state';

/** Selector of the search box the `/` shortcut focuses. */
export const SEARCH_HOTKEY_SELECTOR = '[data-hotkey-search]';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
      target.type,
    );
  }
  return false;
}

/** A dialog, sheet or menu is open: its own keyboard handling wins. */
function overlayOpen(): boolean {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
    ) !== null
  );
}

/**
 * Global shortcuts (spec §14.9): `N` opens "New task" and `/` focuses the task search. Both are
 * ignored while typing in a field or when a dialog or menu is open.
 */
export function TasksHotkeys() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || overlayOpen()) return;

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        if (pathname === '/tasks') {
          const params = new URLSearchParams(search);
          params.set('new', '1');
          void navigate({ pathname, search: toSearchString(params) }, { replace: true });
        } else {
          void navigate('/tasks?new=1');
        }
      } else if (event.key === '/') {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>(SEARCH_HOTKEY_SELECTOR);
        if (input) {
          input.focus();
          input.select();
        } else {
          void navigate('/tasks', { state: { focusSearch: true } });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, pathname, search]);

  return null;
}
