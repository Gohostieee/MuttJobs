use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use include_dir::{include_dir, Dir};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

static BUNDLED_SKILLS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/resources/default-skills");
static INSTALL_SEQUENCE: AtomicU64 = AtomicU64::new(0);

const LEGACY_BAZINGA_NAME: &str = "bazinga-test";
const LEGACY_BAZINGA_SOURCE: &str = r#"---
name: bazinga-test
description: Test MuttJobs skill discovery and explicit invocation by ending every natural-language sentence the agent writes with Bazinga. Use only when explicitly invoked.
---

This is a pipeline verification skill.

End every natural-language sentence you write with the exact text `Bazinga!`, including visible progress, analysis, and the final user-facing response.

The word `Bazinga!` must be the final text of each sentence. Do not place another sentence-ending character after it.

Do not modify any files. Do not claim that you modified the resume. Follow the user's requested content and length except for the required sentence ending.
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkill {
    pub name: String,
    pub description: String,
    pub path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillCatalogError {
    pub path: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSkillCatalog {
    pub skills: Vec<AgentSkill>,
    pub errors: Vec<AgentSkillCatalogError>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SkillMention {
    pub name: String,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
}

pub(crate) fn agent_workspace_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("resumes"))
}

pub(crate) fn agent_skills_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(agent_workspace_root(app)?.join(".agents").join("skills"))
}

pub(crate) fn list_agent_skills(app: AppHandle) -> Result<AgentSkillCatalog, String> {
    let root = ensure_skill_root(&app)?;
    install_bundled_skills(&app, &root)?;
    read_skill_catalog(&root)
}

pub(crate) fn ensure_skill_root(app: &AppHandle) -> Result<PathBuf, String> {
    let workspace = agent_workspace_root(app)?;
    fs::create_dir_all(&workspace)
        .map_err(|error| format!("The agent workspace could not be created: {error}"))?;
    let canonical_workspace = fs::canonicalize(&workspace)
        .map_err(|error| format!("The agent workspace could not be resolved: {error}"))?;
    let requested_root = agent_skills_root(app)?;
    let agents = requested_root
        .parent()
        .ok_or("The local skill directory has no managed parent.")?;
    let canonical_agents = ensure_managed_directory(
        &agents,
        &canonical_workspace,
        "the agent metadata directory",
    )?;
    let root = canonical_agents.join("skills");
    ensure_managed_directory(&root, &canonical_workspace, "the local skill directory")
}

fn ensure_managed_directory(
    path: &Path,
    managed_root: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_dir() && !metadata.file_type().is_symlink() => {
            return Err(format!("{label} is not a directory."));
        }
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::create_dir(path)
                .map_err(|error| format!("{label} could not be created: {error}"))?;
        }
        Err(error) => return Err(format!("{label} could not be inspected: {error}")),
    }

    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("{label} could not be resolved: {error}"))?;
    ensure_within(managed_root, &canonical)?;
    if !canonical.is_dir() {
        return Err(format!("{label} is not a directory."));
    }
    Ok(canonical)
}

fn install_bundled_skills(app: &AppHandle, skills_root: &Path) -> Result<(), String> {
    let packaged_root = app
        .path()
        .resource_dir()
        .ok()
        .map(|directory| directory.join("default-skills"));
    install_bundled_skills_from(skills_root, packaged_root.as_deref())
}

