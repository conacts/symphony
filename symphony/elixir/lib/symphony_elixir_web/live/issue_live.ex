defmodule SymphonyElixirWeb.IssueLive do
  @moduledoc """
  Issue detail page for forensic runs.
  """

  use Phoenix.LiveView, layout: {SymphonyElixirWeb.Layouts, :app}

  alias SymphonyElixir.{ForensicsReadModel, RunJournal}
  alias SymphonyElixirWeb.{Endpoint, ObservabilityPubSub}

  @impl true
  def mount(params, _session, socket) do
    socket =
      socket
      |> assign(:issue_identifier, Map.get(params, "issue_identifier"))
      |> assign(:payload, load_payload(Map.get(params, "issue_identifier"), params))

    if connected?(socket) do
      :ok = ObservabilityPubSub.subscribe()
    end

    {:ok, socket}
  end

  @impl true
  def handle_params(%{"issue_identifier" => issue_identifier} = params, _uri, socket) do
    {:noreply,
     socket
     |> assign(:issue_identifier, issue_identifier)
     |> assign(:payload, load_payload(issue_identifier, params))}
  end

  @impl true
  def handle_info(:observability_updated, socket) do
    {:noreply, assign(socket, :payload, load_payload(socket.assigns.issue_identifier, %{}))}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <section class="dashboard-shell">
      <header class="hero-card">
        <div class="hero-grid">
          <div>
            <p class="eyebrow">Symphony Forensics</p>
            <h1 class="hero-title"><%= @issue_identifier %></h1>
            <p class="hero-copy">Historical run history for this issue.</p>
          </div>
          <div class="status-stack">
            <a class="status-badge status-badge-live" href="/issues">Back to Issues</a>
            <button
              type="button"
              class="status-badge status-badge-live"
              data-copy-url={issue_api_path(@issue_identifier, @payload.filters.limit)}
              onclick="fetch(this.dataset.copyUrl).then((r) => r.text()).then((text) => navigator.clipboard.writeText(text)); this.textContent = 'Copied';"
            >
              Copy Issue JSON
            </button>
            <a class="status-badge status-badge-offline" href="/problem-runs">Problem Runs</a>
          </div>
        </div>
      </header>

      <section class="metric-grid">
        <article class="metric-card">
          <p class="metric-label">Runs</p>
          <p class="metric-value numeric"><%= @payload.summary.run_count || 0 %></p>
          <p class="metric-detail">Recorded attempts for this issue.</p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Latest problem</p>
          <p class="metric-value"><%= @payload.summary.latest_problem_outcome || "n/a" %></p>
          <p class="metric-detail">Most recent non-success outcome.</p>
        </article>
        <article class="metric-card">
          <p class="metric-label">Last completed</p>
          <p class="metric-value"><%= @payload.summary.last_completed_outcome || "n/a" %></p>
          <p class="metric-detail">Most recent successful outcome.</p>
        </article>
      </section>

      <section class="section-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Runs</h2>
            <p class="section-copy">Each row is one Symphony attempt for this issue.</p>
          </div>
        </div>

        <form method="get" action={"/issues/#{@issue_identifier}"} class="section-header" style="gap: 0.75rem;">
          <label class="metric-detail">
            Limit
            <input type="number" min="1" name="limit" value={@payload.filters.limit || 200} style="margin-left: 0.5rem;" />
          </label>
          <button type="submit" class="subtle-button">Apply</button>
        </form>

        <%= if @payload[:runs] in [nil, []] do %>
          <p class="empty-state">No recorded runs found for this issue.</p>
        <% else %>
          <div class="table-wrap">
            <table class="data-table" style="min-width: 900px;">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Turns / events</th>
                  <th>Status</th>
                  <th>Outcome</th>
                  <th>Commit</th>
                </tr>
              </thead>
              <tbody>
                <tr :for={run <- @payload.runs}>
                  <td>
                    <div class="issue-stack">
                      <span class="issue-id"><%= String.slice(run.run_id, 0, 8) %></span>
                      <a class="issue-link" href={"/runs/#{run.run_id}"}>Run detail</a>
                    </div>
                  </td>
                  <td class="mono"><%= run.started_at || "n/a" %></td>
                  <td class="numeric"><%= run.duration_seconds || "n/a" %></td>
                  <td class="numeric"><%= "#{run.turn_count || 0} / #{run.event_count || 0}" %></td>
                  <td><%= run.status || "n/a" %></td>
                  <td><%= run.outcome || "n/a" %></td>
                  <td class="mono"><%= run.commit_hash_end || run.commit_hash_start || "n/a" %></td>
                </tr>
              </tbody>
            </table>
          </div>
        <% end %>
      </section>
    </section>
    """
  end

  defp load_payload(nil, _params), do: %{runs: [], summary: %{}, filters: %{limit: 200}}

  defp load_payload(issue_identifier, params) do
    limit = parse_limit(params, 200)

    case ForensicsReadModel.issue_detail(run_journal(), issue_identifier, limit: limit) do
      {:ok, payload} -> payload
      {:error, :not_found} -> %{issue_identifier: issue_identifier, runs: [], summary: %{}, filters: %{limit: limit}}
      {:error, reason} -> %{issue_identifier: issue_identifier, runs: [], summary: %{}, filters: %{limit: limit}, error: inspect(reason)}
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

  defp issue_api_path(issue_identifier, nil), do: "/api/v1/issues/#{issue_identifier}"
  defp issue_api_path(issue_identifier, limit), do: "/api/v1/issues/#{issue_identifier}?limit=#{limit}"
end
