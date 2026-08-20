use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use chrono::Utc;
use reqwest::blocking::{Client, RequestBuilder, Response};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::{ProviderHealth, TheirStackCreditBalance, TheirStackSettings};

const CREDIT_BALANCE_URL: &str = "https://api.theirstack.com/v0/billing/credit-balance";
const LOCATION_CATALOG_URL: &str = "https://api.theirstack.com/v0/catalog/locations";
const INDUSTRY_CATALOG_URL: &str = "https://api.theirstack.com/v0/catalog/industries";
const KEYWORD_CATALOG_URL: &str = "https://api.theirstack.com/v0/catalog/keywords";
const JOB_SEARCH_URL: &str = "https://api.theirstack.com/v1/jobs/search";
const JOB_SEARCH_LIMIT: u64 = 20;
const JOB_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TECHNOLOGY_EMPTY_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);
static TECHNOLOGY_EMPTY_CACHE: OnceLock<Mutex<Option<(Instant, Vec<CatalogTechnology>)>>> =
    OnceLock::new();

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ApplicationStatus {
    Revealed,
    InProcess,
    Applied,
    Interviewing,
    Offer,
    Denied,
}

impl Default for ApplicationStatus {
    fn default() -> Self {
        Self::Revealed
    }
}

#[derive(Debug, Deserialize)]
struct CreditBalanceResponse {
    api_credits: i64,
    #[serde(default)]
    used_api_credits: i64,
    earliest_expiration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ErrorEnvelope {
    error: Option<ApiError>,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    title: Option<String>,
    description: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogLocation {
    pub id: i64,
    pub name: String,
    #[serde(alias = "display_name")]
    pub display_name: Option<String>,
    #[serde(alias = "country_code")]
    pub country_code: Option<String>,
    #[serde(alias = "country_name")]
    pub country_name: Option<String>,
    #[serde(alias = "admin1_name")]
    pub admin1_name: Option<String>,
    #[serde(alias = "feature_code")]
    pub feature_code: Option<String>,
    #[serde(alias = "feature_name")]
    pub feature_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CatalogIndustry {
    pub companies: i64,
    pub description: Option<String>,
    pub hierarchy: String,
    pub industry: String,
    pub industry_id: i64,
    pub jobs: i64,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct CatalogTechnology {
    pub category: Option<String>,
    pub category_slug: Option<String>,
    pub companies: i64,
    pub companies_found_last_week: i64,
    pub description: Option<String>,
    pub jobs: i64,
    pub logo: Option<String>,
    pub logo_thumbnail: Option<String>,
    pub name: String,
    pub one_liner: Option<String>,
    pub parent_category: Option<String>,
    pub parent_category_slug: Option<String>,
    pub slug: String,
    #[serde(rename = "type")]
    pub keyword_type: String,
    pub url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CatalogResponse<T> {
    data: Vec<T>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JobLocation {
    pub id: i64,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub state: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct HiringTeamMember {
    pub full_name: Option<String>,
    pub role: Option<String>,
    pub linkedin_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JobCompany {
    pub logo: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimaryResumeMetadata {
    pub source_file_name: String,
    pub job_resume_file_name: String,
    pub selected_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "snake_case"))]
pub struct JobRecord {
    pub id: i64,
    pub job_title: String,
    #[serde(
        rename = "applicationStatus",
        alias = "application_status",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub application_status: Option<ApplicationStatus>,
    pub company: Option<String>,
    pub date_posted: Option<String>,
    pub discovered_at: Option<String>,
    pub closed_at: Option<String>,
    pub url: Option<String>,
    pub final_url: Option<String>,
    pub source_url: Option<String>,
    pub description: Option<String>,
    pub easy_apply: Option<bool>,
    pub seniority: Option<String>,
    pub company_object: Option<JobCompany>,
    pub country: Option<String>,
    pub country_code: Option<String>,
    pub remote: Option<bool>,
    pub hybrid: Option<bool>,
    pub location: Option<String>,
    pub long_location: Option<String>,
    pub short_location: Option<String>,
    #[serde(default)]
    pub locations: Vec<JobLocation>,
    pub salary_string: Option<String>,
    pub min_annual_salary_usd: Option<f64>,
    pub max_annual_salary_usd: Option<f64>,
    pub avg_annual_salary_usd: Option<f64>,
    #[serde(default)]
    pub hiring_team: Vec<HiringTeamMember>,
    #[serde(default)]
    pub manager_roles: Vec<String>,
    #[serde(default)]
    pub employment_statuses: Vec<String>,
    #[serde(default)]
    pub matching_phrases: Vec<String>,
    #[serde(default)]
    pub technology_slugs: Vec<String>,
    #[serde(default)]
    pub keyword_slugs: Vec<String>,
    #[serde(default)]
    pub has_blurred_data: bool,
    #[serde(
        rename = "resumeMatching",
        alias = "resume_matching",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub resume_matching: Option<super::resume_matching::ResumeMatchingResult>,
    #[serde(
        rename = "primaryResume",
        alias = "primary_resume",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub primary_resume: Option<PrimaryResumeMetadata>,
}

#[derive(Debug, Deserialize)]
struct JobSearchMetadata {
    total_results: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct JobSearchResponse {
    // Keep the API objects raw until the caller has had a chance to persist
    // them. The frontend model intentionally exposes only the fields needed
    // by the current table, but revealed-job storage must not discard any
    // fields returned by TheirStack.
    data: Vec<serde_json::Value>,
    metadata: Option<JobSearchMetadata>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSearchResult {
    jobs: Vec<JobRecord>,
    page: u64,
    limit: u64,
    total_results: Option<i64>,
}

/// Stage 1 of the search pipeline. Future query enrichment can be inserted
/// before this safety stage without changing the command or UI contracts.
fn prepare_job_search_request(
    mut filters: serde_json::Value,
    page: u64,
) -> Result<serde_json::Value, String> {
    let object = filters
        .as_object_mut()
        .ok_or("The job search filters must be a JSON object.")?;

    // TheirStack cannot provide preview data for exact company-identifier
    // filters. Reject those filters instead of silently making a paid request.
    const PREVIEW_INCOMPATIBLE_FILTERS: [&str; 5] = [
        "company_name_or",
        "company_name_case_insensitive_or",
        "company_domain_or",
        "company_linkedin_url_or",
        "company_id_or",
    ];
    if let Some(field) = PREVIEW_INCOMPATIBLE_FILTERS.iter().find(|field| {
        object
            .get(**field)
            .and_then(serde_json::Value::as_array)
            .is_some_and(|values| !values.is_empty())
    }) {
        return Err(format!(
            "The {field} filter cannot be used with blurred job searches. Remove it to avoid consuming credits."
        ));
    }

    object.insert("blur_company_data".into(), serde_json::Value::Bool(true));
    object.insert("limit".into(), serde_json::Value::from(JOB_SEARCH_LIMIT));
    object.insert("page".into(), serde_json::Value::from(page));
    // TheirStack documents total counting as an expensive operation and
    // recommends enabling it only on the initial page.
    object.insert(
        "include_total_results".into(),
        serde_json::Value::Bool(page == 0),
    );
    object.remove("offset");
    object.remove("cursor");
    Ok(filters)
}

pub fn search_jobs(
    settings: &TheirStackSettings,
    filters: serde_json::Value,
    page: u64,
) -> Result<JobSearchResult, String> {
    let request = prepare_job_search_request(filters, page)?;
    let response = send_job_request(settings, &request, "job search")?;
    let jobs = response
        .data
        .into_iter()
        .map(parse_job_record)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(JobSearchResult {
        jobs,
        page,
        limit: JOB_SEARCH_LIMIT,
        total_results: response
            .metadata
            .and_then(|metadata| metadata.total_results),
    })
}

pub fn reveal_job(
    settings: &TheirStackSettings,
    job_id: i64,
    date_posted: &str,
) -> Result<(JobRecord, serde_json::Value), String> {
    chrono::NaiveDate::parse_from_str(date_posted, "%Y-%m-%d").map_err(|_| {
        "This job cannot be revealed because its posted date is missing or invalid."
    })?;
    let request = serde_json::json!({
        "blur_company_data": false,
        "job_id_or": [job_id],
        "posted_at_gte": date_posted,
        "posted_at_lte": date_posted,
        "limit": 1,
        "page": 0
    });
    let response = send_job_request(settings, &request, "job reveal")?;
    let raw_job = response
        .data
        .into_iter()
        .find(|job| job.get("id").and_then(serde_json::Value::as_i64) == Some(job_id))
        .ok_or_else(|| "TheirStack did not return the selected job.".to_owned())?;
    let mut job = parse_job_record(raw_job.clone())?;
    job.application_status = Some(ApplicationStatus::Revealed);
    Ok((job, raw_job))
}

fn parse_job_record(value: serde_json::Value) -> Result<JobRecord, String> {
    serde_json::from_value(value)
        .map_err(|error| format!("TheirStack returned unreadable job results: {error}"))
}

fn send_job_request(
    settings: &TheirStackSettings,
    request: &serde_json::Value,
    operation: &str,
) -> Result<JobSearchResponse, String> {
    if !settings.enabled {
        return Err("TheirStack is disabled. Enable it in Provider Settings first.".into());
    }
    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Add a TheirStack API key in Provider Settings to search jobs.")?;
    let client = Client::builder()
        .timeout(JOB_REQUEST_TIMEOUT)
        .user_agent("MuttJobs/0.1")
        .build()
        .map_err(|error| format!("TheirStack client could not start: {error}"))?;
    let response = client
        .post(JOB_SEARCH_URL)
        .bearer_auth(api_key)
        .json(request)
        .send()
        .map_err(|error| {
            if error.is_timeout() {
                format!("TheirStack did not respond before the {operation} timed out.")
            } else {
                format!("TheirStack {operation} failed: {error}")
            }
        })?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("The TheirStack API key was rejected. Check it in Provider Settings.".into());
    }
    if status.as_u16() == 402 {
        return Err(
            "TheirStack reports that this workspace does not have enough API credits.".into(),
        );
    }
    if !status.is_success() {
        let message = api_error_message(response)
            .unwrap_or_else(|| format!("TheirStack returned HTTP {status}."));
        return Err(message);
    }
    response
        .json::<JobSearchResponse>()
        .map_err(|error| format!("TheirStack returned unreadable job results: {error}"))
}

pub fn search_locations(
    settings: &TheirStackSettings,
    query: &str,
) -> Result<Vec<CatalogLocation>, String> {
    if !settings.enabled {
        return Err("TheirStack is disabled. Enable it in Provider Settings first.".into());
    }

    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("Add a TheirStack API key in Provider Settings to search locations.")?;
    let query = query.trim();
    if query.len() > 200 {
        return Err("Location searches must be 200 characters or fewer.".into());
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("MuttJobs/0.1")
        .build()
        .map_err(|error| format!("TheirStack client could not start: {error}"))?;
    let mut request = client
        .get(LOCATION_CATALOG_URL)
        .bearer_auth(api_key)
        .query(&[("limit", "20")]);
    if !query.is_empty() {
        request = request.query(&[("name", query)]);
    }

    let response = request.send().map_err(|error| {
        if error.is_timeout() {
            "TheirStack did not respond before the location search timed out.".to_owned()
        } else {
            format!("TheirStack location search failed: {error}")
        }
    })?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("The TheirStack API key was rejected. Check it in Provider Settings.".into());
    }
    if !status.is_success() {
        let message = api_error_message(response)
            .unwrap_or_else(|| format!("TheirStack returned HTTP {status}."));
        return Err(message);
    }

    response
        .json::<Vec<CatalogLocation>>()
        .map_err(|error| format!("TheirStack returned unreadable location results: {error}"))
}

pub fn search_industries(
    settings: &TheirStackSettings,
    query: &str,
) -> Result<Vec<CatalogIndustry>, String> {
    let (client, api_key, query) = catalog_request_context(settings, query, "Industry")?;
    let mut request = client
        .get(INDUSTRY_CATALOG_URL)
        .bearer_auth(api_key)
        .query(&[("limit", "20")]);
    if !query.is_empty() {
        request = request.query(&[("industry", query)]);
    }

    send_catalog_request::<CatalogResponse<CatalogIndustry>>(request, "industry")
        .map(|response| response.data)
}

pub fn search_technologies(
    settings: &TheirStackSettings,
    query: &str,
) -> Result<Vec<CatalogTechnology>, String> {
    let (client, api_key, query) = catalog_request_context(settings, query, "Technology")?;
    if query.is_empty() {
        if let Some(cached) = cached_popular_technologies() {
            return Ok(cached);
        }
    }
    let limit = if query.is_empty() { "50" } else { "10" };
    let mut request = client
        .get(KEYWORD_CATALOG_URL)
        .bearer_auth(api_key)
        .query(&[("keyword_type", "technology"), ("limit", limit)]);
    if !query.is_empty() {
        request = request.query(&[("q", query)]);
    }

    let technologies =
        send_catalog_request::<CatalogResponse<CatalogTechnology>>(request, "technology")?.data;
    if query.is_empty() {
        cache_popular_technologies(&technologies);
    }
    Ok(technologies)
}

pub fn search_keywords(
    settings: &TheirStackSettings,
    query: &str,
) -> Result<Vec<CatalogTechnology>, String> {
    let (client, api_key, query) = catalog_request_context(settings, query, "Keyword")?;
    let mut request = client
        .get(KEYWORD_CATALOG_URL)
        .bearer_auth(api_key)
        .query(&[("limit", "20")]);
    if !query.is_empty() {
        request = request.query(&[("q", query)]);
    }

    send_catalog_request::<CatalogResponse<CatalogTechnology>>(request, "keyword")
        .map(|response| response.data)
}

fn cached_popular_technologies() -> Option<Vec<CatalogTechnology>> {
    let cache = TECHNOLOGY_EMPTY_CACHE.get_or_init(|| Mutex::new(None));
    let guard = cache.lock().ok()?;
    let (cached_at, technologies) = guard.as_ref()?;
    (cached_at.elapsed() < TECHNOLOGY_EMPTY_CACHE_TTL).then(|| technologies.clone())
}

fn cache_popular_technologies(technologies: &[CatalogTechnology]) {
    let cache = TECHNOLOGY_EMPTY_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), technologies.to_vec()));
    }
}

fn catalog_request_context<'a>(
    settings: &'a TheirStackSettings,
    query: &'a str,
    resource: &str,
) -> Result<(Client, &'a str, &'a str), String> {
    if !settings.enabled {
        return Err("TheirStack is disabled. Enable it in Provider Settings first.".into());
    }

    let api_key = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!("Add a TheirStack API key in Provider Settings to search {resource}s.")
        })?;
    let query = query.trim();
    if query.len() > 200 {
        return Err(format!(
            "{resource} searches must be 200 characters or fewer."
        ));
    }

    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("MuttJobs/0.1")
        .build()
        .map_err(|error| format!("TheirStack client could not start: {error}"))?;
    Ok((client, api_key, query))
}

fn send_catalog_request<T: DeserializeOwned>(
    request: RequestBuilder,
    resource: &str,
) -> Result<T, String> {
    let response = request.send().map_err(|error| {
        if error.is_timeout() {
            format!("TheirStack did not respond before the {resource} search timed out.")
        } else {
            format!("TheirStack {resource} search failed: {error}")
        }
    })?;
    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("The TheirStack API key was rejected. Check it in Provider Settings.".into());
    }
    if !status.is_success() {
        let message = api_error_message(response)
            .unwrap_or_else(|| format!("TheirStack returned HTTP {status}."));
        return Err(message);
    }

