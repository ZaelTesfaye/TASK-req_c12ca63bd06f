/**
 * Unit tests for the centralized config module.
 *
 * Because the config module reads process.env at import time and freezes
 * the result, we test helper behaviour indirectly where possible and
 * validate the shape / freezing of the exported config object.
 */

// We need to set ENCRYPTION_KEY_HEX before the config module loads.
const VALID_HEX_KEY = 'ab'.repeat(32); // 64 hex chars

describe('config module', () => {
  let config;

  beforeEach(async () => {
    // Reset modules so config re-reads process.env each time
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -----------------------------------------------------------------------
  // ENCRYPTION_KEY_HEX validation
  // -----------------------------------------------------------------------

  it('accepts a valid 64-char hex ENCRYPTION_KEY_HEX', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.encryptionKeyHex).toBe(VALID_HEX_KEY);
  });

  it('rejects ENCRYPTION_KEY_HEX that is not 64 hex characters', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', 'tooshort');
    vi.stubEnv('NODE_ENV', 'development');

    await expect(import('../../src/config/index.js')).rejects.toThrow(
      'ENCRYPTION_KEY_HEX must be exactly 64 hexadecimal characters'
    );
  });

  it('rejects ENCRYPTION_KEY_HEX with non-hex characters', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', 'zz' + 'aa'.repeat(31)); // 64 chars but 'zz' is invalid
    vi.stubEnv('NODE_ENV', 'development');

    await expect(import('../../src/config/index.js')).rejects.toThrow(
      'ENCRYPTION_KEY_HEX must be exactly 64 hexadecimal characters'
    );
  });

  // -----------------------------------------------------------------------
  // Boolean env var parsing
  // -----------------------------------------------------------------------

  it('parses boolean env vars correctly (true / false / 1 / 0)', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('ENABLE_SSR', 'true');
    vi.stubEnv('ENABLE_TLS', '0');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.enableSsr).toBe(true);
    expect(config.enableTls).toBe(false);
  });

  it('treats "yes" as truthy and empty string as default for booleans', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('ENABLE_SSR', 'yes');
    vi.stubEnv('ENABLE_TLS', '');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.enableSsr).toBe(true);
    expect(config.enableTls).toBe(false); // default
  });

  // -----------------------------------------------------------------------
  // Integer env var parsing
  // -----------------------------------------------------------------------

  it('parses integer env vars correctly', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('PORT', '4000');
    vi.stubEnv('JWT_ACCESS_TTL_MINUTES', '60');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.port).toBe(4000);
    expect(config.jwt.accessTtlMinutes).toBe(60);
  });

  it('falls back to default when integer env var is NaN', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('PORT', 'notanumber');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.port).toBe(3000); // default
  });

  // -----------------------------------------------------------------------
  // Defaults
  // -----------------------------------------------------------------------

  it('provides correct default values when env vars are absent', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('NODE_ENV', 'development');
    // Clear specific vars to force defaults
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
    delete process.env.CACHE_MODE;

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe('postgresql://localhost:5432/hospitality_ops');
    expect(config.cacheMode).toBe('memory');
    expect(config.backup.retentionDays).toBe(30);
    expect(config.upload.maxMb).toBe(25);
  });

  // -----------------------------------------------------------------------
  // Frozen config
  // -----------------------------------------------------------------------

  it('freezes the config object so mutations are rejected', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.jwt)).toBe(true);
    expect(Object.isFrozen(config.upload)).toBe(true);

    expect(() => {
      config.port = 9999;
    }).toThrow();
  });

  // -----------------------------------------------------------------------
  // CSV parsing (allowedMime)
  // -----------------------------------------------------------------------

  it('parses comma-separated UPLOAD_ALLOWED_MIME into an array', async () => {
    vi.stubEnv('ENCRYPTION_KEY_HEX', VALID_HEX_KEY);
    vi.stubEnv('UPLOAD_ALLOWED_MIME', 'image/png, application/pdf');
    vi.stubEnv('NODE_ENV', 'development');

    const mod = await import('../../src/config/index.js');
    config = mod.default;

    expect(config.upload.allowedMime).toEqual(['image/png', 'application/pdf']);
  });
});