fn install_bundled_skills_from(
    skills_root: &Path,
    packaged_root: Option<&Path>,
) -> Result<(), String> {
    let canonical_root = fs::canonicalize(skills_root)
        .map_err(|error| format!("The local skill directory could not be resolved: {error}"))?;
    remove_pristine_legacy_bazinga(&canonical_root)?;

    let canonical_packaged_root = match packaged_root {
        Some(path) => match fs::canonicalize(path) {
            Ok(path) if path.is_dir() => Some(path),
            Ok(_) => return Err("The bundled skill resource is not a directory.".into()),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => {
                return Err(format!(
                    "The bundled skill resource could not be resolved: {error}"
                ))
            }
        },
        None => None,
    };

    for embedded_skill in BUNDLED_SKILLS.dirs() {
        let name = embedded_skill
            .path()
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("A bundled skill directory has an invalid name.")?;
        validate_bundled_skill(name, embedded_skill)?;

        let destination = canonical_root.join(name);
        match fs::symlink_metadata(&destination) {
            Ok(_) => continue,
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Bundled skill `{name}` could not be inspected: {error}"
                ))
            }
        }

        let packaged_skill = canonical_packaged_root
            .as_deref()
            .map(|root| root.join(name))
            .filter(|path| path.exists());
        install_one_bundled_skill(
            &canonical_root,
            name,
            embedded_skill,
            packaged_skill.as_deref(),
            canonical_packaged_root.as_deref(),
        )?;
    }
    Ok(())
}

fn validate_bundled_skill(name: &str, skill: &Dir<'_>) -> Result<(), String> {
    if !is_valid_skill_name(name) {
        return Err(format!(
            "Bundled skill directory `{name}` has an invalid name."
        ));
    }
    let skill_file = skill
        .get_file(skill.path().join("SKILL.md"))
        .ok_or_else(|| format!("Bundled skill `{name}` has no SKILL.md."))?;
    let contents = std::str::from_utf8(skill_file.contents())
        .map_err(|_| format!("Bundled skill `{name}` is not valid UTF-8."))?;
    let (document_name, _) = parse_skill_document(contents)?;
    if document_name != name {
        return Err(format!(
            "Bundled skill folder `{name}` does not match frontmatter name `{document_name}`."
        ));
    }
    Ok(())
}

fn install_one_bundled_skill(
    skills_root: &Path,
    name: &str,
    embedded_skill: &Dir<'_>,
    packaged_skill: Option<&Path>,
    packaged_root: Option<&Path>,
) -> Result<(), String> {
    let sequence = INSTALL_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let staging = skills_root.join(format!(".{name}-install-{}-{sequence}", std::process::id()));
    fs::create_dir(&staging)
        .map_err(|error| format!("Bundled skill `{name}` could not be staged: {error}"))?;
    let canonical_staging = fs::canonicalize(&staging).map_err(|error| {
        format!("Bundled skill `{name}` staging could not be resolved: {error}")
    })?;
    ensure_within(skills_root, &canonical_staging)?;

    let copy_result = if let (Some(source), Some(source_root)) = (packaged_skill, packaged_root) {
        copy_packaged_skill(source_root, source, &canonical_staging)
    } else {
        copy_embedded_dir(embedded_skill, &canonical_staging)
    };

    if let Err(error) = copy_result {
        let _ = fs::remove_dir_all(&canonical_staging);
        return Err(error);
    }

    let validation_result = (|| {
        let installed_document = fs::read_to_string(canonical_staging.join("SKILL.md"))
            .map_err(|error| format!("Bundled skill `{name}` could not be validated: {error}"))?;
        let (installed_name, _) = parse_skill_document(&installed_document)?;
        if installed_name != name {
            return Err(format!(
                "Bundled skill folder `{name}` does not match installed frontmatter name `{installed_name}`."
            ));
        }
        Ok(())
    })();
    if let Err(error) = validation_result {
        let _ = fs::remove_dir_all(&canonical_staging);
        return Err(error);
    }

    let destination = skills_root.join(name);
    match fs::rename(&canonical_staging, &destination) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            let _ = fs::remove_dir_all(&canonical_staging);
            Ok(())
        }
        Err(error) => {
            let _ = fs::remove_dir_all(&canonical_staging);
            Err(format!(
                "Bundled skill `{name}` could not be installed: {error}"
            ))
        }
    }
}

