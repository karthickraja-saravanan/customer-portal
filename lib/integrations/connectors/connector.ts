/**
 * Dynamic Integration Connector
 *
 * A single generic connector that handles all integration API calls dynamically
 * based on provider configuration and action metadata.
 *
 * Usage:
 *   // With action metadata (preferred)
 *   await runIntegration('sendgrid', { endpoint: 'mail/send', method: 'POST', ... }, auth, custom);
 *
 *   // Or construct params from action registry
 *   const action = registry.actions.find(a => a.slug === 'send_email');
 *   await runIntegration('sendgrid', {
 *     endpoint: action.endpointTemplate,
 *     method: action.httpMethod,
 *     ...userParams
 *   }, auth, custom);
 */

import type {
  ConnectorResult,
  ConnectorResultWithDuration,
  ConnectorAuth,
  ConnectorCustom,
  GenericApiCallParams,
  ProviderConfig,
} from './types';
import { getProvider } from './providerRegistry';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function nowMs(start: number): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.round(now - start);
}

function getStartTime(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function base64Encode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  // Browser fallback
  return btoa(str);
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Parsing Utilities (Backend Parity)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to parse a JSON string, tolerating trailing commas.
 * First tries strict JSON.parse, then strips trailing commas with a
 * regex and retries. Returns the parsed value or throws if both fail.
 */
function lenientJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Strip trailing commas before } or ] and retry.
    // e.g.  { "a": 1, }  →  { "a": 1 }
    const cleaned = s.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(cleaned); // throws if still invalid
  }
}

/**
 * Recursively walk a value and parse any string that looks like a JSON
 * object or array into its real JS equivalent.
 *
 * This handles the case where a Textarea field stores its content as a
 * string (e.g. "[\n  { ... }\n]") — we want the real array/object to
 * reach bodyToFormData so it can be serialized as proper nested form
 * keys (line_items[0][price]=xxx) rather than as a flat encoded string.
 * Trailing commas in user-typed JSON are tolerated.
 */
function deepParseJsonStrings(val: unknown): unknown {
  if (typeof val === 'string') {
    const t = val.trim();
    if (
      (t.startsWith('{') && t.endsWith('}')) ||
      (t.startsWith('[') && t.endsWith(']'))
    ) {
      try {
        return lenientJsonParse(t);
      } catch {
        // not valid JSON even after cleanup — keep as string
      }
    }
    return val;
  }
  if (Array.isArray(val)) return val.map(deepParseJsonStrings);
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = deepParseJsonStrings(v);
    }
    return out;
  }
  return val;
}

/**
 * Try to coerce a loose string into an object.
 * Handles escaped quotes and partial JSON like "title": "Test Sheet".
 */
