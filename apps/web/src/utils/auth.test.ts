import type { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../types/api';
import {
    buildLoginPayload,
    getApiErrorMessage,
    getLoginUrl,
    getResetTokenUrl,
    getRedirectAfterLogin,
    validateLoginForm,
    type LoginFormValuesIF,
} from './auth';

const form = (overrides: Partial<LoginFormValuesIF> = {}): LoginFormValuesIF => ({
    username: 'user@example.test',
    password: 'correct-password',
    passwordConfirmation: '',
    hasPasswordField: true,
    hasPasswordConfirmationField: false,
    ...overrides,
});

describe('validateLoginForm', () => {
    describe('login', () => {
        it('accepts a valid email and password', () => {
            const { errors, isValid } = validateLoginForm('login', form());

            expect(isValid).toBe(true);
            expect(errors).toEqual({
                username: null,
                password: null,
                passwordConfirmation: null,
                api: null,
            });
        });

        it('requires a username', () => {
            const { errors, isValid } = validateLoginForm('login', form({ username: '' }));

            expect(isValid).toBe(false);
            expect(errors.username).toBe('usernameRequired');
        });

        it.each(['user', 'user@example', 'user @example.test', '@example.test'])(
            'rejects %s as an email',
            (username) => {
                const { errors, isValid } = validateLoginForm('login', form({ username }));

                expect(isValid).toBe(false);
                expect(errors.username).toBe('usernameFormat');
            }
        );

        it('requires a password', () => {
            const { errors, isValid } = validateLoginForm('login', form({ password: '' }));

            expect(isValid).toBe(false);
            expect(errors.password).toBe('passwordRequired');
        });

        it('reports username and password errors together', () => {
            const { errors } = validateLoginForm('login', form({ username: '', password: '' }));

            expect(errors.username).toBe('usernameRequired');
            expect(errors.password).toBe('passwordRequired');
        });

        it('does not require a password when the form has no password field', () => {
            const { isValid } = validateLoginForm(
                'login',
                form({ password: '', hasPasswordField: false })
            );

            expect(isValid).toBe(true);
        });

        it('never sets the api error', () => {
            const { errors } = validateLoginForm('login', form({ username: '', password: '' }));

            expect(errors.api).toBeNull();
        });
    });

    describe('forgot', () => {
        it('needs only a valid email', () => {
            const { isValid } = validateLoginForm('forgot', form({ password: '' }));

            expect(isValid).toBe(true);
        });

        it('rejects an invalid email', () => {
            const { errors, isValid } = validateLoginForm('forgot', form({ username: 'nope' }));

            expect(isValid).toBe(false);
            expect(errors.username).toBe('usernameFormat');
        });
    });

    describe('restore', () => {
        const restore = (overrides: Partial<LoginFormValuesIF> = {}) =>
            form({
                username: '',
                password: 'new-password',
                passwordConfirmation: 'new-password',
                hasPasswordConfirmationField: true,
                ...overrides,
            });

        it('accepts matching passwords without a username', () => {
            const { errors, isValid } = validateLoginForm('restore', restore());

            expect(isValid).toBe(true);
            expect(errors.username).toBeNull();
        });

        it('rejects passwords that do not match', () => {
            const { errors, isValid } = validateLoginForm(
                'restore',
                restore({ passwordConfirmation: 'other-password' })
            );

            expect(isValid).toBe(false);
            expect(errors.password).toBe('passwordsDoNotMatch');
            expect(errors.passwordConfirmation).toBe('passwordsDoNotMatch');
        });

        it('requires both fields when both are empty', () => {
            const { errors, isValid } = validateLoginForm(
                'restore',
                restore({ password: '', passwordConfirmation: '' })
            );

            expect(isValid).toBe(false);
            expect(errors.password).toBe('passwordRequired');
            expect(errors.passwordConfirmation).toBe('passwordRequired');
        });

        it('rejects a new password shorter than 8 characters', () => {
            const { errors, isValid } = validateLoginForm(
                'restore',
                restore({ password: 'short', passwordConfirmation: 'short' })
            );

            expect(isValid).toBe(false);
            expect(errors.password).toBe('passwordLength');
        });

        it('accepts a new password of exactly 8 characters', () => {
            const { isValid } = validateLoginForm(
                'restore',
                restore({ password: '12345678', passwordConfirmation: '12345678' })
            );

            expect(isValid).toBe(true);
        });

        it('counts bytes, not characters, for the 72 limit', () => {
            // 36 two-byte characters fit exactly, one more does not
            const fits = 'ä'.repeat(36);
            const tooLong = 'ä'.repeat(37);

            expect(
                validateLoginForm(
                    'restore',
                    restore({ password: fits, passwordConfirmation: fits })
                ).isValid
            ).toBe(true);
            expect(
                validateLoginForm(
                    'restore',
                    restore({ password: tooLong, passwordConfirmation: tooLong })
                ).errors.password
            ).toBe('passwordLength');
        });

        it('allows quotes and angle brackets in a new password', () => {
            const password = 'Say "hi" & <go>';
            const { isValid } = validateLoginForm(
                'restore',
                restore({ password, passwordConfirmation: password })
            );

            expect(isValid).toBe(true);
        });

        it('does not apply the length rule to login', () => {
            const { isValid } = validateLoginForm('login', form({ password: 'short' }));

            expect(isValid).toBe(true);
        });

        it('reports a mismatch over a missing confirmation', () => {
            const { errors } = validateLoginForm('restore', restore({ passwordConfirmation: '' }));

            expect(errors.password).toBe('passwordsDoNotMatch');
            expect(errors.passwordConfirmation).toBe('passwordsDoNotMatch');
        });
    });
});

describe('buildLoginPayload', () => {
    const values = { username: 'user@example.test', password: 'new-password' };

    it('sends username and password for login', () => {
        expect(buildLoginPayload('login', values)).toEqual(values);
    });

    it('sends only the username for forgot', () => {
        expect(buildLoginPayload('forgot', values)).toEqual({ username: values.username });
    });

    it('sends only the password for restore', () => {
        expect(buildLoginPayload('restore', values)).toEqual({ password: values.password });
    });
});

describe('getLoginUrl', () => {
    it('builds the login URL', () => {
        expect(getLoginUrl('http://api', 'login')).toBe('http://api/login/');
    });

    // Used to be http://api/login//forgot/, which the API answered with 404
    it('builds the forgot URL without a double slash', () => {
        expect(getLoginUrl('http://api', 'forgot')).toBe('http://api/login/forgot');
    });

    it('has no URL for restore', () => {
        expect(getLoginUrl('http://api', 'restore')).toBeNull();
    });
});

describe('getResetTokenUrl', () => {
    // Used to be http://api/login//token, which the API answered with 404
    it('builds the reset token URL without a double slash', () => {
        expect(getResetTokenUrl('http://api')).toBe('http://api/login/token');
    });
});

describe('getApiErrorMessage', () => {
    const error = (message: string, apiMessage?: string) =>
        ({
            message,
            response: apiMessage === undefined ? undefined : { data: { message: apiMessage } },
        }) as AxiosError<ApiErrorResponse>;

    it('prefers the message from the API', () => {
        expect(getApiErrorMessage(error('Request failed', 'None shall pass!'))).toBe(
            'None shall pass!'
        );
    });

    it('falls back to the Axios message without an API response', () => {
        expect(getApiErrorMessage(error('Network Error'))).toBe('Network Error');
    });

    it('falls back to a generic message when both are empty', () => {
        expect(getApiErrorMessage(error('', ''))).toBe('general error');
    });
});

describe('getRedirectAfterLogin', () => {
    it('returns to the last visited page', () => {
        expect(getRedirectAfterLogin('/customers/2/')).toBe('/customers/2/');
    });

    it('goes home when no page was visited', () => {
        expect(getRedirectAfterLogin(null)).toBe('/home/');
        expect(getRedirectAfterLogin('')).toBe('/home/');
    });

    it.each(['/login/', '/forgot/', '/restore/abc123/'])(
        'goes home instead of back to %s',
        (lastUrl) => {
            expect(getRedirectAfterLogin(lastUrl)).toBe('/home/');
        }
    );
});
