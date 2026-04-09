WITH ranked_active_runs AS (
  SELECT
    run_id,
    ROW_NUMBER() OVER (
      PARTITION BY issue_identifier
      ORDER BY
        CASE status
          WHEN 'running' THEN 0
          ELSE 1
        END,
        started_at DESC,
        inserted_at DESC,
        run_id DESC
    ) AS active_rank
  FROM symphony_runs
  WHERE status IN ('dispatching', 'running')
),
duplicate_active_runs AS (
  SELECT run_id
  FROM ranked_active_runs
  WHERE active_rank > 1
)
UPDATE symphony_turns
SET
  status = 'stopped',
  ended_at = COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE run_id IN (SELECT run_id FROM duplicate_active_runs)
  AND status = 'running';

WITH ranked_active_runs AS (
  SELECT
    run_id,
    ROW_NUMBER() OVER (
      PARTITION BY issue_identifier
      ORDER BY
        CASE status
          WHEN 'running' THEN 0
          ELSE 1
        END,
        started_at DESC,
        inserted_at DESC,
        run_id DESC
    ) AS active_rank
  FROM symphony_runs
  WHERE status IN ('dispatching', 'running')
),
duplicate_active_runs AS (
  SELECT run_id
  FROM ranked_active_runs
  WHERE active_rank > 1
)
UPDATE symphony_runs
SET
  status = 'paused',
  ended_at = COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  error_class = COALESCE(error_class, 'duplicate_active_run_guard'),
  error_message = COALESCE(
    error_message,
    'Paused during migration because another active run already existed for this issue.'
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE run_id IN (SELECT run_id FROM duplicate_active_runs);

CREATE UNIQUE INDEX IF NOT EXISTS symphony_runs_one_active_run_per_issue_idx
ON symphony_runs (issue_identifier)
WHERE status IN ('dispatching', 'running');
