import type { ExpenseCategory } from '../types/expense';
import { parseNumericAmount } from './currency';

export interface ParsedExpenseDraft {
  description: string;
  amount: number;
  category: ExpenseCategory;
  payers: { name: string; amount: number }[];
  excludedParticipants: string[];
}

export interface SmartParseOutput {
  newParticipants: string[];
  expenses: ParsedExpenseDraft[];
  note: string;
}

const STOPWORDS = new Set([
  'asado',
  'cena',
  'almuerzo',
  'carne',
  'fernet',
  'coca',
  'cerveza',
  'pizza',
  'empanadas',
  'carbon',
  'carbón',
  'hielo',
  'nafta',
  'peaje',
  'peajes',
  'cafe',
  'café',
  'medialunas',
  'agua',
  'vino',
  'bebida',
  'bebidas',
  'alcohol',
  'comida',
  'todos',
  'entre',
  'pero',
  'menos',
  'solo',
  'pago',
  'pagó',
  'puso',
  'toma',
  'toman',
  'tomo',
  'tomó',
  'come',
  'comen',
  'comio',
  'comió',
  'tablao',
  'juntada',
  'supermercado',
  'coto',
  'el',
  'la',
  'los',
  'las',
  'en',
  'de',
  'del',
  'y',
  'con',
  'sin',
  'que',
  'no',
]);

