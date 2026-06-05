import { apiClient } from '../../../shared/api/apiClient.js';

/**
 * Fetches Sales Dashboard metrics from the server
 * @param {string} date - Reference date in YYYY-MM-DD format
 * @param {object} [options] - Optional configurations
 * @param {AbortSignal} [options.signal] - Abort controller signal for cancellation
 * @returns {Promise<object>} The Sales Dashboard DTO response payload
 */
export function fetchSalesDashboard(date, options = {}) {
  const queryParam = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiClient.get(`/api/v1/dashboard/sales${queryParam}`, options);
}
