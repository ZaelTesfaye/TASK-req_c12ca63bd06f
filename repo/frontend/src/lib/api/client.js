/**
 * API client for the Hospitality Operations Management System.
 *
 * Provides fetch-based HTTP methods with automatic token management,
 * 401 retry with refresh, and structured { data, error } responses.
 */

import { authState } from '$lib/stores/auth.js';

/**
 * Resolve the API base URL from the Vite env variable or current window location.
 * @returns {string} Base URL without trailing slash.
 */
function getBaseUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return '/api';
}

/**
 * Track whether a token refresh is already in-flight to avoid concurrent refreshes.
 */
let refreshPromise = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * @returns {Promise<boolean>} True if refresh succeeded.
 */
async function attemptTokenRefresh() {
  // If a refresh is already in-flight, wait for it
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const { refreshToken } = authState.get();
      if (!refreshToken) return false;

      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) return false;

      const result = await response.json();
      authState.refresh(result.accessToken, result.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Execute a fetch request with auth headers and structured response handling.
 *
 * @param {string} path - API path (e.g., '/events' or '/auth/login').
 * @param {object} [options={}] - Fetch options.
 * @param {string} [options.method='GET'] - HTTP method.
 * @param {object|FormData|null} [options.body] - Request body.
 * @param {object} [options.headers] - Additional headers.
 * @param {boolean} [options.multipart=false] - If true, send body as FormData (do not set Content-Type).
 * @param {boolean} [options.skipAuth=false] - If true, omit Authorization header.
 * @param {AbortSignal} [options.signal] - Optional abort signal.
 * @returns {Promise<{data: any, error: any}>} Structured response.
 */
async function request(path, options = {}) {
  const {
    method = 'GET',
    body = null,
    headers = {},
    multipart = false,
    skipAuth = false,
    signal
  } = options;

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  // Build headers
  const requestHeaders = { ...headers };

  if (!skipAuth) {
    const { token } = authState.get();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
  }

  // Build fetch options
  const fetchOptions = {
    method,
    headers: requestHeaders,
    signal
  };

  if (body !== null) {
    if (multipart || body instanceof FormData) {
      // Let the browser set the Content-Type with boundary for FormData
      fetchOptions.body = body instanceof FormData ? body : toFormData(body);
    } else {
      requestHeaders['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }
  }

  try {
    let response = await fetch(url, fetchOptions);

    // Handle 401 - attempt token refresh and retry once
    if (response.status === 401 && !skipAuth) {
      const refreshed = await attemptTokenRefresh();
      if (refreshed) {
        // Retry with new token
        const { token } = authState.get();
        if (token) {
          requestHeaders['Authorization'] = `Bearer ${token}`;
        }
        response = await fetch(url, { ...fetchOptions, headers: requestHeaders });
      } else {
        // Refresh failed - clear auth and redirect to login
        authState.logout();
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return { data: null, error: { status: 401, message: 'Session expired. Please log in again.' } };
      }
    }

    // Parse response
    const contentType = response.headers.get('Content-Type') || '';
    let data = null;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else if (contentType.includes('text/')) {
      data = await response.text();
    } else if (response.status !== 204) {
      // Attempt JSON parse, fall back to text
      try {
        data = await response.json();
      } catch {
        data = await response.text();
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: {
          status: response.status,
          message: data?.message || data?.error || `Request failed with status ${response.status}`,
          details: data?.details || null,
          code: data?.code || null
        }
      };
    }

    return { data, error: null };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { data: null, error: { status: 0, message: 'Request was aborted.' } };
    }
    return {
      data: null,
      error: {
        status: 0,
        message: err.message || 'Network error. Please check your connection.',
        details: null
      }
    };
  }
}

/**
 * Convert a plain object to FormData (for multipart uploads).
 * @param {object} obj - Object to convert.
 * @returns {FormData}
 */
function toFormData(obj) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(obj)) {
    if (value instanceof File || value instanceof Blob) {
      formData.append(key, value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item instanceof File || item instanceof Blob) {
          formData.append(key, item);
        } else {
          formData.append(key, String(item));
        }
      });
    } else if (value != null) {
      formData.append(key, String(value));
    }
  }
  return formData;
}

// ============================================
// Public HTTP helper methods
// ============================================

/**
 * Perform a GET request.
 * @param {string} path - API path.
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function get(path, options = {}) {
  return request(path, { ...options, method: 'GET' });
}

/**
 * Perform a POST request.
 * @param {string} path - API path.
 * @param {object|FormData} [body] - Request body.
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function post(path, body = null, options = {}) {
  return request(path, { ...options, method: 'POST', body });
}

/**
 * Perform a PUT request.
 * @param {string} path - API path.
 * @param {object|FormData} [body] - Request body.
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function put(path, body = null, options = {}) {
  return request(path, { ...options, method: 'PUT', body });
}

/**
 * Perform a PATCH request.
 * @param {string} path - API path.
 * @param {object|FormData} [body] - Request body.
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function patch(path, body = null, options = {}) {
  return request(path, { ...options, method: 'PATCH', body });
}

/**
 * Perform a DELETE request.
 * @param {string} path - API path.
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function del(path, options = {}) {
  return request(path, { ...options, method: 'DELETE' });
}

/**
 * Upload a file using multipart/form-data.
 * @param {string} path - API path.
 * @param {FormData|object} formData - Form data with file(s).
 * @param {object} [options] - Additional options.
 * @returns {Promise<{data: any, error: any}>}
 */
export function upload(path, formData, options = {}) {
  return request(path, { ...options, method: 'POST', body: formData, multipart: true });
}

/**
 * Unwrap a backend `{ data: ... }` envelope.
 *
 * The backend consistently wraps successful responses as `{ data: payload }`
 * (single resources) or `{ data: [...], pagination: {...} }` (lists). A few
 * endpoints (notably auth) return the payload at the top level. This helper
 * collapses both shapes to the inner payload so pages never have to repeat
 * `response?.data ?? response`.
 *
 * @template T
 * @param {T | { data: T }} response
 * @returns {T}
 */
export function unwrap(response) {
  if (response && typeof response === 'object' && 'data' in response && response.data !== undefined) {
    return response.data;
  }
  return response;
}

export default { get, post, put, patch, del, upload, unwrap };
