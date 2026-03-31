defmodule SymphonyElixir.ForensicsReadModel do
  @moduledoc """
  Read-side projections for run journal data consumed by the API and LiveViews.
  """

  @success_outcomes MapSet.new(["completed", "completed_turn_batch", "merged", "done"])

  alias SymphonyElixir.RunJournal

  @spec issues(GenServer.server(), keyword()) :: {:ok, map()} | {:error, term()}
  def issues(journal \\ RunJournal, opts \\ []) do
    with {:ok, issues} <- RunJournal.list_issues(journal, opts),
         {:ok, problem_runs} <- RunJournal.list_problem_runs(journal, limit: Keyword.get(opts, :problem_limit, 20)) do
      {:ok,
       %{
         issues: Enum.map(issues, &enrich_issue_summary/1),
         problem_runs: Enum.map(problem_runs, &enrich_run_summary/1),
         problem_summary: problem_summary(problem_runs)
       }}
    end
  end

  @spec issue_detail(GenServer.server(), String.t(), keyword()) :: {:ok, map()} | {:error, :not_found | term()}
  def issue_detail(journal \\ RunJournal, issue_identifier, opts \\ []) when is_binary(issue_identifier) do
    with {:ok, runs} <- RunJournal.list_runs_for_issue(journal, issue_identifier, opts) do
      case runs do
        [] -> {:error, :not_found}
        _ -> {:ok, issue_detail_payload(issue_identifier, runs, opts)}
      end
    end
  end

  @spec run_detail(GenServer.server(), String.t()) :: {:ok, map()} | {:error, term()}
  def run_detail(journal \\ RunJournal, run_id) when is_binary(run_id) do
    with {:ok, payload} <- RunJournal.fetch_run_export(journal, run_id) do
      {:ok, enrich_run_detail(payload)}
    end
  end

  @spec problem_runs(GenServer.server(), keyword()) :: {:ok, map()} | {:error, term()}
  def problem_runs(journal \\ RunJournal, opts \\ []) do
    with {:ok, runs} <- RunJournal.list_problem_runs(journal, opts) do
      enriched_runs = Enum.map(runs, &enrich_run_summary/1)

      {:ok,
       %{
         problem_runs: enriched_runs,
         problem_summary: problem_summary(enriched_runs),
         filters: %{
           outcome: Keyword.get(opts, :outcome),
           issue_identifier: Keyword.get(opts, :issue_identifier),
           limit: Keyword.get(opts, :limit)
         }
       }}
    end
  end

  defp issue_detail_payload(issue_identifier, runs, opts) do
    enriched_runs = Enum.map(runs, &enrich_run_summary/1)
    latest_problem_outcome = Enum.find_value(enriched_runs, &problem_outcome/1)
    last_completed_outcome = Enum.find_value(enriched_runs, &completed_outcome/1)

    %{
      issue_identifier: issue_identifier,
      runs: enriched_runs,
      summary: %{
        run_count: length(enriched_runs),
        latest_problem_outcome: latest_problem_outcome,
        last_completed_outcome: last_completed_outcome
      },
      filters: %{
        limit: Keyword.get(opts, :limit)
      }
    }
  end

  defp enrich_run_detail(%{run: run, turns: turns} = payload) do
    enriched_turns = Enum.map(turns, &enrich_turn/1)

    total_event_count =
      enriched_turns
      |> Enum.reduce(0, fn turn, acc -> acc + length(turn.events) end)

    last_event =
      enriched_turns
      |> Enum.flat_map(& &1.events)
      |> Enum.sort_by(fn event -> {event.recorded_at || "", event.event_sequence || 0} end, :desc)
      |> List.first()

    Map.merge(payload, %{
      run:
        run
        |> enrich_run_summary()
        |> Map.merge(%{
          turn_count: length(enriched_turns),
          event_count: total_event_count,
          last_event_type: last_event && last_event.event_type,
          last_event_at: last_event && last_event.recorded_at
        }),
      turns: enriched_turns
    })
  end

  defp enrich_turn(turn) do
    Map.put(turn, :event_count, length(turn.events || []))
  end

  defp enrich_issue_summary(issue) do
    issue
  end

  defp enrich_run_summary(run) do
    Map.put(run, :duration_seconds, duration_seconds(run.started_at, run.ended_at))
  end

  defp duration_seconds(started_at, ended_at) when is_binary(started_at) do
    with {:ok, started, _} <- DateTime.from_iso8601(started_at),
         {:ok, ended, _} <- parse_end_time(ended_at) do
      max(0, DateTime.diff(ended, started, :second))
    else
      _ -> nil
    end
  end

  defp duration_seconds(_started_at, _ended_at), do: nil

  defp parse_end_time(nil), do: {:ok, DateTime.utc_now(), 0}
  defp parse_end_time(ended_at) when is_binary(ended_at), do: DateTime.from_iso8601(ended_at)
  defp parse_end_time(_ended_at), do: :error

  defp problem_summary(runs) when is_list(runs) do
    runs
    |> Enum.reduce(%{}, fn run, acc ->
      case run.outcome do
        outcome when is_binary(outcome) -> Map.update(acc, outcome, 1, &(&1 + 1))
        _ -> acc
      end
    end)
  end

  defp problem_outcome(run) do
    case run.outcome do
      outcome when is_binary(outcome) ->
        if MapSet.member?(@success_outcomes, outcome), do: nil, else: outcome

      _ ->
        nil
    end
  end

  defp completed_outcome(run) do
    case run.outcome do
      outcome when is_binary(outcome) ->
        if MapSet.member?(@success_outcomes, outcome), do: outcome, else: nil

      _ ->
        nil
    end
  end
end
