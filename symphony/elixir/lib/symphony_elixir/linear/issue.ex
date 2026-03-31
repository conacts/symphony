defmodule SymphonyElixir.Linear.Issue do
  @moduledoc """
  Normalized Linear issue representation used by the orchestrator.
  """

  @symphony_disabled_label "symphony:disabled"
  @auto_rework_label "symphony:no-auto-rework"

  defstruct [
    :id,
    :identifier,
    :title,
    :description,
    :priority,
    :state,
    :branch_name,
    :url,
    :project_id,
    :project_name,
    :project_slug,
    :team_key,
    :assignee_id,
    blocked_by: [],
    labels: [],
    assigned_to_worker: true,
    created_at: nil,
    updated_at: nil
  ]

  @type t :: %__MODULE__{
          id: String.t() | nil,
          identifier: String.t() | nil,
          title: String.t() | nil,
          description: String.t() | nil,
          priority: integer() | nil,
          state: String.t() | nil,
          branch_name: String.t() | nil,
          url: String.t() | nil,
          project_id: String.t() | nil,
          project_name: String.t() | nil,
          project_slug: String.t() | nil,
          team_key: String.t() | nil,
          assignee_id: String.t() | nil,
          labels: [String.t()],
          assigned_to_worker: boolean(),
          created_at: DateTime.t() | nil,
          updated_at: DateTime.t() | nil
        }

  @spec label_names(t()) :: [String.t()]
  def label_names(%__MODULE__{labels: labels}) do
    labels
  end

  @spec has_label?(t(), String.t()) :: boolean()
  def has_label?(%__MODULE__{} = issue, label) when is_binary(label) do
    normalized_label = normalize_label(label)

    issue
    |> label_names()
    |> Enum.any?(fn issue_label -> normalize_label(issue_label) == normalized_label end)
  end

  @spec workflow_disabled?(t()) :: boolean()
  def workflow_disabled?(%__MODULE__{} = issue) do
    has_label?(issue, @symphony_disabled_label)
  end

  @spec auto_rework_disabled?(t()) :: boolean()
  def auto_rework_disabled?(%__MODULE__{} = issue) do
    has_label?(issue, @auto_rework_label)
  end

  @spec project_assigned?(t()) :: boolean()
  def project_assigned?(%__MODULE__{project_id: project_id}) when is_binary(project_id) do
    String.trim(project_id) != ""
  end

  def project_assigned?(_issue), do: false

  defp normalize_label(label) when is_binary(label) do
    label
    |> String.trim()
    |> String.downcase()
  end
end
