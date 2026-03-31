defmodule SymphonyElixirWeb.RawBodyReader do
  @moduledoc false

  @spec read_body(Plug.Conn.t(), keyword()) ::
          {:ok, binary(), Plug.Conn.t()}
          | {:more, binary(), Plug.Conn.t()}
          | {:error, term()}
  def read_body(conn, opts) do
    case Plug.Conn.read_body(conn, opts) do
      {:ok, body, conn} ->
        {:ok, body, cache_raw_body(conn, body)}

      {:more, body, conn} ->
        {:more, body, cache_raw_body(conn, body)}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp cache_raw_body(conn, chunk) when is_binary(chunk) do
    accumulated =
      case conn.private[:raw_body] do
        existing when is_binary(existing) and existing != "" -> existing <> chunk
        _ -> chunk
      end

    Plug.Conn.put_private(conn, :raw_body, accumulated)
  end
end
