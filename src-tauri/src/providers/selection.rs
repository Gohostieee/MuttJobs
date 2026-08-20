use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

pub const STALE_SELECTION_ERROR: &str =
    "The selected resume text changed. Select it again and retry.";
const MAX_SELECTION_CODE_POINTS: usize = 4_000;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeTextSelection {
    pub field_path: Vec<ResumePathSegment>,
    pub section_key: String,
    pub item_id: Option<String>,
    pub selected_text: String,
    pub start_offset: usize,
    pub end_offset: usize,
    pub field_content_hash: String,
    pub html_fragment: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum ResumePathSegment {
    Key(String),
    Index(usize),
}

#[derive(Debug, Clone)]
pub struct ValidatedSelection {
    pub field_path: Vec<ResumePathSegment>,
    pub start_offset: usize,
    pub end_offset: usize,
    pub prefix: String,
    pub suffix: String,
}

pub fn validate_selection(
    resume: &Value,
    selection: &ResumeTextSelection,
) -> Result<ValidatedSelection, String> {
    if selection.section_key.trim().is_empty()
        || selection.start_offset >= selection.end_offset
        || selection.end_offset - selection.start_offset > MAX_SELECTION_CODE_POINTS
        || selection.field_content_hash.len() != 64
        || selection.field_content_hash != selection.field_content_hash.to_ascii_lowercase()
        || !selection
            .field_content_hash
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(STALE_SELECTION_ERROR.into());
    }

    let (field, item) = resolve_supported_field(resume, selection)?;
    let field_html = field
        .as_str()
        .ok_or_else(|| "The selected resume field is not rich text.".to_string())?;
    let sanitized_html = sanitize_rich_text_html(field_html);
    let current_hash = sha256_hex(&sanitized_html);
    if !current_hash.eq_ignore_ascii_case(&selection.field_content_hash) {
        return Err(STALE_SELECTION_ERROR.into());
    }

    if let Some(fragment) = &selection.html_fragment {
        if sanitize_rich_text_html(fragment) != *fragment {
            return Err(
                "The selected resume markup is no longer safe. Select the passage again and retry."
                    .into(),
            );
        }
    }

    if let Some(item) = item {
        let current_id = item.get("id").and_then(Value::as_str);
        if selection.item_id.as_deref() != current_id {
            return Err("The selected resume item changed. Select it again and retry.".into());
        }
    } else if selection.item_id.is_some() {
        return Err(
            "The selected resume item is no longer available. Select it again and retry.".into(),
        );
    }

    let plain_text = rendered_plain_text(&sanitized_html);
    let plain_length = plain_text.chars().count();
    if selection.end_offset > plain_length {
        return Err(STALE_SELECTION_ERROR.into());
    }
    let selected_text = code_point_slice(&plain_text, selection.start_offset, selection.end_offset);
    if selected_text != selection.selected_text
        || selected_text.chars().count() > MAX_SELECTION_CODE_POINTS
    {
        return Err(STALE_SELECTION_ERROR.into());
    }

    Ok(ValidatedSelection {
        field_path: selection.field_path.clone(),
        start_offset: selection.start_offset,
        end_offset: selection.end_offset,
        prefix: code_point_slice(&plain_text, 0, selection.start_offset),
        suffix: code_point_slice(&plain_text, selection.end_offset, plain_length),
    })
}

