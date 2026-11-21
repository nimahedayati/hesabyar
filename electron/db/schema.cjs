/**
 * اسکیمای پایگاه داده حساب‌یار
 * ------------------------------------------------------------------
 * اصل طراحی: هر رویداد مالی یک «سند» است. سند در دفتر روزنامه
 * (journal_entries / journal_lines) ثبت می‌شود و آثار انباری آن در
 * stock_moves نگه داشته می‌شود. هیچ سندی حذف نمی‌شود؛ ابطال با سند
 * معکوس انجام می‌گیرد تا سابقه و قابلیت ردیابی حفظ شود.
 */
module.exports = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

/* ------------------------------------------------------------------ */
/*  اطلاعات پایه                                                       */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS accounts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  code      TEXT,
  name      TEXT NOT NULL,
  group_key TEXT NOT NULL,        -- persons|bank|cash|terminal|checks|inventory|income|expense|equity|liability|tax|clearing|equity_pl
  subgroup  TEXT,                 -- برای تفکیک: sales|sales_return|cogs|operating|other ...
  nature    TEXT NOT NULL DEFAULT 'debit',  -- debit | credit
  is_system INTEGER NOT NULL DEFAULT 0,
  party_id  INTEGER,
  treasury_id INTEGER,
  category_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0,
  note      TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(group_key);
CREATE INDEX IF NOT EXISTS idx_accounts_party ON accounts(party_id);

CREATE TABLE IF NOT EXISTS parties (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'customer', -- customer | supplier | both
  phone        TEXT,
  address      TEXT,
  tax_id       TEXT,
  credit_limit REAL NOT NULL DEFAULT 0,
  opening_balance REAL NOT NULL DEFAULT 0,
  note         TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  account_id   INTEGER REFERENCES accounts(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parties_kind ON parties(kind);

CREATE TABLE IF NOT EXISTS product_categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  sku            TEXT,
  category_id    INTEGER REFERENCES product_categories(id),
  unit           TEXT NOT NULL DEFAULT 'عدد',
  purchase_price REAL NOT NULL DEFAULT 0,
  sale_price     REAL NOT NULL DEFAULT 0,
  min_stock      REAL NOT NULL DEFAULT 0,
  stock_qty      REAL NOT NULL DEFAULT 0,   -- موجودی جاری (cache از stock_moves)
  avg_cost       REAL NOT NULL DEFAULT 0,   -- بهای تمام‌شده میانگین موزون
  tax_rate       REAL NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  is_favorite    INTEGER NOT NULL DEFAULT 0,
  favorite_group TEXT,
  sort           INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode    TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_barcode_product ON product_barcodes(product_id);

CREATE TABLE IF NOT EXISTS product_units (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  factor     REAL NOT NULL DEFAULT 1,
  sale_price REAL NOT NULL DEFAULT 0
);

/* ------------------------------------------------------------------ */
/*  خزانه‌داری                                                          */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS treasuries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT NOT NULL,               -- cash | bank | terminal
  name        TEXT NOT NULL,
  bank_name   TEXT,
  account_no  TEXT,
  terminal_no TEXT,
  fee_percent REAL NOT NULL DEFAULT 0,
  -- کارتخوان: حساب بانکی متصلی که مبالغ آن به آن واریز می‌شود
  settle_treasury_id INTEGER REFERENCES treasuries(id),
  -- کارتخوان حساب مستقل ندارد (NULL)؛ موجودی‌اش همان حساب بانکی متصل است
  account_id  INTEGER REFERENCES accounts(id),
  is_default  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

/* ------------------------------------------------------------------ */
/*  اسناد                                                              */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL,  -- sale|purchase|sale_return|purchase_return|receipt|payment|expense|income|transfer|opening|adjust
  number          TEXT NOT NULL UNIQUE,
  doc_date        TEXT NOT NULL,
  party_id        INTEGER REFERENCES parties(id),
  party_name      TEXT,           -- نام در زمان ثبت (مشتری عمومی)
  warehouse_id    INTEGER REFERENCES warehouses(id),
  subtotal        REAL NOT NULL DEFAULT 0,
  discount        REAL NOT NULL DEFAULT 0,
  tax             REAL NOT NULL DEFAULT 0,
  extra_cost      REAL NOT NULL DEFAULT 0,
  total           REAL NOT NULL DEFAULT 0,
  paid            REAL NOT NULL DEFAULT 0,
  due             REAL NOT NULL DEFAULT 0,
  cost_total      REAL NOT NULL DEFAULT 0,  -- بهای تمام‌شده (برای فروش)
  profit          REAL NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'posted', -- posted | voided
  ref_id          INTEGER REFERENCES documents(id),
  journal_id      INTEGER,
  note            TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at       TEXT,
  void_reason     TEXT
);
CREATE INDEX IF NOT EXISTS idx_doc_type_date ON documents(type, doc_date);
CREATE INDEX IF NOT EXISTS idx_doc_party ON documents(party_id);

CREATE TABLE IF NOT EXISTS document_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  product_id  INTEGER REFERENCES products(id),
  description TEXT,
  qty         REAL NOT NULL DEFAULT 1,
  unit        TEXT,
  unit_price  REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  tax_rate    REAL NOT NULL DEFAULT 0,
  tax         REAL NOT NULL DEFAULT 0,
  line_total  REAL NOT NULL DEFAULT 0,
  unit_cost   REAL NOT NULL DEFAULT 0,   -- بهای تمام‌شده لحظه ثبت (snapshot)
  cost_total  REAL NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lines_doc ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_lines_product ON document_lines(product_id);

CREATE TABLE IF NOT EXISTS document_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  method      TEXT NOT NULL,   -- cash|terminal|card_to_card|bank|check|credit
  treasury_id INTEGER REFERENCES treasuries(id),
  amount      REAL NOT NULL DEFAULT 0,
  ref_no      TEXT,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_doc ON document_payments(document_id);

/* گردش انبار — منبع حقیقت موجودی و کاردکس */
CREATE TABLE IF NOT EXISTS stock_moves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  warehouse_id INTEGER REFERENCES warehouses(id),
  document_id INTEGER REFERENCES documents(id),
  doc_type    TEXT,
  move_date   TEXT NOT NULL,
  qty         REAL NOT NULL,          -- مثبت = ورود ، منفی = خروج
  unit_cost   REAL NOT NULL DEFAULT 0,
  balance_qty REAL NOT NULL DEFAULT 0,
  balance_avg REAL NOT NULL DEFAULT 0,
  note        TEXT
);
CREATE INDEX IF NOT EXISTS idx_moves_product ON stock_moves(product_id, id);
CREATE INDEX IF NOT EXISTS idx_moves_doc ON stock_moves(document_id);

