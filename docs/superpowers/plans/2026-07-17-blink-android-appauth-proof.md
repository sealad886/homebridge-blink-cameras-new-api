# Blink Android AppAuth Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans`.
> Execution state is tracked only in Beads issue
> `homebridge-blinkcameras-r7d`; numbered steps avoid a duplicate Markdown task
> tracker prohibited by this repository.

**Goal:** Build, validate, and run a secret-blind Android AppAuth probe that
isolates same-device Blink authorization and token exchange.

**Architecture:** A unique Java Android application under git-ignored `logs/`
uses AppAuth 0.11.1 with its default browser and connection behavior. Pure Java
profile/outcome classes carry testable logic; `MainActivity` only coordinates
AppAuth and displays a closed outcome enum. A Node verifier checks source,
manifest, and APK safety invariants before installation.

**Tech Stack:** Java 17, Android SDK 36, AGP 8.11.0, Gradle 8.14.3, AppAuth
0.11.1, JUnit 4.13.2, Node.js static verification, ADB.

## Global Constraints

- Application ID: `com.sealad886.blinkoauthprobe`.
- Harness root: `logs/blink-oauth-appauth-harness/`; all contents remain
  git-ignored and outside npm packaging.
- Authorize endpoint: `https://api.oauth.blink.com/oauth/v2/authorize`.
- Token endpoint: `https://api.oauth.blink.com/oauth/token`.
- Redirect: `https://applinks.blink.com/signin/callback`.
- Client ID: exact manufacturer equality `Amazon` selects `amazon`; every other
  value selects `android`.
- AppAuth owns state, PKCE generation, callback parsing, and token request
  creation; no custom connection builder.
- Never emit or persist authorization query values, callback parameters, state,
  verifier/challenge, code, tokens, response JSON, upstream descriptions,
  account identifiers, device identifiers, or certificate fingerprints.
- Only the harmless generated hardware UUID may persist in private preferences.
- No `Log.*`, WebView, `AuthState` persistence, custom callback scheme, Blink
  package replacement, official Blink data clearing, or broad login-time
  `logcat`.
- CAPTCHA handling remains a human action-time confirmation boundary.

---

### Task 1: Create the Gradle scaffold and prove profile tests fail

**Files:**

- Create: `logs/blink-oauth-appauth-harness/settings.gradle`
- Create: `logs/blink-oauth-appauth-harness/build.gradle`
- Create: `logs/blink-oauth-appauth-harness/gradle.properties`
- Create: `logs/blink-oauth-appauth-harness/app/build.gradle`
- Create: `logs/blink-oauth-appauth-harness/app/src/test/java/com/sealad886/blinkoauthprobe/BlinkOAuthProfileTest.java`
- Create: `logs/blink-oauth-appauth-harness/app/src/test/java/com/sealad886/blinkoauthprobe/ProbeOutcomeTest.java`

**Interfaces:**

- Consumes: locally cached AGP 8.11.0 and Gradle 8.14.3.
- Produces: failing tests for `BlinkOAuthProfile` and `ProbeOutcome`.

1. Create `settings.gradle` with only Google and Maven Central repositories:

```groovy
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = 'BlinkOAuthProbe'
include ':app'
```

2. Create root `build.gradle`:

```groovy
plugins {
    id 'com.android.application' version '8.11.0' apply false
}
```

3. Create `gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx1536m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.nonTransitiveRClass=true
```

4. Create `app/build.gradle`:

```groovy
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.sealad886.blinkoauthprobe'
    compileSdk 36

    defaultConfig {
        applicationId 'com.sealad886.blinkoauthprobe'
        minSdk 23
        targetSdk 36
        versionCode 1
        versionName '1.0'
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'net.openid:appauth:0.11.1'
    testImplementation 'junit:junit:4.13.2'
}
```

5. Write `BlinkOAuthProfileTest` before its production class. Assert:

```java
assertEquals("amazon", BlinkOAuthProfile.clientIdForManufacturer("Amazon"));
assertEquals("android", BlinkOAuthProfile.clientIdForManufacturer("amazon"));
assertEquals("android", BlinkOAuthProfile.clientIdForManufacturer("Google"));
assertEquals("android", BlinkOAuthProfile.clientIdForManufacturer(null));
assertEquals("https://api.oauth.blink.com/oauth/v2/authorize",
        BlinkOAuthProfile.AUTHORIZATION_ENDPOINT);
assertEquals("https://api.oauth.blink.com/oauth/token",
        BlinkOAuthProfile.TOKEN_ENDPOINT);
assertEquals("https://applinks.blink.com/signin/callback",
        BlinkOAuthProfile.REDIRECT_URI);
```