pub fn validate_scoped_result(
    before: &Value,
    after: &Value,
    selection: &ValidatedSelection,
    action: Option<&str>,
) -> Result<(), String> {
    if action == Some("quantify-impact") {
        if before != after {
            return Err("Quantify impact is read-only and did not change the resume.".into());
        }
        return Ok(());
    }

    let Some(after_field) = value_at_path(after, &selection.field_path) else {
        return Err(
            "The agent returned an out-of-range selection edit; the previous version was restored."
                .into(),
        );
    };
    let Some(after_html) = after_field.as_str() else {
        return Err(
            "The selected resume field must remain rich text; the previous version was restored."
                .into(),
        );
    };
    let sanitized_after = sanitize_rich_text_html(after_html);
    if sanitized_after != after_html {
        return Err("The selected resume markup was not safely sanitized; the previous version was restored.".into());
    }

    let after_plain = rendered_plain_text(after_html);
    if !after_plain.starts_with(&selection.prefix) || !after_plain.ends_with(&selection.suffix) {
        return Err(
            "The agent returned an out-of-range selection edit; the previous version was restored."
                .into(),
        );
    }

    let before_html = value_at_path(before, &selection.field_path)
        .and_then(Value::as_str)
        .map(sanitize_rich_text_html)
        .ok_or_else(|| {
            "The selected resume field is no longer rich text; the previous version was restored."
                .to_string()
        })?;
    let after_start = selection.prefix.chars().count();
    let after_end = after_plain
        .chars()
        .count()
        .checked_sub(selection.suffix.chars().count())
        .ok_or_else(|| {
            "The agent returned an out-of-range selection edit; the previous version was restored."
                .to_string()
        })?;
    if structure_signature(&before_html, selection.start_offset, selection.end_offset)
        != structure_signature(after_html, after_start, after_end)
    {
        return Err(
            "The agent changed the surrounding resume markup; the previous version was restored."
                .into(),
        );
    }

    if without_path(before, &selection.field_path) != without_path(after, &selection.field_path) {
        return Err("The agent changed content outside the selected resume text; the previous version was restored.".into());
    }

    Ok(())
}

fn resolve_supported_field<'a>(
    resume: &'a Value,
    selection: &ResumeTextSelection,
) -> Result<(&'a Value, Option<&'a Value>), String> {
    let path = &selection.field_path;
    if path.len() == 2 && key_at(path, 0) == Some("summary") && key_at(path, 1) == Some("content") {
        if selection.section_key != "summary" || selection.item_id.is_some() {
            return Err("The selected resume field context is invalid.".into());
        }
        return resume
            .get("summary")
            .and_then(|value| value.get("content"))
            .map(|value| (value, None))
            .ok_or_else(|| STALE_SELECTION_ERROR.into());
    }

    if path.len() == 5
        && key_at(path, 0) == Some("sections")
        && key_at(path, 2) == Some("items")
        && matches!(key_at(path, 4), Some("description" | "content"))
    {
        let section_key = key_at(path, 1).ok_or("The selected section path is invalid.")?;
        let item_index = index_at(path, 3).ok_or("The selected item path is invalid.")?;
        let section = resume
            .get("sections")
            .and_then(|value| value.get(section_key))
            .ok_or_else(|| "The selected resume section is no longer available.".to_string())?;
        let items = section
            .get("items")
            .and_then(Value::as_array)
            .ok_or_else(|| "The selected resume section has no items.".to_string())?;
        let item = items
            .get(item_index)
            .ok_or_else(|| "The selected resume item is no longer available.".to_string())?;
        validate_item_field(
            section_key,
            section_type(section),
            item,
            key_at(path, 4).unwrap(),
        )?;
        if selection.section_key != section_key {
            return Err("The selected resume section changed. Select it again and retry.".into());
        }
        let field = item
            .get(key_at(path, 4).unwrap())
            .ok_or_else(|| STALE_SELECTION_ERROR.to_string())?;
        return Ok((field, Some(item)));
    }

    if path.len() == 7
        && key_at(path, 0) == Some("sections")
        && key_at(path, 2) == Some("items")
        && key_at(path, 4) == Some("roles")
        && key_at(path, 6) == Some("description")
    {
        let section_key = key_at(path, 1).ok_or("The selected section path is invalid.")?;
        if section_key != "experience" || selection.section_key != section_key {
            return Err("The selected resume section changed. Select it again and retry.".into());
        }
        let item_index = index_at(path, 3).ok_or("The selected item path is invalid.")?;
        let role_index = index_at(path, 5).ok_or("The selected role path is invalid.")?;
        let item = resume
            .get("sections")
            .and_then(|value| value.get(section_key))
            .and_then(|value| value.get("items"))
            .and_then(Value::as_array)
            .and_then(|items| items.get(item_index))
            .ok_or_else(|| "The selected resume item is no longer available.".to_string())?;
        let role = item
            .get("roles")
            .and_then(Value::as_array)
            .and_then(|roles| roles.get(role_index))
            .ok_or_else(|| "The selected role is no longer available.".to_string())?;
        if role.get("description").and_then(Value::as_str).is_none() {
            return Err("The selected role field is not rich text.".into());
        }
        return Ok((role.get("description").unwrap(), Some(role)));
    }

    if path.len() == 5
        && key_at(path, 0) == Some("customSections")
        && key_at(path, 2) == Some("items")
        && matches!(key_at(path, 4), Some("description" | "content"))
    {
        let custom_index = index_at(path, 1).ok_or("The custom section path is invalid.")?;
        let item_index = index_at(path, 3).ok_or("The selected item path is invalid.")?;
        let section = resume
            .get("customSections")
            .and_then(Value::as_array)
            .and_then(|sections| sections.get(custom_index))
            .ok_or_else(|| "The selected custom section is no longer available.".to_string())?;
        let section_type = section_type(section);
        if selection.section_key
            != section
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or_else(|| "")
        {
            return Err("The selected custom section changed. Select it again and retry.".into());
        }
        let item = section
            .get("items")
            .and_then(Value::as_array)
            .and_then(|items| items.get(item_index))
            .ok_or_else(|| "The selected resume item is no longer available.".to_string())?;
        let field_name = key_at(path, 4).unwrap();
        validate_item_field(&section_type, section_type, item, field_name)?;
        let field = item
            .get(field_name)
            .ok_or_else(|| STALE_SELECTION_ERROR.to_string())?;
        return Ok((field, Some(item)));
    }

    Err("The selected path is not an editable rich-text resume field.".into())
}

