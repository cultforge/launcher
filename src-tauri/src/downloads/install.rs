use std::path::{Component, Path, PathBuf};

const ALLOWED_DEST: &[&str] = &["mods", "resourcepacks", "shaderpacks", "datapacks"];

/// Top-level dirs that guild reconcile may install into / prune.
pub const MANAGED_TOP_DIRS: &[&str] = &[
    "mods",
    "resourcepacks",
    "shaderpacks",
    "datapacks",
    "config",
];

pub fn sanitize_filename(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Empty filename".into());
    }
    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("Absolute filenames are not allowed".into());
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(os) => {
                let text = os.to_string_lossy();
                if text.contains("..") {
                    return Err("Path traversal is not allowed".into());
                }
                parts.push(text.to_string());
            }
            _ => return Err("Invalid filename path components".into()),
        }
    }
    if parts.len() != 1 {
        return Err("Filename must be a single path segment".into());
    }
    Ok(parts.remove(0))
}

pub fn validate_dest_kind(kind: &str) -> Result<&str, String> {
    ALLOWED_DEST
        .iter()
        .copied()
        .find(|entry| *entry == kind)
        .ok_or_else(|| format!("Unsupported dest kind: {kind}"))
}

pub fn install_path(build_location: &str, dest_kind: &str, filename: &str) -> Result<PathBuf, String> {
    let kind = validate_dest_kind(dest_kind)?;
    let safe_name = sanitize_filename(filename)?;
    let root = PathBuf::from(build_location);
    if root.as_os_str().is_empty() {
        return Err("Build location is empty".into());
    }
    Ok(root.join(kind).join(safe_name))
}

/// Resolve a manifest-relative path under the instance root (e.g. `mods/foo.jar`).
pub fn resolve_manifest_path(build_location: &str, relative: &str) -> Result<PathBuf, String> {
    let root = PathBuf::from(build_location);
    if root.as_os_str().is_empty() {
        return Err("Build location is empty".into());
    }
    let trimmed = relative.trim().replace('\\', "/");
    if trimmed.is_empty() {
        return Err("Empty manifest path".into());
    }
    let path = Path::new(&trimmed);
    if path.is_absolute() {
        return Err("Absolute manifest paths are not allowed".into());
    }
    let mut parts = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(os) => {
                let text = os.to_string_lossy();
                if text == ".." || text.contains("..") {
                    return Err("Path traversal is not allowed".into());
                }
                parts.push(text.to_string());
            }
            _ => return Err("Invalid manifest path components".into()),
        }
    }
    if parts.is_empty() {
        return Err("Empty manifest path".into());
    }
    let top = parts[0].as_str();
    if !MANAGED_TOP_DIRS.contains(&top) {
        return Err(format!("Manifest path must start with a managed folder: {top}"));
    }
    let mut dest = root;
    for part in parts {
        dest = dest.join(part);
    }
    Ok(dest)
}

pub async fn install_cached_file(
    cached: &Path,
    build_location: &str,
    dest_kind: &str,
    filename: &str,
) -> Result<PathBuf, String> {
    let dest = install_path(build_location, dest_kind, filename)?;
    place_file(cached, &dest).await
}

pub async fn install_cached_at_relative(
    cached: &Path,
    build_location: &str,
    relative: &str,
) -> Result<PathBuf, String> {
    let dest = resolve_manifest_path(build_location, relative)?;
    place_file(cached, &dest).await
}

async fn place_file(cached: &Path, dest: &Path) -> Result<PathBuf, String> {
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create install directory: {e}"))?;
    }
    if dest.exists() {
        tokio::fs::remove_file(dest)
            .await
            .map_err(|e| format!("Failed to replace existing file: {e}"))?;
    }
    match tokio::fs::hard_link(cached, dest).await {
        Ok(()) => Ok(dest.to_path_buf()),
        Err(_) => {
            tokio::fs::copy(cached, dest)
                .await
                .map_err(|e| format!("Failed to copy into build: {e}"))?;
            Ok(dest.to_path_buf())
        }
    }
}
