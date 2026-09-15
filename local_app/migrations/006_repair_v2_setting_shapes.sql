-- Repair stale local V2 settings that were written by older builds with incompatible JSON shapes.
-- The current runtime expects these keys to be JSON objects and note_expansions:* to be JSON arrays.
-- Preserve valid values; discard only values that cannot satisfy the current contract.

DELETE FROM setting
WHERE key IN (
  'active_practice_session_v2',
  'active_review_session_v2',
  'note_view_history_v1',
  'method_adoption_v1',
  'method_validation_v1',
  'diagnosis_feedback_v1',
  'background_imports_v2'
)
AND substr(ltrim(value_json), 1, 1) <> '{';

DELETE FROM setting
WHERE key LIKE 'note_expansions:%'
AND substr(ltrim(value_json), 1, 1) <> '[';
