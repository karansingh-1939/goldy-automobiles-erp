import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from '../../src/renderer/modules/auth/Login.jsx';
import { api } from '../../src/renderer/shared/api/api-client.js';

describe('Workshop onboarding', () => {
  it('creates the first administrator and shows the recovery code before login', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ setupCompleted: false });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ recoveryCode: 'GOLDY-TEST-CODE' });
    render(<Login />);
    await screen.findByText('Create your administrator account');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create administrator' }));
    await screen.findByText('GOLDY-TEST-CODE');
    expect(post).toHaveBeenCalledWith('/api/v1/auth/setup', {
      username: 'owner',
      password: 'StrongPass1',
      email: '',
    });
    expect(screen.getByLabelText('Password').value).toBe('');
  });
  it('shows authentication errors directly on the login screen', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ setupCompleted: true });
    vi.spyOn(api, 'post').mockRejectedValue(new Error('Invalid username or password.'));
    render(<Login />);
    await screen.findByRole('button', { name: 'Sign In' });
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'incorrect' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid username or password.');
  });
});