fn validate_item_field(
    section_key: &str,
    kind: &str,
    item: &Value,
    field_name: &str,
) -> Result<(), String> {
    let eligible_description = matches!(
        section_key,
        "experience"
            | "projects"
            | "education"
            | "awards"
            | "certifications"
            | "publications"
            | "volunteer"
            | "references"
    ) || matches!(
        kind,
        "experience"
            | "projects"
            | "education"
            | "awards"
            | "certifications"
            | "publications"
            | "volunteer"
            | "references"
    );
    let eligible_content = matches!(kind, "summary" | "cover-letter") || section_key == "summary";
    let valid = (field_name == "description" && eligible_description)
        || (field_name == "content" && eligible_content);
    if !valid || item.get(field_name).and_then(Value::as_str).is_none() {
        return Err("The selected path is not an editable rich-text resume field.".into());
    }
    Ok(())
}

fn section_type(section: &Value) -> &str {
    section.get("type").and_then(Value::as_str).unwrap_or("")
}

fn value_at_path<'a>(value: &'a Value, path: &[ResumePathSegment]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = match segment {
            ResumePathSegment::Key(key) => current.get(key)?,
            ResumePathSegment::Index(index) => current.get(*index)?,
        };
    }
    Some(current)
}

fn without_path(value: &Value, path: &[ResumePathSegment]) -> Option<Value> {
    if path.is_empty() {
        return Some(Value::Null);
    }
    match (&path[0], value) {
        (ResumePathSegment::Key(key), Value::Object(object)) => {
            let mut next = object.clone();
            if path.len() == 1 {
                next.insert(key.clone(), Value::Null);
            } else {
                let child = next.get(key)?.clone();
                next.insert(key.clone(), without_path(&child, &path[1..])?);
            }
            Some(Value::Object(next))
        }
        (ResumePathSegment::Index(index), Value::Array(array)) => {
            let mut next = array.clone();
            if *index >= next.len() {
                return None;
            }
            if path.len() == 1 {
                next[*index] = Value::Null;
            } else {
                next[*index] = without_path(&next[*index], &path[1..])?;
            }
            Some(Value::Array(next))
        }
        _ => None,
    }
}

