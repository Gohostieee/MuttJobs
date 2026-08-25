use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use base64::Engine;
#[cfg(windows)]
use std::sync::mpsc;
#[cfg(windows)]
use std::time::Duration;
#[cfg(windows)]
use tauri::WebviewWindow;
#[cfg(windows)]
use webview2_com::{
    CallDevToolsProtocolMethodCompletedHandler, Microsoft::Web::WebView2::Win32::ICoreWebView2,
};
#[cfg(windows)]
use windows::core::HSTRING;

mod data_backup;
mod providers;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResumeFile {
    pub(crate) id: String,
    pub(crate) file_name: String,
    pub(crate) path: String,
    pub(crate) updated_at: u64,
    pub(crate) data: serde_json::Value,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResumeImportJob {
    job_id: String,
    status: String,
    pdf_file_name: String,
    resume_name: Option<String>,
    resume_file_name: Option<String>,
    provider: String,
    model: Option<String>,
    effort: Option<String>,
    stage: String,
    activities: Vec<Value>,
    response: Option<String>,
    error: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProfileResumeImportResult {
    profile: Value,
    response: String,
}

static RESUME_IMPORT_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static ACTIVE_RESUME_IMPORTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[cfg(windows)]
const RESUME_PDF_TIMEOUT: Duration = Duration::from_secs(45);

#[cfg(windows)]
#[derive(Deserialize)]
struct DevToolsPdfResult {
    data: String,
}

#[cfg(windows)]
#[tauri::command]
async fn export_resume_pdf(window: WebviewWindow, path: String) -> Result<(), String> {
    let destination = validate_pdf_destination(&path)?;
    let (sender, receiver) = mpsc::sync_channel::<Result<String, String>>(1);

    window
        .with_webview(move |platform_webview| {
            let result = start_tagged_pdf_export(platform_webview.controller(), sender.clone());
            if let Err(error) = result {
                let _ = sender.send(Err(error));
            }
        })
        .map_err(|error| format!("The resume renderer could not start PDF export: {error}"))?;

    let response = tauri::async_runtime::spawn_blocking(move || {
        receiver.recv_timeout(RESUME_PDF_TIMEOUT).map_err(|_| {
            "PDF export timed out while waiting for the desktop renderer.".to_string()
        })?
    })
    .await
    .map_err(|error| format!("The PDF export task could not finish: {error}"))??;

    let result: DevToolsPdfResult = serde_json::from_str(&response).map_err(|error| {
        format!("The desktop renderer returned an invalid PDF response: {error}")
    })?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(result.data)
        .map_err(|error| format!("The generated PDF could not be decoded: {error}"))?;

    if !bytes.starts_with(b"%PDF-") {
        return Err("The desktop renderer did not return a valid PDF file.".to_string());
    }

    fs::write(&destination, bytes).map_err(|error| {
        format!(
            "The PDF could not be saved to {}: {error}",
            destination.display()
        )
    })
}

#[cfg(not(windows))]
#[tauri::command]
fn export_resume_pdf() -> Result<(), String> {
    Err("Direct ATS PDF export is currently available on Windows only.".to_string())
}

#[cfg(windows)]
fn validate_pdf_destination(path: &str) -> Result<PathBuf, String> {
    let destination = PathBuf::from(path);
    if !destination.is_absolute() {
        return Err("Choose an absolute destination for the PDF.".to_string());
    }
    if destination
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        != Some("pdf".to_string())
    {
        return Err("The exported resume must use a .pdf file name.".to_string());
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "The PDF destination has no parent folder.".to_string())?;
    if !parent.is_dir() {
        return Err("The selected PDF folder does not exist.".to_string());
    }
    Ok(destination)
}

#[cfg(windows)]
fn start_tagged_pdf_export(
    controller: webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    sender: mpsc::SyncSender<Result<String, String>>,
) -> Result<(), String> {
    let webview: ICoreWebView2 = unsafe { controller.CoreWebView2() }
        .map_err(|error| format!("The WebView2 document is unavailable: {error}"))?;
    let method = HSTRING::from("Page.printToPDF");
    let parameters = HSTRING::from(
        r#"{"displayHeaderFooter":false,"printBackground":true,"preferCSSPageSize":true,"marginTop":0,"marginBottom":0,"marginLeft":0,"marginRight":0,"generateTaggedPDF":true}"#,
    );
    let handler =
        CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, response| {
            let result = status
                .map(|_| response)
                .map_err(|error| format!("The tagged PDF renderer failed: {error}"));
            let _ = sender.send(result);
            Ok(())
        }));

    unsafe { webview.CallDevToolsProtocolMethod(&method, &parameters, &handler) }
        .map_err(|error| format!("The tagged PDF renderer could not be called: {error}"))
}

fn resume_import_lock() -> &'static Mutex<()> {
    RESUME_IMPORT_LOCK.get_or_init(|| Mutex::new(()))
}

fn active_resume_imports() -> &'static Mutex<HashSet<String>> {
    ACTIVE_RESUME_IMPORTS.get_or_init(|| Mutex::new(HashSet::new()))
}

pub(crate) fn has_active_resume_imports() -> bool {
    active_resume_imports()
        .lock()
        .map(|active| !active.is_empty())
        .unwrap_or(true)
}

