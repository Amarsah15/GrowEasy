/**
 * heuristicEngine — the local, zero-cost extraction engine.
 *
 * This runs when no Gemini key is configured (and its header classifier also
 * powers the "mapping hint" fed into the real Gemini prompt — see
 * mappingService.js / aiService.js). It is designed to be genuinely good on
 * its own: instead of only matching on column *names*, it also scans cell
 * *values* with regexes, so it finds emails, phone numbers, statuses, sources,
 * and dates even in badly-named, abbreviated, or header-less columns.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Phone: optional +, then 7-15 digits allowing spaces / dashes / parens / dots.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
// A "pure date-shaped" value: DD/MM/YYYY, YYYY-MM-DD, DD-Mon-YYYY, etc. Used to
// stop date values from being misread as phone numbers in unmapped columns.
const DATE_SHAPE_RE = /^\s*\d{1,4}[/\-.\s]\s*[A-Za-z]{0,9}[/\-.\s]?\s*\d{2,4}(\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM|am|pm)?)?\s*$/;

// Common country dialing codes (longest-first so +91 beats +9, etc.)
const DIAL_CODES = ['+971', '+966', '+880', '+977', '+91', '+92', '+94', '+61', '+64', '+44', '+49', '+33', '+65', '+60', '+1'];

const STATUS_SYNONYMS = [
  { value: 'SALE_DONE', keys: ['sale', 'sold', 'closed won', 'won', 'done', 'converted', 'booking', 'booked', 'purchase', 'deal closed', 'success'] },
  { value: 'BAD_LEAD', keys: ['bad', 'junk', 'spam', 'invalid', 'not interested', 'lost', 'closed lost', 'dead', 'unqualified', 'fake', 'wrong number', 'do not'] },
  { value: 'DID_NOT_CONNECT', keys: ['not connect', 'no answer', 'no response', 'unreachable', 'busy', 'switched off', 'call back', 'callback', 'ringing', 'follow up later', 'not reachable', 'dnp', 'nc'] },
  { value: 'GOOD_LEAD_FOLLOW_UP', keys: ['good', 'follow up', 'followup', 'interested', 'hot', 'warm', 'qualified', 'new', 'contacted', 'in progress', 'nurture', 'potential'] },
];

const SOURCE_SYNONYMS = [
  { value: 'leads_on_demand', keys: ['leads on demand', 'leads_on_demand', 'lod', 'on demand', 'ondemand'] },
  { value: 'meridian_tower', keys: ['meridian', 'meridian tower', 'meridian_tower'] },
  { value: 'eden_park', keys: ['eden', 'eden park', 'eden_park'] },
  { value: 'varah_swamy', keys: ['varah', 'swamy', 'varah swamy', 'varah_swamy'] },
  { value: 'sarjapur_plots', keys: ['sarjapur', 'sarjapur plots', 'sarjapur_plots'] },
];

const CRM_STATUS_VALUES = ['GOOD_LEAD_FOLLOW_UP', 'DID_NOT_CONNECT', 'BAD_LEAD', 'SALE_DONE'];
const DATA_SOURCE_VALUES = ['leads_on_demand', 'meridian_tower', 'eden_park', 'varah_swamy', 'sarjapur_plots'];

const FIELD_ALIASES: Array<[string, string[]]> = [
  // --- Precise / compound fields first (avoid collisions) ---
  ['lead_owner', ['owner', 'agent', 'assignedto', 'salesrep', 'handledby', 'counselor', 'leadowner']],
  ['crm_status', ['status', 'stage', 'disposition', 'leadstatus', 'outcome', 'currentstage']],
  ['data_source', ['source', 'campaign', 'project', 'property', 'utmsource', 'adset', 'medium', 'channel', 'sourcecampaign']],
  ['created_at', ['created', 'createdat', 'date', 'time', 'timestamp', 'submitted', 'submittedon', 'leaddate', 'added', 'datereceived']],
  ['possession_time', ['possession', 'movein', 'handover', 'possessiontimeline']],
  ['country_code', ['countrycode', 'isd', 'dialcode']],
  ['first_name', ['firstname', 'fname', 'first']],
  ['last_name', ['lastname', 'lname', 'last', 'surname']],

  // --- Location fields (checked before generic "name"/"contact" catch-alls) ---
  ['city', ['city', 'town', 'citylocation']],
  ['state', ['state', 'province', 'stateregion']],
  ['country', ['country', 'cntry', 'nation']],

  ['company', ['company', 'organisation', 'organization', 'org', 'firm']],
  ['email', ['email', 'mail', 'emailaddress', 'emailid']],
  ['phone', ['phone', 'mobile', 'phoneno', 'whatsapp', 'contactno', 'contactnumber', 'cell', 'alternatephone', 'alternatecontact']],
  ['crm_note', ['note', 'remark', 'comment', 'message', 'feedback', 'query', 'commentsremarks']],
  ['description', ['description', 'detail', 'requirement', 'about', 'desc']],

  // --- Generic name / contact catch-alls LAST, so nothing specific above
  //     ever gets hijacked by these broad keywords. ---
  ['name', ['fullname', 'name', 'contactname', 'leadname', 'customername', 'customer', 'client', 'prospect', 'leaddetails']],
];

const EXACT_SHORT_CODES: Record<string, string> = {
  st: 'state',
  stat: 'crm_status',
  src: 'data_source',
  dt: 'created_at',
  cty: 'country',
  loc: 'city',
  ph: 'phone',
  cc: 'country_code',
  cust: 'name',
  mob: 'phone',
};

const norm = (s: any): string => String(s == null ? '' : s).trim();
const key = (s: any): string => norm(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const NON_PERSON_NAME_PREFIXES = ['form', 'ad', 'campaign', 'file', 'project', 'product', 'event', 'brand', 'account', 'company', 'organisation', 'organization', 'source', 'field', 'adset'];
const isNonPersonNameHeader = (k: string): boolean => NON_PERSON_NAME_PREFIXES.some((p) => k === `${p}name`);

export interface LeadData {
  created_at: string;
  name: string;
  email: string;
  country_code: string;
  mobile_without_country_code: string;
  company: string;
  city: string;
  state: string;
  country: string;
  lead_owner: string;
  crm_status: string;
  crm_note: string;
  data_source: string;
  possession_time: string;
  description: string;
}

export interface HeuristicRecord {
  status: 'success' | 'skipped';
  reason: string;
  confidence: number;
  data: Partial<LeadData> | Record<string, never>;
}

/** Classify a header into a CRM field by name (used as a hint, not the law). */
export function classifyHeader(header: string): string {
  const k = key(header);
  if (!k) return 'unmapped';

  // 1. Exact short-code table wins outright (no substring ambiguity possible).
  if (Object.prototype.hasOwnProperty.call(EXACT_SHORT_CODES, k)) {
    return EXACT_SHORT_CODES[k];
  }

  // 2. Walk the precedence-ordered alias table. Exact match first, then a
  //    two-way substring check guarded by a minimum length so short strings
  //    can't wildcard-match into unrelated long aliases.
  for (const [field, aliases] of FIELD_ALIASES) {
    for (const alias of aliases) {
      if (k === alias) return field;
    }
  }
  for (const [field, aliases] of FIELD_ALIASES) {
    for (const alias of aliases) {
      const shorter = Math.min(k.length, alias.length);
      if (shorter < 3) continue; // avoid short/ambiguous substrings entirely here
      if (field === 'name' && (k.includes('name') || alias.includes('name'))) {
        // Guard the generic "name" substring match: skip it if the header
        // is actually some other kind of "*_name" field (form_name, ad_name,
        // campaign_name, ...), so those fall through to "unmapped" /
        // crm_note instead of polluting the customer's name.
        if (isNonPersonNameHeader(k)) continue;
      }
      if (k.includes(alias) || alias.includes(k)) return field;
    }
  }

  return 'unmapped';
}

