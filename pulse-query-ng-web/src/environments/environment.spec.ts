import { environment } from './environment';

describe('environment', () => {
  it('exposes expected defaults', () => {
    expect(environment.production).toBe(false);
    expect(environment.apiUrl).toBe('');
    expect(environment.registrationEnabled).toBe(true);
  });
});