    response
        .json::<T>()
        .map_err(|error| format!("TheirStack returned unreadable {resource} results: {error}"))
}

pub fn check_health(settings: &TheirStackSettings) -> ProviderHealth {
    if !settings.enabled {
        return health("disabled", None, None, "TheirStack is disabled.");
    }

    let Some(api_key) = settings
        .api_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return health(
            "authentication_required",
            Some(false),
            None,
            "Add a TheirStack API key to connect this provider.",
        );
    };

    let client = match Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("MuttJobs/0.1")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return health(
                "unhealthy",
                None,
                None,
                &format!("TheirStack client could not start: {error}"),
            )
        }
    };

    let response = match client.get(CREDIT_BALANCE_URL).bearer_auth(api_key).send() {
        Ok(response) => response,
        Err(error) => {
            let message = if error.is_timeout() {
                "TheirStack did not respond before the connection timed out.".to_owned()
            } else {
                format!("TheirStack could not be reached: {error}")
            };
            return health("unhealthy", None, None, &message);
        }
    };

    let status = response.status();
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return health(
            "authentication_required",
            Some(false),
            None,
            "The TheirStack API key was rejected. Check or replace the key.",
        );
    }
    if !status.is_success() {
        let message = api_error_message(response)
            .unwrap_or_else(|| format!("TheirStack returned HTTP {status}."));
        return health("unhealthy", None, None, &message);
    }

    match response.json::<CreditBalanceResponse>() {
        Ok(balance) => health(
            "available",
            Some(true),
            Some(TheirStackCreditBalance {
                api_credits: balance.api_credits,
                used_api_credits: balance.used_api_credits,
                earliest_expiration: balance.earliest_expiration,
            }),
            "Connected to TheirStack.",
        ),
        Err(error) => health(
            "unhealthy",
            Some(true),
            None,
            &format!("TheirStack returned an unreadable credit balance: {error}"),
        ),
    }
}

