import { describe, it, expect } from 'vitest'
import { parseBunArgs } from '../bun'

describe('parseBunArgs', () => {
  it('detects bun add <package>', () => {
    const result = parseBunArgs(['add', 'lodash'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('lodash')
  })

  it('detects bun install', () => {
    const result = parseBunArgs(['install'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(0)
  })

  it('detects bun i shorthand', () => {
    const result = parseBunArgs(['i'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(0)
  })

  it('detects bun i <package>', () => {
    const result = parseBunArgs(['i', 'react'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react')
  })

  it('handles -d dev flag (bun specific)', () => {
    const result = parseBunArgs(['add', '-d', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
    expect(result.flags).toContain('-d')
  })

  it('handles --dev flag', () => {
    const result = parseBunArgs(['add', '--dev', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
    expect(result.flags).toContain('--dev')
  })

  it('handles multiple packages with add', () => {
    const result = parseBunArgs(['add', 'react', 'react-dom'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(2)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[1].name).toBe('react-dom')
  })

  it('handles scoped packages', () => {
    const result = parseBunArgs(['add', '@scope/package'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
  })

  it('handles scoped package with version', () => {
    const result = parseBunArgs(['add', '@scope/package@1.2.3'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
    expect(result.packages[0].version).toBe('1.2.3')
  })

  it('handles version specifiers', () => {
    const result = parseBunArgs(['add', 'react@18.2.0'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[0].version).toBe('18.2.0')
  })

  it('returns other for bun run', () => {
    const result = parseBunArgs(['run', 'dev'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for bun test', () => {
    const result = parseBunArgs(['test'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for bun start', () => {
    const result = parseBunArgs(['start'])
    expect(result.type).toBe('other')
  })

  it('returns other for bun build', () => {
    const result = parseBunArgs(['build', '--target', 'bun'])
    expect(result.type).toBe('other')
  })

  it('returns other for bun x', () => {
    const result = parseBunArgs(['x', 'create-vite'])
    expect(result.type).toBe('other')
  })

  it('returns other for bun pm', () => {
    const result = parseBunArgs(['pm', 'cache', 'ls'])
    expect(result.type).toBe('other')
  })

  it('returns other for bun help add', () => {
    const result = parseBunArgs(['help', 'add'])
    expect(result.type).toBe('other')
  })

  it('returns other for bun upgrade', () => {
    const result = parseBunArgs(['upgrade'])
    expect(result.type).toBe('other')
  })
})
