defmodule SymphonyElixir.ForensicsIntegrationTest do
  use SymphonyElixir.TestSupport

  alias SymphonyElixir.{ForensicsRecorder, RunJournal}

  test "agent runner records repo snapshots, prompts, and raw codex events" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-forensics-agent-run-#{System.unique_integer([:positive])}"
      )

    workspace_root = Path.join(test_root, "workspaces")
    codex_binary = Path.join(test_root, "fake-codex")
    journal_file = Path.join(test_root, "run-journal.sqlite3")

    File.mkdir_p!(workspace_root)
    write_fake_codex_binary!(codex_binary)
    restart_default_run_journal!(journal_file)

    on_exit(fn ->
      restore_run_journal!()
      File.rm_rf(test_root)
    end)

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      workspace_root: workspace_root,
      codex_command: "#{codex_binary} app-server",
      hook_after_create: git_bootstrap_hook(),
      prompt: "Forensics prompt for {{ issue.identifier }} :: {{ issue.title }}"
    )

    issue = %Issue{
      id: "issue-forensics-agent",
      identifier: "MT-FORENSICS-AGENT",
      title: "Record the full run",
      description: "Verify the forensics journal integration",
      state: "In Progress",
      url: "https://example.org/issues/MT-FORENSICS-AGENT",
      labels: []
    }

    run_id = ForensicsRecorder.start_run(issue, worker_host: nil)

    assert :ok =
             AgentRunner.run(
               issue,
               nil,
               run_id: run_id,
               max_turns: 1,
               issue_state_fetcher: fn _issue_ids -> {:ok, []} end
             )

    assert {:ok, export} = RunJournal.fetch_run_export(run_id)
    assert export.issue.issue_identifier == issue.identifier
    assert export.run.status == "workspace_ready"
    assert export.run.outcome == nil
    assert export.run.repo_start["available"] == true
    assert is_binary(export.run.repo_start["commit_hash"])
    assert export.run.repo_start["dirty"] == false
    assert export.run.repo_end["available"] == true
    assert is_binary(export.run.repo_end["commit_hash"])

    assert [turn] = export.turns
    assert turn.prompt_text == "Forensics prompt for MT-FORENSICS-AGENT :: Record the full run"
    assert turn.codex_thread_id == "thread-agent"
    assert turn.codex_turn_id == "turn-agent"
    assert turn.codex_session_id == "thread-agent-turn-agent"

    event_types = Enum.map(turn.events, & &1.event_type)
    assert event_types == ["session_started", "notification", "turn_completed"]

    assert Enum.any?(turn.events, fn event ->
             event.event_type == "session_started" and event.payload["thread_id"] == "thread-agent"
           end)
  end

  test "orchestrator journals paused max-turn runs as first-class problem outcomes" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-forensics-orchestrator-#{System.unique_integer([:positive])}"
      )

    journal_file = Path.join(test_root, "run-journal.sqlite3")
    File.mkdir_p!(test_root)
    restart_default_run_journal!(journal_file)

    on_exit(fn ->
      restore_run_journal!()
      File.rm_rf(test_root)
    end)

    write_workflow_file!(Workflow.workflow_file_path(), tracker_kind: "memory")

    issue = %Issue{
      id: "issue-forensics-max-turns",
      identifier: "MT-FORENSICS-MAX",
      title: "Stop at max turns",
      description: "Verify paused-max-turn journaling",
      state: "In Progress",
      url: "https://example.org/issues/MT-FORENSICS-MAX",
      labels: []
    }

    run_id = ForensicsRecorder.start_run(issue, worker_host: nil)
    process_ref = make_ref()
    orchestrator_name = Module.concat(__MODULE__, :ForensicsMaxTurnsOrchestrator)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid) do
        Process.exit(pid, :normal)
      end
    end)

    initial_state = :sys.get_state(pid)

    running_entry = %{
      pid: self(),
      ref: process_ref,
      identifier: issue.identifier,
      issue: issue,
      run_id: run_id,
      worker_host: nil,
      workspace_path: nil,
      session_id: "thread-max-turn",
      turn_count: 1,
      last_codex_message: nil,
      last_codex_timestamp: nil,
      last_codex_event: nil,
      last_rate_limits: nil,
      started_at: DateTime.utc_now()
    }

    :sys.replace_state(pid, fn _ ->
      initial_state
      |> Map.put(:running, %{issue.id => running_entry})
      |> Map.put(:claimed, MapSet.new([issue.id]))
    end)

    send(pid, {:agent_max_turns_reached, issue.id, 2})
    send(pid, {:DOWN, process_ref, :process, self(), :normal})

    assert_eventually(fn ->
      case RunJournal.fetch_run_export(run_id) do
        {:ok, export} -> export.run.status == "paused"
        _ -> false
      end
    end)

    assert {:ok, export} = RunJournal.fetch_run_export(run_id)
    assert export.run.status == "paused"
    assert export.run.outcome == "paused_max_turns"
    assert export.run.error_class == "max_turns_reached"
    assert export.run.error_message =~ "configured 2-turn limit"
  end

  test "orchestrator journals rate-limited runs as first-class problem outcomes" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-forensics-rate-limit-#{System.unique_integer([:positive])}"
      )

    journal_file = Path.join(test_root, "run-journal.sqlite3")
    File.mkdir_p!(test_root)
    restart_default_run_journal!(journal_file)

    on_exit(fn ->
      restore_run_journal!()
      File.rm_rf(test_root)
    end)

    write_workflow_file!(Workflow.workflow_file_path(), tracker_kind: "memory")

    issue = %Issue{
      id: "issue-forensics-rate-limit",
      identifier: "MT-FORENSICS-RATE",
      title: "Pause for rate limits",
      description: "Verify rate-limited journaling",
      state: "In Progress",
      url: "https://example.org/issues/MT-FORENSICS-RATE",
      labels: []
    }

    run_id = ForensicsRecorder.start_run(issue, worker_host: nil)
    process_ref = make_ref()
    orchestrator_name = Module.concat(__MODULE__, :ForensicsRateLimitOrchestrator)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid) do
        Process.exit(pid, :normal)
      end
    end)

    put_running_entry!(pid, issue, run_id, process_ref,
      pid: self(),
      started_at: DateTime.utc_now(),
      last_rate_limits: %{
        limit_id: "gpt-5",
        primary: %{remaining: 0, limit: 20_000, reset_in_seconds: 95}
      }
    )

    send(
      pid,
      {:agent_failure, issue.id, {:turn_failed, %{"message" => "Rate limit exceeded", "code" => "rate_limit_exceeded"}}}
    )

    send(pid, {:DOWN, process_ref, :process, self(), :boom})

    assert_run_export_eventually(run_id, fn export ->
      export.run.status == "rate_limited"
    end)

    assert {:ok, export} = RunJournal.fetch_run_export(run_id)
    assert export.run.status == "rate_limited"
    assert export.run.outcome == "rate_limited"
    assert export.run.error_class == "turn_failed"
    assert export.run.error_message =~ "rate limit"
  end

  test "orchestrator journals startup failures as first-class problem outcomes" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-forensics-startup-failure-#{System.unique_integer([:positive])}"
      )

    journal_file = Path.join(test_root, "run-journal.sqlite3")
    File.mkdir_p!(test_root)
    restart_default_run_journal!(journal_file)

    on_exit(fn ->
      restore_run_journal!()
      File.rm_rf(test_root)
    end)

    write_workflow_file!(Workflow.workflow_file_path(), tracker_kind: "memory")

    issue = %Issue{
      id: "issue-forensics-startup-failure",
      identifier: "MT-FORENSICS-STARTUP",
      title: "Fail during startup",
      description: "Verify startup-failure journaling",
      state: "In Progress",
      url: "https://example.org/issues/MT-FORENSICS-STARTUP",
      labels: []
    }

    run_id = ForensicsRecorder.start_run(issue, worker_host: nil)
    process_ref = make_ref()
    orchestrator_name = Module.concat(__MODULE__, :ForensicsStartupFailureOrchestrator)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid) do
        Process.exit(pid, :normal)
      end
    end)

    put_running_entry!(pid, issue, run_id, process_ref,
      pid: self(),
      started_at: DateTime.utc_now()
    )

    send(pid, {:DOWN, process_ref, :process, self(), {:workspace_prepare_failed, :invalid_output, "broken workspace bootstrap"}})

    assert_run_export_eventually(run_id, fn export ->
      export.run.status == "startup_failed"
    end)

    assert {:ok, export} = RunJournal.fetch_run_export(run_id)
    assert export.run.status == "startup_failed"
    assert export.run.outcome == "startup_failed"
    assert export.run.error_class == "workspace_prepare_failed"
    assert export.run.error_message =~ "workspace"
  end

  test "orchestrator journals stalled runs as first-class problem outcomes" do
    test_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-elixir-forensics-stalled-#{System.unique_integer([:positive])}"
      )

    journal_file = Path.join(test_root, "run-journal.sqlite3")
    File.mkdir_p!(test_root)
    restart_default_run_journal!(journal_file)

    on_exit(fn ->
      restore_run_journal!()
      File.rm_rf(test_root)
    end)

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      codex_stall_timeout_ms: 1_000
    )

    issue = %Issue{
      id: "issue-forensics-stalled",
      identifier: "MT-FORENSICS-STALL",
      title: "Stall the worker",
      description: "Verify stalled journaling",
      state: "In Progress",
      url: "https://example.org/issues/MT-FORENSICS-STALL",
      labels: []
    }

    run_id = ForensicsRecorder.start_run(issue, worker_host: nil)

    worker_pid =
      spawn(fn ->
        receive do
          :done -> :ok
        end
      end)

    orchestrator_name = Module.concat(__MODULE__, :ForensicsStalledOrchestrator)
    {:ok, pid} = Orchestrator.start_link(name: orchestrator_name)

    on_exit(fn ->
      if Process.alive?(pid) do
        Process.exit(pid, :normal)
      end

      if Process.alive?(worker_pid) do
        Process.exit(worker_pid, :normal)
      end
    end)

    stale_activity_at = DateTime.add(DateTime.utc_now(), -5, :second)

    put_running_entry!(pid, issue, run_id, make_ref(),
      pid: worker_pid,
      started_at: stale_activity_at,
      last_codex_timestamp: stale_activity_at,
      last_codex_event: :notification,
      session_id: "thread-stall-turn-stall"
    )

    send(pid, :tick)

    assert_run_export_eventually(run_id, fn export ->
      export.run.status == "stalled"
    end)

    assert {:ok, export} = RunJournal.fetch_run_export(run_id)
    assert export.run.status == "stalled"
    assert export.run.outcome == "stalled"
    assert export.run.error_class == "stalled"
    assert export.run.error_message =~ "stalled for"
    refute Process.alive?(worker_pid)
  end

  defp write_fake_codex_binary!(codex_binary) do
    File.write!(codex_binary, """
    #!/bin/sh
    count=0

    while IFS= read -r _line; do
      count=$((count + 1))

      case "$count" in
        1)
          printf '%s\\n' '{"id":1,"result":{}}'
          ;;
        2)
          ;;
        3)
          printf '%s\\n' '{"id":2,"result":{"thread":{"id":"thread-agent"}}}'
          ;;
        4)
          printf '%s\\n' '{"id":3,"result":{"turn":{"id":"turn-agent"}}}'
          printf '%s\\n' '{"method":"thread/tokenUsage/updated","params":{"tokenUsage":{"total":{"inputTokens":5,"outputTokens":2,"totalTokens":7}}}}'
          printf '%s\\n' '{"method":"turn/completed","params":{"result":"ok"}}'
          exit 0
          ;;
        *)
          exit 0
          ;;
      esac
    done
    """)

    File.chmod!(codex_binary, 0o755)
  end

  defp git_bootstrap_hook do
    [
      "git init -b main .",
      "git config user.email test@example.com",
      "git config user.name 'Symphony Test'",
      "printf 'tracked\\n' > tracked.txt",
      "git add tracked.txt",
      "git commit -m init >/dev/null"
    ]
    |> Enum.join(" && ")
  end

  defp put_running_entry!(pid, issue, run_id, process_ref, attrs) do
    initial_state = :sys.get_state(pid)

    running_entry =
      Map.merge(
        %{
          pid: self(),
          ref: process_ref,
          identifier: issue.identifier,
          issue: issue,
          run_id: run_id,
          worker_host: nil,
          workspace_path: nil,
          session_id: "thread-test",
          turn_count: 1,
          last_codex_message: nil,
          last_codex_timestamp: nil,
          last_codex_event: nil,
          last_rate_limits: nil,
          started_at: DateTime.utc_now()
        },
        Map.new(attrs)
      )

    :sys.replace_state(pid, fn _ ->
      initial_state
      |> Map.put(:running, %{issue.id => running_entry})
      |> Map.put(:claimed, MapSet.new([issue.id]))
    end)
  end

  defp assert_run_export_eventually(run_id, fun, attempts \\ 20)

  defp assert_run_export_eventually(run_id, fun, attempts) when attempts > 0 do
    case RunJournal.fetch_run_export(run_id) do
      {:ok, export} when is_map(export) ->
        if fun.(export) do
          true
        else
          Process.sleep(25)
          assert_run_export_eventually(run_id, fun, attempts - 1)
        end

      _ ->
        Process.sleep(25)
        assert_run_export_eventually(run_id, fun, attempts - 1)
    end
  end

  defp assert_run_export_eventually(run_id, _fun, 0) do
    flunk("timed out waiting for run export #{run_id}")
  end

  defp restart_default_run_journal!(journal_file) do
    previous = Application.get_env(:symphony_elixir, :run_journal_file)
    Process.put(:previous_run_journal_file, previous)
    Application.put_env(:symphony_elixir, :run_journal_file, journal_file)

    if Process.whereis(SymphonyElixir.Supervisor) do
      if Process.whereis(SymphonyElixir.RunJournal) do
        assert :ok = Supervisor.terminate_child(SymphonyElixir.Supervisor, SymphonyElixir.RunJournal)
      end

      case Supervisor.restart_child(SymphonyElixir.Supervisor, SymphonyElixir.RunJournal) do
        {:ok, _pid} -> :ok
        {:ok, _pid, _info} -> :ok
      end
    end

    :ok
  end

  defp restore_run_journal! do
    previous = Process.get(:previous_run_journal_file)

    if is_nil(previous) do
      Application.delete_env(:symphony_elixir, :run_journal_file)
    else
      Application.put_env(:symphony_elixir, :run_journal_file, previous)
    end

    if Process.whereis(SymphonyElixir.Supervisor) do
      if Process.whereis(SymphonyElixir.RunJournal) do
        assert :ok = Supervisor.terminate_child(SymphonyElixir.Supervisor, SymphonyElixir.RunJournal)
      end

      case Supervisor.restart_child(SymphonyElixir.Supervisor, SymphonyElixir.RunJournal) do
        {:ok, _pid} -> :ok
        {:ok, _pid, _info} -> :ok
      end
    end

    Process.delete(:previous_run_journal_file)
    :ok
  end

  defp assert_eventually(fun, attempts \\ 20)

  defp assert_eventually(fun, attempts) when attempts > 0 do
    if fun.() do
      true
    else
      Process.sleep(25)
      assert_eventually(fun, attempts - 1)
    end
  end

  defp assert_eventually(_fun, 0) do
    flunk("timed out waiting for condition")
  end
end
