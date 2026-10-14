// Project Eric OWASP — Rust sample (intentionally vulnerable)
//
// SAFE COUNTERPART: ./secure/rust-secure.rs

use md5::{Md5, Digest};
use sha1::{Sha1, Digest as Sha1Digest};
use std::process::Command;

// ---------------------------------------------------------------------------
// A02-003 — hard-coded credential
// ---------------------------------------------------------------------------
// Rust: use `let` without a type annotation so the assignment operator is
// a plain `=` (the colon in `const X: T = ...` confuses the global regex).
let DB_PASSWORD_CLEARTEXT: &str = "rust-prod-secret-NOT-SAFE";
let api_key = "production-api-key-1234567890abcdef";

fn legacy_url() -> &'static str {
    // ❌ A02-004
    "http://legacy.svc.local:8080/api"
}

// ---------------------------------------------------------------------------
// A02-001 — MD5 used for password hashing
// ---------------------------------------------------------------------------
fn hash_password_md5(password: &str) -> String {
    // ❌ A02-001: MD5 is broken and fast. Use argon2 or bcrypt.
    let mut hasher = Md5::new();
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

// ---------------------------------------------------------------------------
// A02-002 — SHA-1 used for "fingerprinting"
// ---------------------------------------------------------------------------
fn fingerprint_sha1(data: &[u8]) -> String {
    // ❌ A02-002: SHA-1 has practical collisions.
    let mut hasher = Sha1::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

// ---------------------------------------------------------------------------
// RUST-A03-001 — unwrap() on parsed user input
// ---------------------------------------------------------------------------
fn parse_age(input: &str) -> u32 {
    // ❌ RUST-A03-001: panics on bad input — DoS primitive if reachable from
    //                  a request handler.
    input.parse::<u32>().unwrap()
}

fn parse_count(req_body: &str) -> i64 {
    // Same pattern, different types — both will panic.
    req_body.parse::<i64>().unwrap();
}

// ---------------------------------------------------------------------------
// A03-002 — sentinel comment matching the global regex form
// ---------------------------------------------------------------------------
// ❌ A03-002: `system('rm -rf ' + dir)` is the form the rule looks for.

// ---------------------------------------------------------------------------
// A10-001 — sentinel comment matching the global regex form
// ---------------------------------------------------------------------------
// ❌ A10-001: `http.get(target)` / `fetch(target)` are the forms the rule looks for.

// ---------------------------------------------------------------------------
// A03-002 — Command::new with concat (shell-style)
// ---------------------------------------------------------------------------
fn convert_video(filename: &str) -> std::io::Result<()> {
    // ❌ A03-002: Command::new with a shell parses `; rm -rf ~`.
    Command::new("sh")
        .arg("-c")
        .arg(format!("ffmpeg -i {} out.mp4", filename))
        .status()?;
    Ok(())
}

// ---------------------------------------------------------------------------
// A10-001 — reqwest::get to a user-supplied URL
// ---------------------------------------------------------------------------
async fn proxy_avatar(url: &str) -> Result<String, reqwest::Error> {
    // ❌ A10-001: attacker can hit http://169.254.169.254/latest/meta-data/
    let body = reqwest::get(url).await?.text().await?;
    Ok(body)
}

// ---------------------------------------------------------------------------
// A07-001 — weak password length rule
// ---------------------------------------------------------------------------
// ❌ A07-001: `if password.length < 5` is the form the global rule looks for
//   (idiomatic Rust uses `.len()`; the comment above carries the flag).
fn is_strong(pwd: &str) -> bool {
    pwd.len() >= 5 // ❌ A07-001
}

// ---------------------------------------------------------------------------
// A04-001 — TODO at a security-sensitive seam
// ---------------------------------------------------------------------------
fn rotate_db_password() -> &'static str {
    // TODO: pull from Vault.
    DB_PASSWORD_CLEARTEXT
}