Add a metadata test using brand `google`, model `Tablet`, release `15`, hardware
ID `00000000-0000-0000-0000-000000000000`, and dark mode `false`. Assert the
map equals exactly:

```java
Map.of(
    "hardware_id", "00000000-0000-0000-0000-000000000000",
    "app_brand", "blink",
    "device_brand", "Google",
    "device_model", "Tablet",
    "device_os_version", "Android 15",
    "app_version", "Version 57.1",
    "dark_mode", "false"
)
```

6. Write `ProbeOutcomeTest` before its production enum. Assert:

```java
assertEquals(ProbeOutcome.TOKEN_SUCCESS_ACCESS_AND_REFRESH,
        ProbeOutcome.classifyToken(true, true, null, false));
assertEquals(ProbeOutcome.TOKEN_SUCCESS_ACCESS_ONLY,
        ProbeOutcome.classifyToken(true, false, null, false));
assertEquals(ProbeOutcome.TOKEN_INVALID_GRANT,
        ProbeOutcome.classifyToken(false, false, "invalid_grant", false));
assertEquals(ProbeOutcome.TOKEN_NETWORK_ERROR,
        ProbeOutcome.classifyToken(false, false, null, true));
assertEquals(ProbeOutcome.TOKEN_OTHER_OAUTH_ERROR,
        ProbeOutcome.classifyToken(false, false, "temporarily_unavailable", false));
assertEquals(ProbeOutcome.TOKEN_PROTOCOL_ERROR,
        ProbeOutcome.classifyToken(false, false, null, false));
```

7. Run the tests with the pinned toolchain:

```bash
env \
  JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ANDROID_HOME='/Users/andrew/Library/Android/sdk' \
  ANDROID_SDK_ROOT='/Users/andrew/Library/Android/sdk' \
  /Users/andrew/.gradle/wrapper/dists/gradle-8.14.3-bin/cv11ve7ro1n3o1j4so8xd9n66/gradle-8.14.3/bin/gradle \
  -p logs/blink-oauth-appauth-harness \
  :app:testDebugUnitTest --console=plain
```

Expected: compilation fails only because `BlinkOAuthProfile` and `ProbeOutcome`
do not exist. Record this red state in the Beads comment without copying Gradle
paths containing device or account data.

### Task 2: Implement the pure profile and outcome boundary

**Files:**

- Create: `logs/blink-oauth-appauth-harness/app/src/main/java/com/sealad886/blinkoauthprobe/BlinkOAuthProfile.java`
- Create: `logs/blink-oauth-appauth-harness/app/src/main/java/com/sealad886/blinkoauthprobe/ProbeOutcome.java`

**Interfaces:**

- Produces:
  - `static String clientIdForManufacturer(String manufacturer)`
  - `static Map<String, String> additionalParameters(...)`
  - `static ProbeOutcome classifyToken(boolean, boolean, String, boolean)`

1. Implement `BlinkOAuthProfile` as a final utility class with the three public
endpoint constants, `SCOPE = "client"`, and `PROMPT = "login"`.

2. Implement exact manufacturer matching:

```java
static String clientIdForManufacturer(String manufacturer) {
    return "Amazon".equals(manufacturer) ? "amazon" : "android";
}
```

3. Implement `additionalParameters` with a `LinkedHashMap` and no optional or
extra field. Capitalize only the first brand code point when non-empty. Return
an unmodifiable copy.

4. Implement `ProbeOutcome` as the closed enum listed in the design. Its
classifier must check successful access-token presence first, then exact
`invalid_grant`, then network category, then other non-null OAuth category, and
finally protocol error. It must not accept an exception or description.

5. Run `:app:testDebugUnitTest`. Expected: all unit tests pass with no test
failure or compilation warning treated as an error.

6. Run `git check-ignore -q logs/blink-oauth-appauth-harness` and
`npm pack --dry-run --json`; expected: the harness is ignored and absent from
every package file entry.

### Task 3: Write the security verifier first, then the Android coordinator

**Files:**

- Create: `logs/blink-oauth-appauth-harness/verify-harness.mjs`
- Create: `logs/blink-oauth-appauth-harness/app/src/main/AndroidManifest.xml`
- Create: `logs/blink-oauth-appauth-harness/app/src/main/java/com/sealad886/blinkoauthprobe/MainActivity.java`

**Interfaces:**

- Consumes: `BlinkOAuthProfile`, `ProbeOutcome`, AppAuth 0.11.1.
- Produces: launchable activity and exact HTTPS redirect receiver.

