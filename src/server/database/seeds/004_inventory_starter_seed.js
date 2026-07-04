import { createInventoryService } from '../../modules/inventory/inventory.service.js';

export async function run(db) {
  const isTesting = process.env.NODE_ENV === 'test' || 
                    process.execArgv.includes('--test') ||
                    (process.argv[1] && (process.argv[1].includes('tests/') || process.argv[1].includes('test.js')));

  if (isTesting) {
    console.log('Skipping starter inventory seeding in test environment.');
    return;
  }

  console.log('Automatically populating starter inventory catalog during setup...');
  const inventoryService = createInventoryService(db);
  const result = inventoryService.seedStarter(1);
  console.log(`Starter inventory catalog loaded: seeded ${result.itemsSeeded} items.`);
}


