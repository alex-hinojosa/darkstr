//! Print a `darkstr.persona.snapshot`-shaped JSON for Mini XOR / about:config.
//! Usage: cargo run -p duppel-persona --example print_persona_snapshot -- 42 macos
//! No Gecko FFI — control-plane only.

use duppel_persona::{generate_persona, Engine, HostOs, PersonaSeed};
use std::env;

fn main() {
    let mut args = env::args().skip(1);
    let seed: u32 = args
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(42);
    let os = match args.next().as_deref().unwrap_or("macos") {
        "linux" => HostOs::Linux,
        "windows" | "win" => HostOs::Windows,
        _ => HostOs::Macos,
    };
    let p = generate_persona(PersonaSeed::new(seed), Engine::Firefox, os)
        .expect("firefox persona");
    // Minimal chrome _readSnapshot shape (+ timezone for Proof probes).
    print!(
        "{{\"userAgent\":{},\"platform\":{},\"hardwareConcurrency\":{},\"deviceMemory\":{},\"languages\":{},\"timezone\":{}}}",
        serde_json_str(p.user_agent),
        serde_json_str(p.platform),
        p.hardware_concurrency,
        p.device_memory,
        serde_json_str_arr(p.languages),
        serde_json_str(p.timezone),
    );
}

fn serde_json_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn serde_json_str_arr(items: &[&str]) -> String {
    let inner: Vec<String> = items.iter().map(|s| serde_json_str(s)).collect();
    format!("[{}]", inner.join(","))
}
