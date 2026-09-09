//! Test-only HTTP transport for the real application service. Never compiled into the app.
use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
};

fn provider_output(w: &Workspace, request: &RunRequest) -> Result<Value> {
    match request.operation.as_str() {
        "analyze" => Ok(super::tests::decoded(w)),
        "match" => Ok(
            json!({"assessments":effective_targets(w).iter().map(|t|json!({"targetId":t.id,"strength":"Strong","matchKind":"Direct","explanation":"The Career Profile records this work.","references":[{"entryId":"experience-1","field":"/sections/experience/items/0/description","excerpt":"Built reliable event-driven services with Vue."}]})).collect::<Vec<_>>()}),
        ),
        _ => Err(error("validation", "Unknown operation")),
    }
}
fn dispatch(s: &WorkspaceService, input: &Value, count: &mut usize) -> Result<Value> {
    let args = &input["args"];
    match input["command"].as_str().unwrap_or_default() {
        "stats" => Ok(json!({"providerRuns":count})),
        "list_saved_their_stack_jobs" => {
            let mut job = s.job(1)?;
            job["jobTitle"] = json!("Systems Engineer");
            job["company"] = json!("Fixture Company");
            job["location"] = json!("Remote");
            job["technologySlugs"] = json!([]);
            job["keywordSlugs"] = json!([]);
            job["locations"] = json!([]);
            Ok(json!([job]))
        }
        "list_job_import_jobs" => Ok(json!([])),
        "job_workspace_profile_entries" => Ok(json!(profile_references(&s.profile()?))),
        "job_workspace_document" => s.artifact(1, args["artifact"].as_str().unwrap_or("resume")),
        "job_workspace_summaries" => Ok(json!([s.summary(1)?])),
        "job_workspace_read" => Ok(serde_json::to_value(s.read(1)?)?),
        "job_workspace_mutate" => Ok(serde_json::to_value(
            s.mutate(serde_json::from_value(args["request"].clone())?)?,
        )?),
        "job_workspace_run" => {
            let request: RunRequest = serde_json::from_value(args["request"].clone())?;
            let w = s.read(request.job_id)?;
            *count += 1;
            let creation = matches!(
                request.operation.as_str(),
                "prepare" | "resumeCreation" | "audit"
            );
            let output = if creation {
                Value::Null
            } else {
                provider_output(&w, &request)?
            };
            Ok(serde_json::to_value(s.execute(
                request,
                &AtomicBool::new(false),
                |input| {
                    if creation {
                        document_creation::scripted_step(input)
                    } else {
                        Ok(output.clone())
                    }
                },
            )?)?)
        }
        "load_job_primary_resume" => {
            let data = s.artifact(1, "resume")?;
            if data.is_null() {
                return Err(error("validation", "No primary resume yet."));
            }
            Ok(
                json!({"id":"primary-resume","fileName":"primary-resume.json","path":s.artifact_path(1,"resume")?,"updatedAt":0,"revision":document_revision(&data),"data":data}),
            )
        }
        "update_their_stack_job_status" => {
            let mut job = s.job(1)?;
            job["applicationStatus"] = args["status"].clone();
            fs::write(s.root.join("jobs/1.json"), job.to_string())?;
            Ok(Value::Null)
        }
        "save_job_primary_resume" => {
            let data = args["data"].clone();
            validate_document("resume", &data)?;
            s.save_document(
                1,
                "resume",
                &data,
                args["expectedRevision"].as_str().unwrap_or_default(),
            )?;
            Ok(
                json!({"id":"primary-resume","fileName":"primary-resume.json","path":s.artifact_path(1,"resume")?,"updatedAt":0,"revision":document_revision(&data),"data":data}),
            )
        }
        name if name.starts_with("plugin:event|") => Ok(json!(1)),
        "list_agent_skills" => Ok(json!({"skills":[],"errors":[]})),
        "get_provider_health" => Ok(json!({"providers":[]})),
        name if name.starts_with("plugin:") => Ok(Value::Null),
        _ => Ok(Value::Null),
    }
}
#[test]
#[ignore = "Only run for browser integration tests; serves a disposable fixture"]
fn ui_fixture_server() {
    let listener = TcpListener::bind("127.0.0.1:1439").unwrap();
    let (mut root, mut service) = super::tests::fixture();
    let mut count = 0;
    eprintln!("Workspace UI fixture server ready at http://127.0.0.1:1439");
    for stream in listener.incoming() {
        let mut stream = stream.unwrap();
        let mut header = Vec::new();
        let mut byte = [0];
        while !header.ends_with(b"\r\n\r\n") && header.len() < 16384 {
            if stream.read(&mut byte).unwrap_or(0) == 0 {
                break;
            }
            header.push(byte[0]);
        }
        let header = String::from_utf8_lossy(&header);
        let length = header
            .lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .unwrap_or(0);
        let mut body = vec![0; length.min(2 * 1024 * 1024)];
        let _ = stream.read_exact(&mut body);
        let output = if header.starts_with("POST /reset ") {
            let replacement = super::tests::fixture();
            root = replacement.0;
            service = replacement.1;
            count = 0;
            json!({"ok":true})
        } else if header.starts_with("POST ") {
            match serde_json::from_slice::<Value>(&body)
                .map_err(WorkspaceError::from)
                .and_then(|input| dispatch(&service, &input, &mut count))
            {
                Ok(value) => json!({"ok":true,"value":value}),
                Err(e) => json!({"ok":false,"error":e}),
            }
        } else {
            json!({"ok":true})
        };
        let text = output.to_string();
        let response=format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: content-type\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",text.len(),text);
        let _ = stream.write_all(response.as_bytes());
        let _ = stream.flush();
    }
    drop(root);
}
