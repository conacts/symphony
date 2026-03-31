defmodule SymphonyElixir.ExtensionsTest do
  use SymphonyElixir.TestSupport

  import Phoenix.ConnTest
  import Phoenix.LiveViewTest
  import Plug.Conn

  alias SymphonyElixir.GitHub.EventJournal
  alias SymphonyElixir.GitHub.ReviewProcessor
  alias SymphonyElixir.Linear.Adapter
  alias SymphonyElixir.RunJournal
  alias SymphonyElixir.Tracker.Memory
  alias SymphonyElixirWeb.RawBodyReader

  @endpoint SymphonyElixirWeb.Endpoint

  defmodule FakeLinearClient do
    def fetch_candidate_issues do
      send(self(), :fetch_candidate_issues_called)
      {:ok, [:candidate]}
    end

    def fetch_issues_by_states(states) do
      send(self(), {:fetch_issues_by_states_called, states})
      {:ok, states}
    end

    def fetch_issue_states_by_ids(issue_ids) do
      send(self(), {:fetch_issue_states_by_ids_called, issue_ids})
      {:ok, issue_ids}
    end

    def fetch_issue_by_identifier(issue_identifier) do
      send(self(), {:fetch_issue_by_identifier_called, issue_identifier})
      {:ok, %{identifier: issue_identifier}}
    end

    def graphql(query, variables) do
      send(self(), {:graphql_called, query, variables})

      case Process.get({__MODULE__, :graphql_results}) do
        [result | rest] ->
          Process.put({__MODULE__, :graphql_results}, rest)
          result

        _ ->
          Process.get({__MODULE__, :graphql_result})
      end
    end
  end

  defmodule FakeGitHubClient do
    def fetch_pull_request(pull_request_url) do
      send(self(), {:fetch_pull_request_called, pull_request_url})

      case Process.get({__MODULE__, :fetch_pull_request_result}) do
        nil -> {:error, :missing_fixture}
        result -> result
      end
    end

    def create_issue_comment(repo, issue_number, body) do
      send(self(), {:create_issue_comment_called, repo, issue_number, body})

      case Process.get({__MODULE__, :create_issue_comment_result}) do
        nil -> :ok
        result -> result
      end
    end
  end

  defmodule FakeRequestBodyAdapter do
    def read_req_body([{:ok, body} | rest], _opts), do: {:ok, body, rest}
    def read_req_body([{:more, body} | rest], _opts), do: {:more, body, rest}
    def read_req_body([{:error, reason} | _rest], _opts), do: {:error, reason}
  end

  defmodule SlowOrchestrator do
    use GenServer

    def start_link(opts) do
      GenServer.start_link(__MODULE__, :ok, opts)
    end

    def init(:ok), do: {:ok, :ok}

    def handle_call(:snapshot, _from, state) do
      Process.sleep(25)
      {:reply, %{}, state}
    end

    def handle_call(:request_refresh, _from, state) do
      {:reply, :unavailable, state}
    end
  end

  defmodule StaticOrchestrator do
    use GenServer

    def start_link(opts) do
      name = Keyword.fetch!(opts, :name)
      GenServer.start_link(__MODULE__, opts, name: name)
    end

    def init(opts), do: {:ok, opts}

    def handle_call(:snapshot, _from, state) do
      {:reply, Keyword.fetch!(state, :snapshot), state}
    end

    def handle_call(:request_refresh, _from, state) do
      {:reply, Keyword.get(state, :refresh, :unavailable), state}
    end
  end

  setup do
    linear_client_module = Application.get_env(:symphony_elixir, :linear_client_module)
    github_client_module = Application.get_env(:symphony_elixir, :github_client_module)

    on_exit(fn ->
      if is_nil(linear_client_module) do
        Application.delete_env(:symphony_elixir, :linear_client_module)
      else
        Application.put_env(:symphony_elixir, :linear_client_module, linear_client_module)
      end

      if is_nil(github_client_module) do
        Application.delete_env(:symphony_elixir, :github_client_module)
      else
        Application.put_env(:symphony_elixir, :github_client_module, github_client_module)
      end
    end)

    :ok
  end

  setup do
    endpoint_config = Application.get_env(:symphony_elixir, SymphonyElixirWeb.Endpoint, [])

    on_exit(fn ->
      Application.put_env(:symphony_elixir, SymphonyElixirWeb.Endpoint, endpoint_config)
    end)

    :ok
  end

  test "workflow store reloads changes, keeps last good workflow, and falls back when stopped" do
    ensure_workflow_store_running()
    assert {:ok, %{prompt: "You are an agent for this repository."}} = Workflow.current()

    write_workflow_file!(Workflow.workflow_file_path(), prompt: "Second prompt")
    send(WorkflowStore, :poll)

    assert_eventually(fn ->
      match?({:ok, %{prompt: "Second prompt"}}, Workflow.current())
    end)

    File.write!(Workflow.workflow_file_path(), "---\ntracker: [\n---\nBroken prompt\n")
    assert {:error, _reason} = WorkflowStore.force_reload()
    assert {:ok, %{prompt: "Second prompt"}} = Workflow.current()

    third_workflow = Path.join(Path.dirname(Workflow.workflow_file_path()), "THIRD_WORKFLOW.md")
    write_workflow_file!(third_workflow, prompt: "Third prompt")
    Workflow.set_workflow_file_path(third_workflow)
    assert {:ok, %{prompt: "Third prompt"}} = Workflow.current()

    assert :ok = Supervisor.terminate_child(SymphonyElixir.Supervisor, WorkflowStore)
    assert {:ok, %{prompt: "Third prompt"}} = WorkflowStore.current()
    assert :ok = WorkflowStore.force_reload()
    assert {:ok, _pid} = Supervisor.restart_child(SymphonyElixir.Supervisor, WorkflowStore)
  end

  test "workflow store init stops on missing workflow file" do
    missing_path = Path.join(Path.dirname(Workflow.workflow_file_path()), "MISSING_WORKFLOW.md")
    Workflow.set_workflow_file_path(missing_path)

    assert {:stop, {:missing_workflow_file, ^missing_path, :enoent}} = WorkflowStore.init([])
  end

  test "workflow store start_link and poll callback cover missing-file error paths" do
    ensure_workflow_store_running()
    existing_path = Workflow.workflow_file_path()
    manual_path = Path.join(Path.dirname(existing_path), "MANUAL_WORKFLOW.md")
    missing_path = Path.join(Path.dirname(existing_path), "MANUAL_MISSING_WORKFLOW.md")

    assert :ok = Supervisor.terminate_child(SymphonyElixir.Supervisor, WorkflowStore)

    Workflow.set_workflow_file_path(missing_path)

    assert {:error, {:missing_workflow_file, ^missing_path, :enoent}} =
             WorkflowStore.force_reload()

    write_workflow_file!(manual_path, prompt: "Manual workflow prompt")
    Workflow.set_workflow_file_path(manual_path)

    assert {:ok, manual_pid} = WorkflowStore.start_link()
    assert Process.alive?(manual_pid)

    state = :sys.get_state(manual_pid)
    File.write!(manual_path, "---\ntracker: [\n---\nBroken prompt\n")
    assert {:noreply, returned_state} = WorkflowStore.handle_info(:poll, state)
    assert returned_state.workflow.prompt == "Manual workflow prompt"
    refute returned_state.stamp == nil
    assert_receive :poll, 1_100

    Workflow.set_workflow_file_path(missing_path)
    assert {:noreply, path_error_state} = WorkflowStore.handle_info(:poll, returned_state)
    assert path_error_state.workflow.prompt == "Manual workflow prompt"
    assert_receive :poll, 1_100

    Workflow.set_workflow_file_path(manual_path)
    File.rm!(manual_path)
    assert {:noreply, removed_state} = WorkflowStore.handle_info(:poll, path_error_state)
    assert removed_state.workflow.prompt == "Manual workflow prompt"
    assert_receive :poll, 1_100

    Process.exit(manual_pid, :normal)
    restart_result = Supervisor.restart_child(SymphonyElixir.Supervisor, WorkflowStore)

    assert match?({:ok, _pid}, restart_result) or
             match?({:error, {:already_started, _pid}}, restart_result)

    Workflow.set_workflow_file_path(existing_path)
    WorkflowStore.force_reload()
  end

  test "tracker delegates to memory and linear adapters" do
    issue = %Issue{id: "issue-1", identifier: "MT-1", state: "In Progress"}
    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue, %{id: "ignored"}])
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())
    write_workflow_file!(Workflow.workflow_file_path(), tracker_kind: "memory")

    assert Config.settings!().tracker.kind == "memory"
    assert SymphonyElixir.Tracker.adapter() == Memory
    assert {:ok, [^issue]} = SymphonyElixir.Tracker.fetch_candidate_issues()
    assert {:ok, [^issue]} = SymphonyElixir.Tracker.fetch_issues_by_states([" in progress ", 42])
    assert {:ok, [^issue]} = SymphonyElixir.Tracker.fetch_issue_states_by_ids(["issue-1"])
    assert :ok = SymphonyElixir.Tracker.create_comment("issue-1", "comment")
    assert :ok = SymphonyElixir.Tracker.update_issue_state("issue-1", "Done")
    assert_receive {:memory_tracker_comment, "issue-1", "comment"}
    assert_receive {:memory_tracker_state_update, "issue-1", "Done"}

    Application.delete_env(:symphony_elixir, :memory_tracker_recipient)
    assert :ok = Memory.create_comment("issue-1", "quiet")
    assert :ok = Memory.update_issue_state("issue-1", "Quiet")

    write_workflow_file!(Workflow.workflow_file_path(), tracker_kind: "linear")
    assert SymphonyElixir.Tracker.adapter() == Adapter
  end

  test "linear adapter delegates reads and validates mutation responses" do
    Application.put_env(:symphony_elixir, :linear_client_module, FakeLinearClient)

    assert {:ok, [:candidate]} = Adapter.fetch_candidate_issues()
    assert_receive :fetch_candidate_issues_called

    assert {:ok, ["Todo"]} = Adapter.fetch_issues_by_states(["Todo"])
    assert_receive {:fetch_issues_by_states_called, ["Todo"]}

    assert {:ok, ["issue-1"]} = Adapter.fetch_issue_states_by_ids(["issue-1"])
    assert_receive {:fetch_issue_states_by_ids_called, ["issue-1"]}

    assert {:ok, %{identifier: "MT-1"}} = Adapter.fetch_issue_by_identifier("MT-1")
    assert_receive {:fetch_issue_by_identifier_called, "MT-1"}

    Process.put(
      {FakeLinearClient, :graphql_result},
      {:ok, %{"data" => %{"commentCreate" => %{"success" => true}}}}
    )

    assert :ok = Adapter.create_comment("issue-1", "hello")
    assert_receive {:graphql_called, create_comment_query, %{body: "hello", issueId: "issue-1"}}
    assert create_comment_query =~ "commentCreate"

    Process.put(
      {FakeLinearClient, :graphql_result},
      {:ok, %{"data" => %{"commentCreate" => %{"success" => false}}}}
    )

    assert {:error, :comment_create_failed} =
             Adapter.create_comment("issue-1", "broken")

    Process.put({FakeLinearClient, :graphql_result}, {:error, :boom})

    assert {:error, :boom} = Adapter.create_comment("issue-1", "boom")

    Process.put({FakeLinearClient, :graphql_result}, {:ok, %{"data" => %{}}})
    assert {:error, :comment_create_failed} = Adapter.create_comment("issue-1", "weird")

    Process.put({FakeLinearClient, :graphql_result}, :unexpected)
    assert {:error, :comment_create_failed} = Adapter.create_comment("issue-1", "odd")

    Process.put(
      {FakeLinearClient, :graphql_results},
      [
        {:ok,
         %{
           "data" => %{
             "issue" => %{"team" => %{"states" => %{"nodes" => [%{"id" => "state-1"}]}}}
           }
         }},
        {:ok, %{"data" => %{"issueUpdate" => %{"success" => true}}}}
      ]
    )

    assert :ok = Adapter.update_issue_state("issue-1", "Done")
    assert_receive {:graphql_called, state_lookup_query, %{issueId: "issue-1", stateName: "Done"}}
    assert state_lookup_query =~ "states"

    assert_receive {:graphql_called, update_issue_query, %{issueId: "issue-1", stateId: "state-1"}}

    assert update_issue_query =~ "issueUpdate"

    Process.put(
      {FakeLinearClient, :graphql_results},
      [
        {:ok,
         %{
           "data" => %{
             "issue" => %{"team" => %{"states" => %{"nodes" => [%{"id" => "state-1"}]}}}
           }
         }},
        {:ok, %{"data" => %{"issueUpdate" => %{"success" => false}}}}
      ]
    )

    assert {:error, :issue_update_failed} =
             Adapter.update_issue_state("issue-1", "Broken")

    Process.put({FakeLinearClient, :graphql_results}, [{:error, :boom}])

    assert {:error, :boom} = Adapter.update_issue_state("issue-1", "Boom")

    Process.put({FakeLinearClient, :graphql_results}, [{:ok, %{"data" => %{}}}])
    assert {:error, :state_not_found} = Adapter.update_issue_state("issue-1", "Missing")

    Process.put(
      {FakeLinearClient, :graphql_results},
      [
        {:ok,
         %{
           "data" => %{
             "issue" => %{"team" => %{"states" => %{"nodes" => [%{"id" => "state-1"}]}}}
           }
         }},
        {:ok, %{"data" => %{}}}
      ]
    )

    assert {:error, :issue_update_failed} = Adapter.update_issue_state("issue-1", "Weird")

    Process.put(
      {FakeLinearClient, :graphql_results},
      [
        {:ok,
         %{
           "data" => %{
             "issue" => %{"team" => %{"states" => %{"nodes" => [%{"id" => "state-1"}]}}}
           }
         }},
        :unexpected
      ]
    )

    assert {:error, :issue_update_failed} = Adapter.update_issue_state("issue-1", "Odd")
  end

  test "phoenix observability api preserves state, issue, and refresh responses" do
    snapshot = static_snapshot()
    orchestrator_name = Module.concat(__MODULE__, :ObservabilityApiOrchestrator)

    {:ok, _pid} =
      StaticOrchestrator.start_link(
        name: orchestrator_name,
        snapshot: snapshot,
        refresh: %{
          queued: true,
          coalesced: false,
          requested_at: DateTime.utc_now(),
          operations: ["poll", "reconcile"]
        }
      )

    start_test_endpoint(orchestrator: orchestrator_name, snapshot_timeout_ms: 50)

    conn = get(build_conn(), "/api/v1/state")
    state_payload = json_response(conn, 200)

    assert state_payload == %{
             "generated_at" => state_payload["generated_at"],
             "counts" => %{"running" => 1, "retrying" => 1},
             "running" => [
               %{
                 "issue_id" => "issue-http",
                 "issue_identifier" => "MT-HTTP",
                 "state" => "In Progress",
                 "worker_host" => nil,
                 "workspace_path" => nil,
                 "session_id" => "thread-http",
                 "turn_count" => 7,
                 "last_event" => "notification",
                 "last_message" => "rendered",
                 "started_at" => state_payload["running"] |> List.first() |> Map.fetch!("started_at"),
                 "last_event_at" => nil,
                 "tokens" => %{"input_tokens" => 4, "output_tokens" => 8, "total_tokens" => 12}
               }
             ],
             "retrying" => [
               %{
                 "issue_id" => "issue-retry",
                 "issue_identifier" => "MT-RETRY",
                 "attempt" => 2,
                 "due_at" => state_payload["retrying"] |> List.first() |> Map.fetch!("due_at"),
                 "error" => "boom",
                 "worker_host" => nil,
                 "workspace_path" => nil
               }
             ],
             "codex_totals" => %{
               "input_tokens" => 4,
               "output_tokens" => 8,
               "total_tokens" => 12,
               "seconds_running" => 42.5
             },
             "rate_limits" => %{"primary" => %{"remaining" => 11}}
           }

    conn = get(build_conn(), "/api/v1/MT-HTTP")
    issue_payload = json_response(conn, 200)

    assert issue_payload == %{
             "issue_identifier" => "MT-HTTP",
             "issue_id" => "issue-http",
             "status" => "running",
             "workspace" => %{
               "path" => Path.join(Config.settings!().workspace.root, "MT-HTTP"),
               "host" => nil
             },
             "attempts" => %{"restart_count" => 0, "current_retry_attempt" => 0},
             "running" => %{
               "worker_host" => nil,
               "workspace_path" => nil,
               "session_id" => "thread-http",
               "turn_count" => 7,
               "state" => "In Progress",
               "started_at" => issue_payload["running"]["started_at"],
               "last_event" => "notification",
               "last_message" => "rendered",
               "last_event_at" => nil,
               "tokens" => %{"input_tokens" => 4, "output_tokens" => 8, "total_tokens" => 12}
             },
             "retry" => nil,
             "logs" => %{"codex_session_logs" => []},
             "recent_events" => [],
             "last_error" => nil,
             "tracked" => %{}
           }

    conn = get(build_conn(), "/api/v1/MT-RETRY")

    assert %{"status" => "retrying", "retry" => %{"attempt" => 2, "error" => "boom"}} =
             json_response(conn, 200)

    conn = get(build_conn(), "/api/v1/MT-MISSING")

    assert json_response(conn, 404) == %{
             "error" => %{"code" => "issue_not_found", "message" => "Issue not found"}
           }

    conn = post(build_conn(), "/api/v1/refresh", %{})

    assert %{"queued" => true, "coalesced" => false, "operations" => ["poll", "reconcile"]} =
             json_response(conn, 202)
  end

  test "phoenix observability api preserves 405, 404, and unavailable behavior" do
    unavailable_orchestrator = Module.concat(__MODULE__, :UnavailableOrchestrator)
    start_test_endpoint(orchestrator: unavailable_orchestrator, snapshot_timeout_ms: 5)

    assert json_response(post(build_conn(), "/api/v1/state", %{}), 405) ==
             %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}

    assert json_response(get(build_conn(), "/api/v1/refresh"), 405) ==
             %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}

    assert json_response(get(build_conn(), "/api/v1/github/review-events"), 405) ==
             %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}

    assert json_response(post(build_conn(), "/", %{}), 405) ==
             %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}

    assert json_response(post(build_conn(), "/api/v1/MT-1", %{}), 405) ==
             %{"error" => %{"code" => "method_not_allowed", "message" => "Method not allowed"}}

    assert json_response(get(build_conn(), "/unknown"), 404) ==
             %{"error" => %{"code" => "not_found", "message" => "Route not found"}}

    state_payload = json_response(get(build_conn(), "/api/v1/state"), 200)

    assert state_payload ==
             %{
               "generated_at" => state_payload["generated_at"],
               "error" => %{"code" => "snapshot_unavailable", "message" => "Snapshot unavailable"}
             }

    assert json_response(post(build_conn(), "/api/v1/refresh", %{}), 503) ==
             %{
               "error" => %{
                 "code" => "orchestrator_unavailable",
                 "message" => "Orchestrator is unavailable"
               }
             }
  end

  test "phoenix observability api preserves snapshot timeout behavior" do
    timeout_orchestrator = Module.concat(__MODULE__, :TimeoutOrchestrator)
    {:ok, _pid} = SlowOrchestrator.start_link(name: timeout_orchestrator)
    start_test_endpoint(orchestrator: timeout_orchestrator, snapshot_timeout_ms: 1)

    timeout_payload = json_response(get(build_conn(), "/api/v1/state"), 200)

    assert timeout_payload ==
             %{
               "generated_at" => timeout_payload["generated_at"],
               "error" => %{"code" => "snapshot_timeout", "message" => "Snapshot timed out"}
             }
  end

  test "phoenix forensics api exposes issue, run, and problem-run history" do
    journal = start_test_journal()
    {run_id, issue_identifier} = seed_test_run(journal)

    start_test_endpoint(run_journal: journal, snapshot_timeout_ms: 5)

    issues_payload = json_response(get(build_conn(), "/api/v1/issues"), 200)
    assert [%{"issue_identifier" => ^issue_identifier, "latest_run_id" => ^run_id}] = issues_payload["issues"]
    assert [%{"run_id" => ^run_id, "outcome" => "paused_max_turns"}] = issues_payload["problem_runs"]

    issue_payload = json_response(get(build_conn(), "/api/v1/issues/#{issue_identifier}"), 200)
    assert issue_payload["issue_identifier"] == issue_identifier
    assert [%{"run_id" => ^run_id}] = issue_payload["runs"]

    run_payload = json_response(get(build_conn(), "/api/v1/runs/#{run_id}"), 200)
    assert run_payload["issue"]["issue_identifier"] == issue_identifier
    assert run_payload["run"]["run_id"] == run_id
    assert [%{"prompt_text" => "Implement the recorded run."}] = run_payload["turns"]

    problem_runs_payload = json_response(get(build_conn(), "/api/v1/problem-runs"), 200)
    assert [%{"run_id" => ^run_id, "outcome" => "paused_max_turns"}] = problem_runs_payload["problem_runs"]
  end

  test "phoenix forensics api filters problem runs and issue runs" do
    journal = start_test_journal()
    {run_id, issue_identifier} = seed_test_run(journal)

    {:ok, second_run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-rate-limit",
        issue_identifier: "MT-RATE-LIMIT",
        status: "rate_limited"
      })

    :ok =
      RunJournal.finalize_run(journal, second_run_id, %{
        status: "rate_limited",
        outcome: "rate_limited"
      })

    start_test_endpoint(run_journal: journal, snapshot_timeout_ms: 5)

    filtered_problem_runs =
      json_response(
        get(build_conn(), "/api/v1/problem-runs?outcome=paused_max_turns&issue_identifier=#{issue_identifier}&limit=1"),
        200
      )

    assert [%{"run_id" => ^run_id, "outcome" => "paused_max_turns"}] = filtered_problem_runs["problem_runs"]

    filtered_issue_runs =
      json_response(get(build_conn(), "/api/v1/issues/#{issue_identifier}?limit=1"), 200)

    assert [%{"run_id" => ^run_id}] = filtered_issue_runs["runs"]
    assert filtered_issue_runs["filters"]["limit"] == 1
  end

  test "phoenix forensics live pages render issue and run history" do
    journal = start_test_journal()
    {run_id, issue_identifier} = seed_test_run(journal)

    start_test_endpoint(run_journal: journal, snapshot_timeout_ms: 5)

    {:ok, _issues_view, issues_html} = live(build_conn(), "/issues")
    assert issues_html =~ issue_identifier

    {:ok, _issue_view, issue_html} = live(build_conn(), "/issues/#{issue_identifier}")
    assert issue_html =~ run_id |> String.slice(0, 8)

    {:ok, _run_view, run_html} = live(build_conn(), "/runs/#{run_id}")
    assert run_html =~ "Implement the recorded run."
    assert run_html =~ "Copy JSON"

    {:ok, _problem_view, problem_html} = live(build_conn(), "/problem-runs")
    assert problem_html =~ "paused_max_turns"
  end

  test "github review webhook returns unavailable when github config is missing" do
    start_test_endpoint(snapshot_timeout_ms: 5)

    conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> post("/api/v1/github/review-events", "{}")

    assert json_response(conn, 503) == %{
             "error" => %{
               "code" => "github_not_configured",
               "message" => "GitHub webhook ingress is not configured."
             }
           }
  end

  test "github review webhook validates signature, repo, and supported events" do
    state_path = unique_github_state_path("accepted")

    write_workflow_file!(Workflow.workflow_file_path(),
      github_repo: "conacts/coldets-v2",
      github_webhook_secret: "test-secret",
      github_state_path: state_path
    )

    start_test_endpoint(snapshot_timeout_ms: 5)

    review_payload = %{
      "action" => "submitted",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "pull_request" => %{"number" => 40, "head" => %{"sha" => "head-sha-1"}},
      "review" => %{"id" => 101, "state" => "changes_requested", "user" => %{"login" => "review-bot"}}
    }

    assert %{
             "accepted" => true,
             "persisted" => true,
             "duplicate" => nil,
             "delivery" => "delivery-review",
             "event" => "pull_request_review",
             "repository" => "conacts/coldets-v2",
             "action" => "submitted"
           } =
             review_payload
             |> signed_github_conn("pull_request_review", "delivery-review", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(review_payload))
             |> json_response(202)

    issue_comment_payload = %{
      "action" => "created",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "issue" => %{
        "number" => 40,
        "pull_request" => %{"url" => "https://api.github.com/repos/conacts/coldets-v2/pulls/40"}
      },
      "comment" => %{"id" => 7000, "body" => "/rework", "user" => %{"login" => "conacts"}}
    }

    assert %{
             "accepted" => true,
             "persisted" => true,
             "duplicate" => nil,
             "delivery" => "delivery-comment",
             "event" => "issue_comment",
             "repository" => "conacts/coldets-v2",
             "action" => "created"
           } =
             issue_comment_payload
             |> signed_github_conn("issue_comment", "delivery-comment", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(issue_comment_payload))
             |> json_response(202)

    issue_comment_with_context_payload = %{
      "action" => "created",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "issue" => %{
        "number" => 41,
        "pull_request" => %{"url" => "https://api.github.com/repos/conacts/coldets-v2/pulls/41"}
      },
      "comment" => %{
        "id" => 7004,
        "body" => "/rework please fix the retry ordering before re-review",
        "user" => %{"login" => "conacts"}
      }
    }

    assert %{
             "accepted" => true,
             "persisted" => true,
             "duplicate" => nil,
             "delivery" => "delivery-comment-context",
             "event" => "issue_comment",
             "repository" => "conacts/coldets-v2",
             "action" => "created"
           } =
             issue_comment_with_context_payload
             |> signed_github_conn("issue_comment", "delivery-comment-context", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(issue_comment_with_context_payload))
             |> json_response(202)

    ping_payload = %{
      "zen" => "Keep it logically awesome.",
      "repository" => %{"full_name" => "conacts/coldets-v2"}
    }

    assert %{
             "accepted" => true,
             "persisted" => true,
             "duplicate" => nil,
             "delivery" => "delivery-ping",
             "event" => "ping",
             "repository" => "conacts/coldets-v2",
             "action" => nil
           } =
             ping_payload
             |> signed_github_conn("ping", "delivery-ping", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(ping_payload))
             |> json_response(202)
  end

  test "github review webhook rejects invalid signature, missing repository, wrong repo, and unsupported events" do
    state_path = unique_github_state_path("rejections")

    write_workflow_file!(Workflow.workflow_file_path(),
      github_repo: "conacts/coldets-v2",
      github_webhook_secret: "test-secret",
      github_state_path: state_path
    )

    start_test_endpoint(snapshot_timeout_ms: 5)

    payload = %{
      "action" => "submitted",
      "repository" => %{"full_name" => "conacts/coldets-v2"}
    }

    conn =
      build_conn()
      |> put_req_header("content-type", "application/json")
      |> put_req_header("x-github-event", "pull_request_review")
      |> put_req_header("x-github-delivery", "delivery-invalid-signature")
      |> put_req_header("x-hub-signature-256", "sha256=#{String.duplicate("0", 64)}")
      |> post("/api/v1/github/review-events", Jason.encode!(payload))

    assert json_response(conn, 401) == %{
             "error" => %{
               "code" => "invalid_signature",
               "message" => "GitHub webhook signature validation failed."
             }
           }

    missing_repo_payload = %{"action" => "submitted"}

    assert %{
             "error" => %{
               "code" => "missing_delivery",
               "message" => "GitHub webhook delivery header is required."
             }
           } =
             build_conn()
             |> put_req_header("content-type", "application/json")
             |> put_req_header("x-github-event", "pull_request_review")
             |> put_req_header("x-hub-signature-256", github_signature(Jason.encode!(payload), "test-secret"))
             |> post("/api/v1/github/review-events", Jason.encode!(payload))
             |> json_response(400)

    assert %{
             "error" => %{
               "code" => "missing_repository",
               "message" => "GitHub webhook repository payload is required."
             }
           } =
             missing_repo_payload
             |> signed_github_conn("pull_request_review", "delivery-missing-repo", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(missing_repo_payload))
             |> json_response(400)

    wrong_repo_payload = %{
      "action" => "submitted",
      "repository" => %{"full_name" => "conacts/other-repo"},
      "pull_request" => %{"number" => 40, "head" => %{"sha" => "head-sha-2"}},
      "review" => %{"id" => 201, "state" => "changes_requested", "user" => %{"login" => "review-bot"}}
    }

    assert %{
             "error" => %{
               "code" => "repository_not_allowed",
               "message" => "GitHub webhook repository is not allowed."
             }
           } =
             wrong_repo_payload
             |> signed_github_conn("pull_request_review", "delivery-wrong-repo", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(wrong_repo_payload))
             |> json_response(403)

    unsupported_payload = %{
      "action" => "opened",
      "repository" => %{"full_name" => "conacts/coldets-v2"}
    }

    assert %{
             "error" => %{
               "code" => "unsupported_event",
               "message" => "GitHub webhook event is not supported."
             }
           } =
             unsupported_payload
             |> signed_github_conn("pull_request", "delivery-unsupported", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(unsupported_payload))
             |> json_response(422)

    non_pr_issue_comment_payload = %{
      "action" => "created",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "issue" => %{"number" => 40},
      "comment" => %{"id" => 7001, "body" => "/rework"}
    }

    assert %{
             "accepted" => true,
             "persisted" => true,
             "duplicate" => nil,
             "delivery" => "delivery-non-pr-issue-comment",
             "event" => "issue_comment",
             "repository" => "conacts/coldets-v2",
             "action" => "created"
           } =
             non_pr_issue_comment_payload
             |> signed_github_conn("issue_comment", "delivery-non-pr-issue-comment", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(non_pr_issue_comment_payload))
             |> json_response(202)

    malformed_issue_comment_payload = %{
      "action" => "created",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "issue" => %{
        "number" => 40,
        "pull_request" => %{"url" => "https://api.github.com/repos/conacts/coldets-v2/pulls/40"}
      },
      "comment" => %{"id" => 7002}
    }

    assert %{
             "error" => %{
               "code" => "invalid_payload",
               "message" => "GitHub webhook payload is not valid for this event type."
             }
           } =
             malformed_issue_comment_payload
             |> signed_github_conn("issue_comment", "delivery-malformed-issue-comment", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(malformed_issue_comment_payload))
             |> json_response(422)
  end

  test "github review webhook journals accepted events and dedupes by delivery and semantic key" do
    state_path = unique_github_state_path("dedupe")

    write_workflow_file!(Workflow.workflow_file_path(),
      github_repo: "conacts/coldets-v2",
      github_webhook_secret: "test-secret",
      github_state_path: state_path
    )

    start_test_endpoint(snapshot_timeout_ms: 5)

    review_payload = %{
      "action" => "submitted",
      "repository" => %{"full_name" => "conacts/coldets-v2"},
      "pull_request" => %{"number" => 40, "head" => %{"sha" => "head-sha-1"}},
      "review" => %{"id" => 101, "state" => "changes_requested", "user" => %{"login" => "review-bot"}}
    }

    assert %{"persisted" => true, "duplicate" => nil} =
             review_payload
             |> signed_github_conn("pull_request_review", "delivery-1", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(review_payload))
             |> json_response(202)

    assert {:ok, entries} = EventJournal.read_entries(state_path)
    assert length(entries) == 1
    assert Enum.at(entries, 0)["delivery_id"] == "delivery-1"
    assert Enum.at(entries, 0)["semantic_key"] == "pull_request_review:40:head-sha-1:101:changes_requested"

    assert %{"persisted" => false, "duplicate" => "delivery"} =
             review_payload
             |> signed_github_conn("pull_request_review", "delivery-1", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(review_payload))
             |> json_response(202)

    assert {:ok, entries} = EventJournal.read_entries(state_path)
    assert length(entries) == 1

    assert %{"persisted" => false, "duplicate" => "semantic"} =
             review_payload
             |> signed_github_conn("pull_request_review", "delivery-2", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(review_payload))
             |> json_response(202)

    assert {:ok, entries} = EventJournal.read_entries(state_path)
    assert length(entries) == 1

    next_review_payload = put_in(review_payload, ["review", "id"], 102)

    assert %{"persisted" => true, "duplicate" => nil} =
             next_review_payload
             |> signed_github_conn("pull_request_review", "delivery-3", "test-secret")
             |> post("/api/v1/github/review-events", Jason.encode!(next_review_payload))
             |> json_response(202)

    assert {:ok, entries} = EventJournal.read_entries(state_path)
    assert length(entries) == 2
  end

  test "raw body reader preserves more tuples and accumulates cached chunks" do
    conn =
      Plug.Test.conn("POST", "/")
      |> Map.put(:adapter, {FakeRequestBodyAdapter, [{:more, "chunk-1"}, {:ok, "chunk-2"}]})

    assert {:more, "chunk-1", conn} = RawBodyReader.read_body(conn, [])
    assert conn.private[:raw_body] == "chunk-1"

    assert {:ok, "chunk-2", conn} = RawBodyReader.read_body(conn, [])
    assert conn.private[:raw_body] == "chunk-1chunk-2"
  end

  test "review processor moves an in-review issue to rework for allowed changes_requested reviews" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())

    issue = %Issue{id: "issue-col-42", identifier: "COL-42", state: "In Review"}

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_review_logins: ["review-bot"]
    )

    event = %{
      event: "pull_request_review",
      payload: %{
        review_state: "changes_requested",
        author_login: "review-bot",
        head_ref: "symphony/COL-42",
        head_sha: "head-sha-42",
        pull_request_html_url: "https://github.com/conacts/coldets-v2/pull/42",
        review_id: 42
      }
    }

    assert :ok = ReviewProcessor.process(event)
    assert_receive {:memory_tracker_state_update, "issue-col-42", "Rework"}
    assert_receive {:memory_tracker_comment, "issue-col-42", comment_body}
    assert comment_body =~ "GitHub review automation moved the ticket from `In Review` to `Rework`."
    assert comment_body =~ "changes_requested"
    assert comment_body =~ "head-sha-42"
  end

  test "review processor ignores changes_requested reviews when the issue is not parked in review" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())

    issue = %Issue{id: "issue-col-43", identifier: "COL-43", state: "In Progress"}

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_review_logins: ["review-bot"]
    )

    event = %{
      event: "pull_request_review",
      payload: %{
        review_state: "changes_requested",
        author_login: "review-bot",
        head_ref: "symphony/COL-43",
        head_sha: "head-sha-43",
        pull_request_html_url: "https://github.com/conacts/coldets-v2/pull/43",
        review_id: 43
      }
    }

    assert :ok = ReviewProcessor.process(event)
    refute_receive {:memory_tracker_state_update, "issue-col-43", _state}
    refute_receive {:memory_tracker_comment, "issue-col-43", _body}
  end

  test "review processor skips automatic requeue when the issue has symphony:no-auto-rework label" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())

    issue = %Issue{
      id: "issue-col-43b",
      identifier: "COL-43B",
      state: "In Review",
      labels: ["symphony:no-auto-rework"]
    }

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_review_logins: ["review-bot"]
    )

    event = %{
      event: "pull_request_review",
      payload: %{
        review_state: "changes_requested",
        author_login: "review-bot",
        head_ref: "symphony/COL-43B",
        head_sha: "head-sha-43b",
        pull_request_html_url: "https://github.com/conacts/coldets-v2/pull/43",
        review_id: 4301
      }
    }

    assert :ok = ReviewProcessor.process(event)
    refute_receive {:memory_tracker_state_update, "issue-col-43b", _state}
    refute_receive {:memory_tracker_comment, "issue-col-43b", _body}
  end

  test "review processor skips manual rework when the issue is symphony disabled" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())
    Application.put_env(:symphony_elixir, :github_client_module, FakeGitHubClient)

    issue = %Issue{
      id: "issue-col-43d",
      identifier: "COL-43D",
      state: "In Review",
      labels: ["symphony:disabled"]
    }

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    Process.put(
      {FakeGitHubClient, :fetch_pull_request_result},
      {:ok,
       %{
         "head" => %{"ref" => "symphony/COL-43D"},
         "html_url" => "https://github.com/conacts/coldets-v2/pull/43D"
       }}
    )

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_rework_comment_logins: ["conacts"]
    )

    event = %{
      event: "issue_comment",
      repository: "conacts/coldets-v2",
      payload: %{
        comment_body: "/rework retry the validation path",
        author_login: "conacts",
        issue_number: 43,
        issue_html_url: "https://github.com/conacts/coldets-v2/issues/43",
        pull_request_html_url: "https://github.com/conacts/coldets-v2/pull/43D"
      }
    }

    assert :ok = ReviewProcessor.process(event)
    refute_receive {:memory_tracker_state_update, "issue-col-43d", _state}
    refute_receive {:memory_tracker_comment, "issue-col-43d", _body}
  end

  test "review processor resolves /rework comments through the github client seam" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())
    Application.put_env(:symphony_elixir, :github_client_module, FakeGitHubClient)

    issue = %Issue{
      id: "issue-col-44",
      identifier: "COL-44",
      state: "In Review",
      labels: ["symphony:no-auto-rework"]
    }

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    Process.put(
      {FakeGitHubClient, :fetch_pull_request_result},
      {:ok,
       %{
         "head" => %{"ref" => "symphony/COL-44"},
         "html_url" => "https://github.com/conacts/coldets-v2/pull/44"
       }}
    )

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_rework_comment_logins: ["conacts"]
    )

    event = %{
      event: "issue_comment",
      repository: "conacts/coldets-v2",
      payload: %{
        comment_body: "/rework please fix the retry ordering before re-review",
        author_login: "conacts",
        issue_number: 44,
        pull_request_url: "https://api.github.com/repos/conacts/coldets-v2/pulls/44",
        comment_id: 7002
      }
    }

    assert :ok = ReviewProcessor.process(event)
    assert_receive {:fetch_pull_request_called, "https://api.github.com/repos/conacts/coldets-v2/pulls/44"}
    assert_receive {:memory_tracker_state_update, "issue-col-44", "Rework"}
    assert_receive {:memory_tracker_comment, "issue-col-44", comment_body}
    assert_receive {:create_issue_comment_called, "conacts/coldets-v2", 44, github_comment_body}
    assert comment_body =~ "/rework"
    assert comment_body =~ "Operator context:"
    assert comment_body =~ "please fix the retry ordering before re-review"
    assert comment_body =~ "https://github.com/conacts/coldets-v2/pull/44"
    assert github_comment_body == "Queued rework via Symphony."
  end

  test "review processor leaves a github no-op reply for /rework outside in-review" do
    Application.put_env(:symphony_elixir, :memory_tracker_recipient, self())
    Application.put_env(:symphony_elixir, :github_client_module, FakeGitHubClient)

    issue = %Issue{id: "issue-col-45", identifier: "COL-45", state: "Approved"}

    Application.put_env(:symphony_elixir, :memory_tracker_issues, [issue])

    Process.put(
      {FakeGitHubClient, :fetch_pull_request_result},
      {:ok,
       %{
         "head" => %{"ref" => "symphony/COL-45"},
         "html_url" => "https://github.com/conacts/coldets-v2/pull/45"
       }}
    )

    write_workflow_file!(Workflow.workflow_file_path(),
      tracker_kind: "memory",
      github_allowed_rework_comment_logins: ["conacts"]
    )

    event = %{
      event: "issue_comment",
      repository: "conacts/coldets-v2",
      payload: %{
        comment_body: "/rework",
        author_login: "conacts",
        issue_number: 45,
        pull_request_url: "https://api.github.com/repos/conacts/coldets-v2/pulls/45",
        comment_id: 7003
      }
    }

    assert :ok = ReviewProcessor.process(event)
    assert_receive {:fetch_pull_request_called, "https://api.github.com/repos/conacts/coldets-v2/pulls/45"}
    refute_receive {:memory_tracker_state_update, "issue-col-45", _state}
    refute_receive {:memory_tracker_comment, "issue-col-45", _body}

    assert_receive {:create_issue_comment_called, "conacts/coldets-v2", 45, github_comment_body}

    assert github_comment_body ==
             "No action taken: matching Linear issue is not currently in `In Review` (current state: `Approved`)."
  end

  test "dashboard bootstraps liveview from embedded static assets" do
    orchestrator_name = Module.concat(__MODULE__, :AssetOrchestrator)

    {:ok, _pid} =
      StaticOrchestrator.start_link(
        name: orchestrator_name,
        snapshot: static_snapshot(),
        refresh: %{
          queued: true,
          coalesced: false,
          requested_at: DateTime.utc_now(),
          operations: ["poll"]
        }
      )

    start_test_endpoint(orchestrator: orchestrator_name, snapshot_timeout_ms: 50)

    html = html_response(get(build_conn(), "/"), 200)
    assert html =~ "/dashboard.css"
    assert html =~ "/vendor/phoenix_html/phoenix_html.js"
    assert html =~ "/vendor/phoenix/phoenix.js"
    assert html =~ "/vendor/phoenix_live_view/phoenix_live_view.js"
    refute html =~ "/assets/app.js"
    refute html =~ "<style>"

    dashboard_css = response(get(build_conn(), "/dashboard.css"), 200)
    assert dashboard_css =~ ":root {"
    assert dashboard_css =~ ".status-badge-live"
    assert dashboard_css =~ "[data-phx-main].phx-connected .status-badge-live"
    assert dashboard_css =~ "[data-phx-main].phx-connected .status-badge-offline"

    phoenix_html_js = response(get(build_conn(), "/vendor/phoenix_html/phoenix_html.js"), 200)
    assert phoenix_html_js =~ "phoenix.link.click"

    phoenix_js = response(get(build_conn(), "/vendor/phoenix/phoenix.js"), 200)
    assert phoenix_js =~ "var Phoenix = (() => {"

    live_view_js =
      response(get(build_conn(), "/vendor/phoenix_live_view/phoenix_live_view.js"), 200)

    assert live_view_js =~ "var LiveView = (() => {"
  end

  test "dashboard liveview renders and refreshes over pubsub" do
    orchestrator_name = Module.concat(__MODULE__, :DashboardOrchestrator)
    snapshot = static_snapshot()

    {:ok, orchestrator_pid} =
      StaticOrchestrator.start_link(
        name: orchestrator_name,
        snapshot: snapshot,
        refresh: %{
          queued: true,
          coalesced: true,
          requested_at: DateTime.utc_now(),
          operations: ["poll"]
        }
      )

    start_test_endpoint(orchestrator: orchestrator_name, snapshot_timeout_ms: 50)

    {:ok, view, html} = live(build_conn(), "/")
    assert html =~ "Operations Dashboard"
    assert html =~ "MT-HTTP"
    assert html =~ "MT-RETRY"
    assert html =~ "rendered"
    assert html =~ "Runtime"
    assert html =~ "Issues"
    assert html =~ "Problem Runs"
    assert html =~ "Copy ID"
    assert html =~ "Codex update"
    refute html =~ "data-runtime-clock="
    refute html =~ "setInterval(refreshRuntimeClocks"
    refute html =~ "Refresh now"
    refute html =~ "Transport"
    assert html =~ "status-badge-live"
    assert html =~ "status-badge-offline"

    updated_snapshot =
      put_in(snapshot.running, [
        %{
          issue_id: "issue-http",
          identifier: "MT-HTTP",
          state: "In Progress",
          session_id: "thread-http",
          turn_count: 8,
          last_codex_event: :notification,
          last_codex_message: %{
            event: :notification,
            message: %{
              payload: %{
                "method" => "codex/event/agent_message_content_delta",
                "params" => %{
                  "msg" => %{
                    "content" => "structured update"
                  }
                }
              }
            }
          },
          last_codex_timestamp: DateTime.utc_now(),
          codex_input_tokens: 10,
          codex_output_tokens: 12,
          codex_total_tokens: 22,
          started_at: DateTime.utc_now()
        }
      ])

    :sys.replace_state(orchestrator_pid, fn state ->
      Keyword.put(state, :snapshot, updated_snapshot)
    end)

    StatusDashboard.notify_update()

    assert_eventually(fn ->
      render(view) =~ "agent message content streaming: structured update"
    end)
  end

  test "dashboard liveview renders an unavailable state without crashing" do
    start_test_endpoint(
      orchestrator: Module.concat(__MODULE__, :MissingDashboardOrchestrator),
      snapshot_timeout_ms: 5
    )

    {:ok, _view, html} = live(build_conn(), "/")
    assert html =~ "Snapshot unavailable"
    assert html =~ "snapshot_unavailable"
  end

  test "http server serves embedded assets, accepts form posts, and rejects invalid hosts" do
    spec = HttpServer.child_spec(port: 0)
    assert spec.id == HttpServer
    assert spec.start == {HttpServer, :start_link, [[port: 0]]}

    assert :ignore = HttpServer.start_link(port: nil)
    assert HttpServer.bound_port() == nil

    snapshot = static_snapshot()
    orchestrator_name = Module.concat(__MODULE__, :BoundPortOrchestrator)

    refresh = %{
      queued: true,
      coalesced: false,
      requested_at: DateTime.utc_now(),
      operations: ["poll"]
    }

    server_opts = [
      host: "127.0.0.1",
      port: 0,
      orchestrator: orchestrator_name,
      snapshot_timeout_ms: 50
    ]

    start_supervised!({StaticOrchestrator, name: orchestrator_name, snapshot: snapshot, refresh: refresh})

    start_supervised!({HttpServer, server_opts})

    port = wait_for_bound_port()
    assert port == HttpServer.bound_port()

    response = Req.get!("http://127.0.0.1:#{port}/api/v1/state")
    assert response.status == 200
    assert response.body["counts"] == %{"running" => 1, "retrying" => 1}

    dashboard_css = Req.get!("http://127.0.0.1:#{port}/dashboard.css")
    assert dashboard_css.status == 200
    assert dashboard_css.body =~ ":root {"

    phoenix_js = Req.get!("http://127.0.0.1:#{port}/vendor/phoenix/phoenix.js")
    assert phoenix_js.status == 200
    assert phoenix_js.body =~ "var Phoenix = (() => {"

    refresh_response =
      Req.post!("http://127.0.0.1:#{port}/api/v1/refresh",
        headers: [{"content-type", "application/x-www-form-urlencoded"}],
        body: ""
      )

    assert refresh_response.status == 202
    assert refresh_response.body["queued"] == true

    method_not_allowed_response =
      Req.post!("http://127.0.0.1:#{port}/api/v1/state",
        headers: [{"content-type", "application/x-www-form-urlencoded"}],
        body: ""
      )

    assert method_not_allowed_response.status == 405
    assert method_not_allowed_response.body["error"]["code"] == "method_not_allowed"

    assert {:error, _reason} = HttpServer.start_link(host: "bad host", port: 0)
  end

  defp start_test_endpoint(overrides) do
    endpoint_config =
      :symphony_elixir
      |> Application.get_env(SymphonyElixirWeb.Endpoint, [])
      |> Keyword.merge(server: false, secret_key_base: String.duplicate("s", 64))
      |> Keyword.merge(overrides)

    Application.put_env(:symphony_elixir, SymphonyElixirWeb.Endpoint, endpoint_config)
    start_supervised!({SymphonyElixirWeb.Endpoint, []})
  end

  defp start_test_journal do
    db_root =
      Path.join(
        System.tmp_dir!(),
        "symphony-extensions-journal-#{System.unique_integer([:positive])}"
      )

    File.mkdir_p!(db_root)

    journal_name = Module.concat(__MODULE__, :"RunJournal#{System.unique_integer([:positive])}")

    start_supervised!({RunJournal, name: journal_name, db_file: Path.join(db_root, "run-journal.sqlite3"), prune_interval_ms: :timer.hours(12)})

    on_exit(fn ->
      File.rm_rf(db_root)
    end)

    journal_name
  end

  defp seed_test_run(journal) do
    issue_identifier = "MT-FORENSICS"

    {:ok, run_id} =
      RunJournal.record_run_started(journal, %{
        issue_id: "issue-forensics",
        issue_identifier: issue_identifier,
        attempt: 1,
        status: "completed",
        commit_hash_start: "abc123",
        repo_start: %{"dirty" => false}
      })

    {:ok, turn_id} =
      RunJournal.record_turn_started(journal, run_id, %{
        turn_sequence: 1,
        prompt_text: "Implement the recorded run."
      })

    {:ok, _event_id} =
      RunJournal.record_event(journal, run_id, turn_id, %{
        event_type: "session_started",
        payload: %{"session_id" => "thread-forensics-turn-1"}
      })

    :ok =
      RunJournal.finalize_turn(journal, turn_id, %{
        status: "completed",
        codex_thread_id: "thread-forensics",
        codex_turn_id: "turn-1",
        codex_session_id: "thread-forensics-turn-1"
      })

    :ok =
      RunJournal.finalize_run(journal, run_id, %{
        status: "paused",
        outcome: "paused_max_turns",
        commit_hash_end: "def456",
        repo_end: %{"dirty" => true}
      })

    {run_id, issue_identifier}
  end

  defp static_snapshot do
    %{
      running: [
        %{
          issue_id: "issue-http",
          identifier: "MT-HTTP",
          state: "In Progress",
          session_id: "thread-http",
          turn_count: 7,
          codex_app_server_pid: nil,
          last_codex_message: "rendered",
          last_codex_timestamp: nil,
          last_codex_event: :notification,
          codex_input_tokens: 4,
          codex_output_tokens: 8,
          codex_total_tokens: 12,
          started_at: DateTime.utc_now()
        }
      ],
      retrying: [
        %{
          issue_id: "issue-retry",
          identifier: "MT-RETRY",
          attempt: 2,
          due_in_ms: 2_000,
          error: "boom"
        }
      ],
      codex_totals: %{input_tokens: 4, output_tokens: 8, total_tokens: 12, seconds_running: 42.5},
      rate_limits: %{"primary" => %{"remaining" => 11}}
    }
  end

  defp wait_for_bound_port do
    assert_eventually(fn ->
      is_integer(HttpServer.bound_port())
    end)

    HttpServer.bound_port()
  end

  defp assert_eventually(fun, attempts \\ 20)

  defp assert_eventually(fun, attempts) when attempts > 0 do
    if fun.() do
      true
    else
      Process.sleep(25)
      assert_eventually(fun, attempts - 1)
    end
  end

  defp assert_eventually(_fun, 0), do: flunk("condition not met in time")

  defp ensure_workflow_store_running do
    if Process.whereis(WorkflowStore) do
      :ok
    else
      case Supervisor.restart_child(SymphonyElixir.Supervisor, WorkflowStore) do
        {:ok, _pid} -> :ok
        {:error, {:already_started, _pid}} -> :ok
      end
    end
  end

  defp signed_github_conn(payload, event, delivery, secret) do
    body = Jason.encode!(payload)

    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_header("x-github-event", event)
    |> put_req_header("x-github-delivery", delivery)
    |> put_req_header("x-hub-signature-256", github_signature(body, secret))
  end

  defp github_signature(body, secret) do
    digest = :crypto.mac(:hmac, :sha256, secret, body) |> Base.encode16(case: :lower)

    "sha256=" <> digest
  end

  defp unique_github_state_path(suffix) do
    root =
      Path.join(
        System.tmp_dir!(),
        "symphony-github-review-events-#{suffix}-#{System.unique_integer([:positive])}"
      )

    on_exit(fn ->
      File.rm_rf(root)
    end)

    Path.join(root, "github-review-events.ndjson")
  end
end