fn structure_signature(value: &str, start: usize, end: usize) -> Vec<String> {
    const BLOCK_TAGS: [&str; 6] = ["p", "div", "blockquote", "ul", "ol", "li"];
    let mut signature = Vec::new();
    let mut rendered = String::new();
    let mut cursor = 0;

    while cursor < value.len() {
        if value.as_bytes()[cursor] != b'<' {
            let text_end = value[cursor..]
                .find('<')
                .map(|offset| cursor + offset)
                .unwrap_or(value.len());
            append_decoded_text(&mut rendered, &value[cursor..text_end]);
            cursor = text_end;
            continue;
        }

        let Some(tag_end) = find_tag_end(value, cursor) else {
            break;
        };
        let token = &value[cursor + 1..tag_end];
        let trimmed = token.trim();
        let closing = trimmed.starts_with('/');
        let tag = html_tag_name(token);
        if tag.is_empty() {
            cursor = tag_end + 1;
            continue;
        }

        if !closing && BLOCK_TAGS.contains(&tag.as_str()) {
            append_boundary(&mut rendered);
        }
        if tag == "br" {
            append_boundary(&mut rendered);
        }

        let offset = rendered.chars().count();
        if offset < start || offset > end {
            signature.push(value[cursor..tag_end + 1].to_string());
        }

        if closing && BLOCK_TAGS.contains(&tag.as_str()) {
            append_boundary(&mut rendered);
        }
        cursor = tag_end + 1;
    }

    signature
}

fn key_at(path: &[ResumePathSegment], index: usize) -> Option<&str> {
    match path.get(index)? {
        ResumePathSegment::Key(value) => Some(value.as_str()),
        ResumePathSegment::Index(_) => None,
    }
}

fn index_at(path: &[ResumePathSegment], index: usize) -> Option<usize> {
    match path.get(index)? {
        ResumePathSegment::Index(value) => Some(*value),
        ResumePathSegment::Key(_) => None,
    }
}

