//! The `prepo://` grammar.
//!
//! Deep links are text from outside the app — a browser, another app, an
//! installer's registry entry — so parsing is strict and total: anything that is
//! not a shape this shell knows is refused with a reason, never guessed at.
//!
//! ```text
//! prepo://                                  the app's front door
//! prepo://northwind                         the workspace
//! prepo://northwind/ticket/PRE-142          one ticket
//! prepo://northwind/meeting/01a1b2c3-...    one meeting
//! ```
//!
//! The workspace is the authority, not a path segment, because a workspace slug
//! is what tells the app whose data to look at; a link that named a ticket
//! without one could only be resolved by guessing.

use tauri::Url;

use crate::urls;

pub const SCHEME: &str = "prepo";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    /// `prepo://` — open the app, let it decide.
    Root,
    /// `prepo://northwind` — open a workspace.
    Workspace { workspace: String },
    /// `prepo://northwind/ticket/PRE-142`
    Ticket { workspace: String, key: String },
    /// `prepo://northwind/meeting/<id>`
    Meeting { workspace: String, id: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseError {
    NotAUrl,
    WrongScheme,
    WithCredentials,
    MissingWorkspace,
    UnknownWorkspace(String),
    UnknownTarget(String),
    BadValue(String),
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ParseError::NotAUrl => write!(f, "that is not a URL"),
            ParseError::WrongScheme => {
                write!(f, "only {SCHEME}:// links are opened by this app")
            }
            ParseError::WithCredentials => write!(f, "a link with a login in it is refused"),
            ParseError::MissingWorkspace => {
                write!(f, "a {SCHEME}:// link needs a workspace: {SCHEME}://<workspace>/...")
            }
            ParseError::UnknownWorkspace(value) => {
                write!(f, "`{value}` is not a workspace address")
            }
            ParseError::UnknownTarget(value) => write!(f, "`{value}` is not something this app opens"),
            ParseError::BadValue(value) => write!(f, "`{value}` is not a valid identifier"),
        }
    }
}

impl std::error::Error for ParseError {}

/// Parses a `prepo://` address into something the shell can open.
pub fn parse(raw: &str) -> Result<Target, ParseError> {
    let url = Url::parse(raw).map_err(|_| ParseError::NotAUrl)?;
    if url.scheme() != SCHEME {
        return Err(ParseError::WrongScheme);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ParseError::WithCredentials);
    }

    let workspace = url.host_str().unwrap_or("").to_ascii_lowercase();
    // The path is read as a string and split, rather than via `path_segments()`,
    // because `path_segments()` returns `None` for a URL with no authority — and
    // `prepo:ticket/PRE-1` (no `//`) is exactly the case that must be refused for
    // missing a workspace, not quietly accepted as the front door.
    let segments: Vec<String> = url
        .path()
        .split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| segment.to_string())
        .collect();

    if workspace.is_empty() {
        return if segments.is_empty() {
            Ok(Target::Root)
        } else {
            Err(ParseError::MissingWorkspace)
        };
    }
    if !urls::is_workspace_slug(&workspace) {
        return Err(ParseError::UnknownWorkspace(workspace));
    }

    match segments.first().map(String::as_str) {
        None => Ok(Target::Workspace { workspace }),
        Some("ticket") if segments.len() == 2 => {
            let key = normalise_key(&segments[1])
                .ok_or_else(|| ParseError::BadValue(segments[1].clone()))?;
            Ok(Target::Ticket { workspace, key })
        }
        Some("meeting") if segments.len() == 2 => {
            let id = segments[1].clone();
            let id = if is_meeting_id(&id) {
                id
            } else {
                return Err(ParseError::BadValue(id));
            };
            Ok(Target::Meeting { workspace, id })
        }
        _ => Err(ParseError::UnknownTarget(segments.join("/"))),
    }
}

/// The address in the app that a target names.
pub fn resolve(origin: &str, target: &Target) -> String {
    let origin = origin.trim_end_matches('/');
    match target {
        Target::Root => origin.to_string(),
        Target::Workspace { workspace } => format!("{origin}/{workspace}"),
        Target::Ticket { workspace, key } => format!("{origin}/{workspace}/tickets/{key}"),
        Target::Meeting { workspace, id } => format!("{origin}/{workspace}/meetings/{id}"),
    }
}

/// Ticket keys are `PRE-142` in the app; a link may arrive in any case.
fn normalise_key(candidate: &str) -> Option<String> {
    let (prefix, number) = candidate.split_once('-')?;
    if !(2..=10).contains(&prefix.len()) || !prefix.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    if number.is_empty() || number.len() > 6 || !number.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    Some(format!("{}-{number}", prefix.to_ascii_uppercase()))
}

