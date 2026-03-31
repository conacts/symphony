defmodule SymphonyElixir.GitHub.Signature do
  @moduledoc """
  Validates GitHub webhook HMAC signatures.
  """

  @signature_prefix "sha256="

  @spec valid?(binary(), binary() | nil, binary() | nil) :: boolean()
  def valid?(body, signature, secret)
      when is_binary(body) and is_binary(signature) and is_binary(secret) do
    with {:ok, provided_signature} <- parse_signature(signature),
         computed_signature <- compute_signature(body, secret),
         true <- Plug.Crypto.secure_compare(provided_signature, computed_signature) do
      true
    else
      _ -> false
    end
  end

  def valid?(_body, _signature, _secret), do: false

  defp parse_signature(@signature_prefix <> signature) do
    if byte_size(signature) == 64 and String.match?(signature, ~r/\A[0-9a-f]+\z/) do
      {:ok, signature}
    else
      :error
    end
  end

  defp parse_signature(_signature), do: :error

  defp compute_signature(body, secret) do
    :crypto.mac(:hmac, :sha256, secret, body)
    |> Base.encode16(case: :lower)
  end
end
