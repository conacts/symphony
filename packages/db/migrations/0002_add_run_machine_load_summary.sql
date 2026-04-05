ALTER TABLE symphony_runs
  ADD COLUMN machine_load_sample_count INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_max_cpu_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_avg_cpu_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_max_memory_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_avg_memory_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_max_disk_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_avg_disk_percent INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_had_high_cpu INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_had_high_memory INTEGER;

ALTER TABLE symphony_runs
  ADD COLUMN machine_load_had_high_disk INTEGER;
