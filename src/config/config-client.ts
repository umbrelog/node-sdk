// @ts-nocheck — restored from dist; typed incrementally
import { PolicyAction } from '../policy/types';
/** Node: timers with unref() do not keep the process alive (CLI / one-shot scripts can exit). */
function unrefTimer(t) {
    if (t && typeof t.unref === 'function')
        t.unref();
}
/**
 * Client for fetching runtime configuration from backend
 * Periodically polls the config service endpoint every 5-10 seconds
 */
class ConfigClient {
    constructor(configOrigin, service, env, pollInterval = 7500, authToken) {
        this.replayBufferOnError = true; // Default: true
        this.logAnyway = false; // Default: false - don't store BUFFER_ONLY logs unless explicitly enabled
        this.hasLoadedPolicies = false; // Flag to track if policies have been loaded from backend
        this.configOrigin = (configOrigin || '').replace(/\/$/, '');
        this.service = service || 'default';
        this.env = env || 'prod';
        // Default to 7.5 seconds (middle of 5-10 second range)
        this.pollInterval = pollInterval >= 5000 && pollInterval <= 10000 ? pollInterval : 7500;
        this.authToken = authToken;
        this.currentConfig = {};
        this.currentPolicies = this.getDefaultPolicies(); // Initialize with default policies
        this.isPolling = false;
        this.lastSuccessfulFetch = 0;
    }
    /**
     * Start polling for config updates
     */
    start() {
        if (this.isPolling || !this.configOrigin) {
            return;
        }
        this.isPolling = true;
        // Fetch immediately
        this.fetchConfig().catch(err => {
            console.warn('[Logger] Failed to fetch initial config:', err.message);
        });
        // Then poll periodically
        this.pollTimer = setInterval(() => {
            this.fetchConfig().catch(err => {
                console.warn('[Logger] Failed to fetch config:', err.message);
            });
        }, this.pollInterval);
        unrefTimer(this.pollTimer);
    }
    /**
     * Start polling and wait for first fetch to complete (with timeout)
     * This ensures policies are loaded before logging starts
     *
     * @param timeoutMs - Maximum time to wait (default: 2000ms)
     * @returns Promise that resolves when first fetch completes or timeout expires
     */
    startAndWaitForFirstFetch(timeoutMs = 2000) {
        if (this.isPolling || !this.configOrigin) {
            return Promise.resolve();
        }
        // If we already have a promise for first fetch, return it
        if (this.firstFetchPromise) {
            return this.firstFetchPromise;
        }
        this.isPolling = true;
        if (process.env.DEBUG_LOGGER) {
            console.log('[ConfigClient] Starting and waiting for first fetch (timeout:', timeoutMs, 'ms)');
        }
        // Fetch immediately and wait for it (with timeout)
        const fetchPromise = this.fetchConfig().then(() => {
            if (process.env.DEBUG_LOGGER) {
                console.log('[ConfigClient] First fetch completed successfully');
            }
        }).catch(err => {
            console.warn('[Logger] Failed to fetch initial config:', err.message);
        });
        const timeoutPromise = new Promise((resolve) => {
            const tid = setTimeout(() => {
                if (process.env.DEBUG_LOGGER) {
                    console.log('[ConfigClient] First fetch timeout - continuing with default policies');
                }
                resolve();
            }, timeoutMs);
            unrefTimer(tid);
        });
        // Wait for first fetch (or timeout), then start periodic polling
        this.firstFetchPromise = Promise.race([fetchPromise, timeoutPromise]).then(() => {
            // Start periodic polling after first fetch completes (or times out)
            this.pollTimer = setInterval(() => {
                this.fetchConfig().catch(err => {
                    console.warn('[Logger] Failed to fetch config:', err.message);
                });
            }, this.pollInterval);
            unrefTimer(this.pollTimer);
        });
        return this.firstFetchPromise;
    }
    /**
     * Check if policies have been loaded from backend
     * Returns true if policies were successfully fetched, false if still using defaults
     */
    hasPoliciesLoaded() {
        return this.hasLoadedPolicies;
    }
    /**
     * Get the promise for the first fetch (if started)
     * Returns undefined if first fetch hasn't started yet
     */
    getFirstFetchPromise() {
        return this.firstFetchPromise;
    }
    /**
     * Stop polling for config updates
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
        this.isPolling = false;
    }
    /**
     * Fetch configuration from backend
     * Never throws - always falls back to last known config
     */
    async fetchConfig() {
        if (!this.configOrigin) {
            return;
        }
        try {
            const service = this.service;
            const env = this.env;
            const legacyLogConfigUrl = `${this.configOrigin}/log-config?service=${encodeURIComponent(service)}&env=${encodeURIComponent(env)}`;
            // DEBUG: Log which service we're fetching policies for
            if (process.env.DEBUG_LOGGER) {
                console.log('[ConfigClient] Fetching policies for service:', service, 'env:', env);
            }
            const policiesUrl = `${this.configOrigin}/policies?service=${encodeURIComponent(service)}&env=${encodeURIComponent(env)}`;
            // Try /policies endpoint first
            const headers = {
                'Content-Type': 'application/json',
            };
            // Add Authorization header if token/key is provided
            // API keys start with "dl_" and don't need "Bearer" prefix
            // JWT tokens need "Bearer" prefix
            if (this.authToken) {
                if (this.authToken.startsWith('dl_')) {
                    // API key - use as-is
                    headers['Authorization'] = this.authToken;
                }
                else {
                    // JWT token - add Bearer prefix
                    headers['Authorization'] = `Bearer ${this.authToken}`;
                }
            }
            // Create abort controller for timeout (compatible with older Node.js versions)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            let response;
            try {
                response = await fetch(policiesUrl, {
                    method: 'GET',
                    headers,
                    signal: controller.signal,
                });
            }
            catch (error) {
                clearTimeout(timeoutId);
                // Provide more detailed error message
                if (error.name === 'AbortError') {
                    throw new Error(`Request timeout after 5s: ${policiesUrl}`);
                }
                throw new Error(`Failed to fetch policies: ${error.message || error.toString()}`);
            }
            clearTimeout(timeoutId);
            // Fallback to unauthenticated /log-config (404, or auth failure on /policies)
            if (response.status === 404 || response.status === 401 || response.status === 403) {
                const fallbackHeaders = { 'Content-Type': 'application/json' };
                const fallbackController = new AbortController();
                const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 5000);
                try {
                    response = await fetch(legacyLogConfigUrl, {
                        method: 'GET',
                        headers: fallbackHeaders,
                        signal: fallbackController.signal,
                    });
                }
                catch (error) {
                    clearTimeout(fallbackTimeoutId);
                    if (error.name === 'AbortError') {
                        throw new Error(`Request timeout after 5s: ${legacyLogConfigUrl}`);
                    }
                    throw new Error(`Failed to fetch config: ${error.message || error.toString()}`);
                }
                clearTimeout(fallbackTimeoutId);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            // Handle /policies response format: { policies: PolicyConfig | PolicySet }
            if (data.policies) {
                let policyRules;
                if (Array.isArray(data.policies)) {
                    // Legacy format: array of rules
                    policyRules = data.policies;
                    this.replayBufferOnError = true; // Default for legacy
                }
                else if (data.policies && typeof data.policies === 'object' && 'rules' in data.policies) {
                    // New format: PolicyConfig object
                    const policyConfig = data.policies;
                    policyRules = policyConfig.rules;
                    this.replayBufferOnError = policyConfig.replay_buffer_on_error !== undefined
                        ? Boolean(policyConfig.replay_buffer_on_error)
                        : true; // Default to true if missing
                    this.logAnyway = policyConfig.log_anyway !== undefined
                        ? Boolean(policyConfig.log_anyway)
                        : false; // Default to false - don't store BUFFER_ONLY logs unless explicitly enabled
                }
                else {
                    // Fallback: treat as array
                    policyRules = data.policies;
                    this.replayBufferOnError = true;
                }
                this.currentPolicies = policyRules;
                // Also update config from policies (for backward compatibility)
                this.currentConfig = this.mapPoliciesToRuntimeConfig(policyRules);
                // Mark that policies have been loaded from backend
                this.hasLoadedPolicies = true;
                // DEBUG: Log received policies
                if (process.env.DEBUG_LOGGER) {
                    console.log('[ConfigClient] Received policies for service:', service, 'count:', policyRules.length, 'replay_buffer_on_error:', this.replayBufferOnError);
                    policyRules.forEach((p, i) => {
                        console.log(`  [${i}] log_type: ${p.log_type || 'ANY'}, level: ${p.level || 'ANY'}, action: ${p.action}`);
                    });
                }
            }
            else {
                // Handle /log-config response format (legacy)
                const serviceConfig = data;
                // Update policies if provided
                if (serviceConfig.policies) {
                    if (Array.isArray(serviceConfig.policies)) {
                        // Legacy format: array
                        this.currentPolicies = serviceConfig.policies;
                        this.replayBufferOnError = true;
                    }
                    else if (serviceConfig.policies && typeof serviceConfig.policies === 'object' && 'rules' in serviceConfig.policies) {
                        // New format: PolicyConfig
                        const policyConfig = serviceConfig.policies;
                        this.currentPolicies = policyConfig.rules;
                        this.replayBufferOnError = policyConfig.replay_buffer_on_error !== undefined
                            ? Boolean(policyConfig.replay_buffer_on_error)
                            : true;
                        this.logAnyway = policyConfig.log_anyway !== undefined
                            ? Boolean(policyConfig.log_anyway)
                            : false; // Default to false - don't store BUFFER_ONLY logs unless explicitly enabled
                    }
                }
                else if (serviceConfig.enabled) {
                    // Fallback: convert legacy enabled flags to policies
                    this.currentPolicies = this.convertLegacyConfigToPolicies(serviceConfig);
                }
                // If neither policies nor enabled flags, keep current policies (default)
                // Map service config to RuntimeConfig format (for backward compatibility)
                const mappedConfig = this.mapServiceConfigToRuntimeConfig(serviceConfig);
                this.currentConfig = mappedConfig;
            }
            // Update cached config only on successful fetch
            this.lastSuccessfulFetch = Date.now();
        }
        catch (error) {
            // Silently fail - continue using last known config
            // Never block logging - always use cached config
            // Only log first failure to avoid spam
            if (this.lastSuccessfulFetch === 0) {
                console.warn('[Logger] Failed to fetch initial config:', error.message || error.toString());
                if (process.env.DEBUG_LOGGER) {
                    console.error('[ConfigClient] Full error:', error);
                    console.error('[ConfigClient] Error name:', error.name);
                    console.error('[ConfigClient] Error stack:', error.stack);
                }
            }
            // Don't throw - keep using existing config
        }
    }
    /**
     * Map policies to RuntimeConfig format (for backward compatibility)
     */
    mapPoliciesToRuntimeConfig(policies) {
        return {
            enabled: true,
        };
    }
    /**
     * Map config service response to RuntimeConfig format
     */
    mapServiceConfigToRuntimeConfig(serviceConfig) {
        const globalEnabled = serviceConfig.enabled?.ERROR;
        return {
            enabled: globalEnabled,
            bufferTtl: serviceConfig.buffer_ttl_sec ? serviceConfig.buffer_ttl_sec * 1000 : undefined,
            maskingEnabled: serviceConfig.masking?.enabled,
            maskingFields: serviceConfig.masking?.fields,
        };
    }
    /**
     * Get current runtime configuration
     * Always returns a config (never blocks) - uses cached config if fetch fails
     */
    getConfig() {
        return { ...this.currentConfig };
    }
    /**
     * Get buffer TTL from config (in milliseconds)
     */
    getBufferTtl() {
        return this.currentConfig.bufferTtl;
    }
    /**
     * Get masking configuration
     */
    getMaskingConfig() {
        return {
            enabled: this.currentConfig.maskingEnabled ?? true,
            fields: this.currentConfig.maskingFields ?? [],
        };
    }
    /**
     * Manually update configuration (for testing or manual override)
     */
    updateConfig(config) {
        this.currentConfig = { ...config };
    }
    /**
     * Check if a specific service/clientId is enabled
     */
    isServiceEnabled(serviceId) {
        if (!serviceId) {
            return true; // If no service ID, allow it
        }
        const config = this.currentConfig;
        // Check disabled services first (takes precedence)
        if (config.disabledServices?.includes(serviceId)) {
            return false;
        }
        // Check enabled services
        if (config.enabledServices && !config.enabledServices.includes(serviceId)) {
            return false;
        }
        // If global enabled is false, disable all
        if (config.enabled === false) {
            return false;
        }
        // Default to enabled
        return true;
    }
    /**
     * Check if logging is enabled for a specific log type and service
     * Never blocks - always returns a boolean based on cached config
     */
    isEnabled(serviceId) {
        return this.isServiceEnabled(serviceId);
    }
    /**
     * Get timestamp of last successful config fetch
     */
    getLastSuccessfulFetch() {
        return this.lastSuccessfulFetch;
    }
    /**
     * Get current policy set
     * Always returns cached policies - never blocks
     */
    getPolicies() {
        return [...this.currentPolicies]; // Return copy to prevent mutation
    }
    /**
     * Get replay_buffer_on_error setting
     * Returns true if buffered logs should be replayed when an error occurs
     */
    getReplayBufferOnError() {
        return this.replayBufferOnError;
    }
    /**
     * Get log_anyway setting
     * Returns true if BUFFER_ONLY logs should be stored in database for context around errors
     */
    getLogAnyway() {
        return this.logAnyway;
    }
    /**
     * Get default policies that preserve current behavior
     * - Error logs always SEND
     * - Disabled log types are BUFFER_ONLY
     * - Enabled log types are SEND
     */
    getDefaultPolicies() {
        return [
            { level: 'error', action: PolicyAction.SEND },
            { action: PolicyAction.SEND },
        ];
    }
    convertLegacyConfigToPolicies(_serviceConfig) {
        return [
            { level: 'error', action: PolicyAction.SEND },
            { action: PolicyAction.SEND },
        ];
    }
}
export { ConfigClient };
//# sourceMappingURL=config-client.js.map