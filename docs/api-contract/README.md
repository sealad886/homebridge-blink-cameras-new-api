# Blink API Contract for AI Agents

The canonical static contract is `blink-59.2-29823413.json`. Its schema is
`schema.json`; `blink-59.2-29823413.md` is generated for human review.

The JSON is factual interface metadata recovered from the official Android APK.
It does not contain APK code, credentials, account identifiers, device
identifiers, or live traffic. Static declarations do not prove that a server
currently accepts a request.

## Deterministic queries

```js
const contract = require('./docs/api-contract/blink-59.2-29823413.json');

// Locate a wire contract.
const media = contract.endpoints.filter(endpoint =>
  endpoint.lifecycle !== 'removed' && endpoint.path.includes('/media'));

// Resolve host, auth, and parameters.
const target = contract.endpoints.find(endpoint => endpoint.id === 'EP_ID');
console.log(target.baseHostTemplate, target.authentication, target.parameters);

// Follow request and response model references.
const models = new Map(contract.models.map(model => [model.name, model]));
console.log(target.requestModelRefs.map(name => models.get(name)));

// Exclude destructive operations.
const readSafe = contract.endpoints.filter(endpoint =>
  endpoint.lifecycle !== 'removed' && !endpoint.security.destructive);

// Compare the current APK with 57.1.
const delta = contract.endpoints.filter(endpoint =>
  endpoint.lifecycle !== 'unchanged');
```

Always inspect `confidence`, `evidence`, `lifecycle`, and `unresolved` before
using a record. Treat `inferred` and `unresolved` as leads, not confirmed wire
behavior. Never use this catalog as authorization to call destructive,
privacy-sensitive, account-management, or media-bearing endpoints.

## Regeneration

The APK and decompiler directories are deliberately git-ignored. With the
expected evidence directories present, run:

```sh
npm run blink-api:generate
npm run blink-api:validate
```

The generator normalizes duplicate Retrofit overloads, corroborates JADX output
with apktool smali, compares the current build with 57.1, validates the result,
and regenerates the Markdown view.