export function mapStatus(value: string): string {
  const v = norm(value);
  if (!v) return '';
  // Exact enum match first (case-insensitive) — trust it over keyword guessing.
  const exact = CRM_STATUS_VALUES.find((s) => s.toLowerCase() === v.toLowerCase());
  if (exact) return exact;

  const vl = v.toLowerCase();
  for (const { value: out, keys } of STATUS_SYNONYMS) {
    if (keys.some((kw) => vl.includes(kw))) return out;
  }
  return '';
}

export function mapSource(value: string): string {
  const v = norm(value);
  if (!v) return '';
  const exact = DATA_SOURCE_VALUES.find((s) => s.toLowerCase() === v.toLowerCase());
  if (exact) return exact;

  const vl = v.toLowerCase();
  for (const { value: out, keys } of SOURCE_SYNONYMS) {
    if (keys.some((kw) => vl.includes(kw))) return out;
  }
  return '';
}

/** True if a raw cell value is short and looks like a status/source word, not a sentence. */
function looksLikeShortLabel(value: string): boolean {
  const v = norm(value);
  return v.length > 0 && v.length <= 35;
}

/** True if a raw cell value is date-shaped (so we should never treat it as a phone number). */
export function looksLikeDate(value: string): boolean {
  const v = norm(value);
  if (!v) return false;
  if (/^\d+$/.test(v)) return false; // plain integers are not dates here (avoid false positives)
  if (DATE_SHAPE_RE.test(v)) return true;
  const d = new Date(v);
  return !isNaN(d.getTime()) && /[/\-.]/.test(v);
}

