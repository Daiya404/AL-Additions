import { describe, it, expect, beforeEach } from 'vitest';
import { promptPasswordModal } from '../src/settings/passwordModal';

describe('Password Modal Component', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts into DOM with title, description, and submit text', () => {
    promptPasswordModal({
      title: 'Encrypt Settings',
      description: 'Enter a strong password',
      submitText: 'Encrypt'
    });

    const backdrop = document.getElementById('ala-pwd-backdrop');
    const title = document.getElementById('ala-pwd-title');
    const desc = document.querySelector('.ala-pwd-desc');
    const submitBtn = document.getElementById('ala-pwd-btn-submit');

    expect(backdrop).not.toBeNull();
    expect(title?.textContent).toBe('Encrypt Settings');
    expect(desc?.textContent).toBe('Enter a strong password');
    expect(submitBtn?.textContent?.trim()).toBe('Encrypt');
  });

  it('resolves with the entered password on valid submit', async () => {
    const modalPromise = promptPasswordModal({
      title: 'Enter Password'
    });

    const input = document.querySelector<HTMLInputElement>('#ala-pwd-input-main')!;
    const submitBtn = document.querySelector<HTMLButtonElement>('#ala-pwd-btn-submit')!;

    input.value = 'MySecret123';
    submitBtn.click();

    const result = await modalPromise;
    expect(result).toBe('MySecret123');
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('toggles password input visibility when the eye button is clicked', () => {
    promptPasswordModal({
      title: 'Toggle Test',
      confirm: true
    });

    const input = document.querySelector<HTMLInputElement>('#ala-pwd-input-main')!;
    const confirmInput = document.querySelector<HTMLInputElement>('#ala-pwd-input-confirm')!;
    const toggleBtn = document.querySelector<HTMLButtonElement>('.ala-pwd-toggle')!;

    expect(input.type).toBe('password');
    expect(confirmInput.type).toBe('password');

    toggleBtn.click();
    expect(input.type).toBe('text');
    expect(confirmInput.type).toBe('text');

    toggleBtn.click();
    expect(input.type).toBe('password');
    expect(confirmInput.type).toBe('password');
  });

  it('prevents submission and displays error when input is empty and allowEmpty is false', async () => {
    promptPasswordModal({
      title: 'Validation Test',
      allowEmpty: false
    });

    const input = document.querySelector<HTMLInputElement>('#ala-pwd-input-main')!;
    const submitBtn = document.querySelector<HTMLButtonElement>('#ala-pwd-btn-submit')!;
    const errBox = document.querySelector<HTMLElement>('#ala-pwd-err')!;

    input.value = '   ';
    submitBtn.click();

    expect(errBox.style.display).toBe('block');
    expect(errBox.textContent).toBe('Password cannot be empty.');
    expect(document.getElementById('ala-pwd-backdrop')).not.toBeNull();
  });

  it('allows empty password submission when allowEmpty is true', async () => {
    const modalPromise = promptPasswordModal({
      title: 'Optional Password',
      allowEmpty: true
    });

    const submitBtn = document.querySelector<HTMLButtonElement>('#ala-pwd-btn-submit')!;
    submitBtn.click();

    const result = await modalPromise;
    expect(result).toBe('');
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('prevents submission when password confirmation does not match', async () => {
    promptPasswordModal({
      title: 'Confirm Test',
      confirm: true
    });

    const input = document.querySelector<HTMLInputElement>('#ala-pwd-input-main')!;
    const confirmInput = document.querySelector<HTMLInputElement>('#ala-pwd-input-confirm')!;
    const submitBtn = document.querySelector<HTMLButtonElement>('#ala-pwd-btn-submit')!;
    const errBox = document.querySelector<HTMLElement>('#ala-pwd-err')!;

    input.value = 'Password123';
    confirmInput.value = 'Password321';
    submitBtn.click();

    expect(errBox.style.display).toBe('block');
    expect(errBox.textContent).toBe('Passwords do not match.');
    expect(document.getElementById('ala-pwd-backdrop')).not.toBeNull();
  });

  it('cancels and resolves null when Cancel button is clicked', async () => {
    const modalPromise = promptPasswordModal({ title: 'Cancel Test' });
    const cancelBtn = document.querySelector<HTMLButtonElement>('#ala-pwd-btn-cancel')!;

    cancelBtn.click();

    const result = await modalPromise;
    expect(result).toBeNull();
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('cancels and resolves null when Close (✕) button is clicked', async () => {
    const modalPromise = promptPasswordModal({ title: 'Close Test' });
    const closeBtn = document.querySelector<HTMLButtonElement>('.ala-pwd-btn-close')!;

    closeBtn.click();

    const result = await modalPromise;
    expect(result).toBeNull();
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('cancels and resolves null when clicking the outer backdrop', async () => {
    const modalPromise = promptPasswordModal({ title: 'Backdrop Click Test' });
    const backdrop = document.getElementById('ala-pwd-backdrop')!;

    backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const result = await modalPromise;
    expect(result).toBeNull();
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('cancels and resolves null when Escape key is pressed', async () => {
    const modalPromise = promptPasswordModal({ title: 'Escape Test' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    const result = await modalPromise;
    expect(result).toBeNull();
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });

  it('submits when Enter key is pressed', async () => {
    const modalPromise = promptPasswordModal({ title: 'Enter Key Test' });
    const input = document.querySelector<HTMLInputElement>('#ala-pwd-input-main')!;

    input.value = 'SubmittedViaEnter';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    const result = await modalPromise;
    expect(result).toBe('SubmittedViaEnter');
    expect(document.getElementById('ala-pwd-backdrop')).toBeNull();
  });
});