fn resume_import_directory(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resumes_dir(app)?.join(".muttjobs-imports"))
}

fn resume_import_jobs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(resume_import_directory(app)?.join("jobs.json"))
}

fn read_resume_import_jobs(app: &AppHandle) -> Result<Vec<ResumeImportJob>, String> {
    let path = resume_import_jobs_path(app)?;
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("Resume import jobs could not be read: {error}")),
    };
    serde_json::from_str(&content)
        .map_err(|error| format!("Resume import jobs are invalid: {error}"))
}

fn write_resume_import_jobs(app: &AppHandle, jobs: &[ResumeImportJob]) -> Result<(), String> {
    let directory = resume_import_directory(app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Resume import storage could not be created: {error}"))?;
    let path = directory.join("jobs.json");
    let temporary = directory.join(format!("jobs-{}.json.tmp", import_nonce()));
    let content = serde_json::to_string_pretty(jobs)
        .map_err(|error| format!("Resume import jobs could not be serialized: {error}"))?;
    fs::write(&temporary, format!("{content}\n"))
        .map_err(|error| format!("Resume import jobs could not be staged: {error}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|error| {
            format!("Existing resume import jobs could not be replaced: {error}")
        })?;
    }
    fs::rename(&temporary, &path)
        .map_err(|error| format!("Resume import jobs could not be saved: {error}"))
}

fn update_resume_import_job<F>(
    app: &AppHandle,
    job_id: &str,
    update: F,
) -> Result<ResumeImportJob, String>
where
    F: FnOnce(&mut ResumeImportJob),
{
    let _guard = resume_import_lock()
        .lock()
        .map_err(|_| "Resume import state is unavailable.".to_string())?;
    let mut jobs = read_resume_import_jobs(app)?;
    let job = jobs
        .iter_mut()
        .find(|job| job.job_id == job_id)
        .ok_or_else(|| "The resume import job no longer exists.".to_string())?;
    update(job);
    job.updated_at = chrono::Utc::now().to_rfc3339();
    let snapshot = job.clone();
    write_resume_import_jobs(app, &jobs)?;
    Ok(snapshot)
}

fn remove_resume_import_job(app: &AppHandle, job_id: &str) -> Result<(), String> {
    let _guard = resume_import_lock()
        .lock()
        .map_err(|_| "Resume import state is unavailable.".to_string())?;
    let mut jobs = read_resume_import_jobs(app)?;
    jobs.retain(|job| job.job_id != job_id);
    write_resume_import_jobs(app, &jobs)
}

fn emit_resume_import_job(app: &AppHandle, job: &ResumeImportJob) {
    let _ = app.emit(
        "resume-import-event",
        serde_json::json!({ "jobId": job.job_id, "job": job }),
    );
}

fn import_nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    )
}

fn resumes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = providers::agent_workspace_root(app)?;
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

fn cover_letters_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let resumes = providers::agent_workspace_root(app)?;
    let app_data = resumes
        .parent()
        .ok_or("The app data directory could not be determined.")?;
    let directory = app_data.join("cover-letters");
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
            directory.join("jordan-lee-northstar.json"),
            include_str!("../../public/sample-cover-letter.json"),
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(directory)
}

const JOB_FOCUSED_COVER_LETTER_FILE_NAME: &str = "cover-letter.json";

fn job_focused_cover_letter_path(app: &AppHandle, job_id: i64) -> Result<PathBuf, String> {
    if job_id <= 0 {
        return Err("The job ID must be positive.".into());
    }

    let jobs_directory = providers::revealed_job_path(app, job_id)?
        .parent()
        .ok_or("The local jobs directory could not be determined.")?
        .to_path_buf();
    Ok(jobs_directory
        .join(job_id.to_string())
        .join(JOB_FOCUSED_COVER_LETTER_FILE_NAME))
}

fn load_job_document(app: &AppHandle, job_id: i64) -> Result<Value, String> {
    let path = providers::revealed_job_path(app, job_id)?;
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("The saved job could not be read: {error}"))?;
    let job = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("The saved job JSON is invalid: {error}"))?;
    if job.get("id").and_then(Value::as_i64) != Some(job_id) {
        return Err(format!(
            "The saved job does not match the requested job ID {job_id}."
        ));
    }
    Ok(job)
}

fn cover_letter_file_from_path(path: &Path) -> Result<ResumeFile, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("The job cover letter could not be read: {error}"))?;
    let data = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("The job cover letter is not valid JSON: {error}"))?;
    if !data.is_object() {
        return Err("The job cover letter must contain a JSON object.".into());
    }

    let path_string = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| JOB_FOCUSED_COVER_LETTER_FILE_NAME.to_string());
    let updated_at = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());

    Ok(ResumeFile {
        id: path_string.clone(),
        file_name,
        path: path_string,
        updated_at,
        data,
    })
}

fn is_job_cover_letter_path(app: &AppHandle, target: &Path, job_id: i64) -> Result<bool, String> {
    let expected = fs::canonicalize(job_focused_cover_letter_path(app, job_id)?)
        .map_err(|error| format!("The job cover letter could not be resolved: {error}"))?;
    Ok(expected == target)
}