/** Split a raw phone string into { country_code, number }. */
export function splitPhone(raw: string): { country_code: string; number: string } {
  let s = norm(raw).replace(/[^\d+]/g, '');
  if (!s) return { country_code: '', number: '' };

  if (s.startsWith('+')) {
    for (const code of DIAL_CODES) {
      if (s.startsWith(code) && s.length > code.length) {
        return { country_code: code, number: s.slice(code.length) };
      }
    }
    // Unknown +code: assume 1-3 digit code, leave last 10 as the number.
    if (s.length > 10) return { country_code: s.slice(0, s.length - 10), number: s.slice(-10) };
    return { country_code: '', number: s.replace('+', '') };
  }

  // No dialing code in the raw text at all.
  if (s.length === 10) {
    // Bare 10-digit number: GrowEasy's leads are India-based, default to +91
    // rather than leaving country_code blank (matches the assignment's own
    // sample data, which always shows +91).
    return { country_code: '+91', number: s };
  }
  if (s.length === 11 && s.startsWith('0')) {
    // Indian domestic "trunk 0" prefix (e.g. 09845678901) — strip the leading
    // 0, it is NOT a country code.
    return { country_code: '+91', number: s.slice(1) };
  }
  if (s.length > 10) {
    // e.g. 919876543210 -> +91 / 9876543210
    return { country_code: `+${s.slice(0, s.length - 10)}`, number: s.slice(-10) };
  }
  return { country_code: '+91', number: s };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Parse a "DD-MM-YYYY" / "DD/MM/YYYY" style date (optionally with a trailing
 * time) WITHOUT the day/month-swap ambiguity that plain `new Date()` has.
 *
 * GrowEasy's leads are India-based, where numeric dates are written
 * day-first. JS's native Date parser assumes the US month-first convention
 * instead, so "01-06-2026" (1 June) silently becomes "January 6" — a real
 * data-corruption risk. This parses the two leading numeric parts as
 * DD-MM by default, and only swaps them if that reading is impossible
 * (e.g. "13-05-2026" -> day=13 can't be a month, so it must be DD-MM; a
 * value like "06-13-2026" -> month=13 is impossible for MM, so it must
 * actually be MM-DD).
 */
function parseDayFirstDate(raw: string): string | null {
  const v = norm(raw);
  const m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/);
  if (!m) return null;

  let [, aStr, bStr, year, hh, mm, ss, ampm] = m;
  let a = Number(aStr);
  let b = Number(bStr);
  let day = a;
  let month = b;

  if (month > 12 && day <= 12) {
    // Only valid reading is MM-DD (the "day" slot must actually be the month).
    day = b; month = a;
  }
  // If both a and b are <= 12 the format is genuinely ambiguous — default to
  // day-first (DD-MM), matching the source market's convention.
  if (month > 12 || day > 31) return null; // not a valid date after all

  let hour = hh ? Number(hh) : 0;
  const minute = mm ? Number(mm) : 0;
  const second = ss ? Number(ss) : 0;
  if (ampm) {
    const isPM = ampm.toLowerCase() === 'pm';
    if (isPM && hour < 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
  }

  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function parseDate(raw: string): string {
  const v = norm(raw);
  if (v) {
    const dayFirst = parseDayFirstDate(v);
    if (dayFirst) return dayFirst;

    // Fall back to native parsing for formats with a month NAME (e.g.
    // "16-Jun-26", "02-Jun-2026 16:20") — there's no day/month ambiguity
    // once a month name is present, so the native parser is safe here.
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().replace('T', ' ').substring(0, 19);
  }
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function isPureContact(value: string, field: string): boolean {
  if (field === 'lead_owner' || field === 'created_at') return false;
  const v = norm(value);
  if (!v) return false;
  const emailMatch = v.match(EMAIL_RE);
  if (emailMatch && emailMatch[0].length === v.length) {
    return true;
  }
  const phoneMatch = v.match(PHONE_RE);
  if (phoneMatch) {
    const stripped = v.replace(EMAIL_RE, '').replace(PHONE_RE, '').replace(/[^a-zA-Z0-9]/g, '').trim();
    if (stripped.length <= 3) {
      return true;
    }
  }
  return false;
}

function isPhoneLikelyHeader(header: string): boolean {
  const k = key(header);
  if (classifyHeader(header) === 'phone') return true;
  const phoneKeywords = ['phone', 'mobile', 'contact', 'call', 'ph', 'mob', 'tel', 'alternate', 'alt'];
  if (phoneKeywords.some((kw) => k.includes(kw))) {
    const noteKeywords = ['note', 'remark', 'comment', 'feedback', 'desc', 'message', 'query'];
    if (!noteKeywords.some((kw) => k.includes(kw))) {
      return true;
    }
  }
  return false;
}

function isEmailLikelyHeader(header: string): boolean {
  const k = key(header);
  if (classifyHeader(header) === 'email') return true;
  const emailKeywords = ['email', 'mail', 'contact', 'alternate', 'alt'];
  if (emailKeywords.some((kw) => k.includes(kw))) {
    const noteKeywords = ['note', 'remark', 'comment', 'feedback', 'desc', 'message', 'query'];
    if (!noteKeywords.some((kw) => k.includes(kw))) {
      return true;
    }
  }
  return false;
}

/**
 * Extract one row into a CRM record (or a skip verdict).
 * @param {Record<string, any>} row  raw CSV row (header -> value)
 */
export function extractRow(row: Record<string, any>): HeuristicRecord {
  const rec: LeadData = {
    created_at: '', name: '', email: '', country_code: '', mobile_without_country_code: '',
    company: '', city: '', state: '', country: '', lead_owner: '', crm_status: '',
    crm_note: '', data_source: '', possession_time: '', description: '',
  };

  let first = '';
  let last = '';
  const primaryEmails: string[] = [];
  const secondaryEmails: string[] = [];
  const primaryPhones: string[] = [];
  const secondaryPhones: string[] = [];
  const noteParts: string[] = [];
  let rawStatus = '';
  let rawSource = '';
  let rawDate = '';
  let mappedCols = 0;
  let totalCols = 0;

  // Track whether status/source/date were ever explicitly mapped by a
  // header, so the value-level fallback scan (below) only kicks in when the
  // header-based pass truly found nothing for that field.
  let statusMappedByHeader = false;
  let sourceMappedByHeader = false;
  let dateMappedByHeader = false;

  const unmappedEntries: Array<{ header: string; value: string }> = []; // { header, value } — revisited after the header pass

  // 1. Pre-scan all column values in the row to find all emails and phone numbers.
  for (const [header, valueRaw] of Object.entries(row)) {
    const value = norm(valueRaw);
    if (value === '') continue;
    const field = classifyHeader(header);
    if (field !== 'lead_owner' && field !== 'created_at') {
      const foundEmails = value.match(EMAIL_RE);
      if (foundEmails) {
        if (isEmailLikelyHeader(header)) {
          foundEmails.forEach((e) => primaryEmails.push(e.trim()));
        } else {
          foundEmails.forEach((e) => secondaryEmails.push(e.trim()));
        }
      }
      if (!looksLikeDate(value)) {
        const foundPhones = value.match(PHONE_RE);
        if (foundPhones) {
          if (isPhoneLikelyHeader(header)) {
            foundPhones.forEach((p) => primaryPhones.push(p.trim()));
          } else {
            foundPhones.forEach((p) => secondaryPhones.push(p.trim()));
          }
        }
      }
    }
  }

  // Combine so primary fields have priority
  const emails = [...primaryEmails, ...secondaryEmails];
  const phones = [...primaryPhones, ...secondaryPhones];

  for (const [header, valueRaw] of Object.entries(row)) {
    const value = norm(valueRaw);
    if (value === '') continue;
    totalCols += 1;
    const field = classifyHeader(header);

    if (isPureContact(value, field)) {
      mappedCols += 1;
      continue;
    }

    switch (field) {
      case 'first_name': first = value; mappedCols += 1; break;
      case 'last_name': last = value; mappedCols += 1; break;
      case 'name': rec.name = rec.name ? `${rec.name} ${value}` : value; mappedCols += 1; break;
      case 'email': mappedCols += 1; break; // already captured by the regex scan above
      case 'country_code':
        rec.country_code = value.startsWith('+') ? value : `+${value.replace(/\D/g, '')}`;
        mappedCols += 1; break;
      case 'phone': {
        const found = value.match(PHONE_RE) || [value];
        found.forEach((p) => phones.push(p));
        mappedCols += 1; break;
      }
      case 'company': rec.company = value; mappedCols += 1; break;
      case 'city': rec.city = value; mappedCols += 1; break;
      case 'state': rec.state = value; mappedCols += 1; break;
      case 'country': rec.country = value; mappedCols += 1; break;
      case 'lead_owner': rec.lead_owner = value; mappedCols += 1; break;
      case 'crm_status': rawStatus = value; statusMappedByHeader = true; mappedCols += 1; break;
      case 'data_source': rawSource = value; sourceMappedByHeader = true; mappedCols += 1; break;
      case 'possession_time': rec.possession_time = value; mappedCols += 1; break;
      case 'crm_note': noteParts.push(value); mappedCols += 1; break;
      case 'description': rec.description = value; mappedCols += 1; break;
      case 'created_at': rawDate = value; dateMappedByHeader = true; mappedCols += 1; break;
      default: {
        // Unknown column — hold onto it, resolved in a second pass below
        // once we know whether status/source/date already have a home.
        unmappedEntries.push({ header, value });
      }
    }
  }

  // Second pass over genuinely unmapped columns: try value-shape detection
  // (date first, since a date-shaped string must never become a phone
  // number), then value-content detection (does this look like a known
  // status/source enum?), and only fall back to "maybe a phone" / notes
  // after that.
  for (const { header, value } of unmappedEntries) {
    if (looksLikeDate(value) && !dateMappedByHeader && !rawDate) {
      rawDate = value;
      continue;
    }
    if (!statusMappedByHeader && !rawStatus && looksLikeShortLabel(value) && mapStatus(value)) {
      rawStatus = value;
      continue;
    }
    if (!sourceMappedByHeader && !rawSource && looksLikeShortLabel(value) && mapSource(value)) {
      rawSource = value;
      continue;
    }
    if (looksLikeDate(value)) {
      // Already have a date from elsewhere — don't let a second date-shaped
      // value get misread as a phone number either; park it in notes.
      noteParts.push(`${header}: ${value}`);
      continue;
    }
    const found = value.match(PHONE_RE);
    if (found) {
      found.forEach((p) => phones.push(p));
      const cleanVal = value.replace(PHONE_RE, '').replace(/[^a-zA-Z0-9]/g, '').trim();
      if (cleanVal.length > 3) {
        noteParts.push(`${header}: ${value}`);
      }
    } else {
      noteParts.push(`${header}: ${value}`);
    }
  }

  // Assemble name
  if (!rec.name) rec.name = [first, last].filter(Boolean).join(' ').trim();

  // De-dupe contacts, keep first, push extras to notes
  const uniqEmails = [...new Set(emails.filter(Boolean))];
  const uniqPhones = [...new Set(phones.map((p) => norm(p)).filter(Boolean))];

  if (uniqEmails.length === 0 && uniqPhones.length === 0) {
    return { status: 'skipped', reason: 'No email or mobile number found', confidence: 100, data: {} };
  }

  rec.email = uniqEmails[0] || '';
  uniqEmails.slice(1).forEach((e) => noteParts.push(`Additional email: ${e}`));

  if (uniqPhones.length) {
    const primary = splitPhone(uniqPhones[0]);
    if (!rec.country_code) rec.country_code = primary.country_code;
    rec.mobile_without_country_code = primary.number;
    uniqPhones.slice(1).forEach((p) => noteParts.push(`Additional phone: ${p}`));
  }

  rec.crm_status = mapStatus(rawStatus);
  rec.data_source = mapSource(rawSource);
  rec.created_at = parseDate(rawDate);
  rec.crm_note = noteParts.join(' | ').replace(/\r?\n/g, '\\n');

  // ---- Confidence ----
  // Start from how much of the row we could place, then reward strong signals.
  let confidence = totalCols > 0 ? Math.round((mappedCols / totalCols) * 100) : 60;
  if (rec.email) confidence += 8;
  if (rec.mobile_without_country_code) confidence += 8;
  if (rec.name) confidence += 4;
  if (rawStatus && !rec.crm_status) confidence -= 12; // had a status we couldn't map
  if (rawSource && !rec.data_source) confidence -= 6;
  confidence = Math.max(50, Math.min(100, confidence));

  return { status: 'success', reason: '', confidence, data: rec };
}

/** Extract a whole batch of rows. */
export function extractBatch(rows: Array<Record<string, any>>): HeuristicRecord[] {
  return rows.map((row) => extractRow(row));
}

/** Build a column -> CRM field map for preview / display (name-based). */
export function detectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    const f = classifyHeader(h);
    mapping[h] = f === 'first_name' || f === 'last_name' ? 'name' : (f === 'phone' ? 'mobile_without_country_code' : f);
  }
  return mapping;
}
