import { AppError } from '../../shared/errors/app-error.js';
import { CustomerCreditRepository } from './customer-credit.repository.js';

export function assertCustomerCreditLimit(db, companyId, customerId, grandTotal) {
  const repository = new CustomerCreditRepository(db);
  const customer = repository.findCustomer(customerId);
  if (!customer || customer.credit_limit === null || customer.credit_limit === undefined) return;
  const outstanding = repository.outstanding(companyId, customer.ledger_id);
  if (Math.round((outstanding + grandTotal) * 100) > Math.round(customer.credit_limit * 100)) {
    throw new AppError(
      `Action would exceed customer credit limit of ${customer.credit_limit}. Current outstanding: ${outstanding}`,
      400,
      'CREDIT_LIMIT_EXCEEDED',
    );
  }
}