#[tauri::command]
fn load_or_create_job_cover_letter(app: AppHandle, job_id: i64) -> Result<ResumeFile, String> {
    let job = load_job_document(&app, job_id)?;
    let path = job_focused_cover_letter_path(&app, job_id)?;
    if path.is_file() {
        return cover_letter_file_from_path(&path);
    }

    let directory = path
        .parent()
        .ok_or("The job cover letter directory could not be determined.")?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("The job cover letter directory could not be created: {error}"))?;

    let mut data: Value =
        serde_json::from_str(include_str!("../../public/empty-cover-letter.json"))
            .map_err(|error| error.to_string())?;
    if let Some(company) = job
        .get("company")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        data["recipient"]["company"] = Value::String(company.trim().to_string());
    }
    if let Some(title) = job
        .get("jobTitle")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
    {
        data["position"]["title"] = Value::String(title.trim().to_string());
    }

    let primary_resume_path = directory.join("primary-resume.json");
    if let Ok(resume_content) = fs::read_to_string(primary_resume_path) {
        if let Ok(resume) = serde_json::from_str::<Value>(&resume_content) {
            if let Some(basics) = resume.get("basics").and_then(Value::as_object) {
                if let Some(name) = basics
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                {
                    let name = Value::String(name.trim().to_string());
                    data["applicant"]["name"] = name.clone();
                    data["closing"]["name"] = name;
                }
                for key in ["email", "phone"] {
                    if let Some(value) = basics
                        .get(key)
                        .and_then(Value::as_str)
                        .filter(|value| !value.trim().is_empty())
                    {
                        data["applicant"][key] = Value::String(value.trim().to_string());
                    }
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&data)
        .map_err(|error| format!("The job cover letter could not be serialized: {error}"))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|error| format!("The job cover letter could not be saved: {error}"))?;
    cover_letter_file_from_path(&path)
}

fn cover_letter_has_draft(data: &Value) -> bool {
    let content = match data.get("content").and_then(Value::as_object) {
        Some(content) => content,
        None => return false,
    };
    let has_text = |value: Option<&Value>| {
        value
            .and_then(Value::as_str)
            .is_some_and(|text| !text.trim().is_empty())
    };

    has_text(content.get("opening"))
        || content
            .get("body")
            .and_then(Value::as_array)
            .is_some_and(|body| body.iter().any(|paragraph| has_text(Some(paragraph))))
        || has_text(content.get("closingParagraph"))
}

#[cfg(test)]
mod cover_letter_draft_tests {
    use super::cover_letter_has_draft;

    #[test]
    fn empty_cover_letter_scaffold_is_not_a_draft() {
        let data = serde_json::json!({
            "content": { "opening": "", "body": ["  "], "closingParagraph": "" }
        });
        assert!(!cover_letter_has_draft(&data));
    }

    #[test]
    fn substantive_cover_letter_content_is_a_draft() {
        let data = serde_json::json!({
            "content": { "opening": "I am applying for this role.", "body": [""], "closingParagraph": "" }
        });
        assert!(cover_letter_has_draft(&data));
    }
}

#[tauri::command]
fn job_cover_letter_is_drafted(app: AppHandle, job_id: i64) -> Result<bool, String> {
    let path = job_focused_cover_letter_path(&app, job_id)?;
    if !path.is_file() {
        return Ok(false);
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("The job cover letter could not be read: {error}"))?;
    let data = serde_json::from_str::<Value>(&content)
        .map_err(|error| format!("The job cover letter is not valid JSON: {error}"))?;
    Ok(cover_letter_has_draft(&data))
}

#[tauri::command]
fn save_job_cover_letter(app: AppHandle, job_id: i64, data: Value) -> Result<ResumeFile, String> {
    if !data.is_object() {
        return Err("The job cover letter must contain a JSON object.".into());
    }

    let _job = load_job_document(&app, job_id)?;
    let path = job_focused_cover_letter_path(&app, job_id)?;
    if !path.is_file() {
        return Err(
            "The job cover letter is unavailable. Reopen the cover letter step to create it."
                .into(),
        );
    }

    let content = serde_json::to_string_pretty(&data)
        .map_err(|error| format!("The job cover letter could not be serialized: {error}"))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|error| format!("The job cover letter could not be saved: {error}"))?;
    cover_letter_file_from_path(&path)
}

