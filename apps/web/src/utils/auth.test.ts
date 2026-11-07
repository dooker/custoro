import type { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ApiErrorResponse } from '../types/api';
import {
    buildLoginPayload,
    getApiErrorMessage,
    isRefusal,
    getLoginUrl,
    getLogoutUrl,
    getResetTokenUrl,
    getRedirectAfterLogin,
    sessionChangeInOtherTab,
    isSessionEndResponse,
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

    it("names the text for the login limit, not the API's English message", () => {
        expect(
            getApiErrorMessage({
                message: 'Request failed',
                response: { status: 429, data: { message: 'Too many attempts. Try later.' } },
            } as AxiosError<ApiErrorResponse>)
        ).toBe('login.error.tooManyAttempts');
    });

    it('survives an answer with no body', () => {
        expect(
            getApiErrorMessage({
                message: 'Request failed with status code 400',
                response: { status: 400, data: undefined },
            } as unknown as AxiosError<ApiErrorResponse>)
        ).toBe('Request failed with status code 400');
    });
});

describe('isRefusal', () => {
    const status = (code?: number) =>
        ({ response: code === undefined ? undefined : { status: code } }) as AxiosError;

    it.each([400, 403, 429])('is true for an answer of the API: HTTP %i', (code) => {
        expect(isRefusal(status(code))).toBe(true);
    });

    it.each([500, 502, 503])('is false for a server error: HTTP %i', (code) => {
        expect(isRefusal(status(code))).toBe(false);
    });

    it('is false when nothing answered', () => {
        expect(isRefusal(status())).toBe(false);
    });
});

describe('isSessionEndResponse', () => {
    it.each(['session.expired', 'invalid.token'])(
        'recognises the answer the API gives for a refused token: %s',
        (message) => {
            expect(isSessionEndResponse({ success: false, message })).toBe(true);
        }
    );

    it.each([
        ['a successful answer', { success: true, message: 'session.expired' }],
        ['another failure', { success: false, message: 'forbidden' }],
        ['a login failure', { success: false, message: 'None shall pass!' }],
        ['an answer without a message', { success: false }],
        ['a message that is not text', { success: false, message: ['session.expired'] }],
        ['a name from Object.prototype', { success: false, message: 'constructor' }],
        ['a missing success flag', { message: 'invalid.token' }],
    ])('ignores %s', (_case, data) => {
        expect(isSessionEndResponse(data)).toBe(false);
    });

    it.each([null, undefined, 'session.expired', 42, []])(
        'ignores %j, which is not an answer',
        (data) => {
            expect(isSessionEndResponse(data)).toBe(false);
        }
    );
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

    // lastUrl is whatever path the browser was last at, and a link can make that "//host/path"
    // (a double slash opens fine on the app's server). The router refuses to navigate to another
    // origin by throwing, which left the person logged in on the login page.
    it.each([
        '//example.com/phish/',
        '///example.com/',
        '/\\example.com/phish/',
        'https://example.com/phish/',
        'javascript:alert(1)',
        'customers/2/',
    ])('goes home instead of to %s, which is not a page of the app', (lastUrl) => {
        expect(getRedirectAfterLogin(lastUrl)).toBe('/home/');
    });

    it('keeps the query and anchor of a page of the app', () => {
        expect(getRedirectAfterLogin('/invoices/2/?x=1#top')).toBe('/invoices/2/?x=1#top');
    });
});

describe('getLogoutUrl', () => {
    it('is the logout of the login API', () => {
        expect(getLogoutUrl('https://api.example.test')).toBe(
            'https://api.example.test/login/logout'
        );
    });
});

describe('sessionChangeInOtherTab', () => {
    const tokenKey = 'loginToken';

    it('is a logout when another tab removed the token or cleared the storage', () => {
        expect(
            sessionChangeInOtherTab({ key: tokenKey, oldValue: 'a', newValue: null }, tokenKey)
        ).toBe('loggedOut');
        expect(
            sessionChangeInOtherTab({ key: null, oldValue: null, newValue: null }, tokenKey)
        ).toBe('loggedOut');
    });

    it('is a login when another tab stored a new token', () => {
        expect(
            sessionChangeInOtherTab({ key: tokenKey, oldValue: null, newValue: 'b' }, tokenKey)
        ).toBe('loggedIn');
        expect(
            sessionChangeInOtherTab({ key: tokenKey, oldValue: 'a', newValue: 'b' }, tokenKey)
        ).toBe('loggedIn');
    });

    it('is nothing for other keys or an unchanged token', () => {
        expect(
            sessionChangeInOtherTab({ key: 'language', oldValue: 'en', newValue: 'et' }, tokenKey)
        ).toBeNull();
        expect(
            sessionChangeInOtherTab({ key: tokenKey, oldValue: 'a', newValue: 'a' }, tokenKey)
        ).toBeNull();
    });
});
