import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Cpu, Mic, MicOff, Sparkles, Wand2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ExpenseCategory } from '../types/expense';
import { smartParseExpenseJS } from '../utils/smartParser';

export interface ParsedExpenseBatchItem {
  description: string;
  amount: number;
  category: ExpenseCategory;
  payers: { name: string; amount: number }[];
  excludedParticipants: string[];
  source: 'ai' | 'js';
}

interface VoiceTextInputProps {
  participantNames: string[];
  onApplyParsedBatch: (
    newParticipants: string[],
    expenses: ParsedExpenseBatchItem[],
    note: string
  ) => void;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function VoiceTextInput({ participantNames, onApplyParsedBatch }: VoiceTextInputProps) {
  const { language, speechLocale, t } = useLanguage();
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [lastResultNote, setLastResultNote] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const interactiveExamples = [
    { id: 'asado', label: t.voice.exAsadoLabel, text: t.voice.exAsadoText },
    { id: 'cena', label: t.voice.exCenaLabel, text: t.voice.exCenaText },
    { id: 'viaje', label: t.voice.exViajeLabel, text: t.voice.exViajeText },
  ];

  useEffect(() => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechSupported(false);
    }
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, []);

  const toggleListening = () => {
    setSpeechError(null);
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const RecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setSpeechSupported(false);
      setSpeechError(t.voice.dictateUnsupportedError);
      return;
    }

    try {
      const recognition = new RecognitionCtor();
      recognition.lang = speechLocale;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript ?? '';
          if (event.results[i].isFinal) {
            finalChunk += transcript + ' ';
          } else {
            interimChunk += transcript;
          }
        }
        if (finalChunk) {
          setText((prev) => (prev ? `${prev.trim()} ${finalChunk.trim()}` : finalChunk.trim()));
        }
        setInterimText(interimChunk);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        setInterimText('');
        if (event.error === 'not-allowed') {
          setSpeechError(t.voice.micDenied);
        } else if (event.error !== 'no-speech') {
          setSpeechError(`${t.voice.dictationFailed} (${event.error}).`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setSpeechError(t.voice.micStartError);
      setIsListening(false);
    }
  };

  const runLocalJSParser = (inputOverride?: string) => {
    const sourceText = (inputOverride ?? text).trim();
    if (!sourceText) return;
    setApiError(null);
    const result = smartParseExpenseJS(sourceText, participantNames);
    if (result.expenses.length === 0) {
      setApiError(result.note);
      return;
    }
    const items: ParsedExpenseBatchItem[] = result.expenses.map((exp) => ({
      ...exp,
      source: 'js',
    }));
    onApplyParsedBatch(result.newParticipants, items, result.note);
    setLastResultNote(result.note);
    setText('');
  };

