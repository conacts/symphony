defmodule SymphonyElixirWeb.Router do
  @moduledoc """
  Router for Symphony's observability dashboard and API.
  """

  use Phoenix.Router
  import Phoenix.LiveView.Router

  pipeline :browser do
    plug(:fetch_session)
    plug(:fetch_live_flash)
    plug(:put_root_layout, html: {SymphonyElixirWeb.Layouts, :root})
    plug(:protect_from_forgery)
    plug(:put_secure_browser_headers)
  end

  scope "/", SymphonyElixirWeb do
    get("/dashboard.css", StaticAssetController, :dashboard_css)
    get("/vendor/phoenix_html/phoenix_html.js", StaticAssetController, :phoenix_html_js)
    get("/vendor/phoenix/phoenix.js", StaticAssetController, :phoenix_js)
    get("/vendor/phoenix_live_view/phoenix_live_view.js", StaticAssetController, :phoenix_live_view_js)
  end

  scope "/", SymphonyElixirWeb do
    pipe_through(:browser)

    live("/", DashboardLive, :index)
    live("/issues", IssuesLive, :index)
    live("/issues/:issue_identifier", IssueLive, :show)
    live("/runs/:run_id", RunLive, :show)
    live("/problem-runs", ProblemRunsLive, :index)
  end

  scope "/", SymphonyElixirWeb do
    get("/api/v1/issues", ForensicsApiController, :issues)
    get("/api/v1/issues/:issue_identifier", ForensicsApiController, :issue_detail)
    get("/api/v1/runs/:run_id", ForensicsApiController, :run_detail)
    get("/api/v1/problem-runs", ForensicsApiController, :problem_runs)
    get("/api/v1/state", ObservabilityApiController, :state)
    post("/api/v1/github/review-events", GitHubReviewEventsController, :create)

    match(:*, "/", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/issues", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/issues/:issue_identifier", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/runs/:run_id", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/problem-runs", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/state", ObservabilityApiController, :method_not_allowed)
    post("/api/v1/refresh", ObservabilityApiController, :refresh)
    match(:*, "/api/v1/refresh", ObservabilityApiController, :method_not_allowed)
    match(:*, "/api/v1/github/review-events", ObservabilityApiController, :method_not_allowed)
    get("/api/v1/:issue_identifier", ObservabilityApiController, :issue)
    match(:*, "/api/v1/:issue_identifier", ObservabilityApiController, :method_not_allowed)
    match(:*, "/*path", ObservabilityApiController, :not_found)
  end
end
