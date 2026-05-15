import { describe, it, expect } from 'vitest'
import { parseNpmArgs } from '../npm'

describe('parseNpmArgs', () => {
  it('detects npm install <package>', () => {
    const result = parseNpmArgs(['install', 'react-markdown'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react-markdown')
  })

  it('detects npm i shorthand', () => {
    const result = parseNpmArgs(['i', 'lodash'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('lodash')
  })

  it('returns other for npm run', () => {
    const result = parseNpmArgs(['run', 'dev'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for npm test', () => {
    const result = parseNpmArgs(['test'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('returns other for npm start', () => {
    const result = parseNpmArgs(['start'])
    expect(result.type).toBe('other')
    expect(result.packages).toHaveLength(0)
  })

  it('handles flags like --save-dev', () => {
    const result = parseNpmArgs(['install', '--save-dev', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
  })

  it('handles -D shorthand flag', () => {
    const result = parseNpmArgs(['install', '-D', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
  })

  it('handles multiple packages', () => {
    const result = parseNpmArgs(['install', 'react', 'react-dom'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(2)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[1].name).toBe('react-dom')
  })

  it('handles scoped packages', () => {
    const result = parseNpmArgs(['install', '@scope/package'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
  })

  it('handles scoped package with version', () => {
    const result = parseNpmArgs(['install', '@scope/package@1.2.3'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('@scope/package')
    expect(result.packages[0].version).toBe('1.2.3')
  })

  it('handles version specifiers', () => {
    const result = parseNpmArgs(['install', 'react@18.2.0'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('react')
    expect(result.packages[0].version).toBe('18.2.0')
  })

  it('handles no-arg install (from package.json)', () => {
    const result = parseNpmArgs(['install'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(0)
  })

  it('handles global install', () => {
    const result = parseNpmArgs(['install', '-g', 'typescript'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('typescript')
  })

  it('returns other for exec', () => {
    const result = parseNpmArgs(['exec', 'jest'])
    expect(result.type).toBe('other')
  })

  it('returns other for create', () => {
    const result = parseNpmArgs(['create', 'vite'])
    expect(result.type).toBe('other')
  })

  it('handles npm add (yarn-style alias)', () => {
    const result = parseNpmArgs(['add', 'axios'])
    expect(result.type).toBe('install')
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0].name).toBe('axios')
  })

  it('returns other for npm help install', () => {
    const result = parseNpmArgs(['help', 'install'])
    expect(result.type).toBe('other')
  })

  it('returns other for npm config set registry', () => {
    const result = parseNpmArgs(['config', 'set', 'registry', 'https://example.com'])
    expect(result.type).toBe('other')
  })

  it('returns other for npm cache clean', () => {
    const result = parseNpmArgs(['cache', 'clean'])
    expect(result.type).toBe('other')
  })

  it('returns other for npm install (help-like)', () => {
    const result = parseNpmArgs(['help', 'install', 'express'])
    expect(result.type).toBe('other')
  })

  it('returns other for npm doctor', () => {
    const result = parseNpmArgs(['doctor'])
    expect(result.type).toBe('other')
  })

  it('returns other for npm init', () => {
    const result = parseNpmArgs(['init'])
    expect(result.type).toBe('other')
  })
})