fn is_meeting_id(candidate: &str) -> bool {
    !candidate.is_empty()
        && candidate.len() <= 64
        && candidate
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_scheme_is_the_front_door() {
        assert_eq!(parse("prepo://").unwrap(), Target::Root);
        assert_eq!(parse("prepo:").unwrap(), Target::Root);
    }

    #[test]
    fn a_bare_workspace_opens_it() {
        assert_eq!(
            parse("prepo://northwind").unwrap(),
            Target::Workspace {
                workspace: "northwind".into()
            }
        );
        // the authority is case-insensitive, like every other URL authority
        assert_eq!(
            parse("prepo://NorthWind").unwrap(),
            Target::Workspace {
                workspace: "northwind".into()
            }
        );
    }

    #[test]
    fn a_ticket_keeps_its_key_and_gains_the_right_case() {
        assert_eq!(
            parse("prepo://northwind/ticket/PRE-142").unwrap(),
            Target::Ticket {
                workspace: "northwind".into(),
                key: "PRE-142".into()
            }
        );
        assert_eq!(
            parse("prepo://northwind/ticket/pre-9").unwrap(),
            Target::Ticket {
                workspace: "northwind".into(),
                key: "PRE-9".into()
            }
        );
    }

    #[test]
    fn a_meeting_keeps_its_id() {
        let id = "01a1b2c3-d4e5-6f70-8192-a3b4c5d6e7f8";
        assert_eq!(
            parse(&format!("prepo://northwind/meeting/{id}")).unwrap(),
            Target::Meeting {
                workspace: "northwind".into(),
                id: id.into()
            }
        );
    }

    #[test]
    fn query_strings_and_fragments_are_ignored_not_opened() {
        assert_eq!(
            parse("prepo://northwind/ticket/PRE-142?utm=chat#frag").unwrap(),
            Target::Ticket {
                workspace: "northwind".into(),
                key: "PRE-142".into()
            }
        );
    }

    #[test]
    fn another_scheme_is_refused() {
        assert_eq!(parse("https://prepo.example"), Err(ParseError::WrongScheme));
        assert_eq!(parse("mailto:someone@example.com"), Err(ParseError::WrongScheme));
    }

    #[test]
    fn a_workspace_is_required_before_anything_can_be_opened() {
        assert_eq!(
            parse("prepo:///ticket/PRE-142"),
            Err(ParseError::MissingWorkspace)
        );
        assert_eq!(parse("prepo:ticket/PRE-142"), Err(ParseError::MissingWorkspace));
    }

    #[test]
    fn a_bad_workspace_is_refused_rather_than_sanitised() {
        assert_eq!(
            parse("prepo://North Wind/ticket/PRE-142"),
            Err(ParseError::NotAUrl)
        );
        assert_eq!(
            parse("prepo://-leading/ticket/PRE-142"),
            Err(ParseError::UnknownWorkspace("-leading".into()))
        );
    }

    #[test]
    fn unknown_targets_are_refused() {
        assert_eq!(
            parse("prepo://northwind/settings"),
            Err(ParseError::UnknownTarget("settings".into()))
        );
        assert_eq!(
            parse("prepo://northwind/ticket"),
            Err(ParseError::UnknownTarget("ticket".into()))
        );
        assert_eq!(
            parse("prepo://northwind/ticket/PRE-142/extra"),
            Err(ParseError::UnknownTarget("ticket/PRE-142/extra".into()))
        );
    }

    #[test]
    fn malformed_identifiers_are_refused() {
        assert_eq!(
            parse("prepo://northwind/ticket/142"),
            Err(ParseError::BadValue("142".into()))
        );
        assert_eq!(
            parse("prepo://northwind/ticket/PRE-"),
            Err(ParseError::BadValue("PRE-".into()))
        );
        // Path segments arrive percent-encoded, so an escaped identifier is
        // refused as written instead of being decoded into something that would
        // then be navigated to.
        assert_eq!(
            parse("prepo://northwind/meeting/..%2Fadmin"),
            Err(ParseError::BadValue("..%2Fadmin".into()))
        );
        assert_eq!(
            parse("prepo://northwind/meeting/not a meeting"),
            Err(ParseError::BadValue("not%20a%20meeting".into()))
        );
    }

    #[test]
    fn resolve_points_at_the_apps_real_routes() {
        let origin = "http://localhost:3000";
        assert_eq!(resolve(origin, &Target::Root), "http://localhost:3000");
        assert_eq!(
            resolve(
                "http://localhost:3000/",
                &Target::Workspace {
                    workspace: "northwind".into()
                }
            ),
            "http://localhost:3000/northwind"
        );
        assert_eq!(
            resolve(
                origin,
                &Target::Ticket {
                    workspace: "northwind".into(),
                    key: "PRE-142".into()
                }
            ),
            "http://localhost:3000/northwind/tickets/PRE-142"
        );
        assert_eq!(
            resolve(
                origin,
                &Target::Meeting {
                    workspace: "northwind".into(),
                    id: "01a1".into()
                }
            ),
            "http://localhost:3000/northwind/meetings/01a1"
        );
    }

}
