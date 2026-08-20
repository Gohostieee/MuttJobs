use std::{
    env, fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
};

use serde_json::{json, Value};
use tauri::AppHandle;

pub const PROTOCOL_VERSION: u32 = 3;
pub const SDK_VERSION: &str = "0.147.0";
pub const MAX_MESSAGE_BYTES: usize = 2 * 1024 * 1024;

pub fn resolve_worker(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("MUTTJOBS_AGENT_WORKER") {
        return canonical_file(PathBuf::from(path));
    }

    let extension = if cfg!(windows) { ".exe" } else { "" };
    let packaged = env::current_exe()
        .map_err(|error| error.to_string())?
        .with_file_name(format!("muttjobs-agent-worker{extension}"));
    if packaged.is_file() {
        return canonical_file(packaged);
    }

    let binaries = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    if let Ok(entries) = fs::read_dir(binaries) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with("muttjobs-agent-worker-") && entry.path().is_file() {
                return canonical_file(entry.path());
            }
        }
    }

    let _ = app;
    Err("The packaged Codex worker is unavailable. Rebuild MuttJobs or its desktop sidecar.".into())
}

fn canonical_file(path: PathBuf) -> Result<PathBuf, String> {
    if !path.is_file() {
        return Err("The agent worker path is not a file.".into());
    }
    path.canonicalize().map_err(|error| error.to_string())
}

pub fn spawn(app: &AppHandle) -> Result<Child, String> {
    let mut child = Command::new(resolve_worker(app)?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("The agent worker could not start: {error}"))?;

    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                eprintln!("[muttjobs-agent-worker] {line}");
            }
        });
    }
    Ok(child)
}

pub fn write_message(child: &mut Child, value: &Value) -> Result<(), String> {
    let encoded = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_MESSAGE_BYTES {
        return Err("Worker request exceeds 2 MiB.".into());
    }
    let stdin = child.stdin.as_mut().ok_or("Worker stdin is unavailable.")?;
    stdin
        .write_all(&encoded)
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|error| error.to_string())
}

pub fn read_message(reader: &mut BufReader<impl std::io::Read>) -> Result<Value, String> {
    let mut line = String::new();
    let bytes = reader
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    if bytes == 0 {
        return Err("The agent worker exited unexpectedly.".into());
    }
    if bytes > MAX_MESSAGE_BYTES {
        return Err("Worker response exceeds 2 MiB.".into());
    }
    let value: Value = serde_json::from_str(&line)
        .map_err(|_| "The agent worker returned malformed JSON.".to_string())?;
    if value.get("protocolVersion").and_then(Value::as_u64) != Some(PROTOCOL_VERSION as u64) {
        return Err("The agent worker protocol is incompatible.".into());
    }
    Ok(value)
}

pub fn initialize(
    child: &mut Child,
    codex_path: Option<&Path>,
    claude_path: Option<&Path>,
) -> Result<BufReader<std::process::ChildStdout>, String> {
    write_message(
        child,
        &json!({
            "protocolVersion": PROTOCOL_VERSION,
            "requestId": "initialize",
            "type": "initialize",
            "codexPath": codex_path.map(|path| path.to_string_lossy().into_owned()),
            "claudePath": claude_path.map(|path| path.to_string_lossy().into_owned())
        }),
    )?;
    let stdout = child.stdout.take().ok_or("Worker stdout is unavailable.")?;
    let mut reader = BufReader::new(stdout);
    let response = read_message(&mut reader)?;
    if response.get("type").and_then(Value::as_str) != Some("ready")
        || response.get("sdkVersion").and_then(Value::as_str) != Some(SDK_VERSION)
    {
        return Err("The worker or Codex SDK version is incompatible.".into());
    }
    Ok(reader)
}

pub fn probe(app: &AppHandle, provider: &str, executable: &Path) -> Result<(), String> {
    let mut child = spawn(app)?;
    let result = (|| {
        let (codex_path, claude_path) = match provider {
            "codex" => (Some(executable), None),
            "claude-code" => (None, Some(executable)),
            _ => return Err("Unknown provider for worker health check.".into()),
        };
        let mut reader = initialize(&mut child, codex_path, claude_path)?;
        write_message(
            &mut child,
            &json!({
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": "health",
                "type": "health",
                "provider": provider
            }),
        )?;
        let response = read_message(&mut reader)?;
        if response.get("type").and_then(Value::as_str) != Some("ready") {
            return Err("Worker health negotiation failed.".into());
        }
        write_message(
            &mut child,
            &json!({
                "protocolVersion": PROTOCOL_VERSION,
                "requestId": "shutdown",
                "type": "shutdown"
            }),
        )?;
        Ok(())
    })();
    let _ = child.kill();
    let _ = child.wait();
    result
}
