import { describe, it, expect } from 'vitest'
import {
  AuthFlowError,
  GENERIC_ERROR,
  INVALID_CREDENTIALS,
  SIGNUP_CLOSED,
  apiErrorMessage,
  authErrorResponse,
  authErrorMessage,
  isUnauthorized,
} from '../app/utils/auth-errors'

describe('isUnauthorized', () => {
  it('detects 401 from ofetch errors and responses', () => {
    expect(isUnauthorized({ statusCode: 401 })).toBe(true)
    expect(isUnauthorized({ status: 401 })).toBe(true)
    expect(isUnauthorized({ response: { status: 401 } })).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isUnauthorized({ statusCode: 500 })).toBe(false)
    expect(isUnauthorized(new Error('network'))).toBe(false)
    expect(isUnauthorized(null)).toBe(false)
  })
})

const apiError = (code: string, status = 400) => ({ name: 'AuthApiError', code, status })

describe('authErrorMessage (login)', () => {
  it('uses the generic message for any credential failure', () => {
    for (const code of ['invalid_credentials', 'user_not_found', 'user_banned', 'whatever']) {
      expect(authErrorMessage(apiError(code), 'login')).toBe(INVALID_CREDENTIALS)
    }
  })

  it('never reveals that an account exists or is missing', () => {
    expect(authErrorMessage(apiError('user_already_exists', 422), 'login')).toBe(
      INVALID_CREDENTIALS,
    )
  })

  it('maps rate limits and unconfirmed emails', () => {
    expect(authErrorMessage(apiError('over_request_rate_limit', 429), 'login')).toMatch(/Trop de/)
    expect(authErrorMessage(apiError('email_not_confirmed'), 'login')).toMatch(/Confirmez/)
  })
})

describe('authErrorMessage (register)', () => {
  it('maps known codes to French messages', () => {
    expect(authErrorMessage(apiError('user_already_exists', 422), 'register')).toMatch(
      /existe déjà/,
    )
    expect(authErrorMessage(apiError('weak_password', 422), 'register')).toMatch(/trop faible/)
    expect(authErrorMessage(apiError('signup_disabled', 422), 'register')).toBe(SIGNUP_CLOSED)
    expect(authErrorMessage(apiError('over_request_rate_limit', 429), 'register')).toMatch(
      /Trop de/,
    )
    expect(authErrorMessage(apiError('over_email_send_rate_limit', 429), 'register')).toMatch(
      /e-mails/,
    )
  })

  it('falls back to the generic message for unknown codes', () => {
    expect(authErrorMessage(apiError('something_new'), 'register')).toBe(GENERIC_ERROR)
  })
})

describe('authErrorMessage (transport failures)', () => {
  it('returns the generic message for network and server errors in both forms', () => {
    const network = { name: 'AuthRetryableFetchError', status: 0 }
    expect(authErrorMessage(network, 'login')).toBe(GENERIC_ERROR)
    expect(authErrorMessage(network, 'register')).toBe(GENERIC_ERROR)
    expect(authErrorMessage(new TypeError('fetch failed'), 'login')).toBe(GENERIC_ERROR)
    expect(authErrorMessage(apiError('unexpected_failure', 500), 'login')).toBe(GENERIC_ERROR)
    expect(authErrorMessage(null, 'login')).toBe(GENERIC_ERROR)
  })
})

describe('apiErrorMessage', () => {
  it('returns the message of an AuthFlowError', () => {
    expect(apiErrorMessage(new AuthFlowError('Bonjour', 'x'))).toBe('Bonjour')
  })

  it('reads API error bodies and falls back to the generic message', () => {
    expect(
      apiErrorMessage({ data: { error: 'Non', issues: [{ path: 'a', message: 'Là.' }] } }),
    ).toBe('Non Là.')
    expect(apiErrorMessage(new Error('boom'))).toBe(GENERIC_ERROR)
  })
})

describe('authErrorResponse', () => {
  it('login: generic 401 for credential failures, never a code', () => {
    for (const code of ['invalid_credentials', 'user_not_found', 'user_already_exists']) {
      expect(authErrorResponse(apiError(code), 'login')).toEqual({
        status: 401,
        body: { error: INVALID_CREDENTIALS },
      })
    }
  })

  it('login: unconfirmed email, rate limits and outages', () => {
    expect(authErrorResponse(apiError('email_not_confirmed'), 'login').status).toBe(403)
    expect(authErrorResponse(apiError('over_request_rate_limit', 429), 'login').status).toBe(429)
    expect(authErrorResponse({ name: 'AuthRetryableFetchError', status: 0 }, 'login').status).toBe(
      502,
    )
    expect(authErrorResponse(null, 'login')).toEqual({
      status: 502,
      body: { error: GENERIC_ERROR },
    })
  })

  it('register: known codes are forwarded with a 422', () => {
    expect(authErrorResponse(apiError('signup_disabled', 422), 'register')).toEqual({
      status: 422,
      body: { error: SIGNUP_CLOSED, code: 'signup_disabled' },
    })
    expect(authErrorResponse(apiError('weak_password', 422), 'register').body.code).toBe(
      'weak_password',
    )
    expect(authErrorResponse(apiError('over_email_send_rate_limit', 429), 'register').status).toBe(
      429,
    )
  })

  it('register: unknown codes get the generic message without a code', () => {
    expect(authErrorResponse(apiError('something_new'), 'register')).toEqual({
      status: 422,
      body: { error: GENERIC_ERROR },
    })
  })
})