fn copy_embedded_dir(source: &Dir<'_>, destination: &Path) -> Result<(), String> {
    for directory in source.dirs() {
        let name = directory
            .path()
            .file_name()
            .ok_or("A bundled skill resource has an invalid directory name.")?;
        let child = destination.join(name);
        fs::create_dir(&child)
            .map_err(|error| format!("A bundled skill directory could not be created: {error}"))?;
        copy_embedded_dir(directory, &child)?;
    }
    for file in source.files() {
        let name = file
            .path()
            .file_name()
            .ok_or("A bundled skill resource has an invalid file name.")?;
        write_new_file(&destination.join(name), file.contents())?;
    }
    Ok(())
}

fn copy_packaged_skill(
    source_root: &Path,
    source: &Path,
    destination: &Path,
) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format!("A bundled skill resource could not be inspected: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("A bundled skill resource must be a real directory.".into());
    }
    let canonical_source = fs::canonicalize(source)
        .map_err(|error| format!("A bundled skill resource could not be resolved: {error}"))?;
    ensure_within(source_root, &canonical_source)?;
    copy_packaged_dir(source_root, &canonical_source, destination)
}

fn copy_packaged_dir(source_root: &Path, source: &Path, destination: &Path) -> Result<(), String> {
    for entry in fs::read_dir(source)
        .map_err(|error| format!("A bundled skill resource could not be read: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("A bundled skill entry could not be read: {error}"))?;
        let metadata = entry
            .file_type()
            .map_err(|error| format!("A bundled skill entry could not be inspected: {error}"))?;
        if metadata.is_symlink() {
            return Err("Bundled skill resources cannot contain symlinks.".into());
        }
        let canonical_entry = fs::canonicalize(entry.path())
            .map_err(|error| format!("A bundled skill entry could not be resolved: {error}"))?;
        ensure_within(source_root, &canonical_entry)?;
        let target = destination.join(entry.file_name());
        if metadata.is_dir() {
            fs::create_dir(&target).map_err(|error| {
                format!("A bundled skill directory could not be created: {error}")
            })?;
            copy_packaged_dir(source_root, &canonical_entry, &target)?;
        } else if metadata.is_file() {
            let contents = fs::read(&canonical_entry)
                .map_err(|error| format!("A bundled skill file could not be read: {error}"))?;
            write_new_file(&target, &contents)?;
        }
    }
    Ok(())
}

fn write_new_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| {
            format!(
                "Bundled skill file {} could not be created: {error}",
                path.display()
            )
        })?;
    file.write_all(contents)
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!(
                "Bundled skill file {} could not be written: {error}",
                path.display()
            )
        })
}

