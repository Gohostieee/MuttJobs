use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Duration,
};

use chrono::Utc;
use semver::Version;
use tauri::AppHandle;
use wait_timeout::ChildExt;

use super::{worker, ClaudeCodeSettings, ProviderHealth};

pub fn check_health(app: &AppHandle, settings: &ClaudeCodeSettings) -> ProviderHealth {
    if !settings.enabled {
        return health(
            "disabled",
            None,
            None,
            None,
            Some("Claude Code is disabled."),
        );
    }

    let executable = match resolve_executable(settings) {
        Ok(path) => path,
        Err(message) => return health("not_found", None, None, Some(false), Some(&message)),
    };

    let version_output = match command_output(&executable, &["--version"], Duration::from_secs(5)) {
        Ok(output) => output,
        Err(message) => return health("unhealthy", Some(&executable), None, None, Some(&message)),
    };
    let version_text = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_string();
    let parsed_version = version_text
        .split_whitespace()
        .find_map(|part| Version::parse(part.trim_start_matches('v')).ok());
    let version = parsed_version.as_ref().map(ToString::to_string);

    if let Err(message) = worker::probe(app, "claude-code", &executable) {
        return health(
            "worker_unavailable",
            Some(&executable),
            version.as_deref(),
            None,
            Some(&message),
        );
    }

    let login = match command_output(
        &executable,
        &["auth", "status", "--json"],
        Duration::from_secs(8),
    ) {
        Ok(output) => output,
        Err(message) => {
            return health(
                "authentication_required",
                Some(&executable),
                version.as_deref(),
                Some(false),
                Some(&message),
            )
        }
    };
    let status: serde_json::Value = serde_json::from_slice(&login.stdout).unwrap_or_default();
    let logged_in = status
        .get("loggedIn")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    if !login.status.success() || !logged_in {
        return health(
            "authentication_required",
            Some(&executable),
            version.as_deref(),
            Some(false),
            Some("Run `claude auth login`, then refresh provider health."),
        );
    }

    health(
        "available",
        Some(&executable),
        version.as_deref(),
        Some(true),
        None,
    )
}

fn health(
    state: &str,
    path: Option<&Path>,
    version: Option<&str>,
    authenticated: Option<bool>,
    message: Option<&str>,
) -> ProviderHealth {
    ProviderHealth {
        provider_id: "claude-code".into(),
        state: state.into(),
        executable_path: path.map(|value| value.to_string_lossy().into_owned()),
        version: version.map(str::to_owned),
        authenticated,
        checked_at: Utc::now().to_rfc3339(),
        message: message.map(str::to_owned),
        credit_balance: None,
    }
}

pub fn resolve_executable(settings: &ClaudeCodeSettings) -> Result<PathBuf, String> {
    if settings.executable_mode == "custom" {
        let path = PathBuf::from(
            settings
                .executable_path
                .as_deref()
                .ok_or("No custom Claude Code path is configured.")?,
        );
        if !path.is_absolute() {
            return Err("The custom Claude Code path must be absolute.".into());
        }
        return validate_executable(path);
    }

    let path =
        env::var_os("PATH").ok_or("PATH is unavailable; configure a custom Claude Code path.")?;
    let names: &[&str] = if cfg!(windows) {
        &["claude.exe", "claude.cmd", "claude.bat", "claude"]
    } else {
        &["claude"]
    };
    let directories: Vec<_> = env::split_paths(&path).collect();

    if let Some(candidate) = find_on_path(&directories, names) {
        return validate_executable(candidate);
    }
    Err("Claude Code CLI was not found. Install it or configure a custom path.".into())
}

fn find_on_path(directories: &[PathBuf], names: &[&str]) -> Option<PathBuf> {
    for name in names {
        for directory in directories {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn validate_executable(path: PathBuf) -> Result<PathBuf, String> {
    let metadata = fs::metadata(&path)
        .map_err(|_| "The configured Claude Code executable does not exist.".to_string())?;
    if !metadata.is_file() {
        return Err("The configured Claude Code path is not a file.".into());
    }
    if cfg!(windows)
        && matches!(
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref(),
            Some("cmd" | "bat")
        )
    {
        return Err(
            "Claude Code command shims cannot be launched by the packaged worker. Choose claude.exe instead."
                .into(),
        );
    }
    path.canonicalize()
        .map_err(|error| format!("Claude Code path could not be resolved: {error}"))
}

fn command_output(
    path: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut child = Command::new(path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Claude Code could not start: {error}"))?;

    match child
        .wait_timeout(timeout)
        .map_err(|error| error.to_string())?
    {
        Some(_) => child.wait_with_output().map_err(|error| error.to_string()),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            Err("Claude Code health check timed out.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn native_executable_wins_over_an_earlier_command_shim() {
        let shim_directory = tempfile::tempdir().unwrap();
        let exe_directory = tempfile::tempdir().unwrap();
        fs::write(shim_directory.path().join("claude.cmd"), "@echo off").unwrap();
        fs::write(exe_directory.path().join("claude.exe"), "not a real PE").unwrap();

        let found = find_on_path(
            &[shim_directory.path().into(), exe_directory.path().into()],
            &["claude.exe", "claude.cmd", "claude.bat", "claude"],
        )
        .unwrap();

        assert_eq!(found, exe_directory.path().join("claude.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_command_shims_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let shim = directory.path().join("claude.cmd");
        fs::write(&shim, "@echo off").unwrap();
        assert!(validate_executable(shim)
            .unwrap_err()
            .contains("Choose claude.exe"));
    }
}