pub fn sanitize_rich_text_html(value: &str) -> String {
    const ALLOWED: [&str; 13] = [
        "p",
        "br",
        "div",
        "blockquote",
        "ul",
        "ol",
        "li",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "a",
    ];
    let mut output = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('<') {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('>') else {
            output.push_str(after_start);
            rest = "";
            break;
        };
        let raw_tag = &after_start[..end];
        let trimmed = raw_tag.trim();
        let closing = trimmed.starts_with('/');
        let content = trimmed.trim_start_matches('/').trim();
        let name = content
            .split(|character: char| character.is_whitespace() || character == '/')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        if ALLOWED.contains(&name.as_str()) {
            if closing {
                output.push_str("</");
                output.push_str(&name);
                output.push('>');
            } else if name == "a" {
                output.push_str("<a");
                if let Some(href) = extract_href(content) {
                    output.push_str(" href=\"");
                    output.push_str(&escape_attribute(&href));
                    output.push_str("\"");
                }
                output.push('>');
            } else {
                output.push('<');
                output.push_str(&name);
                output.push('>');
            }
        }
        rest = &after_start[end + 1..];
    }
    if !rest.is_empty() {
        output.push_str(rest);
    }
    convert_legacy_list_paragraphs(&output)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum LegacyListType {
    Unordered,
    Ordered,
}

struct TopLevelHtmlNode {
    raw: String,
    tag: Option<String>,
}

fn convert_legacy_list_paragraphs(value: &str) -> String {
    let nodes = split_top_level_html_nodes(value);
    let mut output = String::with_capacity(value.len());
    let mut list_type = None;

    let flush_list = |output: &mut String, list_type: &mut Option<LegacyListType>| {
        if let Some(current) = list_type.take() {
            output.push_str(match current {
                LegacyListType::Unordered => "</ul>",
                LegacyListType::Ordered => "</ol>",
            });
        }
    };

    for node in nodes {
        let plain_text = rendered_plain_text(&node.raw);
        if let Some(tag) = node.tag.as_deref() {
            if matches!(tag, "p" | "div") {
                if let Some((next_type, marker_length)) = legacy_list_marker(&plain_text) {
                    if list_type != Some(next_type) {
                        flush_list(&mut output, &mut list_type);
                        output.push_str(match next_type {
                            LegacyListType::Unordered => "<ul>",
                            LegacyListType::Ordered => "<ol>",
                        });
                        list_type = Some(next_type);
                    }

                    if let Some(inner) = element_inner_html(&node.raw) {
                        output.push_str("<li>");
                        output.push_str(&remove_text_prefix(inner, marker_length));
                        output.push_str("</li>");
                    }
                    continue;
                }

                if list_type.is_some() && plain_text.trim().is_empty() {
                    continue;
                }
            }
        } else if list_type.is_some() && plain_text.trim().is_empty() {
            continue;
        }

        flush_list(&mut output, &mut list_type);
        output.push_str(&node.raw);
    }

    flush_list(&mut output, &mut list_type);
    output
}

fn split_top_level_html_nodes(value: &str) -> Vec<TopLevelHtmlNode> {
    let mut nodes = Vec::new();
    let mut cursor = 0;

    while cursor < value.len() {
        if value.as_bytes()[cursor] != b'<' {
            let end = value[cursor..]
                .find('<')
                .map(|offset| cursor + offset)
                .unwrap_or(value.len());
            nodes.push(TopLevelHtmlNode {
                raw: value[cursor..end].to_string(),
                tag: None,
            });
            cursor = end;
            continue;
        }

        let Some(open_end) = find_tag_end(value, cursor) else {
            nodes.push(TopLevelHtmlNode {
                raw: value[cursor..].to_string(),
                tag: None,
            });
            break;
        };
        let token = &value[cursor + 1..open_end];
        let closing = token.trim_start().starts_with('/');
        let tag = html_tag_name(token);
        if closing || tag.is_empty() || tag == "br" {
            nodes.push(TopLevelHtmlNode {
                raw: value[cursor..open_end + 1].to_string(),
                tag: if closing { None } else { Some(tag) },
            });
            cursor = open_end + 1;
            continue;
        }

        let end = find_element_end(value, cursor, open_end + 1, &tag).unwrap_or(value.len());
        nodes.push(TopLevelHtmlNode {
            raw: value[cursor..end].to_string(),
            tag: Some(tag),
        });
        cursor = end;
    }

    nodes
}

fn find_tag_end(value: &str, start: usize) -> Option<usize> {
    let mut quote = None;
    for (offset, character) in value[start..].char_indices() {
        match (quote, character) {
            (Some(current), next) if current == next => quote = None,
            (None, '\'' | '"') => quote = Some(character),
            (None, '>') => return Some(start + offset),
            _ => {}
        }
    }
    None
}

fn find_element_end(value: &str, _start: usize, mut cursor: usize, tag: &str) -> Option<usize> {
    let mut depth = 1usize;
    while cursor < value.len() {
        let next_start = value[cursor..].find('<')? + cursor;
        let end = find_tag_end(value, next_start)?;
        let token = &value[next_start + 1..end];
        let trimmed = token.trim();
        let closing = trimmed.starts_with('/');
        let self_closing = trimmed.ends_with('/');
        if html_tag_name(token) == tag {
            if closing {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some(end + 1);
                }
            } else if !self_closing {
                depth += 1;
            }
        }
        cursor = end + 1;
    }
    None
}

