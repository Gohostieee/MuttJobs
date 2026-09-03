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

use super::{worker, CodexSettings, ProviderHealth};

pub const MIN_CODEX_VERSION: &str = "0.146.0";

pub fn check_health(app: &AppHandle, settings: &CodexSettings) -> ProviderHealth {
    if !settings.enabled {
        return health("disabled", None, None, None, Some("Codex is disabled."));
    }

    let executable = match resolve_executable(settings) {
        Ok(path) => path,
        Err(message) => return health("not_found", None, None, Some(false), Some(&message)),
    };

    if let Err(message) = worker::probe(app, "codex", &executable) {
        return health(
            "worker_unavailable",
            Some(&executable),
            None,
            None,
            Some(&message),
        );
    }

    let version_output = match command_output(&executable, &["--version"], Duration::from_secs(5)) {
        Ok(output) => output,
        Err(message) => return health("unhealthy", Some(&executable), None, None, Some(&message)),
    };
    let version_text = String::from_utf8_lossy(&version_output.stdout)
        .trim()
        .to_string();
    let parsed = version_text
        .split_whitespace()
        .find_map(|part| Version::parse(part.trim_start_matches('v')).ok());
    let Some(version) = parsed else {
        return health(
            "unsupported_version",
            Some(&executable),
            Some(&version_text),
            None,
            Some("Codex returned an unrecognized version."),
        );
    };

    let min = Version::parse(MIN_CODEX_VERSION).expect("valid Codex minimum version");
    if version < min {
        return health(
            "unsupported_version",
            Some(&executable),
            Some(&version.to_string()),
            None,
            Some("This Codex CLI version is too old for the worker (requires >=0.146.0)."),
        );
    }

    let login = match command_output(&executable, &["login", "status"], Duration::from_secs(8)) {
        Ok(output) => output,
        Err(_) => {
            return health(
                "authentication_required",
                Some(&executable),
                Some(&version.to_string()),
                Some(false),
                Some("Run `codex login`, then refresh provider health."),
            )
        }
    };
    let combined = format!(
        "{} {}",
        String::from_utf8_lossy(&login.stdout),
        String::from_utf8_lossy(&login.stderr)
    )
    .to_lowercase();
    if !login.status.success()
        || !(combined.contains("logged in") || combined.contains("authenticated"))
    {
        return health(
            "authentication_required",
            Some(&executable),
            Some(&version.to_string()),
            Some(false),
            Some("Run `codex login`, then refresh provider health."),
        );
    }

    health(
        "available",
        Some(&executable),
        Some(&version.to_string()),
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
        provider_id: "codex".into(),
        state: state.into(),
        executable_path: path.map(|value| value.to_string_lossy().into_owned()),
        version: version.map(str::to_owned),
        authenticated,
        checked_at: Utc::now().to_rfc3339(),
        message: message.map(str::to_owned),
        credit_balance: None,
    }
}

pub fn resolve_executable(settings: &CodexSettings) -> Result<PathBuf, String> {
    if settings.executable_mode == "custom" {
        let path = PathBuf::from(
            settings
                .executable_path
                .as_deref()
                .ok_or("No custom Codex path is configured.")?,
        );
        if !path.is_absolute() {
            return Err("The custom Codex path must be absolute.".into());
        }
        return validate_executable(path);
    }

    let path = env::var_os("PATH").ok_or("PATH is unavailable; configure a custom Codex path.")?;
    let names: &[&str] = if cfg!(windows) {
        &["codex.exe", "codex.cmd", "codex.bat", "codex"]
    } else {
        &["codex"]
    };
    let directories: Vec<_> = env::split_paths(&path).collect();

    // Prefer a native executable over npm command shims. The packaged worker
    // cannot launch .cmd or .bat files directly on Windows.
    if let Some(candidate) = find_on_path(&directories, names) {
        return validate_executable(candidate);
    }
    Err("Codex CLI was not found. Install it or configure a custom path.".into())
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
        .map_err(|_| "The configured Codex executable does not exist.".to_string())?;
    if !metadata.is_file() {
        return Err("The configured Codex path is not a file.".into());
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
            "Codex command shims cannot be launched by the packaged worker. Choose codex.exe instead."
                .into(),
        );
    }
    path.canonicalize()
        .map_err(|error| format!("Codex path could not be resolved: {error}"))
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
        .map_err(|error| format!("Codex could not start: {error}"))?;

    match child
        .wait_timeout(timeout)
        .map_err(|error| error.to_string())?
    {
        Some(_) => child.wait_with_output().map_err(|error| error.to_string()),
        None => {
            let _ = child.kill();
            let _ = child.wait();
            Err("Codex health check timed out.".into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn minimum_version_is_valid() {
        assert!(Version::parse(MIN_CODEX_VERSION).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn native_executable_wins_over_an_earlier_command_shim() {
        let shim_directory = tempfile::tempdir().unwrap();
        let exe_directory = tempfile::tempdir().unwrap();
        fs::write(shim_directory.path().join("codex.cmd"), "@echo off").unwrap();
        fs::write(exe_directory.path().join("codex.exe"), "not a real PE").unwrap();

        let found = find_on_path(
            &[shim_directory.path().into(), exe_directory.path().into()],
            &["codex.exe", "codex.cmd", "codex.bat", "codex"],
        )
        .unwrap();

        assert_eq!(found, exe_directory.path().join("codex.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_command_shims_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let shim = directory.path().join("codex.cmd");
        fs::write(&shim, "@echo off").unwrap();
        assert!(validate_executable(shim)
            .unwrap_err()
            .contains("Choose codex.exe"));
    }
}
