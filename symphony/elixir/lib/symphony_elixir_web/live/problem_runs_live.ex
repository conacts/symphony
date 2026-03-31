defmodule SymphonyElixirWeb.ProblemRunsLive do
  @moduledoc """
  Problem-run index page.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixir.{ForensicsReadModel, RunJournal}
  alias SymphonyElixirWeb.{Endpoint, ObservabilityPubSub}

  @impl true
  def mount(params, _session, socket) do
    socket = assign(socket, :payload, load_payload(params))

    if connected?(socket) do
      :ok = ObservabilityPubSub.subscribe()
    end

    {:ok, socket}
  end

  @impl true
  def handle_params(params, _uri, socket) do
    {:noreply, assign(socket, :payload, load_payload(params))}
  end

  @impl true
  def handle_info(:observability_updated, socket) do
    {:noreply, assign(socket, :payload, load_payload(%{}))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Symphony Forensics</p>
            <h1 class="hero-title">Problem Runs</h1>
            <p class="hero-copy">Runs that ended in a non-success outcome.</p>
          </div>
          <div class="status-stack">
            <a class="status-badge status-badge-live" href="/issues">Issues</a>
            <a class="status-badge status-badge-offline" href="/">Runtime Dashboard</a>
          </div>
        </div>
      </header>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Problem Runs</h2>
            <p class="section-copy">First-class pause/failure outcomes like max turns, rate limits, and startup failures.</p>
          </div>
        </div>

        <form method="get" action="/problem-runs" class="section-header" style="gap: 0.75rem; align-items: end;">
          <label class="metric-detail">
            Outcome
            <input type="text" name="outcome" value={@payload.filters.outcome || ""} style="margin-left: 0.5rem;" />
          </label>
          <label class="metric-detail">
            Issue
            <input type="text" name="issue_identifier" value={@payload.filters.issue_identifier || ""} style="margin-left: 0.5rem;" />
          </label>
          <label class="metric-detail">
            Limit
            <input type="number" min="1" name="limit" value={@payload.filters.limit || 200} style="margin-left: 0.5rem;" />
          </label>
          <button type="submit" class="subtle-button">Apply</button>
        </form>

        <%= if map_size(@payload.problem_summary || %{}) > 0 do %>
          <section class="metric-grid">
            <article :for={{outcome, count} <- @payload.problem_summary} class="metric-card">
              <p class="metric-label"><%= outcome %></p>
              <p class="metric-value numeric"><%= count %></p>
              <p class="metric-detail">Matching runs in the current result set.</p>
            </article>
          </section>
        <% end %>

        <%= if @payload.problem_runs == [] do %>
          <p class="empty-state">No problem runs recorded.</p>
        <% else %>
          <div class="table-wrap">
            <table class="data-table" style="min-width: 920px;">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Run</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Turns / events</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={run <- @payload.problem_runs}>
                  <td><a class="issue-link" href={"/issues/#{run.issue_identifier}"}><%= run.issue_identifier %></a></td>
                  <td><a class="issue-link mono" href={"/runs/#{run.run_id}"}><%= String.slice(run.run_id, 0, 8) %></a></td>
                  <td class="mono"><%= run.started_at || "n/a" %></td>
                  <td class="numeric"><%= run.duration_seconds || "n/a" %></td>
                  <td class="numeric"><%= "#{run.turn_count || 0} / #{run.event_count || 0}" %></td>
                  <td><%= run.status || "n/a" %></td>
                  <td><%= run.outcome || "n/a" %></td>
                </tr>
              </tbody>
            </table>
          </div>
        <% end %>
      </section>
    </section>
    """
  end

  defp load_payload(params) do
    limit = parse_limit(params, 200)
    outcome = optional_param(params, "outcome")
    issue_identifier = optional_param(params, "issue_identifier")

    case ForensicsReadModel.problem_runs(run_journal(),
           limit: limit,
           outcome: outcome,
           issue_identifier: issue_identifier
         ) do
      {:ok, payload} ->
        payload

      {:error, reason} ->
        %{
          problem_runs: [],
          problem_summary: %{},
          filters: %{limit: limit, outcome: outcome, issue_identifier: issue_identifier},
          error: inspect(reason)
        }
    end
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
