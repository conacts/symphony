defmodule SymphonyElixirWeb.IssuesLive do
  @moduledoc """
  Issue-centric forensic index page.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixir.{ForensicsReadModel, RunJournal}
  alias SymphonyElixirWeb.{Endpoint, ObservabilityPubSub}

  @impl true
  def mount(_params, _session, socket) do
    socket = assign(socket, :payload, load_payload())

    if connected?(socket) do
      :ok = ObservabilityPubSub.subscribe()
    end

    {:ok, socket}
  end

  @impl true
  def handle_info(:observability_updated, socket) do
    {:noreply, assign(socket, :payload, load_payload())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Symphony Forensics</p>
            <h1 class="hero-title">Issues</h1>
            <p class="hero-copy">Browse issues by most recent recorded run and jump into individual run history.</p>
          </div>
          <div class="status-stack">
            <a class="status-badge status-badge-live" href="/">Runtime Dashboard</a>
            <a class="status-badge status-badge-offline" href="/problem-runs">Problem Runs</a>
          </div>
        </div>
      </header>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Issue Index</h2>
            <p class="section-copy">Issues ordered by their most recent recorded run.</p>
          </div>
        </div>

        <%= if map_size(@payload.problem_summary || %{}) > 0 do %>
          <section class="metric-grid">
            <article :for={{outcome, count} <- @payload.problem_summary} class="metric-card">
              <p class="metric-label"><%= outcome %></p>
              <p class="metric-value numeric"><%= count %></p>
              <p class="metric-detail">Recent problem runs in the current summary window.</p>
            </article>
          </section>
        <% end %>

        <%= if @payload.issues == [] do %>
          <p class="empty-state">No recorded issue runs yet.</p>
        <% else %>
          <div class="table-wrap">
            <table class="data-table" style="min-width: 960px;">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Runs</th>
                  <th>Latest run</th>
                  <th>Status</th>
                  <th>Outcome</th>
                  <th>Latest problem</th>
                  <th>Last completed</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={issue <- @payload.issues}>
                  <td>
                    <div class="issue-stack">
                      <span class="issue-id"><%= issue.issue_identifier %></span>
                      <a class="issue-link" href={"/issues/#{issue.issue_identifier}"}>Issue detail</a>
                    </div>
                  </td>
                  <td class="numeric"><%= issue.run_count || 0 %></td>
                  <td class="mono"><%= issue.latest_run_started_at || "n/a" %></td>
                  <td><%= issue.latest_run_status || "n/a" %></td>
                  <td><%= issue.latest_run_outcome || "n/a" %></td>
                  <td><%= issue.latest_problem_outcome || "n/a" %></td>
                  <td><%= issue.last_completed_outcome || "n/a" %></td>
                </tr>
              </tbody>
            </table>
          </div>
        <% end %>
      </section>
    </section>
    """
  end

  defp load_payload do
    case ForensicsReadModel.issues(run_journal(), limit: 200) do
      {:ok, payload} -> payload
      {:error, reason} -> %{issues: [], error: inspect(reason)}
    end
  end

  defp run_journal do
    Endpoint.config(:run_journal) || RunJournal
  end
end
