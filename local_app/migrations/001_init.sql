-- 2027 公考个人备考工作台 · 初始 schema（冻结基线 2026-09-13）
-- SQLite 3。执行前 PRAGMA foreign_keys = ON;
-- 对应文档 02-数据模型与API规格.md

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exam (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  exam_date TEXT,
  is_official INTEGER NOT NULL DEFAULT 0,
  date_source TEXT,
  announce_date TEXT,
  paper_minutes INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  total_score REAL NOT NULL DEFAULT 100,
  target_score REAL,
  priority INTEGER NOT NULL DEFAULT 1,
  note TEXT
);

CREATE TABLE IF NOT EXISTS exam_date_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_code TEXT NOT NULL REFERENCES exam(code),
  old_date TEXT,
  new_date TEXT,
  old_official INTEGER,
  new_official INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_module (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_code TEXT NOT NULL REFERENCES exam(code),
  name TEXT NOT NULL,
  seq INTEGER NOT NULL,
  question_count INTEGER NOT NULL,
  score_per_q REAL NOT NULL,
  score_confidence TEXT NOT NULL DEFAULT 'estimated',
  total_score REAL NOT NULL,
  target_minutes INTEGER NOT NULL,
  target_accuracy REAL,
  count_confidence TEXT NOT NULL DEFAULT 'inferred',
  note TEXT,
  UNIQUE(exam_code, name)
);

