//! darkstr 0055 (Fable N6): personas claim the engine's own Firefox version.
//!
//! The version is read at build time from Gecko's `config/milestone.txt`
//! (found by walking up from this crate; inside the LibreWolf tree the crate
//! lives at `third_party/darkstr/duppel-persona`). `DARKSTR_MILESTONE_TXT` or
//! `$DARKSTR_GECKO_ROOT/config/milestone.txt` can point at it explicitly.
//! Standalone checkouts (CI `cargo test`, no Gecko tree) use
//! `gecko-milestone.txt`, a copy of the pinned train's milestone, and print a
//! cargo warning.
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn milestone_from(path: &Path) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    text.lines()
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .last()
        .map(str::to_owned)
}

fn main() {
    println!("cargo:rerun-if-env-changed=DARKSTR_MILESTONE_TXT");
    println!("cargo:rerun-if-env-changed=DARKSTR_GECKO_ROOT");
    println!("cargo:rerun-if-changed=build.rs");
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let fallback = manifest.join("gecko-milestone.txt");
    let mut candidates: Vec<(PathBuf, &str)> = Vec::new();
    if let Ok(p) = env::var("DARKSTR_MILESTONE_TXT") {
        candidates.push((PathBuf::from(p), "gecko-config"));
    }
    for dir in manifest.ancestors().skip(1) {
        candidates.push((dir.join("config").join("milestone.txt"), "gecko-config"));
    }
    if let Ok(root) = env::var("DARKSTR_GECKO_ROOT") {
        candidates.push((PathBuf::from(root).join("config").join("milestone.txt"), "gecko-config"));
    }
    candidates.push((fallback.clone(), "fallback"));
    let (path, source, milestone) = candidates
        .iter()
        .find_map(|(p, s)| milestone_from(p).map(|m| (p.clone(), *s, m)))
        .expect("darkstr: no config/milestone.txt and no gecko-milestone.txt");
    println!("cargo:rerun-if-changed={}", path.display());
    if source == "fallback" {
        println!(
            "cargo:warning=duppel-persona: no Gecko config/milestone.txt found; using gecko-milestone.txt ({milestone})"
        );
    }
    assert!(
        milestone.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'),
        "unexpected milestone {milestone:?}"
    );
    let major: u32 = milestone
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .expect("milestone major version");
    let rv = format!("{major}.0");
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("engine_version.rs");
    let code = format!(
        "/// Gecko milestone this persona table was built against (config/milestone.txt).\n\
         pub const ENGINE_MILESTONE: &str = \"{milestone}\";\n\
         /// \"gecko-config\" (the engine tree) or \"fallback\" (gecko-milestone.txt).\n\
         pub const ENGINE_MILESTONE_SOURCE: &str = \"{source}\";\n\
         /// Engine major version (Firefox/<major>.0 in every persona UA).\n\
         pub const FIREFOX_MAJOR: u32 = {major};\n\
         /// \"<major>.0\" as it appears in `rv:` and `Firefox/`.\n\
         pub const FIREFOX_RV: &str = \"{rv}\";\n\
         /// Firefox desktop UA for an OS token, at the engine's version.\n\
         macro_rules! firefox_ua {{\n    ($os:literal) => {{\n        concat!(\"Mozilla/5.0 (\", $os, \"; rv:{rv}) Gecko/20100101 Firefox/{rv}\")\n    }};\n}}\n"
    );
    fs::write(out, code).expect("write engine_version.rs");
}