function tryCoerceObjectFromLooseString(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t) return null;

  const candidates = [t];
  // Common UI case: escaped JSON snippet like "\"title\": \"Test Sheet\""
  if (t.includes('\\"')) candidates.push(t.replace(/\\"/g, '"'));

  for (const c of candidates) {
    try {
      const parsed = lenientJsonParse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* try wrapped form */
    }
    try {
      const wrapped = `{${c}}`;
      const parsed = lenientJsonParse(wrapped);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

/**
 * Build auth headers based on the provider's auth pattern.
 */
function buildAuthHeaders(
  auth: ProviderConfig['auth'],
  creds: ConnectorAuth
): Record<string, string> {
  const headers: Record<string, string> = {};

  switch (auth.type) {
    case 'bearer': {
      // Try access_token first (OAuth), then the configured credKey
      const token = creds.access_token || creds[auth.credKey];
      if (token) headers['Authorization'] = `Bearer ${token}`;
      break;
    }
    case 'api_key_header': {
      const key = creds[auth.credKey];
      if (key) {
        const value = (auth.valuePrefix || '') + key;
        headers[auth.headerName] = value;
      }
      break;
    }
    case 'basic': {
      const user = creds[auth.userKey] || '';
      const pass = creds[auth.passKey] || '';
      if (user || pass) {
        headers['Authorization'] = `Basic ${base64Encode(`${user}:${pass}`)}`;
      }
      break;
    }
    case 'oauth2_bearer': {
      if (creds.access_token) {
        headers['Authorization'] = `Bearer ${creds.access_token}`;
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return headers;
}

/**
 * Validate that required auth credentials are present.
 */
function validateAuth(
  provider: ProviderConfig,
  creds: ConnectorAuth
): string | null {
  const auth = provider.auth;

  switch (auth.type) {
    case 'bearer': {
      const token = creds.access_token || creds[auth.credKey];
      if (!token) return `Missing ${provider.name} ${auth.credKey} or access_token`;
      break;
    }
    case 'api_key_header': {
      if (!creds[auth.credKey]) return `Missing ${provider.name} ${auth.credKey}`;
      break;
    }
    case 'basic': {
      if (!creds[auth.userKey] || !creds[auth.passKey]) {
        return `Missing ${provider.name} ${auth.userKey} or ${auth.passKey}`;
      }
      break;
    }
    case 'oauth2_bearer': {
      if (!creds.access_token) {
        return `Missing ${provider.name} access_token. Complete the OAuth flow.`;
      }
      break;
    }
  }

  return null;
}

/**
 * Replace {placeholder} tokens in URL with values from pathParams or creds.
 * Throws an error if any placeholders remain unresolved (backend parity).
 */
function interpolateUrl(
  template: string,
  pathParams: Record<string, string>,
  creds: ConnectorAuth,
  throwOnUnresolved = false
): string {
  let out = template;
  for (const [k, v] of Object.entries(pathParams)) {
    out = out.split(`{${k}}`).join(encodeURIComponent(v));
  }
  // Also check creds for any remaining placeholders
  out = out.replace(/\{([^}]+)\}/g, (match, key) => {
    const value = creds[key];
    if (value !== undefined && value !== null && value !== '') {
      return encodeURIComponent(value);
    }
    return match; // Keep placeholder for error detection
  });

  // Check for unresolved placeholders
  if (throwOnUnresolved && /\{[^}]+\}/.test(out)) {
    throw new Error(
      'Unresolved path placeholders; provide pathParams for all {keys} in endpoint'
    );
  }

  // For backward compatibility, replace remaining placeholders with empty string
  return out.replace(/\{[^}]+\}/g, '');
}

/**
 * Append query parameters to URL.
 */
function appendQueryParams(url: URL, queryParams: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(queryParams)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

/**
 * Convert body to URL-encoded form data (for Stripe, Twilio, etc.).
 */
function bodyToFormData(body: unknown): URLSearchParams {
  const params = new URLSearchParams();
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return params;
  }

  function appendValue(prefix: string, value: unknown): void {
    if (value === undefined || value === null) return;

    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        appendValue(prefix ? `${prefix}[${k}]` : k, v);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item, i) => appendValue(`${prefix}[${i}]`, item));
      return;
    }

    params.append(prefix, String(value));
  }

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    appendValue(key, value);
  }

  return params;
}

/**
 * Google Sheets ValueRange endpoints expect these params in the query string,
 * not in the request body. We auto-extract them for parity with backend.
 */
const SHEETS_VALUE_RANGE_QUERY_PARAMS = new Set([
  'valueInputOption',
  'insertDataOption',
  'includeValuesInResponse',
  'responseValueRenderOption',
  'responseDateTimeRenderOption',
]);

/**
 * Normalize Google Sheets values to 2D array format.
 * Handles various input formats: single value, 1D array, 2D array, objects.
 */
function normalizeSheetValues(v: unknown): unknown[][] {
  if (Array.isArray(v)) {
    if (v.length === 0) return [];
    if (Array.isArray(v[0])) {
      // Already 2D array - normalize cell values
      return (v as unknown[][]).map((row) =>
        row.map((cell) => {
          if (typeof cell === 'object' && cell !== null && !Array.isArray(cell)) {
            const vals = Object.values(cell as Record<string, unknown>);
            return vals.length > 0 ? vals[0] : '';
          }
          return cell;
        })
      );
    }
    // 1D array - wrap in outer array
    return [
      (v as unknown[]).map((cell) => {
        if (typeof cell === 'object' && cell !== null && !Array.isArray(cell)) {
          const vals = Object.values(cell as Record<string, unknown>);
          return vals.length > 0 ? vals[0] : '';
        }
        return cell;
      }),
    ];
  }
  // Object - convert to single row
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>;
    return [Object.keys(o).sort().map((k) => o[k])];
  }
  // Single value - wrap in 2D array
  return [[v]];
}

/**
 * Extract body from params - if body is not explicitly set, use non-control fields.
 */