#[tauri::command]
fn get_resumes_directory(app: AppHandle) -> Result<String, String> {
    Ok(resumes_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn get_cover_letters_directory(app: AppHandle) -> Result<String, String> {
    Ok(cover_letters_dir(&app)?.to_string_lossy().to_string())
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
fn list_cover_letters(app: AppHandle) -> Result<Vec<ResumeFile>, String> {
    let mut letters = Vec::new();
    for entry in fs::read_dir(cover_letters_dir(&app)?).map_err(|error| error.to_string())? {
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

        letters.push(ResumeFile {
            id: path.to_string_lossy().to_string(),
            file_name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            updated_at,
            data,
        });
    }
    letters.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(letters)
}

#[tauri::command]
fn create_resume(app: AppHandle, name: String) -> Result<ResumeFile, String> {
    let directory = resumes_dir(&app)?;
    let display_name = name.trim();
    if display_name.is_empty() {
        return Err("Resume name cannot be empty.".to_string());
    }

    let (file_name, path) = allocate_resume_path(&directory, display_name);
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
async fn create_resume_from_pdf(
    app: AppHandle,
    pdf_path: String,
    name: Option<String>,
) -> Result<ResumeFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        create_resume_from_pdf_blocking(&app, &pdf_path, name)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn create_resume_from_pdf_blocking(
    app: &AppHandle,
    pdf_path: &str,
    name: Option<String>,
) -> Result<ResumeFile, String> {
    const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

    let source = fs::canonicalize(pdf_path)
        .map_err(|error| format!("The selected PDF could not be opened: {error}"))?;
    if !source.is_file() {
        return Err("The selected PDF is not a file.".into());
    }
    if !source
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        return Err("Choose a PDF file to import.".into());
    }
    let source_size = fs::metadata(&source)
        .map_err(|error| format!("The selected PDF could not be inspected: {error}"))?
        .len();
    if source_size > MAX_IMPORT_BYTES {
        return Err("That PDF is larger than 25 MB. Choose a smaller resume PDF.".into());
    }

    let directory = resumes_dir(app)?;
    let requested_name = name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let display_name = requested_name.unwrap_or("Imported resume");
    let (file_name, target) = allocate_resume_path(&directory, display_name);

    let mut empty_data: Value =
        serde_json::from_str(include_str!("../../public/empty-resume.json"))
            .map_err(|error| error.to_string())?;
    if requested_name.is_some() {
        empty_data["basics"]["name"] = Value::String(display_name.to_string());
    }
    let empty_content =
        serde_json::to_string_pretty(&empty_data).map_err(|error| error.to_string())?;
    if let Err(error) = fs::write(&target, format!("{empty_content}\n")) {
        return Err(error.to_string());
    }

    let import_directory = directory.join(".muttjobs-imports");
    if let Err(error) = fs::create_dir_all(&import_directory) {
        let _ = fs::remove_file(&target);
        return Err(format!(
            "The temporary PDF import directory could not be created: {error}"
        ));
    }
    let import_token = format!(
        "{}-{}",
        std::process::id(),
        UNIX_EPOCH
            .elapsed()
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    );
    let staged_pdf = import_directory.join(format!("resume-import-{import_token}.pdf"));
    if let Err(error) = fs::copy(&source, &staged_pdf) {
        let _ = fs::remove_file(&target);
        let _ = fs::remove_dir(&import_directory);
        return Err(format!(
            "The selected PDF could not be staged for Codex: {error}"
        ));
    }

    let import_result = providers::run_resume_pdf_import(app, &target, &staged_pdf, requested_name);
    let _ = fs::remove_file(&staged_pdf);
    let _ = fs::remove_dir(&import_directory);

    let (data, response, changed) = match import_result {
        Ok(result) => result,
        Err(error) => {
            let _ = fs::remove_file(&target);
            return Err(error);
        }
    };
    if !changed || !has_imported_resume_content(&data) {
        let _ = fs::remove_file(&target);
        let detail = if response.trim().is_empty() {
            "Codex did not find usable resume content in that PDF.".to_string()
        } else {
            format!(
                "Codex could not import usable resume content: {}",
                response.trim()
            )
        };
        return Err(detail);
    }

    let updated_at = target
        .metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());
    let target_string = target.to_string_lossy().to_string();
    Ok(ResumeFile {
        id: target_string.clone(),
        file_name,
        path: target_string,
        updated_at,
        data,
    })
}

#[tauri::command]
async fn import_profile_from_resume_pdf(
    app: AppHandle,
    pdf_path: String,
    profile: Value,
    provider: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<ProfileResumeImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        import_profile_from_resume_pdf_blocking(&app, &pdf_path, profile, provider, model, effort)
    })
    .await
    .map_err(|error| format!("The Career Profile import task could not finish: {error}"))?
}

