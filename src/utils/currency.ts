export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  const abs = Math.abs(rounded);
  const formatted = new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0,
  }).format(abs);
  return rounded < 0 ? `-$${formatted}` : `$${formatted}`;
}

export function parseNumericAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return 0;

  // Handle Argentine format like 38.500,00 or 38.500
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
  }

  // Handle "38.500" (dot as thousands separator when 3 digits follow the dot)
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    const parsed = parseInt(cleaned.replace(/\./g, ''), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const normalized = cleaned.replace(',', '.');
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
