use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const SAVED_SEARCHES_STORE_FILE: &str = "saved-searches.json";
const SAVED_SEARCHES_STORE_KEY: &str = "searches";
const MAX_SEARCH_NAME_CHARS: usize = 120;
const MAX_QUERY_CHARS: usize = 2_000;
const MAX_SAVED_VALUE_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct TheirStackSearchQuery {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub job_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TheirStackSavedSearch {
    pub id: String,
    pub name: String,
    pub filters: Value,
    pub query: TheirStackSearchQuery,
    pub model: Option<String>,
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub form: Option<Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub(crate) fn list_saved_their_stack_searches(
    app: AppHandle,
) -> Result<Vec<TheirStackSavedSearch>, String> {
    let mut searches = load_saved_searches(&app)?;
    sort_saved_searches(&mut searches);
    Ok(searches)
}

#[tauri::command]
pub(crate) fn save_their_stack_search(
    app: AppHandle,
    name: String,
    filters: Value,
    query: TheirStackSearchQuery,
    model: Option<String>,
    reasoning_effort: Option<String>,
    form: Option<Value>,
) -> Result<TheirStackSavedSearch, String> {
    let name = normalize_name(&name)?;
    validate_saved_value(&filters, "The saved search filters", true)?;
    if let Some(form) = form.as_ref() {
        validate_saved_value(form, "The saved search form", true)?;
    }

    let query = normalize_query(query)?;
    let model = normalize_optional_text(model, "The saved search model")?;
    let reasoning_effort =
        normalize_optional_text(reasoning_effort, "The saved search reasoning setting")?;
    let mut searches = load_saved_searches(&app)?;
    if searches
        .iter()
        .any(|search| search.name.eq_ignore_ascii_case(&name))
    {
        return Err(format!("A saved search named \"{name}\" already exists."));
    }

    let now = Utc::now();
    let base_id = format!(
        "saved-search-{}",
        now.timestamp_nanos_opt()
            .unwrap_or_else(|| now.timestamp_millis() * 1_000_000)
    );
    let mut id = base_id.clone();
    let mut suffix = 2;
    while searches.iter().any(|search| search.id == id) {
        id = format!("{base_id}-{suffix}");
        suffix += 1;
    }
    let timestamp = now.to_rfc3339();
    let search = TheirStackSavedSearch {
        id,
        name,
        filters,
        query,
        model,
        reasoning_effort,
        form,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    searches.push(search.clone());
    save_saved_searches(&app, &searches)?;
    Ok(search)
}

#[tauri::command]
pub(crate) fn delete_saved_their_stack_search(
    app: AppHandle,
    search_id: String,
) -> Result<(), String> {
    let search_id = search_id.trim();
    if search_id.is_empty() {
        return Err("The saved search ID cannot be empty.".into());
    }

    let mut searches = load_saved_searches(&app)?;
    let original_len = searches.len();
    searches.retain(|search| search.id != search_id);
    if searches.len() == original_len {
        return Err("The saved search could not be found.".into());
    }
    save_saved_searches(&app, &searches)
}

fn load_saved_searches(app: &AppHandle) -> Result<Vec<TheirStackSavedSearch>, String> {
    let store = app
        .store(SAVED_SEARCHES_STORE_FILE)
        .map_err(|error| error.to_string())?;
    let Some(value) = store.get(SAVED_SEARCHES_STORE_KEY) else {
        return Ok(Vec::new());
    };

    serde_json::from_value(value)
        .map_err(|error| format!("The saved searches could not be parsed: {error}"))
}

fn save_saved_searches(app: &AppHandle, searches: &[TheirStackSavedSearch]) -> Result<(), String> {
    let store = app
        .store(SAVED_SEARCHES_STORE_FILE)
        .map_err(|error| error.to_string())?;
    store.set(
        SAVED_SEARCHES_STORE_KEY,
        serde_json::to_value(searches)
            .map_err(|error| format!("The saved searches could not be serialized: {error}"))?,
    );
    store
        .save()
        .map_err(|error| format!("The saved searches could not be saved: {error}"))
}

fn sort_saved_searches(searches: &mut [TheirStackSavedSearch]) {
    searches.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
}

fn normalize_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("Give this search a name first.".into());
    }
    if name.chars().count() > MAX_SEARCH_NAME_CHARS {
        return Err(format!(
            "Saved search names must be {MAX_SEARCH_NAME_CHARS} characters or fewer."
        ));
    }
    if name.chars().any(char::is_control) {
        return Err("Saved search names cannot contain control characters.".into());
    }
    Ok(name.to_owned())
}

fn normalize_query(mut query: TheirStackSearchQuery) -> Result<TheirStackSearchQuery, String> {
    query.job_title = normalize_query_field(query.job_title, "Job title")?;
    query.description = normalize_query_field(query.description, "Description")?;
    Ok(query)
}

fn normalize_query_field(value: Option<String>, label: &str) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > MAX_QUERY_CHARS {
        return Err(format!(
            "{label} searches must be {MAX_QUERY_CHARS} characters or fewer."
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!(
            "{label} searches cannot contain control characters."
        ));
    }
    Ok(Some(value.to_owned()))
}

fn normalize_optional_text(value: Option<String>, label: &str) -> Result<Option<String>, String> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().any(char::is_control) {
        return Err(format!("{label} cannot contain control characters."));
    }
    Ok(Some(value.to_owned()))
}

fn validate_saved_value(value: &Value, label: &str, require_object: bool) -> Result<(), String> {
    if require_object && !value.is_object() {
        return Err(format!("{label} must be a JSON object."));
    }
    let size = serde_json::to_vec(value)
        .map_err(|error| format!("{label} could not be serialized: {error}"))?
        .len();
    if size > MAX_SAVED_VALUE_BYTES {
        return Err(format!(
            "{label} is too large to save; keep it under {} KiB.",
            MAX_SAVED_VALUE_BYTES / 1024
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn normalizes_saved_search_name_and_query_text() {
        let query = normalize_query(TheirStackSearchQuery {
            job_title: Some("  product designer  ".into()),
            description: Some("  fintech, React  ".into()),
        })
        .expect("query should be valid");

        assert_eq!(query.job_title.as_deref(), Some("product designer"));
        assert_eq!(query.description.as_deref(), Some("fintech, React"));
        assert_eq!(
            normalize_name("  Product roles  ").unwrap(),
            "Product roles"
        );
    }

    #[test]
    fn rejects_empty_or_controlled_names() {
        assert!(normalize_name("  ").is_err());
        assert!(normalize_name("bad\nname").is_err());
    }

    #[test]
    fn rejects_non_object_form_snapshots() {
        assert!(validate_saved_value(&json!(["not", "a", "form"]), "Form", true).is_err());
        assert!(validate_saved_value(&json!({"filters": []}), "Form", true).is_ok());
    }
}
