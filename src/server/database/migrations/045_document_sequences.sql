-- GST invoice numbers must be consecutive, unique within a financial year and at
-- most 16 characters. Each series keeps its last issued number per financial year;
-- numbers are reserved inside the posting transaction, so failed postings never
-- consume one and cancelled invoices keep theirs.
CREATE TABLE document_sequences (
  series TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  last_number INTEGER NOT NULL CHECK (last_number >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (series, financial_year)
);
