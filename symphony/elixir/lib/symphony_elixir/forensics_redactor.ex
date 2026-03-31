defmodule SymphonyElixir.ForensicsRedactor do
  @moduledoc """
  Best-effort redaction for forensics payloads and exports.
  """

  @redacted "[REDACTED]"

  @spec sanitize(term()) :: term()
  def sanitize(%DateTime{} = value), do: DateTime.to_iso8601(value)
  def sanitize(%NaiveDateTime{} = value), do: NaiveDateTime.to_iso8601(value)
  def sanitize(%Date{} = value), do: Date.to_iso8601(value)
  def sanitize(%Time{} = value), do: Time.to_iso8601(value)
  def sanitize(%_{} = value), do: value |> Map.from_struct() |> sanitize()
  def sanitize(value) when is_binary(value), do: sanitize_string(value)
  def sanitize(value) when is_map(value), do: Map.new(value, fn {key, item} -> {key, sanitize_map_value(key, item)} end)
  def sanitize(value) when is_list(value), do: Enum.map(value, &sanitize/1)
  def sanitize(value), do: value

  @spec sanitize_string(String.t()) :: String.t()
  def sanitize_string(value) when is_binary(value) do
    value
    |> redact_bearer_tokens()
    |> redact_auth_headers()
    |> redact_cookie_headers()
    |> redact_env_assignments()
    |> redact_key_value_pairs()
  end

  defp redact_bearer_tokens(value) do
    Regex.replace(~r/\bBearer\s+[A-Za-z0-9._~+\/=-]+/i, value, "Bearer #{@redacted}")
  end

  defp redact_auth_headers(value) do
    value
    |> then(&Regex.replace(~r/(Authorization:\s*)(.+)$/im, &1, "\\1#{@redacted}"))
    |> then(&Regex.replace(~r/(X-API-Key:\s*)(.+)$/im, &1, "\\1#{@redacted}"))
  end

  defp redact_cookie_headers(value) do
    value
    |> then(&Regex.replace(~r/(Cookie:\s*)(.+)$/im, &1, "\\1#{@redacted}"))
    |> then(&Regex.replace(~r/(Set-Cookie:\s*)(.+)$/im, &1, "\\1#{@redacted}"))
  end

  defp redact_env_assignments(value) do
    Regex.replace(
      ~r/\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|COOKIE|API_KEY|AUTH)[A-Z0-9_]*)=([^\s"'`]+)/,
      value,
      "\\1=#{@redacted}"
    )
  end

  defp redact_key_value_pairs(value) do
    Regex.replace(
      ~r/\b(api[_-]?key|token|secret|password|cookie|authorization)\b(\s*[:=]\s*)([^\s,;]+)/i,
      value,
      fn _, key, separator, _secret -> key <> separator <> @redacted end
    )
  end

  defp sanitize_map_value(key, value) do
    case normalize_key(key) do
      "authorization" -> sanitize_authorization_value(value)
      "x-api-key" -> @redacted
      "api_key" -> @redacted
      "cookie" -> @redacted
      "set-cookie" -> @redacted
      _ -> sanitize(value)
    end
  end

  defp sanitize_authorization_value(value) when is_binary(value) do
    value
    |> sanitize_string()
    |> case do
      sanitized when sanitized == value -> @redacted
      sanitized -> sanitized
    end
  end

  defp sanitize_authorization_value(_value), do: @redacted

  defp normalize_key(key) when is_atom(key), do: key |> Atom.to_string() |> normalize_key()

  defp normalize_key(key) when is_binary(key) do
    key
    |> String.trim()
    |> String.downcase()
  end

  defp normalize_key(_key), do: nil
end
