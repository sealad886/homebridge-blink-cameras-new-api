"use strict";
/**
 * Homebridge Plugin UI Server
 *
 * Server-side script for handling Blink authentication flow in the custom UI.
 * Uses @homebridge/plugin-ui-utils to provide API endpoints for:
 * - Login initiation
 * - 2FA verification
 * - Client verification
 * - Account verification
 * - Token status checking
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const plugin_ui_utils_1 = require("@homebridge/plugin-ui-utils");
const auth_1 = require("../blink-api/auth");
const client_1 = require("../blink-api/client");
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
// Logger that sends messages to the UI
class UiLogger {
    server;
    constructor(server) {
        this.server = server;
    }
    debug(message) {
        this.server.pushLog('debug', message);
    }
    info(message) {
        this.server.pushLog('info', message);
    }
    warn(message) {
        this.server.pushLog('warn', message);
    }
    error(message) {
        this.server.pushLog('error', message);
    }
}
class BlinkUiServer extends plugin_ui_utils_1.HomebridgePluginUiServer {
    blinkApi = null;
    pendingConfig = null;
    authStatus = { authenticated: false };
    lastAccountId = null;
    constructor() {
        super();
        // Register request handlers
        this.onRequest('/login', this.handleLogin.bind(this));
        this.onRequest('/verify', this.handleVerify.bind(this));
        this.onRequest('/status', this.handleStatus.bind(this));
        this.onRequest('/logout', this.handleLogout.bind(this));
        this.onRequest('/test-connection', this.handleTestConnection.bind(this));
        // Signal ready
        this.ready();
    }
    /**
     * Push log messages to the UI for display
     */
    pushLog(level, message) {
        this.pushEvent('log', { level, message, timestamp: new Date().toISOString() });
    }
    /**
     * Get the auth storage path for this Homebridge instance
     */
    getAuthStoragePath() {
        // Use a sibling directory to Homebridge storage for auth persistence
        const storagePath = this.homebridgeStoragePath ?? '.';
        return path.join(storagePath, '..', 'blink-auth', 'auth-state.json');
    }
    /**
     * Generate a unique device ID if not provided
     */
    generateDeviceId() {
        return `homebridge-${crypto.randomBytes(8).toString('hex')}`;
    }
    /**
     * Extract account ID from API response after login
     */
    async extractAccountId(api) {
        try {
            const homescreen = await api.getHomescreen();
            const accountId = homescreen.account?.account_id;
            if (accountId) {
                this.lastAccountId = accountId;
                return accountId;
            }
        }
        catch {
            // Ignore errors, account ID is optional
        }
        return this.lastAccountId ?? undefined;
    }
    /**
     * Handle login request - initiates OAuth flow
     */
    async handleLogin(payload) {
        const { username, password, deviceId, tier } = payload;
        if (!username || !password) {
            throw new plugin_ui_utils_1.RequestError('Username and password are required', { status: 400 });
        }
        // Build config for Blink API
        const config = {
            email: username,
            password: password,
            hardwareId: deviceId || this.generateDeviceId(),
            tier: tier || 'prod',
            authStoragePath: this.getAuthStoragePath(),
            debugAuth: true,
            logger: new UiLogger(this),
        };
        this.pendingConfig = config;
        this.blinkApi = new client_1.BlinkApi(config);
        try {
            await this.blinkApi.login();
            // Login successful - get account info
            const accountId = await this.extractAccountId(this.blinkApi);
            this.authStatus = {
                authenticated: true,
                accountId: accountId,
                tier: config.tier,
                message: 'Successfully authenticated with Blink',
            };
            this.pushEvent('auth-success', this.authStatus);
            return this.authStatus;
        }
        catch (error) {
            if (error instanceof auth_1.Blink2FARequiredError) {
                this.authStatus = {
                    authenticated: false,
                    requires2FA: true,
                    phoneLastFour: error.phoneLastFour,
                    email: username,
                    message: '2FA verification required. Check your email/phone for a code.',
                };
                this.pushEvent('auth-2fa-required', this.authStatus);
                return this.authStatus;
            }
            if (error instanceof auth_1.BlinkAuthenticationError) {
                const details = error.details;
                // Check for client verification requirement
                if (details.message?.includes('client_verification_required') ||
                    (details.responseBody && typeof details.responseBody === 'object' &&
                        'client_verification_required' in details.responseBody)) {
                    this.authStatus = {
                        authenticated: false,
                        requiresClientVerification: true,
                        email: username,
                        message: 'New device verification required. Check your email for a code.',
                    };
                    this.pushEvent('auth-client-verification-required', this.authStatus);
                    return this.authStatus;
                }
                throw new plugin_ui_utils_1.RequestError(error.message, {
                    status: details.status,
                    details: details.message,
                });
            }
            // Check for verification requirements in error message
            if (error instanceof Error) {
                if (error.message.includes('client verification required')) {
                    this.authStatus = {
                        authenticated: false,
                        requiresClientVerification: true,
                        email: username,
                        message: 'New device verification required. Check your email for a code.',
                    };
                    this.pushEvent('auth-client-verification-required', this.authStatus);
                    return this.authStatus;
                }
                if (error.message.includes('account verification required')) {
                    this.authStatus = {
                        authenticated: false,
                        requiresAccountVerification: true,
                        email: username,
                        message: 'Account verification required. Check your email/phone for a code.',
                    };
                    this.pushEvent('auth-account-verification-required', this.authStatus);
                    return this.authStatus;
                }
            }
            throw new plugin_ui_utils_1.RequestError(error instanceof Error ? error.message : 'Login failed', { status: 401 });
        }
    }
    /**
     * Handle verification code submission
     */
    async handleVerify(payload) {
        const { code, type, trustDevice } = payload;
        if (!code) {
            throw new plugin_ui_utils_1.RequestError('Verification code is required', { status: 400 });
        }
        if (!this.blinkApi || !this.pendingConfig) {
            throw new plugin_ui_utils_1.RequestError('No pending authentication. Please login first.', { status: 400 });
        }
        try {
            switch (type) {
                case '2fa':
                    await this.blinkApi.complete2FA(code);
                    break;
                case 'client':
                    this.pendingConfig.clientVerificationCode = code;
                    this.pendingConfig.trustDevice = trustDevice ?? true;
                    // Re-create API with verification code
                    this.blinkApi = new client_1.BlinkApi(this.pendingConfig);
                    await this.blinkApi.login();
                    break;
                case 'account':
                    this.pendingConfig.accountVerificationCode = code;
                    // Re-create API with verification code
                    this.blinkApi = new client_1.BlinkApi(this.pendingConfig);
                    await this.blinkApi.login();
                    break;
                default:
                    throw new plugin_ui_utils_1.RequestError(`Unknown verification type: ${type}`, { status: 400 });
            }
            // Verification successful - get account info
            const accountId = await this.extractAccountId(this.blinkApi);
            this.authStatus = {
                authenticated: true,
                accountId: accountId,
                tier: this.pendingConfig.tier,
                message: 'Verification successful! Authentication complete.',
            };
            this.pushEvent('auth-success', this.authStatus);
            return this.authStatus;
        }
        catch (error) {
            // Check if another verification step is required
            if (error instanceof Error) {
                if (error.message.includes('client verification required')) {
                    this.authStatus = {
                        authenticated: false,
                        requiresClientVerification: true,
                        message: 'New device verification required. Check your email for a code.',
                    };
                    this.pushEvent('auth-client-verification-required', this.authStatus);
                    return this.authStatus;
                }
                if (error.message.includes('account verification required')) {
                    this.authStatus = {
                        authenticated: false,
                        requiresAccountVerification: true,
                        message: 'Account verification required. Check your email/phone for a code.',
                    };
                    this.pushEvent('auth-account-verification-required', this.authStatus);
                    return this.authStatus;
                }
            }
            throw new plugin_ui_utils_1.RequestError(error instanceof Error ? error.message : 'Verification failed', { status: 401 });
        }
    }
    /**
     * Check current authentication status
     */
    async handleStatus() {
        return this.authStatus;
    }
    /**
     * Clear authentication state
     */
    async handleLogout() {
        this.blinkApi = null;
        this.pendingConfig = null;
        this.authStatus = { authenticated: false };
        return { success: true };
    }
    /**
     * Test connection with current config
     */
    async handleTestConnection(payload) {
        const { username, password, deviceId, tier } = payload;
        if (!username || !password) {
            throw new plugin_ui_utils_1.RequestError('Username and password are required', { status: 400 });
        }
        const config = {
            email: username,
            password: password,
            hardwareId: deviceId || this.generateDeviceId(),
            tier: tier || 'prod',
            authStoragePath: this.getAuthStoragePath(),
            logger: new UiLogger(this),
        };
        const api = new client_1.BlinkApi(config);
        try {
            await api.login();
            const homescreen = await api.getHomescreen();
            const networkCount = homescreen.networks?.length ?? 0;
            const cameraCount = homescreen.cameras?.length ?? 0;
            return {
                success: true,
                message: `Connected! Found ${networkCount} network(s) and ${cameraCount} camera(s).`,
            };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Connection test failed',
            };
        }
    }
}
// Start the server
(() => new BlinkUiServer())();
//# sourceMappingURL=server.js.map