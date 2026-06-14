import { describe, expect, it } from 'vitest'
import { isDuplicateInFlightVoiceJoin } from './voiceTransitionPolicy'

const target = { hubId: 'hub-a', channelId: 'channel-a' }

describe('voice transition policy', () => {
    it('suppresses repeated same-target joins while the transition is active', () => {
        expect(isDuplicateInFlightVoiceJoin({
            id: 7,
            kind: 'join',
            phase: 'awaiting_token',
            to: target,
        }, target)).toBe(true)
    })

    it('suppresses forced same-target joins because force does not bypass in-flight dedupe', () => {
        expect(isDuplicateInFlightVoiceJoin({
            id: 8,
            kind: 'takeover',
            phase: 'joining',
            to: target,
        }, target)).toBe(true)
    })

    it('allows a fresh same-target join after the previous transition completes', () => {
        expect(isDuplicateInFlightVoiceJoin({
            id: 9,
            kind: 'join',
            phase: 'completed',
            to: target,
        }, target)).toBe(false)
    })

    it('allows a different target or a non-join transition', () => {
        expect(isDuplicateInFlightVoiceJoin({
            id: 10,
            kind: 'switch',
            phase: 'joining',
            to: target,
        }, { hubId: 'hub-a', channelId: 'channel-b' })).toBe(false)
        expect(isDuplicateInFlightVoiceJoin({
            id: 11,
            kind: 'leave',
            phase: 'leaving',
            to: target,
        }, target)).toBe(false)
    })
})
