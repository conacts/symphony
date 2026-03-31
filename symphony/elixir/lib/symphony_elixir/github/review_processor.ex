defmodule SymphonyElixir.GitHub.ReviewProcessor do
  @moduledoc """
  Converts accepted GitHub review signals into Linear requeue transitions.
  """

  require Logger

  alias SymphonyElixir.{Config, TaskSupervisor, Tracker}
  alias SymphonyElixir.GitHub.{Client, ReviewPolicy}
  alias SymphonyElixir.Linear.Issue

  @target_state "Rework"
  @expected_source_state "In Review"
  @workflow_disabled_label "symphony:disabled"
  @no_auto_rework_label "symphony:no-auto-rework"

  @spec enqueue(map()) :: :ok | {:error, term()}
  def enqueue(%{} = event) do
    case Task.Supervisor.start_child(TaskSupervisor, fn -> process(event) end) do
      {:ok, _pid} ->
        :ok

      {:error, reason} ->
        Logger.error(
          "GitHub review processor enqueue failed event=#{Map.get(event, :event) || "unknown"} action=#{Map.get(event, :action) || "none"} delivery=#{Map.get(event, :delivery_id) || "unknown"} reason=#{inspect(reason)}"
        )

        {:error, reason}
    end
  end

  @spec process(map()) :: :ok
  def process(%{} = event) do
    case ReviewPolicy.signal(event) do
      {:ok, signal} ->
        Logger.info("GitHub review signal accepted kind=#{signal_kind(signal)} actor=#{Map.get(signal, :author_login) || "unknown"}")

        do_process(signal)

      :ignore ->
        :ok
    end
  rescue
    error ->
      Logger.error("GitHub review processing failed: #{Exception.message(error)}")
      :ok
  end

  defp do_process(%{issue_identifier: issue_identifier} = signal) when is_binary(issue_identifier) do
    case Tracker.fetch_issue_by_identifier(issue_identifier) do
      {:ok, %Issue{} = issue} ->
        _ = requeue_issue(issue, signal)
        :ok

      {:ok, nil} ->
        Logger.warning("GitHub review requeue skipped: issue not found issue_identifier=#{issue_identifier}")
        :ok

      {:error, reason} ->
        Logger.error("GitHub review requeue failed: issue lookup error issue_identifier=#{issue_identifier} reason=#{inspect(reason)}")

        :ok
    end
  end

  defp do_process(%{kind: :manual_rework_comment, pull_request_url: pull_request_url} = signal)
       when is_binary(pull_request_url) do
    case github_client_module().fetch_pull_request(pull_request_url) do
      {:ok, pull_request} ->
        issue_identifier =
          ReviewPolicy.issue_identifier_from_branch(get_in(pull_request, ["head", "ref"]))

        if is_binary(issue_identifier) do
          resolved_signal =
            Map.merge(signal, %{
              issue_identifier: issue_identifier,
              pull_request_url: get_in(pull_request, ["html_url"])
            })

          case Tracker.fetch_issue_by_identifier(issue_identifier) do
            {:ok, %Issue{} = issue} ->
              case issue.state do
                @expected_source_state ->
                  case requeue_issue(issue, resolved_signal) do
                    :ok ->
                      best_effort_issue_comment(resolved_signal, queued_comment_body())
                      :ok

                    _other ->
                      :ok
                  end

                state ->
                  Logger.info("GitHub review requeue skipped: issue not parked in review issue_identifier=#{issue_identifier} current_state=#{inspect(state)}")

                  best_effort_issue_comment(resolved_signal, not_in_review_comment_body(state))
                  :ok
              end

            {:ok, nil} ->
              Logger.warning("GitHub review requeue skipped: issue not found after PR resolution issue_identifier=#{issue_identifier}")

              :ok

            {:error, reason} ->
              Logger.error("GitHub review requeue failed: issue lookup error after PR resolution issue_identifier=#{issue_identifier} reason=#{inspect(reason)}")

              :ok
          end
        else
          Logger.warning("GitHub review requeue skipped: PR branch did not map to a Symphony issue branch=#{inspect(get_in(pull_request, ["head", "ref"]))}")

          :ok
        end

      {:error, reason} ->
        Logger.error("GitHub review requeue failed: pull request fetch error pull_request_url=#{pull_request_url} reason=#{inspect(reason)}")

        :ok
    end
  end

  defp do_process(_signal), do: :ok

  defp github_client_module do
    Application.get_env(:symphony_elixir, :github_client_module, Client)
  end

  defp best_effort_issue_comment(%{repository: repo, issue_number: issue_number}, body)
       when is_binary(repo) and is_integer(issue_number) and is_binary(body) do
    _ = github_client_module().create_issue_comment(repo, issue_number, body)
    :ok
  end

  defp best_effort_issue_comment(_signal, _body), do: :ok

  defp requeue_issue(%Issue{} = issue, signal) do
    case issue.state do
      @expected_source_state ->
        cond do
          Issue.workflow_disabled?(issue) ->
            Logger.info("GitHub review requeue skipped: issue disabled from Symphony issue_identifier=#{issue.identifier} label=#{@workflow_disabled_label}")

            :skipped

          not Config.linear_issue_in_scope?(issue) ->
            Logger.info("GitHub review requeue skipped: issue outside configured Symphony scope issue_identifier=#{issue.identifier}")

            :skipped

          auto_requeue_disabled?(issue, signal) ->
            Logger.info("GitHub review requeue skipped: issue opted out of automatic requeue issue_identifier=#{issue.identifier} label=#{@no_auto_rework_label}")

            :skipped

          true ->
            case Tracker.update_issue_state(issue.id, @target_state) do
              :ok ->
                case Tracker.create_comment(issue.id, auto_requeue_comment_body(issue, signal)) do
                  :ok ->
                    Logger.info("GitHub review requeue succeeded issue_identifier=#{issue.identifier} from_state=#{issue.state} to_state=#{@target_state}")

                    :ok

                  {:error, reason} ->
                    Logger.error("GitHub review requeue partially failed: state updated but comment create failed issue_identifier=#{issue.identifier} reason=#{inspect(reason)}")

                    :ok
                end

              {:error, reason} ->
                Logger.error("GitHub review requeue failed: state update error issue_identifier=#{issue.identifier} target_state=#{@target_state} reason=#{inspect(reason)}")

                {:error, {:state_update_failed, reason}}
            end
        end

      state ->
        Logger.info("GitHub review requeue skipped: issue not parked in review issue_identifier=#{issue.identifier} current_state=#{inspect(state)}")

        :skipped
    end
  end

  defp auto_requeue_disabled?(%Issue{}, %{kind: :manual_rework_comment}), do: false

  defp auto_requeue_disabled?(%Issue{} = issue, _signal) do
    Issue.auto_rework_disabled?(issue)
  end

  defp auto_requeue_comment_body(%Issue{} = issue, signal) do
    base_lines = [
      "Symphony status update.",
      "",
      "State: `#{@target_state}`",
      "What changed: GitHub review automation moved the ticket from `#{issue.state}` to `#{@target_state}`.",
      "Signal: #{signal_label(signal)}",
      "PR: #{Map.get(signal, :pull_request_url) || "unknown"}",
      "Head SHA: #{Map.get(signal, :head_sha) || "unknown"}",
      "Actor: #{Map.get(signal, :author_login) || "unknown"}"
    ]

    (base_lines ++ operator_context_lines(signal))
    |> Enum.join("\n")
  end

  defp signal_label(%{kind: :changes_requested_review}), do: "`changes_requested` review"
  defp signal_label(%{kind: :manual_rework_comment}), do: "`/rework` comment"
  defp signal_label(_signal), do: "review signal"

  defp signal_kind(%{kind: kind}) when is_atom(kind), do: Atom.to_string(kind)
  defp signal_kind(_signal), do: "unknown"

  defp operator_context_lines(%{operator_context: context}) when is_binary(context) and context != "" do
    ["", "Operator context:", context]
  end

  defp operator_context_lines(_signal), do: []

  defp queued_comment_body, do: "Queued rework via Symphony."

  defp not_in_review_comment_body(state) do
    current_state = if is_binary(state) and state != "", do: state, else: "unknown"
    "No action taken: matching Linear issue is not currently in `In Review` (current state: `#{current_state}`)."
  end
end
