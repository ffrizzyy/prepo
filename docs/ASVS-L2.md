# OWASP ASVS 4.0.3 Level 2 screening

**Status: screening review, not a certification.** This document lists every
Level 1 and Level 2 requirement in OWASP ASVS 4.0.3 (253 clauses) and records a
status against the Prepo tree at commit `70420ae` (22 October 2026), plus one
comment-only correction to the TOTP schema note in the commit that adds this
document. It is a self-assessment. No ASVS certified verifier has
reviewed this application, and a `Met` row means only that the cited evidence
supports the clause in this review, not that an auditor would accept it.

Requirement text is abridged from OWASP ASVS 4.0.3, which is licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The canonical
requirements are at <https://owasp.org/www-project-application-security-verification-standard/>.

## Scope and method

- **Target:** the web application in `apps/web`, its Postgres schema and RLS,
  the Railway deployment, and the desktop shell where it changes the answer.
- **Level:** ASVS 4.0.3 Level 2, which includes all Level 1 clauses. L3-only
  clauses are out of scope.
- **Evidence:** source and migrations, `db:verify`, `db:idor-smoke`,
  `db:injection-smoke`, `db:auth`, the HTTP matrix, ZAP baseline,
  securityheaders, Lighthouse/axe reports in `docs/reports/`, and the
  operational facts in `SECURITY.md` and `DEPLOYMENT.md`.
- **Not evidence:** a feature existing in a screenshot, a passing unit test that
  does not exercise the control, or a header that is only present locally.
- **Status meanings:**
  - **Met** — the control is implemented and the cited evidence covers it.
  - **Partial** — the control exists but a named part of the clause is missing.
  - **Gap** — the clause is not implemented.
  - **N/A** — the feature or data class does not exist, so the clause cannot apply.
  - **Not assessed** — no evidence was available. (None remain in this table.)

A section status is the default for its clauses; individual rows override it
where the clause differs. A dash in the evidence column means the section
assessment applies to that row.

## Result

| Status | Clauses |
| :--- | ---: |
| Met | 128 |
| Partial | 53 |
| Gap | 35 |
| N/A | 37 |
| **Total** | **253** |

This is **not a pass**. The material gaps are listed after the tables. Several
are deliberate scope decisions for a demo (no password recovery, no KMS, no
antivirus); others are ordinary unfinished work. The distinction matters.

## Material gaps

1. **No change-password or forgotten-password flow** (2.1.5, 2.1.6, 2.5.6,
   2.5.7). A user who forgets a password has no self-service path.
2. **No breached-password check or strength meter** (2.1.7, 2.1.8), and the
   password cap is 200 rather than 128 (2.1.2).
3. **TOTP secrets are plaintext at rest** (2.8.2, 2.9.1), and a TOTP code
   accepted in the +/-1 step window is not recorded as used (2.8.4, 2.8.5).
4. **Recovery codes are about 50 bits and stored as unsalted SHA-256**
   (2.6.2, 2.6.3), below the ASVS 112-bit-or-salted bar.
5. **No auth-change notifications** (2.2.3, 2.5.5), despite audit events.
6. **Sign-in throttling allows up to 300 failures/hour on one account**
   (2.2.1), above the 100/hour ASVS ceiling.
7. **Owner/admin settings do not require MFA or step-up** (4.3.1, 3.7.1,
   4.3.3). TOTP is optional.
8. **Access-control failures are not logged or alerted** (7.1.3, 7.2.2,
   8.1.4, 11.1.7, 11.1.8).
9. **No account-level export or delete**, and retention covers audio but not
   meetings, transcripts or tickets (8.3.2, 8.3.8).
10. **No KMS, pepper or key rotation** (1.6, 2.4.5, 6.4).
11. **No antivirus scan** for uploaded audio (12.4.2) and **no per-user
    storage quota** (12.1.3).
12. **No anti-automation on uploads, extraction or ordinary API calls**
    (11.1.4); only sign-in is throttled.
13. **No SBOM** (14.2.5) and **no Content-Disposition on JSON API responses**
    (14.4.2).
14. **The desktop updater is a placeholder** with no signing key or update
    endpoint (10.3.1). This is not a shipped installer.

The public demo additionally runs without AI, Linear or Resend keys, so
extraction, transcription and email report "unconfigured" rather than
pretending to work. That is a product limitation, not an ASVS control.

## V1 Architecture, Design and Threat Modeling

*38 clauses: 23 met, 9 partial, 5 gap, 1 N/A.*

**V1.1 Secure Software Development Lifecycle** — default status: **Partial**. Architecture notes and ten ADRs exist, and CI is the enforcement point, but there is no formal per-change threat model or SDLC gate.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.1.1 | Verify the use of a secure software development lifecycle that addresses security in all stages of development. (C1) | Partial | — |
| 1.1.2 | Verify the use of threat modeling for every design change or sprint planning to identify threats, plan for countermeasures, facilitate appropriate risk responses, and guide security testing. | Gap | No per-change threat model. |
| 1.1.3 | Verify that all user stories and features contain functional security constraints, such as "As a user, I should be able to view and edit my profile. I should not be able to view or edit any… | Partial | — |
| 1.1.4 | Verify documentation and justification of all the application's trust boundaries, components, and significant data flows. | Met | `ARCHITECTURE.md` records trust boundaries, components and data flows. |
| 1.1.5 | Verify definition and security analysis of the application's high-level architecture and all connected remote services. (C1) | Met | The architecture and each provider integration are documented and reviewed in ADRs. |
| 1.1.6 | Verify implementation of centralized, simple (economy of design), vetted, secure, and reusable security controls to avoid duplicate, missing, ineffective, or insecure controls. (C10) | Met | Auth, workspace scoping, validation and audit are centralised in shared modules. |
| 1.1.7 | Verify availability of a secure coding checklist, security requirements, guideline, or policy to all developers and testers. | Partial | `SECURITY.md` and `AGENTS.md` exist, but there is no separate secure-coding checklist for every change. |

**V1.2 Authentication Architecture** — default status: **Partial**. One Node service talks to Neon over TLS with a least-privilege database role; the application itself does not run under a separate low-privilege OS account.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.2.1 | Verify the use of unique or special low-privilege operating system accounts for all application components, services, and servers. (C3) | Gap | The app runs as one container process; no separate low-privilege OS accounts are defined. |
| 1.2.2 | Verify that communications between application components, including APIs, middleware and data layers, are authenticated. Components should have the least necessary privileges needed. (C3) | Met | Neon uses a scoped database role and TLS; provider calls use scoped tokens. |
| 1.2.3 | Verify that the application uses a single vetted authentication mechanism that is known to be secure, can be extended to include strong authentication, and has sufficient logging and monito… | Met | One password+TOTP mechanism, with auth events and throttling. |
| 1.2.4 | Verify that all authentication pathways and identity management APIs implement consistent authentication security control strength, such that there are no weaker alternatives per the risk o… | Met | Sign-in, recovery-code and TOTP paths share the same throttling and session rules. |

**V1.4 Access Control Architecture** — default status: **Met**. Access control is enforced on the server: session lookup, workspace membership and role checks, plus Postgres RLS. See `SECURITY.md` A01 and `db:verify`.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.4.1 | Verify that trusted enforcement points, such as access control gateways, servers, and serverless functions, enforce access controls. Never enforce access controls on the client. | Met | — |
| 1.4.4 | Verify the application uses a single and well-vetted access control mechanism for accessing protected data and resources. All requests must pass through this single mechanism to avoid copy… | Met | — |
| 1.4.5 | Verify that attribute or feature-based access control is used whereby the code checks the user's authorization for a feature/data item rather than just their role. Permissions should still… | Met | — |