function extractBody(params: GenericApiCallParams): unknown {
  if (params.body !== undefined) {
    return params.body;
  }

  // Fields that are not part of the request body
  const controlFields = new Set([
    'method', 'endpoint', 'pathParams', 'queryParams', 'body', 'contentType', 'headers'
  ]);

  const bodyFromParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (!controlFields.has(key)) {
      bodyFromParams[key] = value;
    }
  }

  return Object.keys(bodyFromParams).length > 0 ? bodyFromParams : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Connector Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute an integration API call.
 *
 * @param slug - Provider slug (e.g., 'sendgrid', 'stripe')
 * @param params - Request parameters including endpoint, method, body, etc.
 * @param auth - Authentication credentials
 * @param custom - Custom settings (e.g., from_email for SendGrid)
 */
export async function runIntegration(
  slug: string,
  params: GenericApiCallParams,
  auth: ConnectorAuth,
  custom: ConnectorCustom = {}
): Promise<ConnectorResultWithDuration> {
  const t0 = getStartTime();

  // Get provider configuration
  const provider = getProvider(slug);
  if (!provider) {
    return {
      success: false,
      statusCode: 404,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: `Unknown provider "${slug}". Check the integration slug.`,
    };
  }

  // Special case: http_request and webhook don't use provider config
  if (slug === 'http_request') {
    return handleHttpRequest(params, t0);
  }
  if (slug === 'webhook') {
    return handleWebhook(params, t0);
  }

  // Validate authentication
  const authError = validateAuth(provider, auth);
  if (authError) {
    return {
      success: false,
      statusCode: 401,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: authError,
    };
  }

  // Parse request parameters
  const method = (params.method || 'GET').toUpperCase();
  const endpoint = String(params.endpoint || '').replace(/^\/+/, '');
  const pathParams = (params.pathParams || {}) as Record<string, string>;
  let queryParams = { ...((params.queryParams || {}) as Record<string, unknown>) };
  const extraHeaders = (params.headers || {}) as Record<string, string>;

  // Extract body and apply deep JSON string parsing (backend parity)
  // This handles textarea inputs where users type JSON as strings
  let body = deepParseJsonStrings(extractBody(params));

  // Validate endpoint (prevent path traversal)
  if (endpoint.includes('..')) {
    return {
      success: false,
      statusCode: 400,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: 'Path traversal is not allowed in endpoint.',
    };
  }

  // Twilio: inject From number into body if not already set
  if (slug === 'twilio' && auth.from_number && body && typeof body === 'object' && !Array.isArray(body)) {
    const bodyObj = body as Record<string, unknown>;
    if (!bodyObj.From && !bodyObj.from) {
      body = { ...bodyObj, From: auth.from_number };
    }
  }

  // Google Sheets: handle query param extraction, value normalization, and properties coercion
  if (slug === 'google_sheets' && body && typeof body === 'object' && !Array.isArray(body)) {
    const bodyObj = { ...(body as Record<string, unknown>) };
    const isWriteMethod = method !== 'GET' && method !== 'DELETE';
    const isValueRangeEndpoint = endpoint.includes('/values/');

    // Extract query params that Google Sheets expects in the URL, not body
    if (isWriteMethod && isValueRangeEndpoint) {
      for (const [k, v] of Object.entries(bodyObj)) {
        if (SHEETS_VALUE_RANGE_QUERY_PARAMS.has(k)) {
          queryParams[k] = v;
          delete bodyObj[k];
        }
      }
      // Default valueInputOption for write operations
      if (!queryParams.valueInputOption) {
        queryParams.valueInputOption = 'USER_ENTERED';
      }
    }

    // Normalize values array
    if (bodyObj.values !== undefined) {
      bodyObj.values = normalizeSheetValues(bodyObj.values);
    }

    // Handle spreadsheets.create: coerce loose string properties
    if (isWriteMethod && endpoint === 'spreadsheets' && typeof bodyObj.properties === 'string') {
      const coerced = tryCoerceObjectFromLooseString(bodyObj.properties);
      if (coerced) bodyObj.properties = coerced;
    }

    body = bodyObj;
  }

  // Google Sheets: inject spreadsheetId from custom settings if not in pathParams
  if (slug === 'google_sheets' && !pathParams.spreadsheetId) {
    const fromCustom = String(custom.spreadsheet_id || '').trim();
    if (fromCustom) pathParams.spreadsheetId = fromCustom;
  }

  // Build URL
  let baseUrl = provider.baseUrl;

  // Handle providers with dynamic base URLs (e.g., Shopify, Mailchimp)
  baseUrl = interpolateUrl(baseUrl, pathParams, auth);

  // Handle providers that need path augmentation
  let resolvedEndpoint: string;
  try {
    // Use throwOnUnresolved=true to catch missing path params early
    resolvedEndpoint = interpolateUrl(endpoint, pathParams, auth, true);
  } catch (e: unknown) {
    return {
      success: false,
      statusCode: 400,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  // Airtable: auto-prefix with base_id if not already prefixed
  if (slug === 'airtable' && !resolvedEndpoint.startsWith('v0/') && !resolvedEndpoint.startsWith('meta/')) {
    const baseId = auth.base_id || String(custom.base_id || '');
    if (!baseId) {
      return {
        success: false,
        statusCode: 400,
        data: null,
        durationMs: nowMs(t0),
        errorMessage: 'Airtable requires base_id in credentials or custom settings.',
      };
    }
    resolvedEndpoint = `v0/${baseId}/${resolvedEndpoint}`;
  }

  // Twilio: inject AccountSid into path params
  if (provider.quirks?.includes('twilio_sid') && auth.account_sid) {
    resolvedEndpoint = interpolateUrl(resolvedEndpoint, { AccountSid: auth.account_sid, ...pathParams }, auth);
  }

  const url = new URL(`${baseUrl}/${resolvedEndpoint}`);
  appendQueryParams(url, queryParams);

  // Build headers
  const headers: Record<string, string> = {
    ...buildAuthHeaders(provider.auth, auth),
    ...extraHeaders,
  };

  // Determine content type
  const requestContentType = params.contentType || provider.defaultContentType || 'json';
  const hasBody = body !== undefined && body !== null && !['GET', 'DELETE'].includes(method);

  // Build fetch options
  const fetchOptions: RequestInit = { method, headers };

  if (hasBody) {
    if (requestContentType === 'form') {
      fetchOptions.body = bodyToFormData(body);
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else {
      fetchOptions.body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }

  // Execute request
  try {
    const res = await fetch(url.toString(), fetchOptions);
    const text = await res.text();

    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Keep as text
    }

    // Handle provider-specific response quirks
    let success = res.ok;
    let errorMessage: string | undefined;

    // Slack: check for ok: false in response
    if (provider.quirks?.includes('slack_ok_check') && typeof data === 'object' && data !== null) {
      const slackData = data as { ok?: boolean; error?: string };
      if (slackData.ok === false) {
        success = false;
        errorMessage = slackData.error || 'Slack API error';
      }
    }

    // Stripe: extract error message
    if (slug === 'stripe' && !success && typeof data === 'object' && data !== null) {
      const stripeError = (data as { error?: { message?: string; param?: string } }).error;
      if (stripeError?.message) {
        errorMessage = stripeError.param
          ? `${stripeError.message} (param: ${stripeError.param})`
          : stripeError.message;
      }
    }

    // Default error message
    if (!success && !errorMessage) {
      errorMessage = typeof text === 'string' && text ? text.slice(0, 500) : `HTTP ${res.status}`;
    }

    return {
      success,
      statusCode: res.status,
      data,
      durationMs: nowMs(t0),
      errorMessage: success ? undefined : errorMessage,
    };
  } catch (e: unknown) {
    return {
      success: false,
      statusCode: 0,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Special Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle generic HTTP requests (no provider config needed).
 */
async function handleHttpRequest(
  params: GenericApiCallParams,
  t0: number
): Promise<ConnectorResultWithDuration> {
  const url = String(params.url || params.endpoint || '');
  if (!url) {
    return {
      success: false,
      statusCode: 400,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: 'url or endpoint is required',
    };
  }

  const method = (params.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(params.headers || {}) };
  const body = extractBody(params);

  const fetchOptions: RequestInit = { method, headers };

  if (body !== undefined && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  try {
    const res = await fetch(url, fetchOptions);
    const text = await res.text();

    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      // Keep as text
    }

    return {
      success: res.ok,
      statusCode: res.status,
      data,
      durationMs: nowMs(t0),
    };
  } catch (e: unknown) {
    return {
      success: false,
      statusCode: 0,
      data: null,
      durationMs: nowMs(t0),
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Handle webhook (just echoes the params - actual webhook handling is server-side).
 */
async function handleWebhook(
  params: GenericApiCallParams,
  t0: number
): Promise<ConnectorResultWithDuration> {
  return {
    success: true,
    statusCode: 200,
    data: {
      echo: params,
      note: 'Inbound simulated; use integration webhook route for real HTTP.',
    },
    durationMs: nowMs(t0),
  };
}
