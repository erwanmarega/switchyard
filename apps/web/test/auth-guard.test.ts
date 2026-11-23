import { describe, it, expect } from 'vitest'
import { guardRedirect, postLoginTarget } from '~/utils/auth-guard'

describe('guardRedirect', () => {
  it('sends anonymous users from protected pages to the login with a redirect', () => {
    expect(guardRedirect('auth', false, '/dashboard')).toBe('/connexion?redirect=%2Fdashboard')
    expect(guardRedirect('auth', false, '/a?b=1')).toBe('/connexion?redirect=%2Fa%3Fb%3D1')
  })

  it('lets authenticated users into protected pages', () => {
    expect(guardRedirect('auth', true, '/dashboard')).toBeNull()
  })

  it('sends authenticated users away from guest pages', () => {
    expect(guardRedirect('guest', true, '/connexion')).toBe('/dashboard')
    expect(guardRedirect('guest', false, '/connexion')).toBeNull()
  })
})

describe('postLoginTarget', () => {
  it('uses a safe redirect param, else the dashboard', () => {
    expect(postLoginTarget('/dashboard')).toBe('/dashboard')
    expect(postLoginTarget('/x')).toBe('/x')
    expect(postLoginTarget('//evil.example')).toBe('/dashboard')
    expect(postLoginTarget(undefined)).toBe('/dashboard')
    expect(postLoginTarget(['/x', '/y'])).toBe('/x')
  })
})
