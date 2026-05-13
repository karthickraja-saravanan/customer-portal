/**
 * Provider Registry - Configuration for all supported integration providers.
 *
 * This defines base URLs, authentication patterns, and special handling requirements
 * for each provider. The actual action definitions come from the database/registry.
 */

import type { ProviderConfig } from './types';

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Developer Tools
  // ─────────────────────────────────────────────────────────────────────────────

  webhook: {
    slug: 'webhook',
    name: 'Webhook',
    baseUrl: '',
    auth: { type: 'none' },
  },

  http_request: {
    slug: 'http_request',
    name: 'HTTP Request',
    baseUrl: '',
    auth: { type: 'none' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────────────────────

  sendgrid: {
    slug: 'sendgrid',
    name: 'SendGrid',
    baseUrl: 'https://api.sendgrid.com/v3',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  slack: {
    slug: 'slack',
    name: 'Slack',
    baseUrl: 'https://slack.com/api',
    auth: { type: 'bearer', credKey: 'bot_token' },
    quirks: ['slack_ok_check'],
  },

  twilio: {
    slug: 'twilio',
    name: 'Twilio',
    baseUrl: 'https://api.twilio.com/2010-04-01',
    auth: { type: 'basic', userKey: 'account_sid', passKey: 'auth_token' },
    defaultContentType: 'form',
    quirks: ['twilio_sid'],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Payments
  // ─────────────────────────────────────────────────────────────────────────────

  stripe: {
    slug: 'stripe',
    name: 'Stripe',
    baseUrl: 'https://api.stripe.com',
    auth: { type: 'bearer', credKey: 'secret_key' },
    defaultContentType: 'form',
    quirks: ['stripe_form'],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CRM
  // ─────────────────────────────────────────────────────────────────────────────

  hubspot: {
    slug: 'hubspot',
    name: 'HubSpot',
    baseUrl: 'https://api.hubapi.com',
    auth: { type: 'oauth2_bearer' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Databases
  // ─────────────────────────────────────────────────────────────────────────────

  airtable: {
    slug: 'airtable',
    name: 'Airtable',
    baseUrl: 'https://api.airtable.com',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Google
  // ─────────────────────────────────────────────────────────────────────────────

  google_sheets: {
    slug: 'google_sheets',
    name: 'Google Sheets',
    baseUrl: 'https://sheets.googleapis.com/v4',
    auth: { type: 'oauth2_bearer' },
    quirks: ['sheets_values'],
  },

  google_calendar: {
    slug: 'google_calendar',
    name: 'Google Calendar',
    baseUrl: 'https://www.googleapis.com/calendar/v3',
    auth: { type: 'oauth2_bearer' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // AI & ML
  // ─────────────────────────────────────────────────────────────────────────────

  openai: {
    slug: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  anthropic: {
    slug: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    auth: { type: 'api_key_header', credKey: 'api_key', headerName: 'x-api-key' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // E-commerce
  // ─────────────────────────────────────────────────────────────────────────────

  shopify: {
    slug: 'shopify',
    name: 'Shopify',
    baseUrl: 'https://{shop_domain}/admin/api/2024-01',
    auth: { type: 'bearer', credKey: 'access_token' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Marketing
  // ─────────────────────────────────────────────────────────────────────────────

  mailchimp: {
    slug: 'mailchimp',
    name: 'Mailchimp',
    baseUrl: 'https://{dc}.api.mailchimp.com/3.0',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  klaviyo: {
    slug: 'klaviyo',
    name: 'Klaviyo',
    baseUrl: 'https://a.klaviyo.com/api',
    auth: { type: 'api_key_header', credKey: 'api_key', headerName: 'Authorization', valuePrefix: 'Klaviyo-API-Key ' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Project Management
  // ─────────────────────────────────────────────────────────────────────────────

  notion: {
    slug: 'notion',
    name: 'Notion',
    baseUrl: 'https://api.notion.com/v1',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  linear: {
    slug: 'linear',
    name: 'Linear',
    baseUrl: 'https://api.linear.app',
    auth: { type: 'bearer', credKey: 'api_key' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Cloud Storage
  // ─────────────────────────────────────────────────────────────────────────────

  dropbox: {
    slug: 'dropbox',
    name: 'Dropbox',
    baseUrl: 'https://api.dropboxapi.com/2',
    auth: { type: 'oauth2_bearer' },
  },

  google_drive: {
    slug: 'google_drive',
    name: 'Google Drive',
    baseUrl: 'https://www.googleapis.com/drive/v3',
    auth: { type: 'oauth2_bearer' },
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Social
  // ─────────────────────────────────────────────────────────────────────────────

  github: {
    slug: 'github',
    name: 'GitHub',
    baseUrl: 'https://api.github.com',
    auth: { type: 'bearer', credKey: 'access_token' },
  },

  discord: {
    slug: 'discord',
    name: 'Discord',
    baseUrl: 'https://discord.com/api/v10',
    auth: { type: 'bearer', credKey: 'bot_token' },
  },
};

/**
 * Get provider configuration by slug.
 */
export function getProvider(slug: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY[slug];
}

/**
 * Get all provider slugs.
 */
export function getProviderSlugs(): string[] {
  return Object.keys(PROVIDER_REGISTRY);
}