1. Write `verify-harness.mjs` before manifest or activity. It must inspect a
fixed allowlist of source/config files, emit progress for every file with
percentage and ETA, and fail until the manifest and activity exist.

2. Add positive checks for:

- application ID `com.sealad886.blinkoauthprobe`;
- `android.permission.INTERNET`;
- exported `MainActivity` launcher;
- `net.openid.appauth.RedirectUriReceiverActivity` with
  `tools:node="replace"`;
- exact HTTPS scheme, `applinks.blink.com` host, and `/signin/callback` path;
- `response.createTokenExchangeRequest()` and `performTokenRequest()`;
- `.setScopes("client")`, `.setNonce(null)`, `.setPrompt("login")`;
- `AuthorizationServiceConfiguration` with both production endpoints.

3. Add negative checks for these source strings or patterns:

```text
com.immediasemi.android.blink
android.webkit.WebView
android.util.Log
Log.
AuthState
getMessage(
printStackTrace(
System.out
System.err
Clipboard
access_token
refresh_token
code_verifier
```

Allow the public result enum names that contain `TOKEN_`; do not reject those.

4. Run `node verify-harness.mjs`. Expected: fail with exactly the missing
manifest/activity checks, proving the verifier is live.

5. Create the manifest with `allowBackup=false`, `fullBackupContent=false`,
`usesCleartextTraffic=false`, no storage permission, and the receiver filter
specified in the design.

6. Create `MainActivity` using programmatic `LinearLayout`, two `Button`s, and a
non-selectable `TextView`. Native-profile start is always visible. Forced
Android comparison is enabled only when native profile is `amazon`.

7. Load or create only `hardware_uuid` in private `SharedPreferences`. Never
store the authorization request, response, token response, outcome, URI, or
exception.

8. Build the AppAuth request:

```java
AuthorizationServiceConfiguration configuration =
    new AuthorizationServiceConfiguration(
        Uri.parse(BlinkOAuthProfile.AUTHORIZATION_ENDPOINT),
        Uri.parse(BlinkOAuthProfile.TOKEN_ENDPOINT));

AuthorizationRequest request = new AuthorizationRequest.Builder(
        configuration,
        selectedClientId,
        ResponseTypeValues.CODE,
        Uri.parse(BlinkOAuthProfile.REDIRECT_URI))
    .setScopes(BlinkOAuthProfile.SCOPE)
    .setNonce(null)
    .setPrompt(BlinkOAuthProfile.PROMPT)
    .setAdditionalParameters(additionalParameters)
    .build();
```

Launch only through `authorizationService.getAuthorizationRequestIntent()`.

9. In `onActivityResult`, use only `AuthorizationResponse.fromIntent(data)` and
`AuthorizationException.fromIntent(data)`. If no response exists, display
`AUTH_CANCELLED` only for cancellation/no-error; otherwise display
`AUTH_PROTOCOL_ERROR`. Never stringify either object.

10. For a response, call:

```java
authorizationService.performTokenRequest(
    response.createTokenExchangeRequest(),
    (tokenResponse, exception) -> {
        ProbeOutcome outcome = ProbeOutcome.classifyToken(
            tokenResponse != null && tokenResponse.accessToken != null,
            tokenResponse != null && tokenResponse.refreshToken != null,
            exception == null ? null : exception.error,
            exception != null
                && exception.type == AuthorizationException.TYPE_GENERAL_ERROR
                && exception.code == AuthorizationException.GeneralErrors.NETWORK_ERROR.code
        );
        showOutcome(outcome);
    }
);
```

Drop response references after classification and dispose the
`AuthorizationService` in `onDestroy`.

11. Run `node verify-harness.mjs`. Expected: all source/manifest checks pass and
progress reaches 100% with ETA 0.

12. Run unit tests again. Expected: all tests remain green.

### Task 4: Build and inspect the debug APK offline

**Files:**

- Generated, ignored:
  `logs/blink-oauth-appauth-harness/app/build/outputs/apk/debug/app-debug.apk`

1. Run `:app:lintDebug :app:testDebugUnitTest :app:assembleDebug` with the pinned
Gradle/JDK/SDK command from Task 1. Expected: `BUILD SUCCESSFUL`.

2. Print only the package name and version from `apkanalyzer manifest
application-id` and `manifest version-name`; expected values are
`com.sealad886.blinkoauthprobe` and `1.0`.

3. Use `apkanalyzer manifest print` piped into a bounded Node assertion. Confirm
the exact callback and unique package without printing signatures or unrelated
manifest metadata.

