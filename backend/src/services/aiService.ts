import * as llm from '../utils/llmClient.js';
import * as heuristics from '../utils/heuristicEngine.js';

/**
 * aiService — turns raw CSV rows into clean GrowEasy CRM records.
 *
 * Single-call design: one Gemini request per batch does the whole job —
 * understand the columns, clean/normalize the values, enforce the enums, and
 * score its own confidence. Each row carries an explicit `_row_index` so the
 * response can be re-aligned to the correct input row even if the model
 * drops or reorders an entry mid-batch (not just at the tail).
 *
 * With no API key it falls back to the local heuristicEngine, which is
 * strong on clean data but — like any regex-based fallback — weaker than a
 * real LLM call on very ambiguous headers or free-text-heavy sheets. See
 * llmClient.js / server.js `/health` for how the active engine is surfaced
 * to the frontend, so it's never silently unclear which one produced a
 * given import.
 */

const CRM_STATUS = ['GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE'];
const DATA_SOURCE = ['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots'];

const dataProps = {
  created_at: { type: 'STRING', description: 'Creation date/time. MUST be parseable by JS new Date(). If missing, use the provided "now" value.' },
  name: { type: 'STRING', description: 'Full name; merge first/last/salutation columns into one clean name.' },
  email: { type: 'STRING', description: 'Primary email only. Extra emails go into crm_note.' },
  country_code: { type: 'STRING', description: 'Dialing code with a leading +, e.g. +91. Infer from the number if a code is embedded. If NO code is present in the source at all and the number is a plausible bare 10-digit Indian mobile, default to "+91" (GrowEasy\'s leads are India-based) rather than leaving this blank.' },
  mobile_without_country_code: { type: 'STRING', description: 'Digits only, without the country code.' },
  company: { type: 'STRING' },
  city: { type: 'STRING' },
  state: { type: 'STRING' },
  country: { type: 'STRING' },
  lead_owner: { type: 'STRING' },
  crm_status: { type: 'STRING', enum: CRM_STATUS, description: 'One of the 4 enums, or blank if genuinely unclear.' },
  crm_note: { type: 'STRING', description: 'Remarks + follow-up notes + ANY extra emails/phones + other useful unmapped info. Escape newlines as \\n.' },
  data_source: { type: 'STRING', enum: DATA_SOURCE, description: 'One of the 5 enums, or blank if none match confidently.' },
  possession_time: { type: 'STRING' },
  description: { type: 'STRING', description: 'A ONE-LINE summary of what the customer wants/needs (budget, unit type, timeline). Put everything else — remarks, call outcomes, extra contacts — in crm_note instead, to avoid duplicating the same text in both fields.' },
};

const responseSchema = {
  type: 'OBJECT',
  properties: {
    records: {
      type: 'ARRAY',
      description: 'Exactly one entry per input row. Order does not have to be preserved — each entry MUST carry the row_index it corresponds to.',
      items: {
        type: 'OBJECT',
        required: ['row_index', 'status', 'confidence'],
        properties: {
          row_index: { type: 'NUMBER', description: 'The _row_index value copied verbatim from the input row this record was built from.' },
          status: { type: 'STRING', enum: ['success', 'skipped'] },
          reason: { type: 'STRING', description: 'Why the row was skipped (only when status = skipped).' },
          confidence: { type: 'NUMBER', description: 'Integer 0-100. See scoring rubric.' },
          data: { type: 'OBJECT', properties: dataProps },
        },
      },
    },
  },
  required: ['records'],
};

const SYSTEM = [
  'You are GrowEasy\'s senior data-onboarding specialist.',
  'You convert messy, inconsistently-formatted CSV lead rows into the fixed GrowEasy CRM schema.',
  'You are precise: you never invent contact details, never rename fields, and you output ONLY the JSON demanded by the schema.',
  'You understand real-world lead exports (Facebook, Google Ads, real-estate CRMs, hand-made sheets) and their quirks.',
  'You NEVER drop, merge, or silently skip a row without emitting a matching row_index with status="skipped" — every input row_index must appear exactly once in your output.',
].join(' ');

class AIService {
  /**
   * Extract one batch of rows into CRM records.
   */
  async processBatch(records: any[], mapping: Record<string, string> = {}, apiKey?: string): Promise<any[]> {
    if (!llm.isConfigured(apiKey)) {
      return heuristics.extractBatch(records);
    }

    try {
      return await this.processBatchViaLLM(records, mapping, apiKey);
    } catch (err: any) {
      // Adaptive retry: a truncated/oversized response (e.g. many rows with
      // long free-text notes hitting maxOutputTokens) will fail JSON.parse.
      // Retrying the SAME batch size just hits the same wall again, so once
      // we're down to a genuine parse/shape failure (not a transient network
      // error — llmClient already retried those), split the batch in half
      // and recurse, rather than giving up on the whole batch.
      const isShapeFailure = err.message === 'Empty response from Gemini' || err instanceof SyntaxError || err.message === 'MALFORMED_LLM_RESPONSE';
      if (isShapeFailure && records.length > 1) {
        const mid = Math.ceil(records.length / 2);
        const [left, right] = [records.slice(0, mid), records.slice(mid)];
        const [leftOut, rightOut] = await Promise.all([
          this.processBatch(left, mapping, apiKey).catch(() => heuristics.extractBatch(left)),
          this.processBatch(right, mapping, apiKey).catch(() => heuristics.extractBatch(right)),
        ]);
        return leftOut.concat(rightOut);
      }
      throw err;
    }
  }