**V1.5 Input and Output Architecture** — default status: **Met**. Server actions read explicit fields; Zod and hand-written validation reject bad input; React escapes output and Drizzle parameterises SQL. `db:injection-smoke` exercises a poisoned transcript.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.5.1 | Verify that input and output requirements clearly define how to handle and process data based on type, content, and applicable laws, regulations, and other policy compliance. | Partial | Validation rules live in code and tests, but there is no separate input/output policy document. |
| 1.5.2 | Verify that serialization is not used when communicating with untrusted clients. If this is not possible, ensure that adequate integrity controls (and possibly encryption if sensitive data… | Met | JSON is used with typed parsing; no untrusted language-native serialisation is accepted. |
| 1.5.3 | Verify that input validation is enforced on a trusted service layer. (C5) | Met | Validation runs in server actions and API routes, not only in the browser. |
| 1.5.4 | Verify that output encoding occurs close to or by the interpreter for which it is intended. (C4) | Met | React escapes at render time; SQL is parameterised at the driver boundary. |

**V1.6 Cryptographic Architecture** — default status: **Partial**. Secrets are environment variables (`.env.local`, Railway variables); there is no key vault, formal key policy, pepper, or rotation procedure.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.6.1 | Verify that there is an explicit policy for management of cryptographic keys and that a cryptographic key lifecycle follows a key management standard such as NIST SP 800-57. | Gap | No documented key-management policy or lifecycle. |
| 1.6.2 | Verify that consumers of cryptographic services protect key material and other secrets by using key vaults or API based alternatives. | Partial | Environment variables are used; no vault or API-based secret service. |
| 1.6.3 | Verify that all keys and passwords are replaceable and are part of a well-defined process to re-encrypt sensitive data. | Gap | No rotation or re-encryption process. |
| 1.6.4 | Verify that the architecture treats client-side secrets--such as symmetric keys, passwords, or API tokens--as insecure and never uses them to protect or access sensitive data. | Met | The browser receives no symmetric key, API token or database credential. |

**V1.7 Errors, Logging and Auditing Architecture** — default status: **Partial**. `auth_events` and `audit_logs` are append-only and written in one place; there is no remote log sink, SIEM, or alerting.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.7.1 | Verify that a common logging format and approach is used across the system. (C9) | Met | `auth_events` and `audit_logs` use a consistent row shape and UTC timestamps. |
| 1.7.2 | Verify that logs are securely transmitted to a preferably remote system for analysis, detection, alerting, and escalation. (C9) | Gap | No remote log transmission, SIEM or alerting. |

**V1.8 Data Protection and Privacy Architecture** — default status: **Partial**. `SECURITY.md` describes data classes and retention; there is no formal classification register or per-class control matrix.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.8.1 | Verify that all sensitive data is identified and classified into protection levels. | Partial | Data classes are described, but there is no formal register. |
| 1.8.2 | Verify that all protection levels have an associated set of protection requirements, such as encryption requirements, integrity requirements, retention, privacy and other confidentiality re… | Partial | Retention and encryption are described for audio; other data classes lack a complete control matrix. |

**V1.9 Communications Architecture** — default status: **Met**. Outbound connections to Neon, Linear, OpenRouter, Deepgram and Resend use TLS and Node certificate validation.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.9.1 | Verify the application encrypts communications between components, particularly when these components are in different containers, systems, sites, or cloud providers. (C3) | Met | — |
| 1.9.2 | Verify that application components verify the authenticity of each side in a communication link to prevent person-in-the-middle attacks. For example, application components should validate… | Met | — |

**V1.10 Malicious Software Architecture** — default status: **Met**. Git and GitHub provide access control, identifiable users and history; CI, CodeQL, gitleaks and Dependabot gate `main`.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.10.1 | Verify that a source code control system is in use, with procedures to ensure that check-ins are accompanied by issues or change tickets. The source code control system should have access c… | Met | — |

**V1.11 Business Logic Architecture** — default status: **Met**. `ARCHITECTURE.md` documents components and trust boundaries; request state is created per request rather than shared between users.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.11.1 | Verify the definition and documentation of all application components in terms of the business or security functions they provide. | Met | — |
| 1.11.2 | Verify that all high-value business logic flows, including authentication, session management and access control, do not share unsynchronized state. | Met | — |

**V1.12 Secure File Upload Architecture** — default status: **Met**. Uploaded audio is stored outside the web root and served only by `/api/audio/[assetId]` after a workspace-scoped check, under a restrictive CSP.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.12.2 | Verify that user-uploaded files - if required to be displayed or downloaded from the application - are served by either octet stream downloads, or from an unrelated domain, such as a cloud… | Met | — |

**V1.14 Configuration Architecture** — default status: **Partial**. The app is containerised on Railway with a separate Neon database and a CI build; there is no infrastructure-as-code, binary signing or remote binary deployment.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 1.14.1 | Verify the segregation of components of differing trust levels through well-defined security controls, firewall rules, API gateways, reverse proxies, cloud-based security groups, or similar… | Met | The app and database are separate services; Railway provides the network boundary. |
| 1.14.2 | Verify that binary signatures, trusted connections, and verified endpoints are used to deploy binaries to remote devices. | N/A | No binaries are deployed to remote devices. |
| 1.14.3 | Verify that the build pipeline warns of out-of-date or insecure components and takes appropriate actions. | Partial | Dependabot, `pnpm audit`, `cargo audit` and CodeQL run, but the CI cargo-audit gate explicitly ignores three `zip` advisories, so it is not a complete insecure-component gate. |
| 1.14.4 | Verify that the build pipeline contains a build step to automatically build and verify the secure deployment of the application, particularly if the application infrastructure is software d… | Partial | CI builds and tests the image, but the Railway infrastructure is not defined as code. |
| 1.14.5 | Verify that application deployments adequately sandbox, containerize and/or isolate at the network level to delay and deter attackers from attacking other applications, especially when they… | Met | The web app runs in a container with a separate database and volume. |
| 1.14.6 | Verify the application does not use unsupported, insecure, or deprecated client-side technologies such as NSAPI plugins, Flash, Shockwave, ActiveX, Silverlight, NACL, or client-side Java ap… | Met | No Flash, ActiveX, Java applets or other deprecated client technology is used. |

## V2 Authentication

*48 clauses: 14 met, 3 partial, 17 gap, 14 N/A.*

**V2.1 Password Security** — default status: **Partial**. Passwords use Argon2id with a 12-character minimum and no composition rules. There is no change-password flow, breach check, strength meter, or show-password control, and the 200-character cap exceeds the ASVS 128.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.1.1 | Verify that user set passwords are at least 12 characters in length (after multiple spaces are combined). (C6) | Met | `PASSWORD_MIN = 12` in `apps/web/src/server/auth/actions.ts`. |
| 2.1.2 | Verify that passwords of at least 64 characters are permitted, and that passwords of more than 128 characters are denied. (C6) | Gap | The cap is 200 characters, not 128. |
| 2.1.3 | Verify that password truncation is not performed. However, consecutive multiple spaces may be replaced by a single space. (C6) | Met | No truncation; Argon2id hashes the supplied string. |
| 2.1.4 | Verify that any printable Unicode character, including language neutral characters such as spaces and Emojis are permitted in passwords. | Met | No character-class restriction; UTF-8 is accepted up to the 200-code-unit cap. |
| 2.1.5 | Verify users can change their password. | Gap | No change-password flow. |
| 2.1.6 | Verify that password change functionality requires the user's current and new password. | Gap | No change-password flow. |
| 2.1.7 | Verify that passwords submitted during account registration, login, and password change are checked against a set of breached passwords either locally (such as the top 1,000 or 10,000 most… | Gap | No breached-password check. |
| 2.1.8 | Verify that a password strength meter is provided to help users set a stronger password. | Gap | No strength meter. |
| 2.1.9 | Verify that there are no password composition rules limiting the type of characters permitted. There should be no requirement for upper or lower case or numbers or special characters. (C6) | Met | No upper/lower/number/special composition rules. |
| 2.1.10 | Verify that there are no periodic credential rotation or password history requirements. | Met | No periodic rotation or password history. |
| 2.1.11 | Verify that "paste" functionality, browser password helpers, and external password managers are permitted. | Met | Paste and password-manager input are not blocked. |
| 2.1.12 | Verify that the user can choose to either temporarily view the entire masked password, or temporarily view the last typed character of the password on platforms that do not have this as bui… | Gap | No show-password control. |

**V2.2 General Authenticator Security** — default status: **Partial**. Sign-in is throttled per email and IP, and no weak authenticator is offered, but the ceiling is above 100 failures/hour and auth changes are not notified to the user.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.2.1 | Verify that anti-automation controls are effective at mitigating breached credential testing, brute force, and account lockout attacks. Such controls include blocking the most common breach… | Partial | Five failures/minute per email and twenty/minute per IP allow up to 300 failures/hour on one account, above the 100/hour ASVS ceiling. |
| 2.2.2 | Verify that the use of weak authenticators (such as SMS and email) is limited to secondary verification and transaction approval and not as a replacement for more secure authentication meth… | Met | No SMS or email authenticator is offered; password+TOTP is the only path. |
| 2.2.3 | Verify that secure notifications are sent to users after updates to authentication details, such as credential resets, email or address changes, logging in from unknown or risky locations.… | Gap | No notification is sent after auth changes. |

**V2.3 Authenticator Lifecycle** — default status: **Partial**. TOTP enrolment is supported; there is no FIDO/U2F device support and no time-bound authenticator renewal.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.3.1 | Verify system generated initial passwords or activation codes SHOULD be securely randomly generated, SHOULD be at least 6 characters long, and MAY contain letters and numbers, and expire af… | N/A | No system-generated initial passwords or activation codes. |
| 2.3.2 | Verify that enrollment and use of user-provided authentication devices are supported, such as a U2F or FIDO tokens. | Partial | TOTP enrollment is supported; no U2F/FIDO hardware token. |
| 2.3.3 | Verify that renewal instructions are sent with sufficient time to renew time bound authenticators. | N/A | TOTP has no renewal cycle. |

**V2.4 Credential Storage** — default status: **Partial**. Argon2id with a unique 16-byte salt is in place; no secret pepper is applied.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.4.1 | Verify that passwords are stored in a form that is resistant to offline attacks. Passwords SHALL be salted and hashed using an approved one-way key derivation or password hashing function.… | Met | Argon2id, 19 MiB, two iterations, one lane. |
| 2.4.2 | Verify that the salt is at least 32 bits in length and be chosen arbitrarily to minimize salt value collisions among stored hashes. For each credential, a unique salt value and the resultin… | Met | 16-byte random salt per hash. |
| 2.4.3 | Verify that if PBKDF2 is used, the iteration count SHOULD be as large as verification server performance will allow, typically at least 100,000 iterations. (C6) | N/A | PBKDF2 is not used. |
| 2.4.4 | Verify that if bcrypt is used, the work factor SHOULD be as large as verification server performance will allow, with a minimum of 10. (C6) | N/A | bcrypt is not used. |
| 2.4.5 | Verify that an additional iteration of a key derivation function is performed, using a salt value that is secret and known only to the verifier. Generate the salt value using an approved ra… | Gap | No secret pepper. |

**V2.5 Credential Recovery** — default status: **Partial**. There are no password hints or secret questions, but there is no password recovery path, no factor-change notification, and seeded demo accounts intentionally share a password.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.5.1 | Verify that a system generated initial activation or recovery secret is not sent in clear text to the user. (C6) | N/A | No activation or recovery secret is sent to users; TOTP recovery codes are displayed once and stored hashed. |
| 2.5.2 | Verify password hints or knowledge-based authentication (so-called "secret questions") are not present. | Met | No password hints or secret questions. |
| 2.5.3 | Verify password credential recovery does not reveal the current password in any way. (C6) | N/A | No password recovery path exists. |
| 2.5.4 | Verify shared or default accounts are not present (e.g. "root", "admin", or "sa"). | Partial | Real accounts have unique passwords; the seeded demo accounts intentionally share the documented demo password. |
| 2.5.5 | Verify that if an authentication factor is changed or replaced, that the user is notified of this event. | Gap | Factor changes are audited but no notification is sent. |
| 2.5.6 | Verify forgotten password, and other recovery paths use a secure recovery mechanism, such as time-based OTP (TOTP) or other soft token, mobile push, or another offline recovery mechanism. (… | Gap | No forgotten-password or recovery flow. |
| 2.5.7 | Verify that if OTP or multi-factor authentication factors are lost, that evidence of identity proofing is performed at the same level as during enrollment. | Gap | No lost-factor identity proofing. |

**V2.6 Look-up Secret Verifier** — default status: **Partial**. Recovery codes are single-use, but ten base32 characters is about 50 bits and the stored SHA-256 is unsalted, so the 112-bit-or-salted requirement is not met.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.6.1 | Verify that lookup secrets can be used only once. | Met | Recovery codes are consumed on use. |
| 2.6.2 | Verify that lookup secrets have sufficient randomness (112 bits of entropy), or if less than 112 bits of entropy, salted with a unique and random 32-bit salt and hashed with an approved one… | Gap | A 10-character base32 code is about 50 bits and the SHA-256 is unsalted. |
| 2.6.3 | Verify that lookup secrets are resistant to offline attacks, such as predictable values. | Gap | Unsalted SHA-256 over a 50-bit value is not resistant to offline attack. |

**V2.7 Out of Band Verifier** — default status: **N/A**. No SMS, PSTN or other out-of-band authenticator is offered.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.7.1 | Verify that clear text out of band (NIST "restricted") authenticators, such as SMS or PSTN, are not offered by default, and stronger alternatives such as push notifications are offered firs… | N/A | — |
| 2.7.2 | Verify that the out of band verifier expires out of band authentication requests, codes, or tokens after 10 minutes. | N/A | — |
| 2.7.3 | Verify that the out of band verifier authentication requests, codes, or tokens are only usable once, and only for the original authentication request. | N/A | — |
| 2.7.4 | Verify that the out of band authenticator and verifier communicates over a secure independent channel. | N/A | — |
| 2.7.5 | Verify that the out of band verifier retains only a hashed version of the authentication code. | N/A | — |
| 2.7.6 | Verify that the initial authentication code is generated by a secure random number generator, containing at least 20 bits of entropy (typically a six digital random number is sufficient). | N/A | — |

**V2.8 One Time Verifier** — default status: **Partial**. TOTP is RFC 6238 with a 30-second step and HMAC-SHA1. The secret is plaintext in the database, and a code accepted inside the +/-1 step window is not recorded as used.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.8.1 | Verify that time-based OTPs have a defined lifetime before expiring. | Met | 30-second TOTP step. |
| 2.8.2 | Verify that symmetric keys used to verify submitted OTPs are highly protected, such as by using a hardware security module or secure operating system based key storage. | Gap | The TOTP secret is stored plaintext in `accounts.totp_secret`. |
| 2.8.3 | Verify that approved cryptographic algorithms are used in the generation, seeding, and verification of OTPs. | Met | HMAC-SHA1 via `otpauth`, as RFC 6238 specifies. |
| 2.8.4 | Verify that time-based OTP can be used only once within the validity period. | Gap | The verifier accepts the current step with a +/-1 window and does not record a code as used. |
| 2.8.5 | Verify that if a time-based multi-factor OTP token is re-used during the validity period, it is logged and rejected with secure notifications being sent to the holder of the device. | Gap | No replay log or notification. |
| 2.8.6 | Verify physical single-factor OTP generator can be revoked in case of theft or other loss. Ensure that revocation is immediately effective across logged in sessions, regardless of location. | N/A | No physical OTP token. |

**V2.9 Cryptographic Verifier** — default status: **Partial**. TOTP verification secrets are stored in the database rather than a TPM/HSM or OS secure store; the WebAuthn challenge-nonce clause does not apply.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 2.9.1 | Verify that cryptographic keys used in verification are stored securely and protected against disclosure, such as using a Trusted Platform Module (TPM) or Hardware Security Module (HSM), or… | Gap | The TOTP secret is plaintext in `accounts.totp_secret`; there is no TPM/HSM or OS secure store. |
| 2.9.2 | Verify that the challenge nonce is at least 64 bits in length, and statistically unique or unique over the lifetime of the cryptographic device. | N/A | No WebAuthn challenge. |
| 2.9.3 | Verify that approved cryptographic algorithms are used in the generation, seeding, and verification. | Met | TOTP is generated and verified with HMAC-SHA1 from `node:crypto`. |

## V3 Session Management

*17 clauses: 10 met, 2 partial, 0 gap, 5 N/A.*

**V3.1 Fundamental Session Management Security** — default status: **Met**. Session tokens are carried only in cookies, never in a URL.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.1.1 | Verify the application never reveals session tokens in URL parameters. | Met | — |

**V3.2 Session Binding** — default status: **Met**. Every sign-in creates a new 256-bit random token; only its SHA-256 hash is stored, and the cookie is `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.2.1 | Verify the application generates a new session token on user authentication. (C6) | Met | — |
| 3.2.2 | Verify that session tokens possess at least 64 bits of entropy. (C6) | Met | — |
| 3.2.3 | Verify the application only stores session tokens in the browser using secure methods such as appropriately secured cookies (see section 3.4) or HTML 5 session storage. | Met | — |
| 3.2.4 | Verify that session tokens are generated using approved cryptographic algorithms. (C6) | Met | — |

**V3.3 Session Termination** — default status: **Partial**. Logout revokes the row and sessions expire; users can list and revoke devices, but revoking other devices does not require re-entering credentials and there is no password-change cascade.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.3.1 | Verify that logout and expiration invalidate the session token, such that the back button or a downstream relying party does not resume an authenticated session, including across relying pa… | Met | Logout revokes the session row; absolute and idle expiry are checked on every lookup. |
| 3.3.3 | Verify that the application gives the option to terminate all other active sessions after a successful password change (including change via password reset/recovery), and that this is effec… | N/A | There is no password-change path to cascade. |
| 3.3.4 | Verify that users are able to view and (having re-entered login credentials) log out of any or all currently active sessions and devices. | Partial | Users can list and revoke devices, but revoking others does not require re-entering credentials. |

**V3.4 Cookie-based Session Management** — default status: **Met**. The session cookie uses `__Host-`, `Secure` in production, `HttpOnly`, `SameSite=Lax` and `Path=/`. There is no sibling application on the host.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.4.1 | Verify that cookie-based session tokens have the 'Secure' attribute set. (C6) | Met | — |
| 3.4.2 | Verify that cookie-based session tokens have the 'HttpOnly' attribute set. (C6) | Met | — |
| 3.4.3 | Verify that cookie-based session tokens utilize the 'SameSite' attribute to limit exposure to cross-site request forgery attacks. (C6) | Met | — |
| 3.4.4 | Verify that cookie-based session tokens use the "__Host-" prefix so cookies are only sent to the host that initially set the cookie. | Met | — |
| 3.4.5 | Verify that if the application is published under a domain name with other applications that set or use session cookies that might disclose the session cookies, set the path attribute in co… | N/A | The app is the only application on its host. |

**V3.5 Token-based Session Management** — default status: **N/A**. There is no OAuth provider or stateless signed session token.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.5.1 | Verify the application allows users to revoke OAuth tokens that form trust relationships with linked applications. | N/A | — |
| 3.5.2 | Verify the application uses session tokens rather than static API secrets and keys, except with legacy implementations. | N/A | — |
| 3.5.3 | Verify that stateless session tokens use digital signatures, encryption, and other countermeasures to protect against tampering, enveloping, replay, null cipher, and key substitution attack… | N/A | — |

**V3.7 Defenses Against Session Management Exploits** — default status: **Partial**. Sensitive settings require a valid session, but there is no password or second-factor re-authentication before account or workspace changes.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 3.7.1 | Verify the application ensures a full, valid login session or requires re-authentication or secondary verification before allowing any sensitive transactions or account modifications. | Partial | No re-authentication or second-factor step-up before sensitive settings changes. |

## V4 Access Control

*9 clauses: 7 met, 0 partial, 2 gap, 0 N/A.*

**V4.1 General Access Control Design** — default status: **Met**. Server-side checks on every request; workspace and role come from the database, not from client-supplied attributes. Failures deny rather than fall through.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 4.1.1 | Verify that the application enforces access control rules on a trusted service layer, especially if client-side access control is present and could be bypassed. | Met | — |
| 4.1.2 | Verify that all user and data attributes and policy information used by access controls cannot be manipulated by end users unless specifically authorized. | Met | — |
| 4.1.3 | Verify that the principle of least privilege exists - users should only be able to access functions, data files, URLs, controllers, services, and other resources, for which they possess spe… | Met | — |
| 4.1.5 | Verify that access controls fail securely including when an exception occurs. (C10) | Met | — |

**V4.2 Operation Level Access Control** — default status: **Met**. `db:idor-smoke` runs 58 HTTP checks across page and API routes; SameSite=Lax cookies and Next server actions cover CSRF.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 4.2.1 | Verify that sensitive data and APIs are protected against Insecure Direct Object Reference (IDOR) attacks targeting creation, reading, updating and deletion of records, such as creating or… | Met | — |
| 4.2.2 | Verify that the application or framework enforces a strong anti-CSRF mechanism to protect authenticated functionality, and effective anti-automation or anti-CSRF protects unauthenticated fu… | Met | — |

**V4.3 Other Access Control Considerations** — default status: **Partial**. Directory browsing and metadata files are not served, but owner/admin settings do not require MFA and there is no step-up or segregation of duties.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 4.3.1 | Verify administrative interfaces use appropriate multi-factor authentication to prevent unauthorized use. | Gap | Owner/admin settings are protected by session and role, not mandatory MFA; TOTP is optional. |
| 4.3.2 | Verify that directory browsing is disabled unless deliberately desired. Additionally, applications should not allow discovery or disclosure of file or directory metadata, such as Thumbs.db,… | Met | Next serves no directory listings and `.git`/`.env` are not in the image. |
| 4.3.3 | Verify the application has additional authorization (such as step up or adaptive authentication) for lower value systems, and / or segregation of duties for high value applications to enfor… | Gap | No step-up or segregation of duties for high-value actions. |

## V5 Validation, Sanitization and Encoding

*30 clauses: 22 met, 1 partial, 0 gap, 7 N/A.*

**V5.1 Input Validation** — default status: **Met**. Explicit field extraction, Zod schemas, positive allow-lists for redirects and integration kinds, and no mass assignment.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 5.1.1 | Verify that the application has defenses against HTTP parameter pollution attacks, particularly if the application framework makes no distinction about the source of request parameters (GET… | Met | — |
| 5.1.2 | Verify that frameworks protect against mass parameter assignment attacks, or that the application has countermeasures to protect against unsafe parameter assignment, such as marking fields… | Met | — |
| 5.1.3 | Verify that all input (HTML form fields, REST requests, URL parameters, HTTP headers, cookies, batch files, RSS feeds, etc) is validated using positive validation (allow lists). (C5) | Partial | Forms and JSON bodies use allow-lists, but not every header or query value has an explicit allow-list. |
| 5.1.4 | Verify that structured data is strongly typed and validated against a defined schema including allowed characters, length and pattern (e.g. credit card numbers, e-mail addresses, telephone… | Met | — |
| 5.1.5 | Verify that URL redirects and forwards only allow destinations which appear on an allow list, or show a warning when redirecting to potentially untrusted content. | Met | — |

**V5.2 Sanitization and Sandboxing** — default status: **Met**. React escapes rendered text; there is no WYSIWYG, eval, template engine, SVG upload or user-controlled Markdown-to-HTML path. Provider calls use fixed endpoints, so user URLs are not fetched.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 5.2.1 | Verify that all untrusted HTML input from WYSIWYG editors or similar is properly sanitized with an HTML sanitizer library or framework feature. (C5) | Met | — |
| 5.2.2 | Verify that unstructured data is sanitized to enforce safety measures such as allowed characters and length. | Met | — |
| 5.2.3 | Verify that the application sanitizes user input before passing to mail systems to protect against SMTP or IMAP injection. | Met | Mail is sent through the Resend API with fixed fields; no user string becomes an SMTP header. |
| 5.2.4 | Verify that the application avoids the use of eval() or other dynamic code execution features. Where there is no alternative, any user input being included must be sanitized or sandboxed be… | Met | — |
| 5.2.5 | Verify that the application protects against template injection attacks by ensuring that any user input being included is sanitized or sandboxed. | Met | — |
| 5.2.6 | Verify that the application protects against SSRF attacks, by validating or sanitizing untrusted data or HTTP file metadata, such as filenames and URL input fields, and uses allow lists of… | Met | The app does not fetch user-supplied URLs; provider endpoints are fixed. |
| 5.2.7 | Verify that the application sanitizes, disables, or sandboxes user-supplied Scalable Vector Graphics (SVG) scriptable content, especially as they relate to XSS resulting from inline scripts… | Met | No SVG upload path exists. |
| 5.2.8 | Verify that the application sanitizes, disables, or sandboxes user-supplied scriptable or expression template language content, such as Markdown, CSS or XSL stylesheets, BBCode, or similar. | Met | Transcripts are rendered as text, not Markdown or expression templates. |

**V5.3 Output Encoding and Injection Prevention** — default status: **Met**. Context-aware React escaping, parameterised Drizzle queries, `JSON.parse` for JSON, no LDAP/XPath/XML, and no shell execution of user input.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 5.3.1 | Verify that output encoding is relevant for the interpreter and context required. For example, use encoders specifically for HTML values, HTML attributes, JavaScript, URL parameters, HTTP h… | Met | — |
| 5.3.2 | Verify that output encoding preserves the user's chosen character set and locale, such that any Unicode character point is valid and safely handled. (C4) | Met | — |
| 5.3.3 | Verify that context-aware, preferably automated - or at worst, manual - output escaping protects against reflected, stored, and DOM based XSS. (C4) | Met | — |
| 5.3.4 | Verify that data selection or database queries (e.g. SQL, HQL, ORM, NoSQL) use parameterized queries, ORMs, entity frameworks, or are otherwise protected from database injection attacks. (C… | Met | — |
| 5.3.5 | Verify that where parameterized or safer mechanisms are not present, context-specific output encoding is used to protect against injection attacks, such as the use of SQL escaping to protec… | N/A | Parameterised queries are used throughout. |
| 5.3.6 | Verify that the application protects against JSON injection attacks, JSON eval attacks, and JavaScript expression evaluation. (C4) | Met | — |
| 5.3.7 | Verify that the application protects against LDAP injection vulnerabilities, or that specific security controls to prevent LDAP injection have been implemented. (C4) | N/A | No LDAP. |
| 5.3.8 | Verify that the application protects against OS command injection and that operating system calls use parameterized OS queries or use contextual command line output encoding. (C4) | Met | No user-controlled OS command or shell invocation. |
| 5.3.9 | Verify that the application protects against Local File Inclusion (LFI) or Remote File Inclusion (RFI) attacks. | Met | No user-controlled include or file path. |
| 5.3.10 | Verify that the application protects against XPath injection or XML injection attacks. (C4) | N/A | No XML or XPath. |

**V5.4 Memory, String, and Unmanaged Code** — default status: **Met**. The web app is TypeScript/Node, so native buffer overflows do not apply; lengths and numeric ranges are bounded; format strings are constant.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 5.4.1 | Verify that the application uses memory-safe string, safer memory copy and pointer arithmetic to detect or prevent stack, buffer, or heap overflows. | N/A | The web app is memory-safe TypeScript/Node. |
| 5.4.2 | Verify that format strings do not take potentially hostile input, and are constant. | N/A | Format strings are constant. |
| 5.4.3 | Verify that sign, range, and input validation techniques are used to prevent integer overflows. | Met | Zod bounds lengths and numeric ranges. |

**V5.5 Deserialization Prevention** — default status: **Met**. No serialised object formats or XML parsers are used; JSON is parsed with `JSON.parse` and typed before use.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 5.5.1 | Verify that serialized objects use integrity checks or are encrypted to prevent hostile object creation or data tampering. (C5) | N/A | No serialised object format is accepted. |
| 5.5.2 | Verify that the application correctly restricts XML parsers to only use the most restrictive configuration possible and to ensure that unsafe features such as resolving external entities ar… | N/A | No XML parser. |
| 5.5.3 | Verify that deserialization of untrusted data is avoided or is protected in both custom code and third-party libraries (such as JSON, XML and YAML parsers). | Met | Untrusted JSON is parsed into typed values; no object injection path. |
| 5.5.4 | Verify that when parsing JSON in browsers or JavaScript-based backends, JSON.parse is used to parse the JSON document. Do not use eval() to parse JSON. | Met | `JSON.parse` is used, never `eval`. |

## V6 Stored Cryptography

*13 clauses: 6 met, 4 partial, 1 gap, 2 N/A.*

**V6.1 Data Classification** — default status: **Partial**. Neon encrypts its storage at rest, but locally embedded PGlite and audio on the Railway volume are not application-encrypted; no formal classification of regulated data exists.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 6.1.1 | Verify that regulated private data is stored encrypted while at rest, such as Personally Identifiable Information (PII), sensitive personal information, or data assessed likely to be subjec… | Partial | Neon storage is encrypted at rest; the local PGlite database and Railway audio volume are not application-encrypted. |
| 6.1.2 | Verify that regulated health data is stored encrypted while at rest, such as medical records, medical device details, or de-anonymized research records. | N/A | No regulated health data is intentionally collected. |
| 6.1.3 | Verify that regulated financial data is stored encrypted while at rest, such as financial accounts, defaults or credit history, tax records, pay history, beneficiaries, or de-anonymized mar… | N/A | No regulated financial data is collected. |

**V6.2 Algorithms** — default status: **Met**. Argon2id, AES-256-GCM with a random IV, HMAC-SHA1 only where TOTP requires it, SHA-256 for token hashes, and TLS; no custom cryptography.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 6.2.1 | Verify that all cryptographic modules fail securely, and errors are handled in a way that does not enable Padding Oracle attacks. | Met | AES-GCM authentication failures throw; no padding-oracle construction. |
| 6.2.2 | Verify that industry proven or government approved cryptographic algorithms, modes, and libraries are used, instead of custom coded cryptography. (C8) | Met | Standard library and vetted packages; no custom cipher. |
| 6.2.3 | Verify that encryption initialization vector, cipher configuration, and block modes are configured securely using the latest advice. | Met | AES-256-GCM with a random 12-byte IV; Argon2id parameters follow OWASP. |
| 6.2.4 | Verify that random number, encryption or hashing algorithms, key lengths, rounds, ciphers or modes, can be reconfigured, upgraded, or swapped at any time, to protect against cryptographic b… | Partial | Algorithms are hardcoded rather than configurable. |
| 6.2.5 | Verify that known insecure block modes (i.e. ECB, etc.), padding modes (i.e. PKCS#1 v1.5, etc.), ciphers with small block sizes (i.e. Triple-DES, Blowfish, etc.), and weak hashing algorithm… | Met | No ECB, PKCS#1 v1.5, Triple-DES, Blowfish or MD5. SHA-1 is used only for TOTP. |
| 6.2.6 | Verify that nonces, initialization vectors, and other single use numbers must not be used more than once with a given encryption key. The method of generation must be appropriate for the al… | Met | A fresh random IV is generated for each encryption. |

**V6.3 Random Values** — default status: **Partial**. Tokens and IVs use `randomBytes`/`randomUUID`; database identifiers use UUIDv7 rather than the ASVS-named v4, although the random portion is CSPRNG-generated.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 6.3.1 | Verify that all random numbers, random file names, random GUIDs, and random strings are generated using the cryptographic module's approved cryptographically secure random number generator… | Met | `randomBytes`/`randomUUID` from `node:crypto`. |
| 6.3.2 | Verify that random GUIDs are created using the GUID v4 algorithm, and a Cryptographically-secure Pseudo-random Number Generator (CSPRNG). GUIDs created using other pseudo-random number gene… | Partial | IDs use UUIDv7, not the ASVS-named v4, though the random portion is CSPRNG-generated. |

**V6.4 Secret Management** — default status: **Partial**. Environment variables keep secrets out of the repository, but there is no vault, no key isolation from the app, and no rotation process.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 6.4.1 | Verify that a secrets management solution such as a key vault is used to securely create, store, control access to and destroy secrets. (C8) | Partial | Environment variables only; no vault. |
| 6.4.2 | Verify that key material is not exposed to the application but instead uses an isolated security module like a vault for cryptographic operations. (C8) | Gap | The integration encryption key is exposed to the application process. |

## V7 Error Handling and Logging

*12 clauses: 7 met, 4 partial, 1 gap, 0 N/A.*

**V7.1 Log Content** — default status: **Partial**. Credentials are not logged, and auth/audit events exist, but emails appear in auth events and there is no remote protected log store.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 7.1.1 | Verify that the application does not log credentials or payment details. Session tokens should only be stored in logs in an irreversible, hashed form. (C9, C10) | Met | Passwords are never logged; session and recovery tokens are hashed before storage. |
| 7.1.2 | Verify that the application does not log other sensitive data as defined under local privacy laws or relevant security policy. (C9) | Partial | Auth events store email addresses; there is no formal sensitive-log policy. |
| 7.1.3 | Verify that the application logs security relevant events including successful and failed authentication events, access control failures, deserialization failures and input validation failu… | Partial | Auth failures are logged; access-control failures and input-validation failures are not consistently audited. |
| 7.1.4 | Verify that each log event includes necessary information that would allow for a detailed investigation of the timeline when an event happens. (C9) | Met | Auth events carry timestamp, kind, user/email, IP prefix, UA hash and detail. |

**V7.2 Log Processing** — default status: **Partial**. Authentication decisions are logged; access-control failures are generally returned without a dedicated audit record.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 7.2.1 | Verify that all authentication decisions are logged, without storing sensitive session tokens or passwords. This should include requests with relevant metadata needed for security investiga… | Met | Sign-in success/failure, TOTP failure, recovery use and session revocation are recorded. |
| 7.2.2 | Verify that all access control decisions can be logged and all failed decisions are logged. This should include requests with relevant metadata needed for security investigations. | Gap | Failed access-control decisions are not written to a dedicated audit log. |

**V7.3 Log Protection** — default status: **Partial**. Structured rows and UTC timestamps are used; logs live in the same database without WORM storage or a separate access boundary.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 7.3.1 | Verify that all logging components appropriately encode data to prevent log injection. (C9) | Partial | — |
| 7.3.3 | Verify that security logs are protected from unauthorized access and modification. (C9) | Partial | Rows are append-only by convention and RLS, but there is no WORM store or separate log access boundary. |
| 7.3.4 | Verify that time sources are synchronized to the correct time and time zone. Strongly consider logging only in UTC if systems are global to assist with post-incident forensic analysis. (C9) | Met | Database timestamps are UTC. |

**V7.4 Error Handling** — default status: **Met**. Unexpected errors return generic messages, the app has route-level error handling, and Next supplies a last-resort handler.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 7.4.1 | Verify that a generic message is shown when an unexpected or security sensitive error occurs, potentially with a unique ID which support personnel can use to investigate. (C10) | Met | — |
| 7.4.2 | Verify that exception handling (or a functional equivalent) is used across the codebase to account for expected and unexpected error conditions. (C10) | Met | — |
| 7.4.3 | Verify that a "last resort" error handler is defined which will catch all unhandled exceptions. (C10) | Met | Next's error boundary is the last-resort handler. |

## V8 Data Protection

*15 clauses: 5 met, 7 partial, 3 gap, 0 N/A.*

**V8.1 General Data Protection** — default status: **Partial**. Authenticated pages are dynamic and not CDN-cached, but there is no anomaly detection or alerting for abnormal request volumes.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 8.1.1 | Verify the application protects sensitive data from being cached in server components such as load balancers and application caches. | Partial | Authenticated pages are dynamic and not CDN-cached; API responses are not uniformly marked no-store. |
| 8.1.2 | Verify that all cached or temporary copies of sensitive data stored on the server are protected from unauthorized access or purged/invalidated after the authorized user accesses the sensiti… | Partial | No application-level temporary copies are kept, but the database and volume rely on platform access control. |
| 8.1.3 | Verify the application minimizes the number of parameters in a request, such as hidden fields, Ajax variables, cookies and header values. | Met | Requests carry only the fields the action needs. |
| 8.1.4 | Verify the application can detect and alert on abnormal numbers of requests, such as by IP, user, total per hour or day, or whatever makes sense for the application. | Gap | No anomaly detection or alerting for abnormal request volume. |

**V8.2 Client-side Data Protection** — default status: **Partial**. Only the theme choice is kept in browser storage, but anti-cache headers are not set explicitly on every authenticated response.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 8.2.1 | Verify the application sets sufficient anti-caching headers so that sensitive data is not cached in modern browsers. | Partial | Dynamic pages are not cached by the CDN, but explicit `Cache-Control: no-store` is not set on every authenticated response. |
| 8.2.2 | Verify that data stored in browser storage (such as localStorage, sessionStorage, IndexedDB, or cookies) does not contain sensitive data. | Met | Only the theme preference is stored in localStorage; no token or PII. |
| 8.2.3 | Verify that authenticated data is cleared from client storage, such as the browser DOM, after the client or session is terminated. | Met | Sign-out clears the session cookie; authenticated content is not persisted in browser storage. |

**V8.3 Sensitive Private Data** — default status: **Partial**. Sensitive values travel in bodies and cookies, and TLS protects them; there is no account-level export/delete, memory zeroing, or retention schedule for all PII, and access reads are not audited.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 8.3.1 | Verify that sensitive data is sent to the server in the HTTP message body or headers, and that query string parameters from any HTTP verb do not contain sensitive data. | Met | Sensitive values are in cookies or request bodies, not query strings. |
| 8.3.2 | Verify that users have a method to remove or export their data on demand. | Gap | No account-level export or delete; meeting delete exists but is not a complete data-subject path. |
| 8.3.3 | Verify that users are provided clear language regarding collection and use of supplied personal information and that users have provided opt-in consent for the use of that data before it is… | Partial | The privacy page explains collection and use, but sign-up does not record explicit opt-in consent. |
| 8.3.4 | Verify that all sensitive data created and processed by the application has been identified, and ensure that a policy is in place on how to deal with sensitive data. (C8) | Partial | Sensitive data is described, but no complete policy-to-control matrix exists. |
| 8.3.5 | Verify accessing sensitive data is audited (without logging the sensitive data itself), if the data is collected under relevant data protection directives or where logging of access is requ… | Partial | Writes are audited; sensitive reads are not. |
| 8.3.6 | Verify that sensitive information contained in memory is overwritten as soon as it is no longer required to mitigate memory dumping attacks, using zeroes or random data. | Gap | JavaScript cannot reliably zero memory; no explicit scrubbing is implemented. |
| 8.3.7 | Verify that sensitive or private information that is required to be encrypted, is encrypted using approved algorithms that provide both confidentiality and integrity. (C8) | Met | Integration tokens use AES-256-GCM; transport uses TLS. |
| 8.3.8 | Verify that sensitive personal information is subject to data retention classification, such that old or out of date data is deleted automatically, on a schedule, or as the situation requir… | Partial | Audio has a retention schedule; meetings, transcripts and tickets do not. |

## V9 Communication

*7 clauses: 3 met, 4 partial, 0 gap, 0 N/A.*

**V9.1 Client Communication Security** — default status: **Met**. The public origin and all provider calls use TLS 1.2/1.3; there is no HTTP fallback. See the securityheaders and ZAP evidence in `docs/reports/README.md`.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 9.1.1 | Verify that TLS is used for all client connectivity, and does not fall back to insecure or unencrypted communications. (C8) | Met | — |
| 9.1.2 | Verify using up to date TLS testing tools that only strong cipher suites are enabled, with the strongest cipher suites set as preferred. | Met | Railway terminates TLS 1.2/1.3 with strong suites; the repository does not configure ciphers. |
| 9.1.3 | Verify that only the latest recommended versions of the TLS protocol are enabled, such as TLS 1.2 and TLS 1.3. The latest version of the TLS protocol should be the preferred option. | Met | TLS 1.2/1.3 only at the Railway edge. |

**V9.2 Server Communication Security** — default status: **Partial**. Certificates are validated and TLS is used for all connections; OCSP stapling is a Railway edge setting and is not evidenced by this repository.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 9.2.1 | Verify that connections to and from the server use trusted TLS certificates. Where internally generated or self-signed certificates are used, the server must be configured to only trust spe… | Partial | — |
| 9.2.2 | Verify that encrypted communications such as TLS is used for all inbound and outbound connections, including for management ports, monitoring, authentication, API, or web service calls, dat… | Partial | — |
| 9.2.3 | Verify that all encrypted connections to external systems that involve sensitive information or functions are authenticated. | Partial | — |
| 9.2.4 | Verify that proper certification revocation, such as Online Certificate Status Protocol (OCSP) Stapling, is enabled and configured. | Partial | OCSP stapling is a Railway edge setting and is not evidenced here. |

## V10 Malicious Code

*5 clauses: 3 met, 1 partial, 0 gap, 1 N/A.*

**V10.2 Malicious Code Search** — default status: **Met**. No analytics, telemetry or phone-home code is present; microphone permission is requested only for the recorder and camera/geolocation are denied.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 10.2.1 | Verify that the application source code and third party libraries do not contain unauthorized phone home or data collection capabilities. Where such functionality exists, obtain the user's… | Met | — |
| 10.2.2 | Verify that the application does not ask for unnecessary or excessive permissions to privacy related features or sensors, such as contacts, cameras, microphones, or location. | Met | — |

**V10.3 Application Integrity** — default status: **Partial**. The web app loads no third-party code and has a nonce CSP, but the desktop updater is a placeholder with no signing key or update endpoint, and no subdomain-takeover inventory exists because there are no custom subdomains.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 10.3.1 | Verify that if the application has a client or server auto-update feature, updates should be obtained over secure channels and digitally signed. The update code must validate the digital si… | Partial | The desktop updater is a placeholder with no signing key or update endpoint; the web app has no auto-update. |
| 10.3.2 | Verify that the application employs integrity protections, such as code signing or subresource integrity. The application must not load or execute code from untrusted sources, such as loadi… | Met | No external scripts or CDN assets; CSP is nonce-based and same-origin. |
| 10.3.3 | Verify that the application has protection from subdomain takeovers if the application relies upon DNS entries or DNS subdomains, such as expired domain names, out of date DNS pointers or C… | N/A | The deployment uses a platform hostname, not custom subdomains. |

## V11 Business Logic

*8 clauses: 0 met, 5 partial, 3 gap, 0 N/A.*

**V11.1 Business Logic Security** — default status: **Partial**. The core flows are bounded by state and workspace checks, but there is no anti-automation on uploads/API calls, no per-user action limits, no anomaly alerting, and no formal threat-model-driven business limits.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 11.1.1 | Verify that the application will only process business logic flows for the same user in sequential step order and without skipping steps. | Partial | Upload and extraction flows are stateful, but there is no general out-of-order transition test. |
| 11.1.2 | Verify that the application will only process business logic flows with all steps being processed in realistic human time, i.e. transactions are not submitted too quickly. | Partial | No minimum-time or human-timing check. |
| 11.1.3 | Verify the application has appropriate limits for specific business actions or transactions which are correctly enforced on a per user basis. | Partial | Per-workspace caps exist, but no per-user action limits. |
| 11.1.4 | Verify that the application has anti-automation controls to protect against excessive calls such as mass data exfiltration, business logic requests, file uploads or denial of service attack… | Gap | No anti-automation on uploads, extraction or API calls. |
| 11.1.5 | Verify the application has business logic limits or validation to protect against likely business risks or threats, identified using threat modeling or similar methodologies. | Partial | Some limits exist (25 MB, 3 hours, 400k chars, 5/min sign-in), but no threat-model-driven business-limit register. |
| 11.1.6 | Verify that the application does not suffer from "Time Of Check to Time Of Use" (TOCTOU) issues or other race conditions for sensitive operations. | Partial | Transactions and unique constraints cover some races; no systematic TOCTOU review. |
| 11.1.7 | Verify that the application monitors for unusual events or activity from a business logic perspective. For example, attempts to perform actions out of order or actions which a normal user w… | Gap | No business-logic anomaly monitoring. |
| 11.1.8 | Verify that the application has configurable alerting when automated attacks or unusual activity is detected. | Gap | No configurable alerting for automated attacks. |

## V12 Files and Resources

*15 clauses: 11 met, 2 partial, 1 gap, 1 N/A.*

**V12.1 File Upload** — default status: **Partial**. Audio is capped at 25 MB (and 3 hours) and transcripts at 400,000 characters, but there is no per-user storage quota and compressed archives are not accepted.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.1.1 | Verify that the application will not accept large files that could fill up storage or cause a denial of service. | Met | 25 MB audio cap, 4 MB chunk cap, 400k transcript cap, 3-hour duration cap. |
| 12.1.2 | Verify that the application checks compressed files (e.g. zip, gz, docx, odt) against maximum allowed uncompressed size and against maximum number of files before uncompressing the file. | N/A | Compressed archives are not accepted. |
| 12.1.3 | Verify that a file size quota and maximum number of files per user is enforced to ensure that a single user cannot fill up the storage with too many files, or excessively large files. | Partial | Per-file caps are enforced; no per-user storage quota. |

**V12.2 File Integrity** — default status: **Met**. Audio type is decided by sniffing the first bytes, not by the client extension, and unsupported containers are rejected.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.2.1 | Verify that files obtained from untrusted sources are validated to be of expected type based on the file's content. | Met | — |

**V12.3 File Execution** — default status: **Met**. Stored names are generated; the client filename is not used as a path. Files are served with a fixed content type and no execution.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.3.1 | Verify that user-submitted filename metadata is not used directly by system or framework filesystems and that a URL API is used to protect against path traversal. | Met | — |
| 12.3.2 | Verify that user-submitted filename metadata is validated or ignored to prevent the disclosure, creation, updating or removal of local files (LFI). | Met | — |
| 12.3.3 | Verify that user-submitted filename metadata is validated or ignored to prevent the disclosure or execution of remote files via Remote File Inclusion (RFI) or Server-side Request Forgery (S… | Met | — |
| 12.3.4 | Verify that the application protects against Reflective File Download (RFD) by validating or ignoring user-submitted filenames in a JSON, JSONP, or URL parameter, the response Content-Type… | Met | Stored names are generated and audio is served with a fixed content type. |
| 12.3.5 | Verify that untrusted file metadata is not used directly with system API or libraries, to protect against OS command injection. | Met | — |
| 12.3.6 | Verify that the application does not include and execute functionality from untrusted sources, such as unverified content distribution networks, JavaScript libraries, node npm libraries, or… | Met | No untrusted CDN or dynamic code loading. |

**V12.4 File Storage** — default status: **Partial**. Files are stored on a Railway volume outside the web root and served only after authorization, but there is no antivirus scan.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.4.1 | Verify that files obtained from untrusted sources are stored outside the web root, with limited permissions. | Met | Audio lives on a Railway volume outside `.next`; only the authorized route reads it. |
| 12.4.2 | Verify that files obtained from untrusted sources are scanned by antivirus scanners to prevent upload and serving of known malicious content. | Gap | No antivirus scan. |

**V12.5 File Download** — default status: **Met**. Only the built Next assets and explicit routes are served; `.git`, `.env`, backups and source are not in the image, and uploads are never executed as HTML.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.5.1 | Verify that the web tier is configured to serve only files with specific file extensions to prevent unintentional information and source code leakage. For example, backup files (e.g. .bak),… | Met | The image contains only built assets and explicit routes; source and backups are excluded. |
| 12.5.2 | Verify that direct requests to uploaded files will never be executed as HTML/JavaScript content. | Met | Audio is served as `audio/*` or `application/octet-stream`, never as HTML. |

**V12.6 SSRF Protection** — default status: **Partial**. Outbound calls go to fixed provider endpoints, but there is no general network allow-list at the process or platform level.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 12.6.1 | Verify that the web or application server is configured with an allow list of resources or systems to which the server can send requests or load data/files from. | Partial | Provider endpoints are fixed, but there is no process-level egress allow-list. |

## V13 API and Web Service

*13 clauses: 5 met, 4 partial, 0 gap, 4 N/A.*

**V13.1 Generic Web Service Security** — default status: **Partial**. All API routes use the same session and workspace helpers, and URLs carry only opaque IDs. Content-type rejection is present on JSON endpoints but not uniformly enforced on every route.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 13.1.1 | Verify that all application components use the same encodings and parsers to avoid parsing attacks that exploit different URI or file parsing behavior that could be used in SSRF and RFI att… | Partial | — |
| 13.1.3 | Verify API URLs do not expose sensitive information, such as the API key, session tokens etc. | Partial | — |
| 13.1.4 | Verify that authorization decisions are made at both the URI, enforced by programmatic or declarative security at the controller or router, and at the resource level, enforced by model-base… | Partial | — |
| 13.1.5 | Verify that requests containing unexpected or missing content types are rejected with appropriate headers (HTTP response status 406 Unacceptable or 415 Unsupported Media Type). | Partial | JSON routes parse and reject bad bodies, but 406/415 is not uniformly enforced on every route. |

**V13.2 RESTful Web Service** — default status: **Met**. JSON is validated with Zod before use, cookie-bearing routes rely on SameSite plus server-action origin checks, and TLS protects payload integrity.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 13.2.1 | Verify that enabled RESTful HTTP methods are a valid choice for the user or action, such as preventing normal users using DELETE or PUT on protected API or resources. | Met | Only the methods each route exports are accepted; Next returns 405 for others. |
| 13.2.2 | Verify that JSON schema validation is in place and verified before accepting input. | Met | Zod validation before writes. |
| 13.2.3 | Verify that RESTful web services that utilize cookies are protected from Cross-Site Request Forgery via the use of at least one or more of the following: double submit cookie pattern, CSRF… | Met | SameSite=Lax cookies plus server-action origin checks. |
| 13.2.5 | Verify that REST services explicitly check the incoming Content-Type to be the expected one, such as application/xml or application/json. | Met | JSON routes check or parse the expected content type. |
| 13.2.6 | Verify that the message headers and payload are trustworthy and not modified in transit. Requiring strong encryption for transport (TLS only) may be sufficient in many cases as it provides… | Met | TLS provides transport integrity. |

**V13.3 SOAP Web Service** — default status: **N/A**. The API is JSON-only; no XML/XSD or WS-Security is used.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 13.3.1 | Verify that XSD schema validation takes place to ensure a properly formed XML document, followed by validation of each input field before any processing of that data takes place. | N/A | — |
| 13.3.2 | Verify that the message payload is signed using WS-Security to ensure reliable transport between client and service. | N/A | — |

**V13.4 GraphQL** — default status: **N/A**. There is no GraphQL or general data-layer expression endpoint.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 13.4.1 | Verify that a query allow list or a combination of depth limiting and amount limiting is used to prevent GraphQL or data layer expression Denial of Service (DoS) as a result of expensive, n… | N/A | — |
| 13.4.2 | Verify that GraphQL or other data layer authorization logic should be implemented at the business logic layer instead of the GraphQL layer. | N/A | — |

## V14 Configuration

*23 clauses: 12 met, 7 partial, 2 gap, 2 N/A.*

**V14.1 Build and Deploy** — default status: **Partial**. CI builds and typechecks the app and the Docker image is repeatable from a lockfile, but there is no infrastructure-as-code or native compiler hardening step.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 14.1.1 | Verify that the application build and deployment processes are performed in a secure and repeatable way, such as CI / CD automation, automated configuration management, and automated deploy… | Met | CI typechecks, runs suites, builds the image and exercises the HTTP matrix. |
| 14.1.2 | Verify that compiler flags are configured to enable all available buffer overflow protections and warnings, including stack randomization, data execution prevention, and to break the build… | N/A | The web app is JavaScript/TypeScript; no native compiler flags apply. |
| 14.1.3 | Verify that server configuration is hardened as per the recommendations of the application server and frameworks in use. | Partial | Next production defaults and a non-root container user are used, but no formal hardening checklist exists. |
| 14.1.4 | Verify that the application, configuration, and all dependencies can be re-deployed using automated deployment scripts, built from a documented and tested runbook in a reasonable time, or r… | Met | The Dockerfile and Railway runbook rebuild the app from the lockfile; restore drill covers the database. |

**V14.2 Dependency** — default status: **Partial**. Dependencies are locked and audited, but there is no generated SBOM, no external CDN assets requiring SRI, and third-party libraries run in-process rather than sandboxed.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 14.2.1 | Verify that all components are up to date, preferably using a dependency checker during build or compile time. (C2) | Partial | Dependabot and audits run in CI, but three `zip` advisories remain and are explicitly ignored by the cargo-audit gate, so the components are not all up to date. |
| 14.2.2 | Verify that all unneeded features, documentation, sample applications and configurations are removed. | Partial | No sample apps are shipped, but development dependencies and source maps are not audited for removal. |
| 14.2.3 | Verify that if application assets, such as JavaScript libraries, CSS or web fonts, are hosted externally on a Content Delivery Network (CDN) or external provider, Subresource Integrity (SRI… | N/A | No externally hosted assets. |
| 14.2.4 | Verify that third party components come from pre-defined, trusted and continually maintained repositories. (C2) | Met | Dependencies come from npm and crates.io via a lockfile. |
| 14.2.5 | Verify that a Software Bill of Materials (SBOM) is maintained of all third party libraries in use. (C2) | Gap | No generated SBOM is committed. |
| 14.2.6 | Verify that the attack surface is reduced by sandboxing or encapsulating third party libraries to expose only the required behaviour into the application. (C2) | Partial | Third-party Node libraries run in-process; no sandbox. |

**V14.3 Unintended Security Disclosure** — default status: **Met**. Production debug output is off, `poweredByHeader` is false, and responses do not advertise a framework version.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 14.3.2 | Verify that web or application server and application framework debug modes are disabled in production to eliminate debug features, developer consoles, and unintended security disclosures. | Met | Production build has no debug mode. |
| 14.3.3 | Verify that the HTTP headers or any part of the HTTP response do not expose detailed version information of system components. | Partial | `X-Powered-By` is removed, but `x-nextjs-*` cache headers reveal the framework (not its version). |

**V14.4 HTTP Security Headers** — default status: **Partial**. CSP, HSTS, nosniff, Referrer-Policy, frame-ancestors/X-Frame-Options and content types are present; JSON API responses do not set `Content-Disposition: attachment`.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 14.4.1 | Verify that every HTTP response contains a Content-Type header. Also specify a safe character set (e.g., UTF-8, ISO-8859-1) if the content types are text/*, /+xml and application/xml. Conte… | Met | Responses carry an explicit content type with UTF-8 for HTML/JSON. |
| 14.4.2 | Verify that all API responses contain a Content-Disposition: attachment; filename="api.json" header (or other appropriate filename for the content type). | Gap | JSON API responses do not set `Content-Disposition: attachment`. |
| 14.4.3 | Verify that a Content Security Policy (CSP) response header is in place that helps mitigate impact for XSS attacks like HTML, DOM, JSON, and JavaScript injection vulnerabilities. | Met | Per-request nonce CSP with `strict-dynamic`, `object-src 'none'` and `frame-ancestors 'none'`. |
| 14.4.4 | Verify that all responses contain a X-Content-Type-Options: nosniff header. | Met | `X-Content-Type-Options: nosniff` on every route. |
| 14.4.5 | Verify that a Strict-Transport-Security header is included on all responses and for all subdomains, such as Strict-Transport-Security: max-age=15724800; includeSubdomains. | Met | HSTS `max-age=31536000; includeSubDomains`. |
| 14.4.6 | Verify that a suitable Referrer-Policy header is included to avoid exposing sensitive information in the URL through the Referer header to untrusted parties. | Met | `Referrer-Policy: strict-origin-when-cross-origin`. |
| 14.4.7 | Verify that the content of a web application cannot be embedded in a third-party site by default and that embedding of the exact resources is only allowed where necessary by using suitable… | Met | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`. |

**V14.5 HTTP Request Header Validation** — default status: **Partial**. Next rejects unsupported methods and CORS is same-origin only, but method rejections are not alerted on and proxy-supplied forwarding headers are trusted for rate-limit prefixes.

| ID | Requirement (abridged) | Status | Evidence or gap |
| :--- | :--- | :--- | :--- |
| 14.5.1 | Verify that the application server only accepts the HTTP methods in use by the application/API, including pre-flight OPTIONS, and logs/alerts on any requests that are not valid for the appl… | Partial | Next returns 405 for unsupported methods, but there is no alert on them. |
| 14.5.2 | Verify that the supplied Origin header is not used for authentication or access control decisions, as the Origin header can easily be changed by an attacker. | Met | Origin is used only as a CSRF signal, never as an authentication decision. |
| 14.5.3 | Verify that the Cross-Origin Resource Sharing (CORS) Access-Control-Allow-Origin header uses a strict allow list of trusted domains and subdomains to match against and does not support the… | Met | No CORS headers are emitted; the app is same-origin. |
| 14.5.4 | Verify that HTTP headers added by a trusted proxy or SSO devices, such as a bearer token, are authenticated by the application. | Partial | `X-Forwarded-For` is trusted for rate-limit prefixes; it is not used for authentication. |

## What would change this result

The highest-value fixes, in order, are:

1. Add a change-password and a forgotten-password flow that uses a single-use,
   expiring token and revokes other sessions.
2. Encrypt TOTP secrets with the existing integration key (or a dedicated key),
   and record the accepted TOTP step to reject replay.
3. Salt and stretch recovery codes, or issue 112-bit codes.
4. Require a second factor for owner/admin settings, or at minimum a fresh
   password confirmation.
5. Add a per-user upload quota and an antivirus hook for stored audio.
6. Add access-control failure logging and a simple alert on repeated 403/404
   probes.

Until those are done, the honest description is **"ASVS 4.0.3 L2 screening
complete; not compliant."** Do not put an ASVS certification mark on this
project.

---

*Reviewed 22 October 2026 against ASVS 4.0.3. Requirement text is abridged;
the official text controls. This is a self-assessment, not a certification.*
