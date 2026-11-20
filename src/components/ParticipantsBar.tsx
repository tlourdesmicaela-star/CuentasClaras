import { useState, type FormEvent } from 'react';
import { Moon, Sun, UserPlus, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Participant } from '../types/expense';

interface ParticipantsBarProps {
  title: string;
  date: string;
  participants: Participant[];
  onTitleChange: (title: string) => void;
  onDateChange: (date: string) => void;
  onAddParticipant: (name: string) => void;
  onRemoveParticipant: (id: string) => void;
  totalSpentFormatted: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const QUICK_SUGGESTIONS = ['Santi', 'Marcos', 'Sofía', 'Lucía', 'Lucas', 'Mili', 'Juli', 'Tomi'];

export function ParticipantsBar({
  title,
  date,
  participants,
  onTitleChange,
  onDateChange,
  onAddParticipant,
  onRemoveParticipant,
  totalSpentFormatted,
  theme,
  onToggleTheme,
}: ParticipantsBarProps) {
  const { t } = useLanguage();
  const [nameInput, setNameInput] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    onAddParticipant(trimmed);
    setNameInput('');
  };

  const existingLower = new Set(participants.map((p) => p.name.toLowerCase()));
  const availableSuggestions = QUICK_SUGGESTIONS.filter(
    (s) => !existingLower.has(s.toLowerCase())
  ).slice(0, 4);

  return (
    <section className="bg-white dark:bg-slate-900/85 border border-slate-200 dark:border-slate-800/90 dark:shadow-[0_0_28px_-12px_rgba(139,92,246,0.22)] rounded-2xl p-4 sm:p-5">
      {/* Title & unboxed metadata row */}
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1 min-w-0">
          <label htmlFor="gathering-title" className="sr-only">
            {t.participants.titleLabel}
          </label>
          <input
            id="gathering-title"
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={t.participants.titlePlaceholder}
            className="w-full text-xl sm:text-2xl font-display font-bold text-slate-900 dark:text-slate-50 bg-transparent border-0 p-0 focus:outline-none focus:ring-0 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="date"
              aria-label={t.participants.dateAria}
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent text-xs text-slate-600 dark:text-slate-300 font-medium focus:outline-none focus:text-slate-900 dark:focus:text-white cursor-pointer dark:[color-scheme:dark]"
            />
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{participants.length} {t.participants.dinersCount}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-violet-300">
              {t.participants.totalLabel} {totalSpentFormatted}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? t.participants.toLightMode : t.participants.toDarkMode}
          title={theme === 'dark' ? t.participants.light : t.participants.dark}
          className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-violet-500/10 text-xs font-medium text-slate-700 dark:text-violet-200 hover:border-slate-300 dark:hover:border-violet-400/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-violet-300" aria-hidden="true" />
              <span className="hidden sm:inline">{t.participants.light}</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-slate-600" aria-hidden="true" />
              <span className="hidden sm:inline">{t.participants.dark}</span>
            </>
          )}
        </button>
      </div>

      {/* Add participant form + active chips */}
      <div className="pt-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={t.participants.addPlaceholder}
            className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!nameInput.trim()}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-violet-600 text-white text-sm font-medium hover:bg-slate-800 dark:hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>{t.participants.addBtn}</span>
          </button>
        </form>

        {/* Active participants list */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {participants.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-1">
              {t.participants.emptyHint}
            </p>
          ) : (
            participants.map((p) => (
              <div
                key={p.id}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 min-h-[38px] rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-transparent dark:border-slate-700/70 text-slate-800 dark:text-slate-100 text-sm font-medium"
              >
                <span>{p.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveParticipant(p.id)}
                  aria-label={`${t.participants.removePrefix} ${p.name}`}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Quick suggestions */}
        {availableSuggestions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{t.participants.suggested}</span>
            {availableSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onAddParticipant(name)}
                className="px-2.5 py-1 min-h-[32px] rounded-md border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-600 dark:hover:border-violet-400 hover:text-emerald-700 dark:hover:text-violet-300 hover:bg-emerald-50/50 dark:hover:bg-violet-500/10 transition-colors cursor-pointer"
              >
                + {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