CREATE TABLE IF NOT EXISTS knowledge_node (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  parent_slug TEXT REFERENCES knowledge_node(slug),
  level INTEGER NOT NULL DEFAULT 2,
  subject TEXT NOT NULL DEFAULT 'xingce',
  module_names TEXT NOT NULL DEFAULT '[]',
  seq INTEGER NOT NULL DEFAULT 0,
  build_status TEXT NOT NULL DEFAULT '未建设',
  priority_batch INTEGER,
  content_path TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  lint_passed INTEGER NOT NULL DEFAULT 0,
  lint_report_json TEXT,
  exam_weight_gd REAL NOT NULL DEFAULT 0,
  exam_weight_national REAL NOT NULL DEFAULT 0,
  target_seconds INTEGER,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_node_parent ON knowledge_node(parent_slug);
CREATE INDEX IF NOT EXISTS idx_node_batch ON knowledge_node(priority_batch);

CREATE TABLE IF NOT EXISTS node_mastery (
  node_slug TEXT PRIMARY KEY REFERENCES knowledge_node(slug),
  state TEXT NOT NULL DEFAULT '未恢复',
  sample_n INTEGER NOT NULL DEFAULT 0,
  correct_n INTEGER NOT NULL DEFAULT 0,
  accuracy REAL,
  recent_accuracy REAL,
  avg_seconds REAL,
  timed_sample_n INTEGER NOT NULL DEFAULT 0,
  full_paper_runs INTEGER NOT NULL DEFAULT 0,
  closed_book_passed INTEGER NOT NULL DEFAULT 0,
  distinct_trainings INTEGER NOT NULL DEFAULT 0,
  last_test_at TEXT,
  next_test_at TEXT,
  evidence_json TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS mastery_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_slug TEXT NOT NULL REFERENCES knowledge_node(slug),
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mh_node ON mastery_history(node_slug, created_at);

CREATE TABLE IF NOT EXISTS legacy_excerpt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_slug TEXT NOT NULL REFERENCES knowledge_node(slug),
  file_name TEXT NOT NULL,
  heading TEXT,
  start_line INTEGER,
  end_line INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS pdf_import (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  page_count INTEGER,
  parser_name TEXT,
  parser_version TEXT,
  status TEXT NOT NULL DEFAULT 'parsed',
  raw_text_path TEXT,
  total_parsed INTEGER NOT NULL DEFAULT 0,
  needs_review_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_import_sha ON pdf_import(sha256);

CREATE TABLE IF NOT EXISTS training (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trained_on TEXT NOT NULL,
  source TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'na',
  is_timed INTEGER NOT NULL DEFAULT 0,
  is_full_paper INTEGER NOT NULL DEFAULT 0,
  total_q INTEGER NOT NULL DEFAULT 0,
  correct_q INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  data_confidence TEXT NOT NULL DEFAULT 'needs_review',
  pdf_import_id INTEGER REFERENCES pdf_import(id),
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_training_date ON training(trained_on);

CREATE TABLE IF NOT EXISTS training_module_stat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_id INTEGER NOT NULL REFERENCES training(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  total_q INTEGER NOT NULL DEFAULT 0,
  correct_q INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER,
  UNIQUE(training_id, module)
);

CREATE TABLE IF NOT EXISTS material (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_id INTEGER REFERENCES training(id) ON DELETE CASCADE,
  pdf_import_id INTEGER REFERENCES pdf_import(id),
  seq INTEGER,
  text_md TEXT,
  images_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_id INTEGER REFERENCES training(id) ON DELETE CASCADE,
  pdf_import_id INTEGER REFERENCES pdf_import(id),
  material_id INTEGER REFERENCES material(id),
  seq INTEGER,
  module TEXT,
  subtype TEXT,
  node_slug TEXT REFERENCES knowledge_node(slug),
  stem_md TEXT,
  images_json TEXT NOT NULL DEFAULT '[]',
  options_json TEXT NOT NULL DEFAULT '{}',
  option_images_json TEXT NOT NULL DEFAULT '{}',
  is_multi_select INTEGER NOT NULL DEFAULT 0,
  user_answer TEXT,
  correct_answer TEXT,
  explanation_md TEXT,
  is_correct INTEGER,
  duration_sec INTEGER,
  duration_is_estimated INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'fenbi',
  parse_confidence REAL NOT NULL DEFAULT 0,
  parse_signals_json TEXT,
  raw_block TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_q_training ON question(training_id);
CREATE INDEX IF NOT EXISTS idx_q_node ON question(node_slug);
CREATE INDEX IF NOT EXISTS idx_q_verified ON question(verified, is_correct);

CREATE TABLE IF NOT EXISTS mistake (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL UNIQUE REFERENCES question(id) ON DELETE CASCADE,
  first_wrong_at TEXT NOT NULL,
  cause_primary TEXT,
  cause_secondary_json TEXT NOT NULL DEFAULT '[]',
  cause_note TEXT,
  standard_solution_md TEXT,
  fastest_solution_md TEXT,
  fastest_conditions TEXT,
  trap TEXT,
  related_node_slugs TEXT NOT NULL DEFAULT '[]',
  similar_question_ids TEXT NOT NULL DEFAULT '[]',
  review_count INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  last_review_at TEXT,
  next_review_at TEXT,
  status TEXT NOT NULL DEFAULT '待复训',
  not_worth_doing INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mistake_due ON mistake(next_review_at, status);
CREATE INDEX IF NOT EXISTS idx_mistake_status ON mistake(status);

CREATE TABLE IF NOT EXISTS review_attempt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mistake_id INTEGER NOT NULL REFERENCES mistake(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  answer TEXT,
  is_correct INTEGER NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  same_cause_as_before INTEGER,
  cause_this_time TEXT,
  reached_fix_standard INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ra_mistake ON review_attempt(mistake_id, attempt_no);

CREATE TABLE IF NOT EXISTS error_pattern (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern_key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  subtype TEXT,
  cause_primary TEXT,
  node_slug TEXT REFERENCES knowledge_node(slug),
  occurrences INTEGER NOT NULL DEFAULT 0,
  distinct_trainings INTEGER NOT NULL DEFAULT 0,
  consecutive_correct INTEGER NOT NULL DEFAULT 0,
  timed_runs_without INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '候选',
  first_seen_at TEXT,
  last_seen_at TEXT,
  evidence_question_ids TEXT NOT NULL DEFAULT '[]',
  fix_task_id INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS study_session (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  study_date TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  paused_sec INTEGER NOT NULL DEFAULT 0,
  subject TEXT NOT NULL DEFAULT 'xingce',
  module TEXT,
  activity_type TEXT NOT NULL,
  task_id INTEGER,
  task_name TEXT,
  category TEXT NOT NULL,
  time_slot TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ss_date ON study_session(study_date);

CREATE TABLE IF NOT EXISTS timer_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle',
  module TEXT,
  activity_type TEXT,
  task_id INTEGER,
  task_name TEXT,
  started_at TEXT,
  paused_at TEXT,
  last_beat_at TEXT,
  elapsed_sec INTEGER NOT NULL DEFAULT 0,
  paused_sec INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS phase (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seq INTEGER NOT NULL,
  start_week INTEGER NOT NULL,
  end_week INTEGER NOT NULL,
  goal_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS phase_exit_criterion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_code TEXT NOT NULL REFERENCES phase(code),
  label TEXT NOT NULL,
  metric TEXT NOT NULL,
  scope TEXT,
  operator TEXT NOT NULL,
  threshold REAL NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS week_plan (
  week_no INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  theme TEXT,
  phase_code TEXT REFERENCES phase(code),
  target_hours REAL NOT NULL DEFAULT 0,
  target_questions INTEGER NOT NULL DEFAULT 0,
  milestone TEXT,
  retro_md TEXT
);

CREATE TABLE IF NOT EXISTS week_module_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_no INTEGER NOT NULL REFERENCES week_plan(week_no) ON DELETE CASCADE,
  module TEXT NOT NULL,
  planned_hours REAL NOT NULL DEFAULT 0,
  planned_questions INTEGER NOT NULL DEFAULT 0,
  UNIQUE(week_no, module)
);

CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_date TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  module TEXT,
  reason_md TEXT,
  est_minutes INTEGER NOT NULL DEFAULT 0,
  steps_json TEXT NOT NULL DEFAULT '[]',
  done_criteria_md TEXT,
  node_slugs TEXT NOT NULL DEFAULT '[]',
  need_real_exam INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  actual_minutes INTEGER NOT NULL DEFAULT 0,
  postpone_count INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL DEFAULT 'auto',
  source_rule TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_date ON task(task_date, priority);

CREATE TABLE IF NOT EXISTS method (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  applies_to TEXT,
  source TEXT,
  adoption TEXT NOT NULL DEFAULT 'limited',
  basis TEXT,
  when_to_use TEXT,
  why_works TEXT,
  when_fails TEXT,
  error_direction TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS shenlun_writing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  written_on TEXT NOT NULL,
  prompt_source TEXT,
  question_type TEXT,
  duration_min INTEGER,
  word_count INTEGER,
  self_score REAL,
  feedback_md TEXT,
  revision_md TEXT,
  deduction_points_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
