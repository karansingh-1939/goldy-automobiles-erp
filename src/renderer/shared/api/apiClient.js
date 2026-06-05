/**
 * Shared API Client wrapper for Goldy Automobiles ERP.
 * Standardizes authentication token injection, request headers, and API error formatting.
 */

export const apiClient = {
  /**
   * Performs an HTTP GET request
   * @param {string} endpoint - The relative endpoint URL (e.g., '/api/v1/dashboard/sales')
   * @param {RequestInit} [options] - Standard fetch options including AbortSignal
   * @returns {Promise<any>} Response body JSON
   */
  async get(endpoint, options = {}) {
    const token = sessionStorage.getItem('goldy_auth_token');
    
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };

    const response = await fetch(endpoint, {
      ...options,
      method: 'GET',
      headers,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const body = isJson ? await response.json().catch(() => ({})) : null;

    if (!response.ok) {
      const error = new Error(body?.error?.message || 'API request failed.');
      error.status = response.status;
      error.code = body?.error?.code || 'API_ERROR';
      error.details = body?.error?.details || null;
      throw error;
    }

    return body;
  }
};
