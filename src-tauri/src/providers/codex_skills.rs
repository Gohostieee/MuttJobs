use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{collections::BTreeMap, fs, sync::Mutex};
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};
use tauri::{AppHandle, Manager};

static SKILL_WRITE: Mutex<()> = Mutex::new(());

pub(crate) fn read_overrides(cwd: &Path) -> Result<BTreeMap<String, bool>, String> {
    match fs::read(cwd.join(".agents/codex-skill-overrides.json")) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("Invalid MuttJobs skill preferences: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(BTreeMap::new()),
        Err(e) => Err(format!("Could not read MuttJobs skill preferences: {e}")),
    }
}

fn write_overrides(cwd: &Path, overrides: &BTreeMap<String, bool>) -> Result<(), String> {
    let root = cwd.join(".agents");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let temporary = root.join("codex-skill-overrides.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(overrides).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(&temporary, root.join("codex-skill-overrides.json")).map_err(|e| e.to_string())
}

fn effective_config(catalog: &Catalog, overrides: &BTreeMap<String, bool>) -> Value {
    let mut entries: BTreeMap<String, bool> = catalog
        .skills
        .iter()
        .map(|s| (s.path.clone(), s.enabled))
        .collect();
    entries.extend(
        overrides
            .iter()
            .map(|(path, enabled)| (path.clone(), *enabled)),
    );
    json!(entries
        .into_iter()
        .map(|(path, enabled)| json!({"path":path,"enabled":enabled}))
        .collect::<Vec<_>>())
}

pub(crate) fn execution_config(
    executable: &Path,
    cwd: &Path,
    preferences_root: &Path,
) -> Result<Option<Value>, String> {
    let overrides = read_overrides(preferences_root)?;
    if overrides.is_empty() {
        return Ok(None);
    }
    Ok(Some(effective_config(
        &query_with_config(executable, cwd, None)?,
        &overrides,
    )))
}

#[tauri::command]
pub async fn set_codex_skill_enabled(
    app: AppHandle,
    path: String,
    enabled: bool,
) -> Result<Catalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = SKILL_WRITE
            .lock()
            .map_err(|_| "Skill preferences are unavailable.")?;
        let settings = app
            .state::<super::ProviderState>()
            .settings
            .lock()
            .map_err(|_| "Provider settings are unavailable.")?
            .providers
            .codex
            .clone();
        if !settings.enabled {
            return Err("Enable the Codex provider first.".into());
        }
        let executable = super::codex::resolve_executable(&settings)?;
        let cwd = super::agent_workspace_root(&app)?;
        let base = query_with_config(&executable, &cwd, None)?;
        if !base.skills.iter().any(|skill| skill.path == path) {
            return Err("This skill is no longer in the Codex catalog. Refresh the list.".into());
        }
        let mut overrides = read_overrides(&cwd)?;
        overrides.insert(path.clone(), enabled);
        // Verify with the CLI before committing; a rejected override must not look saved.
        let result = query_with_config(
            &executable,
            &cwd,
            Some(&effective_config(&base, &overrides)),
        )?;
        if !result
            .skills
            .iter()
            .any(|skill| skill.path == path && skill.enabled == enabled)
        {
            return Err(
                "This Codex version did not apply the skill preference. No change was saved."
                    .into(),
            );
        }
        write_overrides(&cwd, &overrides)?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexSkill {
    name: String,
    description: String,
    path: String,
    scope: String,
    enabled: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SkillError {
    path: Option<String>,
    message: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Catalog {
    cwd: String,
    skills: Vec<CodexSkill>,
    errors: Vec<SkillError>,
}

#[tauri::command]
pub async fn get_codex_skills(app: AppHandle) -> Result<Catalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = app
            .state::<super::ProviderState>()
            .settings
            .lock()
            .map_err(|_| "Provider settings are unavailable.")?
            .providers
            .codex
            .clone();
        if !settings.enabled {
            return Err("Enable the Codex provider to inspect its skills.".into());
        }
        let executable = super::codex::resolve_executable(&settings)?;
        super::skills::list_agent_skills(app.clone())?;
        let cwd = super::agent_workspace_root(&app)?;
        query(&executable, &cwd)
    })
    .await
    .map_err(|error| error.to_string())?
}

// Read the CLI's effective catalog, not an approximation from directory scans.
fn query(executable: &Path, cwd: &Path) -> Result<Catalog, String> {
    let config = execution_config(executable, cwd, cwd)?;
    query_with_config(executable, cwd, config.as_ref())
}

