import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractModels } = require('../scripts/blink-api-contract/index.cjs');

const apkHash = 'a'.repeat(64);
function fixture(extra: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'blink-model-fixture-'));
  const files = {
    'Converters.java': `package fixture;
      class Converters {
        public Json provideJson() { return JsonKt.Json$default(null, () -> {
          config.setNamingStrategy(JsonNamingStrategy.INSTANCE.getSnakeCase());
        }, 1, null); }
        public Json providePlainJson() { return JsonKt.Json$default(null, () -> {}, 1, null); }
        public Retrofit.Builder provideRetrofitBuilder(Json json) {
          return new Retrofit.Builder().addConverterFactory(KotlinSerializationConverterFactory.create(json, media));
        }
        public FirstApi provideFirstApi(Retrofit.Builder builder) {
          return builder.build().create(FirstApi.class);
        }
        public SecondApi provideSecondApi(Json plainJson) {
          return new Retrofit.Builder().addConverterFactory(KotlinSerializationConverterFactory.create(plainJson, media)).build().create(SecondApi.class);
        }
      }`,
    'Wiring.java': `package fixture; class Wiring {
      void bind() {
        Converters_ProvideRetrofitBuilderFactory.create(this.provideJsonProvider);
        Converters_ProvideFirstApiFactory.create(this.provideRetrofitBuilderProvider);
        Converters_ProvideSecondApiFactory.create(this.providePlainJsonProvider);
      }
    }`,
    'Converters_ProvideRetrofitBuilderFactory.java': `package fixture;
      class Converters_ProvideRetrofitBuilderFactory {
        public static Retrofit.Builder provideRetrofitBuilder(Json json) {
          return Converters.INSTANCE.provideRetrofitBuilder(json);
        }
      }`,
    'Shared.java': `package fixture;
import kotlinx.serialization.Serializable;
      @Serializable class Shared {
        private final String hardwareId;
        @SerialName("HTTPStatus") private final String responseCode;
        private final String optionalValue;
        private final String fallbackValue;
        private final Integer unknownValue;
        private final Choice selectedChoice;
        private final String initialized = "ready";
        public Shared(int mask) { if ((mask & 4) == 0) { this.optionalValue = null; } }
      }`,
    'Shared$$serializer.java': `package fixture; class Shared$$serializer {
      void descriptor() {
        descriptor.addElement("hardwareId", false);
        descriptor.addElement("HTTPStatus", false);
        descriptor.addElement("optionalValue", true);
        descriptor.addElement("fallbackValue", true);
      }
      public KSerializer[] childSerializers() {
        return new KSerializer[]{StringSerializer.INSTANCE, StringSerializer.INSTANCE, BuiltinSerializersKt.getNullable(StringSerializer.INSTANCE), StringSerializer.INSTANCE};
      }
    }`,
    'Choice.java': `package fixture;
import kotlinx.serialization.Serializable;
      @Serializable enum Choice {
        @SerialName("chosenValue")
        FIRST,
        SECOND;
      }`,
    ...extra,
  };
  for (const [file, content] of Object.entries(files)) writeFileSync(join(root, file), content);
  return root;
}

function endpoint(className: string) {
  return {
    bindings: [{ className }], requestModelRefs: ['fixture.Shared'], responseModelRefs: [],
    normalizedIdentity: 'POST /shared',
    evidence: [{ apkSha256: apkHash, source: `${className}.java` }],
  };
}

type Model = { qualifiedName: string; fields: Array<Record<string, unknown>>; enumValues: string[]; unresolvedReasons: string[] };

describe('converter-aware model contracts', () => {
  it('retains DTO variants from actual converter providers and propagates context recursively', () => {
    const endpoints = [endpoint('FirstApi'), endpoint('SecondApi')];
    const models: Model[] = extractModels(endpoints, fixture(), apkHash);
    const snake = models.find(model => model.qualifiedName === 'fixture.Shared@snake_case')!;
    const camel = models.find(model => model.qualifiedName === 'fixture.Shared@camelCase')!;
    expect(snake.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ serializedName: 'hardware_id' }),
      expect.objectContaining({ serializedName: 'http_status' }),
      expect.objectContaining({ qualifiedType: 'fixture.Choice@snake_case' }),
    ]));
    expect(camel.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ serializedName: 'hardwareId' }),
      expect.objectContaining({ serializedName: 'HTTPStatus' }),
    ]));
    expect(endpoints.map(item => item.requestModelRefs[0])).toEqual(['fixture.Shared@snake_case', 'fixture.Shared@camelCase']);
    expect(endpoints[0]).toHaveProperty('id', expect.stringMatching(/^ep-[0-9a-f]{16}$/));
    expect(endpoints[0].normalizedIdentity).not.toBe(endpoints[1].normalizedIdentity);
    expect(models.find(model => model.qualifiedName === 'fixture.Choice@snake_case')?.enumValues).toEqual(['chosenValue', 'SECOND']);
  });

  it('separates absent, known-null, unresolved defaults and evidence-backed nullability', () => {
    const [model]: Model[] = extractModels([endpoint('FirstApi')], fixture(), apkHash).filter((item: Model) => item.qualifiedName === 'fixture.Shared');
    expect(model.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'hardwareId', required: true, nullable: false, defaultState: 'absent' }),
      expect.objectContaining({ sourceName: 'optionalValue', required: false, nullable: true, defaultState: 'known', default: null }),
      expect.objectContaining({ sourceName: 'fallbackValue', required: false, nullable: false, defaultState: 'present-unresolved' }),
      expect.objectContaining({ sourceName: 'unknownValue', required: null, nullable: null, defaultState: 'unresolved' }),
      expect.objectContaining({ sourceName: 'initialized', defaultState: 'known', default: 'ready' }),
    ]));
    expect(model.fields.find(field => field.sourceName === 'fallbackValue')).not.toHaveProperty('default');
    expect(model.unresolvedReasons).toContain('unknownValue: nullability unresolved');
  });

  it('does not infer a converter from DTO annotations or unrelated provider declarations', () => {
    const endpoints = [endpoint('FirstApi')];
    const models: Model[] = extractModels(endpoints, fixture({ 'Wiring.java': 'package fixture; class Wiring {}' }), apkHash);
    expect(endpoints[0]).toHaveProperty('serializationNamingStrategy', 'unresolved');
    expect(models.find(model => model.qualifiedName === 'fixture.Shared')?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: 'hardwareId', namingResolved: false }),
    ]));
  });
});