  const runGeminiAIParser = async () => {
    const sourceText = text.trim();
    if (!sourceText) return;
    setIsAnalyzingAI(true);
    setApiError(null);
    setLastResultNote(null);

    try {
      const response = await fetch('/api/parse-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          participants: participantNames,
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setApiError(data.error || t.voice.aiErrorFallback);
        return;
      }

      const parsedExpenses: ParsedExpenseBatchItem[] = Array.isArray(data.expenses)
        ? data.expenses
            .filter((e: { amount?: number }) => Number(e.amount) > 0)
            .map(
              (e: {
                description: string;
                amount: number;
                category?: string;
                payers?: { name: string; amount: number }[];
                excludedParticipants?: string[];
              }) => ({
                description: e.description || t.voice.sharedExpenseDefault,
                amount: Math.round(Number(e.amount)),
                category: (['comida', 'bebida', 'transporte', 'otros'].includes(e.category || '')
                  ? e.category
                  : 'otros') as ExpenseCategory,
                payers: Array.isArray(e.payers) ? e.payers : [],
                excludedParticipants: Array.isArray(e.excludedParticipants)
                  ? e.excludedParticipants
                  : [],
                source: 'ai' as const,
              })
            )
        : [];

      if (parsedExpenses.length === 0) {
        setApiError(t.voice.noValidExpense);
        return;
      }

      onApplyParsedBatch(
        Array.isArray(data.newParticipants) ? data.newParticipants : [],
        parsedExpenses,
        data.note || t.voice.aiDoneFallback
      );
      setLastResultNote(data.note || `${t.voice.aiAddedPrefix} ${parsedExpenses.length}`);
      setText('');
    } catch {
      setApiError(t.voice.serverConnectError);
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  const handleSelectExample = (exampleText: string) => {
    setText(exampleText);
    setApiError(null);
    setLastResultNote(null);
  };

  return (
    <div className="space-y-4">
      {/* Interactive 1-tap examples */}
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          {t.voice.examplesTitle}
        </p>
        <div className="flex flex-wrap gap-2">
          {interactiveExamples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => handleSelectExample(ex.text)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-emerald-600 dark:hover:border-violet-400/60 hover:text-emerald-800 dark:hover:text-violet-200 hover:bg-emerald-50/60 dark:hover:bg-violet-500/10 transition-colors cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5 text-emerald-600 dark:text-violet-400 shrink-0" aria-hidden="true" />
              <span>{ex.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Textarea + Tactile Mic Button */}
      <div className="space-y-2">
        <div className="relative">
          <label htmlFor="ai-expense-input" className="sr-only">
            {t.voice.inputLabel}
          </label>
          <textarea
            id="ai-expense-input"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t.voice.placeholder}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 p-3.5 pr-16 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-950 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none transition-colors resize-none"
          />
          <button
            type="button"
            onClick={toggleListening}
            aria-label={isListening ? t.voice.stopDictation : t.voice.startDictation}
            title={speechSupported ? t.voice.dictateTitle : t.voice.dictateUnsupportedTitle}
            className={`absolute right-2.5 bottom-2.5 w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
              isListening
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-violet-500/30 text-slate-700 dark:text-violet-300 hover:border-emerald-600 dark:hover:border-violet-400 hover:text-emerald-700 dark:hover:text-violet-200'
            }`}
          >
            {isListening ? (
              <MicOff className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Mic className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {isListening && (
          <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-400 font-medium px-1">
            <span className="inline-block w-2 h-2 rounded-full bg-rose-600 dark:bg-rose-500 animate-pulse" />
            <span>
              {t.voice.listening} {interimText ? `"${interimText}"` : t.voice.speakNaturally}
            </span>
          </div>
        )}

        {speechError && (
          <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 rounded-lg px-3 py-2">
            {speechError}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          type="button"
          onClick={runGeminiAIParser}
          disabled={!text.trim() || isAnalyzingAI}
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_22px_-6px_rgba(139,92,246,0.6)] disabled:opacity-45 disabled:cursor-not-allowed active:scale-[0.99] transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{isAnalyzingAI ? t.voice.analyzingAi : t.voice.analyzeAi}</span>
        </button>

        <button
          type="button"
          onClick={() => runLocalJSParser()}
          disabled={!text.trim() || isAnalyzingAI}
          className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-violet-500/40 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
        >
          <Cpu className="w-4 h-4 text-slate-500 dark:text-violet-300 shrink-0" aria-hidden="true" />
          <span>{t.voice.analyzeJs}</span>
        </button>
      </div>

      {/* Feedback & Errors */}
      {apiError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-3 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{apiError}</span>
          </div>
          {text.trim() && (
            <button
              type="button"
              onClick={() => runLocalJSParser()}
              className="px-3 py-1.5 min-h-[34px] rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 font-semibold hover:bg-rose-100 dark:hover:bg-rose-950 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.voice.useLocalJs}
            </button>
          )}
        </div>
      )}

      {lastResultNote && !apiError && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
          {lastResultNote}
        </div>
      )}
    </div>
  );
}
