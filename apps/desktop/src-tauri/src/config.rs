//! Where the shell points, and how it refuses a bad answer.
//!
//! The address is a build/run-time decision, not a hidden default: it comes from
//! `PREPO_DESKTOP_URL`, and the shell's own page probes it before handing the
//! window over to the app (see `ui/offline.js`).

use tauri::Url;

/// Set this to point the shell at a deployment instead of a local dev server.
pub const APP_URL_ENV: &str = "PREPO_DESKTOP_URL";

/// The address used when nothing is configured.
///
/// `scripts/verify.mjs` checks that this origin is allowed by the CSP's
/// `connect-src`, because the shell's own page probes it before navigating.
pub const DEFAULT_APP_URL: &str = "http://localhost:3000";

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    NotAUrl,
    NotHttp,
    WithCredentials,
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::NotAUrl => write!(f, "that is not a URL"),
            ConfigError::NotHttp => {
                write!(f, "the address must start with http:// or https://")
            }
            ConfigError::WithCredentials => write!(
                f,
                "an address with a user name or password in it is refused"
            ),
        }
    }
}

impl std::error::Error for ConfigError {}

/// Turns the configured address into a URL, or says why it will not.
///
/// Only http(s) is accepted. A shell that would follow `file://`, `data:` or
/// `javascript:` out of an environment variable is a shell that anything able to
/// set an environment variable can point anywhere.
pub fn resolve_app_url(configured: Option<&str>) -> Result<Url, ConfigError> {
    let candidate = match configured.map(str::trim) {
        Some(value) if !value.is_empty() => value,
        _ => DEFAULT_APP_URL,
    };

    let url = Url::parse(candidate).map_err(|_| ConfigError::NotAUrl)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(ConfigError::NotHttp);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ConfigError::WithCredentials);
    }

    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn falls_back_to_the_local_default() {
        // `Url` normalises a bare origin to end in `/`; the origin is what matters.
        for configured in [None, Some(""), Some("   ")] {
            assert_eq!(
                resolve_app_url(configured)
                    .unwrap()
                    .origin()
                    .ascii_serialization(),
                "http://localhost:3000"
            );
        }
        assert_eq!(resolve_app_url(None).unwrap().path(), "/");
    }

    #[test]
    fn accepts_http_and_https() {
        assert_eq!(
            resolve_app_url(Some("http://localhost:3000")).unwrap().as_str(),
            "http://localhost:3000/"
        );
        assert_eq!(
            resolve_app_url(Some("  https://prepo.example  ")).unwrap().as_str(),
            "https://prepo.example/"
        );
    }

    #[test]
    fn refuses_anything_that_is_not_http() {
        assert_eq!(
            resolve_app_url(Some("file:///etc/passwd")),
            Err(ConfigError::NotHttp)
        );
        assert_eq!(
            resolve_app_url(Some("javascript:alert(1)")),
            Err(ConfigError::NotHttp)
        );
        assert_eq!(
            resolve_app_url(Some("data:text/html,<script>")),
            Err(ConfigError::NotHttp)
        );
    }

    #[test]
    fn refuses_addresses_that_carry_a_login() {
        assert_eq!(
            resolve_app_url(Some("https://user:secret@prepo.example")),
            Err(ConfigError::WithCredentials)
        );
    }

    #[test]
    fn refuses_nonsense() {
        // `localhost:3000` parses, but as the scheme `localhost` — not a web address.
        assert_eq!(resolve_app_url(Some("localhost:3000")), Err(ConfigError::NotHttp));
        assert_eq!(resolve_app_url(Some("not a url")), Err(ConfigError::NotAUrl));
    }
}
