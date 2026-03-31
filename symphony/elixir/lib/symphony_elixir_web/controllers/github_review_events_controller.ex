defmodule SymphonyElixirWeb.GitHubReviewEventsController do
  @moduledoc """
  Boundary controller for GitHub review webhook ingress.
  """

  use Phoenix.Controller, formats: [:json]
  require Logger

  alias Plug.Conn
  alias SymphonyElixir.Config
  alias SymphonyElixir.GitHub.{Event, EventJournal, ReviewProcessor, Signature}

  @spec create(Conn.t(), map()) :: Conn.t()
  def create(conn, _params) do
    with {:ok, github} <- github_settings(),
         :ok <- validate_signature(conn, github.webhook_secret),
         {:ok, delivery} <- fetch_header(conn, "x-github-delivery", :missing_delivery),
         {:ok, event} <- fetch_header(conn, "x-github-event", :missing_event),
         true <- Event.supported?(event) || {:error, :unsupported_event},
         {:ok, normalized_event} <- Event.normalize(event, delivery, conn.body_params),
         repository when is_binary(repository) <-
           Map.get(normalized_event, :repository) || {:error, :missing_repository},
         true <- repository == github.repo || {:error, :repository_not_allowed},
         {:ok, status, _event} <- EventJournal.record_inbound(normalized_event) do
      if status == :recorded do
        case ReviewProcessor.enqueue(normalized_event) do
          :ok ->
            :ok

          {:error, reason} ->
            Logger.error("GitHub webhook enqueue failed delivery=#{delivery} event=#{event} action=#{Map.get(normalized_event, :action) || "none"} repository=#{repository} reason=#{inspect(reason)}")
        end
      end

      log_ingress_result(delivery, normalized_event, status)

      conn
      |> put_status(202)
      |> json(response_body(delivery, normalized_event, status))
    else
      {:error, reason} ->
        log_rejection(conn, reason)
        error_response(conn, reason)
    end
  end

  defp github_settings do
    github = Config.settings!().github

    cond do
      not is_binary(github.repo) or github.repo == "" ->
        {:error, :github_not_configured}

      not is_binary(github.webhook_secret) or github.webhook_secret == "" ->
        {:error, :github_not_configured}

      true ->
        {:ok, github}
    end
  rescue
    ArgumentError ->
      {:error, :github_not_configured}
  end

  defp validate_signature(conn, secret) when is_binary(secret) do
    raw_body = conn.private[:raw_body] || ""
    signature = header_value(conn, "x-hub-signature-256")

    if Signature.valid?(raw_body, signature, secret) do
      :ok
    else
      {:error, :invalid_signature}
    end
  end

  defp fetch_header(conn, header_name, error_reason) do
    case header_value(conn, header_name) do
      value when is_binary(value) and value != "" -> {:ok, value}
      _ -> {:error, error_reason}
    end
  end

  defp header_value(conn, header_name) do
    case Conn.get_req_header(conn, header_name) do
      [value | _rest] -> value
      [] -> nil
    end
  end

  defp error_response(conn, :github_not_configured) do
    conn
    |> put_status(503)
    |> json(%{error: %{code: "github_not_configured", message: "GitHub webhook ingress is not configured."}})
  end

  defp error_response(conn, :invalid_signature) do
    conn
    |> put_status(401)
    |> json(%{error: %{code: "invalid_signature", message: "GitHub webhook signature validation failed."}})
  end

  defp error_response(conn, :missing_delivery) do
    conn
    |> put_status(400)
    |> json(%{error: %{code: "missing_delivery", message: "GitHub webhook delivery header is required."}})
  end

  defp error_response(conn, :missing_event) do
    conn
    |> put_status(400)
    |> json(%{error: %{code: "missing_event", message: "GitHub webhook event header is required."}})
  end

  defp error_response(conn, :missing_repository) do
    conn
    |> put_status(400)
    |> json(%{error: %{code: "missing_repository", message: "GitHub webhook repository payload is required."}})
  end

  defp error_response(conn, :repository_not_allowed) do
    conn
    |> put_status(403)
    |> json(%{error: %{code: "repository_not_allowed", message: "GitHub webhook repository is not allowed."}})
  end

  defp error_response(conn, :unsupported_event) do
    conn
    |> put_status(422)
    |> json(%{error: %{code: "unsupported_event", message: "GitHub webhook event is not supported."}})
  end

  defp error_response(conn, :invalid_payload) do
    conn
    |> put_status(422)
    |> json(%{error: %{code: "invalid_payload", message: "GitHub webhook payload is not valid for this event type."}})
  end

  defp error_response(conn, _reason) do
    conn
    |> put_status(500)
    |> json(%{error: %{code: "request_failed", message: "GitHub webhook request failed."}})
  end

  defp log_ingress_result(delivery, normalized_event, status) do
    duplicate =
      case status do
        :duplicate_delivery -> "delivery"
        :duplicate_semantic -> "semantic"
        _ -> "none"
      end

    Logger.info(
      "GitHub webhook accepted delivery=#{delivery} event=#{Map.fetch!(normalized_event, :event)} action=#{Map.get(normalized_event, :action) || "none"} repository=#{Map.fetch!(normalized_event, :repository)} duplicate=#{duplicate} semantic_key=#{Map.get(normalized_event, :semantic_key) || "none"}"
    )
  end

  defp log_rejection(conn, reason) do
    Logger.warning(
      "GitHub webhook rejected reason=#{inspect(reason)} delivery=#{header_value(conn, "x-github-delivery") || "missing"} event=#{header_value(conn, "x-github-event") || "missing"} signature_present=#{not is_nil(header_value(conn, "x-hub-signature-256"))}"
    )
  end

  defp response_body(delivery, normalized_event, status) do
    %{
      accepted: true,
      persisted: status == :recorded,
      duplicate:
        case status do
          :duplicate_delivery -> "delivery"
          :duplicate_semantic -> "semantic"
          _ -> nil
        end,
      delivery: delivery,
      event: Map.fetch!(normalized_event, :event),
      repository: Map.fetch!(normalized_event, :repository),
      action: Map.get(normalized_event, :action),
      semantic_key: Map.get(normalized_event, :semantic_key)
    }
  end
end
