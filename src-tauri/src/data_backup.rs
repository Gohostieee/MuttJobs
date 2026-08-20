use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const BACKUP_FORMAT: &str = "muttjobs-backup";
const BACKUP_SCHEMA_VERSION: u32 = 1;
const MAX_ARCHIVE_FILES: usize = 250_000;
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 20 * 1024 * 1024 * 1024;
const MANIFEST_PATH: &str = "manifest.json";
const PREFERENCES_PATH: &str = "preferences.json";
const PROVIDER_SETTINGS_PATH: &str = "app-data/provider-settings.json";
const APPLICATION_STATUSES_PATH: &str = "app-data/application-statuses.json";
const SAVED_SEARCHES_PATH: &str = "app-data/saved-searches.json";
const TRANSACTION_MARKER: &str = ".muttjobs-backup-transaction.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupCategoryCounts {
    pub resumes: u64,
    pub cover_letters: u64,
    pub jobs: u64,
    pub research: u64,
    pub skills: u64,
    pub preferences: u64,
    pub other: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupFileEntry {
    path: String,
    size: u64,
    sha256: String,
    category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format: String,
    schema_version: u32,
    app_version: String,
    exported_at: String,
    operating_system: String,
    includes_secrets: bool,
    redactions: Vec<String>,
    exclusions: Vec<String>,
    files: Vec<BackupFileEntry>,
    counts: BackupCategoryCounts,
    total_files: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupExportSummary {
    path: String,
    exported_at: String,
    counts: BackupCategoryCounts,
    total_files: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupConflictSummary {
    conflicts: u64,
    new_items: u64,
    current_only_items: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupInspection {
    app_version: String,
    exported_at: String,
    counts: BackupCategoryCounts,
    total_files: u64,
    total_bytes: u64,
    conflict_summary: BackupConflictSummary,
    redactions: Vec<String>,
    exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupImportTransaction {
    transaction_id: String,
    preferences: BTreeMap<String, String>,
    inspection: BackupInspection,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackupImportSummary {
    imported_at: String,
    counts: BackupCategoryCounts,
    total_files: u64,
    total_bytes: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransactionMarker {
    transaction_id: String,
    rollback_path: String,
}

#[derive(Debug)]
struct ActiveTransaction {
    id: String,
    app_data: PathBuf,
    rollback: PathBuf,
    summary: BackupImportSummary,
}

#[derive(Debug)]
struct LoadedBackup {
    manifest: BackupManifest,
    files: BTreeMap<String, Vec<u8>>,
    preferences: BTreeMap<String, String>,
}

static ACTIVE_TRANSACTION: OnceLock<Mutex<Option<ActiveTransaction>>> = OnceLock::new();

fn active_transaction() -> &'static Mutex<Option<ActiveTransaction>> {
    ACTIVE_TRANSACTION.get_or_init(|| Mutex::new(None))
}

fn nonce() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

fn ensure_idle() -> Result<(), String> {
    if crate::has_active_resume_imports()
        || crate::providers::job_import::has_active_job_imports()
        || crate::providers::company_research::has_active_company_research_runs()
    {
        return Err(
            "Wait for active resume imports, job imports, and Company Research runs to finish before using a backup."
                .into(),
        );
    }
    Ok(())
}

fn validate_backup_destination(path: &str) -> Result<PathBuf, String> {
    let destination = PathBuf::from(path);
    if !destination.is_absolute() {
        return Err("Choose an absolute destination for the backup.".into());
    }
    if destination
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("muttjobs-backup")
    {
        return Err("MuttJobs backups must use the .muttjobs-backup extension.".into());
    }
    let parent = destination
        .parent()
        .ok_or("The backup destination has no parent folder.")?;
    if !parent.is_dir() {
        return Err("The selected backup folder does not exist.".into());
    }
    Ok(destination)
}

fn is_transient(relative: &Path) -> bool {
    let normalized = relative.to_string_lossy().replace('\\', "/");
    normalized == ".muttjobs-job-imports"
        || normalized.starts_with(".muttjobs-job-imports/")
        || normalized == "resumes/.muttjobs-imports"
        || normalized.starts_with("resumes/.muttjobs-imports/")
        || normalized == TRANSACTION_MARKER
        || normalized.ends_with(".tmp")
        || normalized.ends_with(".partial")
}

fn category_for(path: &str) -> &'static str {
    if path == PREFERENCES_PATH {
        "preferences"
    } else if path.starts_with("app-data/resumes/.agents/skills/") {
        "skills"
    } else if path.starts_with("app-data/resumes/") {
        "resumes"
    } else if path.starts_with("app-data/cover-letters/") {
        "coverLetters"
    } else if path.contains("/company-research/") {
        "research"
    } else if path.starts_with("app-data/jobs/") || path == APPLICATION_STATUSES_PATH {
        "jobs"
    } else {
        "other"
    }
}

fn increment_category(counts: &mut BackupCategoryCounts, category: &str) {
    match category {
        "resumes" => counts.resumes += 1,
        "coverLetters" => counts.cover_letters += 1,
        "jobs" => counts.jobs += 1,
        "research" => counts.research += 1,
        "skills" => counts.skills += 1,
        "preferences" => counts.preferences += 1,
        _ => counts.other += 1,
    }
}

fn sha256(bytes: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(bytes);
    format!("{:x}", digest.finalize())
}

fn sanitize_provider_settings(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut value: Value = serde_json::from_slice(bytes).map_err(|error| {
        format!("Provider settings could not be safely redacted for export: {error}")
    })?;
    if let Some(api_key) = value
        .get_mut("provider-settings-document")
        .and_then(|value| value.get_mut("providers"))
        .and_then(|value| value.get_mut("theirStack"))
        .and_then(|value| value.get_mut("apiKey"))
    {
        *api_key = Value::Null;
    }
    let mut serialized = serde_json::to_vec_pretty(&value)
        .map_err(|error| format!("Provider settings could not be serialized: {error}"))?;
    serialized.push(b'\n');
    Ok(serialized)
}

fn collect_app_data_files(root: &Path) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut collected = Vec::new();
    if !root.exists() {
        return Ok(collected);
    }
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|error| format!("App data could not be read: {error}"))?
        {
            let entry = entry.map_err(|error| format!("App data could not be read: {error}"))?;
            let path = entry.path();
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "An app-data path escaped the backup root.".to_string())?;
            if is_transient(relative) {
                continue;
            }
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("App-data metadata could not be read: {error}"))?;
            if metadata.file_type().is_symlink() {
                return Err(format!(
                    "Backup stopped because {} is a symbolic link.",
                    relative.display()
                ));
            }
            if metadata.is_dir() {
                pending.push(path);
                continue;
            }
            if !metadata.is_file() {
                return Err(format!(
                    "Backup stopped because {} is not a regular file.",
                    relative.display()
                ));
            }
            let archive_path =
                format!("app-data/{}", relative.to_string_lossy().replace('\\', "/"));
            let bytes = fs::read(&path)
                .map_err(|error| format!("{} could not be read: {error}", relative.display()))?;
            let bytes = if archive_path == PROVIDER_SETTINGS_PATH {
                sanitize_provider_settings(&bytes)?
            } else {
                bytes
            };
            collected.push((archive_path, bytes));
        }
    }
    collected.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(collected)
}

