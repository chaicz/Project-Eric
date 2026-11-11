import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, X, CornerDownLeft, ArrowUp, ArrowDown, Command } from 'lucide-react';

// ---------------------------------------------------------------------------
// Command palette — a keyboard-driven jump-to menu.
//
// The dashboard shows a lot of numbers and lists. This lets the user reach
// any of them without scrolling: ⌘K / Ctrl-K opens it, the arrow keys move
// the highlight, Enter selects.
//
// The palette is a controlled component: the owner keeps the open state and
// decides what happens on select.
// ---------------------------------------------------------------------------

/**
 * Build the searchable list of commands.
 *
 * Each command is `{ id, label, hint, group, keywords, onSelect }`.
 * `keywords` are extra search terms that do not appear in the label — for
 * example the word "owasp" should find the A03 Injection entry even though
 * the label does not mention it.
 */
export const buildCommandIndex = (commands) => commands;

// Score a command against the query. Higher is better, 0 means "no match".
//
// The scoring is deliberately simple and predictable: an exact prefix beats a
// word-start hit, which beats a loose substring hit. A fuzzy "did you mean"
// search over ten categories is not worth the surprise it causes.
const scoreCommand = (command, query) => {
  if (!query) return 1;

  const haystack = [
    command.label,
    command.group || '',
    command.hint || '',
    ...(command.keywords || []),
  ]
    .join(' ')
    .toLowerCase();
  const needle = query.toLowerCase();

  if (!haystack.includes(needle)) return 0;

  const label = command.label.toLowerCase();
  if (label.startsWith(needle)) return 100;
  if (label.includes(needle)) return 70;

  const wordStart = label.split(/[\s\-—·]+/).some((w) => w.startsWith(needle));
  if (wordStart) return 50;

  return 25;
};

export const CommandPalette = ({
  open,
  onClose,
  commands = [],
  placeholder = 'Search…',
  title = 'Commands',
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Reset the search every time the palette opens, so the previous
  // query does not linger behind the overlay.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    // The input has to exist before it can be focused, so the focus is
    // deferred by a tick.
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const scored = commands
      .map((c) => ({ command: c, score: scoreCommand(c, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    // Keep the owner's order for equal scores — the list is hand-ordered
    // on purpose (most important first), and a stable sort preserves it.
    return scored.map((entry) => entry.command);
  }, [commands, query]);

  // Clamp the highlight when the result list shrinks under it.
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, filtered.length]);

  const select = useCallback(
    (command) => {
      if (!command) return;
      onClose?.();
      command.onSelect?.();
    },
    [onClose]
  );

  const onKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        select(filtered[activeIndex]);
      }
    },
    [activeIndex, filtered, onClose, select]
  );

  if (!open) return null;

  // Group the results so the palette reads as sections rather than one
  // long list. The order of the groups follows the order of the commands.
  const groups = [];
  filtered.forEach((command) => {
    const groupName = command.group || 'Commands';
    let group = groups.find((g) => g.name === groupName);
    if (!group) {
      group = { name: groupName, items: [] };
      groups.push(group);
    }
    group.items.push(command);
  });

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-xl rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl animate-scale-in"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="flex-1 bg-transparent border-0 outline-none text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nothing matches “{query}”.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.name} className="mb-1 last:mb-0">
              <p className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.name}
              </p>
              {group.items.map((command) => {
                const globalIndex = filtered.indexOf(command);
                const isActive = globalIndex === activeIndex;
                return (
                  <button
                    key={command.id}
                    type="button"
                    data-active={isActive ? 'true' : 'false'}
                    onMouseEnter={() => setActiveIndex(globalIndex)}
                    onClick={() => select(command)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-500/15'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {command.icon ? (
                      <command.icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400'
                        }`}
                      />
                    ) : null}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {command.label}
                      </span>
                      {command.hint && (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {command.hint}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 text-[10px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            <ArrowDown className="w-3 h-3" />
            navigate
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="w-3 h-3" />
            open
          </span>
          <span className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            K to toggle
          </span>
          <span className="ml-auto tabular-nums">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
