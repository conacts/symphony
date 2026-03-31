defmodule SymphonyElixir.RepoSnapshot do
  @moduledoc """
  Captures a best-effort git workspace snapshot for forensic journaling.
  """

  alias SymphonyElixir.{Config, SSH}

  @default_patch_max_bytes 64 * 1024

  @spec capture(Path.t(), String.t() | nil) :: map()
  def capture(workspace, worker_host \\ nil) when is_binary(workspace) do
    patch_max_bytes = Application.get_env(:symphony_elixir, :run_journal_patch_max_bytes, @default_patch_max_bytes)
    captured_at = now_iso8601()

    with {:ok, head} <- git_capture(workspace, worker_host, ["rev-parse", "HEAD"]),
         {:ok, status_short} <- git_capture(workspace, worker_host, ["status", "--short"]),
         {:ok, diffstat} <- git_capture(workspace, worker_host, ["diff", "--stat", "--no-ext-diff", "HEAD"]),
         {:ok, patch_output} <- git_capture(workspace, worker_host, ["diff", "--no-ext-diff", "HEAD"]) do
      patch = truncate_text(patch_output, patch_max_bytes)

      %{
        captured_at: captured_at,
        available: true,
        worker_host: worker_host,
        commit_hash: blank_to_nil(head),
        dirty: String.trim(status_short) != "",
        status_short: blank_to_nil(status_short),
        diffstat: blank_to_nil(diffstat),
        patch: patch.content,
        patch_truncated: patch.truncated?
      }
    else
      {:error, reason} ->
        %{
          captured_at: captured_at,
          available: false,
          worker_host: worker_host,
          error: format_error(reason)
        }
    end
  end

  defp git_capture(workspace, nil, args) when is_list(args) do
    case System.cmd("git", args, cd: workspace, stderr_to_stdout: true) do
      {output, 0} -> {:ok, String.trim_trailing(output)}
      {output, status} -> {:error, {:git_failed, status, String.trim_trailing(output)}}
    end
  rescue
    error ->
      {:error, {:git_exception, Exception.message(error)}}
  end

  defp git_capture(workspace, worker_host, args) when is_binary(worker_host) and is_list(args) do
    command =
      [
        "cd #{shell_escape(workspace)}",
        "git #{Enum.map_join(args, " ", &shell_escape/1)}"
      ]
      |> Enum.join(" && ")

    task =
      Task.async(fn ->
        SSH.run(worker_host, command, stderr_to_stdout: true)
      end)

    case Task.yield(task, Config.settings!().hooks.timeout_ms) do
      {:ok, {:ok, {output, 0}}} ->
        {:ok, String.trim_trailing(output)}

      {:ok, {:ok, {output, status}}} ->
        {:error, {:git_failed, status, String.trim_trailing(output)}}

      {:ok, {:error, reason}} ->
        {:error, reason}

      nil ->
        Task.shutdown(task, :brutal_kill)
        {:error, {:git_timeout, Config.settings!().hooks.timeout_ms}}
    end
  end

  defp truncate_text(content, max_bytes) when is_binary(content) and is_integer(max_bytes) and max_bytes > 0 do
    if byte_size(content) <= max_bytes do
      %{content: blank_to_nil(content), truncated?: false}
    else
      %{content: blank_to_nil(binary_part(content, 0, max_bytes)), truncated?: true}
    end
  end

  defp blank_to_nil(content) when is_binary(content) do
    case String.trim(content) do
      "" -> nil
      _ -> content
    end
  end

  defp format_error({:git_failed, status, output}) do
    "git exited with status #{status}: #{output}"
  end

  defp format_error({:git_exception, message}), do: "git exception: #{message}"
  defp format_error({:git_timeout, timeout_ms}), do: "git snapshot timed out after #{timeout_ms}ms"
  defp format_error(reason), do: inspect(reason)

  defp shell_escape(value) when is_binary(value) do
    "'" <> String.replace(value, "'", "'\"'\"'") <> "'"
  end

  defp now_iso8601 do
    DateTime.utc_now()
    |> DateTime.truncate(:second)
    |> DateTime.to_iso8601()
  end
end