#[tauri::command]
pub(crate) fn export_data_backup(
    app: AppHandle,
    path: String,
    preferences: BTreeMap<String, String>,
) -> Result<BackupExportSummary, String> {
    ensure_idle()?;
    if active_transaction()
        .lock()
        .map_err(|_| "Backup transaction state is unavailable.")?
        .is_some()
    {
        return Err("Finish the active backup import before exporting.".into());
    }

    let destination = validate_backup_destination(&path)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let mut files = collect_app_data_files(&app_data)?;
    let preference_bytes = serde_json::to_vec_pretty(&preferences)
        .map_err(|error| format!("Preferences could not be serialized: {error}"))?;
    files.push((PREFERENCES_PATH.into(), preference_bytes));
    files.sort_by(|left, right| left.0.cmp(&right.0));

    let mut counts = BackupCategoryCounts::default();
    let mut entries = Vec::with_capacity(files.len());
    let mut total_bytes = 0_u64;
    for (file_path, bytes) in &files {
        let category = category_for(file_path);
        increment_category(&mut counts, category);
        total_bytes = total_bytes
            .checked_add(bytes.len() as u64)
            .ok_or("The backup is too large.")?;
        entries.push(BackupFileEntry {
            path: file_path.clone(),
            size: bytes.len() as u64,
            sha256: sha256(bytes),
            category: category.into(),
        });
    }

    let exported_at = Utc::now().to_rfc3339();
    let manifest = BackupManifest {
        format: BACKUP_FORMAT.into(),
        schema_version: BACKUP_SCHEMA_VERSION,
        app_version: app.package_info().version.to_string(),
        exported_at: exported_at.clone(),
        operating_system: std::env::consts::OS.into(),
        includes_secrets: false,
        redactions: vec!["provider-settings.providers.theirStack.apiKey".into()],
        exclusions: vec![
            "provider credentials".into(),
            "unfinished resume and job imports".into(),
            "staged PDF and HTML imports".into(),
            "temporary files".into(),
            "WebView caches and browser engine data".into(),
        ],
        total_files: entries.len() as u64,
        total_bytes,
        counts: counts.clone(),
        files: entries,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("The backup manifest could not be serialized: {error}"))?;

    let temporary = destination.with_extension(format!("muttjobs-backup.{}.tmp", nonce()));
    let archive_file = fs::File::create(&temporary)
        .map_err(|error| format!("The backup could not be created: {error}"))?;
    let mut archive = ZipWriter::new(archive_file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    archive
        .start_file(MANIFEST_PATH, options)
        .and_then(|_| archive.write_all(&manifest_bytes).map_err(Into::into))
        .map_err(|error: zip::result::ZipError| {
            format!("The backup manifest could not be written: {error}")
        })?;
    for (file_path, bytes) in files {
        archive
            .start_file(&file_path, options)
            .and_then(|_| archive.write_all(&bytes).map_err(Into::into))
            .map_err(|error: zip::result::ZipError| {
                format!("{file_path} could not be archived: {error}")
            })?;
    }
    archive
        .finish()
        .map_err(|error| format!("The backup could not be finalized: {error}"))?;

    if destination.exists() {
        fs::remove_file(&destination)
            .map_err(|error| format!("The previous backup could not be replaced: {error}"))?;
    }
    fs::rename(&temporary, &destination)
        .map_err(|error| format!("The backup could not be saved: {error}"))?;

    Ok(BackupExportSummary {
        path: destination.to_string_lossy().to_string(),
        exported_at,
        counts,
        total_files: manifest.total_files,
        total_bytes,
    })
}

fn validate_archive_path(path: &str) -> Result<(), String> {
    if path.contains('\\')
        || path.contains(':')
        || path.starts_with('/')
        || path.is_empty()
        || path.split('/').any(str::is_empty)
    {
        return Err(format!("The backup contains an unsafe path: {path}"));
    }
    let parsed = Path::new(path);
    if parsed
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("The backup contains an unsafe path: {path}"));
    }
    if path != PREFERENCES_PATH && !path.starts_with("app-data/") {
        return Err(format!("The backup contains an unsupported path: {path}"));
    }
    if let Some(relative) = path.strip_prefix("app-data/") {
        if is_transient(Path::new(relative)) {
            return Err(format!("The backup contains a transient path: {path}"));
        }
    }
    Ok(())
}

