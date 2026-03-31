defmodule SymphonyElixir.Config do
  @moduledoc """
  Runtime configuration loaded from `WORKFLOW.md`.
  """

  alias SymphonyElixir.Config.Schema
  alias SymphonyElixir.Linear.Issue
  alias SymphonyElixir.Workflow

  @default_codex_model "gpt-5.4"
  @default_codex_reasoning_effort "xhigh"
  @supported_codex_models ["gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex-spark"]
  @supported_codex_reasoning_efforts ["low", "medium", "high", "xhigh"]
  @codex_model_label_prefix "symphony:model:"
  @codex_reasoning_label_prefix "symphony:reasoning:"

  @default_prompt_template """
  You are working on a Linear issue.

  Identifier: {{ issue.identifier }}
  Title: {{ issue.title }}

  Body:
  {% if issue.description %}
  {{ issue.description }}
  {% else %}
  No description provided.
  {% endif %}
  """

  @type codex_runtime_settings :: %{
          command: String.t(),
          model: String.t(),
          reasoning_effort: String.t(),
          approval_policy: String.t() | map(),
          thread_sandbox: String.t(),
          turn_sandbox_policy: map()
        }

  @spec settings() :: {:ok, Schema.t()} | {:error, term()}
  def settings do
    case Workflow.current() do
      {:ok, %{config: config}} when is_map(config) ->
        Schema.parse(config)

      {:error, reason} ->
        {:error, reason}
    end
  end

  @spec settings!() :: Schema.t()
  def settings! do
    case settings() do
      {:ok, settings} ->
        settings

      {:error, reason} ->
        raise ArgumentError, message: format_config_error(reason)
    end
  end

  @spec max_concurrent_agents_for_state(term()) :: pos_integer()
  def max_concurrent_agents_for_state(state_name) when is_binary(state_name) do
    config = settings!()

    Map.get(
      config.agent.max_concurrent_agents_by_state,
      Schema.normalize_issue_state(state_name),
      config.agent.max_concurrent_agents
    )
  end

  def max_concurrent_agents_for_state(_state_name), do: settings!().agent.max_concurrent_agents

  @spec linear_scope() :: {:project, String.t()} | {:team, String.t()} | :missing
  def linear_scope do
    linear_scope(settings!())
  end

  @spec linear_scope(Schema.t() | map()) :: {:project, String.t()} | {:team, String.t()} | :missing
  def linear_scope(%Schema{} = settings), do: linear_scope(settings.tracker)

  def linear_scope(%{project_slug: _project_slug, team_key: _team_key} = tracker) do
    cond do
      present_string?(tracker.team_key) ->
        {:team, tracker.team_key}

      present_string?(tracker.project_slug) ->
        {:project, tracker.project_slug}

      true ->
        :missing
    end
  end

  def linear_scope(_tracker), do: :missing

  @spec linear_issue_in_scope?(Issue.t()) :: boolean()
  def linear_issue_in_scope?(%Issue{} = issue) do
    linear_issue_in_scope?(settings!().tracker, issue)
  end

  @spec linear_issue_in_scope?(map(), Issue.t()) :: boolean()
  def linear_issue_in_scope?(%{kind: kind}, %Issue{} = issue)
      when kind not in ["linear"] do
    !Issue.workflow_disabled?(issue)
  end

  def linear_issue_in_scope?(%{excluded_project_ids: excluded_project_ids} = tracker, %Issue{} = issue) do
    cond do
      Issue.workflow_disabled?(issue) ->
        false

      present_string?(tracker.team_key) ->
        issue.team_key == tracker.team_key and
          Issue.project_assigned?(issue) and
          not MapSet.member?(MapSet.new(excluded_project_ids), issue.project_id)

      present_string?(tracker.project_slug) ->
        issue.project_slug == tracker.project_slug

      true ->
        false
    end
  end

  def linear_issue_in_scope?(_tracker, _issue), do: false

  @spec codex_turn_sandbox_policy(Path.t() | nil) :: map()
  def codex_turn_sandbox_policy(workspace \\ nil) do
    case Schema.resolve_runtime_turn_sandbox_policy(settings!(), workspace) do
      {:ok, policy} ->
        policy

      {:error, reason} ->
        raise ArgumentError, message: "Invalid codex turn sandbox policy: #{inspect(reason)}"
    end
  end

  @spec workflow_prompt() :: String.t()
  def workflow_prompt do
    case Workflow.current() do
      {:ok, %{prompt_template: prompt}} ->
        if String.trim(prompt) == "", do: @default_prompt_template, else: prompt

      _ ->
        @default_prompt_template
    end
  end

  @spec server_port() :: non_neg_integer() | nil
  def server_port do
    case Application.get_env(:symphony_elixir, :server_port_override) do
      port when is_integer(port) and port >= 0 -> port
      _ -> settings!().server.port
    end
  end

  @spec validate!() :: :ok | {:error, term()}
  def validate! do
    with {:ok, settings} <- settings() do
      validate_semantics(settings)
    end
  end

  @spec codex_runtime_settings(Path.t() | nil, keyword()) ::
          {:ok, codex_runtime_settings()} | {:error, term()}
  def codex_runtime_settings(workspace \\ nil, opts \\ []) do
    with {:ok, settings} <- settings() do
      with {:ok, turn_sandbox_policy} <-
             Schema.resolve_runtime_turn_sandbox_policy(settings, workspace, opts),
           {:ok, launch_settings} <-
             resolve_codex_launch_settings(settings.codex.command, Keyword.get(opts, :issue)) do
        {:ok,
         %{
           command: launch_settings.command,
           model: launch_settings.model,
           reasoning_effort: launch_settings.reasoning_effort,
           approval_policy: settings.codex.approval_policy,
           thread_sandbox: settings.codex.thread_sandbox,
           turn_sandbox_policy: turn_sandbox_policy
         }}
      end
    end
  end

  defp validate_semantics(settings) do
    cond do
      is_nil(settings.tracker.kind) ->
        {:error, :missing_tracker_kind}

      settings.tracker.kind not in ["linear", "memory"] ->
        {:error, {:unsupported_tracker_kind, settings.tracker.kind}}

      settings.tracker.kind == "linear" and not is_binary(settings.tracker.api_key) ->
        {:error, :missing_linear_api_token}

      settings.tracker.kind == "linear" and linear_scope_conflict?(settings.tracker) ->
        {:error, {:invalid_workflow_config, "set either tracker.project_slug or tracker.team_key for Linear scope, not both"}}

      settings.tracker.kind == "linear" and linear_scope(settings) == :missing ->
        {:error, :missing_linear_tracker_scope}

      settings.tracker.kind == "linear" and
        present_string?(settings.tracker.project_slug) and
          settings.tracker.excluded_project_ids != [] ->
        {:error, {:invalid_workflow_config, "tracker.excluded_project_ids requires tracker.team_key and must not be used with tracker.project_slug"}}

      true ->
        validate_claim_transition_settings(settings)
    end
  end

  defp validate_claim_transition_settings(settings) do
    cond do
      is_nil(settings.tracker.claim_transition_to_state) and
          settings.tracker.claim_transition_from_states != [] ->
        {:error, {:invalid_workflow_config, "tracker.claim_transition_to_state is required when tracker.claim_transition_from_states is set"}}

      startup_failure_transition_is_dispatchable?(settings) ->
        {:error, {:invalid_workflow_config, "tracker.startup_failure_transition_to_state must not be one of tracker.dispatchable_states"}}

      true ->
        :ok
    end
  end

  defp startup_failure_transition_is_dispatchable?(settings) do
    case normalize_transition_state(settings.tracker.startup_failure_transition_to_state) do
      nil ->
        false

      target_state ->
        target_state_normalized = normalize_issue_state(target_state)

        settings.tracker.dispatchable_states
        |> Enum.any?(fn active_state ->
          normalize_issue_state(active_state) == target_state_normalized
        end)
    end
  end

  defp normalize_transition_state(state_name) when is_binary(state_name) do
    trimmed = String.trim(state_name)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_transition_state(_state_name), do: nil

  defp normalize_issue_state(state_name) when is_binary(state_name) do
    state_name
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_issue_state(_state_name), do: ""

  defp format_config_error(reason) do
    case reason do
      {:invalid_workflow_config, message} ->
        "Invalid WORKFLOW.md config: #{message}"

      {:missing_workflow_file, path, raw_reason} ->
        "Missing WORKFLOW.md at #{path}: #{inspect(raw_reason)}"

      {:workflow_parse_error, raw_reason} ->
        "Failed to parse WORKFLOW.md: #{inspect(raw_reason)}"

      :workflow_front_matter_not_a_map ->
        "Failed to parse WORKFLOW.md: workflow front matter must decode to a map"

      :missing_linear_tracker_scope ->
        "Invalid WORKFLOW.md config: tracker.project_slug or tracker.team_key is required for Linear workflows"

      other ->
        "Invalid WORKFLOW.md config: #{inspect(other)}"
    end
  end

  defp linear_scope_conflict?(tracker) do
    present_string?(tracker.project_slug) and present_string?(tracker.team_key)
  end

  defp present_string?(value) when is_binary(value) do
    String.trim(value) != ""
  end

  defp present_string?(_value), do: false

  defp resolve_codex_launch_settings(base_command, issue) when is_binary(base_command) do
    with {:ok, model} <- select_codex_model(issue),
         {:ok, reasoning_effort} <- select_codex_reasoning_effort(issue),
         {:ok, command} <- inject_codex_launch_overrides(base_command, model, reasoning_effort) do
      {:ok,
       %{
         command: command,
         model: model,
         reasoning_effort: reasoning_effort
       }}
    end
  end

  defp select_codex_model(issue) do
    select_codex_issue_override(
      issue,
      @codex_model_label_prefix,
      @supported_codex_models,
      @default_codex_model,
      :model
    )
  end

  defp select_codex_reasoning_effort(issue) do
    select_codex_issue_override(
      issue,
      @codex_reasoning_label_prefix,
      @supported_codex_reasoning_efforts,
      @default_codex_reasoning_effort,
      :reasoning_effort
    )
  end

  defp select_codex_issue_override(issue, prefix, supported_values, default_value, kind) do
    values =
      issue
      |> issue_labels()
      |> Enum.map(&normalize_codex_label/1)
      |> Enum.filter(&String.starts_with?(&1, prefix))
      |> Enum.map(&String.trim_leading(&1, prefix))
      |> Enum.map(&normalize_codex_label_value/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.uniq()
      |> Enum.sort()

    case values do
      [] ->
        {:ok, default_value}

      [value] ->
        if value in supported_values do
          {:ok, value}
        else
          {:error, {:invalid_issue_label_override, kind, {:unsupported, value, supported_values}}}
        end

      conflicting_values ->
        {:error, {:invalid_issue_label_override, kind, {:conflicting, conflicting_values}}}
    end
  end

  defp issue_labels(%{labels: labels}) when is_list(labels), do: labels
  defp issue_labels(_issue), do: []

  defp normalize_codex_label(label) when is_binary(label) do
    label
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_codex_label_value(value) when is_binary(value) do
    value
    |> normalize_codex_label()
    |> String.replace(~r/\s+/, "-")
  end

  defp inject_codex_launch_overrides(base_command, model, reasoning_effort) do
    cleaned_command =
      base_command
      |> strip_codex_model_overrides()
      |> strip_codex_reasoning_overrides()
      |> String.trim()

    case Regex.run(~r/(?:^|\s)(app-server)(?=\s|$)/, cleaned_command, return: :index, capture: :all_but_first) do
      [{index, _length}] ->
        {before_app_server, app_server_and_after} = String.split_at(cleaned_command, index)

        command_parts =
          [
            String.trim_trailing(before_app_server),
            "--model #{model}",
            "--config model_reasoning_effort=#{reasoning_effort}",
            String.trim_leading(app_server_and_after)
          ]
          |> Enum.reject(&(&1 == ""))

        {:ok, Enum.join(command_parts, " ")}

      nil ->
        {:error, {:invalid_codex_command, :missing_app_server, base_command}}
    end
  end

  defp strip_codex_model_overrides(command) when is_binary(command) do
    Regex.replace(~r/\s+(?:--model|-m)\s+\S+/, command, "")
  end

  defp strip_codex_reasoning_overrides(command) when is_binary(command) do
    Regex.replace(
      ~r/\s+(?:--config|-c)\s+(?:["'])?model_reasoning_effort=[^"'\s]+(?:["'])?/,
      command,
      ""
    )
  end
end
