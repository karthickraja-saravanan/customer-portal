/**
 * Integration Connectors - Dynamic connector system for all integrations.
 *
 * This module provides a single generic connector that can handle any integration
 * dynamically based on provider configuration and action metadata.
 */

// Export types
export * from './types';

// Export provider registry
export * from './providerRegistry';

// Export the main connector function
export { runIntegration } from './connector';