fn read_zip_entry<R: Read + std::io::Seek>(
    archive: &mut ZipArchive<R>,
    index: usize,
) -> Result<(String, Vec<u8>), String> {
    let mut entry = archive
        .by_index(index)
        .map_err(|error| format!("The backup could not be read: {error}"))?;
    let name = entry.name().to_string();
    if entry.is_dir() {
        return Err(format!(
            "The backup contains an undeclared directory entry: {name}"
        ));
    }
    if entry
        .unix_mode()
        .is_some_and(|mode| mode & 0o170000 == 0o120000)
    {
        return Err(format!("The backup contains a symbolic link: {name}"));
    }
    if entry.size() > MAX_FILE_BYTES {
        return Err(format!("The backup entry {name} is too large."));
    }
    let mut bytes = Vec::with_capacity(entry.size().min(usize::MAX as u64) as usize);
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("The backup entry {name} could not be read: {error}"))?;
    if bytes.len() as u64 != entry.size() {
        return Err(format!("The backup entry {name} has an invalid size."));
    }
    Ok((name, bytes))
}

fn load_backup(path: &str) -> Result<LoadedBackup, String> {
    let source = PathBuf::from(path);
    if !source.is_absolute() || !source.is_file() {
        return Err("Choose an existing .muttjobs-backup file.".into());
    }
    let file = fs::File::open(&source)
        .map_err(|error| format!("The backup could not be opened: {error}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("The selected file is not a valid MuttJobs backup: {error}"))?;
    if archive.len() == 0 || archive.len() > MAX_ARCHIVE_FILES + 1 {
        return Err("The backup contains an invalid number of files.".into());
    }

    let mut raw = BTreeMap::new();
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let (name, bytes) = read_zip_entry(&mut archive, index)?;
        if raw.insert(name.clone(), bytes.clone()).is_some() {
            return Err(format!(
                "The backup contains the path {name} more than once."
            ));
        }
        total = total
            .checked_add(bytes.len() as u64)
            .ok_or("The backup is too large.")?;
        if total > MAX_TOTAL_BYTES {
            return Err("The backup expands beyond the supported size limit.".into());
        }
    }

    let manifest_bytes = raw
        .remove(MANIFEST_PATH)
        .ok_or("The backup manifest is missing.")?;
    let manifest: BackupManifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("The backup manifest is invalid: {error}"))?;
    if manifest.format != BACKUP_FORMAT {
        return Err("The selected archive is not a MuttJobs backup.".into());
    }
    if manifest.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "Backup schema version {} is not supported by this version of MuttJobs.",
            manifest.schema_version
        ));
    }
    if manifest.includes_secrets {
        return Err("This MuttJobs version does not import backups containing credentials.".into());
    }
    if manifest.files.len() != raw.len() || manifest.total_files != raw.len() as u64 {
        return Err("The backup file list does not match its manifest.".into());
    }

    let mut declared = HashSet::new();
    let mut portable_declared = HashSet::new();
    let mut verified_total = 0_u64;
    for entry in &manifest.files {
        validate_archive_path(&entry.path)?;
        if !declared.insert(entry.path.clone()) {
            return Err(format!(
                "The manifest declares {} more than once.",
                entry.path
            ));
        }
        if !portable_declared.insert(entry.path.to_ascii_lowercase()) {
            return Err(format!(
                "The manifest contains paths that collide on a case-insensitive filesystem: {}.",
                entry.path
            ));
        }
        let bytes = raw
            .get(&entry.path)
            .ok_or_else(|| format!("The backup entry {} is missing.", entry.path))?;
        if bytes.len() as u64 != entry.size || sha256(bytes) != entry.sha256 {
            return Err(format!(
                "The backup entry {} failed its integrity check.",
                entry.path
            ));
        }
        verified_total = verified_total
            .checked_add(entry.size)
            .ok_or("The backup is too large.")?;
    }
    if verified_total != manifest.total_bytes {
        return Err("The backup total size does not match its manifest.".into());
    }

    let preference_bytes = raw
        .remove(PREFERENCES_PATH)
        .ok_or("The backup preferences are missing.")?;
    let preferences = serde_json::from_slice::<BTreeMap<String, String>>(&preference_bytes)
        .map_err(|error| format!("The backup preferences are invalid: {error}"))?;
    if preferences.keys().any(|key| !key.starts_with("muttjobs.")) {
        return Err("The backup contains an unsupported browser preference key.".into());
    }

    Ok(LoadedBackup {
        manifest,
        files: raw,
        preferences,
    })
}

