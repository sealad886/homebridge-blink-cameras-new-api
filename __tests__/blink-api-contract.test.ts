import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The extractor is intentionally plain CommonJS so it can run without a build.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractor = require('../scripts/blink-api-contract/index.cjs');

const fixtureRoot = join(
  process.cwd(),
  '__tests__/fixtures/blink-api-contract',
);
const fakeHash = 'a'.repeat(64);

describe('Blink APK API contract extraction', () => {
  it('extracts Retrofit methods, Kotlin continuations, parameters, and body models', () => {
    const endpoints = extractor.parseJavaEndpoints(
      join(fixtureRoot, 'jadx'),
      fakeHash,
    );

    expect(endpoints).toHaveLength(4);
    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: 'v1/accounts/{account}/devices',
          responseModelRefs: ['com.immediasemi.blink.test.FixtureResponse'],
          parameters: expect.arrayContaining([
            expect.objectContaining({ location: 'path', wireName: 'account' }),
            expect.objectContaining({ location: 'query', wireName: 'page' }),
          ]),
        }),
        expect.objectContaining({
          method: 'POST',
          path: 'v1/accounts/{account}/devices',
          requestModelRefs: ['com.immediasemi.blink.test.FixtureBody'],
        }),
        expect.objectContaining({
          method: 'DELETE',
          path: 'v1/accounts/{account}/history',
        }),
      ]),
    );
  });

  it('recovers dynamic and fixed Retrofit contracts from smali', () => {
    const endpoints = extractor.parseSmaliEndpoints(
      join(fixtureRoot, 'apktool-base'),
      fakeHash,
    );

    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'GET', path: '@Url' }),
        expect.objectContaining({ method: 'DELETE', path: 'v1/device/remove' }),
        expect.objectContaining({ method: 'DELETE', path: 'v1/accounts/{account}/history' }),
      ]),
    );
  });

  it('deduplicates Java and smali bindings but retains independent evidence', () => {
    const javaEndpoints = extractor.parseJavaEndpoints(
      join(fixtureRoot, 'jadx'),
      fakeHash,
    );
    const smaliEndpoints = extractor.parseSmaliEndpoints(
      join(fixtureRoot, 'apktool-base'),
      fakeHash,
    );
    const merged = extractor.mergeEndpoints(javaEndpoints, smaliEndpoints);

    expect(new Set(merged.map((endpoint: { normalizedIdentity: string }) =>
      endpoint.normalizedIdentity)).size).toBe(merged.length);
    expect(merged.some((endpoint: { evidence: Array<{ method: string }> }) =>
      endpoint.evidence.some(evidence => evidence.method === 'apktool-smali'))).toBe(true);
  });

  it('recovers serialized DTO fields recursively', () => {
    const endpoints = extractor.parseJavaEndpoints(
      join(fixtureRoot, 'jadx'),
      fakeHash,
    );
    const models = extractor.extractModels(
      endpoints,
      join(fixtureRoot, 'jadx'),
      fakeHash,
    );

    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'FixtureBody',
          fields: [expect.objectContaining({ serializedName: 'motion_enabled' })],
        }),
        expect.objectContaining({
          name: 'FixtureResponse',
          fields: [expect.objectContaining({ serializedName: 'device_id' })],
        }),
      ]),
    );
  });

  it('rejects duplicate contracts, missing hashes, and unresolved model references', () => {
    const endpoint = {
      id: 'ep-deadbeef',
      method: 'GET',
      path: 'v1/test',
      normalizedIdentity: 'GET|rest|v1/test|',
      serviceFamily: 'rest',
      baseHostTemplate: 'https://rest-{tier}.immedia-semi.com/api/',
      authentication: {},
      evidence: [{ apkSha256: '', source: 'Api.java', line: 1 }],
      confidence: 'direct',
      lifecycle: 'unchanged',
      security: {},
      requestModelRefs: ['MissingModel'],
      responseModelRefs: [],
      recovery: {
        declaration: 'resolved', models: 'resolved', serviceBinding: 'inferred',
        authentication: 'inferred', callSites: 'unresolved',
        responseSemantics: 'unresolved', deviceFamilies: 'unresolved',
      },
    };
    const errors = extractor.validateContract({
      schemaVersion: '1.1.0',
      artifact: {},
      endpoints: [endpoint, endpoint],
      models: [],
      thirdPartyExclusions: [],
      unresolved: [],
      diagnostics: {},
      completeness: {
        apkSplitsExpected: 4,
        apkSplitsObserved: 4,
        dexFilesExpected: 12,
        dexFilesObserved: 12,
        unclassifiedFirstPartyCandidates: 0,
      },
    });

    expect(errors.join('\n')).toMatch(/duplicate endpoint id/);
    expect(errors.join('\n')).toMatch(/evidence missing APK SHA-256/);
    expect(errors.join('\n')).toMatch(/unresolved model reference/);
  });

  it('recomputes completeness instead of trusting declared summary counts', () => {
    const errors = extractor.validateContract({
      schemaVersion: '1.1.0', artifact: { splits: [], dexFiles: [] },
      endpoints: [], models: [], firstPartyCandidates: [{ classification: 'first-party-candidate' }],
      thirdPartyExclusions: [], unresolved: [],
      diagnostics: { unclassifiedFirstPartyCandidates: 0 },
      completeness: {
        apkSplitsExpected: 4, apkSplitsObserved: 4,
        dexFilesExpected: 12, dexFilesObserved: 12,
        activeNormalizedContracts: 1, removedContracts: 1,
        modelsRecovered: 1, unresolvedCandidates: 1,
        unclassifiedFirstPartyCandidates: 0,
      },
    });

    expect(errors.join('\n')).toMatch(/activeNormalizedContracts does not reconcile/);
    expect(errors.join('\n')).toMatch(/unclassifiedFirstPartyCandidates does not reconcile/);
  });

  it('renders deterministically for the same canonical contract', () => {
    const contract = {
      artifact: {
        packageName: 'com.immediasemi.android.blink', versionName: '59.2',
        versionCode: 29823413, baseSha256: fakeHash, evidenceMode: 'static-only',
        splits: [{ file: 'base.apk' }], dexFiles: ['classes.dex'],
        commandOutcomes: [{ status: 'completed' }, { status: 'completed' }],
      },
      endpoints: [], models: [], thirdPartyExclusions: [], unresolved: [],
      diagnostics: { smaliOnlyContracts: 0, unclassifiedFirstPartyCandidates: 0, jadxReportedErrors: 0 },
    };
    const first = extractor.renderMarkdown(contract);
    const second = extractor.renderMarkdown(JSON.parse(JSON.stringify(contract)));

    expect(first).toBe(second);
    const directory = mkdtempSync(join(tmpdir(), 'blink-contract-'));
    const file = join(directory, 'contract.md');
    writeFileSync(file, first);
    expect(readFileSync(file, 'utf8')).toContain('Blink API Contract');
  });

  it('detects WebSocket, streaming, and interceptor rewrite evidence', () => {
    const indicators = extractor.extractProtocolIndicators([
      join(fixtureRoot, 'jadx'),
    ]);

    expect(indicators.counts.websocket).toBeGreaterThan(0);
    expect(indicators.counts.streaming).toBeGreaterThan(0);
    const fixture = readFileSync(
      join(
        fixtureRoot,
        'jadx/com/immediasemi/blink/test/TransportFixture.java',
      ),
      'utf8',
    );
    expect(fixture).toContain('replace("{tier}", "prod")');
  });

  it('validates and renders the committed 59.2 contract without drift', () => {
    const contractPath = join(
      process.cwd(),
      'docs/api-contract/blink-59.2-29823413.json',
    );
    const markdownPath = join(
      process.cwd(),
      'docs/api-contract/blink-59.2-29823413.md',
    );
    const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

    expect(extractor.validateJsonSchema(contract)).toEqual([]);
    expect(extractor.validateContract(contract)).toEqual([]);
    expect(extractor.renderMarkdown(contract)).toBe(
      readFileSync(markdownPath, 'utf8'),
    );

    const delta = contract.endpoints
      .filter((endpoint: { lifecycle: string }) => endpoint.lifecycle === 'added')
      .map((endpoint: { method: string; path: string }) =>
        `${endpoint.method} ${endpoint.path}`);
    expect(delta).toEqual(
      expect.arrayContaining([
        'POST 2fa/v1/webauthn/registration',
        'POST 2fa/v1/webauthn/registration/verify',
        'POST oauth/v2/verify_otp',
        'POST v4/accounts/{injected_account_id}/media/favorite',
        'POST v4/accounts/{injected_account_id}/media/unfavorite',
        'PUT share_service/v3/batch_shares',
        'GET sos/v1/factory_profile',
      ]),
    );
    expect(contract.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          method: 'GET',
          path: 'v3/accounts/{injected_account_id}/subscriptions/plans',
          lifecycle: 'removed',
        }),
      ]),
    );
  });
});
