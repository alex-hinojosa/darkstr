//! `duppel-ffi` — **reviewed** Gecko FFI boundary for darkstr.
//!
//! This is the **only** crate allowed to use `unsafe`. Control-plane crates
//! (`duppel-persona`, `duppel-bridge`, …) stay `#![forbid(unsafe_code)]`.
//!
//! ## Honesty (Proof pin)
//! - Ships a stable C ABI + header sketch for future `moz.build` link-in.
//! - Does **not** claim live Gecko/`mach` linkage, XPCOM, or chrome calling this yet.
//! - Snapshot JSON shape matches `darkstr.persona.snapshot` / `print_persona_snapshot`.
//! - No Cloudflare/TLS/JA3, no RFP metric customization, hooks stay default-off upstream.
//!
//! License: GPL-3.0-only. Brand: darkstr — not official LibreWolf.

use duppel_persona::{generate_persona, Engine, HostOs, PersonaSeed};
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::ptr;

/// Crate API version (control-plane + ABI sketch).
pub const VERSION: &str = "0.1.0-phase2-ffi-boundary";

/// ABI version bump when exported symbols / JSON shape change.
pub const ABI_VERSION: u32 = 1;

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DarkstrHostOs {
    Macos = 0,
    Linux = 1,
    Windows = 2,
}

impl DarkstrHostOs {
    fn to_host(self) -> HostOs {
        match self {
            DarkstrHostOs::Macos => HostOs::Macos,
            DarkstrHostOs::Linux => HostOs::Linux,
            DarkstrHostOs::Windows => HostOs::Windows,
        }
    }

    fn from_cstr(raw: *const c_char) -> Option<Self> {
        if raw.is_null() {
            return Some(DarkstrHostOs::Macos);
        }
        // SAFETY: caller must pass a valid NUL-terminated C string or null.
        let s = unsafe { CStr::from_ptr(raw) }.to_str().ok()?;
        Some(match s {
            "linux" => DarkstrHostOs::Linux,
            "windows" | "win" => DarkstrHostOs::Windows,
            _ => DarkstrHostOs::Macos,
        })
    }
}

fn snapshot_json(seed: u32, os: HostOs) -> Option<CString> {
    let p = generate_persona(PersonaSeed::new(seed), Engine::Firefox, os)?;
    let langs = p
        .languages
        .iter()
        .map(|s| format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect::<Vec<_>>()
        .join(",");
    let json = format!(
        "{{\"userAgent\":\"{}\",\"platform\":\"{}\",\"hardwareConcurrency\":{},\"deviceMemory\":{},\"languages\":[{}],\"timezone\":\"{}\"}}",
        escape(p.user_agent),
        escape(p.platform),
        p.hardware_concurrency,
        p.device_memory,
        langs,
        escape(p.timezone),
    );
    CString::new(json).ok()
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Returns ABI version (`1` for this pin).
#[no_mangle]
pub extern "C" fn darkstr_ffi_abi_version() -> u32 {
    ABI_VERSION
}

/// Allocate a NUL-terminated snapshot JSON string for `seed` + host OS name.
///
/// `os` is `"macos"` | `"linux"` | `"windows"` (null ⇒ macos).
/// Returns null on failure. Caller **must** free with [`darkstr_ffi_string_free`].
#[no_mangle]
pub extern "C" fn darkstr_ffi_persona_snapshot_json(
    seed: u32,
    os: *const c_char,
) -> *mut c_char {
    let Some(host) = DarkstrHostOs::from_cstr(os) else {
        return ptr::null_mut();
    };
    match snapshot_json(seed, host.to_host()) {
        Some(c) => c.into_raw(),
        None => ptr::null_mut(),
    }
}

/// Free a string returned by [`darkstr_ffi_persona_snapshot_json`].
///
/// # Safety
/// `s` must be null or a pointer previously returned by this crate's allocators.
#[no_mangle]
pub unsafe extern "C" fn darkstr_ffi_string_free(s: *mut c_char) {
    if s.is_null() {
        return;
    }
    drop(unsafe { CString::from_raw(s) });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::CString;

    #[test]
    fn abi_version_is_one() {
        assert_eq!(darkstr_ffi_abi_version(), 1);
    }

    #[test]
    fn snapshot_matches_persona_golden_seed_42_macos() {
        let os = CString::new("macos").unwrap();
        let ptr = darkstr_ffi_persona_snapshot_json(42, os.as_ptr());
        assert!(!ptr.is_null());
        let json = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        unsafe { darkstr_ffi_string_free(ptr) };
        assert!(json.contains("Firefox/140.0"));
        assert!(json.contains("MacIntel"));
        assert!(json.contains("\"hardwareConcurrency\":8"));
        // Match fixtures/seed-goldens.json vector seed=42 macos
        assert!(json.contains("Europe/Berlin"));
    }

    #[test]
    fn null_os_defaults_macos() {
        let ptr = darkstr_ffi_persona_snapshot_json(42, ptr::null());
        assert!(!ptr.is_null());
        let json = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        unsafe { darkstr_ffi_string_free(ptr) };
        assert!(json.contains("MacIntel"));
    }
}