fn remove_pristine_legacy_bazinga(skills_root: &Path) -> Result<(), String> {
    let legacy = skills_root.join(LEGACY_BAZINGA_NAME);
    let metadata = match fs::symlink_metadata(&legacy) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(format!(
                "The legacy test skill could not be inspected: {error}"
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(&legacy)
        .map_err(|error| format!("The legacy test skill could not be read: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("The legacy test skill could not be read: {error}"))?;
    if entries.len() != 1 || entries[0].file_name() != "SKILL.md" {
        return Ok(());
    }
    let skill_path = entries[0].path();
    let skill_metadata = fs::symlink_metadata(&skill_path)
        .map_err(|error| format!("The legacy test skill could not be inspected: {error}"))?;
    if skill_metadata.file_type().is_symlink() || !skill_metadata.is_file() {
        return Ok(());
    }
    let contents = fs::read_to_string(&skill_path)
        .map_err(|error| format!("The legacy test skill could not be read: {error}"))?;
    if contents.replace("\r\n", "\n") == LEGACY_BAZINGA_SOURCE {
        let canonical_legacy = fs::canonicalize(&legacy)
            .map_err(|error| format!("The legacy test skill could not be resolved: {error}"))?;
        ensure_within(skills_root, &canonical_legacy)?;
        fs::remove_dir_all(&canonical_legacy)
            .map_err(|error| format!("The legacy test skill could not be removed: {error}"))?;
    }
    Ok(())
}

pub(crate) fn read_skill_catalog(skills_root: &Path) -> Result<AgentSkillCatalog, String> {
    let canonical_root = fs::canonicalize(skills_root)
        .map_err(|error| format!("The local skill directory could not be resolved: {error}"))?;
    let mut skills = Vec::new();
    let mut errors = Vec::new();

    for entry in fs::read_dir(&canonical_root)
        .map_err(|error| format!("The local skill directory could not be read: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("A local skill entry could not be read: {error}"))?;
        let entry_path = entry.path();
        let canonical_entry = match fs::canonicalize(&entry_path) {
            Ok(path) => path,
            Err(error) => {
                errors.push(catalog_error(
                    &entry_path,
                    format!("The skill directory could not be resolved: {error}"),
                ));
                continue;
            }
        };

        if !canonical_entry.is_dir() {
            continue;
        }
        if let Err(error) = ensure_within(&canonical_root, &canonical_entry) {
            errors.push(catalog_error(&entry_path, error));
            continue;
        }

        let skill_path = entry_path.join("SKILL.md");
        let canonical_skill_path = match fs::canonicalize(&skill_path) {
            Ok(path) => path,
            Err(error) => {
                errors.push(catalog_error(
                    &skill_path,
                    format!("SKILL.md could not be resolved: {error}"),
                ));
                continue;
            }
        };
        if let Err(error) = ensure_within(&canonical_root, &canonical_skill_path) {
            errors.push(catalog_error(&skill_path, error));
            continue;
        }
        if canonical_skill_path.parent() != Some(canonical_entry.as_path()) {
            errors.push(catalog_error(
                &skill_path,
                "SKILL.md must remain inside its immediate skill directory.".into(),
            ));
            continue;
        }

        let content = match fs::read_to_string(&canonical_skill_path) {
            Ok(content) => content,
            Err(error) => {
                errors.push(catalog_error(
                    &canonical_skill_path,
                    format!("SKILL.md could not be read as UTF-8: {error}"),
                ));
                continue;
            }
        };
        match parse_skill_document(&content) {
            Ok((name, description)) => skills.push(AgentSkill {
                name,
                description,
                path: canonical_skill_path.to_string_lossy().into_owned(),
                enabled: true,
            }),
            Err(error) => errors.push(catalog_error(&canonical_skill_path, error)),
        }
    }

    skills.sort_by(|left, right| left.name.cmp(&right.name));
    errors.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(AgentSkillCatalog { skills, errors })
}

fn catalog_error(path: &Path, message: String) -> AgentSkillCatalogError {
    AgentSkillCatalogError {
        path: Some(path.to_string_lossy().into_owned()),
        message,
    }
}

fn parse_skill_document(content: &str) -> Result<(String, String), String> {
    let content = content.strip_prefix('\u{feff}').unwrap_or(content);
    let mut lines = content.split_inclusive('\n');
    let opening = lines
        .next()
        .ok_or("SKILL.md must start with YAML frontmatter.")?;
    if opening.trim() != "---" {
        return Err("SKILL.md must start with YAML frontmatter.".into());
    }

    let mut yaml = String::new();
    let mut closed = false;
    for line in lines {
        if line.trim() == "---" {
            closed = true;
            break;
        }
        yaml.push_str(line);
    }
    if !closed {
        return Err("SKILL.md frontmatter is not closed.".into());
    }

    let frontmatter: SkillFrontmatter = serde_yaml::from_str(&yaml)
        .map_err(|error| format!("SKILL.md frontmatter is invalid YAML: {error}"))?;
    let name = frontmatter
        .name
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or("SKILL.md frontmatter requires a non-empty name.")?;
    if !is_valid_skill_name(&name) {
        return Err("SKILL.md frontmatter name must match [a-z0-9]+(?:-[a-z0-9]+)*.".into());
    }
    let description = frontmatter
        .description
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or("SKILL.md frontmatter requires a non-empty description.")?;
    Ok((name, description))
}

pub(crate) fn is_valid_skill_name(name: &str) -> bool {
    if name.is_empty() || name.starts_with('-') || name.ends_with('-') || name.contains("--") {
        return false;
    }
    name.bytes().all(|character| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || character == b'-'
    })
}

fn ensure_within(root: &Path, candidate: &Path) -> Result<(), String> {
    if candidate == root || candidate.strip_prefix(root).is_ok() {
        Ok(())
    } else {
        Err("The local skill path escapes the managed skill directory.".into())
    }
}

pub(crate) fn parse_skill_mentions(prompt: &str) -> Result<Vec<SkillMention>, String> {
    let mut mentions = Vec::new();
    let mut cursor = 0;
    while let Some(relative_start) = prompt[cursor..].find("#(") {
        let start = cursor + relative_start;
        let name_start = start + 2;
        let Some(relative_end) = prompt[name_start..].find(')') else {
            return Err("Malformed local skill mention. Use #(skill-name).".into());
        };
        let end = name_start + relative_end + 1;
        let name = &prompt[name_start..end - 1];
        if !is_valid_skill_name(name) {
            return Err(format!(
                "Malformed local skill mention `#({name})`. Use #(skill-name)."
            ));
        }
        mentions.push(SkillMention {
            name: name.to_owned(),
            start,
            end,
        });
        cursor = end;
    }
    Ok(mentions)
}

pub(crate) fn unique_skill_names(mentions: &[SkillMention]) -> Vec<String> {
    let mut seen = HashSet::new();
    mentions
        .iter()
        .filter_map(|mention| {
            if seen.insert(mention.name.clone()) {
                Some(mention.name.clone())
            } else {
                None
            }
        })
        .collect()
}

pub(crate) fn validate_provider_skill_mentions(
    provider_id: &str,
    mention_count: usize,
    requested_skill_count: usize,
) -> Result<(), String> {
    if provider_id != "codex" && (mention_count > 0 || requested_skill_count > 0) {
        return Err("Local Codex skills require the Codex provider.".into());
    }
    Ok(())
}

pub(crate) fn transform_skill_mentions(prompt: &str, mentions: &[SkillMention]) -> String {
    if mentions.is_empty() {
        return prompt.to_owned();
    }

    let mut transformed = String::with_capacity(prompt.len() + mentions.len());
    let mut cursor = 0;
    for mention in mentions {
        transformed.push_str(&prompt[cursor..mention.start]);
        transformed.push('$');
        transformed.push_str(&mention.name);
        cursor = mention.end;
    }
    transformed.push_str(&prompt[cursor..]);
    transformed
}

pub(crate) fn resolve_skill_names(
    mentions: &[SkillMention],
    catalog: &AgentSkillCatalog,
) -> Result<(), String> {
    for name in unique_skill_names(mentions) {
        let matches = catalog
            .skills
            .iter()
            .filter(|skill| skill.name == name)
            .count();
        if matches != 1 {
            return Err(format!(
                "Local skill `{name}` is not available. Refresh the skill catalog and try again."
            ));
        }
    }
    Ok(())
}

pub(crate) fn resolve_prompt(
    app: &AppHandle,
    provider_id: &str,
    prompt: &str,
    requested_skills: Option<&[String]>,
) -> Result<String, String> {
    let mentions = parse_skill_mentions(prompt)?;
    let requested_count = requested_skills.map_or(0, |skills| skills.len());
    validate_provider_skill_mentions(provider_id, mentions.len(), requested_count)?;

    if let Some(requested_skills) = requested_skills {
        let mut requested_names = HashSet::new();
        for name in requested_skills {
            if !is_valid_skill_name(name) {
                return Err("Skill mentions could not be validated.".into());
            }
            requested_names.insert(name.as_str());
        }
        let mention_names = unique_skill_names(&mentions);
        let mention_names: HashSet<&str> = mention_names.iter().map(String::as_str).collect();
        if requested_names != mention_names {
            return Err("Skill mentions could not be validated.".into());
        }
    }

    if mentions.is_empty() {
        return Ok(prompt.to_owned());
    }

    let root = ensure_skill_root(app)?;
    install_bundled_skills(app, &root)?;
    let catalog = read_skill_catalog(&root)?;
    resolve_skill_names(&mentions, &catalog)?;
    Ok(transform_skill_mentions(prompt, &mentions))
}

#[cfg(test)]
pub(crate) fn install_bundled_skills_at(skills_root: &Path) -> Result<(), String> {
    fs::create_dir_all(skills_root).map_err(|error| error.to_string())?;
    install_bundled_skills_from(skills_root, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const VALID_SKILL: &str =
        "---\nname: sample-skill\ndescription: A sample local skill.\n---\n\nInstructions.\n";
    const PRODUCTION_SKILLS: [&str; 12] = [
        "ats-review",
        "consistency-check",
        "edit-section",
        "edit-selection",
        "grade-resume",
        "improve-bullets",
        "job-match",
        "prioritize-compress",
        "quantify-impact",
        "resume-summary",
        "seniority-signal-audit",
        "tailor-to-job",
    ];

    fn skill(name: &str) -> AgentSkill {
        AgentSkill {
            name: name.into(),
            description: "test".into(),
            path: format!("/{name}/SKILL.md"),
            enabled: true,
        }
    }

    fn embedded_skill(name: &str) -> &'static Dir<'static> {
        BUNDLED_SKILLS
            .dirs()
            .find(|skill| skill.path().file_name().and_then(|value| value.to_str()) == Some(name))
            .unwrap()
    }

    fn embedded_text(skill: &Dir<'_>, relative: &str) -> String {
        let file = skill.get_file(skill.path().join(relative)).unwrap();
        std::str::from_utf8(file.contents()).unwrap().to_owned()
    }

    #[test]
    fn catalog_keeps_valid_skills_when_another_skill_is_malformed() {
        let directory = tempdir().unwrap();
        let valid = directory.path().join("valid");
        let malformed = directory.path().join("malformed");
        fs::create_dir_all(&valid).unwrap();
        fs::create_dir_all(&malformed).unwrap();
        fs::write(valid.join("SKILL.md"), VALID_SKILL).unwrap();
        fs::write(malformed.join("SKILL.md"), "name: missing-delimiters\n").unwrap();

        let catalog = read_skill_catalog(directory.path()).unwrap();
        assert_eq!(catalog.skills.len(), 1);
        assert_eq!(catalog.skills[0].name, "sample-skill");
        assert_eq!(catalog.errors.len(), 1);
    }

    #[test]
    fn catalog_rejects_missing_and_invalid_frontmatter() {
        for contents in [
            "name: no-frontmatter\n",
            "---\nname: unclosed\n",
            "---\nname: Bad Name\ndescription: no\n---\n",
            "---\nname: missing-description\n---\n",
        ] {
            let directory = tempdir().unwrap();
            let skill_dir = directory.path().join("skill");
            fs::create_dir_all(&skill_dir).unwrap();
            fs::write(skill_dir.join("SKILL.md"), contents).unwrap();
            let catalog = read_skill_catalog(directory.path()).unwrap();
            assert!(catalog.skills.is_empty());
            assert_eq!(catalog.errors.len(), 1);
        }
    }

    #[test]
    fn catalog_rejects_invalid_utf8() {
        let directory = tempdir().unwrap();
        let skill_dir = directory.path().join("invalid-utf8");
        fs::create_dir_all(&skill_dir).unwrap();
        fs::write(skill_dir.join("SKILL.md"), [0xff, 0xfe, 0xfd]).unwrap();

        let catalog = read_skill_catalog(directory.path()).unwrap();
        assert!(catalog.skills.is_empty());
        assert_eq!(catalog.errors.len(), 1);
        assert!(catalog.errors[0].message.contains("UTF-8"));
    }

    #[test]
    fn bundled_install_installs_all_skills_and_nested_resources() {
        let directory = tempdir().unwrap();
        install_bundled_skills_at(directory.path()).unwrap();

        let catalog = read_skill_catalog(directory.path()).unwrap();
        assert_eq!(
            catalog
                .skills
                .iter()
                .map(|skill| skill.name.as_str())
                .collect::<Vec<_>>(),
            PRODUCTION_SKILLS
        );
        assert!(directory
            .path()
            .join("improve-bullets/agents/openai.yaml")
            .is_file());
        assert!(directory
            .path()
            .join("improve-bullets/references/bullet-framework.md")
            .is_file());
        assert!(!directory.path().join(LEGACY_BAZINGA_NAME).exists());
    }

    #[test]
    fn bundled_install_does_not_merge_or_overwrite_existing_skill() {
        let directory = tempdir().unwrap();
        let existing = directory.path().join("improve-bullets");
        fs::create_dir_all(&existing).unwrap();
        fs::write(existing.join("SKILL.md"), "user-edited\n").unwrap();

        install_bundled_skills_at(directory.path()).unwrap();

        assert_eq!(
            fs::read_to_string(existing.join("SKILL.md")).unwrap(),
            "user-edited\n"
        );
        assert!(!existing.join("agents/openai.yaml").exists());
    }

    #[test]
    fn bundled_folders_match_their_frontmatter_names() {
        for skill in BUNDLED_SKILLS.dirs() {
            let name = skill.path().file_name().unwrap().to_str().unwrap();
            validate_bundled_skill(name, skill).unwrap();
        }
    }

    #[test]
    fn bundled_skills_have_standard_frontmatter_and_matching_interface_prompts() {
        for name in PRODUCTION_SKILLS {
            let skill = embedded_skill(name);
            let document = embedded_text(skill, "SKILL.md");
            let yaml = document
                .strip_prefix("---\n")
                .unwrap()
                .split_once("\n---")
                .unwrap()
                .0;
            let frontmatter = serde_yaml::from_str::<serde_yaml::Mapping>(yaml).unwrap();
            assert_eq!(
                frontmatter.len(),
                2,
                "unexpected frontmatter keys for {name}"
            );
            assert!(frontmatter.contains_key(serde_yaml::Value::from("name")));
            assert!(frontmatter.contains_key(serde_yaml::Value::from("description")));

            let interface = embedded_text(skill, "agents/openai.yaml");
            let interface = serde_yaml::from_str::<serde_yaml::Value>(&interface).unwrap();
            let default_prompt = interface["interface"]["default_prompt"].as_str().unwrap();
            assert!(
                default_prompt.contains(&format!("${name}")),
                "default prompt does not mention ${name}"
            );
        }
    }

    #[test]
    fn bundled_skill_contracts_declare_write_and_safety_boundaries() {
        for name in [
            "ats-review",
            "consistency-check",
            "grade-resume",
            "job-match",
            "prioritize-compress",
            "quantify-impact",
            "seniority-signal-audit",
        ] {
            let document = embedded_text(embedded_skill(name), "SKILL.md");
            assert!(
                document
                    .to_ascii_lowercase()
                    .contains("do not write, touch, reformat, or resave"),
                "{name} does not declare its read-only boundary"
            );
        }

        for name in [
            "edit-section",
            "edit-selection",
            "improve-bullets",
            "resume-summary",
            "tailor-to-job",
        ] {
            let document = embedded_text(embedded_skill(name), "SKILL.md");
            assert!(
                document.contains("Preserve"),
                "{name} lacks preservation rules"
            );
            assert!(document.contains("Never"), "{name} lacks factuality rules");
            assert!(
                document.contains("rich-text") || document.contains("rich text"),
                "{name} lacks rich-text preservation rules"
            );
        }
    }

    #[test]
    fn pristine_legacy_bazinga_is_removed() {
        let directory = tempdir().unwrap();
        let legacy = directory.path().join(LEGACY_BAZINGA_NAME);
        fs::create_dir_all(&legacy).unwrap();
        fs::write(legacy.join("SKILL.md"), LEGACY_BAZINGA_SOURCE).unwrap();

        install_bundled_skills_at(directory.path()).unwrap();
        assert!(!legacy.exists());
    }

    #[test]
    fn modified_or_expanded_legacy_bazinga_is_preserved() {
        for expanded in [false, true] {
            let directory = tempdir().unwrap();
            let legacy = directory.path().join(LEGACY_BAZINGA_NAME);
            fs::create_dir_all(&legacy).unwrap();
            let contents = if expanded {
                LEGACY_BAZINGA_SOURCE
            } else {
                "user-edited\n"
            };
            fs::write(legacy.join("SKILL.md"), contents).unwrap();
            if expanded {
                fs::write(legacy.join("notes.md"), "user file\n").unwrap();
            }

            install_bundled_skills_at(directory.path()).unwrap();
            assert!(legacy.exists());
        }
    }

    #[test]
    fn mentions_deduplicate_and_transform_only_complete_mentions() {
        let prompt = "#work #(sample-skill) then #(sample-skill) and #other";
        let mentions = parse_skill_mentions(prompt).unwrap();
        assert_eq!(mentions.len(), 2);
        assert_eq!(unique_skill_names(&mentions), vec!["sample-skill"]);
        assert_eq!(
            transform_skill_mentions(prompt, &mentions),
            "#work $sample-skill then $sample-skill and #other"
        );
    }

    #[test]
    fn mentions_support_multiple_skills_and_reject_malformed_names() {
        let prompt = "Use #(alpha) with #(beta-skill).";
        let mentions = parse_skill_mentions(prompt).unwrap();
        assert_eq!(unique_skill_names(&mentions), vec!["alpha", "beta-skill"]);
        assert!(parse_skill_mentions("#(not valid)").is_err());
        assert!(parse_skill_mentions("#(unfinished").is_err());
    }

    #[test]
    fn unknown_mentions_are_rejected_and_claude_cannot_use_codex_skills() {
        let mentions = parse_skill_mentions("#(missing-skill)").unwrap();
        let catalog = AgentSkillCatalog {
            skills: vec![skill("known-skill")],
            errors: Vec::new(),
        };
        assert!(resolve_skill_names(&mentions, &catalog).is_err());
        assert!(validate_provider_skill_mentions("claude-code", 1, 1).is_err());
        assert!(validate_provider_skill_mentions("codex", 1, 1).is_ok());
    }

    #[cfg(windows)]
    #[test]
    fn catalog_rejects_a_symlink_that_escapes_the_skill_root() {
        use std::os::windows::fs::symlink_dir;

        let directory = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let link = directory.path().join("escaped");
        if symlink_dir(outside.path(), &link).is_err() {
            return;
        }
        let catalog = read_skill_catalog(directory.path()).unwrap();
        assert!(catalog.skills.is_empty());
        assert_eq!(catalog.errors.len(), 1);
        assert!(catalog.errors[0].message.contains("escapes"));
    }

    #[cfg(windows)]
    #[test]
    fn bundled_install_rejects_a_packaged_skill_symlink() {
        use std::os::windows::fs::symlink_dir;

        let directory = tempdir().unwrap();
        let packaged = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let linked_skill = packaged.path().join("ats-review");
        if symlink_dir(outside.path(), &linked_skill).is_err() {
            return;
        }

        let error =
            install_bundled_skills_from(directory.path(), Some(packaged.path())).unwrap_err();
        assert!(error.contains("real directory"));
        assert!(!directory.path().join("ats-review").exists());
    }
}
