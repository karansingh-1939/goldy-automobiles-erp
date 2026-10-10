import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

/**
 * Reusable Base Chart component using HTML5 Canvas and Chart.js.
 * Wraps imperatively initialized Chart.js instances inside a React lifecycle
 * and automatically manages instance teardown to prevent canvas memory leaks.
 *
 * @param {object} props
 * @param {string} props.type - Chart.js chart type (e.g. 'bar', 'doughnut')
 * @param {object} props.data - Chart.js data configuration object
 * @param {object} [props.options] - Chart.js custom options overrides
 */
export function BaseChart({ type, data, options }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Destroy existing instance if active
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new Chart(canvasRef.current, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        ...options,
      },
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, data, options]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
}
