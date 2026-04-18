/**
 * Centralized configuration for external API proxy URLs.
 *
 * In development, Vite's server.proxy handles CORS by forwarding requests
 * to the upstream APIs. In production, set VITE_HORIZONS_PROXY_URL to
 * a CORS-enabled proxy (e.g. a Cloudflare Worker).
 */

export interface ApiConfig {
	/** Base URL for JPL Horizons API requests. */
	horizonsProxyUrl: string;
	/** Base URL for NASA Exoplanet Archive TAP API requests. */
	exoplanetProxyUrl: string;
}

const config: ApiConfig = {
	horizonsProxyUrl: import.meta.env.VITE_HORIZONS_PROXY_URL ?? '/api/horizons',
	exoplanetProxyUrl: import.meta.env.VITE_EXOPLANET_PROXY_URL ?? '/api/exoplanets',
};

export function getApiConfig(): Readonly<ApiConfig> {
	return config;
}