function capitalize(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function detectCategory(text: string): ExpenseCategory {
  const lower = text.toLowerCase();
  if (/(fernet|cerveza|vino|coca|gaseosa|agua|bebida|alcohol|birra|ipa|trago)/.test(lower)) {
    return 'bebida';
  }
  if (/(nafta|combustible|peaje|uber|cabify|taxi|auto|estacionamiento|subte)/.test(lower)) {
    return 'transporte';
  }
  if (/(asado|carne|vacio|vacío|chorizo|pizza|empanada|cena|almuerzo|comida|picada|medialuna|pan|hielo|carbon|carbón)/.test(lower)) {
    return 'comida';
  }
  return 'otros';
}

function findMatchingParticipant(candidate: string, known: string[]): string {
  const clean = candidate.trim();
  const existing = known.find((k) => k.toLowerCase() === clean.toLowerCase());
  return existing || capitalize(clean);
}

/**
 * Deterministic JavaScript natural-language parser for Spanish expense splitting.
 * Handles single payers, partial/multi payers, and alcohol/food exclusions.
 */
export function smartParseExpenseJS(
  input: string,
  existingParticipants: string[]
): SmartParseOutput {
  const normalized = input.trim();
  if (!normalized) {
    return { newParticipants: [], expenses: [], note: 'No se ingresó texto.' };
  }

  const discoveredNames = new Set<string>(existingParticipants);
  const newParticipantsSet = new Set<string>();

  const registerName = (raw: string): string => {
    const matched = findMatchingParticipant(raw, Array.from(discoveredNames));
    if (!discoveredNames.has(matched)) {
      discoveredNames.add(matched);
      newParticipantsSet.add(matched);
    }
    return matched;
  };

  // Pre-scan explicit payer & exclusion phrases for person names
  const nameMatches = normalized.matchAll(
    /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,18})\s+(?:pag[oó]|puso|no\s+(?:toma|toman|tom[oó]|come|comen|comi[oó]))/g
  );
  for (const m of nameMatches) {
    if (!STOPWORDS.has(m[1].toLowerCase())) {
      registerName(m[1]);
    }
  }

  // Split by sentences or line breaks, keeping clauses intact
  const clauses = normalized
    .split(/(?:\.\s+|\n|;\s+)/)
    .map((c) => c.trim())
    .filter(Boolean);

  const expenses: ParsedExpenseDraft[] = [];

  for (const clause of clauses) {
    // Check for multi-payer pattern like "Marcos pagó $45.000 y Sofía puso $25.500"
    const payerPairs: { name: string; amount: number }[] = [];
    const multiPayerRegex =
      /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,18})\s+(?:pag[oó]|puso)\s+\$?\s*([\d.,]+)/gi;
    let mpMatch: RegExpExecArray | null;
    while ((mpMatch = multiPayerRegex.exec(clause)) !== null) {
      const candidate = mpMatch[1];
      if (!STOPWORDS.has(candidate.toLowerCase())) {
        const amt = parseNumericAmount(mpMatch[2]);
        if (amt > 0) {
          payerPairs.push({ name: registerName(candidate), amount: amt });
        }
      }
    }

    // Check for single payer without amount immediately after verb: "pagó Santi" / "puso Lucas"
    if (payerPairs.length === 0) {
      const singlePayerMatch = clause.match(
        /(?:pag[oó]|puso)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,18})/i
      );
      if (singlePayerMatch && !STOPWORDS.has(singlePayerMatch[1].toLowerCase())) {
        const payerName = registerName(singlePayerMatch[1]);
        const allAmounts = Array.from(clause.matchAll(/\$?\s*([\d]{1,3}(?:\.\d{3})+|\d{3,})/g))
          .map((m) => parseNumericAmount(m[1]))
          .filter((n) => n > 0);
        const mainAmount = allAmounts[0] ?? 0;
        if (mainAmount > 0) {
          payerPairs.push({ name: payerName, amount: mainAmount });
        }
      }
    }

    // Extract exclusions like "pero Sofía y Lucía no toman" or "menos Tomi"
    const excludedParticipants: string[] = [];
    const exclusionSegmentMatch = clause.match(
      /(?:pero|menos|excepto|sin)\s+([^.]+)$/i
    );
    if (exclusionSegmentMatch) {
      const seg = exclusionSegmentMatch[1];
      const tokens = seg.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,18}\b/g) ?? [];
      for (const tok of tokens) {
        if (!STOPWORDS.has(tok.toLowerCase())) {
          excludedParticipants.push(registerName(tok));
        }
      }
    }

    // Determine main expense amount
    const totalFromPayers = payerPairs.reduce((s, p) => s + p.amount, 0);
    const amountMatches = Array.from(
      clause.matchAll(/\$\s*([\d.,]+)|(\b\d{1,3}(?:\.\d{3})+\b|\b\d{4,}\b)/g)
    )
      .map((m) => parseNumericAmount(m[1] || m[2] || ''))
      .filter((n) => n > 0);

    const amount = totalFromPayers > 0 ? totalFromPayers : amountMatches[0] ?? 0;

    // Handle sub-exclusions inside a single clause (e.g. "Juli no come pizza ($14.800) y Lucas no tomó cerveza ($13.500)")
    const subExclusions = Array.from(
      clause.matchAll(
        /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,18})\s+no\s+(?:come|comi[oó]|toma|tom[oó])\s+([a-záéíóúñ\s]{2,28}?)\s*\(\$?\s*([\d.,]+)\)/gi
      )
    );

    if (subExclusions.length > 0 && amount > 0) {
      let remainingAmount = amount;
      const totalPayersSum = payerPairs.reduce((s, p) => s + p.amount, 0) || amount;

      for (const sub of subExclusions) {
        const excludedName = registerName(sub[1]);
        const itemLabel = capitalize(sub[2].trim());
        const itemAmt = parseNumericAmount(sub[3]);
        if (itemAmt > 0 && itemAmt <= remainingAmount) {
          remainingAmount -= itemAmt;
          const scaledPayers =
            payerPairs.length > 0
              ? payerPairs.map((p) => ({
                  name: p.name,
                  amount: Math.round((p.amount / totalPayersSum) * itemAmt),
                }))
              : [{ name: Array.from(discoveredNames)[0] || 'Pagador', amount: itemAmt }];

          expenses.push({
            description: itemLabel,
            amount: itemAmt,
            category: detectCategory(itemLabel),
            payers: scaledPayers,
            excludedParticipants: [excludedName],
          });
        }
      }

      if (remainingAmount > 0) {
        const descMatch = clause.split(/[:$]/)[0]?.trim() || 'Resto compartido';
        const scaledPayers =
          payerPairs.length > 0
            ? payerPairs.map((p) => ({
                name: p.name,
                amount: Math.round((p.amount / totalPayersSum) * remainingAmount),
              }))
            : [{ name: Array.from(discoveredNames)[0] || 'Pagador', amount: remainingAmount }];

        expenses.push({
          description: `${descMatch} (resto compartido)`,
          amount: remainingAmount,
          category: detectCategory(descMatch),
          payers: scaledPayers,
          excludedParticipants: [],
        });
      }
      continue;
    }

    if (amount > 0) {
      // Build concise description from beginning of clause before amount/payer keywords
      let description = clause
        .split(/(?:\$|pag[oó]|puso|pero|menos)/i)[0]
        .replace(/[:,-]+$/, '')
        .trim();

      if (!description || description.length < 2) {
        description = 'Gasto compartido';
      }

      const finalPayers =
        payerPairs.length > 0
          ? payerPairs
          : [
              {
                name: Array.from(discoveredNames)[0] || 'Pagador',
                amount,
              },
            ];

      expenses.push({
        description: description.charAt(0).toUpperCase() + description.slice(1),
        amount,
        category: detectCategory(clause),
        payers: finalPayers,
        excludedParticipants,
      });
    }
  }

  return {
    newParticipants: Array.from(newParticipantsSet),
    expenses,
    note:
      expenses.length > 0
        ? `Motor local JS detectó ${expenses.length} ${expenses.length === 1 ? 'gasto' : 'gastos'}.`
        : 'No se detectaron montos claros. Probá incluir el valor con "$" (ej: "Pizza $15.000 pagó Marcos").',
  };
}
