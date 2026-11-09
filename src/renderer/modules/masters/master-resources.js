const addressFields = [
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State'],
  ['pincode', 'Pincode'],
];
const partyFields = [
  ['name', 'Name', 'text', true],
  ['phone', 'Phone'],
  ['email', 'Email', 'email'],
  ['gstin', 'GSTIN'],
  ...addressFields,
];
export const masterResources = {
  warehouses: {
    label: 'Warehouses',
    endpoint: '/api/v1/warehouses',
    permission: 'warehouses',
    fields: [
      ['name', 'Name', 'text', true],
      ['code', 'Code', 'text', true],
      ['address', 'Address'],
      ['is_active', 'Active', 'checkbox'],
      ['parent_warehouse_id', 'Parent warehouse', 'warehouse'],
      ['is_default', 'Default warehouse', 'checkbox'],
    ],
    columns: ['name', 'code', 'address', 'is_active', 'parent_warehouse_id', 'is_default'],
  },
  inventoryCategories: {
    label: 'Inventory categories',
    endpoint: '/api/v1/inventory-categories',
    permission: 'inventory',
    fields: [
      ['name', 'Name', 'text', true],
      ['description', 'Description'],
      ['is_active', 'Active', 'checkbox'],
    ],
    columns: ['name', 'description', 'is_active'],
  },
  customers: {
    label: 'Customers',
    endpoint: '/api/v1/customers',
    permission: 'customers',
    fields: [
      ...partyFields,
      ['alternate_phone', 'Alternate phone'],
      ['notes', 'Notes'],
      ['credit_limit', 'Credit limit', 'number'],
    ],
    columns: ['name', 'phone', 'email', 'city', 'credit_limit'],
  },
  suppliers: {
    label: 'Suppliers',
    endpoint: '/api/v1/suppliers',
    permission: 'suppliers',
    fields: [...partyFields, ['is_active', 'Active', 'checkbox']],
    columns: ['name', 'phone', 'email', 'gstin', 'city', 'is_active'],
  },
  vehicles: {
    label: 'Vehicles',
    endpoint: '/api/v1/vehicles',
    permission: 'vehicles',
    fields: [
      ['customer_id', 'Customer', 'customer', true],
      ['registration_number', 'Registration number', 'text', true],
      ['make', 'Make'],
      ['model', 'Model'],
      ['variant', 'Variant'],
      ['fuel_type', 'Fuel type'],
      ['year', 'Year', 'number'],
      ['vin', 'VIN'],
      ['engine_number', 'Engine number'],
      ['chassis_number', 'Chassis number'],
      ['odometer_reading', 'Odometer', 'number'],
    ],
    columns: [
      'registration_number',
      'customer_id',
      'make',
      'model',
      'fuel_type',
      'engine_number',
      'chassis_number',
    ],
  },
};
export function emptyMaster(config) {
  return Object.fromEntries(
    config.fields.map(([key, , type]) => [
      key,
      type === 'checkbox' ? key === 'is_active' : key === 'credit_limit' ? 0 : '',
    ]),
  );
}
export function masterPayload(config, form) {
  return Object.fromEntries(
    config.fields.map(([key, , type]) => [
      key,
      ['number', 'warehouse', 'customer'].includes(type)
        ? form[key] === ''
          ? null
          : Number(form[key])
        : (form[key] ?? ''),
    ]),
  );
}