fn import_profile_from_resume_pdf_blocking(
    app: &AppHandle,
    pdf_path: &str,
    profile: Value,
    provider: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<ProfileResumeImportResult, String> {
    const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;
    const PROFILE_ROOT_KEYS: [&str; 7] = [
        "picture",
        "basics",
        "summary",
        "sections",
        "customSections",
        "metadata",
        "profile",
    ];

    let profile_object = profile
        .as_object()
        .ok_or("The current Career Profile must be a JSON object.")?;
    if !PROFILE_ROOT_KEYS
        .iter()
        .all(|key| profile_object.contains_key(*key))
        || !profile_object.get("profile").is_some_and(Value::is_object)
    {
        return Err("The current Career Profile does not match the required profile shape.".into());
    }
    let preserved_profile = profile["profile"].clone();
    let preserved_picture = profile["picture"].clone();
    let preserved_metadata = profile["metadata"].clone();

    let source = fs::canonicalize(pdf_path)
        .map_err(|error| format!("The selected PDF could not be opened: {error}"))?;
    if !source.is_file()
        || !source
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        return Err("Choose a PDF resume to import.".into());
    }
    let source_size = fs::metadata(&source)
        .map_err(|error| format!("The selected PDF could not be inspected: {error}"))?
        .len();
    if source_size > MAX_IMPORT_BYTES {
        return Err("That PDF is larger than 25 MB. Choose a smaller resume PDF.".into());
    }

    let provider_id = provider.unwrap_or_else(|| "codex".into());
    if !matches!(provider_id.as_str(), "codex" | "claude-code") {
        return Err("Choose a supported agent provider.".into());
    }
    let import_root = resume_import_directory(app)?;
    let workspace = import_root.join(format!("profile-import-{}", import_nonce()));
    fs::create_dir_all(&workspace).map_err(|error| {
        format!("The Career Profile import workspace could not be created: {error}")
    })?;

    let target = workspace.join("profile.json");
    let staged_pdf = workspace.join("resume.pdf");
    let result = (|| {
        let content = serde_json::to_string_pretty(&profile)
            .map_err(|error| format!("The Career Profile could not be serialized: {error}"))?;
        fs::write(&target, format!("{content}\n")).map_err(|error| {
            format!("The Career Profile import target could not be prepared: {error}")
        })?;
        fs::copy(&source, &staged_pdf)
            .map_err(|error| format!("The selected PDF could not be staged for import: {error}"))?;

        let (imported, response, _changed) = providers::run_profile_pdf_import_with_options(
            app,
            &target,
            &staged_pdf,
            &provider_id,
            clean_import_option(model),
            clean_import_option(effort),
        )?;
        if imported.get("profile") != Some(&preserved_profile)
            || imported.get("picture") != Some(&preserved_picture)
            || imported.get("metadata") != Some(&preserved_metadata)
        {
            return Err(
                "The agent changed protected Career Profile preferences or presentation settings; the import was discarded."
                    .into(),
            );
        }
        if !has_imported_resume_content(&imported) {
            return Err("The agent did not find usable resume content in that PDF.".into());
        }

        Ok(ProfileResumeImportResult {
            profile: imported,
            response,
        })
    })();

    let _ = fs::remove_dir_all(&workspace);
    result
}

#[tauri::command]
fn list_resume_import_jobs(app: AppHandle) -> Result<Vec<ResumeImportJob>, String> {
    let active = active_resume_imports()
        .lock()
        .map_err(|_| "Resume import state is unavailable.".to_string())?
        .clone();
    let _guard = resume_import_lock()
        .lock()
        .map_err(|_| "Resume import state is unavailable.".to_string())?;
    let mut jobs = read_resume_import_jobs(&app)?;
    let mut changed = false;

    jobs.retain(|job| {
        if job.status == "completed" {
            changed = true;
            return false;
        }
        true
    });
    for job in &mut jobs {
        if matches!(job.status.as_str(), "queued" | "running") && !active.contains(&job.job_id) {
            job.status = "failed".into();
            job.stage = "Import interrupted".into();
            job.error = Some(
                "The app closed before this resume finished importing. Start the import again to continue."
                    .into(),
            );
            job.updated_at = chrono::Utc::now().to_rfc3339();
            changed = true;
        }
    }
    if changed {
        write_resume_import_jobs(&app, &jobs)?;
    }
    jobs.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(jobs)
}

