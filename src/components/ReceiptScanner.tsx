import { useRef, useState, type ChangeEvent } from 'react';
import { AlertCircle, Check, FileImage, Loader2, Plus, QrCode, Upload } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ExpenseCategory, Participant, ReceiptScanItem, ReceiptScanResult } from '../types/expense';
import { formatCurrency } from '../utils/currency';

interface ReceiptScannerProps {
  participants: Participant[];
  onImportItems: (
    items: ReceiptScanItem[],
    payerId: string,
    merchantName: string
  ) => void;
}

async function compressImageToJpegBase64(file: File): Promise<{ base64: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas processing error.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ base64, previewUrl: dataUrl });
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('File read error.'));
    reader.readAsDataURL(file);
  });
}

export function ReceiptScanner({ participants, onImportItems }: ReceiptScannerProps) {
  const { language, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [selectedPayerId, setSelectedPayerId] = useState<string>(participants[0]?.id || '');

  const activePayerId =
    participants.some((p) => p.id === selectedPayerId)
      ? selectedPayerId
      : participants[0]?.id || '';

  const mapServerResponseToResult = (data: {
    merchantName?: string;
    date?: string;
    detectedTotal?: number;
    items?: { name: string; quantity?: number; totalPrice: number; category?: string }[];
  }): ReceiptScanResult => {
    const allParticipantIds = participants.map((p) => p.id);
    const items: ReceiptScanItem[] = (data.items || [])
      .filter((item) => Number(item.totalPrice) > 0)
      .map((item, idx) => ({
        id: `ocr-${Date.now()}-${idx}`,
        name: item.name || `${t.scanner.itemPrefix} ${idx + 1}`,
        quantity: Number(item.quantity) || 1,
        totalPrice: Math.round(Number(item.totalPrice)),
        category: (['comida', 'bebida', 'transporte', 'otros'].includes(item.category || '')
          ? item.category
          : 'comida') as ExpenseCategory,
        splitAmongIds: [...allParticipantIds],
        selected: true,
      }));

    return {
      merchantName: data.merchantName || t.scanner.scannedDefault,
      date: data.date || '',
      detectedTotal: Math.round(Number(data.detectedTotal) || items.reduce((s, i) => s + i.totalPrice, 0)),
      items,
    };
  };

  const detectQrFromFile = async (file: File): Promise<string | undefined> => {
    try {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (opts?: { formats?: string[] }) => {
            detect: (src: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
          };
        }
      ).BarcodeDetector;
      if (!Detector) return undefined;
      const detector = new Detector({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      return codes[0]?.rawValue || undefined;
    } catch {
      return undefined;
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setIsScanning(true);
    setImageBroken(false);

    try {
      const [{ base64, previewUrl: localPreview }, qrRawText] = await Promise.all([
        compressImageToJpegBase64(file),
        detectQrFromFile(file),
      ]);
      setPreviewUrl(localPreview);

      const response = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: 'image/jpeg',
          qrRawText,
          language,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setScanError(data.error || t.scanner.readError);
        return;
      }
      setScanResult(mapServerResponseToResult(data));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : t.scanner.photoProcessError);
    } finally {
      setIsScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleItemSelected = (itemId: string) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      ),
    });
  };

  const toggleParticipantOnItem = (itemId: string, participantId: string) => {
    if (!scanResult) return;
    setScanResult({
      ...scanResult,
      items: scanResult.items.map((item) => {
        if (item.id !== itemId) return item;
        const exists = item.splitAmongIds.includes(participantId);
        const nextIds = exists
          ? item.splitAmongIds.filter((id) => id !== participantId)
          : [...item.splitAmongIds, participantId];
        return { ...item, splitAmongIds: nextIds };
      }),
    });
  };

  const selectAllParticipantsForItem = (itemId: string) => {
    if (!scanResult) return;
    const allIds = participants.map((p) => p.id);
    setScanResult({
      ...scanResult,
      items: scanResult.items.map((item) => {
        if (item.id !== itemId) return item;
        const isAllSelected = allIds.every((id) => item.splitAmongIds.includes(id));
        return { ...item, splitAmongIds: isAllSelected ? [] : allIds };
      }),
    });
  };

  const handleImport = () => {
    if (!scanResult || !activePayerId) return;
    const selectedItems = scanResult.items.filter((i) => i.selected && i.totalPrice > 0);
    if (selectedItems.length === 0) return;
    onImportItems(selectedItems, activePayerId, scanResult.merchantName);
    setScanResult(null);
    setPreviewUrl(null);
  };

  const selectedCount = scanResult?.items.filter((i) => i.selected).length ?? 0;
  const selectedTotal =
    scanResult?.items
      .filter((i) => i.selected)
      .reduce((sum, i) => sum + i.totalPrice, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* QR Reader Trigger */}
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="w-full flex flex-col items-center justify-center gap-2.5 min-h-[124px] p-5 rounded-xl border-2 border-dashed border-emerald-300 dark:border-violet-500/45 bg-emerald-50/40 dark:bg-violet-500/10 text-emerald-900 dark:text-violet-100 hover:bg-emerald-50 dark:hover:bg-violet-500/15 hover:border-emerald-500 dark:hover:border-violet-400 transition-colors cursor-pointer disabled:opacity-50"
        >
          <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-violet-400/40 flex items-center justify-center shadow-xs">
            <QrCode className="w-6 h-6 text-emerald-700 dark:text-violet-300" aria-hidden="true" />
          </div>
          <div className="text-center">
            <div className="font-semibold text-sm">{t.scanner.scanQrOrReceipt}</div>
            <span className="text-xs text-emerald-700/80 dark:text-violet-300/80 inline-flex items-center gap-1 mt-0.5">
              <Upload className="w-3 h-3" aria-hidden="true" />
              {t.scanner.cameraOrGallery}
            </span>
          </div>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Scanning Loading State */}
      {isScanning && (
        <div className="flex items-center justify-center gap-3 py-8 px-4 rounded-xl border border-slate-200 dark:border-violet-500/30 bg-slate-50 dark:bg-slate-950/70 text-sm font-medium text-slate-700 dark:text-slate-200">
          <Loader2 className="w-5 h-5 text-emerald-600 dark:text-violet-400 animate-spin" aria-hidden="true" />
          <span>{t.scanner.extracting}</span>
        </div>
      )}

      {/* Error State */}
      {scanError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-800 dark:text-rose-200">
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{scanError}</span>
        </div>
      )}

      {/* Extracted Items + Chip-to-Chip Assignment */}
      {!isScanning && scanResult && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Receipt Image Preview */}
          <div className="md:col-span-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 overflow-hidden">
              {previewUrl && !imageBroken ? (
                <img
                  src={previewUrl}
                  alt={scanResult.merchantName}
                  referrerPolicy="no-referrer"
                  onError={() => setImageBroken(true)}
                  className="w-full max-h-[340px] object-contain bg-slate-900/5 dark:bg-black/40"
                />
              ) : (
                <div className="h-56 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-400 p-4 text-center">
                  <FileImage className="w-8 h-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  <span className="text-xs font-medium">{scanResult.merchantName}</span>
                </div>
              )}
              <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {scanResult.merchantName}
                </span>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-violet-300">
                  {formatCurrency(scanResult.detectedTotal)}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Item-by-Item Assignment */}
          <div className="md:col-span-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-display font-bold text-slate-900 dark:text-slate-100">
                  {t.scanner.chipTitle}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.scanner.chipSubtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="ocr-payer" className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {t.scanner.paidBy}
                </label>
                <select
                  id="ocr-payer"
                  value={activePayerId}
                  onChange={(e) => setSelectedPayerId(e.target.value)}
                  className="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:border-emerald-600 dark:focus:border-violet-400 focus:outline-none"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {scanResult.items.map((item) => {
                const isAll =
                  participants.length > 0 &&
                  participants.every((p) => item.splitAmongIds.includes(p.id));
                const perPerson =
                  item.splitAmongIds.length > 0
                    ? Math.round(item.totalPrice / item.splitAmongIds.length)
                    : item.totalPrice;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl border p-3 transition-colors ${
                      item.selected
                        ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/60'
                        : 'border-slate-100 dark:border-slate-800/50 bg-slate-50/70 dark:bg-slate-900/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => toggleItemSelected(item.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 cursor-pointer"
                      >
                        <span
                          className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition-colors ${
                            item.selected
                              ? 'bg-emerald-600 dark:bg-violet-600 border-emerald-600 dark:border-violet-500 text-white'
                              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {item.selected && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {item.quantity > 1 ? `${item.quantity}x ` : ''}
                            {item.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {item.splitAmongIds.length > 0
                              ? `${formatCurrency(perPerson)} ${t.scanner.perPersonSuffix} · ${item.splitAmongIds.length} ${t.scanner.people}`
                              : t.scanner.unassignedSplit}
                          </div>
                        </div>
                      </button>

                      <span className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-slate-100 shrink-0">
                        {formatCurrency(item.totalPrice)}
                      </span>
                    </div>

                    {item.selected && participants.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => selectAllParticipantsForItem(item.id)}
                          className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                            isAll
                              ? 'bg-slate-900 dark:bg-violet-600 text-white border-slate-900 dark:border-violet-500'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          {t.scanner.allBtn}
                        </button>
                        {participants.map((p) => {
                          const active = item.splitAmongIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => toggleParticipantOnItem(item.id, p.id)}
                              className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-emerald-50 dark:bg-violet-500/15 text-emerald-800 dark:text-violet-200 border-emerald-400 dark:border-violet-500/50 font-semibold'
                                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={selectedCount === 0 || participants.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 dark:bg-violet-600 text-white text-sm font-semibold hover:bg-emerald-700 dark:hover:bg-violet-500 dark:shadow-[0_0_22px_-6px_rgba(139,92,246,0.55)] disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>
                {t.scanner.importBtn} {selectedCount} {selectedCount === 1 ? t.scanner.itemSingular : t.scanner.itemPlural} ({formatCurrency(selectedTotal)})
              </span>
            </button>
          </div>
        </div>
      )}

      {!isScanning && !scanResult && !scanError && (
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 px-3.5 py-3 text-xs text-slate-600 dark:text-slate-400">
          <QrCode className="w-4 h-4 text-slate-400 dark:text-violet-400 shrink-0" aria-hidden="true" />
          <span>{t.scanner.helperText}</span>
        </div>
      )}
    </div>
  );
}
