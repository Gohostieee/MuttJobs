mod codex;
pub(crate) mod job;
pub(crate) mod worker;

use std::{
    fs,
    path::Path,
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::Duration,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_store::StoreExt;

const SETTINGS_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CodexSettings {
    pub enabled: bool,
    pub executable_mode: String,
    pub executable_path: Option<String>,
    pub health_interval_seconds: u64,
    pub model_override: Option<String>,
    pub reasoning_effort: Option<String>,
}

impl Default for CodexSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            executable_mode: "automatic".into(),
            executable_path: None,
            health_interval_seconds: 300,
            model_override: None,
            reasoning_effort: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSettingsDocument {
    pub schema_version: u32,
    pub providers: ProvidersSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvidersSettings {
    pub codex: CodexSettings,
}

impl Default for ProviderSettingsDocument {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            providers: ProvidersSettings {
                codex: CodexSettings::default(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHealth {
    pub provider_id: String,
    pub state: String,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub authenticated: Option<bool>,
    pub checked_at: String,
    pub message: Option<String>,
}

impl ProviderHealth {
    fn checking() -> Self {
        Self {
            provider_id: "codex".into(),
            state: "checking".into(),
            executable_path: None,
            version: None,
            authenticated: None,
            checked_at: Utc::now().to_rfc3339(),
            message: None,
        }
    }
}

pub struct ProviderState {
    settings: Mutex<ProviderSettingsDocument>,
    health: Mutex<ProviderHealth>,
}

impl Default for ProviderState {
    fn default() -> Self {
        Self {
            settings: Mutex::new(ProviderSettingsDocument::default()),
            health: Mutex::new(ProviderHealth::checking()),
        }
    }
}

pub fn load_settings(app: &AppHandle) {
    let Ok(store) = app.store("provider-settings.json") else {
        return;
    };
    let Some(value) = store.get("provider-settings-document") else {
        return;
    };
    let Ok(document) = serde_json::from_value::<ProviderSettingsDocument>(value) else {
        return;
    };
    if document.schema_version == SETTINGS_SCHEMA_VERSION {
        *app.state::<ProviderState>()
            .settings
            .lock()
            .expect("provider settings lock") = document;
    }
}

fn save_settings(app: &AppHandle, document: &ProviderSettingsDocument) -> Result<(), String> {
    let store = app
        .store("provider-settings.json")
        .map_err(|error| error.to_string())?;
    store.set(
        "provider-settings-document",
        serde_json::to_value(document).map_err(|error| error.to_string())?,
    );
    store.save().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_provider_settings(state: State<'_, ProviderState>) -> ProviderSettingsDocument {
    state
        .settings
        .lock()
        .expect("provider settings lock")
        .clone()
}

#[tauri::command]
pub fn update_provider_settings(
    app: AppHandle,
    state: State<'_, ProviderState>,
    settings: CodexSettings,
) -> Result<ProviderSettingsDocument, String> {
    if settings.executable_mode != "automatic" && settings.executable_mode != "custom" {
        return Err("Invalid executable mode.".into());
    }
    if settings.executable_mode == "custom" {
        let path = settings
            .executable_path
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or("Choose an absolute Codex executable path.")?;
        if !Path::new(path).is_absolute() {
            return Err("The custom Codex path must be absolute.".into());
        }
    }

    let document = ProviderSettingsDocument {
        schema_version: SETTINGS_SCHEMA_VERSION,
        providers: ProvidersSettings { codex: settings },
    };
    save_settings(&app, &document)?;
    *state.settings.lock().expect("provider settings lock") = document.clone();

    let app_copy = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = refresh_health_internal(&app_copy);
    });
    Ok(document)
}

#[tauri::command]
pub fn get_provider_health(state: State<'_, ProviderState>) -> ProviderHealth {
    state.health.lock().expect("provider health lock").clone()
}

#[tauri::command]
pub async fn refresh_provider_health(app: AppHandle) -> Result<ProviderHealth, String> {
    tauri::async_runtime::spawn_blocking(move || refresh_health_internal(&app))
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn refresh_health_internal(app: &AppHandle) -> Result<ProviderHealth, String> {
    let state = app.state::<ProviderState>();
    let settings = state
        .settings
        .lock()
        .expect("provider settings lock")
        .providers
        .codex
        .clone();

    let checking = ProviderHealth::checking();
    *state.health.lock().expect("provider health lock") = checking.clone();
    let _ = app.emit("provider-health-changed", checking);

    let health = codex::check_health(app, &settings);
    *state.health.lock().expect("provider health lock") = health.clone();
    let _ = app.emit("provider-health-changed", &health);
    Ok(health)
}

#[allow(dead_code)]
pub(crate) fn require_available(
    app: &AppHandle,
) -> Result<(ProviderHealth, CodexSettings), String> {
    let state = app.state::<ProviderState>();
    let settings = state
        .settings
        .lock()
        .expect("provider settings lock")
        .providers
        .codex
        .clone();
    let health = codex::check_health(app, &settings);
    *state.health.lock().expect("provider health lock") = health.clone();
    let _ = app.emit("provider-health-changed", &health);

    if health.state != "available" {
        return Err(health
            .message
            .clone()
            .unwrap_or_else(|| "Codex is not available. Open Provider Settings.".into()));
    }
    Ok((health, settings))
}

pub(crate) fn run_resume_edit(
    app: &tauri::AppHandle,
    target: &Path,
    user_prompt: &str,
) -> Result<(Value, String, bool), String> {
    let (_, settings) = require_available(app)?;
    let codex_path = codex::resolve_executable(&settings)?;
    let root = target
        .parent()
        .ok_or("The resume JSON has no parent directory.")?
        .to_path_buf();
    let file_name = target
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .ok_or("The resume JSON has no file name.")?;
    let before_content = fs::read_to_string(target).map_err(|error| error.to_string())?;
    let before = serde_json::from_str::<Value>(&before_content)
        .map_err(|error| format!("The resume JSON could not be read: {error}"))?;
    let job_id = format!(
        "resume-edit-{}",
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
    );
    let prompt = format!(
        "You are editing one local resume JSON file in a desktop resume editor.\n\n\
         The working directory is the folder containing the resume. Read the existing file `{file_name}`.\n\
         Apply the user's request to that file and write the updated JSON back to the same file.\n\
         Do not create, delete, or modify any other file. Preserve every unrelated field, array item,\
         style setting, and schema detail. Keep the result valid JSON for the existing resume format.\n\n\
         User request:\n{user_prompt}\n\n\
         After you save the file, return a concise JSON object with this exact shape:\n\
         {{\"response\": \"A concise markdown summary of what you changed\", \"changed\": true}}",
    );
    let output_schema = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["response", "changed"],
        "properties": {
            "response": { "type": "string" },
            "changed": { "type": "boolean" }
        }
    });
    let cancelled = Arc::new(AtomicBool::new(false));
    let output = match job::run(
        app,
        job::JobRequest {
            id: &job_id,
            kind: "resume_edit",
            root: &root,
            codex_path: &codex_path,
            prompt: &prompt,
            output_schema,
            model: settings.model_override.clone(),
            reasoning_effort: settings.reasoning_effort.clone(),
            sandbox_mode: "workspace-write",
        },
        &cancelled,
        |_| {},
    ) {
        Ok(output) => output,
        Err(error) => {
            if let Err(restore_error) = fs::write(target, &before_content) {
                return Err(format!(
                    "{error}; restoring the previous resume version also failed: {restore_error}"
                ));
            }
            return Err(error);
        }
    };

    let after_content = fs::read_to_string(target).map_err(|error| error.to_string())?;
    let after = match serde_json::from_str::<Value>(&after_content) {
        Ok(value) => value,
        Err(error) => {
            let restore_error = fs::write(target, &before_content).err();
            return Err(match restore_error {
                Some(restore_error) => format!(
                    "Codex left an invalid resume JSON file: {error}; restoring the previous version also failed: {restore_error}"
                ),
                None => format!("Codex left an invalid resume JSON file: {error}"),
            });
        }
    };
    let valid_shape = after.as_object().is_some_and(|object| {
        ["basics", "summary", "sections", "metadata"]
            .iter()
            .all(|key| object.contains_key(*key))
    });
    if !valid_shape {
        if let Err(restore_error) = fs::write(target, &before_content) {
            return Err(format!(
                "Codex returned an invalid resume shape; restoring the previous version also failed: {restore_error}"
            ));
        }
        return Err(
            "Codex returned an invalid resume shape; the previous version was restored.".into(),
        );
    }
    let response = output
        .get("response")
        .and_then(Value::as_str)
        .unwrap_or("Resume update completed.")
        .to_string();
    let changed = before != after;
    Ok((after, response, changed))
}

pub fn start_health_scheduler(app: AppHandle) {
    let scheduler_app = app.clone();
    std::thread::spawn(move || loop {
        let interval = scheduler_app
            .state::<ProviderState>()
            .settings
            .lock()
            .expect("provider settings lock")
            .providers
            .codex
            .health_interval_seconds;

        if interval == 0 {
            std::thread::sleep(Duration::from_secs(30));
            continue;
        }

        std::thread::sleep(Duration::from_secs(interval.max(10)));
        let _ = refresh_health_internal(&scheduler_app);
    });

    tauri::async_runtime::spawn_blocking(move || {
        let _ = refresh_health_internal(&app);
    });
}
