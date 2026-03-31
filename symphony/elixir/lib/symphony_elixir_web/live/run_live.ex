defmodule SymphonyElixirWeb.RunLive do
  @moduledoc """
  Run detail page for a single recorded attempt.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixir.{ForensicsReadModel, RunJournal}
  alias SymphonyElixirWeb.Endpoint

  @impl true
  def mount(params, _session, socket) do
    run_id = Map.get(params, "run_id")
    {:ok, assign(socket, :payload, load_payload(run_id))}
  end

  @impl true
  def handle_params(%{"run_id" => run_id}, _uri, socket) do
    {:noreply, assign(socket, :payload, load_payload(run_id))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Symphony Forensics</p>
            <h1 class="hero-title">Run <%= String.slice(@payload.run.run_id || "unknown", 0, 8) %></h1>
            <p class="hero-copy">Prompt, event, and repo-state history for one Symphony run.</p>
          </div>
          <div class="status-stack">
            <a class="status-badge status-badge-live" href={"/issues/#{@payload.issue.issue_identifier}"}>Issue detail</a>
            <button
              :if={@payload.run.run_id}
              type="button"
              class="status-badge status-badge-offline"
              data-copy-url={"/api/v1/runs/#{@payload.run.run_id}"}
              onclick="fetch(this.dataset.copyUrl).then((r) => r.text()).then((text) => navigator.clipboard.writeText(text)); this.textContent = 'Copied';"
            >
              Copy JSON
            </button>
          </div>
        </div>
      </header>

      <section class="metric-grid">
        <article class="metric-card">
          <p class="metric-label">Issue</p>
          <p class="metric-value"><%= @payload.issue.issue_identifier %></p>
          <p class="metric-detail mono"><%= @payload.run.run_id %></p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Status</p>
          <p class="metric-value"><%= @payload.run.status || "n/a" %></p>
          <p class="metric-detail"><%= @payload.run.outcome || "n/a" %></p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Started</p>
          <p class="metric-value mono"><%= @payload.run.started_at || "n/a" %></p>
          <p class="metric-detail mono"><%= @payload.run.ended_at || "n/a" %></p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Duration</p>
          <p class="metric-value numeric"><%= @payload.run.duration_seconds || "n/a" %></p>
          <p class="metric-detail">Seconds elapsed for this run.</p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Turns / events</p>
          <p class="metric-value numeric"><%= "#{@payload.run.turn_count || 0} / #{@payload.run.event_count || 0}" %></p>
          <p class="metric-detail"><%= @payload.run.last_event_type || "n/a" %> · <span class="mono"><%= @payload.run.last_event_at || "n/a" %></span></p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Commit</p>
          <p class="metric-value mono"><%= @payload.run.commit_hash_end || @payload.run.commit_hash_start || "n/a" %></p>
          <p class="metric-detail mono">start <%= @payload.run.commit_hash_start || "n/a" %></p>
        </article>
      </section>

      <section class="metric-grid">
        <article class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Repo Start</h2>
              <p class="section-copy">Best-effort snapshot captured before the work began.</p>
            </div>
          </div>
          <pre class="code-panel"><%= inspect(@payload.run.repo_start, pretty: true, limit: :infinity) %></pre>
        </article>
        <article class="section-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Repo End</h2>
              <p class="section-copy">Best-effort snapshot captured after the run ended.</p>
            </div>
          </div>
          <pre class="code-panel"><%= inspect(@payload.run.repo_end, pretty: true, limit: :infinity) %></pre>
        </article>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Turns</h2>
            <p class="section-copy">Rendered prompts and raw event timelines.</p>
          </div>
        </div>

        <details :for={turn <- @payload.turns} class="section-card" style="margin-top: 1rem;" open={turn.turn_sequence == 1}>
          <summary class="section-header" style="cursor: pointer; list-style: none;">
            <div>
              <h3 class="section-title">Turn <%= turn.turn_sequence %></h3>
              <p class="section-copy mono"><%= turn.codex_session_id || turn.turn_id %></p>
            </div>
            <div class="status-stack">
              <span class="status-badge status-badge-live"><%= turn.status || "n/a" %></span>
              <span class="status-badge status-badge-offline"><%= "#{turn.event_count || 0} events" %></span>
            </div>
          </summary>

          <pre class="code-panel"><%= turn.prompt_text %></pre>

          <div class="table-wrap" style="margin-top: 1rem;">
            <table class="data-table" style="min-width: 920px;">
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Event</th>
                  <th>At</th>
                  <th>Summary</th>
                  <th>Payload</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={event <- turn.events}>
                  <td><%= event.event_sequence %></td>
                  <td><%= event.event_type %></td>
                  <td class="mono"><%= event.recorded_at %></td>
                  <td><%= event.summary || event.event_type || "n/a" %></td>
                  <td>
                    <details>
                      <summary><%= if event.payload_truncated, do: "Show truncated payload", else: "Show payload" %></summary>
                      <pre class="code-panel" style="max-height: 12rem;"><%= inspect(event.payload, pretty: true, limit: :infinity) %></pre>
                    </details>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </section>
    """
  end

  defp load_payload(nil), do: %{issue: %{issue_identifier: "unknown"}, run: %{}, turns: []}

  defp load_payload(run_id) do
    case ForensicsReadModel.run_detail(run_journal(), run_id) do
      {:ok, payload} -> payload
      {:error, _reason} -> %{issue: %{issue_identifier: "unknown"}, run: %{run_id: run_id}, turns: []}
    end
  end

  defp run_journal do
    Endpoint.config(:run_journal) || RunJournal
  end
end
