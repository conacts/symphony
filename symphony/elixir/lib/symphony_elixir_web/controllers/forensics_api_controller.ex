defmodule SymphonyElixirWeb.ForensicsApiController do
  @moduledoc """
  JSON API for historical issue/run forensics.
  """

  use Phoenix.Controller, formats: [:json]

  alias Plug.Conn
  alias SymphonyElixir.{ForensicsReadModel, RunJournal}
  alias SymphonyElixirWeb.Endpoint

  @spec issues(Conn.t(), map()) :: Conn.t()
  def issues(conn, params) do
    case ForensicsReadModel.issues(run_journal(), limit: parse_limit(params, 200)) do
      {:ok, payload} -> json(conn, payload)
      {:error, reason} -> error_response(conn, 503, "forensics_unavailable", inspect(reason))
    end
  end

  @spec issue_detail(Conn.t(), map()) :: Conn.t()
  def issue_detail(conn, %{"issue_identifier" => issue_identifier} = params) do
    case ForensicsReadModel.issue_detail(run_journal(), issue_identifier, limit: parse_limit(params, 200)) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :not_found} ->
        error_response(conn, 404, "issue_not_found", "Issue not found")

      {:error, reason} ->
        error_response(conn, 503, "forensics_unavailable", inspect(reason))
    end
  end

  @spec run_detail(Conn.t(), map()) :: Conn.t()
  def run_detail(conn, %{"run_id" => run_id}) do
    case ForensicsReadModel.run_detail(run_journal(), run_id) do
      {:ok, payload} ->
        json(conn, payload)

      {:error, :not_found} ->
        error_response(conn, 404, "run_not_found", "Run not found")

      {:error, reason} ->
        error_response(conn, 503, "forensics_unavailable", inspect(reason))
    end
  end

  @spec problem_runs(Conn.t(), map()) :: Conn.t()
  def problem_runs(conn, params) do
    case ForensicsReadModel.problem_runs(run_journal(),
           limit: parse_limit(params, 200),
           outcome: optional_param(params, "outcome"),
           issue_identifier: optional_param(params, "issue_identifier")
         ) do
      {:ok, payload} -> json(conn, payload)
      {:error, reason} -> error_response(conn, 503, "forensics_unavailable", inspect(reason))
    end
  end

  defp error_response(conn, status, code, message) do
    conn
    |> put_status(status)
    |> json(%{error: %{code: code, message: message}})
  end

  defp run_journal do
    Endpoint.config(:run_journal) || RunJournal
  end

  defp parse_limit(params, default) do
    case Map.get(params, "limit") do
      value when is_binary(value) ->
        case Integer.parse(value) do
          {limit, ""} when limit > 0 -> limit
          _ -> default
        end

      _ ->
        default
    end
  end

  defp optional_param(params, key) do
    case Map.get(params, key) do
      value when is_binary(value) ->
        case String.trim(value) do
          "" -> nil
          trimmed -> trimmed
        end

      _ ->
        nil
    end
  end
end
