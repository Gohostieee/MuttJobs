use serde::Serialize;
use serde_json::Value;
use std::{fs, path::PathBuf, time::UNIX_EPOCH};
use tauri::{AppHandle, Manager};

mod providers;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResumeFile {
    id: String,
    file_name: String,
    path: String,
    updated_at: u64,
    data: serde_json::Value,
}

fn resumes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("resumes");
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;

    let has_json = fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .flatten()
        .any(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
        });

    if !has_json {
        fs::write(
            directory.join("joshua-rodriguez.json"),
            include_str!("../../public/sample-resume.json"),
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(directory)
}

#[tauri::command]
fn get_resumes_directory(app: AppHandle) -> Result<String, String> {
    Ok(resumes_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn list_resumes(app: AppHandle) -> Result<Vec<ResumeFile>, String> {
    let mut resumes = Vec::new();
    for entry in fs::read_dir(resumes_dir(&app)?).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if !path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
        {
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(data) = serde_json::from_str(&content) else {
            continue;
        };
        let updated_at = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_secs());

        resumes.push(ResumeFile {
            id: path.to_string_lossy().to_string(),
            file_name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            updated_at,
            data,
        });
    }
    resumes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(resumes)
}

#[tauri::command]
fn create_resume(app: AppHandle, name: String) -> Result<ResumeFile, String> {
    let directory = resumes_dir(&app)?;
    let display_name = name.trim();
    if display_name.is_empty() {
        return Err("Resume name cannot be empty.".to_string());
    }

    let stem = sanitize_resume_stem(display_name);
    let mut index = 1;
    let file_name = loop {
        let candidate = if index == 1 {
            format!("{stem}.json")
        } else {
            format!("{stem}-{index}.json")
        };

        if !directory.join(&candidate).exists() {
            break candidate;
        }
        index += 1;
    };

    let path = directory.join(&file_name);
    let mut data: serde_json::Value =
        serde_json::from_str(include_str!("../../public/empty-resume.json"))
            .map_err(|error| error.to_string())?;
    data["basics"]["name"] = serde_json::Value::String(display_name.to_string());
    let content = serde_json::to_string_pretty(&data).map_err(|error| error.to_string())?;
    fs::write(&path, format!("{content}\n")).map_err(|error| error.to_string())?;
    let updated_at = path
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());

    Ok(ResumeFile {
        id: path.to_string_lossy().to_string(),
        file_name,
        path: path.to_string_lossy().to_string(),
        updated_at,
        data,
    })
}

#[tauri::command]
fn save_resume(
    app: AppHandle,
    path: String,
    data: serde_json::Value,
) -> Result<ResumeFile, String> {
    let directory = fs::canonicalize(resumes_dir(&app)?).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(PathBuf::from(&path)).map_err(|error| error.to_string())?;

    if target.parent() != Some(directory.as_path())
        || !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err("Resume files can only be saved inside the resumes directory.".to_string());
    }

    let content = serde_json::to_string_pretty(&data).map_err(|error| error.to_string())?;
    fs::write(&target, format!("{content}\n")).map_err(|error| error.to_string())?;
    let updated_at = target
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());
    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled-resume.json".to_string());
    let target_string = target.to_string_lossy().to_string();

    Ok(ResumeFile {
        id: target_string.clone(),
        file_name,
        path: target_string,
        updated_at,
        data,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResumeAiResult {
    data: Value,
    response: String,
    changed: bool,
}

#[tauri::command]
async fn run_resume_ai_job(
    app: AppHandle,
    path: String,
    prompt: String,
) -> Result<ResumeAiResult, String> {
    if prompt.trim().is_empty() {
        return Err("Tell Codex what you would like to change first.".into());
    }
    if prompt.len() > 20_000 {
        return Err("That request is too long. Keep it under 20,000 characters.".into());
    }

    let directory = fs::canonicalize(resumes_dir(&app)?).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(PathBuf::from(&path)).map_err(|error| error.to_string())?;
    if target.parent() != Some(directory.as_path())
        || !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err("Resume AI can only edit JSON files inside the resumes directory.".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (data, response, changed) = providers::run_resume_edit(&app, &target, &prompt)?;
        Ok(ResumeAiResult {
            data,
            response,
            changed,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn sanitize_resume_stem(name: &str) -> String {
    let mut stem = String::new();
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            stem.push(character.to_ascii_lowercase());
        } else if !stem.ends_with('-') {
            stem.push('-');
        }
    }

    let stem = stem.trim_matches('-');
    if stem.is_empty() {
        "untitled-resume".to_string()
    } else {
        stem.chars().take(80).collect()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(providers::ProviderState::default())
        .invoke_handler(tauri::generate_handler![
            list_resumes,
            get_resumes_directory,
            create_resume,
            save_resume,
            run_resume_ai_job,
            providers::get_provider_settings,
            providers::update_provider_settings,
            providers::get_provider_health,
            providers::refresh_provider_health
        ])
        .setup(|app| {
            providers::load_settings(app.handle());
            providers::start_health_scheduler(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
