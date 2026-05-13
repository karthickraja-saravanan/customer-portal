/**
 * Types for the dynamic integration connector system.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Result Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorResult {
  success: boolean;
  statusCode: number;
  data: unknown;
  errorMessage?: string;
}

export interface ConnectorResultWithDuration extends ConnectorResult {
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorAuth {
  api_key?: string;
  secret_key?: string;
  access_token?: string;
  account_sid?: string;
  auth_token?: string;
  bot_token?: string;
  from_number?: string;
  base_id?: string;
  [key: string]: string | undefined;
}

export interface ConnectorCustom {
  from_email?: string;
  from_name?: string;
  spreadsheet_id?: string;
  table?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Registry Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthPattern =
  | { type: 'bearer'; credKey: string }
  | { type: 'api_key_header'; credKey: string; headerName: string; valuePrefix?: string }
  | { type: 'basic'; userKey: string; passKey: string }
  | { type: 'oauth2_bearer' }
  | { type: 'none' };

export interface ProviderConfig {
  slug: string;
  name: string;
  baseUrl: string;
  auth: AuthPattern;
  defaultContentType?: 'json' | 'form';
  /** Special handling needed (stripe form-encoding, twilio sid injection, etc.) */
  quirks?: ('stripe_form' | 'twilio_sid' | 'sheets_values' | 'slack_ok_check')[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionDefinition {
  slug: string;
  httpMethod: string;
  endpointTemplate: string;
  inputFields?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Request Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parameters for generic api_call action.
 * When using named actions, these are derived from the action metadata.
 */
export interface GenericApiCallParams {
  /** HTTP method (GET, POST, PUT, PATCH, DELETE) */
  method?: string;
  /** Relative endpoint path (e.g., "mail/send" or "v1/customers") */
  endpoint?: string;
  /** Path parameter substitutions for {placeholder} tokens */
  pathParams?: Record<string, string>;
  /** Query string parameters */
  queryParams?: Record<string, unknown>;
  /** Request body */
  body?: unknown;
  /** Content type override: 'json' or 'form' */
  contentType?: 'json' | 'form';
  /** Additional headers */
  headers?: Record<string, string>;
  /** Any other fields are treated as body when body is not specified */
  [key: string]: unknown;
}