fn query_with_config(
    executable: &Path,
    cwd: &Path,
    config: Option<&Value>,
) -> Result<Catalog, String> {
    let mut command = Command::new(executable);
    if let Some(entries) = config.and_then(Value::as_array) {
        let entries: Vec<_> = entries
            .iter()
            .map(|entry| format!("{{path={},enabled={}}}", entry["path"], entry["enabled"]))
            .collect();
        command.args(["-c", &format!("skills.config=[{}]", entries.join(","))]);
    }
    command
        .arg("app-server")
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Codex could not start: {error}"))?;
    let mut input = child.stdin.take().expect("piped stdin");
    let output = child.stdout.take().expect("piped stdout");
    let (send, receive) = mpsc::channel();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            let Ok(line) = line else { break };
            if let Ok(value) = serde_json::from_str::<Value>(&line) {
                if send.send(value).is_err() {
                    break;
                }
            }
        }
    });
    let result = (|| {
        let deadline = std::time::Instant::now() + Duration::from_secs(20);
        let mut request = |value: Value| -> Result<(), String> {
            writeln!(input, "{value}")
                .and_then(|_| input.flush())
                .map_err(|error| error.to_string())
        };
        let response = |id: u64| -> Result<Value, String> {
            loop {
                let value = receive.recv_timeout(deadline.saturating_duration_since(std::time::Instant::now()))
                    .map_err(|_| "Codex skills could not be read within 20 seconds. Check the CLI and try again.".to_string())?;
                if value["id"] == id {
                    if let Some(error) = value.get("error") {
                        return Err(format!(
                            "Codex skills request failed: {}",
                            error["message"]
                                .as_str()
                                .unwrap_or("Unsupported CLI response")
                        ));
                    }
                    return value
                        .get("result")
                        .cloned()
                        .ok_or("Codex returned no result.".into());
                }
            }
        };
        request(
            json!({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "muttjobs_skills", "version": "1.0.0"}}}),
        )?;
        response(1)?;
        request(json!({"method": "initialized"}))?;
        request(
            json!({"id": 2, "method": "skills/list", "params": {"cwds": [cwd], "forceReload": true}}),
        )?;
        let result = response(2)?;
        let entry = result["data"]
            .as_array()
            .and_then(|data| data.first())
            .ok_or("Codex returned no workspace skill catalog.")?;
        serde_json::from_value(entry.clone())
            .map_err(|error| format!("Unrecognized Codex skill catalog: {error}"))
    })();
    drop(input);
    let _ = child.kill();
    let _ = child.wait();
    let _ = reader.join();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_preferences_round_trip_and_remain_isolated() {
        let project = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let mut preferences = BTreeMap::from([("C:/skills/dev/SKILL.md".to_string(), false)]);
        write_overrides(project.path(), &preferences).unwrap();
        assert_eq!(read_overrides(project.path()).unwrap(), preferences);
        preferences.insert("C:/skills/dev/SKILL.md".to_string(), true);
        write_overrides(project.path(), &preferences).unwrap();
        assert_eq!(read_overrides(project.path()).unwrap(), preferences);
        assert!(read_overrides(other.path()).unwrap().is_empty());
        fs::write(
            project.path().join(".agents/codex-skill-overrides.json"),
            "broken",
        )
        .unwrap();
        assert!(read_overrides(project.path()).is_err());
    }

    #[test]
    #[ignore = "requires installed Codex CLI"]
    fn live_project_toggle_is_isolated() {
        let executable =
            super::super::codex::resolve_executable(&super::super::CodexSettings::default())
                .unwrap();
        let project = tempfile::tempdir().unwrap();
        let baseline = query(&executable, project.path()).unwrap();
        let skill = baseline
            .skills
            .iter()
            .find(|s| s.enabled && s.scope == "user")
            .unwrap();
        write_overrides(
            project.path(),
            &BTreeMap::from([(skill.path.clone(), false)]),
        )
        .unwrap();
        let disabled = query(&executable, project.path()).unwrap();
        assert!(
            !disabled
                .skills
                .iter()
                .find(|s| s.path == skill.path)
                .unwrap()
                .enabled
        );
        let runtime = execution_config(&executable, project.path(), project.path())
            .unwrap()
            .unwrap();
        assert!(runtime
            .as_array()
            .unwrap()
            .iter()
            .any(|s| s["path"] == skill.path && s["enabled"] == false));
        let other = tempfile::tempdir().unwrap();
        assert!(
            query(&executable, other.path())
                .unwrap()
                .skills
                .iter()
                .find(|s| s.path == skill.path)
                .unwrap()
                .enabled
        );
        write_overrides(
            project.path(),
            &BTreeMap::from([(skill.path.clone(), true)]),
        )
        .unwrap();
        assert!(
            query(&executable, project.path())
                .unwrap()
                .skills
                .iter()
                .find(|s| s.path == skill.path)
                .unwrap()
                .enabled
        );
        println!("Verified project disable, runtime config, other-project isolation, and re-enable for {}", skill.name);
    }
    #[test]
    #[ignore = "requires installed Codex CLI"]
    fn live_codex_catalog() {
        let executable =
            super::super::codex::resolve_executable(&super::super::CodexSettings::default())
                .unwrap();
        let cwd = std::env::var("MUTTJOBS_SKILLS_TEST_CWD").unwrap();
        let catalog = query(&executable, Path::new(&cwd)).unwrap();
        println!(
            "Codex catalog: {} skills, {} errors",
            catalog.skills.len(),
            catalog.errors.len()
        );
        assert!(!catalog.skills.is_empty());
    }
}