fn api_error_message(response: Response) -> Option<String> {
    let envelope = response.json::<ErrorEnvelope>().ok()?;
    let error = envelope.error?;
    error.description.or(error.title)
}

fn health(
    state: &str,
    authenticated: Option<bool>,
    credit_balance: Option<TheirStackCreditBalance>,
    message: &str,
) -> ProviderHealth {
    ProviderHealth {
        provider_id: "theirstack".into(),
        state: state.into(),
        executable_path: None,
        version: None,
        authenticated,
        checked_at: Utc::now().to_rfc3339(),
        message: Some(message.into()),
        credit_balance,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_key_requires_authentication() {
        let health = check_health(&TheirStackSettings::default());
        assert_eq!(health.state, "authentication_required");
        assert_eq!(health.authenticated, Some(false));
    }

    #[test]
    fn disabled_provider_skips_authentication() {
        let health = check_health(&TheirStackSettings {
            enabled: false,
            ..TheirStackSettings::default()
        });
        assert_eq!(health.state, "disabled");
    }

    #[test]
    fn catalog_location_maps_api_fields_to_frontend_shape() {
        let location = serde_json::from_value::<CatalogLocation>(serde_json::json!({
            "id": 5128581,
            "name": "New York City",
            "display_name": "New York City, New York",
            "country_code": "US",
            "country_name": "United States",
            "admin1_name": "New York",
            "feature_code": "PPL",
            "feature_name": "city"
        }))
        .expect("TheirStack location response should deserialize");

        let frontend = serde_json::to_value(location).expect("location should serialize");
        assert_eq!(frontend["displayName"], "New York City, New York");
        assert_eq!(frontend["countryCode"], "US");
        assert!(frontend.get("display_name").is_none());
    }

    #[test]
    fn catalog_industry_maps_api_fields_to_frontend_shape() {
        let response =
            serde_json::from_value::<CatalogResponse<CatalogIndustry>>(serde_json::json!({
                "data": [{
                    "companies": 120,
                    "description": "Software publishers",
                    "hierarchy": "Technology > Software",
                    "industry": "Software Development",
                    "industry_id": 4,
                    "jobs": 900,
                    "parent_id": 3
                }],
                "metadata": { "total_results": 1 }
            }))
            .expect("TheirStack industry response should deserialize");

        let frontend = serde_json::to_value(&response.data[0]).expect("industry should serialize");
        assert_eq!(frontend["industryId"], 4);
        assert_eq!(frontend["industry"], "Software Development");
        assert!(frontend.get("industry_id").is_none());
    }

    #[test]
    fn catalog_technology_maps_api_fields_to_frontend_shape() {
        let response =
            serde_json::from_value::<CatalogResponse<CatalogTechnology>>(serde_json::json!({
                "data": [{
                    "category": "Relational Database",
                    "category_slug": "relational-database",
                    "companies": 120,
                    "companies_found_last_week": 3,
                    "description": "Database",
                    "jobs": 900,
                    "logo": null,
                    "logo_thumbnail": null,
                    "name": "PostgreSQL",
                    "one_liner": "Open source database",
                    "parent_category": "Data Stores",
                    "parent_category_slug": "data-stores",
                    "slug": "postgresql",
                    "type": "technology",
                    "url": "https://www.postgresql.org"
                }],
                "metadata": { "total_results": 1 }
            }))
            .expect("TheirStack technology response should deserialize");

        let frontend =
            serde_json::to_value(&response.data[0]).expect("technology should serialize");
        assert_eq!(frontend["categorySlug"], "relational-database");
        assert_eq!(frontend["type"], "technology");
        assert!(frontend.get("keywordType").is_none());
    }

    #[test]
    fn job_search_pipeline_forces_blurred_page_size_and_preserves_page() {
        let prepared = prepare_job_search_request(
            serde_json::json!({
                "posted_at_max_age_days": 30,
                "blur_company_data": false,
                "limit": 500,
                "page": 0,
                "include_total_results": false,
                "offset": 20
            }),
            9,
        )
        .expect("valid search should be prepared");

        assert_eq!(prepared["blur_company_data"], true);
        assert_eq!(prepared["limit"], 20);
        assert_eq!(prepared["page"], 9);
        assert_eq!(prepared["include_total_results"], false);
        assert!(prepared.get("offset").is_none());
    }

    #[test]
    fn initial_job_search_page_requests_total_results() {
        let prepared =
            prepare_job_search_request(serde_json::json!({ "posted_at_max_age_days": 30 }), 0)
                .expect("valid search should be prepared");

        assert_eq!(prepared["page"], 0);
        assert_eq!(prepared["include_total_results"], true);
    }

    #[test]
    fn job_search_pipeline_rejects_filters_that_disable_preview_mode() {
        let error = prepare_job_search_request(
            serde_json::json!({
                "posted_at_max_age_days": 30,
                "company_domain_or": ["example.com"]
            }),
            0,
        )
        .expect_err("company identifiers must not bypass preview mode");

        assert!(error.contains("cannot be used with blurred job searches"));
    }

    #[test]
    fn job_record_maps_api_fields_to_frontend_shape() {
        let job = serde_json::from_value::<JobRecord>(serde_json::json!({
            "id": 1234,
            "job_title": "Senior Data Engineer",
            "application_status": "in_process",
            "date_posted": "2026-08-17",
            "description": "Build reliable data systems.",
            "easy_apply": true,
            "seniority": "senior",
            "company_object": { "logo": "https://example.com/logo.png" },
            "technology_slugs": ["postgresql", "kafka"],
            "keyword_slugs": ["postgresql", "kafka", "data-platform"],
            "locations": [],
            "hiring_team": [],
            "manager_roles": [],
            "employment_statuses": ["full_time"],
            "matching_phrases": [],
            "has_blurred_data": true,
            "primaryResume": {
                "sourceFileName": "joshua-rodriguez.json",
                "jobResumeFileName": "primary-resume.json",
                "selectedAt": "2026-08-18T12:00:00Z"
            }
        }))
        .expect("job response should deserialize");

        let frontend = serde_json::to_value(job).expect("job should serialize");
        assert_eq!(frontend["jobTitle"], "Senior Data Engineer");
        assert_eq!(frontend["datePosted"], "2026-08-17");
        assert_eq!(frontend["applicationStatus"], "in_process");
        assert_eq!(frontend["description"], "Build reliable data systems.");
        assert_eq!(
            frontend["companyObject"]["logo"],
            "https://example.com/logo.png"
        );
        assert_eq!(frontend["technologySlugs"][1], "kafka");
        assert_eq!(frontend["keywordSlugs"][2], "data-platform");
        assert_eq!(frontend["hasBlurredData"], true);
        assert_eq!(
            frontend["primaryResume"]["sourceFileName"],
            "joshua-rodriguez.json"
        );
        assert_eq!(
            frontend["primaryResume"]["jobResumeFileName"],
            "primary-resume.json"
        );
        assert!(frontend.get("job_title").is_none());
    }

    #[test]
    fn legacy_job_without_application_status_remains_readable() {
        let job = serde_json::from_value::<JobRecord>(serde_json::json!({
            "id": 1234,
            "job_title": "Senior Data Engineer"
        }))
        .expect("legacy saved jobs should deserialize without a status");

        assert_eq!(job.application_status, None);
    }

    #[test]
    fn job_response_keeps_unmodeled_api_fields_available_for_persistence() {
        let response = serde_json::from_value::<JobSearchResponse>(serde_json::json!({
            "data": [{
                "id": 1234,
                "job_title": "Senior Data Engineer",
                "company_object": {
                    "domain": "example.com",
                    "funding_rounds": [{ "amount_usd": 1000000 }]
                },
                "description": "A complete job description from TheirStack."
            }],
            "metadata": { "total_results": 1 }
        }))
        .expect("job response should deserialize without dropping API fields");

        assert_eq!(
            response.data[0]["company_object"]["funding_rounds"][0]["amount_usd"],
            1000000
        );
        assert_eq!(
            response.data[0]["description"],
            "A complete job description from TheirStack."
        );
    }
}
