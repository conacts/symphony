defmodule SymphonyElixir.Orchestrator do
  @moduledoc """
  Polls Linear and dispatches repository copies to Codex-backed workers.
  """

  use GenServer
  require Logger
  import Bitwise, only: [<<<: 2]

  alias SymphonyElixir.{AgentRunner, Config, ForensicsRecorder, StatusDashboard, Tracker, Workspace}
  alias SymphonyElixir.Linear.Issue

  @continuation_retry_delay_ms 1_000
  @failure_retry_base_ms 10_000
  @failure_comment_excerpt_lines 12
  @failure_comment_excerpt_max_bytes 2_048
  # Slightly above the dashboard render interval so "checking now…" can render.
  @poll_transition_render_delay_ms 20
  @empty_codex_totals %{
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    seconds_running: 0
  }

  defmodule State do
    @moduledoc """
    Runtime state for the orchestrator polling loop.
    """

    defstruct [
      :poll_interval_ms,
      :max_concurrent_agents,
      :next_poll_due_at_ms,
      :poll_check_in_progress,
      :tick_timer_ref,
      :tick_token,
      running: %{},
      completed: MapSet.new(),
      claimed: MapSet.new(),
      failure_comment_signatures: %{},
      retry_attempts: %{},
      codex_totals: nil,
      codex_rate_limits: nil
    ]
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, name: name)
  end

  @impl true
  def init(_opts) do
    now_ms = System.monotonic_time(:millisecond)
    config = Config.settings!()

    state = %State{
      poll_interval_ms: config.polling.interval_ms,
      max_concurrent_agents: config.agent.max_concurrent_agents,
      next_poll_due_at_ms: now_ms,
      poll_check_in_progress: false,
      tick_timer_ref: nil,
      tick_token: nil,
      codex_totals: @empty_codex_totals,
      codex_rate_limits: nil
    }

    run_terminal_workspace_cleanup()
    state = schedule_tick(state, 0)

    {:ok, state}
  end

  @impl true
  def handle_info({:tick, tick_token}, %{tick_token: tick_token} = state)
      when is_reference(tick_token) do
    state = refresh_runtime_config(state)

    state = %{
      state
      | poll_check_in_progress: true,
        next_poll_due_at_ms: nil,
        tick_timer_ref: nil,
        tick_token: nil
    }

    notify_dashboard()
    :ok = schedule_poll_cycle_start()
    {:noreply, state}
  end

  def handle_info({:tick, _tick_token}, state), do: {:noreply, state}

  def handle_info(:tick, state) do
    state = refresh_runtime_config(state)

    state = %{
      state
      | poll_check_in_progress: true,
        next_poll_due_at_ms: nil,
        tick_timer_ref: nil,
        tick_token: nil
    }

    notify_dashboard()
    :ok = schedule_poll_cycle_start()
    {:noreply, state}
  end

  def handle_info(:run_poll_cycle, state) do
    state = refresh_runtime_config(state)
    state = maybe_dispatch(state)
    state = schedule_tick(state, state.poll_interval_ms)
    state = %{state | poll_check_in_progress: false}

    notify_dashboard()
    {:noreply, state}
  end

  def handle_info(
        {:DOWN, ref, :process, _pid, reason},
        %{running: running} = state
      ) do
    case find_issue_id_for_ref(running, ref) do
      nil ->
        {:noreply, state}

      issue_id ->
        {running_entry, state} = pop_running_entry(state, issue_id)
        state = record_session_completion_totals(state, running_entry)
        session_id = running_entry_session_id(running_entry)

        state =
          case reason do
            :normal ->
              Logger.info("Agent task completed for issue_id=#{issue_id} session_id=#{session_id}; scheduling active-state continuation check")

              ForensicsRecorder.finalize_run(
                Map.get(running_entry, :run_id),
                journal_run_attrs_for_normal_completion(running_entry)
              )

              state
              |> maybe_create_failure_comment(
                running_entry,
                Map.get(running_entry, :completion_reason),
                rate_limits: Map.get(running_entry, :last_rate_limits)
              )
              |> complete_issue(issue_id)
              |> schedule_issue_retry(issue_id, 1, %{
                identifier: running_entry.identifier,
                delay_type: :continuation,
                worker_host: Map.get(running_entry, :worker_host),
                workspace_path: Map.get(running_entry, :workspace_path)
              })

            _ ->
              failure_reason = Map.get(running_entry, :last_failure_reason, reason)

              if startup_failure_reason?(failure_reason) do
                Logger.warning("Agent startup failed for issue_id=#{issue_id} session_id=#{session_id}; parking without retry")

                ForensicsRecorder.finalize_run(
                  Map.get(running_entry, :run_id),
                  journal_run_attrs_for_failure(running_entry, failure_reason)
                )

                handle_startup_failure(state, issue_id, running_entry, failure_reason)
              else
                Logger.warning("Agent task exited for issue_id=#{issue_id} session_id=#{session_id} reason=#{inspect(reason)}; scheduling retry")

                ForensicsRecorder.finalize_run(
                  Map.get(running_entry, :run_id),
                  journal_run_attrs_for_failure(running_entry, failure_reason)
                )

                next_attempt = next_retry_attempt_from_running(running_entry)

                state
                |> maybe_create_failure_comment(
                  running_entry,
                  failure_reason,
                  rate_limits: Map.get(running_entry, :last_rate_limits)
                )
                |> schedule_issue_retry(issue_id, next_attempt, %{
                  identifier: running_entry.identifier,
                  error: "agent exited: #{inspect(failure_reason)}",
                  worker_host: Map.get(running_entry, :worker_host),
                  workspace_path: Map.get(running_entry, :workspace_path)
                })
              end
          end

        Logger.info("Agent task finished for issue_id=#{issue_id} session_id=#{session_id} reason=#{inspect(reason)}")

        notify_dashboard()
        {:noreply, state}
    end
  end

  def handle_info({:agent_failure, issue_id, reason}, %{running: running} = state)
      when is_binary(issue_id) do
    case Map.get(running, issue_id) do
      nil ->
        {:noreply, state}

      running_entry ->
        {:noreply, %{state | running: Map.put(running, issue_id, Map.put(running_entry, :last_failure_reason, reason))}}
    end
  end

  def handle_info({:agent_max_turns_reached, issue_id, max_turns}, %{running: running} = state)
      when is_binary(issue_id) and is_integer(max_turns) do
    case Map.get(running, issue_id) do
      nil ->
        {:noreply, state}

      running_entry ->
        updated_running_entry =
          Map.put(running_entry, :completion_reason, {:max_turns_reached, max_turns})

        {:noreply, %{state | running: Map.put(running, issue_id, updated_running_entry)}}
    end
  end

  def handle_info({:worker_runtime_info, issue_id, runtime_info}, %{running: running} = state)
      when is_binary(issue_id) and is_map(runtime_info) do
    case Map.get(running, issue_id) do
      nil ->
        {:noreply, state}

      running_entry ->
        updated_running_entry =
          running_entry
          |> maybe_put_runtime_value(:worker_host, runtime_info[:worker_host])
          |> maybe_put_runtime_value(:workspace_path, runtime_info[:workspace_path])

        notify_dashboard()
        {:noreply, %{state | running: Map.put(running, issue_id, updated_running_entry)}}
    end
  end

  def handle_info(
        {:codex_worker_update, issue_id, %{event: _, timestamp: _} = update},
        %{running: running} = state
      ) do
    case Map.get(running, issue_id) do
      nil ->
        {:noreply, state}

      running_entry ->
        {updated_running_entry, token_delta} = integrate_codex_update(running_entry, update)

        state =
          state
          |> apply_codex_token_delta(token_delta)
          |> apply_codex_rate_limits(update)

        notify_dashboard()
        {:noreply, %{state | running: Map.put(running, issue_id, updated_running_entry)}}
    end
  end

  def handle_info({:codex_worker_update, _issue_id, _update}, state), do: {:noreply, state}

  def handle_info({:retry_issue, issue_id, retry_token}, state) do
    result =
      case pop_retry_attempt_state(state, issue_id, retry_token) do
        {:ok, attempt, metadata, state} -> handle_retry_issue(state, issue_id, attempt, metadata)
        :missing -> {:noreply, state}
      end

    notify_dashboard()
    result
  end

  def handle_info({:retry_issue, _issue_id}, state), do: {:noreply, state}

  def handle_info(msg, state) do
    Logger.debug("Orchestrator ignored message: #{inspect(msg)}")
    {:noreply, state}
  end

  defp maybe_dispatch(%State{} = state) do
    state = reconcile_running_issues(state)
    state = reconcile_parked_claimed_issues(state)

    with :ok <- Config.validate!(),
         {:ok, issues} <- Tracker.fetch_candidate_issues(),
         true <- available_slots(state) > 0 do
      choose_issues(issues, state)
    else
      {:error, :missing_linear_api_token} ->
        Logger.error("Linear API token missing in WORKFLOW.md")
        state

      {:error, :missing_linear_tracker_scope} ->
        Logger.error("Linear tracker scope missing in WORKFLOW.md")
        state

      {:error, :missing_tracker_kind} ->
        Logger.error("Tracker kind missing in WORKFLOW.md")

        state

      {:error, {:unsupported_tracker_kind, kind}} ->
        Logger.error("Unsupported tracker kind in WORKFLOW.md: #{inspect(kind)}")

        state

      {:error, {:invalid_workflow_config, message}} ->
        Logger.error("Invalid WORKFLOW.md config: #{message}")
        state

      {:error, {:missing_workflow_file, path, reason}} ->
        Logger.error("Missing WORKFLOW.md at #{path}: #{inspect(reason)}")
        state

      {:error, :workflow_front_matter_not_a_map} ->
        Logger.error("Failed to parse WORKFLOW.md: workflow front matter must decode to a map")
        state

      {:error, {:workflow_parse_error, reason}} ->
        Logger.error("Failed to parse WORKFLOW.md: #{inspect(reason)}")
        state

      {:error, reason} ->
        Logger.error("Failed to fetch from Linear: #{inspect(reason)}")
        state

      false ->
        state
    end
  end

  defp reconcile_running_issues(%State{} = state) do
    state = reconcile_stalled_running_issues(state)
    running_ids = Map.keys(state.running)

    if running_ids == [] do
      state
    else
      case Tracker.fetch_issue_states_by_ids(running_ids) do
        {:ok, issues} ->
          issues
          |> reconcile_running_issue_states(
            state,
            dispatchable_state_set(),
            terminal_state_set()
          )
          |> reconcile_missing_running_issue_ids(running_ids, issues)

        {:error, reason} ->
          Logger.debug("Failed to refresh running issue states: #{inspect(reason)}; keeping active workers")

          state
      end
    end
  end

  @doc false
  @spec reconcile_issue_states_for_test([Issue.t()], term()) :: term()
  def reconcile_issue_states_for_test(issues, %State{} = state) when is_list(issues) do
    reconcile_running_issue_states(issues, state, dispatchable_state_set(), terminal_state_set())
  end

  def reconcile_issue_states_for_test(issues, state) when is_list(issues) do
    reconcile_running_issue_states(issues, state, dispatchable_state_set(), terminal_state_set())
  end

  @doc false
  @spec should_dispatch_issue_for_test(Issue.t(), term()) :: boolean()
  def should_dispatch_issue_for_test(%Issue{} = issue, %State{} = state) do
    should_dispatch_issue?(issue, state, dispatchable_state_set(), terminal_state_set())
  end

  @doc false
  @spec revalidate_issue_for_dispatch_for_test(Issue.t(), ([String.t()] -> term())) ::
          {:ok, Issue.t()} | {:skip, Issue.t() | :missing} | {:error, term()}
  def revalidate_issue_for_dispatch_for_test(%Issue{} = issue, issue_fetcher)
      when is_function(issue_fetcher, 1) do
    revalidate_issue_for_dispatch(issue, issue_fetcher, terminal_state_set())
  end

  @doc false
  @spec sort_issues_for_dispatch_for_test([Issue.t()]) :: [Issue.t()]
  def sort_issues_for_dispatch_for_test(issues) when is_list(issues) do
    sort_issues_for_dispatch(issues)
  end

  @doc false
  @spec select_worker_host_for_test(term(), String.t() | nil) :: String.t() | nil | :no_worker_capacity
  def select_worker_host_for_test(%State{} = state, preferred_worker_host) do
    select_worker_host(state, preferred_worker_host)
  end

  @doc false
  @spec reconcile_parked_claims_for_test(term()) :: term()
  def reconcile_parked_claims_for_test(%State{} = state) do
    reconcile_parked_claimed_issues(state)
  end

  @doc false
  @spec prepare_issue_for_dispatch_for_test(Issue.t()) :: {:ok, Issue.t()} | {:error, term()}
  def prepare_issue_for_dispatch_for_test(%Issue{} = issue) do
    prepare_issue_for_dispatch(issue)
  end

  defp reconcile_running_issue_states([], state, _active_states, _terminal_states), do: state

  defp reconcile_running_issue_states([issue | rest], state, active_states, terminal_states) do
    reconcile_running_issue_states(
      rest,
      reconcile_issue_state(issue, state, active_states, terminal_states),
      active_states,
      terminal_states
    )
  end

  defp reconcile_issue_state(%Issue{} = issue, state, active_states, terminal_states) do
    cond do
      terminal_issue_state?(issue.state, terminal_states) ->
        Logger.info("Issue moved to terminal state: #{issue_context(issue)} state=#{issue.state}; stopping active agent")

        terminate_running_issue(state, issue.id, true, "stopped_terminal_state")

      !issue_routable_to_worker?(issue) ->
        Logger.info("Issue no longer routed to this worker: #{issue_context(issue)} assignee=#{inspect(issue.assignee_id)}; stopping active agent")

        terminate_running_issue(state, issue.id, false, "stopped_rerouted")

      active_issue_state?(issue.state, active_states) ->
        refresh_running_issue_state(state, issue)

      true ->
        Logger.info("Issue moved to non-active state: #{issue_context(issue)} state=#{issue.state}; stopping active agent")

        terminate_running_issue(state, issue.id, false, "stopped_non_active")
    end
  end

  defp reconcile_issue_state(_issue, state, _active_states, _terminal_states), do: state

  defp reconcile_missing_running_issue_ids(%State{} = state, requested_issue_ids, issues)
       when is_list(requested_issue_ids) and is_list(issues) do
    visible_issue_ids =
      issues
      |> Enum.flat_map(fn
        %Issue{id: issue_id} when is_binary(issue_id) -> [issue_id]
        _ -> []
      end)
      |> MapSet.new()

    Enum.reduce(requested_issue_ids, state, fn issue_id, state_acc ->
      if MapSet.member?(visible_issue_ids, issue_id) do
        state_acc
      else
        log_missing_running_issue(state_acc, issue_id)
        terminate_running_issue(state_acc, issue_id, false, "stopped_missing_issue")
      end
    end)
  end

  defp reconcile_missing_running_issue_ids(state, _requested_issue_ids, _issues), do: state

  defp log_missing_running_issue(%State{} = state, issue_id) when is_binary(issue_id) do
    case Map.get(state.running, issue_id) do
      %{identifier: identifier} ->
        Logger.info("Issue no longer visible during running-state refresh: issue_id=#{issue_id} issue_identifier=#{identifier}; stopping active agent")

      _ ->
        Logger.info("Issue no longer visible during running-state refresh: issue_id=#{issue_id}; stopping active agent")
    end
  end

  defp log_missing_running_issue(_state, _issue_id), do: :ok

  defp refresh_running_issue_state(%State{} = state, %Issue{} = issue) do
    case Map.get(state.running, issue.id) do
      %{issue: _} = running_entry ->
        %{state | running: Map.put(state.running, issue.id, %{running_entry | issue: issue})}

      _ ->
        state
    end
  end

  defp terminate_running_issue(%State{} = state, issue_id, cleanup_workspace, outcome \\ nil) do
    case Map.get(state.running, issue_id) do
      nil ->
        release_issue_claim(state, issue_id)

      %{pid: pid, ref: ref, identifier: identifier} = running_entry ->
        state = record_session_completion_totals(state, running_entry)
        worker_host = Map.get(running_entry, :worker_host)

        if is_binary(outcome) do
          ForensicsRecorder.finalize_run(Map.get(running_entry, :run_id), %{
            status: outcome,
            outcome: outcome,
            worker_host: worker_host,
            workspace_path: Map.get(running_entry, :workspace_path)
          })
        end

        if cleanup_workspace do
          cleanup_issue_workspace(identifier, worker_host)
        end

        if is_pid(pid) do
          terminate_task(pid)
        end

        if is_reference(ref) do
          Process.demonitor(ref, [:flush])
        end

        %{
          state
          | running: Map.delete(state.running, issue_id),
            claimed: MapSet.delete(state.claimed, issue_id),
            retry_attempts: Map.delete(state.retry_attempts, issue_id)
        }

      _ ->
        release_issue_claim(state, issue_id)
    end
  end

  defp reconcile_stalled_running_issues(%State{} = state) do
    timeout_ms = Config.settings!().codex.stall_timeout_ms

    cond do
      timeout_ms <= 0 ->
        state

      map_size(state.running) == 0 ->
        state

      true ->
        now = DateTime.utc_now()

        Enum.reduce(state.running, state, fn {issue_id, running_entry}, state_acc ->
          restart_stalled_issue(state_acc, issue_id, running_entry, now, timeout_ms)
        end)
    end
  end

  defp restart_stalled_issue(state, issue_id, running_entry, now, timeout_ms) do
    elapsed_ms = stall_elapsed_ms(running_entry, now)

    if is_integer(elapsed_ms) and elapsed_ms > timeout_ms do
      identifier = Map.get(running_entry, :identifier, issue_id)
      session_id = running_entry_session_id(running_entry)

      Logger.warning("Issue stalled: issue_id=#{issue_id} issue_identifier=#{identifier} session_id=#{session_id} elapsed_ms=#{elapsed_ms}; restarting with backoff")

      next_attempt = next_retry_attempt_from_running(running_entry)

      ForensicsRecorder.finalize_run(Map.get(running_entry, :run_id), %{
        status: "stalled",
        outcome: "stalled",
        worker_host: Map.get(running_entry, :worker_host),
        workspace_path: Map.get(running_entry, :workspace_path),
        error_class: "stalled",
        error_message: "stalled for #{elapsed_ms}ms without codex activity"
      })

      state
      |> terminate_running_issue(issue_id, false)
      |> schedule_issue_retry(issue_id, next_attempt, %{
        identifier: identifier,
        error: "stalled for #{elapsed_ms}ms without codex activity"
      })
    else
      state
    end
  end

  defp stall_elapsed_ms(running_entry, now) do
    running_entry
    |> last_activity_timestamp()
    |> case do
      %DateTime{} = timestamp ->
        max(0, DateTime.diff(now, timestamp, :millisecond))

      _ ->
        nil
    end
  end

  defp last_activity_timestamp(running_entry) when is_map(running_entry) do
    Map.get(running_entry, :last_codex_timestamp) || Map.get(running_entry, :started_at)
  end

  defp last_activity_timestamp(_running_entry), do: nil

  defp terminate_task(pid) when is_pid(pid) do
    case Task.Supervisor.terminate_child(SymphonyElixir.TaskSupervisor, pid) do
      :ok ->
        :ok

      {:error, :not_found} ->
        Process.exit(pid, :shutdown)
    end
  end

  defp terminate_task(_pid), do: :ok

  defp choose_issues(issues, state) do
    dispatchable_states = dispatchable_state_set()
    terminal_states = terminal_state_set()

    issues
    |> sort_issues_for_dispatch()
    |> Enum.reduce(state, fn issue, state_acc ->
      if should_dispatch_issue?(issue, state_acc, dispatchable_states, terminal_states) do
        dispatch_issue(state_acc, issue)
      else
        state_acc
      end
    end)
  end

  defp sort_issues_for_dispatch(issues) when is_list(issues) do
    Enum.sort_by(issues, fn
      %Issue{} = issue ->
        {priority_rank(issue.priority), issue_created_at_sort_key(issue), issue.identifier || issue.id || ""}

      _ ->
        {priority_rank(nil), issue_created_at_sort_key(nil), ""}
    end)
  end

  defp priority_rank(priority) when is_integer(priority) and priority in 1..4, do: priority
  defp priority_rank(_priority), do: 5

  defp issue_created_at_sort_key(%Issue{created_at: %DateTime{} = created_at}) do
    DateTime.to_unix(created_at, :microsecond)
  end

  defp issue_created_at_sort_key(%Issue{}), do: 9_223_372_036_854_775_807
  defp issue_created_at_sort_key(_issue), do: 9_223_372_036_854_775_807

  defp should_dispatch_issue?(
         %Issue{} = issue,
         %State{running: running, claimed: claimed} = state,
         active_states,
         terminal_states
       ) do
    candidate_issue?(issue, active_states, terminal_states) and
      !todo_issue_blocked_by_non_terminal?(issue, terminal_states) and
      !MapSet.member?(claimed, issue.id) and
      !Map.has_key?(running, issue.id) and
      available_slots(state) > 0 and
      state_slots_available?(issue, running) and
      worker_slots_available?(state)
  end

  defp should_dispatch_issue?(_issue, _state, _active_states, _terminal_states), do: false

  defp state_slots_available?(%Issue{state: issue_state}, running) when is_map(running) do
    limit = Config.max_concurrent_agents_for_state(issue_state)
    used = running_issue_count_for_state(running, issue_state)
    limit > used
  end

  defp state_slots_available?(_issue, _running), do: false

  defp running_issue_count_for_state(running, issue_state) when is_map(running) do
    normalized_state = normalize_issue_state(issue_state)

    Enum.count(running, fn
      {_id, %{issue: %Issue{state: state_name}}} ->
        normalize_issue_state(state_name) == normalized_state

      _ ->
        false
    end)
  end

  defp candidate_issue?(
         %Issue{
           id: id,
           identifier: identifier,
           title: title,
           state: state_name
         } = issue,
         active_states,
         terminal_states
       )
       when is_binary(id) and is_binary(identifier) and is_binary(title) and is_binary(state_name) do
    not Issue.workflow_disabled?(issue) and
      issue_routable_to_worker?(issue) and
      active_issue_state?(state_name, active_states) and
      !terminal_issue_state?(state_name, terminal_states)
  end

  defp candidate_issue?(_issue, _active_states, _terminal_states), do: false

  defp issue_routable_to_worker?(%Issue{assigned_to_worker: assigned_to_worker})
       when is_boolean(assigned_to_worker),
       do: assigned_to_worker

  defp issue_routable_to_worker?(_issue), do: true

  defp todo_issue_blocked_by_non_terminal?(
         %Issue{state: issue_state, blocked_by: blockers},
         terminal_states
       )
       when is_binary(issue_state) and is_list(blockers) do
    normalize_issue_state(issue_state) == "todo" and
      Enum.any?(blockers, fn
        %{state: blocker_state} when is_binary(blocker_state) ->
          !terminal_issue_state?(blocker_state, terminal_states)

        _ ->
          true
      end)
  end

  defp todo_issue_blocked_by_non_terminal?(_issue, _terminal_states), do: false

  defp terminal_issue_state?(state_name, terminal_states) when is_binary(state_name) do
    MapSet.member?(terminal_states, normalize_issue_state(state_name))
  end

  defp terminal_issue_state?(_state_name, _terminal_states), do: false

  defp active_issue_state?(state_name, active_states) when is_binary(state_name) do
    MapSet.member?(active_states, normalize_issue_state(state_name))
  end

  defp normalize_issue_state(state_name) when is_binary(state_name) do
    String.downcase(String.trim(state_name))
  end

  defp terminal_state_set do
    Config.settings!().tracker.terminal_states
    |> Enum.map(&normalize_issue_state/1)
    |> Enum.filter(&(&1 != ""))
    |> MapSet.new()
  end

  defp dispatchable_state_set do
    Config.settings!().tracker.dispatchable_states
    |> Enum.map(&normalize_issue_state/1)
    |> Enum.filter(&(&1 != ""))
    |> MapSet.new()
  end

  defp dispatch_issue(%State{} = state, issue, attempt \\ nil, preferred_worker_host \\ nil) do
    case revalidate_issue_for_dispatch(issue, &Tracker.fetch_issue_states_by_ids/1, terminal_state_set()) do
      {:ok, %Issue{} = refreshed_issue} ->
        do_dispatch_issue(state, refreshed_issue, attempt, preferred_worker_host)

      {:skip, :missing} ->
        Logger.info("Skipping dispatch; issue no longer active or visible: #{issue_context(issue)}")
        state

      {:skip, %Issue{} = refreshed_issue} ->
        Logger.info("Skipping stale dispatch after issue refresh: #{issue_context(refreshed_issue)} state=#{inspect(refreshed_issue.state)} blocked_by=#{length(refreshed_issue.blocked_by)}")

        state

      {:error, reason} ->
        Logger.warning("Skipping dispatch; issue refresh failed for #{issue_context(issue)}: #{inspect(reason)}")
        state
    end
  end

  defp do_dispatch_issue(%State{} = state, issue, attempt, preferred_worker_host) do
    case prepare_issue_for_dispatch(issue) do
      {:ok, prepared_issue} ->
        recipient = self()

        case select_worker_host(state, preferred_worker_host) do
          :no_worker_capacity ->
            Logger.debug("No SSH worker slots available for #{issue_context(prepared_issue)} preferred_worker_host=#{inspect(preferred_worker_host)}")
            state

          worker_host ->
            spawn_issue_on_worker_host(state, prepared_issue, attempt, recipient, worker_host)
        end

      {:error, reason} ->
        Logger.warning("Skipping dispatch; failed to prepare issue for dispatch #{issue_context(issue)}: #{inspect(reason)}")
        state
    end
  end

  defp prepare_issue_for_dispatch(%Issue{} = issue) do
    case dispatch_transition_target(issue) do
      nil ->
        {:ok, issue}

      target_state ->
        case Tracker.update_issue_state(issue.id, target_state) do
          :ok ->
            maybe_create_dispatch_status_comment(issue, target_state)
            Logger.info("Moved issue to claimed state before dispatch: #{issue_context(issue)} from_state=#{issue.state} to_state=#{target_state}")
            {:ok, %{issue | state: target_state}}

          {:error, reason} ->
            {:error, {:issue_state_transition_failed, target_state, reason}}
        end
    end
  end

  defp dispatch_transition_target(%Issue{id: issue_id, state: issue_state})
       when is_binary(issue_id) and is_binary(issue_state) do
    tracker = Config.settings!().tracker
    target_state = normalize_transition_state(tracker.claim_transition_to_state)

    cond do
      is_nil(target_state) ->
        nil

      normalize_issue_state(issue_state) == normalize_issue_state(target_state) ->
        nil

      normalize_issue_state(issue_state) in claim_transition_source_states(tracker.claim_transition_from_states) ->
        target_state

      true ->
        nil
    end
  end

  defp dispatch_transition_target(_issue), do: nil

  defp claim_transition_source_states(source_states) when is_list(source_states) do
    source_states
    |> Enum.map(&normalize_transition_source_state/1)
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp claim_transition_source_states(_source_states), do: []

  defp normalize_transition_state(state_name) when is_binary(state_name) do
    trimmed = String.trim(state_name)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_transition_state(_state_name), do: nil

  defp normalize_transition_source_state(state_name) do
    case normalize_transition_state(state_name) do
      nil -> nil
      trimmed -> normalize_issue_state(trimmed)
    end
  end

  defp maybe_create_dispatch_status_comment(
         %Issue{id: issue_id} = issue,
         target_state
       )
       when is_binary(issue_id) and is_binary(target_state) do
    comment_body = dispatch_status_comment_body(issue, target_state)

    case Tracker.create_comment(issue_id, comment_body) do
      :ok ->
        Logger.info("Posted dispatch status comment for #{issue_context(issue)} target_state=#{target_state}")
        :ok

      {:error, reason} ->
        Logger.warning("Failed to create dispatch status comment for #{issue_context(issue)}: #{inspect(reason)}")
        :ok
    end
  end

  defp maybe_create_dispatch_status_comment(_issue, _target_state), do: :ok

  defp dispatch_status_comment_body(%Issue{} = issue, target_state) do
    source_state = issue.state || "unknown"
    branch_name = "symphony/#{issue.identifier || issue.id || "issue"}"

    [
      "Symphony status update.",
      "",
      "State: `#{target_state}`",
      "What changed: picked up the ticket and moved it from `#{source_state}` to `#{target_state}`.",
      "Branch: `#{branch_name}`",
      "Next update: Symphony will leave another status note when it hits a blocker, opens the first PR, or hands the ticket off for review."
    ]
    |> Enum.join("\n")
  end

  defp spawn_issue_on_worker_host(%State{} = state, issue, attempt, recipient, worker_host) do
    run_id = ForensicsRecorder.start_run(issue, attempt: attempt, worker_host: worker_host)

    case Task.Supervisor.start_child(SymphonyElixir.TaskSupervisor, fn ->
           AgentRunner.run(issue, recipient, attempt: attempt, worker_host: worker_host, run_id: run_id)
         end) do
      {:ok, pid} ->
        ref = Process.monitor(pid)

        Logger.info("Dispatching issue to agent: #{issue_context(issue)} pid=#{inspect(pid)} attempt=#{inspect(attempt)} worker_host=#{worker_host || "local"}")

        running =
          Map.put(state.running, issue.id, %{
            pid: pid,
            ref: ref,
            identifier: issue.identifier,
            issue: issue,
            run_id: run_id,
            worker_host: worker_host,
            workspace_path: nil,
            session_id: nil,
            last_codex_message: nil,
            last_codex_timestamp: nil,
            last_codex_event: nil,
            last_rate_limits: nil,
            codex_app_server_pid: nil,
            codex_input_tokens: 0,
            codex_output_tokens: 0,
            codex_total_tokens: 0,
            codex_last_reported_input_tokens: 0,
            codex_last_reported_output_tokens: 0,
            codex_last_reported_total_tokens: 0,
            turn_count: 0,
            retry_attempt: normalize_retry_attempt(attempt),
            started_at: DateTime.utc_now()
          })

        %{
          state
          | running: running,
            claimed: MapSet.put(state.claimed, issue.id),
            retry_attempts: Map.delete(state.retry_attempts, issue.id)
        }

      {:error, reason} ->
        Logger.error("Unable to spawn agent for #{issue_context(issue)}: #{inspect(reason)}")

        ForensicsRecorder.finalize_run(run_id, %{
          status: "failed_to_spawn",
          outcome: "failed_to_spawn",
          error_class: "failed_to_spawn",
          error_message: inspect(reason)
        })

        next_attempt = if is_integer(attempt), do: attempt + 1, else: nil

        schedule_issue_retry(state, issue.id, next_attempt, %{
          identifier: issue.identifier,
          error: "failed to spawn agent: #{inspect(reason)}",
          worker_host: worker_host
        })
    end
  end

  defp revalidate_issue_for_dispatch(%Issue{id: issue_id}, issue_fetcher, terminal_states)
       when is_binary(issue_id) and is_function(issue_fetcher, 1) do
    case issue_fetcher.([issue_id]) do
      {:ok, [%Issue{} = refreshed_issue | _]} ->
        if retry_candidate_issue?(refreshed_issue, terminal_states) do
          {:ok, refreshed_issue}
        else
          {:skip, refreshed_issue}
        end

      {:ok, []} ->
        {:skip, :missing}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp revalidate_issue_for_dispatch(issue, _issue_fetcher, _terminal_states), do: {:ok, issue}

  defp complete_issue(%State{} = state, issue_id) do
    %{
      state
      | completed: MapSet.put(state.completed, issue_id),
        retry_attempts: Map.delete(state.retry_attempts, issue_id)
    }
  end

  defp schedule_issue_retry(%State{} = state, issue_id, attempt, metadata)
       when is_binary(issue_id) and is_map(metadata) do
    previous_retry = Map.get(state.retry_attempts, issue_id, %{attempt: 0})
    next_attempt = if is_integer(attempt), do: attempt, else: previous_retry.attempt + 1
    delay_ms = retry_delay(next_attempt, metadata)
    old_timer = Map.get(previous_retry, :timer_ref)
    retry_token = make_ref()
    due_at_ms = System.monotonic_time(:millisecond) + delay_ms
    identifier = pick_retry_identifier(issue_id, previous_retry, metadata)
    error = pick_retry_error(previous_retry, metadata)
    worker_host = pick_retry_worker_host(previous_retry, metadata)
    workspace_path = pick_retry_workspace_path(previous_retry, metadata)

    if is_reference(old_timer) do
      Process.cancel_timer(old_timer)
    end

    timer_ref = Process.send_after(self(), {:retry_issue, issue_id, retry_token}, delay_ms)

    error_suffix = if is_binary(error), do: " error=#{error}", else: ""

    Logger.warning("Retrying issue_id=#{issue_id} issue_identifier=#{identifier} in #{delay_ms}ms (attempt #{next_attempt})#{error_suffix}")

    %{
      state
      | retry_attempts:
          Map.put(state.retry_attempts, issue_id, %{
            attempt: next_attempt,
            timer_ref: timer_ref,
            retry_token: retry_token,
            due_at_ms: due_at_ms,
            identifier: identifier,
            error: error,
            worker_host: worker_host,
            workspace_path: workspace_path
          })
    }
  end

  defp pop_retry_attempt_state(%State{} = state, issue_id, retry_token) when is_reference(retry_token) do
    case Map.get(state.retry_attempts, issue_id) do
      %{attempt: attempt, retry_token: ^retry_token} = retry_entry ->
        metadata = %{
          identifier: Map.get(retry_entry, :identifier),
          error: Map.get(retry_entry, :error),
          worker_host: Map.get(retry_entry, :worker_host),
          workspace_path: Map.get(retry_entry, :workspace_path)
        }

        {:ok, attempt, metadata, %{state | retry_attempts: Map.delete(state.retry_attempts, issue_id)}}

      _ ->
        :missing
    end
  end

  defp handle_retry_issue(%State{} = state, issue_id, attempt, metadata) do
    case Tracker.fetch_candidate_issues() do
      {:ok, issues} ->
        issues
        |> find_issue_by_id(issue_id)
        |> handle_retry_issue_lookup(state, issue_id, attempt, metadata)

      {:error, reason} ->
        Logger.warning("Retry poll failed for issue_id=#{issue_id} issue_identifier=#{metadata[:identifier] || issue_id}: #{inspect(reason)}")

        {:noreply,
         schedule_issue_retry(
           state,
           issue_id,
           attempt + 1,
           Map.merge(metadata, %{error: "retry poll failed: #{inspect(reason)}"})
         )}
    end
  end

  defp handle_retry_issue_lookup(%Issue{} = issue, state, issue_id, attempt, metadata) do
    terminal_states = terminal_state_set()

    cond do
      terminal_issue_state?(issue.state, terminal_states) ->
        Logger.info("Issue state is terminal: issue_id=#{issue_id} issue_identifier=#{issue.identifier} state=#{issue.state}; removing associated workspace")

        cleanup_issue_workspace(issue.identifier, metadata[:worker_host])
        {:noreply, release_issue_claim(state, issue_id)}

      retry_candidate_issue?(issue, terminal_states) ->
        handle_active_retry(state, issue, attempt, metadata)

      true ->
        Logger.debug("Issue left active states, removing claim issue_id=#{issue_id} issue_identifier=#{issue.identifier}")

        {:noreply, release_issue_claim(state, issue_id)}
    end
  end

  defp handle_retry_issue_lookup(nil, state, issue_id, _attempt, _metadata) do
    Logger.debug("Issue no longer visible, removing claim issue_id=#{issue_id}")
    {:noreply, release_issue_claim(state, issue_id)}
  end

  defp cleanup_issue_workspace(identifier, worker_host \\ nil)

  defp cleanup_issue_workspace(identifier, worker_host) when is_binary(identifier) do
    Workspace.remove_issue_workspaces(identifier, worker_host)
  end

  defp cleanup_issue_workspace(_identifier, _worker_host), do: :ok

  defp reconcile_parked_claimed_issues(%State{} = state) do
    issue_ids = parked_claimed_issue_ids(state)

    if issue_ids == [] do
      state
    else
      case Tracker.fetch_issue_states_by_ids(issue_ids) do
        {:ok, issues} ->
          reconcile_parked_claimed_issue_states(
            state,
            issues,
            issue_ids,
            dispatchable_state_set(),
            terminal_state_set()
          )

        {:error, reason} ->
          Logger.debug("Failed to refresh parked issue claims: #{inspect(reason)}; preserving parked claims")
          state
      end
    end
  end

  defp parked_claimed_issue_ids(%State{} = state) do
    running_ids =
      state.running
      |> Map.keys()
      |> MapSet.new()

    retrying_ids =
      state.retry_attempts
      |> Map.keys()
      |> MapSet.new()

    state.claimed
    |> MapSet.difference(running_ids)
    |> MapSet.difference(retrying_ids)
    |> MapSet.to_list()
  end

  defp reconcile_parked_claimed_issue_states(
         %State{} = state,
         issues,
         requested_issue_ids,
         active_states,
         terminal_states
       )
       when is_list(issues) and is_list(requested_issue_ids) do
    visible_issue_ids =
      issues
      |> Enum.flat_map(fn
        %Issue{id: issue_id} when is_binary(issue_id) -> [issue_id]
        _ -> []
      end)
      |> MapSet.new()

    state =
      Enum.reduce(issues, state, fn
        %Issue{} = issue, state_acc ->
          reconcile_parked_claimed_issue(state_acc, issue, active_states, terminal_states)

        _issue, state_acc ->
          state_acc
      end)

    Enum.reduce(requested_issue_ids, state, fn issue_id, state_acc ->
      if MapSet.member?(visible_issue_ids, issue_id) do
        state_acc
      else
        Logger.info("Issue no longer visible during parked-claim refresh: issue_id=#{issue_id}; releasing parked claim")
        release_issue_claim(state_acc, issue_id)
      end
    end)
  end

  defp reconcile_parked_claimed_issue_states(
         state,
         _issues,
         _requested_issue_ids,
         _active_states,
         _terminal_states
       ),
       do: state

  defp reconcile_parked_claimed_issue(%State{} = state, %Issue{} = issue, active_states, terminal_states) do
    cond do
      terminal_issue_state?(issue.state, terminal_states) ->
        Logger.info("Issue reached terminal state while parked after startup failure: #{issue_context(issue)} state=#{issue.state}; releasing parked claim")
        release_issue_claim(state, issue.id)

      !issue_routable_to_worker?(issue) ->
        Logger.info("Issue is no longer routed to this worker while parked: #{issue_context(issue)}; releasing parked claim")
        release_issue_claim(state, issue.id)

      active_issue_state?(issue.state, active_states) ->
        state

      true ->
        Logger.info("Issue left active states while parked after startup failure: #{issue_context(issue)} state=#{issue.state}; releasing parked claim")
        release_issue_claim(state, issue.id)
    end
  end

  defp reconcile_parked_claimed_issue(state, _issue, _active_states, _terminal_states), do: state

  defp run_terminal_workspace_cleanup do
    case Tracker.fetch_issues_by_states(Config.settings!().tracker.terminal_states) do
      {:ok, issues} ->
        issues
        |> Enum.each(fn
          %Issue{identifier: identifier} when is_binary(identifier) ->
            cleanup_issue_workspace(identifier)

          _ ->
            :ok
        end)

      {:error, reason} ->
        Logger.warning("Skipping startup terminal workspace cleanup; failed to fetch terminal issues: #{inspect(reason)}")
    end
  end

  defp notify_dashboard do
    StatusDashboard.notify_update()
  end

  defp handle_active_retry(state, issue, attempt, metadata) do
    if retry_candidate_issue?(issue, terminal_state_set()) and
         dispatch_slots_available?(issue, state) and
         worker_slots_available?(state, metadata[:worker_host]) do
      {:noreply, dispatch_issue(state, issue, attempt, metadata[:worker_host])}
    else
      Logger.debug("No available slots for retrying #{issue_context(issue)}; retrying again")

      {:noreply,
       schedule_issue_retry(
         state,
         issue.id,
         attempt + 1,
         Map.merge(metadata, %{
           identifier: issue.identifier,
           error: "no available orchestrator slots"
         })
       )}
    end
  end

  defp release_issue_claim(%State{} = state, issue_id) do
    %{
      state
      | claimed: MapSet.delete(state.claimed, issue_id),
        failure_comment_signatures: Map.delete(state.failure_comment_signatures, issue_id)
    }
  end

  defp retry_delay(attempt, metadata) when is_integer(attempt) and attempt > 0 and is_map(metadata) do
    if metadata[:delay_type] == :continuation and attempt == 1 do
      @continuation_retry_delay_ms
    else
      failure_retry_delay(attempt)
    end
  end

  defp failure_retry_delay(attempt) do
    max_delay_power = min(attempt - 1, 10)
    min(@failure_retry_base_ms * (1 <<< max_delay_power), Config.settings!().agent.max_retry_backoff_ms)
  end

  defp normalize_retry_attempt(attempt) when is_integer(attempt) and attempt > 0, do: attempt
  defp normalize_retry_attempt(_attempt), do: 0

  defp next_retry_attempt_from_running(running_entry) do
    case Map.get(running_entry, :retry_attempt) do
      attempt when is_integer(attempt) and attempt > 0 -> attempt + 1
      _ -> nil
    end
  end

  defp pick_retry_identifier(issue_id, previous_retry, metadata) do
    metadata[:identifier] || Map.get(previous_retry, :identifier) || issue_id
  end

  defp pick_retry_error(previous_retry, metadata) do
    metadata[:error] || Map.get(previous_retry, :error)
  end

  defp pick_retry_worker_host(previous_retry, metadata) do
    metadata[:worker_host] || Map.get(previous_retry, :worker_host)
  end

  defp pick_retry_workspace_path(previous_retry, metadata) do
    metadata[:workspace_path] || Map.get(previous_retry, :workspace_path)
  end

  defp maybe_create_failure_comment(
         %State{} = state,
         %{issue: %Issue{id: issue_id} = issue},
         reason,
         opts
       )
       when is_binary(issue_id) and not is_nil(reason) and is_list(opts) do
    comment_body = failure_comment_body(reason, opts)
    comment_signature = failure_comment_signature(comment_body)

    if Map.get(state.failure_comment_signatures, issue_id) == comment_signature do
      state
    else
      case Tracker.create_comment(issue_id, comment_body) do
        :ok ->
          Logger.info("Posted failure comment for #{issue_context(issue)}")

          %{
            state
            | failure_comment_signatures: Map.put(state.failure_comment_signatures, issue_id, comment_signature)
          }

        {:error, comment_reason} ->
          Logger.warning("Failed to create failure comment for #{issue_context(issue)}: #{inspect(comment_reason)}")

          state
      end
    end
  end

  defp maybe_create_failure_comment(state, _running_entry, _reason, _opts), do: state

  defp failure_comment_signature(comment_body) when is_binary(comment_body) do
    :sha256
    |> :crypto.hash(comment_body)
    |> Base.encode16(case: :lower)
  end

  defp failure_comment_body(reason, opts) do
    details = failure_comment_details(reason, opts)
    follow_up_lines = failure_comment_follow_up_lines(reason, opts)

    [
      failure_comment_title(reason),
      "",
      "Summary: #{failure_comment_summary(reason)}",
      failure_comment_detail_block(details),
      "",
      follow_up_lines
    ]
    |> List.flatten()
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join("\n")
  end

  defp failure_comment_title(reason) do
    cond do
      startup_failure_reason?(reason) -> "Symphony agent startup failed."
      match?({:max_turns_reached, _}, reason) -> "Symphony agent paused after reaching max turns."
      rate_limit_reason?(reason) -> "Symphony agent paused after hitting a Codex rate limit."
      true -> "Symphony agent run failed."
    end
  end

  defp journal_run_attrs_for_normal_completion(running_entry) do
    runtime_attrs = %{
      worker_host: Map.get(running_entry, :worker_host),
      workspace_path: Map.get(running_entry, :workspace_path)
    }

    case Map.get(running_entry, :completion_reason) do
      {:max_turns_reached, max_turns} ->
        Map.merge(runtime_attrs, %{
          status: "paused",
          outcome: "paused_max_turns",
          error_class: "max_turns_reached",
          error_message: "Reached the configured #{max_turns}-turn limit while the issue remained active."
        })

      _ ->
        Map.merge(runtime_attrs, %{
          status: "completed",
          outcome: "completed_turn_batch"
        })
    end
  end

  defp journal_run_attrs_for_failure(running_entry, reason) do
    runtime_attrs = %{
      worker_host: Map.get(running_entry, :worker_host),
      workspace_path: Map.get(running_entry, :workspace_path)
    }

    cond do
      startup_failure_reason?(reason) ->
        Map.merge(runtime_attrs, %{
          status: "startup_failed",
          outcome: "startup_failed",
          error_class: run_reason_class(reason),
          error_message: failure_comment_summary(reason)
        })

      rate_limit_reason?(reason) ->
        Map.merge(runtime_attrs, %{
          status: "rate_limited",
          outcome: "rate_limited",
          error_class: run_reason_class(reason),
          error_message: failure_comment_summary(reason)
        })

      true ->
        Map.merge(runtime_attrs, %{
          status: "failed",
          outcome: "failed",
          error_class: run_reason_class(reason),
          error_message: failure_comment_summary(reason)
        })
    end
  end

  defp run_reason_class(reason) when is_tuple(reason) and tuple_size(reason) > 0 do
    reason
    |> elem(0)
    |> run_reason_class()
  end

  defp run_reason_class({class, _rest}) when is_atom(class), do: Atom.to_string(class)
  defp run_reason_class(class) when is_atom(class), do: Atom.to_string(class)
  defp run_reason_class(class) when is_binary(class), do: class
  defp run_reason_class(_class), do: "unknown"

  defp startup_failure_reason?({:workspace_hook_failed, _, _, _}), do: true
  defp startup_failure_reason?({:workspace_hook_timeout, _, _}), do: true
  defp startup_failure_reason?({:workspace_prepare_failed, _, _, _}), do: true
  defp startup_failure_reason?({:workspace_prepare_failed, :invalid_output, _}), do: true
  defp startup_failure_reason?({:issue_state_transition_failed, _, _}), do: true
  defp startup_failure_reason?(_reason), do: false

  defp failure_comment_summary({:workspace_hook_failed, hook_name, status, _output})
       when is_binary(hook_name) and is_integer(status) do
    "workspace hook `#{hook_name}` exited with status #{status}."
  end

  defp failure_comment_summary({:workspace_hook_timeout, hook_name, timeout_ms})
       when is_binary(hook_name) and is_integer(timeout_ms) do
    "workspace hook `#{hook_name}` timed out after #{timeout_ms}ms."
  end

  defp failure_comment_summary({:workspace_prepare_failed, worker_host, status, _output})
       when is_binary(worker_host) and is_integer(status) do
    "workspace preparation failed on worker `#{worker_host}` with status #{status}."
  end

  defp failure_comment_summary({:workspace_prepare_failed, :invalid_output, _output}) do
    "workspace preparation failed because the helper returned invalid output."
  end

  defp failure_comment_summary({:issue_state_transition_failed, target_state, _reason})
       when is_binary(target_state) do
    "failed to move the issue into `#{target_state}` before dispatch."
  end

  defp failure_comment_summary({:max_turns_reached, max_turns}) when is_integer(max_turns) do
    "reached the configured #{max_turns}-turn limit while the issue remained active."
  end

  defp failure_comment_summary({exception, _stacktrace}) when is_exception(exception) do
    Exception.message(exception)
  end

  defp failure_comment_summary(reason) when is_tuple(reason) or is_map(reason) or is_list(reason) do
    if rate_limit_reason?(reason) do
      "Codex hit a rate limit and ended the current run."
    else
      failure_comment_summary_fallback(reason)
    end
  end

  defp failure_comment_summary(reason), do: failure_comment_summary_fallback(reason)

  defp failure_comment_summary_fallback({exception, _stacktrace}) when is_exception(exception) do
    Exception.message(exception)
  end

  defp failure_comment_summary_fallback(reason), do: inspect(reason)

  defp failure_comment_details(reason, opts) do
    primary_details = failure_comment_reason_details(reason)
    transition_details = startup_failure_transition_detail(Keyword.get(opts, :startup_failure_transition))
    rate_limit_details = rate_limit_detail(reason, Keyword.get(opts, :rate_limits))

    [primary_details, transition_details, rate_limit_details]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join("\n\n")
    |> truncate_failure_detail()
  end

  defp failure_comment_reason_details({:workspace_hook_failed, _hook_name, _status, output}) do
    output_excerpt(output)
  end

  defp failure_comment_reason_details({:workspace_prepare_failed, _worker_host, _status, output}) do
    output_excerpt(output)
  end

  defp failure_comment_reason_details({:workspace_prepare_failed, :invalid_output, output}) do
    output_excerpt(output)
  end

  defp failure_comment_reason_details({:issue_state_transition_failed, _target_state, reason}) do
    inspected_reason =
      inspect(reason, pretty: true, limit: 20, printable_limit: @failure_comment_excerpt_max_bytes)

    truncate_failure_detail(inspected_reason)
  end

  defp failure_comment_reason_details({exception, stacktrace}) when is_exception(exception) and is_list(stacktrace) do
    Exception.format(:error, exception, stacktrace)
    |> truncate_failure_detail()
  end

  defp failure_comment_reason_details(reason) when is_tuple(reason) or is_map(reason) or is_list(reason) do
    inspected_reason =
      inspect(reason, pretty: true, limit: 20, printable_limit: @failure_comment_excerpt_max_bytes)

    truncate_failure_detail(inspected_reason)
  end

  defp failure_comment_reason_details(_reason), do: nil

  defp failure_comment_detail_block(nil), do: nil

  defp failure_comment_detail_block(details) when is_binary(details) do
    ["Details:", "```text", details, "```"]
  end

  defp output_excerpt(output) do
    output
    |> IO.iodata_to_binary()
    |> String.split(~r/\r?\n/, trim: true)
    |> Enum.take(-@failure_comment_excerpt_lines)
    |> Enum.join("\n")
    |> truncate_failure_detail()
  end

  defp truncate_failure_detail(""), do: nil

  defp truncate_failure_detail(details) when is_binary(details) do
    if byte_size(details) > @failure_comment_excerpt_max_bytes do
      binary_part(details, 0, @failure_comment_excerpt_max_bytes) <> "... (truncated)"
    else
      details
    end
  end

  defp failure_comment_follow_up_lines(reason, opts) do
    cond do
      startup_failure_reason?(reason) ->
        startup_failure_follow_up_lines(Keyword.get(opts, :startup_failure_transition))

      match?({:max_turns_reached, _}, reason) ->
        ["Symphony will start a fresh run automatically while the issue remains in an active state."]

      rate_limit_reason?(reason) ->
        ["Symphony will retry automatically after backoff while the issue remains in an active state."]

      true ->
        ["Symphony will retry automatically while the issue remains in an active state."]
    end
  end

  defp startup_failure_follow_up_lines({:ok, target_state}) when is_binary(target_state) do
    [
      "Symphony did not retry automatically.",
      "Symphony moved the issue to `#{target_state}`. After fixing the startup problem, move it back into an active state to request another run."
    ]
  end

  defp startup_failure_follow_up_lines({:error, target_state, _reason}) when is_binary(target_state) do
    [
      "Symphony did not retry automatically.",
      "Symphony could not move the issue to `#{target_state}`, so manual state cleanup is required before the ticket is requeued."
    ]
  end

  defp startup_failure_follow_up_lines(_transition_result) do
    [
      "Symphony did not retry automatically.",
      "After fixing the startup problem, move the issue back into an active state to request another run."
    ]
  end

  defp startup_failure_transition_detail({:error, target_state, reason}) when is_binary(target_state) do
    inspected_reason =
      inspect(reason, pretty: true, limit: 20, printable_limit: @failure_comment_excerpt_max_bytes)

    truncate_failure_detail("State transition to `#{target_state}` failed:\n#{inspected_reason}")
  end

  defp startup_failure_transition_detail(_transition_result), do: nil

  defp rate_limit_reason?(reason) do
    normalized_reason =
      reason
      |> inspect(pretty: true, limit: 20, printable_limit: @failure_comment_excerpt_max_bytes)
      |> String.downcase()

    String.contains?(normalized_reason, [
      "rate limit",
      "rate_limit",
      "ratelimit",
      "too many requests",
      "rate_limit_exceeded"
    ])
  end

  defp rate_limit_detail(reason, rate_limits) do
    if (rate_limit_reason?(reason) or match?({:max_turns_reached, _}, reason)) and is_map(rate_limits) do
      "Latest rate limits: #{format_rate_limits_for_comment(rate_limits)}"
    end
  end

  defp format_rate_limits_for_comment(rate_limits) when is_map(rate_limits) do
    [
      Map.get(rate_limits, :limit_id) || Map.get(rate_limits, "limit_id") ||
        Map.get(rate_limits, :limit_name) || Map.get(rate_limits, "limit_name"),
      format_rate_limit_bucket_for_comment("primary", Map.get(rate_limits, :primary) || Map.get(rate_limits, "primary")),
      format_rate_limit_bucket_for_comment(
        "secondary",
        Map.get(rate_limits, :secondary) || Map.get(rate_limits, "secondary")
      ),
      format_rate_limit_credits_for_comment(Map.get(rate_limits, :credits) || Map.get(rate_limits, "credits"))
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" | ")
  end

  defp format_rate_limits_for_comment(_rate_limits), do: nil

  defp format_rate_limit_bucket_for_comment(_label, nil), do: nil

  defp format_rate_limit_bucket_for_comment(label, bucket) when is_map(bucket) do
    remaining = Map.get(bucket, :remaining) || Map.get(bucket, "remaining")
    limit = Map.get(bucket, :limit) || Map.get(bucket, "limit")
    reset_in_seconds = Map.get(bucket, :reset_in_seconds) || Map.get(bucket, "reset_in_seconds")

    [
      label,
      bucket_remaining_limit_text(remaining, limit),
      bucket_reset_text(reset_in_seconds)
    ]
    |> Enum.reject(&(&1 in [nil, ""]))
    |> Enum.join(" ")
  end

  defp format_rate_limit_bucket_for_comment(label, bucket), do: "#{label} #{to_string(bucket)}"

  defp bucket_remaining_limit_text(remaining, limit) when is_integer(remaining) and is_integer(limit),
    do: "#{remaining}/#{limit}"

  defp bucket_remaining_limit_text(remaining, _limit) when is_integer(remaining), do: "#{remaining} remaining"
  defp bucket_remaining_limit_text(_remaining, limit) when is_integer(limit), do: "limit #{limit}"
  defp bucket_remaining_limit_text(_remaining, _limit), do: nil

  defp bucket_reset_text(reset_in_seconds) when is_integer(reset_in_seconds),
    do: "reset #{reset_in_seconds}s"

  defp bucket_reset_text(_reset_in_seconds), do: nil

  defp format_rate_limit_credits_for_comment(nil), do: nil

  defp format_rate_limit_credits_for_comment(credits) when is_map(credits) do
    cond do
      Map.get(credits, :unlimited) == true or Map.get(credits, "unlimited") == true ->
        "credits unlimited"

      is_number(Map.get(credits, :remaining) || Map.get(credits, "remaining")) ->
        "credits #{Map.get(credits, :remaining) || Map.get(credits, "remaining")}"

      true ->
        "credits #{inspect(credits)}"
    end
  end

  defp format_rate_limit_credits_for_comment(credits), do: "credits #{to_string(credits)}"

  defp handle_startup_failure(%State{} = state, issue_id, running_entry, failure_reason) do
    transition_result = maybe_transition_startup_failure_issue(Map.get(running_entry, :issue))

    state =
      state
      |> maybe_create_failure_comment(
        running_entry,
        failure_reason,
        startup_failure_transition: transition_result
      )
      |> park_startup_failed_issue(issue_id)

    cleanup_issue_workspace(
      Map.get(running_entry, :identifier),
      Map.get(running_entry, :worker_host)
    )

    state
  end

  defp park_startup_failed_issue(%State{} = state, issue_id) when is_binary(issue_id) do
    %{state | retry_attempts: Map.delete(state.retry_attempts, issue_id)}
  end

  defp maybe_transition_startup_failure_issue(%Issue{id: issue_id} = issue)
       when is_binary(issue_id) do
    case startup_failure_transition_target() do
      nil ->
        :no_transition

      target_state ->
        case Tracker.update_issue_state(issue_id, target_state) do
          :ok ->
            Logger.info("Moved issue after startup failure: #{issue_context(issue)} target_state=#{target_state}")
            {:ok, target_state}

          {:error, reason} ->
            Logger.warning("Failed to move issue after startup failure: #{issue_context(issue)} target_state=#{target_state} reason=#{inspect(reason)}")
            {:error, target_state, reason}
        end
    end
  end

  defp maybe_transition_startup_failure_issue(_issue), do: :no_transition

  defp startup_failure_transition_target do
    Config.settings!().tracker.startup_failure_transition_to_state
    |> normalize_transition_state()
  end

  defp maybe_put_runtime_value(running_entry, _key, nil), do: running_entry

  defp maybe_put_runtime_value(running_entry, key, value) when is_map(running_entry) do
    Map.put(running_entry, key, value)
  end

  defp select_worker_host(%State{} = state, preferred_worker_host) do
    case Config.settings!().worker.ssh_hosts do
      [] ->
        nil

      hosts ->
        available_hosts = Enum.filter(hosts, &worker_host_slots_available?(state, &1))

        cond do
          available_hosts == [] ->
            :no_worker_capacity

          preferred_worker_host_available?(preferred_worker_host, available_hosts) ->
            preferred_worker_host

          true ->
            least_loaded_worker_host(state, available_hosts)
        end
    end
  end

  defp preferred_worker_host_available?(preferred_worker_host, hosts)
       when is_binary(preferred_worker_host) and is_list(hosts) do
    preferred_worker_host != "" and preferred_worker_host in hosts
  end

  defp preferred_worker_host_available?(_preferred_worker_host, _hosts), do: false

  defp least_loaded_worker_host(%State{} = state, hosts) when is_list(hosts) do
    hosts
    |> Enum.with_index()
    |> Enum.min_by(fn {host, index} ->
      {running_worker_host_count(state.running, host), index}
    end)
    |> elem(0)
  end

  defp running_worker_host_count(running, worker_host) when is_map(running) and is_binary(worker_host) do
    Enum.count(running, fn
      {_issue_id, %{worker_host: ^worker_host}} -> true
      _ -> false
    end)
  end

  defp worker_slots_available?(%State{} = state) do
    select_worker_host(state, nil) != :no_worker_capacity
  end

  defp worker_slots_available?(%State{} = state, preferred_worker_host) do
    select_worker_host(state, preferred_worker_host) != :no_worker_capacity
  end

  defp worker_host_slots_available?(%State{} = state, worker_host) when is_binary(worker_host) do
    case Config.settings!().worker.max_concurrent_agents_per_host do
      limit when is_integer(limit) and limit > 0 ->
        running_worker_host_count(state.running, worker_host) < limit

      _ ->
        true
    end
  end

  defp find_issue_by_id(issues, issue_id) when is_binary(issue_id) do
    Enum.find(issues, fn
      %Issue{id: ^issue_id} ->
        true

      _ ->
        false
    end)
  end

  defp find_issue_id_for_ref(running, ref) do
    running
    |> Enum.find_value(fn {issue_id, %{ref: running_ref}} ->
      if running_ref == ref, do: issue_id
    end)
  end

  defp running_entry_session_id(%{session_id: session_id}) when is_binary(session_id),
    do: session_id

  defp running_entry_session_id(_running_entry), do: "n/a"

  defp issue_context(%Issue{id: issue_id, identifier: identifier}) do
    "issue_id=#{issue_id} issue_identifier=#{identifier}"
  end

  defp available_slots(%State{} = state) do
    max(
      (state.max_concurrent_agents || Config.settings!().agent.max_concurrent_agents) -
        map_size(state.running),
      0
    )
  end

  @spec request_refresh() :: map() | :unavailable
  def request_refresh do
    request_refresh(__MODULE__)
  end

  @spec request_refresh(GenServer.server()) :: map() | :unavailable
  def request_refresh(server) do
    if Process.whereis(server) do
      GenServer.call(server, :request_refresh)
    else
      :unavailable
    end
  end

  @spec snapshot() :: map() | :timeout | :unavailable
  def snapshot, do: snapshot(__MODULE__, 15_000)

  @spec snapshot(GenServer.server(), timeout()) :: map() | :timeout | :unavailable
  def snapshot(server, timeout) do
    if Process.whereis(server) do
      try do
        GenServer.call(server, :snapshot, timeout)
      catch
        :exit, {:timeout, _} -> :timeout
        :exit, _ -> :unavailable
      end
    else
      :unavailable
    end
  end

  @impl true
  def handle_call(:snapshot, _from, state) do
    state = refresh_runtime_config(state)
    now = DateTime.utc_now()
    now_ms = System.monotonic_time(:millisecond)

    running =
      state.running
      |> Enum.map(fn {issue_id, metadata} ->
        %{
          issue_id: issue_id,
          identifier: metadata.identifier,
          state: metadata.issue.state,
          worker_host: Map.get(metadata, :worker_host),
          workspace_path: Map.get(metadata, :workspace_path),
          session_id: metadata.session_id,
          codex_app_server_pid: metadata.codex_app_server_pid,
          codex_input_tokens: metadata.codex_input_tokens,
          codex_output_tokens: metadata.codex_output_tokens,
          codex_total_tokens: metadata.codex_total_tokens,
          turn_count: Map.get(metadata, :turn_count, 0),
          started_at: metadata.started_at,
          last_codex_timestamp: metadata.last_codex_timestamp,
          last_codex_message: metadata.last_codex_message,
          last_codex_event: metadata.last_codex_event,
          runtime_seconds: running_seconds(metadata.started_at, now)
        }
      end)

    retrying =
      state.retry_attempts
      |> Enum.map(fn {issue_id, %{attempt: attempt, due_at_ms: due_at_ms} = retry} ->
        %{
          issue_id: issue_id,
          attempt: attempt,
          due_in_ms: max(0, due_at_ms - now_ms),
          identifier: Map.get(retry, :identifier),
          error: Map.get(retry, :error),
          worker_host: Map.get(retry, :worker_host),
          workspace_path: Map.get(retry, :workspace_path)
        }
      end)

    {:reply,
     %{
       running: running,
       retrying: retrying,
       codex_totals: state.codex_totals,
       rate_limits: Map.get(state, :codex_rate_limits),
       polling: %{
         checking?: state.poll_check_in_progress == true,
         next_poll_in_ms: next_poll_in_ms(state.next_poll_due_at_ms, now_ms),
         poll_interval_ms: state.poll_interval_ms
       }
     }, state}
  end

  def handle_call(:request_refresh, _from, state) do
    now_ms = System.monotonic_time(:millisecond)
    already_due? = is_integer(state.next_poll_due_at_ms) and state.next_poll_due_at_ms <= now_ms
    coalesced = state.poll_check_in_progress == true or already_due?
    state = if coalesced, do: state, else: schedule_tick(state, 0)

    {:reply,
     %{
       queued: true,
       coalesced: coalesced,
       requested_at: DateTime.utc_now(),
       operations: ["poll", "reconcile"]
     }, state}
  end

  defp integrate_codex_update(running_entry, %{event: event, timestamp: timestamp} = update) do
    token_delta = extract_token_delta(running_entry, update)
    last_rate_limits = Map.get(running_entry, :last_rate_limits)
    codex_input_tokens = Map.get(running_entry, :codex_input_tokens, 0)
    codex_output_tokens = Map.get(running_entry, :codex_output_tokens, 0)
    codex_total_tokens = Map.get(running_entry, :codex_total_tokens, 0)
    codex_app_server_pid = Map.get(running_entry, :codex_app_server_pid)
    last_reported_input = Map.get(running_entry, :codex_last_reported_input_tokens, 0)
    last_reported_output = Map.get(running_entry, :codex_last_reported_output_tokens, 0)
    last_reported_total = Map.get(running_entry, :codex_last_reported_total_tokens, 0)
    turn_count = Map.get(running_entry, :turn_count, 0)

    {
      Map.merge(running_entry, %{
        last_codex_timestamp: timestamp,
        last_codex_message: summarize_codex_update(update),
        session_id: session_id_for_update(running_entry.session_id, update),
        last_codex_event: event,
        last_rate_limits: extract_rate_limits(update) || last_rate_limits,
        codex_app_server_pid: codex_app_server_pid_for_update(codex_app_server_pid, update),
        codex_input_tokens: codex_input_tokens + token_delta.input_tokens,
        codex_output_tokens: codex_output_tokens + token_delta.output_tokens,
        codex_total_tokens: codex_total_tokens + token_delta.total_tokens,
        codex_last_reported_input_tokens: max(last_reported_input, token_delta.input_reported),
        codex_last_reported_output_tokens: max(last_reported_output, token_delta.output_reported),
        codex_last_reported_total_tokens: max(last_reported_total, token_delta.total_reported),
        turn_count: turn_count_for_update(turn_count, running_entry.session_id, update)
      }),
      token_delta
    }
  end

  defp codex_app_server_pid_for_update(_existing, %{codex_app_server_pid: pid})
       when is_binary(pid),
       do: pid

  defp codex_app_server_pid_for_update(_existing, %{codex_app_server_pid: pid})
       when is_integer(pid),
       do: Integer.to_string(pid)

  defp codex_app_server_pid_for_update(_existing, %{codex_app_server_pid: pid}) when is_list(pid),
    do: to_string(pid)

  defp codex_app_server_pid_for_update(existing, _update), do: existing

  defp session_id_for_update(_existing, %{session_id: session_id}) when is_binary(session_id),
    do: session_id

  defp session_id_for_update(existing, _update), do: existing

  defp turn_count_for_update(existing_count, existing_session_id, %{
         event: :session_started,
         session_id: session_id
       })
       when is_integer(existing_count) and is_binary(session_id) do
    if session_id == existing_session_id do
      existing_count
    else
      existing_count + 1
    end
  end

  defp turn_count_for_update(existing_count, _existing_session_id, _update)
       when is_integer(existing_count),
       do: existing_count

  defp turn_count_for_update(_existing_count, _existing_session_id, _update), do: 0

  defp summarize_codex_update(update) do
    %{
      event: update[:event],
      message: update[:payload] || update[:raw],
      timestamp: update[:timestamp]
    }
  end

  defp schedule_tick(%State{} = state, delay_ms) when is_integer(delay_ms) and delay_ms >= 0 do
    if is_reference(state.tick_timer_ref) do
      Process.cancel_timer(state.tick_timer_ref)
    end

    tick_token = make_ref()
    timer_ref = Process.send_after(self(), {:tick, tick_token}, delay_ms)

    %{
      state
      | tick_timer_ref: timer_ref,
        tick_token: tick_token,
        next_poll_due_at_ms: System.monotonic_time(:millisecond) + delay_ms
    }
  end

  defp schedule_poll_cycle_start do
    :timer.send_after(@poll_transition_render_delay_ms, self(), :run_poll_cycle)
    :ok
  end

  defp next_poll_in_ms(nil, _now_ms), do: nil

  defp next_poll_in_ms(next_poll_due_at_ms, now_ms) when is_integer(next_poll_due_at_ms) do
    max(0, next_poll_due_at_ms - now_ms)
  end

  defp pop_running_entry(state, issue_id) do
    {Map.get(state.running, issue_id), %{state | running: Map.delete(state.running, issue_id)}}
  end

  defp record_session_completion_totals(state, running_entry) when is_map(running_entry) do
    runtime_seconds = running_seconds(running_entry.started_at, DateTime.utc_now())

    codex_totals =
      apply_token_delta(
        state.codex_totals,
        %{
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          seconds_running: runtime_seconds
        }
      )

    %{state | codex_totals: codex_totals}
  end

  defp record_session_completion_totals(state, _running_entry), do: state

  defp refresh_runtime_config(%State{} = state) do
    config = Config.settings!()

    %{
      state
      | poll_interval_ms: config.polling.interval_ms,
        max_concurrent_agents: config.agent.max_concurrent_agents
    }
  end

  defp retry_candidate_issue?(%Issue{} = issue, terminal_states) do
    candidate_issue?(issue, dispatchable_state_set(), terminal_states) and
      !todo_issue_blocked_by_non_terminal?(issue, terminal_states)
  end

  defp dispatch_slots_available?(%Issue{} = issue, %State{} = state) do
    available_slots(state) > 0 and state_slots_available?(issue, state.running)
  end

  defp apply_codex_token_delta(
         %{codex_totals: codex_totals} = state,
         %{input_tokens: input, output_tokens: output, total_tokens: total} = token_delta
       )
       when is_integer(input) and is_integer(output) and is_integer(total) do
    %{state | codex_totals: apply_token_delta(codex_totals, token_delta)}
  end

  defp apply_codex_token_delta(state, _token_delta), do: state

  defp apply_codex_rate_limits(%State{} = state, update) when is_map(update) do
    case extract_rate_limits(update) do
      %{} = rate_limits ->
        %{state | codex_rate_limits: rate_limits}

      _ ->
        state
    end
  end

  defp apply_codex_rate_limits(state, _update), do: state

  defp apply_token_delta(codex_totals, token_delta) do
    input_tokens = Map.get(codex_totals, :input_tokens, 0) + token_delta.input_tokens
    output_tokens = Map.get(codex_totals, :output_tokens, 0) + token_delta.output_tokens
    total_tokens = Map.get(codex_totals, :total_tokens, 0) + token_delta.total_tokens

    seconds_running =
      Map.get(codex_totals, :seconds_running, 0) + Map.get(token_delta, :seconds_running, 0)

    %{
      input_tokens: max(0, input_tokens),
      output_tokens: max(0, output_tokens),
      total_tokens: max(0, total_tokens),
      seconds_running: max(0, seconds_running)
    }
  end

  defp extract_token_delta(running_entry, %{event: _, timestamp: _} = update) do
    running_entry = running_entry || %{}
    usage = extract_token_usage(update)

    {
      compute_token_delta(
        running_entry,
        :input,
        usage,
        :codex_last_reported_input_tokens
      ),
      compute_token_delta(
        running_entry,
        :output,
        usage,
        :codex_last_reported_output_tokens
      ),
      compute_token_delta(
        running_entry,
        :total,
        usage,
        :codex_last_reported_total_tokens
      )
    }
    |> Tuple.to_list()
    |> then(fn [input, output, total] ->
      %{
        input_tokens: input.delta,
        output_tokens: output.delta,
        total_tokens: total.delta,
        input_reported: input.reported,
        output_reported: output.reported,
        total_reported: total.reported
      }
    end)
  end

  defp compute_token_delta(running_entry, token_key, usage, reported_key) do
    next_total = get_token_usage(usage, token_key)
    prev_reported = Map.get(running_entry, reported_key, 0)

    delta =
      if is_integer(next_total) and next_total >= prev_reported do
        next_total - prev_reported
      else
        0
      end

    %{
      delta: max(delta, 0),
      reported: if(is_integer(next_total), do: next_total, else: prev_reported)
    }
  end

  defp extract_token_usage(update) do
    payloads = [
      update[:usage],
      Map.get(update, "usage"),
      Map.get(update, :usage),
      update[:payload],
      Map.get(update, "payload"),
      update
    ]

    Enum.find_value(payloads, &absolute_token_usage_from_payload/1) ||
      Enum.find_value(payloads, &turn_completed_usage_from_payload/1) ||
      %{}
  end

  defp extract_rate_limits(update) do
    rate_limits_from_payload(update[:rate_limits]) ||
      rate_limits_from_payload(Map.get(update, "rate_limits")) ||
      rate_limits_from_payload(Map.get(update, :rate_limits)) ||
      rate_limits_from_payload(update[:payload]) ||
      rate_limits_from_payload(Map.get(update, "payload")) ||
      rate_limits_from_payload(update)
  end

  defp absolute_token_usage_from_payload(payload) when is_map(payload) do
    absolute_paths = [
      ["params", "msg", "payload", "info", "total_token_usage"],
      [:params, :msg, :payload, :info, :total_token_usage],
      ["params", "msg", "info", "total_token_usage"],
      [:params, :msg, :info, :total_token_usage],
      ["params", "tokenUsage", "total"],
      [:params, :tokenUsage, :total],
      ["tokenUsage", "total"],
      [:tokenUsage, :total]
    ]

    explicit_map_at_paths(payload, absolute_paths)
  end

  defp absolute_token_usage_from_payload(_payload), do: nil

  defp turn_completed_usage_from_payload(payload) when is_map(payload) do
    method = Map.get(payload, "method") || Map.get(payload, :method)

    if method in ["turn/completed", :turn_completed] do
      direct =
        Map.get(payload, "usage") ||
          Map.get(payload, :usage) ||
          map_at_path(payload, ["params", "usage"]) ||
          map_at_path(payload, [:params, :usage])

      if is_map(direct) and integer_token_map?(direct), do: direct
    end
  end

  defp turn_completed_usage_from_payload(_payload), do: nil

  defp rate_limits_from_payload(payload) when is_map(payload) do
    direct = Map.get(payload, "rate_limits") || Map.get(payload, :rate_limits)

    cond do
      rate_limits_map?(direct) ->
        direct

      rate_limits_map?(payload) ->
        payload

      true ->
        rate_limit_payloads(payload)
    end
  end

  defp rate_limits_from_payload(payload) when is_list(payload) do
    rate_limit_payloads(payload)
  end

  defp rate_limits_from_payload(_payload), do: nil

  defp rate_limit_payloads(payload) when is_map(payload) do
    Map.values(payload)
    |> Enum.reduce_while(nil, fn
      value, nil ->
        case rate_limits_from_payload(value) do
          nil -> {:cont, nil}
          rate_limits -> {:halt, rate_limits}
        end

      _value, result ->
        {:halt, result}
    end)
  end

  defp rate_limit_payloads(payload) when is_list(payload) do
    payload
    |> Enum.reduce_while(nil, fn
      value, nil ->
        case rate_limits_from_payload(value) do
          nil -> {:cont, nil}
          rate_limits -> {:halt, rate_limits}
        end

      _value, result ->
        {:halt, result}
    end)
  end

  defp rate_limits_map?(payload) when is_map(payload) do
    limit_id =
      Map.get(payload, "limit_id") ||
        Map.get(payload, :limit_id) ||
        Map.get(payload, "limit_name") ||
        Map.get(payload, :limit_name)

    has_buckets =
      Enum.any?(
        ["primary", :primary, "secondary", :secondary, "credits", :credits],
        &Map.has_key?(payload, &1)
      )

    !is_nil(limit_id) and has_buckets
  end

  defp rate_limits_map?(_payload), do: false

  defp explicit_map_at_paths(payload, paths) when is_map(payload) and is_list(paths) do
    Enum.find_value(paths, fn path ->
      value = map_at_path(payload, path)

      if is_map(value) and integer_token_map?(value), do: value
    end)
  end

  defp explicit_map_at_paths(_payload, _paths), do: nil

  defp map_at_path(payload, path) when is_map(payload) and is_list(path) do
    Enum.reduce_while(path, payload, fn key, acc ->
      if is_map(acc) and Map.has_key?(acc, key) do
        {:cont, Map.get(acc, key)}
      else
        {:halt, nil}
      end
    end)
  end

  defp map_at_path(_payload, _path), do: nil

  defp integer_token_map?(payload) do
    token_fields = [
      :input_tokens,
      :output_tokens,
      :total_tokens,
      :prompt_tokens,
      :completion_tokens,
      :inputTokens,
      :outputTokens,
      :totalTokens,
      :promptTokens,
      :completionTokens,
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "prompt_tokens",
      "completion_tokens",
      "inputTokens",
      "outputTokens",
      "totalTokens",
      "promptTokens",
      "completionTokens"
    ]

    token_fields
    |> Enum.any?(fn field ->
      value = payload_get(payload, field)
      !is_nil(integer_like(value))
    end)
  end

  defp get_token_usage(usage, :input),
    do:
      payload_get(usage, [
        "input_tokens",
        "prompt_tokens",
        :input_tokens,
        :prompt_tokens,
        :input,
        "promptTokens",
        :promptTokens,
        "inputTokens",
        :inputTokens
      ])

  defp get_token_usage(usage, :output),
    do:
      payload_get(usage, [
        "output_tokens",
        "completion_tokens",
        :output_tokens,
        :completion_tokens,
        :output,
        :completion,
        "outputTokens",
        :outputTokens,
        "completionTokens",
        :completionTokens
      ])

  defp get_token_usage(usage, :total),
    do:
      payload_get(usage, [
        "total_tokens",
        "total",
        :total_tokens,
        :total,
        "totalTokens",
        :totalTokens
      ])

  defp payload_get(payload, fields) when is_list(fields) do
    Enum.find_value(fields, fn field -> map_integer_value(payload, field) end)
  end

  defp payload_get(payload, field), do: map_integer_value(payload, field)

  defp map_integer_value(payload, field) do
    if is_map(payload) do
      value = Map.get(payload, field)
      integer_like(value)
    else
      nil
    end
  end

  defp running_seconds(%DateTime{} = started_at, %DateTime{} = now) do
    max(0, DateTime.diff(now, started_at, :second))
  end

  defp running_seconds(_started_at, _now), do: 0

  defp integer_like(value) when is_integer(value) and value >= 0, do: value

  defp integer_like(value) when is_binary(value) do
    case Integer.parse(String.trim(value)) do
      {num, _} when num >= 0 -> num
      _ -> nil
    end
  end

  defp integer_like(_value), do: nil
end
