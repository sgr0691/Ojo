import { describe, it, expect } from 'vitest'
import { parsePnpmArgs } from '../pnpm'

describe('parsePnpmArgs', () => {
  it('detects pnpm add <package>', () => {
    const result = parsePnpmArgs(['add', 'lodash'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('lodash')
  })

  it('detects pnpm install', () => {
    const result = parsePnpmArgs(['install'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(0)
  })

  it('detects pnpm i shorthand', () => {
    const result = parsePnpmArgs(['i'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(0)
  })

  it('detects pnpm i <package>', () => {
    const result = parsePnpmArgs(['i', 'react'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react')
  })

  it('handles -D dev flag with add', () => {
    const result = parsePnpmArgs(['add', '-D', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
    expect(result.flags).toContain('-D')
  })

  it('handles multiple packages with add', () => {
    const result = parsePnpmArgs(['add', 'react', 'react-dom'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(2)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[1].name).toBe('react-dom')
  })

  it('handles scoped packages', () => {
    const result = parsePnpmArgs(['add', '@scope/package'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
  })

  it('handles scoped package with version', () => {
    const result = parsePnpmArgs(['add', '@scope/package@1.2.3'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
    expect(result.packages[0].version).toBe('1.2.3')
  })

  it('handles version specifiers', () => {
    const result = parsePnpmArgs(['add', 'react@18.2.0'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[0].version).toBe('18.2.0')
  })

  it('returns other for pnpm run', () => {
    const result = parsePnpmArgs(['run', 'dev'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for pnpm test', () => {
    const result = parsePnpmArgs(['test'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for pnpm exec', () => {
    const result = parsePnpmArgs(['exec', 'jest'])
    expect(result.type).toBe('other')
  })

  it('returns other for pnpm dlx', () => {
    const result = parsePnpmArgs(['dlx', 'create-vite'])
    expect(result.type).toBe('other')
  })

  it('returns other for pnpm why', () => {
    const result = parsePnpmArgs(['why', 'lodash'])
    expect(result.type).toBe('other')
  })

  it('returns other for pnpm help add', () => {
    const result = parsePnpmArgs(['help', 'add'])
    expect(result.type).toBe('other')
  })

  it('returns other for pnpm store', () => {
    const result = parsePnpmArgs(['store', 'status'])
    expect(result.type).toBe('other')
  })

  it('returns other for pnpm config', () => {
    const result = parsePnpmArgs(['config', 'set', 'registry', 'https://example.com'])
    expect(result.type).toBe('other')
  })

  it('handles --save-dev flag', () => {
    const result = parsePnpmArgs(['add', '--save-dev', 'lodash'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('lodash')
    expect(result.flags).toContain('--save-dev')
  })
})
