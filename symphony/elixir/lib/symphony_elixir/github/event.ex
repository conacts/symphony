defmodule SymphonyElixir.GitHub.Event do
  @moduledoc """
  Minimal GitHub webhook event helpers for boundary validation and durable ingress.
  """

  @supported_events MapSet.new(["issue_comment", "ping", "pull_request_review"])

  @spec supported?(binary()) :: boolean()
  def supported?(event) when is_binary(event), do: MapSet.member?(@supported_events, event)
  def supported?(_event), do: false

  @spec repository_full_name(map()) :: String.t() | nil
  def repository_full_name(%{"repository" => %{"full_name" => full_name}}) when is_binary(full_name),
    do: full_name

  def repository_full_name(_payload), do: nil

  @spec normalize(binary(), binary(), map()) :: {:ok, map()} | {:error, atom()}
  def normalize(event, delivery_id, payload)
      when is_binary(event) and is_binary(delivery_id) and is_map(payload) do
    repository = repository_full_name(payload)
    action = normalize_optional_string(Map.get(payload, "action"))

    with repository when is_binary(repository) <- repository || {:error, :missing_repository} do
      case event do
        "ping" ->
          {:ok,
           %{
             delivery_id: delivery_id,
             event: event,
             action: action,
             repository: repository,
             semantic_key: nil,
             payload: %{
               zen: normalize_optional_string(Map.get(payload, "zen")),
               hook_id: Map.get(payload, "hook_id")
             }
           }}

        "pull_request_review" ->
          normalize_pull_request_review(delivery_id, event, repository, action, payload)

        "issue_comment" ->
          normalize_issue_comment(delivery_id, event, repository, action, payload)

        _ ->
          {:error, :unsupported_event}
      end
    end
  end

  def normalize(_event, _delivery_id, _payload), do: {:error, :invalid_payload}

  defp normalize_pull_request_review(delivery_id, event, repository, action, payload) do
    with %{"number" => pr_number, "head" => %{"sha" => head_sha}} when is_integer(pr_number) and is_binary(head_sha) <-
           Map.get(payload, "pull_request") || {:error, :invalid_payload},
         %{"id" => review_id, "state" => review_state} when is_integer(review_id) and is_binary(review_state) <-
           Map.get(payload, "review") || {:error, :invalid_payload} do
      author_login = get_in(payload, ["review", "user", "login"]) |> normalize_optional_string()
      head_ref = get_in(payload, ["pull_request", "head", "ref"]) |> normalize_optional_string()
      pull_request_url = get_in(payload, ["pull_request", "url"]) |> normalize_optional_string()
      pull_request_html_url = get_in(payload, ["pull_request", "html_url"]) |> normalize_optional_string()

      {:ok,
       %{
         delivery_id: delivery_id,
         event: event,
         action: action,
         repository: repository,
         semantic_key: "pull_request_review:#{pr_number}:#{head_sha}:#{review_id}:#{String.downcase(review_state)}",
         payload: %{
           pull_request_number: pr_number,
           head_sha: head_sha,
           head_ref: head_ref,
           review_id: review_id,
           review_state: review_state,
           author_login: author_login,
           pull_request_url: pull_request_url,
           pull_request_html_url: pull_request_html_url
         }
       }}
    else
      {:error, reason} -> {:error, reason}
      _ -> {:error, :invalid_payload}
    end
  end

  defp normalize_issue_comment(delivery_id, event, repository, action, payload) do
    with %{"number" => issue_number} when is_integer(issue_number) <-
           Map.get(payload, "issue") || {:error, :invalid_payload},
         %{"id" => comment_id, "body" => body} when is_integer(comment_id) and is_binary(body) <-
           Map.get(payload, "comment") || {:error, :invalid_payload} do
      author_login = get_in(payload, ["comment", "user", "login"]) |> normalize_optional_string()
      pull_request_url = get_in(payload, ["issue", "pull_request", "url"]) |> normalize_optional_string()

      {:ok,
       %{
         delivery_id: delivery_id,
         event: event,
         action: action,
         repository: repository,
         semantic_key: "issue_comment:#{issue_number}:#{comment_id}:#{action || "none"}",
         payload: %{
           issue_number: issue_number,
           comment_id: comment_id,
           comment_body: body,
           author_login: author_login,
           pull_request_url: pull_request_url
         }
       }}
    else
      {:error, reason} -> {:error, reason}
      _ -> {:error, :invalid_payload}
    end
  end

  defp normalize_optional_string(value) when is_binary(value) do
    trimmed = String.trim(value)
    if trimmed == "", do: nil, else: trimmed
  end

  defp normalize_optional_string(_value), do: nil
end
