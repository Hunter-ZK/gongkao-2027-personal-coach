PRAGMA foreign_keys = ON;

-- Canonical per-question AI analysis. One saved analysis follows the question-bank
-- item across training batches, mistake views and later review attempts.
CREATE TABLE IF NOT EXISTS question_ai_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL UNIQUE REFERENCES question_bank(id) ON DELETE CASCADE,
  latest_question_id INTEGER REFERENCES question(id) ON DELETE SET NULL,
  required INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  standard_solution_md TEXT,
  fastest_solution_md TEXT,
  fastest_conditions TEXT,
  trap TEXT,
  key_points_json TEXT NOT NULL DEFAULT '[]',
  related_node_slugs TEXT NOT NULL DEFAULT '[]',
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  origin TEXT NOT NULL DEFAULT 'question_ai',
  error_message TEXT,
  requested_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qai_status ON question_ai_analysis(status, required);

-- Every newly-created mistake is a durable required analysis job. Missing API
-- credentials may block execution, but the request itself must never disappear.
CREATE TRIGGER IF NOT EXISTS trg_mistake_requires_question_ai
AFTER INSERT ON mistake
BEGIN
  INSERT INTO question_ai_analysis(bank_id, latest_question_id, required, status, requested_at, updated_at)
  SELECT q.bank_id, q.id, 1, 'pending', datetime('now'), datetime('now')
  FROM question q
  WHERE q.id=NEW.question_id AND q.bank_id IS NOT NULL
  ON CONFLICT(bank_id) DO UPDATE SET
    latest_question_id=excluded.latest_question_id,
    required=1,
    status=CASE WHEN question_ai_analysis.status='done' THEN 'done' ELSE 'pending' END,
    requested_at=COALESCE(question_ai_analysis.requested_at, excluded.requested_at),
    updated_at=excluded.updated_at;
END;

-- The legacy mistake-AI path is still supported. If it produces a complete
-- analysis, mirror it into the canonical question record so every UI entry sees
-- the same saved result.
CREATE TRIGGER IF NOT EXISTS trg_mistake_ai_mirrors_question_ai
AFTER UPDATE OF standard_solution_md, fastest_solution_md, fastest_conditions, trap, related_node_slugs, cause_note ON mistake
WHEN NEW.standard_solution_md IS NOT NULL AND length(trim(NEW.standard_solution_md)) > 0
BEGIN
  UPDATE question_ai_analysis
  SET standard_solution_md=NEW.standard_solution_md,
      fastest_solution_md=NEW.fastest_solution_md,
      fastest_conditions=NEW.fastest_conditions,
      trap=NEW.trap,
      related_node_slugs=COALESCE(NEW.related_node_slugs,'[]'),
      status='done',
      origin='mistake_ai',
      error_message=NULL,
      completed_at=datetime('now'),
      updated_at=datetime('now')
  WHERE bank_id=(SELECT bank_id FROM question WHERE id=NEW.question_id);
END;

-- Upgrade existing user data as well. Historical wrong questions become required
-- jobs immediately; already-saved legacy analyses are preserved rather than paid
-- for a second time.
INSERT INTO question_ai_analysis(
  bank_id, latest_question_id, required, status,
  standard_solution_md, fastest_solution_md, fastest_conditions, trap,
  related_node_slugs, origin, requested_at, completed_at, updated_at
)
SELECT
  q.bank_id,
  q.id,
  1,
  CASE
    WHEN m.standard_solution_md IS NOT NULL AND length(trim(m.standard_solution_md)) > 0 THEN 'done'
    ELSE 'pending'
  END,
  m.standard_solution_md,
  m.fastest_solution_md,
  m.fastest_conditions,
  m.trap,
  COALESCE(m.related_node_slugs,'[]'),
  CASE
    WHEN m.standard_solution_md IS NOT NULL AND length(trim(m.standard_solution_md)) > 0 THEN 'mistake_ai'
    ELSE 'question_ai'
  END,
  COALESCE(m.first_wrong_at, datetime('now')),
  CASE
    WHEN m.standard_solution_md IS NOT NULL AND length(trim(m.standard_solution_md)) > 0
      THEN COALESCE(m.updated_at, datetime('now'))
    ELSE NULL
  END,
  COALESCE(m.updated_at, datetime('now'))
FROM mistake m
JOIN question q ON q.id=m.question_id
WHERE q.bank_id IS NOT NULL
ON CONFLICT(bank_id) DO UPDATE SET
  latest_question_id=excluded.latest_question_id,
  required=1,
  status=CASE
    WHEN question_ai_analysis.status='done' OR excluded.status='done' THEN 'done'
    ELSE question_ai_analysis.status
  END,
  standard_solution_md=COALESCE(question_ai_analysis.standard_solution_md, excluded.standard_solution_md),
  fastest_solution_md=COALESCE(question_ai_analysis.fastest_solution_md, excluded.fastest_solution_md),
  fastest_conditions=COALESCE(question_ai_analysis.fastest_conditions, excluded.fastest_conditions),
  trap=COALESCE(question_ai_analysis.trap, excluded.trap),
  related_node_slugs=CASE
    WHEN question_ai_analysis.related_node_slugs='[]' THEN excluded.related_node_slugs
    ELSE question_ai_analysis.related_node_slugs
  END,
  origin=CASE WHEN excluded.status='done' THEN excluded.origin ELSE question_ai_analysis.origin END,
  completed_at=COALESCE(question_ai_analysis.completed_at, excluded.completed_at),
  updated_at=excluded.updated_at;
