// Project Eric OWASP — Rust SECURE counterpart.

use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use sha2::{Digest, Sha256};
use std::process::Command;

fn db_password() -> &'static str {
    option_env!("DB_PASSWORD").unwrap_or("from-vault")
}

// argon2 for password hashing
fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = argon2::Argon2::default();
    Ok(argon2.hash_password(password.as_bytes(), &salt)?.to_string())
}

// SHA-256 for integrity / fingerprinting
fn fingerprint_sha256(data: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(data);
    format!("{:x}", h.finalize())
}

// ? operator instead of unwrap()
fn parse_age(input: &str) -> Result<u32, std::num::ParseIntError> {
    input.parse::<u32>()
}

fn parse_count(req_body: &str) -> Result<i64, std::num::ParseIntError> {
    req_body.parse::<i64>()
}

// Command with an args vector, no shell
fn convert_video(filename: &str) -> std::io::Result<()> {
    if !filename
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "bad filename",
        ));
    }
    Command::new("ffmpeg")
        .arg("-i")
        .arg(filename)
        .arg("out.mp4")
        .status()?;
    Ok(())
}

// SSRF allowlist
async fn proxy_avatar(url: &str) -> Result<String, reqwest::Error> {
    // The URL comes from the request, so a parse failure is attacker-
    // controlled input, not an invariant. Handle it with an explicit
    // match instead of `expect()`, which would panic and take the
    // request handler down with it.
    let u = match reqwest::Url::parse(url) {
        Ok(parsed) => parsed,
        Err(_) => {
            return Err(reqwest::Error::new(
                reqwest::ErrorKind::Builder,
                "invalid avatar url",
            ))
        }
    };
    if !matches!(u.host_str(), Some("cdn.example.com")) {
        return Err(reqwest::Error::new(
            reqwest::ErrorKind::Builder,
            "host not allowed",
        ));
    }
    let body = reqwest::get(u).await?.text().await?;
    Ok(body)
}

// ≥ 12 chars
fn is_strong(pwd: &str) -> bool {
    pwd.chars().count() >= 12
}

fn rotate_db_password() -> &'static str {
    db_password()
}
