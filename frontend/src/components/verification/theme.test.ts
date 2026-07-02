import { describe, it, expect } from 'vitest'
import { resolveThemeVars, PB_FONT_MAP } from './theme'

describe('resolveThemeVars', () => {
  it('maps set config fields to the correct CSS vars', () => {
    const vars = resolveThemeVars({
      backgroundColor: '#111',
      textColor: '#eee',
      cardBackgroundColor: '#222',
      fontFamily: 'inter',
    })
    expect(vars).toEqual({
      '--paper': '#111',
      '--ink': '#eee',
      '--panel': '#222',
      '--sans': '"Inter", system-ui, sans-serif',
    })
  })

  it('maps accentColor, mutedTextColor, and borderColor to their CSS var pairs', () => {
    const vars = resolveThemeVars({
      accentColor: '#abcdef',
      mutedTextColor: '#123456',
      borderColor: '#654321',
    })
    expect(vars).toEqual({
      '--accent': '#abcdef',
      '--accent-ink': '#abcdef',
      '--mid': '#123456',
      '--soft': '#123456',
      '--rule': '#654321',
      '--rule-strong': '#654321',
    })
  })

  it('omits unset fields so the global defaults apply', () => {
    expect(resolveThemeVars({ textColor: '#eee' })).toEqual({ '--ink': '#eee' })
    expect(resolveThemeVars({})).toEqual({})
  })

  it('does not override --mono (monospace accents preserved)', () => {
    const vars = resolveThemeVars({ fontFamily: 'dm-sans' })
    expect(vars['--sans']).toContain('DM Sans')
    expect(vars['--mono']).toBeUndefined()
  })

  it('PB_FONT_MAP has the three font stacks', () => {
    expect(PB_FONT_MAP['dm-sans']).toContain('DM Sans')
    expect(PB_FONT_MAP['inter']).toContain('Inter')
    expect(PB_FONT_MAP['system']).toContain('system-ui')
  })
})
