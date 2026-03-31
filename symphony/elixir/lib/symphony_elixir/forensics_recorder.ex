defmodule SymphonyElixir.ForensicsRecorder do
  @moduledoc """
  Write-side facade for run, turn, and event journaling.
  """

  require Logger

  alias SymphonyElixir.{Linear.Issue, RepoSnapshot, RunJournal}

  @spec start_run(Issue.t(), keyword()) :: String.t()
  def start_run(%Issue{} = issue, opts \\ []) do
    run_id = Ecto.UUID.generate()

    attrs = %{
      run_id: run_id,
      issue_id: issue.id,
      issue_identifier: issue.identifier || issue.id || "issue",
      attempt: Keyword.get(opts, :attempt),
      status: "dispatched",
      worker_host: Keyword.get(opts, :worker_host),
      metadata: %{
        issue_title: issue.title,
        issue_state: issue.state,
        issue_url: issue.url
      }
    }

    best_effort("record run start", fn ->
      RunJournal.record_run_started(attrs)
    end)

    run_id
  end

  @spec record_workspace_ready(String.t() | nil, Path.t(), String.t() | nil) :: :ok
  def record_workspace_ready(run_id, workspace, worker_host) when is_binary(workspace) do
    snapshot = RepoSnapshot.capture(workspace, worker_host)

    best_effort("record workspace ready", fn ->
      RunJournal.update_run(run_id, %{
        status: "workspace_ready",
        worker_host: worker_host,
        workspace_path: workspace,
        commit_hash_start: snapshot[:commit_hash],
        repo_start: snapshot
      })
    end)

    :ok
  end

  def record_workspace_ready(_run_id, _workspace, _worker_host), do: :ok

  @spec start_turn(String.t() | nil, pos_integer(), String.t()) :: String.t()
  def start_turn(run_id, turn_sequence, prompt_text)
      when is_integer(turn_sequence) and turn_sequence > 0 and is_binary(prompt_text) do
    turn_journal_id = Ecto.UUID.generate()

    best_effort("record turn start", fn ->
      RunJournal.record_turn_started(run_id, %{
        turn_id: turn_journal_id,
        turn_sequence: turn_sequence,
        prompt_text: prompt_text,
        status: "started"
      })
    end)

    turn_journal_id
  end

  def start_turn(_run_id, _turn_sequence, _prompt_text), do: Ecto.UUID.generate()

  @spec record_event(String.t() | nil, String.t() | nil, map()) :: :ok
  def record_event(run_id, turn_journal_id, message) when is_map(message) do
    attrs = %{
      event_type: message[:event] |> to_string(),
      recorded_at: message[:timestamp],
      payload: normalize_json(message),
      summary: message[:event] |> to_string(),
      codex_thread_id: Map.get(message, :thread_id),
      codex_turn_id: Map.get(message, :turn_id),
      codex_session_id: Map.get(message, :session_id)
    }

    best_effort("record turn event", fn ->
      RunJournal.record_event(run_id, turn_journal_id, attrs)
    end)

    if message[:event] == :session_started do
      best_effort("update turn identifiers", fn ->
        RunJournal.update_turn(turn_journal_id, %{
          status: "running",
          codex_thread_id: Map.get(message, :thread_id),
          codex_turn_id: Map.get(message, :turn_id),
          codex_session_id: Map.get(message, :session_id)
        })
      end)
    end

    :ok
  end

  def record_event(_run_id, _turn_journal_id, _message), do: :ok

  @spec finalize_turn(String.t() | nil, String.t() | nil, String.t(), map()) :: :ok
  def finalize_turn(turn_journal_id, _run_id, status, attrs \\ %{})
      when is_binary(status) and is_map(attrs) do
    best_effort("finalize turn", fn ->
      RunJournal.finalize_turn(turn_journal_id, Map.put(attrs, :status, status))
    end)

    :ok
  end

  @spec record_run_end_snapshot(String.t() | nil, Path.t(), String.t() | nil) :: :ok
  def record_run_end_snapshot(run_id, workspace, worker_host) when is_binary(workspace) do
    snapshot = RepoSnapshot.capture(workspace, worker_host)

    best_effort("record run end snapshot", fn ->
      RunJournal.update_run(run_id, %{
        commit_hash_end: snapshot[:commit_hash],
        repo_end: snapshot
      })
    end)

    :ok
  end

  def record_run_end_snapshot(_run_id, _workspace, _worker_host), do: :ok

  @spec finalize_run(String.t() | nil, map()) :: :ok
  def finalize_run(run_id, attrs) when is_map(attrs) do
    best_effort("finalize run", fn ->
      RunJournal.finalize_run(run_id, attrs)
    end)

    :ok
  end

  defp best_effort(label, fun) when is_function(fun, 0) do
    case fun.() do
      {:ok, _value} -> :ok
      :ok -> :ok
      {:error, reason} -> Logger.warning("Forensics recorder failed action=#{label} reason=#{inspect(reason)}")
    end
  rescue
    error ->
      Logger.warning("Forensics recorder raised action=#{label} reason=#{Exception.message(error)}")
      :ok
  end

  defp normalize_json(%DateTime{} = value), do: DateTime.to_iso8601(value)
  defp normalize_json(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  defp normalize_json(%Date{} = value), do: Date.to_iso8601(value)
  defp normalize_json(%Time{} = value), do: Time.to_iso8601(value)
  defp normalize_json(%_{} = value), do: value |> Map.from_struct() |> normalize_json()
  defp normalize_json(value) when is_map(value), do: Map.new(value, fn {key, item} -> {to_string(key), normalize_json(item)} end)
  defp normalize_json(value) when is_list(value), do: Enum.map(value, &normalize_json/1)
  defp normalize_json(value) when is_atom(value), do: Atom.to_string(value)
  defp normalize_json(value), do: value
end
