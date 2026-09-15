CREATE TABLE IF NOT EXISTS ai_conversation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  page_key TEXT,
  page_title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_message (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversation(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  page_key TEXT,
  page_title TEXT,
  context_snapshot TEXT,
  sources_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_updated ON ai_conversation(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_ai_message_conversation ON ai_message(conversation_id, id);
