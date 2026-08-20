#![allow(dead_code)]

use std::{
    io::Write,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;

pub struct JobRequest<'a> {
    pub id: &'a str,
    pub kind: &'a str,
    pub root: &'a Path,
    pub provider: &'a str,
    pub codex_path: Option<&'a Path>,
    pub claude_path: Option<&'a Path>,
    pub prompt: &'a str,
    pub selection: Option<Value>,
    pub selection_action: Option<String>,
    pub output_schema: Value,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub sandbox_mode: &'a str,
    pub network_access_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum JobEvent {
    Thread {
        thread_id: String,
    },
    Progress {
        stage: String,
    },
    Item {
        id: String,
        kind: String,
        status: String,
        event_type: String,
        item: Value,
    },
    Usage {
        usage: Value,
    },
}

/// Run one future provider job through the supervised worker. Product
/// features should own prompts, schemas, artifact access, and UI state; this
/// module only supplies the common local-agent lifecycle.
pub fn run(
    app: &AppHandle,
    request: JobRequest<'_>,
    cancelled: &Arc<AtomicBool>,
    mut on_event: impl FnMut(JobEvent),
) -> Result<Value, String> {
    eprintln!(
        "[agent-job] start job_id={} kind={} provider={} model={} effort={} sandbox={} network={} root={}",
        request.id,
        request.kind,
        request.provider,
        request.model.as_deref().unwrap_or("<default>"),
        request.reasoning_effort.as_deref().unwrap_or("<default>"),
        request.sandbox_mode,
        request.network_access_enabled,
        request.root.display(),
    );
    let mut child = super::worker::spawn(app).map_err(|error| {
        eprintln!(
            "[agent-job] worker_spawn_failed job_id={} error={error}",
            request.id
        );
        error
    })?;
    let mut reader = super::worker::initialize(&mut child, request.codex_path, request.claude_path)
        .map_err(|error| {
            eprintln!(
                "[agent-job] worker_initialize_failed job_id={} error={error}",
                request.id
            );
            error
        })?;
    eprintln!("[agent-job] worker_ready job_id={}", request.id);
    super::worker::write_message(
        &mut child,
        &json!({
            "protocolVersion": super::worker::PROTOCOL_VERSION,
            "requestId": request.id,
            "type": "start_job",
            "job": {
                "jobId": request.id,
                "kind": request.kind,
                "provider": request.provider,
                "workingDirectory": request.root,
                "prompt": request.prompt,
                "selection": request.selection,
                "selectionAction": request.selection_action,
                "outputSchema": request.output_schema,
                "model": request.model,
                "reasoningEffort": request.reasoning_effort,
                "isGitRepository": request.root.join(".git").exists(),
                "execution": {
                    "sandboxMode": request.sandbox_mode,
                    "approvalPolicy": "never",
                    "networkAccessEnabled": request.network_access_enabled
                }
            }
        }),
    )
    .map_err(|error| {
        eprintln!(
            "[agent-job] request_write_failed job_id={} error={error}",
            request.id
        );
        error
    })?;
    eprintln!("[agent-job] request_sent job_id={}", request.id);

    let done = Arc::new(AtomicBool::new(false));
    let cancel_flag = cancelled.clone();
    let watcher_done = done.clone();
    let watcher_job = request.id.to_string();
    let mut stdin = child.stdin.take().ok_or("Worker stdin is unavailable.")?;
    let watcher = std::thread::spawn(move || {
        while !watcher_done.load(Ordering::Relaxed) {
            if cancel_flag.load(Ordering::Relaxed) {
                let message = json!({
                    "protocolVersion": super::worker::PROTOCOL_VERSION,
                    "requestId": format!("cancel-{watcher_job}"),
                    "type": "cancel_job",
                    "jobId": watcher_job
                });
                if let Ok(bytes) = serde_json::to_vec(&message) {
                    let _ = stdin.write_all(&bytes);
                    let _ = stdin.write_all(b"\n");
                    let _ = stdin.flush();
                }
                break;
            }
            std::thread::sleep(Duration::from_millis(75));
        }
    });

    let result = loop {
        let event = match super::worker::read_message(&mut reader) {
            Ok(event) => event,
            Err(error) => break Err(error),
        };
        if event.get("requestId").and_then(Value::as_str) != Some(request.id) {
            continue;
        }
        match event.get("type").and_then(Value::as_str) {
            Some("job_thread") => {
                let thread_id = event
                    .get("threadId")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                eprintln!(
                    "[agent-job] thread_started job_id={} thread_id={thread_id}",
                    request.id
                );
                on_event(JobEvent::Thread { thread_id });
            }
            Some("job_progress") => {
                let stage = event
                    .get("stage")
                    .and_then(Value::as_str)
                    .unwrap_or("working")
                    .to_string();
                eprintln!("[agent-job] progress job_id={} stage={stage}", request.id);
                on_event(JobEvent::Progress { stage });
            }
            Some("job_item") => {
                let id = event
                    .get("itemId")
                    .and_then(Value::as_str)
                    .unwrap_or("activity")
                    .to_string();
                let kind = event
                    .get("itemType")
                    .and_then(Value::as_str)
                    .unwrap_or("activity")
                    .to_string();
                let status = event
                    .get("itemStatus")
                    .and_then(Value::as_str)
                    .unwrap_or("running")
                    .to_string();
                let event_type = event
                    .get("eventType")
                    .and_then(Value::as_str)
                    .unwrap_or("item.updated")
                    .to_string();
                let item = event.get("item").cloned().unwrap_or(Value::Null);
                if kind.eq_ignore_ascii_case("web_search") {
                    let query = item
                        .get("query")
                        .and_then(Value::as_str)
                        .map(|value| bounded_log_text(value, 240))
                        .unwrap_or_else(|| "<pending>".into());
                    eprintln!(
                        "[agent-job] web_search job_id={} event_type={} item_id={} status={} query={}",
                        request.id, event_type, id, status, query,
                    );
                } else if kind.eq_ignore_ascii_case("error") {
                    eprintln!(
                        "[agent-job] item_error job_id={} item_id={} event_type={} item={}",
                        request.id,
                        id,
                        event_type,
                        bounded_log_text(&item.to_string(), 400),
                    );
                }
                on_event(JobEvent::Item {
                    id,
                    kind,
                    status,
                    event_type,
                    item,
                });
            }
            Some("job_usage") => on_event(JobEvent::Usage {
                usage: event.get("usage").cloned().unwrap_or(Value::Null),
            }),
            Some("job_completed") => {
                break event
                    .get("output")
                    .cloned()
                    .ok_or("Worker completed without output.".into())
            }
            Some("job_cancelled") => break Err("cancelled".into()),
            Some("job_failed") | Some("worker_error") => {
                let message = event
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("The agent worker failed.")
                    .to_string();
                eprintln!(
                    "[agent-job] provider_failed job_id={} event_type={} error={}",
                    request.id,
                    event
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown"),
                    message,
                );
                break Err(message);
            }
            _ => {}
        }
    };

    done.store(true, Ordering::Relaxed);
    let _ = watcher.join();
    let _ = child.kill();
    let _ = child.wait();
    match &result {
        Ok(_) => eprintln!("[agent-job] completed job_id={}", request.id),
        Err(error) => eprintln!("[agent-job] failed job_id={} error={error}", request.id),
    }
    result
}

fn bounded_log_text(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .take(max_chars)
        .map(|character| {
            if character == '\r' || character == '\n' {
                ' '
            } else {
                character
            }
        })
        .collect()
}
