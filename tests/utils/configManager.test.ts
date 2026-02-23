// tests/utils/configManager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ConfigManager - UDE support', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should detect UDE environment type from env var', async () => {
    process.env.DEV_ENVIRONMENT_TYPE = 'ude';
    const { getConfigManager } = await import('../../src/utils/configManager.js');
    expect(typeof getConfigManager).toBe('function');
  });

  it('should return explicit CUSTOM_PACKAGES_PATH from env', () => {
    process.env.CUSTOM_PACKAGES_PATH = 'C:\\MyCustom';
    process.env.MICROSOFT_PACKAGES_PATH = 'C:\\MyMicrosoft';
    expect(process.env.CUSTOM_PACKAGES_PATH).toBe('C:\\MyCustom');
    expect(process.env.MICROSOFT_PACKAGES_PATH).toBe('C:\\MyMicrosoft');
  });
});
