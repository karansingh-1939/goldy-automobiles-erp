-- Expenses were always posted as paid in cash. Record which cash or bank account
-- paid each expense (NULL means cash, matching existing rows).
ALTER TABLE expenses ADD COLUMN payment_account_id INTEGER REFERENCES ledgers(id);
