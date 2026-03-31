defmodule SymphonyElixir.GitHub.ReviewPolicy do
  @moduledoc """
  Converts normalized GitHub events into accepted or ignored requeue signals.
  """

  alias SymphonyElixir.Config
  @rework_command_regex ~r/^\/rework(?:\s+(?<context>[\s\S]+))?$/u

  @spec signal(map()) :: {:ok, map()} | :ignore
  def signal(%{event: "pull_request_review", payload: payload}) when is_map(payload) do
    allowed_logins = Config.settings!().github.allowed_review_logins

    if String.downcase(Map.get(payload, :review_state, "")) == "changes_requested" and
         allowed_login?(Map.get(payload, :author_login), allowed_logins) do
      {:ok,
       %{
         kind: :changes_requested_review,
         issue_identifier: issue_identifier_from_branch(Map.get(payload, :head_ref)),
         head_sha: Map.get(payload, :head_sha),
         author_login: Map.get(payload, :author_login),
         pull_request_url: Map.get(payload, :pull_request_html_url),
         review_id: Map.get(payload, :review_id)
       }}
    else
      :ignore
    end
  end

  def signal(%{event: "issue_comment", repository: repository, payload: payload}) when is_map(payload) do
    allowed_logins = Config.settings!().github.allowed_rework_comment_logins

    case parse_rework_command(Map.get(payload, :comment_body)) do
      {:ok, operator_context} ->
        if allowed_login?(Map.get(payload, :author_login), allowed_logins) and
             is_binary(Map.get(payload, :pull_request_url)) do
          {:ok,
           %{
             kind: :manual_rework_comment,
             issue_identifier: nil,
             repository: repository,
             issue_number: Map.get(payload, :issue_number),
             pull_request_url: Map.get(payload, :pull_request_url),
             head_sha: nil,
             author_login: Map.get(payload, :author_login),
             comment_id: Map.get(payload, :comment_id),
             operator_context: operator_context
           }}
        else
          :ignore
        end

      _ ->
        :ignore
    end
  end

  def signal(_event), do: :ignore

  @spec issue_identifier_from_branch(String.t() | nil) :: String.t() | nil
  def issue_identifier_from_branch("symphony/" <> issue_identifier) when issue_identifier != "" do
    issue_identifier
  end

  def issue_identifier_from_branch(_branch_name), do: nil

  defp parse_rework_command(body) when is_binary(body) do
    case Regex.named_captures(@rework_command_regex, String.trim(body)) do
      nil ->
        :error

      captures ->
        {:ok, normalize_optional_string(Map.get(captures, "context"))}
    end
  end

  defp parse_rework_command(_body), do: :error

  defp normalize_optional_string(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_optional_string(_value), do: nil

  defp allowed_login?(login, allowed_logins) when is_binary(login) and is_list(allowed_logins) do
    Enum.any?(allowed_logins, &(&1 == login))
  end

  defp allowed_login?(_login, _allowed_logins), do: false
end
