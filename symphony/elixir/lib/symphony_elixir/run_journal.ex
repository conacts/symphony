defmodule SymphonyElixir.RunJournal do
  @moduledoc """
  SQLite-backed forensic journal for issue runs, turns, and raw Codex events.
  """

  use GenServer

  require Logger

  alias SymphonyElixir.ForensicsRedactor

  @default_db_relative_path "log/run-journal.sqlite3"
  @default_retention_days 90
  @default_prune_interval_ms :timer.hours(24)
  @default_payload_max_bytes 64 * 1024

  @type iso8601 :: String.t()
  @type json_map :: map() | nil

  @type run_start_attrs :: %{
          required(:issue_id) => String.t(),
          required(:issue_identifier) => String.t(),
          optional(:run_id) => String.t(),
          optional(:attempt) => integer() | nil,
          optional(:status) => String.t(),
          optional(:worker_host) => String.t() | nil,
          optional(:workspace_path) => String.t() | nil,
          optional(:started_at) => DateTime.t() | iso8601,
          optional(:commit_hash_start) => String.t() | nil,
          optional(:repo_start) => json_map,
          optional(:metadata) => json_map
        }

  @type turn_start_attrs :: %{
          optional(:turn_id) => String.t(),
          optional(:turn_sequence) => integer(),
          optional(:codex_thread_id) => String.t() | nil,
          optional(:codex_turn_id) => String.t() | nil,
          optional(:codex_session_id) => String.t() | nil,
          required(:prompt_text) => String.t(),
          optional(:status) => String.t(),
          optional(:started_at) => DateTime.t() | iso8601,
          optional(:metadata) => json_map
        }

  @type event_attrs :: %{
          required(:event_type) => String.t(),
          optional(:event_id) => String.t(),
          optional(:event_sequence) => integer(),
          optional(:recorded_at) => DateTime.t() | iso8601,
          optional(:payload) => term(),
          optional(:summary) => String.t() | nil,
          optional(:codex_thread_id) => String.t() | nil,
          optional(:codex_turn_id) => String.t() | nil,
          optional(:codex_session_id) => String.t() | nil
        }

  @type turn_finish_attrs :: %{
          optional(:status) => String.t(),
          optional(:ended_at) => DateTime.t() | iso8601,
          optional(:codex_thread_id) => String.t() | nil,
          optional(:codex_turn_id) => String.t() | nil,
          optional(:codex_session_id) => String.t() | nil,
          optional(:tokens) => json_map,
          optional(:metadata) => json_map
        }

  @type run_finish_attrs :: %{
          optional(:status) => String.t(),
          optional(:outcome) => String.t() | nil,
          optional(:ended_at) => DateTime.t() | iso8601,
          optional(:commit_hash_end) => String.t() | nil,
          optional(:repo_end) => json_map,
          optional(:metadata) => json_map,
          optional(:error_class) => String.t() | nil,
          optional(:error_message) => String.t() | nil
        }

  defmodule State do
    @moduledoc false

    defstruct [
      :conn,
      :db_file,
      :payload_max_bytes,
      :prune_timer_ref,
      retention_days: 90,
      prune_interval_ms: :timer.hours(24),
      last_error: nil
    ]
  end

  @spec child_spec(keyword()) :: Supervisor.child_spec()
  def child_spec(opts) do
    %{
      id: __MODULE__,
      start: {__MODULE__, :start_link, [opts]}
    }
  end

  @spec start_link(keyword()) :: GenServer.on_start()
  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: Keyword.get(opts, :name, __MODULE__))
  end

  @spec default_db_file() :: Path.t()
  def default_db_file do
    default_db_file(File.cwd!())
  end

  @spec default_db_file(Path.t()) :: Path.t()
  def default_db_file(logs_root) when is_binary(logs_root) do
    Path.join(logs_root, @default_db_relative_path)
  end

  @spec configured_db_file() :: Path.t()
  def configured_db_file do
    Application.get_env(:symphony_elixir, :run_journal_file, default_db_file())
  end

  @spec record_run_started(run_start_attrs()) :: {:ok, String.t()} | {:error, term()}
  @spec record_run_started(GenServer.server(), run_start_attrs()) ::
          {:ok, String.t()} | {:error, term()}
  def record_run_started(attrs) when is_map(attrs) do
    record_run_started(__MODULE__, attrs)
  end

  def record_run_started(server, attrs) when is_map(attrs) do
    GenServer.call(server, {:record_run_started, attrs})
  end

  @spec record_turn_started(String.t(), turn_start_attrs()) :: {:ok, String.t()} | {:error, term()}
  @spec record_turn_started(GenServer.server(), String.t(), turn_start_attrs()) ::
          {:ok, String.t()} | {:error, term()}
  def record_turn_started(run_id, attrs) when is_binary(run_id) and is_map(attrs) do
    record_turn_started(__MODULE__, run_id, attrs)
  end

  def record_turn_started(server, run_id, attrs)
      when is_binary(run_id) and is_map(attrs) do
    GenServer.call(server, {:record_turn_started, run_id, attrs})
  end

  @spec record_event(String.t(), String.t(), event_attrs()) ::
          {:ok, String.t()} | {:error, term()}
  @spec record_event(GenServer.server(), String.t(), String.t(), event_attrs()) ::
          {:ok, String.t()} | {:error, term()}
  def record_event(run_id, turn_id, attrs)
      when is_binary(run_id) and is_binary(turn_id) and is_map(attrs) do
    record_event(__MODULE__, run_id, turn_id, attrs)
  end

  def record_event(server, run_id, turn_id, attrs)
      when is_binary(run_id) and is_binary(turn_id) and is_map(attrs) do
    GenServer.call(server, {:record_event, run_id, turn_id, attrs})
  end

  @spec update_turn(String.t(), map()) :: :ok | {:error, term()}
  @spec update_turn(GenServer.server(), String.t(), map()) :: :ok | {:error, term()}
  def update_turn(turn_id, attrs) when is_binary(turn_id) and is_map(attrs) do
    update_turn(__MODULE__, turn_id, attrs)
  end

  def update_turn(server, turn_id, attrs) when is_binary(turn_id) and is_map(attrs) do
    GenServer.call(server, {:update_turn, turn_id, attrs})
  end

  @spec finalize_turn(String.t(), turn_finish_attrs()) :: :ok | {:error, term()}
  @spec finalize_turn(GenServer.server(), String.t(), turn_finish_attrs()) ::
          :ok | {:error, term()}
  def finalize_turn(turn_id, attrs) when is_binary(turn_id) and is_map(attrs) do
    finalize_turn(__MODULE__, turn_id, attrs)
  end

  def finalize_turn(server, turn_id, attrs) when is_binary(turn_id) and is_map(attrs) do
    GenServer.call(server, {:finalize_turn, turn_id, attrs})
  end

  @spec update_run(String.t(), map()) :: :ok | {:error, term()}
  @spec update_run(GenServer.server(), String.t(), map()) :: :ok | {:error, term()}
  def update_run(run_id, attrs) when is_binary(run_id) and is_map(attrs) do
    update_run(__MODULE__, run_id, attrs)
  end

  def update_run(server, run_id, attrs) when is_binary(run_id) and is_map(attrs) do
    GenServer.call(server, {:update_run, run_id, attrs})
  end

  @spec finalize_run(String.t(), run_finish_attrs()) :: :ok | {:error, term()}
  @spec finalize_run(GenServer.server(), String.t(), run_finish_attrs()) ::
          :ok | {:error, term()}
  def finalize_run(run_id, attrs) when is_binary(run_id) and is_map(attrs) do
    finalize_run(__MODULE__, run_id, attrs)
  end

  def finalize_run(server, run_id, attrs) when is_binary(run_id) and is_map(attrs) do
    GenServer.call(server, {:finalize_run, run_id, attrs})
  end

  @spec list_issues(keyword()) :: {:ok, [map()]} | {:error, term()}
  @spec list_issues(GenServer.server()) :: {:ok, [map()]} | {:error, term()}
  @spec list_issues(GenServer.server(), keyword()) :: {:ok, [map()]} | {:error, term()}
  def list_issues(server_or_opts \\ __MODULE__, opts \\ [])
  def list_issues(opts, []) when is_list(opts), do: GenServer.call(__MODULE__, {:list_issues, opts})

  def list_issues(server, opts) when is_list(opts) do
    GenServer.call(server, {:list_issues, opts})
  end

  @spec list_runs_for_issue(String.t(), keyword()) :: {:ok, [map()]} | {:error, term()}
  @spec list_runs_for_issue(GenServer.server(), String.t(), keyword()) ::
          {:ok, [map()]} | {:error, term()}
  def list_runs_for_issue(server_or_issue_identifier, issue_identifier_or_opts \\ __MODULE__, opts \\ [])

  def list_runs_for_issue(issue_identifier, opts, [])
      when is_binary(issue_identifier) and is_list(opts) do
    GenServer.call(__MODULE__, {:list_runs_for_issue, issue_identifier, opts})
  end

  def list_runs_for_issue(server, issue_identifier, opts)
      when is_binary(issue_identifier) and is_list(opts) do
    GenServer.call(server, {:list_runs_for_issue, issue_identifier, opts})
  end

  @spec list_problem_runs(keyword()) :: {:ok, [map()]} | {:error, term()}
  @spec list_problem_runs(GenServer.server()) :: {:ok, [map()]} | {:error, term()}
  @spec list_problem_runs(GenServer.server(), keyword()) :: {:ok, [map()]} | {:error, term()}
  def list_problem_runs(server_or_opts \\ __MODULE__, opts \\ [])

  def list_problem_runs(opts, []) when is_list(opts),
    do: GenServer.call(__MODULE__, {:list_problem_runs, opts})

  def list_problem_runs(server, opts) when is_list(opts) do
    GenServer.call(server, {:list_problem_runs, opts})
  end

  @spec fetch_run_export(String.t()) :: {:ok, map()} | {:error, term()}
  @spec fetch_run_export(GenServer.server(), String.t()) :: {:ok, map()} | {:error, term()}
  def fetch_run_export(run_id) when is_binary(run_id) do
    fetch_run_export(__MODULE__, run_id)
  end

  def fetch_run_export(server, run_id) when is_binary(run_id) do
    GenServer.call(server, {:fetch_run_export, run_id})
  end

  @spec prune_retention() :: :ok | {:error, term()}
  @spec prune_retention(GenServer.server()) :: :ok | {:error, term()}
  def prune_retention do
    prune_retention(__MODULE__)
  end

  def prune_retention(server) do
    GenServer.call(server, :prune_retention)
  end

  @impl true
  def init(opts) do
    db_file = Keyword.get(opts, :db_file, configured_db_file()) |> Path.expand()
    payload_max_bytes = Keyword.get(opts, :payload_max_bytes, @default_payload_max_bytes)
    retention_days = Keyword.get(opts, :retention_days, @default_retention_days)
    prune_interval_ms = Keyword.get(opts, :prune_interval_ms, @default_prune_interval_ms)

    state = %State{
      db_file: db_file,
      payload_max_bytes: payload_max_bytes,
      retention_days: retention_days,
      prune_interval_ms: prune_interval_ms
    }

    case open_connection(state) do
      {:ok, state} ->
        state = schedule_prune(state)
        {:ok, state, {:continue, :prune_retention}}

      {:error, reason} ->
        Logger.warning("Run journal disabled path=#{db_file} reason=#{inspect(reason)}")
        {:ok, %{state | last_error: reason}, {:continue, :prune_retention}}
    end
  end

  @impl true
  def handle_continue(:prune_retention, state) do
    {:noreply, maybe_prune_retention(state)}
  end

  @impl true
  def handle_info(:prune_retention, state) do
    state = schedule_prune(state)
    {:noreply, maybe_prune_retention(state)}
  end

  def handle_info(_message, state), do: {:noreply, state}

  @impl true
  def handle_call({:record_run_started, attrs}, _from, state) do
    with_conn(state, fn conn ->
      run_id = Map.get(attrs, :run_id, Ecto.UUID.generate())
      issue_id = fetch_required_binary!(attrs, :issue_id)
      issue_identifier = fetch_required_binary!(attrs, :issue_identifier)
      now = iso8601_now()
      started_at = to_iso8601(Map.get(attrs, :started_at)) || now

      params = %{
        issue_id: issue_id,
        issue_identifier: issue_identifier,
        latest_run_started_at: started_at,
        inserted_at: now,
        updated_at: now,
        run_id: run_id,
        attempt: Map.get(attrs, :attempt),
        status: Map.get(attrs, :status, "starting"),
        worker_host: Map.get(attrs, :worker_host),
        workspace_path: Map.get(attrs, :workspace_path),
        started_at: started_at,
        commit_hash_start: Map.get(attrs, :commit_hash_start),
        repo_start_json: encode_json(Map.get(attrs, :repo_start)),
        metadata_json: encode_json(Map.get(attrs, :metadata))
      }

      {:ok, _result} =
        Exqlite.transaction(conn, fn tx_conn ->
          execute!(tx_conn, upsert_issue_sql(), [
            params.issue_id,
            params.issue_identifier,
            params.latest_run_started_at,
            params.inserted_at,
            params.updated_at
          ])

          execute!(tx_conn, insert_run_sql(), [
            params.run_id,
            params.issue_id,
            params.issue_identifier,
            params.attempt,
            params.status,
            params.worker_host,
            params.workspace_path,
            params.started_at,
            params.commit_hash_start,
            params.repo_start_json,
            params.metadata_json,
            params.inserted_at,
            params.updated_at
          ])
        end)

      {:ok, run_id}
    end)
    |> reply_with_state(state)
  end

  def handle_call({:record_turn_started, run_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      turn_id = Map.get(attrs, :turn_id, Ecto.UUID.generate())
      turn_sequence = Map.get(attrs, :turn_sequence) || next_turn_sequence(conn, run_id)
      now = iso8601_now()
      started_at = to_iso8601(Map.get(attrs, :started_at)) || now

      execute!(conn, insert_turn_sql(), [
        turn_id,
        run_id,
        turn_sequence,
        Map.get(attrs, :codex_thread_id),
        Map.get(attrs, :codex_turn_id),
        Map.get(attrs, :codex_session_id),
        fetch_required_binary!(attrs, :prompt_text) |> sanitize_text(),
        Map.get(attrs, :status, "started"),
        started_at,
        encode_json(Map.get(attrs, :metadata)),
        now,
        now
      ])

      {:ok, turn_id}
    end)
    |> reply_with_state(state)
  end

  def handle_call({:record_event, run_id, turn_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      event_id = Map.get(attrs, :event_id, Ecto.UUID.generate())
      event_sequence = Map.get(attrs, :event_sequence) || next_event_sequence(conn, turn_id)
      now = iso8601_now()
      recorded_at = to_iso8601(Map.get(attrs, :recorded_at)) || now
      payload = truncate_payload(Map.get(attrs, :payload), state.payload_max_bytes)

      execute!(conn, insert_event_sql(), [
        event_id,
        turn_id,
        run_id,
        event_sequence,
        fetch_required_binary!(attrs, :event_type),
        recorded_at,
        payload.json,
        if(payload.truncated?, do: 1, else: 0),
        payload.bytes,
        sanitize_text(Map.get(attrs, :summary)),
        Map.get(attrs, :codex_thread_id),
        Map.get(attrs, :codex_turn_id),
        Map.get(attrs, :codex_session_id),
        now
      ])

      {:ok, event_id}
    end)
    |> reply_with_state(state)
  end

  def handle_call({:update_turn, turn_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      now = iso8601_now()

      execute!(conn, update_turn_sql(), [
        Map.get(attrs, :status),
        to_iso8601(Map.get(attrs, :started_at)),
        to_iso8601(Map.get(attrs, :ended_at)),
        Map.get(attrs, :codex_thread_id),
        Map.get(attrs, :codex_turn_id),
        Map.get(attrs, :codex_session_id),
        encode_json(Map.get(attrs, :tokens)),
        encode_json(Map.get(attrs, :metadata)),
        now,
        turn_id
      ])

      :ok
    end)
    |> reply_with_state(state)
  end

  def handle_call({:finalize_turn, turn_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      now = iso8601_now()
      ended_at = to_iso8601(Map.get(attrs, :ended_at)) || now

      execute!(conn, finalize_turn_sql(), [
        Map.get(attrs, :status, "completed"),
        Map.get(attrs, :codex_thread_id),
        Map.get(attrs, :codex_turn_id),
        Map.get(attrs, :codex_session_id),
        ended_at,
        encode_json(Map.get(attrs, :tokens)),
        encode_json(Map.get(attrs, :metadata)),
        now,
        turn_id
      ])

      :ok
    end)
    |> reply_with_state(state)
  end

  def handle_call({:update_run, run_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      now = iso8601_now()

      execute!(conn, update_run_sql(), [
        Map.get(attrs, :status),
        Map.get(attrs, :outcome),
        Map.get(attrs, :worker_host),
        Map.get(attrs, :workspace_path),
        to_iso8601(Map.get(attrs, :started_at)),
        to_iso8601(Map.get(attrs, :ended_at)),
        Map.get(attrs, :commit_hash_start),
        Map.get(attrs, :commit_hash_end),
        encode_json(Map.get(attrs, :repo_start)),
        encode_json(Map.get(attrs, :repo_end)),
        encode_json(Map.get(attrs, :metadata)),
        sanitize_text(Map.get(attrs, :error_class)),
        sanitize_text(Map.get(attrs, :error_message)),
        now,
        run_id
      ])

      maybe_refresh_issue_latest_run(conn, run_id)
      :ok
    end)
    |> reply_with_state(state)
  end

  def handle_call({:finalize_run, run_id, attrs}, _from, state) do
    with_conn(state, fn conn ->
      now = iso8601_now()
      ended_at = to_iso8601(Map.get(attrs, :ended_at)) || now

      execute!(conn, finalize_run_sql(), [
        Map.get(attrs, :status, "finished"),
        Map.get(attrs, :outcome),
        ended_at,
        Map.get(attrs, :commit_hash_end),
        encode_json(Map.get(attrs, :repo_end)),
        encode_json(Map.get(attrs, :metadata)),
        sanitize_text(Map.get(attrs, :error_class)),
        sanitize_text(Map.get(attrs, :error_message)),
        now,
        run_id
      ])

      maybe_refresh_issue_latest_run(conn, run_id)
      :ok
    end)
    |> reply_with_state(state)
  end

  def handle_call({:list_issues, opts}, _from, state) do
    with_conn(state, fn conn ->
      limit = limit_from_opts(opts)

      query_rows(conn, list_issues_sql(), [limit], &decode_issue_row/1)
    end)
    |> reply_with_state(state)
  end

  def handle_call({:list_runs_for_issue, issue_identifier, opts}, _from, state) do
    with_conn(state, fn conn ->
      limit = limit_from_opts(opts)
      query_rows(conn, list_runs_for_issue_sql(), [issue_identifier, limit], &decode_run_row/1)
    end)
    |> reply_with_state(state)
  end

  def handle_call({:list_problem_runs, opts}, _from, state) do
    with_conn(state, fn conn ->
      limit = limit_from_opts(opts)
      outcome = optional_filter_from_opts(opts, :outcome)
      issue_identifier = optional_filter_from_opts(opts, :issue_identifier)
      query_rows(conn, list_problem_runs_sql(), [outcome, issue_identifier, limit], &decode_run_row/1)
    end)
    |> reply_with_state(state)
  end

  def handle_call({:fetch_run_export, run_id}, _from, state) do
    with_conn(state, fn conn ->
      case fetch_single_map(conn, fetch_run_sql(), [run_id]) do
        nil ->
          {:error, :not_found}

        run_row ->
          {:ok,
           %{
             issue: fetch_issue_export(conn, run_row["issue_id"]),
             run: decode_run_detail_row(run_row),
             turns: fetch_turns_export(conn, run_id)
           }}
      end
    end)
    |> reply_with_state(state)
  end

  def handle_call(:prune_retention, _from, state) do
    {:reply, :ok, maybe_prune_retention(state)}
  end

  @impl true
  def terminate(_reason, %{conn: nil}), do: :ok

  def terminate(_reason, %{conn: conn}) do
    GenServer.stop(conn, :normal)
    :ok
  end

  defp open_connection(%State{} = state) do
    :ok = File.mkdir_p(Path.dirname(state.db_file))

    case Exqlite.start_link(database: state.db_file) do
      {:ok, conn} ->
        :ok = execute!(conn, "PRAGMA foreign_keys = ON")
        :ok = execute!(conn, "PRAGMA journal_mode = WAL")
        :ok = execute!(conn, "PRAGMA busy_timeout = 5000")
        :ok = initialize_schema(conn)
        {:ok, %{state | conn: conn, last_error: nil}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp initialize_schema(conn) do
    Enum.each(schema_statements(), &execute!(conn, &1))
    :ok
  end

  defp maybe_prune_retention(%State{conn: nil} = state), do: state

  defp maybe_prune_retention(%State{} = state) do
    cutoff =
      DateTime.utc_now()
      |> DateTime.add(-state.retention_days * 24 * 60 * 60, :second)
      |> DateTime.truncate(:second)
      |> DateTime.to_iso8601()

    execute!(state.conn, prune_runs_sql(), [cutoff])
    execute!(state.conn, prune_orphan_issues_sql())
    state
  rescue
    error ->
      Logger.warning("Run journal retention prune failed path=#{state.db_file} reason=#{Exception.message(error)}")
      %{state | last_error: error}
  end

  defp schedule_prune(%State{} = state) do
    if is_reference(state.prune_timer_ref) do
      Process.cancel_timer(state.prune_timer_ref)
    end

    %{state | prune_timer_ref: Process.send_after(self(), :prune_retention, state.prune_interval_ms)}
  end

  defp with_conn(%State{conn: nil, last_error: last_error}, _fun), do: {:error, {:journal_unavailable, last_error}}

  defp with_conn(%State{conn: conn}, fun) do
    fun.(conn)
  rescue
    error ->
      {:error, error}
  end

  defp reply_with_state(result, state), do: {:reply, result, state}

  defp execute!(conn, sql, params \\ []) do
    case Exqlite.query(conn, sql, params) do
      {:ok, %{rows: nil}} -> :ok
      {:ok, %{rows: _rows}} -> :ok
      {:error, error} -> raise error
    end
  end

  defp query_rows(conn, sql, params, decoder) do
    result = Exqlite.query!(conn, sql, params)

    result
    |> rows_as_maps()
    |> Enum.map(decoder)
    |> then(&{:ok, &1})
  end

  defp fetch_single_map(conn, sql, params) do
    conn
    |> Exqlite.query!(sql, params)
    |> rows_as_maps()
    |> List.first()
  end

  defp rows_as_maps(%{columns: columns, rows: rows}) when is_list(columns) and is_list(rows) do
    Enum.map(rows, fn row ->
      columns
      |> Enum.zip(row)
      |> Map.new()
    end)
  end

  defp fetch_issue_export(conn, issue_id) when is_binary(issue_id) do
    fetch_single_map(conn, fetch_issue_sql(), [issue_id])
    |> decode_issue_row()
  end

  defp fetch_turns_export(conn, run_id) do
    turns =
      query_rows(conn, fetch_turns_sql(), [run_id], &decode_turn_row/1)
      |> then(fn {:ok, rows} -> rows end)

    Enum.map(turns, fn turn ->
      Map.put(turn, :events, fetch_events_export(conn, turn.turn_id))
    end)
  end

  defp fetch_events_export(conn, turn_id) do
    query_rows(conn, fetch_events_sql(), [turn_id], &decode_event_row/1)
    |> then(fn {:ok, rows} -> rows end)
  end

  defp next_turn_sequence(conn, run_id) do
    case fetch_single_map(conn, next_turn_sequence_sql(), [run_id]) do
      %{"next_sequence" => value} when is_integer(value) -> value
      %{"next_sequence" => nil} -> 1
      _ -> 1
    end
  end

  defp next_event_sequence(conn, turn_id) do
    case fetch_single_map(conn, next_event_sequence_sql(), [turn_id]) do
      %{"next_sequence" => value} when is_integer(value) -> value
      %{"next_sequence" => nil} -> 1
      _ -> 1
    end
  end

  defp truncate_payload(nil, _max_bytes), do: %{json: nil, truncated?: false, bytes: 0}

  defp truncate_payload(payload, max_bytes) when is_integer(max_bytes) and max_bytes > 0 do
    encoded =
      case Jason.encode(ForensicsRedactor.sanitize(payload)) do
        {:ok, json} ->
          json

        {:error, _reason} ->
          Jason.encode!(%{
            "unencodable" => true,
            "inspect" => inspect(payload, pretty: true, limit: 50, printable_limit: max_bytes)
          })
      end

    payload_bytes = byte_size(encoded)

    if payload_bytes <= max_bytes do
      %{json: encoded, truncated?: false, bytes: payload_bytes}
    else
      preview =
        encoded
        |> binary_part(0, max_bytes)

      truncated_json =
        Jason.encode!(%{
          "truncated" => true,
          "preview" => preview,
          "original_bytes" => payload_bytes
        })

      %{json: truncated_json, truncated?: true, bytes: payload_bytes}
    end
  end

  defp encode_json(nil), do: nil
  defp encode_json(value), do: value |> ForensicsRedactor.sanitize() |> Jason.encode!()

  defp maybe_refresh_issue_latest_run(conn, run_id) do
    case fetch_single_map(conn, refresh_issue_latest_run_sql(), [run_id]) do
      %{
        "issue_id" => issue_id,
        "issue_identifier" => issue_identifier,
        "started_at" => started_at
      }
      when is_binary(issue_id) and is_binary(issue_identifier) and is_binary(started_at) ->
        now = iso8601_now()

        execute!(conn, upsert_issue_sql(), [
          issue_id,
          issue_identifier,
          started_at,
          now,
          now
        ])

      _ ->
        :ok
    end
  end

  defp decode_json(nil), do: nil

  defp decode_json(value) when is_binary(value) do
    case Jason.decode(value) do
      {:ok, decoded} -> decoded
      {:error, _reason} -> value
    end
  end

  defp decode_issue_row(nil), do: nil

  defp decode_issue_row(row) do
    %{
      issue_id: row["issue_id"],
      issue_identifier: row["issue_identifier"],
      latest_run_started_at: row["latest_run_started_at"],
      latest_run_id: row["latest_run_id"],
      latest_run_status: row["latest_run_status"],
      latest_run_outcome: row["latest_run_outcome"],
      run_count: row["run_count"] || 0,
      latest_problem_outcome: row["latest_problem_outcome"],
      last_completed_outcome: row["last_completed_outcome"],
      inserted_at: row["inserted_at"],
      updated_at: row["updated_at"]
    }
  end

  defp decode_run_row(row) do
    %{
      run_id: row["run_id"],
      issue_id: row["issue_id"],
      issue_identifier: row["issue_identifier"],
      attempt: row["attempt"],
      status: row["status"],
      outcome: row["outcome"],
      worker_host: row["worker_host"],
      workspace_path: row["workspace_path"],
      started_at: row["started_at"],
      ended_at: row["ended_at"],
      commit_hash_start: row["commit_hash_start"],
      commit_hash_end: row["commit_hash_end"],
      turn_count: row["turn_count"] || 0,
      event_count: row["event_count"] || 0,
      last_event_type: row["last_event_type"],
      last_event_at: row["last_event_at"]
    }
  end

  defp decode_run_detail_row(row) do
    decode_run_row(row)
    |> Map.merge(%{
      repo_start: decode_json(row["repo_start_json"]),
      repo_end: decode_json(row["repo_end_json"]),
      metadata: decode_json(row["metadata_json"]),
      error_class: row["error_class"],
      error_message: row["error_message"],
      inserted_at: row["inserted_at"],
      updated_at: row["updated_at"]
    })
  end

  defp decode_turn_row(row) do
    %{
      turn_id: row["turn_id"],
      run_id: row["run_id"],
      turn_sequence: row["turn_sequence"],
      codex_thread_id: row["codex_thread_id"],
      codex_turn_id: row["codex_turn_id"],
      codex_session_id: row["codex_session_id"],
      prompt_text: row["prompt_text"],
      status: row["status"],
      started_at: row["started_at"],
      ended_at: row["ended_at"],
      tokens: decode_json(row["tokens_json"]),
      metadata: decode_json(row["metadata_json"]),
      inserted_at: row["inserted_at"],
      updated_at: row["updated_at"]
    }
  end

  defp decode_event_row(row) do
    %{
      event_id: row["event_id"],
      turn_id: row["turn_id"],
      run_id: row["run_id"],
      event_sequence: row["event_sequence"],
      event_type: row["event_type"],
      recorded_at: row["recorded_at"],
      payload: decode_json(row["payload_json"]),
      payload_truncated: row["payload_truncated"] == 1,
      payload_bytes: row["payload_bytes"],
      summary: row["summary"],
      codex_thread_id: row["codex_thread_id"],
      codex_turn_id: row["codex_turn_id"],
      codex_session_id: row["codex_session_id"],
      inserted_at: row["inserted_at"]
    }
  end

  defp fetch_required_binary!(attrs, key) do
    case Map.fetch(attrs, key) do
      {:ok, value} when is_binary(value) and value != "" -> value
      _ -> raise ArgumentError, "missing required #{key}"
    end
  end

  defp to_iso8601(%DateTime{} = value), do: value |> DateTime.truncate(:second) |> DateTime.to_iso8601()
  defp to_iso8601(value) when is_binary(value), do: value
  defp to_iso8601(_value), do: nil

  defp sanitize_text(nil), do: nil
  defp sanitize_text(value) when is_binary(value), do: ForensicsRedactor.sanitize_string(value)
  defp sanitize_text(value), do: value |> to_string() |> ForensicsRedactor.sanitize_string()

  defp iso8601_now do
    DateTime.utc_now()
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end

  defp limit_from_opts(opts) do
    opts
    |> Keyword.get(:limit, 50)
    |> normalize_limit()
  end

  defp optional_filter_from_opts(opts, key) do
    opts
    |> Keyword.get(key)
    |> normalize_optional_filter()
  end

  defp normalize_limit(limit) when is_integer(limit) and limit > 0, do: limit
  defp normalize_limit(_limit), do: 50

  defp normalize_optional_filter(value) when is_binary(value) do
    case String.trim(value) do
      "" -> nil
      trimmed -> trimmed
    end
  end

  defp normalize_optional_filter(_value), do: nil

  defp schema_statements do
    [
      """
      CREATE TABLE IF NOT EXISTS issues (
        issue_id TEXT PRIMARY KEY,
        issue_identifier TEXT NOT NULL,
        latest_run_started_at TEXT NOT NULL,
        inserted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      """,
      """
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
        issue_identifier TEXT NOT NULL,
        attempt INTEGER,
        status TEXT NOT NULL,
        outcome TEXT,
        worker_host TEXT,
        workspace_path TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        commit_hash_start TEXT,
        commit_hash_end TEXT,
        repo_start_json TEXT,
        repo_end_json TEXT,
        metadata_json TEXT,
        error_class TEXT,
        error_message TEXT,
        inserted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      """,
      """
      CREATE TABLE IF NOT EXISTS turns (
        turn_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        turn_sequence INTEGER NOT NULL,
        codex_thread_id TEXT,
        codex_turn_id TEXT,
        codex_session_id TEXT,
        prompt_text TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        tokens_json TEXT,
        metadata_json TEXT,
        inserted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
      """,
      """
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL REFERENCES turns(turn_id) ON DELETE CASCADE,
        run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
        event_sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload_json TEXT,
        payload_truncated INTEGER NOT NULL DEFAULT 0,
        payload_bytes INTEGER NOT NULL DEFAULT 0,
        summary TEXT,
        codex_thread_id TEXT,
        codex_turn_id TEXT,
        codex_session_id TEXT,
        inserted_at TEXT NOT NULL
      )
      """,
      "CREATE INDEX IF NOT EXISTS issues_latest_run_idx ON issues(latest_run_started_at DESC)",
      "CREATE INDEX IF NOT EXISTS runs_issue_started_idx ON runs(issue_identifier, started_at DESC)",
      "CREATE INDEX IF NOT EXISTS runs_problem_idx ON runs(outcome, ended_at DESC)",
      "CREATE INDEX IF NOT EXISTS turns_run_sequence_idx ON turns(run_id, turn_sequence ASC)",
      "CREATE INDEX IF NOT EXISTS events_turn_sequence_idx ON events(turn_id, event_sequence ASC)",
      "CREATE INDEX IF NOT EXISTS events_run_recorded_idx ON events(run_id, recorded_at ASC)"
    ]
  end

  defp upsert_issue_sql do
    """
    INSERT INTO issues (
      issue_id,
      issue_identifier,
      latest_run_started_at,
      inserted_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(issue_id) DO UPDATE SET
      issue_identifier = excluded.issue_identifier,
      latest_run_started_at = excluded.latest_run_started_at,
      updated_at = excluded.updated_at
    """
  end

  defp insert_run_sql do
    """
    INSERT INTO runs (
      run_id,
      issue_id,
      issue_identifier,
      attempt,
      status,
      worker_host,
      workspace_path,
      started_at,
      commit_hash_start,
      repo_start_json,
      metadata_json,
      inserted_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    """
  end

  defp insert_turn_sql do
    """
    INSERT INTO turns (
      turn_id,
      run_id,
      turn_sequence,
      codex_thread_id,
      codex_turn_id,
      codex_session_id,
      prompt_text,
      status,
      started_at,
      metadata_json,
      inserted_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    """
  end

  defp insert_event_sql do
    """
    INSERT INTO events (
      event_id,
      turn_id,
      run_id,
      event_sequence,
      event_type,
      recorded_at,
      payload_json,
      payload_truncated,
      payload_bytes,
      summary,
      codex_thread_id,
      codex_turn_id,
      codex_session_id,
      inserted_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    """
  end

  defp finalize_turn_sql do
    """
    UPDATE turns
    SET status = ?1,
        codex_thread_id = COALESCE(?2, codex_thread_id),
        codex_turn_id = COALESCE(?3, codex_turn_id),
        codex_session_id = COALESCE(?4, codex_session_id),
        ended_at = ?5,
        tokens_json = COALESCE(?6, tokens_json),
        metadata_json = COALESCE(?7, metadata_json),
        updated_at = ?8
    WHERE turn_id = ?9
    """
  end

  defp update_turn_sql do
    """
    UPDATE turns
    SET status = COALESCE(?1, status),
        started_at = COALESCE(?2, started_at),
        ended_at = COALESCE(?3, ended_at),
        codex_thread_id = COALESCE(?4, codex_thread_id),
        codex_turn_id = COALESCE(?5, codex_turn_id),
        codex_session_id = COALESCE(?6, codex_session_id),
        tokens_json = COALESCE(?7, tokens_json),
        metadata_json = COALESCE(?8, metadata_json),
        updated_at = ?9
    WHERE turn_id = ?10
    """
  end

  defp finalize_run_sql do
    """
    UPDATE runs
    SET status = ?1,
        outcome = ?2,
        ended_at = ?3,
        commit_hash_end = ?4,
        repo_end_json = ?5,
        metadata_json = COALESCE(?6, metadata_json),
        error_class = ?7,
        error_message = ?8,
        updated_at = ?9
    WHERE run_id = ?10
    """
  end

  defp update_run_sql do
    """
    UPDATE runs
    SET status = COALESCE(?1, status),
        outcome = COALESCE(?2, outcome),
        worker_host = COALESCE(?3, worker_host),
        workspace_path = COALESCE(?4, workspace_path),
        started_at = COALESCE(?5, started_at),
        ended_at = COALESCE(?6, ended_at),
        commit_hash_start = COALESCE(?7, commit_hash_start),
        commit_hash_end = COALESCE(?8, commit_hash_end),
        repo_start_json = COALESCE(?9, repo_start_json),
        repo_end_json = COALESCE(?10, repo_end_json),
        metadata_json = COALESCE(?11, metadata_json),
        error_class = COALESCE(?12, error_class),
        error_message = COALESCE(?13, error_message),
        updated_at = ?14
    WHERE run_id = ?15
    """
  end

  defp list_issues_sql do
    """
    SELECT i.issue_id,
           i.issue_identifier,
           i.latest_run_started_at,
           i.inserted_at,
           i.updated_at,
           (
             SELECT COUNT(*)
             FROM runs r
             WHERE r.issue_id = i.issue_id
           ) AS run_count,
           (
             SELECT r.run_id
             FROM runs r
             WHERE r.issue_id = i.issue_id
             ORDER BY r.started_at DESC
             LIMIT 1
           ) AS latest_run_id,
           (
             SELECT r.status
             FROM runs r
             WHERE r.issue_id = i.issue_id
             ORDER BY r.started_at DESC
             LIMIT 1
           ) AS latest_run_status,
           (
             SELECT r.outcome
             FROM runs r
             WHERE r.issue_id = i.issue_id
             ORDER BY r.started_at DESC
             LIMIT 1
           ) AS latest_run_outcome,
           (
             SELECT r.outcome
             FROM runs r
             WHERE r.issue_id = i.issue_id
               AND r.outcome IS NOT NULL
               AND r.outcome NOT IN ('completed', 'completed_turn_batch', 'merged', 'done')
             ORDER BY COALESCE(r.ended_at, r.started_at) DESC
             LIMIT 1
           ) AS latest_problem_outcome,
           (
             SELECT r.outcome
             FROM runs r
             WHERE r.issue_id = i.issue_id
               AND r.outcome IN ('completed', 'completed_turn_batch', 'merged', 'done')
             ORDER BY COALESCE(r.ended_at, r.started_at) DESC
             LIMIT 1
           ) AS last_completed_outcome
    FROM issues i
    ORDER BY i.latest_run_started_at DESC
    LIMIT ?1
    """
  end

  defp list_runs_for_issue_sql do
    """
    SELECT r.run_id, r.issue_id, r.issue_identifier, r.attempt, r.status, r.outcome, r.worker_host,
           r.workspace_path, r.started_at, r.ended_at, r.commit_hash_start, r.commit_hash_end,
           (
             SELECT COUNT(*)
             FROM turns t
             WHERE t.run_id = r.run_id
           ) AS turn_count,
           (
             SELECT COUNT(*)
             FROM events e
             WHERE e.run_id = r.run_id
           ) AS event_count,
           (
             SELECT e.event_type
             FROM events e
             WHERE e.run_id = r.run_id
             ORDER BY e.recorded_at DESC, e.event_sequence DESC
             LIMIT 1
           ) AS last_event_type,
           (
             SELECT e.recorded_at
             FROM events e
             WHERE e.run_id = r.run_id
             ORDER BY e.recorded_at DESC, e.event_sequence DESC
             LIMIT 1
           ) AS last_event_at
    FROM runs r
    WHERE r.issue_identifier = ?1
    ORDER BY r.started_at DESC
    LIMIT ?2
    """
  end

  defp list_problem_runs_sql do
    """
    SELECT r.run_id, r.issue_id, r.issue_identifier, r.attempt, r.status, r.outcome, r.worker_host,
           r.workspace_path, r.started_at, r.ended_at, r.commit_hash_start, r.commit_hash_end,
           (
             SELECT COUNT(*)
             FROM turns t
             WHERE t.run_id = r.run_id
           ) AS turn_count,
           (
             SELECT COUNT(*)
             FROM events e
             WHERE e.run_id = r.run_id
           ) AS event_count,
           (
             SELECT e.event_type
             FROM events e
             WHERE e.run_id = r.run_id
             ORDER BY e.recorded_at DESC, e.event_sequence DESC
             LIMIT 1
           ) AS last_event_type,
           (
             SELECT e.recorded_at
             FROM events e
             WHERE e.run_id = r.run_id
             ORDER BY e.recorded_at DESC, e.event_sequence DESC
             LIMIT 1
           ) AS last_event_at
    FROM runs r
    WHERE r.outcome IS NOT NULL
      AND r.outcome NOT IN ('completed', 'completed_turn_batch', 'merged', 'done')
      AND (?1 IS NULL OR r.outcome = ?1)
      AND (?2 IS NULL OR r.issue_identifier = ?2)
    ORDER BY COALESCE(r.ended_at, r.started_at) DESC
    LIMIT ?3
    """
  end

  defp fetch_issue_sql do
    """
    SELECT issue_id, issue_identifier, latest_run_started_at, inserted_at, updated_at
    FROM issues
    WHERE issue_id = ?1
    """
  end

  defp fetch_run_sql do
    """
    SELECT run_id, issue_id, issue_identifier, attempt, status, outcome, worker_host,
           workspace_path, started_at, ended_at, commit_hash_start, commit_hash_end,
           repo_start_json, repo_end_json, metadata_json, error_class, error_message,
           inserted_at, updated_at
    FROM runs
    WHERE run_id = ?1
    """
  end

  defp fetch_turns_sql do
    """
    SELECT turn_id, run_id, turn_sequence, codex_thread_id, codex_turn_id,
           codex_session_id, prompt_text, status, started_at, ended_at,
           tokens_json, metadata_json, inserted_at, updated_at
    FROM turns
    WHERE run_id = ?1
    ORDER BY turn_sequence ASC
    """
  end

  defp fetch_events_sql do
    """
    SELECT event_id, turn_id, run_id, event_sequence, event_type, recorded_at,
           payload_json, payload_truncated, payload_bytes, summary,
           codex_thread_id, codex_turn_id, codex_session_id, inserted_at
    FROM events
    WHERE turn_id = ?1
    ORDER BY event_sequence ASC
    """
  end

  defp next_turn_sequence_sql do
    "SELECT COALESCE(MAX(turn_sequence), 0) + 1 AS next_sequence FROM turns WHERE run_id = ?1"
  end

  defp next_event_sequence_sql do
    "SELECT COALESCE(MAX(event_sequence), 0) + 1 AS next_sequence FROM events WHERE turn_id = ?1"
  end

  defp refresh_issue_latest_run_sql do
    """
    SELECT issue_id, issue_identifier, started_at
    FROM runs
    WHERE run_id = ?1
    """
  end

  defp prune_runs_sql do
    "DELETE FROM runs WHERE started_at < ?1"
  end

  defp prune_orphan_issues_sql do
    "DELETE FROM issues WHERE issue_id NOT IN (SELECT DISTINCT issue_id FROM runs)"
  end
end
