import { localDate } from '../../../../../public/local-date.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchSalesDashboard } from '../services/dashboard-api.js';

const INITIAL_DATA_STATE = {
  summary: {
    invoicesToday: 0,
    invoicesThisMonth: 0,
    averageInvoiceValue: 0,
  },
  topCustomers: [],
  topServices: [],
  recentSales: [],
};

/**
 * Custom React hook to manage Sales Dashboard states, date filtering, and request lifecycles.
 * Uses AbortController to handle race conditions and page unmounting.
 *
 * @param {string} [initialDate] - Initial date reference in YYYY-MM-DD format. Defaults to system today.
 * @returns {object} Hook state containing date, setDate, data, isLoading, error, and refresh.
 */
export function useSalesDashboard(initialDate) {
  const [date, setDate] = useState(() => {
    return initialDate || localDate();
  });
  const [data, setData] = useState(INITIAL_DATA_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);

  const fetchDashboardData = useCallback(async (targetDate) => {
    // 1. Abort existing in-flight request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchSalesDashboard(targetDate, { signal: controller.signal });

      // Update state only if the controller belongs to the current fetch operation
      if (abortControllerRef.current === controller) {
        setData(response);
      }
    } catch (err) {
      // 2. Ignore AbortError as it is an intentional cancellation
      if (err.name === 'AbortError') {
        return;
      }

      // Update state only if the controller belongs to the current fetch operation
      if (abortControllerRef.current === controller) {
        setError(err);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  // 3. Fetch when selected date changes
  useEffect(() => {
    fetchDashboardData(date);

    // 4. Cancel active request on component unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [date, fetchDashboardData]);

  // 5. Explicit manual refetch helper
  const refresh = useCallback(() => {
    fetchDashboardData(date);
  }, [date, fetchDashboardData]);

  return {
    date,
    setDate,
    data,
    isLoading,
    error,
    refresh,
  };
}
