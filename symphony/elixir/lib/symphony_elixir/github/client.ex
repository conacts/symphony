defmodule SymphonyElixir.GitHub.Client do
  @moduledoc """
  Minimal GitHub REST client for PR context reads needed by the review processor.
  """

  alias SymphonyElixir.Config

  @spec fetch_pull_request(String.t()) :: {:ok, map()} | {:error, term()}
  def fetch_pull_request(pull_request_url) when is_binary(pull_request_url) do
    token = Config.settings!().github.api_token

    cond do
      String.trim(pull_request_url) == "" ->
        {:error, :invalid_pull_request_url}

      not is_binary(token) or token == "" ->
        {:error, :missing_github_api_token}

      true ->
        case Req.get(pull_request_url, headers: request_headers(token), connect_options: [timeout: 30_000]) do
          {:ok, %{status: 200, body: body}} when is_map(body) ->
            {:ok, body}

          {:ok, %{status: status}} ->
            {:error, {:github_api_status, status}}

          {:error, reason} ->
            {:error, {:github_api_request, reason}}
        end
    end
  end

  def fetch_pull_request(_pull_request_url), do: {:error, :invalid_pull_request_url}

  @spec create_issue_comment(String.t(), integer(), String.t()) :: :ok | {:error, term()}
  def create_issue_comment(repo, issue_number, body)
      when is_binary(repo) and is_integer(issue_number) and is_binary(body) do
    token = Config.settings!().github.api_token

    cond do
      String.trim(repo) == "" ->
        {:error, :invalid_repo}

      issue_number <= 0 ->
        {:error, :invalid_issue_number}

      String.trim(body) == "" ->
        {:error, :invalid_comment_body}

      not is_binary(token) or token == "" ->
        {:error, :missing_github_api_token}

      true ->
        issue_comment_url = "https://api.github.com/repos/#{repo}/issues/#{issue_number}/comments"

        case Req.post(issue_comment_url,
               headers: request_headers(token),
               json: %{body: body},
               connect_options: [timeout: 30_000]
             ) do
          {:ok, %{status: status}} when status in [200, 201] ->
            :ok

          {:ok, %{status: status}} ->
            {:error, {:github_api_status, status}}

          {:error, reason} ->
            {:error, {:github_api_request, reason}}
        end
    end
  end

  def create_issue_comment(_repo, _issue_number, _body), do: {:error, :invalid_issue_comment_request}

  defp request_headers(token) do
    [
      {"Authorization", "Bearer " <> token},
      {"Accept", "application/vnd.github+json"},
      {"X-GitHub-Api-Version", "2022-11-28"}
    ]
  end
end
