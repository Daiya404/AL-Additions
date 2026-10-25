import { describe, it, expect } from 'vitest';
import '../src/modules/tagFilter';
import '../src/modules/sync';
import {
  createBackup,
  importBackup,
  MAGIC_PLAIN,
  MAGIC_ENCRYPTED,
  encryptData,
  decryptData,
  FORMAT_VERSION,
  SENSITIVE_KEYS
} from '../src/settings/backup';
import { Settings } from '../src/settings/settings';
import { store } from '../src/utils/helpers';

describe('Settings Backup & Crypto Engine', () => {
  it('creates an unencrypted binary backup with ALAS magic bytes and valid header', async () => {
    const bytes = await createBackup(false);

    expect(bytes.subarray(0, 4)).toEqual(MAGIC_PLAIN);
    expect(bytes[4]).toBe(FORMAT_VERSION);
    expect(bytes.length).toBeGreaterThan(5);
  });

  it('creates an encrypted binary backup with ALAE magic bytes when a password is provided', async () => {
    const bytes = await createBackup(false, 'CorrectPassword123');

    expect(bytes.subarray(0, 4)).toEqual(MAGIC_ENCRYPTED);
    expect(bytes[4]).toBe(FORMAT_VERSION);
    expect(bytes.length).toBeGreaterThan(33);
  });

  it('rejects exporting credentials if no password is provided', async () => {
    await expect(createBackup(true)).rejects.toThrow('A password is required to export credentials.');
    await expect(createBackup(true, '   ')).rejects.toThrow('A password is required to export credentials.');
  });

  it('performs full roundtrip AES-GCM encryption and decryption', async () => {
    const originalText = JSON.stringify({ scoreRounding: 'round', customKey: 'valid' });
    const password = 'SuperSecretPassword!';

    const encrypted = await encryptData(originalText, password);
    expect(encrypted.salt).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = await decryptData(encrypted, password);
    expect(decrypted).toBe(originalText);
  });

  it('fails decryption when provided with the wrong password', async () => {
    const originalText = JSON.stringify({ secret: 'anilist-oauth-token' });
    const encrypted = await encryptData(originalText, 'right-password');

    await expect(decryptData(encrypted, 'wrong-password')).rejects.toThrow();
  });

  it('exports and restores settings via unencrypted binary backup', async () => {
    Settings.set('tagPercentage', 85);
    const backupBytes = await createBackup(false, undefined, { tagPercentage: 85 });

    Settings.set('tagPercentage', 50);
    expect(Settings.get('tagPercentage')).toBe(50);

    const result = await importBackup(backupBytes);
    expect(result.applied).toBeGreaterThan(0);
    expect(Settings.get('tagPercentage')).toBe(85);
  });

  it('exports and restores settings via password-encrypted binary backup', async () => {
    Settings.set('tagPercentage', 92);
    const password = 'BackupPassword456';
    const backupBytes = await createBackup(false, password, { tagPercentage: 92 });

    Settings.set('tagPercentage', 50);

    const result = await importBackup(backupBytes, async () => password);
    expect(result.applied).toBeGreaterThan(0);
    expect(Settings.get('tagPercentage')).toBe(92);
  });

  it('rejects encrypted backup import when password prompt fails or enters wrong password', async () => {
    const backupBytes = await createBackup(false, 'Secret123');

    await expect(
      importBackup(backupBytes, async () => 'WrongPassword321')
    ).rejects.toThrow('Incorrect password or corrupted backup file.');
  });

  it('cancels gracefully without throwing when password prompt is cancelled (null)', async () => {
    const backupBytes = await createBackup(false, 'Secret123');

    const result = await importBackup(backupBytes, async () => null);
    expect(result.cancelled).toBe(true);
    expect(result.applied).toBe(0);
  });

  it('restores legacy plain JSON string backup files', async () => {
    const legacyJson = JSON.stringify({
      version: 1,
      encrypted: false,
      exportedAt: Date.now(),
      data: {
        tagPercentage: 73
      }
    });

    const result = await importBackup(legacyJson);
    expect(result.applied).toBeGreaterThan(0);
    expect(Settings.get('tagPercentage')).toBe(73);
  });

  it('excludes al_token from SENSITIVE_KEYS and credential exports', async () => {
    expect((SENSITIVE_KEYS as readonly string[]).includes('al_token')).toBe(false);
    store.set('al_token', 'stale_token_123');
    store.set('mal_token', 'valid_mal_token');

    const bytes = await createBackup(true, 'TestPassword123');
    const result = await importBackup(bytes, async () => 'TestPassword123');

    expect(result.secretsApplied).toBeGreaterThan(0);
    expect(store.get('al_token', null)).toBeNull();
    expect(store.get('mal_token', null)).toBe('valid_mal_token');
  });

  it('silently ignores and purges legacy al_token when importing legacy backups', async () => {
    store.set('al_token', 'old_local_token');
    const legacyJson = JSON.stringify({
      version: 1,
      encrypted: false,
      exportedAt: Date.now(),
      data: {
        tagPercentage: 60,
        al_token: 'legacy_backup_token'
      }
    });

    const result = await importBackup(legacyJson);
    expect(result.applied).toBeGreaterThan(0);
    expect(store.get('al_token', null)).toBeNull();
  });
});