fn current_durable_paths(root: &Path) -> Result<HashSet<String>, String> {
    Ok(collect_app_data_files(root)?
        .into_iter()
        .map(|(path, _)| path)
        .collect())
}

fn inspection_for(root: &Path, backup: &LoadedBackup) -> Result<BackupInspection, String> {
    let current = current_durable_paths(root)?;
    let imported: HashSet<_> = backup.files.keys().cloned().collect();
    let conflicts = imported.intersection(&current).count() as u64;
    let new_items = imported.difference(&current).count() as u64;
    let current_only_items = current.difference(&imported).count() as u64;
    Ok(BackupInspection {
        app_version: backup.manifest.app_version.clone(),
        exported_at: backup.manifest.exported_at.clone(),
        counts: backup.manifest.counts.clone(),
        total_files: backup.manifest.total_files,
        total_bytes: backup.manifest.total_bytes,
        conflict_summary: BackupConflictSummary {
            conflicts,
            new_items,
            current_only_items,
        },
        redactions: backup.manifest.redactions.clone(),
        exclusions: backup.manifest.exclusions.clone(),
    })
}

#[tauri::command]
pub(crate) fn inspect_data_backup(
    app: AppHandle,
    path: String,
) -> Result<BackupInspection, String> {
    let backup = load_backup(&path)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    inspection_for(&root, &backup)
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|error| format!("Import staging could not be created: {error}"))?;
    if !source.exists() {
        return Ok(());
    }
    for entry in
        fs::read_dir(source).map_err(|error| format!("App data could not be read: {error}"))?
    {
        let entry = entry.map_err(|error| format!("App data could not be read: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let metadata = fs::symlink_metadata(&source_path)
            .map_err(|error| format!("App-data metadata could not be read: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!(
                "Import stopped because {} is a symbolic link.",
                source_path.display()
            ));
        }
        if metadata.is_dir() {
            copy_tree(&source_path, &destination_path)?;
        } else if metadata.is_file() {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("App data could not be staged: {error}"))?;
        }
    }
    Ok(())
}

