# ZAP Scanning Report

ZAP by [Checkmarx](https://checkmarx.com/).


## Summary of Alerts

| Risk Level | Number of Alerts |
| --- | --- |
| High | 0 |
| Medium | 2 |
| Low | 1 |
| Informational | 8 |




## Insights

| Level | Reason | Site | Description | Statistic |
| --- | --- | --- | --- | --- |
| Low | Warning |  | ZAP warnings logged - see the zap.log file for details | 1    |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of responses with status code 2xx | 90 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of responses with status code 3xx | 9 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type application/javascript | 42 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type application/manifest+json | 2 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type application/xml | 2 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type font/woff2 | 5 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type image/png | 5 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type text/css | 2 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type text/html | 32 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with content type text/plain | 2 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with method GET | 92 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of endpoints with method POST | 7 % |
| Info | Informational | https://prepo-web-production.up.railway.app | Count of total endpoints | 40    |
| Info | Informational | https://prepo-web-production.up.railway.app | Percentage of slow responses | 100 % |







## Alerts

| Name | Risk Level | Number of Instances |
| --- | --- | --- |
| Absence of Anti-CSRF Tokens | Medium | Systemic |
| CSP: style-src unsafe-inline | Medium | Systemic |
| Big Redirect Detected (Potential Sensitive Information Leak) | Low | 2 |
| Authentication Request Identified | Informational | 2 |
| Content-Type Header Missing | Informational | 2 |
| Modern Web Application | Informational | 4 |
| Non-Storable Content | Informational | Systemic |
| Re-examine Cache-control Directives | Informational | 3 |
| Storable and Cacheable Content | Informational | 2 |
| Storable but Non-Cacheable Content | Informational | 5 |
| User Controllable HTML Element Attribute (Potential XSS) | Informational | 10 |




## Alert Detail



### [ Absence of Anti-CSRF Tokens ](https://www.zaproxy.org/docs/alerts/10202/)



##### Medium (Low)

### Description

No Anti-CSRF tokens were found in a HTML submission form.
A cross-site request forgery is an attack that involves forcing a victim to send an HTTP request to a target destination without their knowledge or intent in order to perform an action as the victim. The underlying cause is application functionality using predictable URL/form actions in a repeatable way. The nature of the attack is that CSRF exploits the trust that a web site has for a user. By contrast, cross-site scripting (XSS) exploits the trust that a user has for a web site. Like XSS, CSRF attacks are not necessarily cross-site, but they can be. Cross-site request forgery is also known as CSRF, XSRF, one-click attack, session riding, confused deputy, and sea surf.

CSRF attacks are effective in a number of situations, including:
    * The victim has an active session on the target site.
    * The victim is authenticated via HTTP auth on the target site.
    * The victim is on the same local network as the target site.

CSRF has primarily been used to perform an action against a target site using the victim's privileges, but recent techniques have been discovered to disclose information by gaining access to the response. The risk of information disclosure is dramatically increased when the target site is vulnerable to XSS, because XSS can be used as a platform for CSRF, allowing the attack to operate within the bounds of the same-origin policy.

* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<form class="space-y-4" action="" encType="multipart/form-data" method="POST">`
  * Other Info: `No known Anti-CSRF token [anticsrf, CSRFToken, __RequestVerificationToken, csrfmiddlewaretoken, authenticity_token, OWASP_CSRFTOKEN, anoncsrf, csrf_token, _csrf, _csrfSecret, __csrf_magic, CSRF, _token, _csrf_token, _csrfToken] was found in the following HTML form: [Form 1: "$ACTION_1:0" "$ACTION_1:1" "$ACTION_KEY" "$ACTION_REF_1" "email" "next" "password" ].`
* URL: https://prepo-web-production.up.railway.app/sign-in
  * Node Name: `https://prepo-web-production.up.railway.app/sign-in`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<form class="space-y-4" action="" encType="multipart/form-data" method="POST">`
  * Other Info: `No known Anti-CSRF token [anticsrf, CSRFToken, __RequestVerificationToken, csrfmiddlewaretoken, authenticity_token, OWASP_CSRFTOKEN, anoncsrf, csrf_token, _csrf, _csrfSecret, __csrf_magic, CSRF, _token, _csrf_token, _csrfToken] was found in the following HTML form: [Form 1: "$ACTION_1:0" "$ACTION_1:1" "$ACTION_KEY" "$ACTION_REF_1" "email" "password" ].`
* URL: https://prepo-web-production.up.railway.app/sign-up
  * Node Name: `https://prepo-web-production.up.railway.app/sign-up`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<form class="space-y-4" action="" encType="multipart/form-data" method="POST">`
  * Other Info: `No known Anti-CSRF token [anticsrf, CSRFToken, __RequestVerificationToken, csrfmiddlewaretoken, authenticity_token, OWASP_CSRFTOKEN, anoncsrf, csrf_token, _csrf, _csrfSecret, __csrf_magic, CSRF, _token, _csrf_token, _csrfToken] was found in the following HTML form: [Form 1: "$ACTION_1:0" "$ACTION_1:1" "$ACTION_KEY" "$ACTION_REF_1" "email" "name" "password" "timezone" ].`
* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<form class="space-y-4" action="" encType="multipart/form-data" method="POST">`
  * Other Info: `No known Anti-CSRF token [anticsrf, CSRFToken, __RequestVerificationToken, csrfmiddlewaretoken, authenticity_token, OWASP_CSRFTOKEN, anoncsrf, csrf_token, _csrf, _csrfSecret, __csrf_magic, CSRF, _token, _csrf_token, _csrfToken] was found in the following HTML form: [Form 1: "$ACTION_1:0" "$ACTION_1:1" "$ACTION_KEY" "$ACTION_REF_1" "email" "next" "password" ].`
* URL: https://prepo-web-production.up.railway.app/sign-up
  * Node Name: `https://prepo-web-production.up.railway.app/sign-up ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,name,password,timezone)`
  * Method: `POST`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<form class="space-y-4" action="" encType="multipart/form-data" method="POST">`
  * Other Info: `No known Anti-CSRF token [anticsrf, CSRFToken, __RequestVerificationToken, csrfmiddlewaretoken, authenticity_token, OWASP_CSRFTOKEN, anoncsrf, csrf_token, _csrf, _csrfSecret, __csrf_magic, CSRF, _token, _csrf_token, _csrfToken] was found in the following HTML form: [Form 1: "$ACTION_1:0" "$ACTION_1:1" "$ACTION_KEY" "$ACTION_REF_1" "email" "name" "password" "timezone" ].`

Instances: Systemic


### Solution

Phase: Architecture and Design
Use a vetted library or framework that does not allow this weakness to occur or provides constructs that make this weakness easier to avoid.
For example, use anti-CSRF packages such as the OWASP CSRFGuard.

Phase: Implementation
Ensure that your application is free of cross-site scripting issues, because most CSRF defenses can be bypassed using attacker-controlled script.

Phase: Architecture and Design
Generate a unique nonce for each form, place the nonce into the form, and verify the nonce upon receipt of the form. Be sure that the nonce is not predictable (CWE-330).
Note that this can be bypassed using XSS.

Identify especially dangerous operations. When the user performs a dangerous operation, send a separate confirmation request to ensure that the user intended to perform that operation.
Note that this can be bypassed using XSS.

Use the ESAPI Session Management control.
This control includes a component for CSRF.

Do not use the GET method for any request that triggers a state change.

Phase: Implementation
Check the HTTP Referer header to see if the request originated from an expected page. This could break legitimate functionality, because users or proxies may have disabled sending the Referer for privacy reasons.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
* [ https://cwe.mitre.org/data/definitions/352.html ](https://cwe.mitre.org/data/definitions/352.html)


#### CWE Id: [ 352 ](https://cwe.mitre.org/data/definitions/352.html)


#### WASC Id: 9

#### Source ID: 3

### [ CSP: style-src unsafe-inline ](https://www.zaproxy.org/docs/alerts/10055/)



##### Medium (High)

### Description

Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks. Including (but not limited to) Cross Site Scripting (XSS), and data injection attacks. These attacks are used for everything from data theft to site defacement or distribution of malware. CSP provides a set of standard HTTP headers that allow website owners to declare approved sources of content that browsers should be allowed to load on that page — covered types are JavaScript, CSS, HTML frames, fonts, images and embeddable objects such as Java applets, ActiveX, audio and video files.

* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'nonce-ZjYyNTdlNTctMTE2OS00OTEwLWJiYTktZWU3YjU0OTQyMjQw' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://prepo-web-production.up.railway.app/download
  * Node Name: `https://prepo-web-production.up.railway.app/download`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'nonce-ZDBlMTA0MGEtNGI0OS00YWU4LWIyOTgtYTA1YWRjZWNlMTdi' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://prepo-web-production.up.railway.app/privacy
  * Node Name: `https://prepo-web-production.up.railway.app/privacy`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'nonce-YWE2NTJhMGQtMTZiMC00ZTFhLWIwMGItNzYyYTIxNjJiYjUz' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://prepo-web-production.up.railway.app/security
  * Node Name: `https://prepo-web-production.up.railway.app/security`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'nonce-YjNjZjYwMGMtNmU4Ni00MzI3LTliYjAtZjYwYjgwNTVmNTdh' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`
* URL: https://prepo-web-production.up.railway.app/terms
  * Node Name: `https://prepo-web-production.up.railway.app/terms`
  * Method: `GET`
  * Parameter: `content-security-policy`
  * Attack: ``
  * Evidence: `default-src 'self'; script-src 'self' 'nonce-YzY0Y2QyOGYtODJiNy00MjQxLTliMDEtYzY0YzkxM2EwYmM0' 'strict-dynamic'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`
  * Other Info: `style-src includes unsafe-inline.`

Instances: Systemic


### Solution

Ensure that your web server, application server, load balancer, etc. is properly configured to set the Content-Security-Policy header.

### Reference


* [ https://www.w3.org/TR/CSP/ ](https://www.w3.org/TR/CSP/)
* [ https://caniuse.com/#search=content+security+policy ](https://caniuse.com/#search=content+security+policy)
* [ https://content-security-policy.com/ ](https://content-security-policy.com/)
* [ https://github.com/HtmlUnit/htmlunit-csp ](https://github.com/HtmlUnit/htmlunit-csp)
* [ https://web.dev/articles/csp#resource-options ](https://web.dev/articles/csp#resource-options)


#### CWE Id: [ 693 ](https://cwe.mitre.org/data/definitions/693.html)


#### WASC Id: 15

#### Source ID: 3

### [ Big Redirect Detected (Potential Sensitive Information Leak) ](https://www.zaproxy.org/docs/alerts/10044/)



##### Low (Medium)

### Description

The server has responded with a redirect that seems to provide a large response. This may indicate that although the server sent a redirect it also responded with body content (which may include sensitive details, PII, etc.).

* URL: https://prepo-web-production.up.railway.app/api
  * Node Name: `https://prepo-web-production.up.railway.app/api`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `Location header URI length: 8 [/sign-in].
Predicted response size: 308.
Response Body Length: 22,097.`
* URL: https://prepo-web-production.up.railway.app/r
  * Node Name: `https://prepo-web-production.up.railway.app/r`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: ``
  * Other Info: `Location header URI length: 8 [/sign-in].
Predicted response size: 308.
Response Body Length: 22,093.`


Instances: 2

### Solution

Ensure that no sensitive information is leaked via redirect responses. Redirect responses should have almost no content.

### Reference



#### CWE Id: [ 201 ](https://cwe.mitre.org/data/definitions/201.html)


#### WASC Id: 13

#### Source ID: 3

### [ Authentication Request Identified ](https://www.zaproxy.org/docs/alerts/10111/)



##### Informational (Low)

### Description

The given request has been identified as an authentication request. The 'Other Info' field contains a set of key=value lines which identify any relevant fields. If the request is in a context which has an Authentication Method set to "Auto-Detect" then this rule will change the authentication to match the request identified.

* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: `email`
  * Attack: ``
  * Evidence: `password`
  * Other Info: `userParam=email
userValue=zaproxy@example.com
passwordParam=password
referer=https://prepo-web-production.up.railway.app/demo`
* URL: https://prepo-web-production.up.railway.app/sign-in
  * Node Name: `https://prepo-web-production.up.railway.app/sign-in ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,password)`
  * Method: `POST`
  * Parameter: `email`
  * Attack: ``
  * Evidence: `password`
  * Other Info: `userParam=email
userValue=zaproxy@example.com
passwordParam=password
referer=https://prepo-web-production.up.railway.app/sign-in`


Instances: 2

### Solution

This is an informational alert rather than a vulnerability and so there is nothing to fix.

### Reference


* [ https://www.zaproxy.org/docs/desktop/addons/authentication-helper/auth-req-id/ ](https://www.zaproxy.org/docs/desktop/addons/authentication-helper/auth-req-id/)



#### Source ID: 3

### [ Content-Type Header Missing ](https://www.zaproxy.org/docs/alerts/10019/)



##### Informational (Medium)

### Description

The Content-Type header was either missing or empty.

* URL: https://prepo-web-production.up.railway.app/api/
  * Node Name: `https://prepo-web-production.up.railway.app/api/`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/r/
  * Node Name: `https://prepo-web-production.up.railway.app/r/`
  * Method: `GET`
  * Parameter: `content-type`
  * Attack: ``
  * Evidence: ``
  * Other Info: ``


Instances: 2

### Solution

Ensure each page is setting the specific and appropriate content-type value for the content being delivered.

### Reference


* [ https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85) ](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/compatibility/gg622941(v=vs.85))


#### CWE Id: [ 345 ](https://cwe.mitre.org/data/definitions/345.html)


#### WASC Id: 12

#### Source ID: 3

### [ Modern Web Application ](https://www.zaproxy.org/docs/alerts/10109/)



##### Informational (Medium)

### Description

The application appears to be a modern web application. If you need to explore it automatically then the Client Spider may well be more effective than the standard one.

* URL: https://prepo-web-production.up.railway.app
  * Node Name: `https://prepo-web-production.up.railway.app`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<a href="#" class="flex items-center gap-2"><span class="grid size-7 place-items-center rounded-1 bg-accent text-sm font-semibold text-accent-fg">P</span><span class="text-lg font-semibold tracking-tight">Prepo</span></a>`
  * Other Info: `Links have been found that do not have traditional href attributes, which is an indication that this is a modern web application.`
* URL: https://prepo-web-production.up.railway.app/
  * Node Name: `https://prepo-web-production.up.railway.app/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<a href="#" class="flex items-center gap-2"><span class="grid size-7 place-items-center rounded-1 bg-accent text-sm font-semibold text-accent-fg">P</span><span class="text-lg font-semibold tracking-tight">Prepo</span></a>`
  * Other Info: `Links have been found that do not have traditional href attributes, which is an indication that this is a modern web application.`
* URL: https://prepo-web-production.up.railway.app/api
  * Node Name: `https://prepo-web-production.up.railway.app/api`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/103yvmnpk10ct.js" async="" nonce="OGRjNGQzZWYtZGZkMy00ZWMzLTk3NGYtNzQwYjQwNDdlYWQy"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`
* URL: https://prepo-web-production.up.railway.app/r
  * Node Name: `https://prepo-web-production.up.railway.app/r`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `<script src="/_next/static/chunks/103yvmnpk10ct.js" async="" nonce="ZDA0MTg0NTUtNTdkYi00M2Q2LTgwNTMtZTdlMzNiZTIwNDRh"></script>`
  * Other Info: `No links have been found while there are scripts, which is an indication that this is a modern web application.`


Instances: 4

### Solution

This is an informational alert and so no changes are required.

### Reference




#### Source ID: 3

### [ Non-Storable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are not storable by caching components such as proxy servers. If the response does not contain sensitive, personal or user-specific information, it may benefit from being stored and cached, to improve performance.

* URL: https://prepo-web-production.up.railway.app/api/
  * Node Name: `https://prepo-web-production.up.railway.app/api/`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `308`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/privacy
  * Node Name: `https://prepo-web-production.up.railway.app/privacy`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/security
  * Node Name: `https://prepo-web-production.up.railway.app/security`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/terms
  * Node Name: `https://prepo-web-production.up.railway.app/terms`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `no-store`
  * Other Info: ``

Instances: Systemic


### Solution

The content may be marked as storable by ensuring that the following conditions are satisfied:
The request method must be understood by the cache and defined as being cacheable ("GET", "HEAD", and "POST" are currently defined as cacheable)
The response status code must be understood by the cache (one of the 1XX, 2XX, 3XX, 4XX, or 5XX response classes are generally understood)
The "no-store" cache directive must not appear in the request or response header fields
For caching by "shared" caches such as "proxy" caches, the "private" response directive must not appear in the response
For caching by "shared" caches such as "proxy" caches, the "Authorization" header field must not appear in the request, unless the response explicitly allows it (using one of the "must-revalidate", "public", or "s-maxage" Cache-Control response directives)
In addition to the conditions above, at least one of the following conditions must also be satisfied by the response:
It must contain an "Expires" header field
It must contain a "max-age" response directive
For "shared" caches such as "proxy" caches, it must contain a "s-maxage" response directive
It must contain a "Cache Control Extension" that allows it to be cached
It must have a status code that is defined as cacheable by default (200, 203, 204, 206, 300, 301, 404, 405, 410, 414, 501).

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ Re-examine Cache-control Directives ](https://www.zaproxy.org/docs/alerts/10015/)



##### Informational (Low)

### Description

The cache-control header has not been set properly or is missing, allowing the browser and proxies to cache content. For static assets like css, js, or image files this might be intended, however, the resources should be reviewed to ensure that no sensitive content will be cached.

* URL: https://prepo-web-production.up.railway.app/manifest.webmanifest
  * Node Name: `https://prepo-web-production.up.railway.app/manifest.webmanifest`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: `public, max-age=0, must-revalidate`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/robots.txt
  * Node Name: `https://prepo-web-production.up.railway.app/robots.txt`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: `public, max-age=0, must-revalidate`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/sitemap.xml
  * Node Name: `https://prepo-web-production.up.railway.app/sitemap.xml`
  * Method: `GET`
  * Parameter: `cache-control`
  * Attack: ``
  * Evidence: `public, max-age=0, must-revalidate`
  * Other Info: ``


Instances: 3

### Solution

For secure content, ensure the cache-control HTTP header is set with "no-cache, no-store, must-revalidate". If an asset should be cached consider setting the directives "public, max-age, immutable".

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching ](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html#web-content-caching)
* [ https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control ](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
* [ https://grayduck.mn/2021/09/13/cache-control-recommendations/ ](https://grayduck.mn/2021/09/13/cache-control-recommendations/)


#### CWE Id: [ 525 ](https://cwe.mitre.org/data/definitions/525.html)


#### WASC Id: 13

#### Source ID: 3

### [ Storable and Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, and may be retrieved directly from the cache, rather than from the origin server by the caching servers, in response to similar requests from other users. If the response data is sensitive, personal or user-specific, this may result in sensitive information being leaked. In some cases, this may even result in a user gaining complete control of the session of another user, depending on the configuration of the caching components in use in their environment. This is primarily an issue where "shared" caching servers such as "proxy" caches are configured on the local network. This configuration is typically found in corporate or educational environments, for instance.

* URL: https://prepo-web-production.up.railway.app/_next/static/chunks/0n97w5q-93n-g.js
  * Node Name: `https://prepo-web-production.up.railway.app/_next/static/chunks/0n97w5q-93n-g.js`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/_next/static/media/GeistMono_Variable.p.074yowjdp83r3.woff2
  * Node Name: `https://prepo-web-production.up.railway.app/_next/static/media/GeistMono_Variable.p.074yowjdp83r3.woff2`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=31536000`
  * Other Info: ``


Instances: 2

### Solution

Validate that the response does not contain sensitive, personal or user-specific information. If it does, consider the use of the following HTTP response headers, to limit, or prevent the content being stored and retrieved from the cache by another user:
Cache-Control: no-cache, no-store, must-revalidate, private
Pragma: no-cache
Expires: 0
This configuration directs both HTTP 1.0 and HTTP 1.1 compliant caching servers to not store the response, and to not retrieve the response (without validation) from the cache, in response to a similar request.

### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ Storable but Non-Cacheable Content ](https://www.zaproxy.org/docs/alerts/10049/)



##### Informational (Medium)

### Description

The response contents are storable by caching components such as proxy servers, but will not be retrieved directly from the cache, without validating the request upstream, in response to similar requests from other users.

* URL: https://prepo-web-production.up.railway.app/apple-icon.png%3Fapple-icon.347n4pit3hsug.png
  * Node Name: `https://prepo-web-production.up.railway.app/apple-icon.png (apple-icon.347n4pit3hsug.png)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=0`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/icon.png%3Ficon.0l92qu4ph41dv.png
  * Node Name: `https://prepo-web-production.up.railway.app/icon.png (icon.0l92qu4ph41dv.png)`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=0`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/manifest.webmanifest
  * Node Name: `https://prepo-web-production.up.railway.app/manifest.webmanifest`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=0`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/robots.txt
  * Node Name: `https://prepo-web-production.up.railway.app/robots.txt`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=0`
  * Other Info: ``
* URL: https://prepo-web-production.up.railway.app/sitemap.xml
  * Node Name: `https://prepo-web-production.up.railway.app/sitemap.xml`
  * Method: `GET`
  * Parameter: ``
  * Attack: ``
  * Evidence: `max-age=0`
  * Other Info: ``


Instances: 5

### Solution



### Reference


* [ https://datatracker.ietf.org/doc/html/rfc7234 ](https://datatracker.ietf.org/doc/html/rfc7234)
* [ https://datatracker.ietf.org/doc/html/rfc7231 ](https://datatracker.ietf.org/doc/html/rfc7231)
* [ https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html ](https://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html)


#### CWE Id: [ 524 ](https://cwe.mitre.org/data/definitions/524.html)


#### WASC Id: 13

#### Source ID: 3

### [ User Controllable HTML Element Attribute (Potential XSS) ](https://www.zaproxy.org/docs/alerts/10031/)



##### Informational (Low)

### Description

This check looks at user-supplied input in query string parameters and POST data to identify where certain HTML attribute values might be controlled. This provides hot-spot detection for XSS (cross-site scripting) that will require further review by a security analyst to determine exploitability.

* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: `$ACTION_1:0`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/demo

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:0={"id":"60786b9c6e3e19c79b5e930688d4b1b0c563b038cc","bound":"$@1"}

The user-controlled value was:
{"id":"60786b9c6e3e19c79b5e930688d4b1b0c563b038cc","bound":"$@1"}`
* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: `$ACTION_1:1`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/demo

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:1=[{"stage":"credentials","error":null}]

The user-controlled value was:
[{"stage":"credentials","error":null}]`
* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: `$ACTION_KEY`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/demo

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_KEY=<redacted>

The user-controlled value was:
k6f0f9e5eb83acfef759bcddb6ae341f9`
* URL: https://prepo-web-production.up.railway.app/demo
  * Node Name: `https://prepo-web-production.up.railway.app/demo ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,next,password)`
  * Method: `POST`
  * Parameter: `next`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/demo

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
next=/northwind

The user-controlled value was:
/northwind`
* URL: https://prepo-web-production.up.railway.app/sign-in
  * Node Name: `https://prepo-web-production.up.railway.app/sign-in ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,password)`
  * Method: `POST`
  * Parameter: `$ACTION_1:0`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-in

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:0={"id":"60786b9c6e3e19c79b5e930688d4b1b0c563b038cc","bound":"$@1"}

The user-controlled value was:
{"id":"60786b9c6e3e19c79b5e930688d4b1b0c563b038cc","bound":"$@1"}`
* URL: https://prepo-web-production.up.railway.app/sign-in
  * Node Name: `https://prepo-web-production.up.railway.app/sign-in ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,password)`
  * Method: `POST`
  * Parameter: `$ACTION_1:1`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-in

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:1=[{"stage":"credentials","error":null}]

The user-controlled value was:
[{"stage":"credentials","error":null}]`
* URL: https://prepo-web-production.up.railway.app/sign-in
  * Node Name: `https://prepo-web-production.up.railway.app/sign-in ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,password)`
  * Method: `POST`
  * Parameter: `$ACTION_KEY`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-in

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_KEY=<redacted>

The user-controlled value was:
ka8407af41aebfe1a6aa1dd0cb1776317`
* URL: https://prepo-web-production.up.railway.app/sign-up
  * Node Name: `https://prepo-web-production.up.railway.app/sign-up ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,name,password,timezone)`
  * Method: `POST`
  * Parameter: `$ACTION_1:0`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-up

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:0={"id":"60da8e77b8c74c83f2743877d7f2485c6ffad72cb2","bound":"$@1"}

The user-controlled value was:
{"id":"60da8e77b8c74c83f2743877d7f2485c6ffad72cb2","bound":"$@1"}`
* URL: https://prepo-web-production.up.railway.app/sign-up
  * Node Name: `https://prepo-web-production.up.railway.app/sign-up ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,name,password,timezone)`
  * Method: `POST`
  * Parameter: `$ACTION_1:1`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-up

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_1:1=[null]

The user-controlled value was:
[null]`
* URL: https://prepo-web-production.up.railway.app/sign-up
  * Node Name: `https://prepo-web-production.up.railway.app/sign-up ()($ACTION_1:0,$ACTION_1:1,$ACTION_KEY,$ACTION_REF_1,email,name,password,timezone)`
  * Method: `POST`
  * Parameter: `$ACTION_KEY`
  * Attack: ``
  * Evidence: ``
  * Other Info: `User-controlled HTML attribute values were found. Try injecting special characters to see if XSS might be possible. The page at the following URL:

https://prepo-web-production.up.railway.app/sign-up

appears to include user input in:
a(n) [input] tag [value] attribute

The user input found was:
$ACTION_KEY=<redacted>

The user-controlled value was:
kdf951b67fd3f9ff187e79ddf3a5fa576`


Instances: 10

### Solution

Validate all input and sanitize output it before writing to any HTML attributes.

### Reference


* [ https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html ](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)


#### CWE Id: [ 20 ](https://cwe.mitre.org/data/definitions/20.html)


#### WASC Id: 20

#### Source ID: 3