/* ------------------------------------------------------------------ */
/*  دفتر روزنامه (دو طرفه)                                             */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS journal_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT,
  entry_date  TEXT NOT NULL,
  document_id INTEGER REFERENCES documents(id),
  description TEXT,
  is_reversal INTEGER NOT NULL DEFAULT 0,
  reversed_id INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_je_doc ON journal_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_je_date ON journal_entries(entry_date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES accounts(id),
  party_id    INTEGER,
  debit       REAL NOT NULL DEFAULT 0,
  credit      REAL NOT NULL DEFAULT 0,
  description TEXT
);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_account ON journal_lines(account_id);

/* ------------------------------------------------------------------ */
/*  چک                                                                 */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  direction   TEXT NOT NULL,           -- received | paid
  party_id    INTEGER REFERENCES parties(id),
  serial      TEXT,
  amount      REAL NOT NULL DEFAULT 0,
  issue_date  TEXT,
  due_date    TEXT,
  bank_name   TEXT,
  branch      TEXT,
  treasury_id INTEGER REFERENCES treasuries(id),
  status      TEXT NOT NULL DEFAULT 'in_hand', -- in_hand|endorsed|collected|spent|returned|cancelled
  document_id INTEGER REFERENCES documents(id),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_checks_due ON checks(due_date, status);

/* ------------------------------------------------------------------ */
/*  کاربران و لاگ                                                       */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cashier',   -- admin | cashier
  password_hash TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(name);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  user_name  TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

/* ------------------------------------------------------------------ */
/*  شماره‌گذاری اسناد                                                   */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
`;
