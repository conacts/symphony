defmodule SymphonyElixir.RunJournalTest do
  use ExUnit.Case, async: false

  alias SymphonyElixir.RunJournal

  test "default_db_file/0 uses the current working directory" do
    assert RunJournal.default_db_file() == Path.join(File.cwd!(), "log/run-journal.sqlite3")
  end

  test "default_db_file/1 builds the journal path under a custom root" do
    assert RunJournal.default_db_file("/tmp/symphony-logs") ==
             "/tmp/symphony-logs/log/run-journal.sqlite3"
  end

  test "records nested runs, turns, and raw events for export and issue views" do
    {:ok, journal, _db_root} = start_journal()

    {:ok, run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-123",
        issue_identifier: "COL-123",
        attempt: 1,
        status: "running",
        worker_host: "local",
        workspace_path: "/tmp/symphony-COL-123",
        commit_hash_start: "abc123",
        repo_start: %{"dirty" => true},
        metadata: %{"picked_up_by" => "test"}
      })

    {:ok, turn_id} =
      RunJournal.record_turn_started(journal, run_id, %{
        turn_sequence: 1,
        codex_thread_id: "thread-1",
        codex_turn_id: "turn-1",
        codex_session_id: "thread-1-turn-1",
        prompt_text: "Implement the requested change."
      })

    {:ok, _event_id} =
      RunJournal.record_event(journal, run_id, turn_id, %{
        event_sequence: 1,
        event_type: "session_started",
        codex_thread_id: "thread-1",
        codex_turn_id: "turn-1",
        codex_session_id: "thread-1-turn-1",
        payload: %{"event" => "session_started", "session_id" => "thread-1-turn-1"},
        summary: "session started"
      })

    :ok =
      RunJournal.finalize_turn(journal, turn_id, %{
        status: "completed",
        tokens: %{"input_tokens" => 11, "output_tokens" => 7, "total_tokens" => 18}
      })

    :ok =
      RunJournal.finalize_run(journal, run_id, %{
        status: "finished",
        outcome: "paused_max_turns",
        commit_hash_end: "def456",
        repo_end: %{"dirty" => true, "diffstat" => "1 file changed"},
        error_class: "max_turns_reached",
        error_message: "Reached the configured max turns."
      })

    assert {:ok, [%{issue_identifier: "COL-123"}]} = RunJournal.list_issues(journal)

    assert {:ok, [%{run_id: ^run_id, outcome: "paused_max_turns"}]} =
             RunJournal.list_runs_for_issue(journal, "COL-123")

    assert {:ok, [%{run_id: ^run_id, outcome: "paused_max_turns"}]} =
             RunJournal.list_problem_runs(journal)

    assert {:ok, export} = RunJournal.fetch_run_export(journal, run_id)
    assert export.issue.issue_identifier == "COL-123"
    assert export.run.commit_hash_start == "abc123"
    assert export.run.commit_hash_end == "def456"
    assert export.run.repo_start == %{"dirty" => true}
    assert export.run.repo_end == %{"diffstat" => "1 file changed", "dirty" => true}
    assert length(export.turns) == 1

    [turn] = export.turns
    assert turn.turn_id == turn_id
    assert turn.prompt_text == "Implement the requested change."
    assert turn.tokens == %{"input_tokens" => 11, "output_tokens" => 7, "total_tokens" => 18}
    assert length(turn.events) == 1

    [event] = turn.events
    assert event.event_type == "session_started"
    assert event.payload == %{"event" => "session_started", "session_id" => "thread-1-turn-1"}
    refute event.payload_truncated
  end

  test "truncates oversized payloads while preserving original byte count" do
    {:ok, journal, _db_root} = start_journal(payload_max_bytes: 48)

    {:ok, run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-truncated",
        issue_identifier: "COL-TRUNC"
      })

    {:ok, turn_id} =
      RunJournal.record_turn_started(journal, run_id, %{
        prompt_text: "Capture the giant payload."
      })

    long_payload = %{"message" => String.duplicate("payload-", 40)}

    {:ok, _event_id} =
      RunJournal.record_event(journal, run_id, turn_id, %{
        event_type: "stream_chunk",
        payload: long_payload
      })

    assert {:ok, export} = RunJournal.fetch_run_export(journal, run_id)
    [turn] = export.turns
    [event] = turn.events

    assert event.payload_truncated
    assert event.payload_bytes > 48
    assert event.payload["truncated"] == true
    assert is_binary(event.payload["preview"])
    assert event.payload["original_bytes"] == event.payload_bytes
  end

  test "prunes runs older than the retention window and removes orphaned issues" do
    {:ok, journal, _db_root} = start_journal(retention_days: 90)

    started_at =
      DateTime.utc_now()
      |> DateTime.add(-(91 * 24 * 60 * 60), :second)

    {:ok, run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-old",
        issue_identifier: "COL-OLD",
        started_at: started_at
      })

    assert {:ok, [%{issue_identifier: "COL-OLD"}]} = RunJournal.list_issues(journal)

    assert :ok = RunJournal.prune_retention(journal)
    assert {:ok, []} = RunJournal.list_issues(journal)
    assert {:error, :not_found} = RunJournal.fetch_run_export(journal, run_id)
  end

  test "redacts obvious secrets before persistence and export" do
    {:ok, journal, _db_root} = start_journal()

    {:ok, run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-redacted",
        issue_identifier: "COL-REDACT",
        repo_start: %{
          "patch" => "Authorization: Bearer top-secret-token\nOPENAI_API_KEY=sk-secret\n"
        }
      })

    {:ok, turn_id} =
      RunJournal.record_turn_started(journal, run_id, %{
        prompt_text: "Use Authorization: Bearer top-secret-token and api_key=abcdef"
      })

    {:ok, _event_id} =
      RunJournal.record_event(journal, run_id, turn_id, %{
        event_type: "tool_call",
        summary: "cookie=session=abc123",
        payload: %{
          "headers" => %{
            "Authorization" => "Bearer top-secret-token",
            "Cookie" => "session=abc123"
          }
        }
      })

    :ok =
      RunJournal.finalize_run(journal, run_id, %{
        error_class: "token=oops",
        error_message: "password=very-secret"
      })

    assert {:ok, export} = RunJournal.fetch_run_export(journal, run_id)
    assert export.run.repo_start["patch"] =~ "[REDACTED]"
    refute export.run.repo_start["patch"] =~ "top-secret-token"
    refute export.run.repo_start["patch"] =~ "sk-secret"

    [turn] = export.turns
    assert turn.prompt_text =~ "[REDACTED]"
    refute turn.prompt_text =~ "top-secret-token"
    refute turn.prompt_text =~ "abcdef"

    [event] = turn.events
    assert event.summary =~ "[REDACTED]"
    assert event.payload["headers"]["Authorization"] == "Bearer [REDACTED]"
    assert event.payload["headers"]["Cookie"] == "[REDACTED]"
    assert export.run.error_class =~ "[REDACTED]"
    assert export.run.error_message =~ "[REDACTED]"
  end

  defp start_journal(opts \\ []) do
    db_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-run-journal-#{System.unique_integer([:positive])}"
      )

    File.mkdir_p!(db_root)

    journal_name = Module.concat(__MODULE__, :"Journal#{System.unique_integer([:positive])}")

    journal =
      start_supervised!(
        {RunJournal,
         Keyword.merge(
           [
             name: journal_name,
             db_file: Path.join(db_root, "run-journal.sqlite3"),
             prune_interval_ms: :timer.hours(12)
           ],
           opts
         )}
      )

    on_exit(fn ->
      File.rm_rf(db_root)
    end)

    {:ok, journal, db_root}
  end
end