fn html_tag_name(token: &str) -> String {
    token
        .trim()
        .trim_start_matches('/')
        .trim()
        .split(|character: char| character.is_whitespace() || character == '/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn element_inner_html(value: &str) -> Option<&str> {
    let open_end = find_tag_end(value, 0)?;
    let close_start = value.rfind("</")?;
    (close_start > open_end).then(|| &value[open_end + 1..close_start])
}

fn legacy_list_marker(value: &str) -> Option<(LegacyListType, usize)> {
    let characters: Vec<char> = value.chars().collect();
    let mut index = 0;
    while characters
        .get(index)
        .is_some_and(|character| character.is_whitespace())
    {
        index += 1;
    }

    let list_type = match characters.get(index)? {
        '•' | '*' | '+' | '-' => LegacyListType::Unordered,
        character if character.is_ascii_digit() => {
            while characters
                .get(index)
                .is_some_and(|character| character.is_ascii_digit())
            {
                index += 1;
            }
            if !matches!(characters.get(index), Some('.' | ')')) {
                return None;
            }
            index += 1;
            LegacyListType::Ordered
        }
        _ => return None,
    };

    if matches!(characters.get(index), Some('•' | '*' | '+' | '-')) {
        index += 1;
    }
    let marker_end = index;
    while characters
        .get(index)
        .is_some_and(|character| *character == ' ' || *character == '\t')
    {
        index += 1;
    }
    (index > marker_end).then_some((list_type, index))
}

fn remove_text_prefix(value: &str, mut remaining: usize) -> String {
    let mut output = String::with_capacity(value.len());
    let mut cursor = 0;

    while cursor < value.len() && remaining > 0 {
        if value.as_bytes()[cursor] == b'<' {
            let Some(end) = find_tag_end(value, cursor) else {
                break;
            };
            output.push_str(&value[cursor..end + 1]);
            cursor = end + 1;
            continue;
        }

        let end = value[cursor..]
            .find('<')
            .map(|offset| cursor + offset)
            .unwrap_or(value.len());
        let text = &value[cursor..end];
        let mut text_cursor = 0;
        while text_cursor < text.len() && remaining > 0 {
            if text.as_bytes()[text_cursor] == b'&' {
                if let Some(entity_end) = text[text_cursor..]
                    .find(';')
                    .map(|offset| text_cursor + offset)
                {
                    let entity = &text[text_cursor + 1..entity_end];
                    if decode_entity(entity).is_some() {
                        remaining -= 1;
                        text_cursor = entity_end + 1;
                        continue;
                    }
                }
            }
            let character = text[text_cursor..].chars().next().unwrap_or_default();
            text_cursor += character.len_utf8();
            remaining -= 1;
        }
        output.push_str(&text[text_cursor..]);
        cursor = end;
    }

    output.push_str(&value[cursor..]);
    output
}

pub fn rendered_plain_text(html: &str) -> String {
    let mut output = String::new();
    let mut rest = html;
    while let Some(start) = rest.find('<') {
        append_decoded_text(&mut output, &rest[..start]);
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('>') else {
            append_decoded_text(&mut output, after_start);
            break;
        };
        let raw_tag = after_start[..end].trim();
        let closing = raw_tag.starts_with('/');
        let name = raw_tag
            .trim_start_matches('/')
            .trim()
            .split(|character: char| character.is_whitespace() || character == '/')
            .next()
            .unwrap_or("")
            .to_ascii_uppercase();
        if name == "BR"
            || (closing
                && matches!(
                    name.as_str(),
                    "P" | "DIV" | "BLOCKQUOTE" | "UL" | "OL" | "LI"
                ))
        {
            append_boundary(&mut output);
        }
        rest = &after_start[end + 1..];
    }
    if !rest.is_empty() {
        append_decoded_text(&mut output, rest);
    }
    while output.ends_with('\n') {
        output.pop();
    }
    output
}

fn append_boundary(output: &mut String) {
    if !output.is_empty() && !output.ends_with('\n') {
        output.push('\n');
    }
}

fn append_decoded_text(output: &mut String, text: &str) {
    let mut rest = text;
    while let Some(start) = rest.find('&') {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find(';') else {
            output.push('&');
            output.push_str(after_start);
            return;
        };
        let entity = &after_start[..end];
        if let Some(decoded) = decode_entity(entity) {
            output.push(decoded);
        } else {
            output.push('&');
            output.push_str(entity);
            output.push(';');
        }
        rest = &after_start[end + 1..];
    }
    output.push_str(rest);
}

fn decode_entity(entity: &str) -> Option<char> {
    match entity {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" | "#39" => Some('\''),
        value if value.starts_with("#x") => u32::from_str_radix(&value[2..], 16)
            .ok()
            .and_then(char::from_u32),
        value if value.starts_with('#') => value[1..].parse::<u32>().ok().and_then(char::from_u32),
        _ => None,
    }
}

fn extract_href(tag: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let start = lower.find("href")?;
    let equals = lower[start + 4..].find('=')? + start + 4;
    let value_start = equals + 1 + tag[equals + 1..].len() - tag[equals + 1..].trim_start().len();
    let remainder = &tag[value_start..];
    let quote = remainder.chars().next()?;
    let value = if quote == '\'' || quote == '"' {
        let quote_width = quote.len_utf8();
        let end = remainder[quote_width..].find(quote)? + quote_width;
        &remainder[quote_width..end]
    } else {
        remainder.split_whitespace().next().unwrap_or("")
    };
    let trimmed = value.trim();
    let lower_trimmed = trimmed.to_ascii_lowercase();
    let allowed = lower_trimmed.starts_with("https:")
        || lower_trimmed.starts_with("http:")
        || lower_trimmed.starts_with("mailto:")
        || lower_trimmed.starts_with("tel:")
        || trimmed.starts_with('#')
        || trimmed.starts_with('/');
    allowed.then(|| trimmed.to_string())
}

fn escape_attribute(value: &str) -> String {
    value.replace('&', "&amp;").replace('"', "&quot;")
}

fn code_point_slice(value: &str, start: usize, end: usize) -> String {
    value
        .chars()
        .skip(start)
        .take(end.saturating_sub(start))
        .collect()
}

fn sha256_hex(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn renders_paragraph_and_list_boundaries() {
        assert_eq!(
            rendered_plain_text(
                "<p>Build <strong>tools</strong></p><ul><li>fast</li><li>safe</li></ul>"
            ),
            "Build tools\nfast\nsafe"
        );
    }

    #[test]
    fn normalizes_legacy_bullet_paragraphs_like_the_editor() {
        assert_eq!(
            sanitize_rich_text_html(
                "<p>Intro</p><p>* First</p><p></p><p>* <strong>Second</strong></p><p>Outro</p>"
            ),
            "<p>Intro</p><ul><li>First</li><li><strong>Second</strong></li></ul><p>Outro</p>"
        );
    }

    #[test]
    fn rejects_protected_and_stale_paths() {
        let resume = json!({
            "summary": { "content": "<p>Hello 🌎</p>" },
            "sections": { "experience": { "items": [{ "id": "exp-1", "description": "<p>Ship it</p>" }] } }
        });
        let selection = ResumeTextSelection {
            field_path: vec![
                ResumePathSegment::Key("sections".into()),
                ResumePathSegment::Key("experience".into()),
                ResumePathSegment::Key("items".into()),
                ResumePathSegment::Index(0),
                ResumePathSegment::Key("description".into()),
            ],
            section_key: "experience".into(),
            item_id: Some("exp-1".into()),
            selected_text: "Ship".into(),
            start_offset: 0,
            end_offset: 4,
            field_content_hash: "0".repeat(64),
            html_fragment: None,
        };
        assert_eq!(
            validate_selection(&resume, &selection).unwrap_err(),
            STALE_SELECTION_ERROR
        );
    }

    #[test]
    fn scoped_result_keeps_markup_outside_the_selected_range() {
        let before = json!({
            "summary": { "content": "<p>Prefix <strong>old</strong> suffix</p>" },
            "basics": {},
            "sections": {},
            "metadata": {}
        });
        let html = before["summary"]["content"].as_str().unwrap();
        let plain = rendered_plain_text(html);
        let start = plain.find("old").unwrap();
        let selection = ResumeTextSelection {
            field_path: vec![
                ResumePathSegment::Key("summary".into()),
                ResumePathSegment::Key("content".into()),
            ],
            section_key: "summary".into(),
            item_id: None,
            selected_text: "old".into(),
            start_offset: start,
            end_offset: start + 3,
            field_content_hash: sha256_hex(html),
            html_fragment: None,
        };
        let validated = validate_selection(&before, &selection).unwrap();
        let replacement = json!({
            "summary": { "content": "<p>Prefix <strong>new</strong> suffix</p>" },
            "basics": {},
            "sections": {},
            "metadata": {}
        });
        assert!(validate_scoped_result(&before, &replacement, &validated, Some("improve")).is_ok());

        let changed_markup = json!({
            "summary": { "content": "<div>Prefix <strong>new</strong> suffix</div>" },
            "basics": {},
            "sections": {},
            "metadata": {}
        });
        assert!(
            validate_scoped_result(&before, &changed_markup, &validated, Some("improve")).is_err()
        );
    }

    #[test]
    fn preserves_unicode_code_point_offsets() {
        let text = "A 🌎 B";
        assert_eq!(code_point_slice(text, 2, 3), "🌎");
    }
}