4. Run `apksigner verify --verbose` but reduce output to a single
`APK_SIGNATURE_VALID`/`APK_SIGNATURE_INVALID` category. Do not print certificate
DNs or fingerprints.

5. Scan archive entry names and DEX strings for forbidden persisted artifacts,
Blink package collision, logging calls, WebView, raw callback-query examples,
private keys, and token fixture values. Emit only counts and fail on non-zero.

6. Run the repository npm dry-pack inspection and confirm the Android harness
APK/source/build tree contributes zero entries.

7. Add a secret-free Beads comment containing only build result, unit-test
count, verifier result, package identity, and current `ADB_DEVICE_COUNT`.

### Task 5: Install, route the App Link, and run the native profile

**Files:**

- Update, ignored:
  `logs/blink-oauth-appauth-harness/run-card.md`

1. Poll `adb devices` and `adb mdns services` using bounded counts. If a paired
wireless target appears, connect without emitting its address. Continue
automatically once exactly one authorized device is available.

2. Query manufacturer, brand, model, Android release, and SDK for in-memory
request construction. Record only `PROFILE_ANDROID` or `PROFILE_AMAZON` and the
SDK integer in the run card; do not record serial, model, network address, or
fingerprints.

3. Install with `adb install --no-streaming -r app-debug.apk`. Confirm only
`HARNESS_INSTALL_PASS` or a bounded failure category.

4. Capture original App-Link selection state for official Blink and harness in
memory. Store only whether each is `VERIFIED`, `SELECTED`, `NONE`, or `OTHER`.

5. Resolve the callback before changes. If it already resolves to the harness,
do not alter settings. Otherwise temporarily disassociate official Blink and
associate the harness through documented `pm` user-selection commands exposed
by `adb shell pm help`. If the device does not support those commands, open
`android.settings.APP_OPEN_BY_DEFAULT_SETTINGS` and drive it from UI-tree bounds.

6. Resolve the callback again. Start no OAuth transaction unless the bounded
resolver result is exactly `HARNESS`.

7. Launch `MainActivity`, derive button bounds from the UI tree, clear only the
harness process's log buffer if needed, and activate native profile.

8. Complete credentials and hosted MFA only in Blink's hosted Custom Tab using
the existing authorization. If a CAPTCHA appears, stop at that action-time
boundary. Never dump the UI tree while a credential, MFA, callback, or token
value is visible.

9. After callback, inspect only the harness's bounded status node. Record one
enum outcome and no surrounding UI text.

10. In a `finally`-equivalent cleanup path, restore official Blink's original
App-Link selection, remove the harness selection, verify callback resolution,
force-stop and uninstall only `com.sealad886.blinkoauthprobe`, and verify the
official Blink package remains installed with unchanged data.

11. If native profile is `amazon` and succeeds, repeat once with forced
`android`, using a completely fresh authorization transaction. Restore routing
again afterward.

### Task 6: Translate evidence into the Homebridge completion path

**Files:**

- Modify only after evidence identifies the delta: relevant files under
  `src/blink-api/`, `src/homebridge-ui/`, and matching `__tests__/` files.
- Update: `docs/adr/001-authentication.md`
- Update: `docs/blink_api_dossier.md`
- Update: `docs/integration_checklist.md`
- Update: `README.md`
- Update: `CHANGELOG.md`

1. If native AppAuth succeeds, compare only non-secret request structure:
endpoint, parameter names, header names, redirect behavior, connection stack,
client profile, and same-device/egress placement. Do not capture values.

2. Write a failing repository test for the smallest evidenced Homebridge delta
before changing production code. Run the focused test and confirm expected red.

3. Implement only that delta and run focused tests to green, followed by the
full Jest, lint, build, audit, package, and secret-scan gates.

4. Deploy the tested package to `ssh andrew@raspberrypi.local`, preserving
existing auth state and rollback material without printing either.

5. Run the normal Homebridge UI + Brave hosted flow. Success requires usable
token persistence, tier discovery, verification handling, homescreen/device
discovery, and an unproxied Homebridge restart using durable state.

6. If AppAuth itself returns `invalid_grant`, classify that hypothesis as
rejected and continue with a fresh evidence-driven comparison rather than
changing Homebridge speculatively.

7. Update canonical documentation with observed evidence, keeping EU live proof
separate from non-EU APK/mocked coverage.

8. Commit each tested Homebridge behavior as a Conventional Commit. Close
`homebridge-blinkcameras-r7d` only after harness cleanup and evidence recording;
close parent `homebridge-blinkcameras-2yh` only after the normal end-user flow
and restart criteria pass.