#[tauri::command]
fn start_resume_pdf_import(
    app: AppHandle,
    pdf_path: String,
    name: Option<String>,
    provider: Option<String>,
    model: Option<String>,
    effort: Option<String>,
) -> Result<ResumeImportJob, String> {
    const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

    let source = fs::canonicalize(&pdf_path)
        .map_err(|error| format!("The selected PDF could not be opened: {error}"))?;
    if !source.is_file() {
        return Err("The selected PDF is not a file.".into());
    }
    if !source
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
    {
        return Err("Choose a PDF file to import.".into());
    }
    let source_size = fs::metadata(&source)
        .map_err(|error| format!("The selected PDF could not be inspected: {error}"))?
        .len();
    if source_size > MAX_IMPORT_BYTES {
        return Err("That PDF is larger than 25 MB. Choose a smaller resume PDF.".into());
    }

    let provider_id = provider.unwrap_or_else(|| "codex".into());
    if !matches!(provider_id.as_str(), "codex" | "claude-code") {
        return Err("Choose a supported agent provider.".into());
    }
    let model = clean_import_option(model);
    let effort = clean_import_option(effort);
    let requested_name = clean_import_option(name);
    let resume_directory = resumes_dir(&app)?;
    let import_directory = resume_import_directory(&app)?;
    fs::create_dir_all(&import_directory)
        .map_err(|error| format!("The resume import workspace could not be created: {error}"))?;

    let job_id = format!("resume-import-{}", import_nonce());
    let staged_pdf = import_directory.join(format!("{job_id}.pdf"));
    let target = import_directory.join(format!("{job_id}.json"));
    let display_name = requested_name
        .as_deref()
        .unwrap_or("Imported resume")
        .to_string();
    let mut empty_data: Value =
        serde_json::from_str(include_str!("../../public/empty-resume.json"))
            .map_err(|error| error.to_string())?;
    if requested_name.is_some() {
        empty_data["basics"]["name"] = Value::String(display_name.clone());
    }
    let empty_content =
        serde_json::to_string_pretty(&empty_data).map_err(|error| error.to_string())?;
    if let Err(error) = fs::write(&target, format!("{empty_content}\n")) {
        return Err(format!(
            "The resume import workspace could not be prepared: {error}"
        ));
    }
    if let Err(error) = fs::copy(&source, &staged_pdf) {
        let _ = fs::remove_file(&target);
        return Err(format!(
            "The selected PDF could not be staged for import: {error}"
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    let job = ResumeImportJob {
        job_id: job_id.clone(),
        status: "queued".into(),
        pdf_file_name: source
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_else(|| "resume.pdf".into()),
        resume_name: requested_name.clone(),
        resume_file_name: None,
        provider: provider_id.clone(),
        model: model.clone(),
        effort: effort.clone(),
        stage: "Queued for background import".into(),
        activities: Vec::new(),
        response: None,
        error: None,
        created_at: now.clone(),
        updated_at: now,
    };

    active_resume_imports()
        .lock()
        .map_err(|_| "Resume import state is unavailable.".to_string())?
        .insert(job_id.clone());
    let persist_result = {
        let _guard = resume_import_lock()
            .lock()
            .map_err(|_| "Resume import state is unavailable.".to_string())?;
        let mut jobs = read_resume_import_jobs(&app)?;
        jobs.retain(|existing| existing.job_id != job_id);
        jobs.push(job.clone());
        write_resume_import_jobs(&app, &jobs)
    };
    if let Err(error) = persist_result {
        let _ = active_resume_imports()
            .lock()
            .map(|mut active| active.remove(&job_id));
        let _ = fs::remove_file(&target);
        let _ = fs::remove_file(&staged_pdf);
        return Err(error);
    }
    emit_resume_import_job(&app, &job);

    let task_app = app.clone();
    let task_requested_name = requested_name.clone();
    let task_provider = provider_id.clone();
    let task_model = model.clone();
    let task_effort = effort.clone();
    let task_job_id = job_id.clone();
    let task_resume_directory = resume_directory.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || {
        run_resume_pdf_import_background(
            task_app,
            task_job_id,
            task_resume_directory,
            target,
            staged_pdf,
            task_requested_name,
            task_provider,
            task_model,
            task_effort,
        );
    });

    Ok(job)
}

fn run_resume_pdf_import_background(
    app: AppHandle,
    job_id: String,
    resume_directory: PathBuf,
    target: PathBuf,
    staged_pdf: PathBuf,
    requested_name: Option<String>,
    provider: String,
    model: Option<String>,
    effort: Option<String>,
) {
    emit_updated_resume_import_job(&app, &job_id, |job| {
        job.status = "running".into();
        job.stage = "Starting the agent".into();
        job.error = None;
    });

    let mut on_event = |event: providers::job::JobEvent| {
        let event_value = serde_json::to_value(&event).unwrap_or(Value::Null);
        if let Ok(job) = update_resume_import_job(&app, &job_id, |job| {
            append_resume_import_activity(&mut job.activities, event_value.clone());
            if let Some(stage) = import_stage_for_event(&event) {
                job.stage = stage;
            }
        }) {
            emit_resume_import_job(&app, &job);
        }
    };

    let result = providers::run_resume_pdf_import_with_options(
        &app,
        &target,
        &staged_pdf,
        requested_name.as_deref(),
        &provider,
        model,
        effort,
        Some(&job_id),
        &mut on_event,
    );
    let _ = fs::remove_file(&staged_pdf);

    match result {
        Ok((data, response, changed)) if changed && has_imported_resume_content(&data) => {
            let display_name = imported_resume_display_name(&data, requested_name.as_deref());
            let (file_name, final_target) = allocate_resume_path(&resume_directory, &display_name);
            if let Err(error) = fs::rename(&target, &final_target) {
                let _ = fs::remove_file(&target);
                finish_failed_resume_import(
                    &app,
                    &job_id,
                    format!("The imported resume could not be saved: {error}"),
                );
                finish_resume_import_process(&job_id);
                return;
            }
            if let Ok(job) = update_resume_import_job(&app, &job_id, |job| {
                job.status = "completed".into();
                job.stage = "Import complete".into();
                job.resume_name = Some(display_name);
                job.resume_file_name = Some(file_name);
                job.response = Some(response);
                job.error = None;
            }) {
                emit_resume_import_job(&app, &job);
            }
            let _ = remove_resume_import_job(&app, &job_id);
        }
        Ok((_, response, _)) => {
            let detail = if response.trim().is_empty() {
                "The agent did not find usable resume content in that PDF.".into()
            } else {
                format!(
                    "The agent could not import usable resume content: {}",
                    response.trim()
                )
            };
            let _ = fs::remove_file(&target);
            finish_failed_resume_import(&app, &job_id, detail);
        }
        Err(error) => {
            let _ = fs::remove_file(&target);
            finish_failed_resume_import(&app, &job_id, error);
        }
    }
    finish_resume_import_process(&job_id);
}

fn emit_updated_resume_import_job<F>(app: &AppHandle, job_id: &str, update: F)
where
    F: FnOnce(&mut ResumeImportJob),
{
    if let Ok(job) = update_resume_import_job(app, job_id, update) {
        emit_resume_import_job(app, &job);
    }
}

fn finish_failed_resume_import(app: &AppHandle, job_id: &str, error: String) {
    if let Ok(job) = update_resume_import_job(app, job_id, |job| {
        job.status = "failed".into();
        job.stage = "Import failed".into();
        job.error = Some(error);
    }) {
        emit_resume_import_job(app, &job);
    }
}

fn finish_resume_import_process(job_id: &str) {
    let _ = active_resume_imports()
        .lock()
        .map(|mut active| active.remove(job_id));
}

fn append_resume_import_activity(activities: &mut Vec<Value>, event: Value) {
    if event.is_null() {
        return;
    }
    if let Some(id) = event.get("id").and_then(Value::as_str) {
        if let Some(existing) = activities
            .iter_mut()
            .find(|existing| existing.get("id").and_then(Value::as_str) == Some(id))
        {
            *existing = event;
        } else {
            activities.push(event);
        }
    } else {
        activities.push(event);
    }
    const MAX_IMPORT_ACTIVITIES: usize = 24;
    if activities.len() > MAX_IMPORT_ACTIVITIES {
        let remove_count = activities.len() - MAX_IMPORT_ACTIVITIES;
        activities.drain(0..remove_count);
    }
}

fn import_stage_for_event(event: &providers::job::JobEvent) -> Option<String> {
    match event {
        providers::job::JobEvent::Thread { .. } => Some("Connected to the agent".into()),
        providers::job::JobEvent::Progress { stage } => Some(stage.clone()),
        providers::job::JobEvent::Item { kind, status, .. } if status == "running" => {
            Some(format!("{}…", humanize_import_stage(kind)))
        }
        providers::job::JobEvent::Item { kind, .. } => Some(humanize_import_stage(kind)),
        providers::job::JobEvent::Usage { .. } => None,
    }
}

fn humanize_import_stage(value: &str) -> String {
    value
        .replace(['_', '-'], " ")
        .split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn imported_resume_display_name(data: &Value, requested_name: Option<&str>) -> String {
    requested_name
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            data.get("basics")
                .and_then(Value::as_object)
                .and_then(|basics| basics.get("name"))
                .and_then(Value::as_str)
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or("Imported resume")
        .trim()
        .to_string()
}

fn clean_import_option(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[tauri::command]
fn create_cover_letter(app: AppHandle, name: String) -> Result<ResumeFile, String> {
    let directory = cover_letters_dir(&app)?;
    let display_name = name.trim();
    if display_name.is_empty() {
        return Err("Cover letter name cannot be empty.".to_string());
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
    let mut data: Value =
        serde_json::from_str(include_str!("../../public/empty-cover-letter.json"))
            .map_err(|error| error.to_string())?;
    data["applicant"]["name"] = Value::String(display_name.to_string());
    data["closing"]["name"] = Value::String(display_name.to_string());
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

#[tauri::command]
fn save_cover_letter(app: AppHandle, path: String, data: Value) -> Result<ResumeFile, String> {
    let directory =
        fs::canonicalize(cover_letters_dir(&app)?).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(PathBuf::from(&path)).map_err(|error| error.to_string())?;
    if target.parent() != Some(directory.as_path())
        || !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err(
            "Cover letter files can only be saved inside the cover letters directory.".to_string(),
        );
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
        .unwrap_or_else(|| "untitled-cover-letter.json".to_string());
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
    provider: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    job_id: Option<String>,
    skills: Option<Vec<String>>,
    target_job_id: Option<i64>,
    selection: Option<providers::selection::ResumeTextSelection>,
    selection_action: Option<String>,
) -> Result<ResumeAiResult, String> {
    if prompt.trim().is_empty() {
        return Err("Tell the selected provider what you would like to change first.".into());
    }
    if prompt.len() > 20_000 {
        return Err("That request is too long. Keep it under 20,000 characters.".into());
    }

    let directory = fs::canonicalize(resumes_dir(&app)?).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(PathBuf::from(&path)).map_err(|error| error.to_string())?;
    let is_library_resume = target.parent() == Some(directory.as_path());
    let is_job_primary_resume = if is_library_resume {
        false
    } else {
        target_job_id
            .map(|job_id| {
                providers::resume_matching::is_job_primary_resume_path(&app, &target, job_id)
            })
            .transpose()?
            .unwrap_or(false)
    };
    if (!is_library_resume && !is_job_primary_resume)
        || !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err(
            "Resume AI can only edit JSON files inside the resume library or the selected job's primary resume."
                .into(),
        );
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (data, response, changed) = providers::run_resume_edit(
            &app,
            &target,
            &prompt,
            provider.as_deref().unwrap_or("codex"),
            model,
            effort,
            job_id,
            skills,
            target_job_id,
            selection,
            selection_action,
        )?;
        Ok(ResumeAiResult {
            data,
            response,
            changed,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn run_cover_letter_ai_job(
    app: AppHandle,
    path: String,
    prompt: String,
    provider: Option<String>,
    model: Option<String>,
    effort: Option<String>,
    job_id: Option<String>,
    skills: Option<Vec<String>>,
    target_job_id: Option<i64>,
    target_resume_id: Option<String>,
    selection: Option<providers::selection::ResumeTextSelection>,
    selection_action: Option<String>,
) -> Result<ResumeAiResult, String> {
    if prompt.trim().is_empty() {
        return Err("Tell the selected provider what you would like to change first.".into());
    }
    if prompt.len() > 20_000 {
        return Err("That request is too long. Keep it under 20,000 characters.".into());
    }

    let directory =
        fs::canonicalize(cover_letters_dir(&app)?).map_err(|error| error.to_string())?;
    let target = fs::canonicalize(PathBuf::from(&path)).map_err(|error| error.to_string())?;
    let is_library_cover_letter = target.parent() == Some(directory.as_path());
    let is_job_cover_letter = if is_library_cover_letter {
        false
    } else {
        target_job_id
            .map(|job_id| is_job_cover_letter_path(&app, &target, job_id))
            .transpose()?
            .unwrap_or(false)
    };
    if (!is_library_cover_letter && !is_job_cover_letter)
        || !target
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return Err(
            "Cover letter AI can only edit JSON files inside the cover letter library or the selected job's cover letter.".into(),
        );
    }

    tauri::async_runtime::spawn_blocking(move || {
        let (data, response, changed) = providers::run_cover_letter_edit(
            &app,
            &target,
            &prompt,
            provider.as_deref().unwrap_or("codex"),
            model,
            effort,
            job_id,
            skills,
            target_job_id,
            target_resume_id,
            selection,
            selection_action,
        )?;
        Ok(ResumeAiResult {
            data,
            response,
            changed,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn allocate_resume_path(directory: &Path, display_name: &str) -> (String, PathBuf) {
    let stem = sanitize_resume_stem(display_name);
    let mut index = 1;
    loop {
        let file_name = if index == 1 {
            format!("{stem}.json")
        } else {
            format!("{stem}-{index}.json")
        };
        let path = directory.join(&file_name);
        if !path.exists() {
            return (file_name, path);
        }
        index += 1;
    }
}

fn has_imported_resume_content(data: &Value) -> bool {
    let basics_has_content = data
        .get("basics")
        .and_then(Value::as_object)
        .is_some_and(|basics| {
            ["headline", "email", "phone", "location"]
                .iter()
                .any(|key| {
                    basics
                        .get(*key)
                        .and_then(Value::as_str)
                        .is_some_and(|value| !value.trim().is_empty())
                })
        });
    let summary_has_content = data
        .get("summary")
        .and_then(|summary| summary.get("content"))
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty());
    let sections_have_content =
        data.get("sections")
            .and_then(Value::as_object)
            .is_some_and(|sections| {
                sections.values().any(|section| {
                    section
                        .get("items")
                        .and_then(Value::as_array)
                        .is_some_and(|items| !items.is_empty())
                })
            });
    let custom_sections_have_content = data
        .get("customSections")
        .and_then(Value::as_array)
        .is_some_and(|sections| !sections.is_empty());

    basics_has_content
        || summary_has_content
        || sections_have_content
        || custom_sections_have_content
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(providers::ProviderState::default())
        .invoke_handler(tauri::generate_handler![
            list_resumes,
            list_cover_letters,
            get_resumes_directory,
            get_cover_letters_directory,
            create_resume,
            create_resume_from_pdf,
            import_profile_from_resume_pdf,
            list_resume_import_jobs,
            start_resume_pdf_import,
            create_cover_letter,
            load_or_create_job_cover_letter,
            job_cover_letter_is_drafted,
            save_resume,
            providers::resume_matching::load_job_primary_resume,
            providers::resume_matching::save_job_primary_resume,
            providers::profile_resume::generate_primary_resume_from_profile,
            export_resume_pdf,
            save_cover_letter,
            save_job_cover_letter,
            data_backup::export_data_backup,
            data_backup::inspect_data_backup,
            data_backup::begin_data_import,
            data_backup::commit_data_import,
            data_backup::rollback_data_import,
            run_resume_ai_job,
            run_cover_letter_ai_job,
            providers::general_agent::run_general_agent_job,
            providers::company_research::list_company_research_runs,
            providers::company_research::start_company_research_run,
            providers::company_research::retry_company_research_agent,
            providers::company_research::cancel_company_research_run,
            providers::company_research::retry_company_research_synthesis,
            providers::list_agent_skills,
            providers::search_their_stack_locations,
            providers::search_their_stack_industries,
            providers::search_their_stack_technologies,
            providers::search_their_stack_keywords,
            providers::job_search::expand_their_stack_search_query,
            providers::search_their_stack_jobs,
            providers::reveal_their_stack_job,
            providers::list_saved_their_stack_jobs,
            providers::update_their_stack_job_status,
            providers::saved_searches::list_saved_their_stack_searches,
            providers::saved_searches::save_their_stack_search,
            providers::saved_searches::delete_saved_their_stack_search,
            providers::job_import::list_job_import_jobs,
            providers::job_import::start_job_url_import,
            providers::resume_matching::start_resume_matching,
            providers::resume_matching::set_primary_resume_for_job,
            providers::get_provider_settings,
            providers::update_provider_settings,
            providers::update_claude_provider_settings,
            providers::update_their_stack_provider_settings,
            providers::get_provider_health,
            providers::refresh_provider_health
        ])
        .setup(|app| {
            data_backup::recover_interrupted_import(app.handle())?;
            providers::load_settings(app.handle());
            providers::start_health_scheduler(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
