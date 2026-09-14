PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  module TEXT,
  subtype TEXT,
  stem_md TEXT NOT NULL,
  images_json TEXT NOT NULL DEFAULT '[]',
  options_json TEXT NOT NULL DEFAULT '{}',
  option_images_json TEXT NOT NULL DEFAULT '{}',
  correct_answer TEXT,
  material_text_md TEXT,
  material_images_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'fenbi',
  source_ref TEXT,
  first_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qb_module ON question_bank(module);

ALTER TABLE question ADD COLUMN bank_id INTEGER REFERENCES question_bank(id);
CREATE INDEX IF NOT EXISTS idx_question_bank_id ON question(bank_id);

CREATE TABLE IF NOT EXISTS question_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  question_id INTEGER REFERENCES question(id) ON DELETE SET NULL,
  training_id INTEGER REFERENCES training(id) ON DELETE CASCADE,
  attempted_on TEXT NOT NULL,
  user_answer TEXT,
  correct_answer TEXT,
  is_correct INTEGER,
  duration_sec INTEGER,
  duration_is_estimated INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_bank ON question_attempt(bank_id, attempted_on);
CREATE INDEX IF NOT EXISTS idx_qa_training ON question_attempt(training_id);