  async processBatchViaLLM(records: any[], mapping: Record<string, string>, apiKey?: string): Promise<any[]> {
    const indexed = records.map((r, i) => ({ ...r, _row_index: i }));
    const result = await llm.completeJSON({
      system: SYSTEM,
      prompt: this.buildPrompt(indexed, mapping),
      geminiSchema: responseSchema,
      apiKey,
    });
    return this.normalize(result.records || [], records);
  }

  /**
   * Guard against model slips: re-align every record to its original row by
   * row_index (catches drops/reorders anywhere in the batch, not just at the
   * tail), clamp confidence, and enforce the "no contact => skip" rule even
   * if the model forgot it.
   */
  normalize(records: any[], inputRows: any[]): any[] {
    const byIndex = new Map();
    for (const r of records) {
      const idx = Number(r.row_index);
      if (Number.isInteger(idx) && idx >= 0 && idx < inputRows.length && !byIndex.has(idx)) {
        byIndex.set(idx, r);
      }
    }

    return inputRows.map((_, idx) => {
      const r = byIndex.get(idx);
      if (!r) {
        // The model never returned this row_index at all — recover it
        // locally instead of silently losing the record.
        return heuristics.extractRow(inputRows[idx]);
      }

      let confidence = Number(r.confidence);
      if (!Number.isFinite(confidence)) confidence = 70;
      confidence = Math.max(0, Math.min(100, Math.round(confidence)));

      const data = r.data || {};
      const hasContact = Boolean((data.email && data.email.trim()) || (data.mobile_without_country_code && String(data.mobile_without_country_code).trim()));

      if (r.status !== 'skipped' && !hasContact) {
        return { status: 'skipped', reason: 'No email or mobile number found', confidence: 100, data: {} };
      }
      return { status: r.status || 'success', reason: r.reason || '', confidence, data };
    });
  }

  buildPrompt(indexedRecords: any[], mapping: Record<string, string>): string {
    const headers = indexedRecords.length ? Object.keys(indexedRecords[0]).filter((h) => h !== '_row_index') : [];
    const mappingText = mapping && Object.keys(mapping).length
      ? `A quick automated pass suggests this column -> CRM field mapping (a hint — trust the actual cell values over it when they disagree):\n${JSON.stringify(mapping, null, 2)}\n\n`
      : '';

    return `${mappingText}CSV headers: ${JSON.stringify(headers)}

Convert the ${indexedRecords.length} rows below into clean GrowEasy CRM records. Each input row carries a "_row_index" — copy that exact value into "row_index" on the matching output record. Every row_index from 0 to ${indexedRecords.length - 1} must appear EXACTLY ONCE in your output, either as a successful record or as status="skipped".

FIELD RULES (follow exactly):
1. crm_status ∈ {GOOD_LEAD_FOLLOW_UP, DID_NOT_CONNECT, BAD_LEAD, SALE_DONE} — map synonyms (e.g. "won/booked"→SALE_DONE, "no answer/busy"→DID_NOT_CONNECT, "junk/not interested"→BAD_LEAD, "interested/new/hot"→GOOD_LEAD_FOLLOW_UP). Blank ONLY if truly unknown.
2. data_source ∈ {leads_on_demand, meridian_tower, eden_park, varah_swamy, sarjapur_plots} — match project/campaign/source names loosely. Blank if none fit.
3. created_at: OUTPUT in unambiguous ISO 8601 format ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss") — never copy an ambiguous "DD-MM-YYYY"-style string through as-is, because whoever reads this field later will call new Date(created_at) themselves, and a string like "03-06-2026" would silently be re-misread as March 6 at THAT point even if you interpreted it correctly here. Numeric source dates without a month name (e.g. "01-06-2026") are DAY-FIRST (DD-MM-YYYY) — GrowEasy's leads are India-based, NOT the US month-first convention — unless the first number is > 12 (then it must be MM-DD). If the date is absent or unparseable even after this reasoning, output "${new Date().toISOString()}".
4. Merge first/last/title columns into a single clean "name" (proper capitalization).
5. Phone: separate the dialing code (e.g. +91) into country_code; keep only the local digits in mobile_without_country_code. If the source has NO country code at all and the number is a plausible bare 10-digit Indian mobile, default country_code to "+91" rather than leaving it blank.
6. Multiple emails/phones in one row → keep the FIRST in email/mobile, append the rest to crm_note ("Additional email: ...", "Additional phone: ..."). Scan EVERY column for this, not just the obvious contact field — a stray phone number mentioned inside a free-text remarks/comments column (e.g. "wife's number is also 98xxxxxxx") still counts and must be captured, not dropped.
7. crm_note holds remarks, comments, follow-up notes, extra contacts, and any useful column that maps to no field. Keep it ONE line — escape newlines as \\n. "description" is different: it's a ONE-LINE summary of what the customer wants (budget/unit/timeline) — don't duplicate the same text in both description and crm_note.
8. If a row has NEITHER a valid email NOR a phone number → status="skipped", reason="No email or mobile number found", and leave data empty. Never omit a row_index instead of marking it skipped.

CONFIDENCE RUBRIC (0-100 integer, be honest and vary it):
- 90-100: clear column names, clean values, status & source unambiguous.
- 70-89: mostly clear but you had to infer 1-2 fields or normalize a status/source.
- 50-69: several ambiguous columns, guessed the mapping, or noisy values.
- <50: barely enough signal; contact found but most fields uncertain.
Do NOT return the same confidence for every row — reflect each row's real clarity.

ROWS (each includes its _row_index):
${JSON.stringify(indexedRecords, null, 2)}`;
  }

  /** Exposed for tests / fallback callers. */
  processBatchHeuristics(records: any[]) {
    return heuristics.extractBatch(records);
  }
}

export default new AIService();
