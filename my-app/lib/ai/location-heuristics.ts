const LOW_SIGNAL_TERMS = new Set([
  'a',
  'an',
  'british',
  'ello',
  'good',
  'hello',
  'help',
  'hey',
  'hi',
  'i',
  'im',
  "i'm",
  'mate',
  'morning',
  'please',
  'sup',
  'thanks',
  'thank',
  'there',
  'what',
  'yo',
]);

const LOCATION_CONTEXT_PATTERN =
  /\b(in|near|at|around|for|from|to|of|within|across|between|location|area|region|city|county|state|province|coordinates?|coords?|lat|lon|latitude|longitude)\b/i;

const DOMAIN_CONTEXT_PATTERN =
  /\b(smoke|fire|wildfire|air quality|aqi|pollution|pm2\.?5|pm10|weather|wind|plume|dispersion|evacuation|risk|conditions|forecast)\b/i;

const GREETING_ONLY_PATTERN =
  /^\s*(hi|hello|hey|yo|sup|thanks?|thank you|good morning|good afternoon|good evening|help)\s*[!.?,]*\s*$/i;

export function normalizeLocationCandidate(candidate: string): string {
  return candidate.replace(/\s+/g, ' ').trim();
}

export function hasLocationContext(query: string): boolean {
  return LOCATION_CONTEXT_PATTERN.test(query) || DOMAIN_CONTEXT_PATTERN.test(query);
}

export function isLowSignalMessage(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (GREETING_ONLY_PATTERN.test(normalized)) {
    return true;
  }

  if (hasLocationContext(normalized)) {
    return false;
  }

  const tokens = normalized
    .split(/[^a-z0-9']+/)
    .map(token => token.trim())
    .filter(Boolean);

  return tokens.length > 0 && tokens.every(token => LOW_SIGNAL_TERMS.has(token));
}

export function isLikelyLocationCandidate(query: string, candidate: string | null | undefined): boolean {
  if (!candidate) {
    return false;
  }

  if (candidate.startsWith('COORDS:')) {
    const parts = candidate.slice(7).split(',');
    if (parts.length !== 2) {
      return false;
    }

    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  const normalizedCandidate = normalizeLocationCandidate(candidate);
  if (normalizedCandidate.length < 3) {
    return false;
  }

  const normalizedLower = normalizedCandidate.toLowerCase();
  const tokens = normalizedLower
    .split(/[^a-z0-9']+/)
    .map(token => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  if (tokens.every(token => LOW_SIGNAL_TERMS.has(token))) {
    return false;
  }

  if (normalizedCandidate.includes(',')) {
    return true;
  }

  if (tokens.length > 1) {
    return true;
  }

  return hasLocationContext(query);
}
