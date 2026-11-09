import React, { useState } from 'react';
import InventoryCatalog from './InventoryCatalog.jsx';
import StockOperations from './StockOperations.jsx';
import InventoryReports from './InventoryReports.jsx';
import StockVerificationManager from './StockVerificationManager.jsx';
import FixedAssetManager from './FixedAssetManager.jsx';
import { buttonClass } from './inventory-ui.jsx';
const tabs = {
  catalog: ['Inventory catalog', InventoryCatalog],
  operations: ['Stock operations', StockOperations],
  audit: ['Stock audit & reconciliation', StockVerificationManager],
  reports: ['Reports', InventoryReports],
  assets: ['Fixed assets', FixedAssetManager],
};
export default function InventoryManager() {
  const [tab, setTab] = useState('catalog');
  const Component = tabs[tab][1];
  return (
    <div className="p-6 space-y-5">
      <h1 className="text-xl font-bold">Inventory</h1>
      <nav aria-label="Inventory tools" className="flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, [label]]) => (
          <button
            key={key}
            className={buttonClass}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <Component />
    </div>
  );
}
