PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ai_formula (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '综合定式',
  page_key TEXT,
  page_title TEXT,
  user_query TEXT NOT NULL,
  response_md TEXT NOT NULL,
  context_snapshot TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_formula_category ON ai_formula(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_formula_page ON ai_formula(page_key, created_at DESC);
