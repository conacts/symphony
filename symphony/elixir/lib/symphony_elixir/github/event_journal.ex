defmodule SymphonyElixir.GitHub.EventJournal do
  @moduledoc """
  Durable NDJSON ingress journal for GitHub webhook events.
  """

  alias SymphonyElixir.Config

  @retention_seconds 14 * 24 * 60 * 60

  @type record_result ::
          {:ok, :recorded, map()}
          | {:ok, :duplicate_delivery, map()}
          | {:ok, :duplicate_semantic, map()}
          | {:error, term()}

  @spec record_inbound(map()) :: record_result()
  def record_inbound(%{} = event) do
    path = Config.settings!().github.state_path

    :global.trans({__MODULE__, path}, fn ->
      do_record_inbound(path, event)
    end)
  end

  @spec read_entries(Path.t()) :: {:ok, [map()]} | {:error, term()}
  def read_entries(path) when is_binary(path) do
    with :ok <- ensure_directory(path),
         {:ok, contents} <- read_contents(path) do
      {:ok, parse_entries(contents)}
    end
  end

  defp do_record_inbound(path, event) do
    now = DateTime.utc_now()

    with :ok <- ensure_directory(path),
         {:ok, existing_entries} <- read_entries(path) do
      retained_entries = Enum.filter(existing_entries, &retained?(&1, now))
      delivery_id = Map.fetch!(event, :delivery_id)
      semantic_key = Map.get(event, :semantic_key)

      cond do
        Enum.any?(retained_entries, &(entry_delivery_id(&1) == delivery_id)) ->
          maybe_compact(path, existing_entries, retained_entries)
          {:ok, :duplicate_delivery, event}

        is_binary(semantic_key) and
            Enum.any?(retained_entries, &(entry_semantic_key(&1) == semantic_key)) ->
          maybe_compact(path, existing_entries, retained_entries)
          {:ok, :duplicate_semantic, event}

        true ->
          encoded_entry = encode_entry(now, event)
          write_retained_and_append(path, existing_entries, retained_entries, encoded_entry)
          {:ok, :recorded, event}
      end
    end
  end

  defp ensure_directory(path) do
    path
    |> Path.dirname()
    |> File.mkdir_p()
  end

  defp read_contents(path) do
    case File.read(path) do
      {:ok, contents} -> {:ok, contents}
      {:error, :enoent} -> {:ok, ""}
      {:error, reason} -> {:error, reason}
    end
  end

  defp parse_entries(contents) when contents in ["", nil], do: []

  defp parse_entries(contents) when is_binary(contents) do
    contents
    |> String.split("\n", trim: true)
    |> Enum.flat_map(fn line ->
      case Jason.decode(line) do
        {:ok, %{} = entry} -> [entry]
        _ -> []
      end
    end)
  end

  defp retained?(entry, now) when is_map(entry) do
    case Map.get(entry, "recorded_at") do
      recorded_at when is_binary(recorded_at) ->
        case DateTime.from_iso8601(recorded_at) do
          {:ok, timestamp, _offset} ->
            DateTime.diff(now, timestamp, :second) <= @retention_seconds

          _ ->
            false
        end

      _ ->
        false
    end
  end

  defp entry_delivery_id(entry) when is_map(entry), do: Map.get(entry, "delivery_id")
  defp entry_semantic_key(entry) when is_map(entry), do: Map.get(entry, "semantic_key")

  defp maybe_compact(path, existing_entries, retained_entries) do
    if length(retained_entries) != length(existing_entries) do
      rewrite_entries(path, retained_entries)
    else
      :ok
    end
  end

  defp write_retained_and_append(path, existing_entries, retained_entries, encoded_entry) do
    if length(retained_entries) != length(existing_entries) do
      rewrite_entries(path, retained_entries ++ [Jason.decode!(encoded_entry)])
    else
      File.write!(path, encoded_entry <> "\n", [:append])
    end
  end

  defp rewrite_entries(path, entries) do
    data =
      entries
      |> Enum.map_join("\n", &Jason.encode!/1)

    if data == "" do
      File.write!(path, "")
    else
      File.write!(path, data <> "\n")
    end
  end

  defp encode_entry(now, event) do
    %{
      recorded_at: DateTime.to_iso8601(now),
      delivery_id: Map.fetch!(event, :delivery_id),
      event: Map.fetch!(event, :event),
      action: Map.get(event, :action),
      repository: Map.fetch!(event, :repository),
      semantic_key: Map.get(event, :semantic_key),
      payload: Map.fetch!(event, :payload)
    }
    |> Jason.encode!()
  end
end
