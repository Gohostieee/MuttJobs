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

use serde_json::{json, Value};
use tauri::AppHandle;

pub struct JobRequest<'a> {
    pub id: &'a str,
    pub kind: &'a str,
    pub root: &'a Path,
    pub codex_path: &'a Path,
    pub prompt: &'a str,
    pub output_schema: Value,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    pub sandbox_mode: &'a str,
}

#[derive(Debug)]
pub enum JobEvent {
    Progress {
        stage: String,
    },
    Item {
        id: String,
        kind: String,
        status: String,
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
    let mut child = super::worker::spawn(app)?;
    let mut reader = super::worker::initialize(&mut child, request.codex_path)?;
    super::worker::write_message(
        &mut child,
        &json!({
            "protocolVersion": super::worker::PROTOCOL_VERSION,
            "requestId": request.id,
            "type": "start_job",
            "job": {
                "jobId": request.id,
                "kind": request.kind,
                "workingDirectory": request.root,
                "prompt": request.prompt,
                "outputSchema": request.output_schema,
                "model": request.model,
                "reasoningEffort": request.reasoning_effort,
                "isGitRepository": request.root.join(".git").exists(),
                "execution": {
                    "sandboxMode": request.sandbox_mode,
                    "approvalPolicy": "never",
                    "networkAccessEnabled": false
                }
            }
        }),
    )?;

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
            Some("job_progress") => on_event(JobEvent::Progress {
                stage: event
                    .get("stage")
                    .and_then(Value::as_str)
                    .unwrap_or("working")
                    .to_string(),
            }),
            Some("job_item") => on_event(JobEvent::Item {
                id: event
                    .get("itemId")
                    .and_then(Value::as_str)
                    .unwrap_or("activity")
                    .into(),
                kind: event
                    .get("itemType")
                    .and_then(Value::as_str)
                    .unwrap_or("activity")
                    .into(),
                status: event
                    .get("itemStatus")
                    .and_then(Value::as_str)
                    .unwrap_or("running")
                    .into(),
            }),
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
                break Err(event
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("The Codex worker failed.")
                    .to_string())
            }
            _ => {}
        }
    };

    done.store(true, Ordering::Relaxed);
    let _ = watcher.join();
    let _ = child.kill();
    let _ = child.wait();
    result
}