fn merge_object_store(current: &[u8], imported: &[u8], key: &str) -> Result<Vec<u8>, String> {
    let mut current_value: Value = serde_json::from_slice(current)
        .map_err(|error| format!("Current {key} store is invalid: {error}"))?;
    let imported_value: Value = serde_json::from_slice(imported)
        .map_err(|error| format!("Imported {key} store is invalid: {error}"))?;
    let current_map = current_value
        .get_mut(key)
        .and_then(Value::as_object_mut)
        .ok_or_else(|| format!("Current {key} store has an invalid shape."))?;
    let imported_map = imported_value
        .get(key)
        .and_then(Value::as_object)
        .ok_or_else(|| format!("Imported {key} store has an invalid shape."))?;
    for (item_key, value) in imported_map {
        current_map.insert(item_key.clone(), value.clone());
    }
    let mut bytes = serde_json::to_vec_pretty(&current_value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn merge_saved_searches(current: &[u8], imported: &[u8]) -> Result<Vec<u8>, String> {
    let mut current_value: Value = serde_json::from_slice(current)
        .map_err(|error| format!("Current saved searches are invalid: {error}"))?;
    let imported_value: Value = serde_json::from_slice(imported)
        .map_err(|error| format!("Imported saved searches are invalid: {error}"))?;
    let current_items = current_value
        .get_mut("searches")
        .and_then(Value::as_array_mut)
        .ok_or("Current saved searches have an invalid shape.")?;
    let imported_items = imported_value
        .get("searches")
        .and_then(Value::as_array)
        .ok_or("Imported saved searches have an invalid shape.")?;
    let mut by_id: BTreeMap<String, Value> = BTreeMap::new();
    for value in current_items.iter().chain(imported_items.iter()) {
        let id = value
            .get("id")
            .and_then(Value::as_str)
            .ok_or("A saved search is missing its ID.")?;
        by_id.insert(id.to_string(), value.clone());
    }
    *current_items = by_id.into_values().collect();
    let mut bytes = serde_json::to_vec_pretty(&current_value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn current_api_key(value: &Value) -> Option<Value> {
    value
        .get("provider-settings-document")?
        .get("providers")?
        .get("theirStack")?
        .get("apiKey")
        .cloned()
}

fn merge_provider_settings(current: &[u8], imported: &[u8]) -> Result<Vec<u8>, String> {
    let current_value: Value = serde_json::from_slice(current)
        .map_err(|error| format!("Current provider settings are invalid: {error}"))?;
    let mut imported_value: Value = serde_json::from_slice(imported)
        .map_err(|error| format!("Imported provider settings are invalid: {error}"))?;
    let target = imported_value
        .get_mut("provider-settings-document")
        .and_then(|value| value.get_mut("providers"))
        .and_then(|value| value.get_mut("theirStack"))
        .and_then(Value::as_object_mut)
        .ok_or("Imported provider settings have an invalid shape.")?;
    target.insert(
        "apiKey".into(),
        current_api_key(&current_value).unwrap_or(Value::Null),
    );
    let mut bytes =
        serde_json::to_vec_pretty(&imported_value).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn merge_file(stage: &Path, archive_path: &str, imported: &[u8]) -> Result<(), String> {
    let relative = archive_path
        .strip_prefix("app-data/")
        .ok_or_else(|| format!("The import path {archive_path} is invalid."))?;
    let destination = stage.join(relative.replace('/', &std::path::MAIN_SEPARATOR.to_string()));
    let bytes = if archive_path == PROVIDER_SETTINGS_PATH {
        let sanitized = sanitize_provider_settings(imported)?;
        if destination.exists() {
            let current = fs::read(&destination)
                .map_err(|error| format!("Current data could not be read during merge: {error}"))?;
            merge_provider_settings(&current, &sanitized)?
        } else {
            sanitized
        }
    } else if destination.exists() {
        let current = fs::read(&destination)
            .map_err(|error| format!("Current data could not be read during merge: {error}"))?;
        match archive_path {
            APPLICATION_STATUSES_PATH => merge_object_store(&current, imported, "statuses")?,
            SAVED_SEARCHES_PATH => merge_saved_searches(&current, imported)?,
            _ => imported.to_vec(),
        }
    } else {
        imported.to_vec()
    };
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Imported data could not be staged: {error}"))?;
    }
    fs::write(&destination, bytes)
        .map_err(|error| format!("Imported data could not be staged: {error}"))
}

#[tauri::command]
pub(crate) fn begin_data_import(
    app: AppHandle,
    path: String,
) -> Result<BackupImportTransaction, String> {
    ensure_idle()?;
    let mut transaction_guard = active_transaction()
        .lock()
        .map_err(|_| "Backup transaction state is unavailable.")?;
    if transaction_guard.is_some() {
        return Err("Another backup import is already active.".into());
    }
    let backup = load_backup(&path)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let inspection = inspection_for(&app_data, &backup)?;
    let parent = app_data
        .parent()
        .ok_or("The app-data parent directory could not be determined.")?;
    let transaction_id = nonce();
    let stage = parent.join(format!(".muttjobs-import-stage-{transaction_id}"));
    let rollback = parent.join(format!(".muttjobs-import-rollback-{transaction_id}"));
    if stage.exists() || rollback.exists() {
        return Err("An import staging directory already exists.".into());
    }

    copy_tree(&app_data, &stage)?;
    let apply_result = (|| {
        for (archive_path, bytes) in &backup.files {
            merge_file(&stage, archive_path, bytes)?;
        }
        let marker = TransactionMarker {
            transaction_id: transaction_id.clone(),
            rollback_path: rollback.to_string_lossy().to_string(),
        };
        let marker_bytes = serde_json::to_vec_pretty(&marker).map_err(|error| error.to_string())?;
        fs::write(stage.join(TRANSACTION_MARKER), marker_bytes).map_err(|error| {
            format!("The import transaction marker could not be saved: {error}")
        })?;
        Ok::<(), String>(())
    })();
    if let Err(error) = apply_result {
        let _ = fs::remove_dir_all(&stage);
        return Err(error);
    }

    if app_data.exists() {
        fs::rename(&app_data, &rollback).map_err(|error| {
            format!("Current app data could not be secured for rollback: {error}")
        })?;
    }
    if let Err(error) = fs::rename(&stage, &app_data) {
        let _ = fs::rename(&rollback, &app_data);
        let _ = fs::remove_dir_all(&stage);
        return Err(format!("Imported app data could not be activated: {error}"));
    }

    let summary = BackupImportSummary {
        imported_at: Utc::now().to_rfc3339(),
        counts: backup.manifest.counts.clone(),
        total_files: backup.manifest.total_files,
        total_bytes: backup.manifest.total_bytes,
    };
    *transaction_guard = Some(ActiveTransaction {
        id: transaction_id.clone(),
        app_data,
        rollback,
        summary,
    });
    Ok(BackupImportTransaction {
        transaction_id,
        preferences: backup.preferences,
        inspection,
    })
}

#[tauri::command]
pub(crate) fn commit_data_import(transaction_id: String) -> Result<BackupImportSummary, String> {
    let mut guard = active_transaction()
        .lock()
        .map_err(|_| "Backup transaction state is unavailable.")?;
    let transaction = guard
        .as_ref()
        .ok_or("The backup import transaction is no longer active.")?;
    if transaction.id != transaction_id {
        return Err("The backup import transaction ID is invalid.".into());
    }
    let _ = fs::remove_file(transaction.app_data.join(TRANSACTION_MARKER));
    if transaction.rollback.exists() {
        fs::remove_dir_all(&transaction.rollback).map_err(|error| {
            format!("The import succeeded, but rollback cleanup failed: {error}")
        })?;
    }
    let summary = transaction.summary.clone();
    *guard = None;
    Ok(summary)
}

#[tauri::command]
pub(crate) fn rollback_data_import(transaction_id: String) -> Result<(), String> {
    let mut guard = active_transaction()
        .lock()
        .map_err(|_| "Backup transaction state is unavailable.")?;
    let transaction = guard
        .as_ref()
        .ok_or("The backup import transaction is no longer active.")?;
    if transaction.id != transaction_id {
        return Err("The backup import transaction ID is invalid.".into());
    }
    let failed = transaction
        .app_data
        .parent()
        .ok_or("The app-data parent directory could not be determined.")?
        .join(format!(".muttjobs-import-failed-{}", transaction.id));
    fs::rename(&transaction.app_data, &failed)
        .map_err(|error| format!("Imported app data could not be moved aside: {error}"))?;
    if let Err(error) = fs::rename(&transaction.rollback, &transaction.app_data) {
        let _ = fs::rename(&failed, &transaction.app_data);
        return Err(format!(
            "The previous app data could not be restored: {error}"
        ));
    }
    let _ = fs::remove_dir_all(failed);
    *guard = None;
    Ok(())
}

pub(crate) fn recover_interrupted_import(app: &AppHandle) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let marker_path = app_data.join(TRANSACTION_MARKER);
    if !marker_path.is_file() {
        return Ok(());
    }
    let marker: TransactionMarker = serde_json::from_slice(
        &fs::read(&marker_path)
            .map_err(|error| format!("An interrupted import marker could not be read: {error}"))?,
    )
    .map_err(|error| format!("An interrupted import marker is invalid: {error}"))?;
    let rollback = PathBuf::from(marker.rollback_path);
    if rollback.exists() {
        fs::remove_dir_all(&rollback).map_err(|error| {
            format!("An interrupted import rollback could not be cleaned up: {error}")
        })?;
    }
    fs::remove_file(marker_path)
        .map_err(|error| format!("An interrupted import marker could not be cleaned up: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_test_backup(path: &Path, checksum_override: Option<&str>) {
        let preferences = br#"{"muttjobs.shadcn.mode":"dark"}"#.to_vec();
        let resume = br#"{"basics":{"name":"Backup Test"}}"#.to_vec();
        let files = vec![
            (PREFERENCES_PATH.to_string(), preferences),
            ("app-data/resumes/test.json".to_string(), resume),
        ];
        let mut counts = BackupCategoryCounts::default();
        let entries: Vec<_> = files
            .iter()
            .map(|(file_path, bytes)| {
                let category = category_for(file_path);
                increment_category(&mut counts, category);
                BackupFileEntry {
                    path: file_path.clone(),
                    size: bytes.len() as u64,
                    sha256: checksum_override
                        .map(str::to_string)
                        .unwrap_or_else(|| sha256(bytes)),
                    category: category.into(),
                }
            })
            .collect();
        let manifest = BackupManifest {
            format: BACKUP_FORMAT.into(),
            schema_version: BACKUP_SCHEMA_VERSION,
            app_version: "0.1.0".into(),
            exported_at: "2026-08-20T12:00:00Z".into(),
            operating_system: "windows".into(),
            includes_secrets: false,
            redactions: Vec::new(),
            exclusions: Vec::new(),
            total_files: entries.len() as u64,
            total_bytes: entries.iter().map(|entry| entry.size).sum(),
            counts,
            files: entries,
        };
        let file = fs::File::create(path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        archive.start_file(MANIFEST_PATH, options).unwrap();
        archive
            .write_all(&serde_json::to_vec_pretty(&manifest).unwrap())
            .unwrap();
        for (file_path, bytes) in files {
            archive.start_file(file_path, options).unwrap();
            archive.write_all(&bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn transient_paths_are_excluded() {
        assert!(is_transient(Path::new(".muttjobs-job-imports/jobs.json")));
        assert!(is_transient(Path::new(
            "resumes/.muttjobs-imports/source.pdf"
        )));
        assert!(is_transient(Path::new("jobs/1/run.json.123.tmp")));
        assert!(!is_transient(Path::new(
            "jobs/1/company-research/runs/one/run.json"
        )));
    }

    #[test]
    fn provider_api_key_is_redacted() {
        let bytes = br#"{"provider-settings-document":{"providers":{"theirStack":{"apiKey":"secret","enabled":true}}}}"#;
        let sanitized: Value =
            serde_json::from_slice(&sanitize_provider_settings(bytes).unwrap()).unwrap();
        assert!(
            sanitized["provider-settings-document"]["providers"]["theirStack"]["apiKey"].is_null()
        );
        assert!(
            !String::from_utf8_lossy(&sanitize_provider_settings(bytes).unwrap())
                .contains("secret")
        );
    }

    #[test]
    fn application_statuses_merge_with_imported_values_winning() {
        let current = br#"{"statuses":{"1":"saved","2":"applied"}}"#;
        let imported = br#"{"statuses":{"1":"interviewing","3":"rejected"}}"#;
        let merged: Value =
            serde_json::from_slice(&merge_object_store(current, imported, "statuses").unwrap())
                .unwrap();
        assert_eq!(merged["statuses"]["1"], "interviewing");
        assert_eq!(merged["statuses"]["2"], "applied");
        assert_eq!(merged["statuses"]["3"], "rejected");
    }

    #[test]
    fn saved_searches_keep_current_only_items_and_imported_conflicts() {
        let current =
            br#"{"searches":[{"id":"one","name":"old"},{"id":"two","name":"current only"}]}"#;
        let imported =
            br#"{"searches":[{"id":"one","name":"imported"},{"id":"three","name":"new"}]}"#;
        let merged: Value =
            serde_json::from_slice(&merge_saved_searches(current, imported).unwrap()).unwrap();
        let items = merged["searches"].as_array().unwrap();
        assert_eq!(items.len(), 3);
        assert!(items
            .iter()
            .any(|item| item["id"] == "one" && item["name"] == "imported"));
        assert!(items.iter().any(|item| item["id"] == "two"));
        assert!(items.iter().any(|item| item["id"] == "three"));
    }

    #[test]
    fn provider_import_preserves_the_current_api_key() {
        let current = br#"{"provider-settings-document":{"providers":{"theirStack":{"apiKey":"keep-me","enabled":false}}}}"#;
        let imported = br#"{"provider-settings-document":{"providers":{"theirStack":{"apiKey":null,"enabled":true}}}}"#;
        let merged: Value =
            serde_json::from_slice(&merge_provider_settings(current, imported).unwrap()).unwrap();
        assert_eq!(
            merged["provider-settings-document"]["providers"]["theirStack"]["apiKey"],
            "keep-me"
        );
        assert_eq!(
            merged["provider-settings-document"]["providers"]["theirStack"]["enabled"],
            true
        );
    }

    #[test]
    fn unsafe_archive_paths_are_rejected() {
        assert!(validate_archive_path("app-data/jobs/1.json").is_ok());
        assert!(validate_archive_path("../provider-settings.json").is_err());
        assert!(validate_archive_path("app-data\\jobs\\1.json").is_err());
        assert!(validate_archive_path("C:/jobs/1.json").is_err());
        assert!(validate_archive_path("app-data//jobs/1.json").is_err());
        assert!(validate_archive_path("app-data/jobs/run.tmp").is_err());
    }

    #[test]
    fn archive_round_trip_validates_manifest_and_preferences() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("round-trip.muttjobs-backup");
        write_test_backup(&path, None);
        let loaded = load_backup(path.to_str().unwrap()).unwrap();
        assert_eq!(
            loaded
                .preferences
                .get("muttjobs.shadcn.mode")
                .map(String::as_str),
            Some("dark")
        );
        assert!(loaded.files.contains_key("app-data/resumes/test.json"));
        assert_eq!(loaded.manifest.counts.resumes, 1);
    }

    #[test]
    fn archive_checksum_mismatch_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("corrupt.muttjobs-backup");
        write_test_backup(&path, Some("not-a-real-checksum"));
        assert!(load_backup(path.to_str().unwrap())
            .unwrap_err()
            .contains("integrity check"));
    }
}
