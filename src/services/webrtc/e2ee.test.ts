import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// e2ee.ts imports BaseKeyProvider + createKeyMaterialFromBuffer from livekit-client
// and creates an e2ee worker. Mock both, plus capture every dev* log line, so we can
// assert provider configuration, key-index rotation order, and that key material is
// never logged — without booting LiveKit or a real Worker.
const hoisted = vi.hoisted(() => ({
  onSetEncryptionKey: vi.fn<(material: unknown, identity: unknown, keyIndex: number | undefined) => void>(),
  createKeyMaterialFromBuffer: vi.fn(async (buffer: ArrayBuffer) => ({ material: buffer })),
  ctorOptions: [] as Array<Record<string, unknown>>,
  logs: [] as unknown[][],
}))

vi.mock('livekit-client', () => {
  class BaseKeyProvider {
    constructor(options: Record<string, unknown>) {
      hoisted.ctorOptions.push(options)
    }

    onSetEncryptionKey(material: unknown, identity: unknown, keyIndex?: number) {
      hoisted.onSetEncryptionKey(material, identity, keyIndex)
    }
  }
  return {
    BaseKeyProvider,
    createKeyMaterialFromBuffer: hoisted.createKeyMaterialFromBuffer,
  }
})

vi.mock('@/src/utils/safeLogger', () => ({
  devLog: (...args: unknown[]) => hoisted.logs.push(args),
  devWarn: (...args: unknown[]) => hoisted.logs.push(args),
  devError: (...args: unknown[]) => hoisted.logs.push(args),
}))

import { applyE2EEKey, resetE2EEKeyProvider, setupE2EE } from './e2ee'

// A recognizable, decodable secret so we can prove it never reaches the logs.
const SECRET_PLAINTEXT = 'SECRET-KEY-MATERIAL-DO-NOT-LOG'
const SECRET_B64 = btoa(SECRET_PLAINTEXT)

class FakeWorker {
  terminate = vi.fn()
}

beforeEach(() => {
  hoisted.onSetEncryptionKey.mockClear()
  hoisted.createKeyMaterialFromBuffer.mockClear()
  hoisted.ctorOptions.length = 0
  hoisted.logs.length = 0
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)
})

afterEach(() => {
  resetE2EEKeyProvider()
  vi.unstubAllGlobals()
})

/** The keyIndex passed to onSetEncryptionKey, in call order. */
function setKeyIndexCalls(): Array<number | undefined> {
  return hoisted.onSetEncryptionKey.mock.calls.map((call) => call[2])
}

describe('e2ee provider setup', () => {
  it('configures a shared-key provider with no ratchet window and the keyring size', async () => {
    await setupE2EE(SECRET_B64, 0)

    expect(hoisted.ctorOptions).toHaveLength(1)
    expect(hoisted.ctorOptions[0]).toMatchObject({
      sharedKey: true,
      ratchetWindowSize: 0,
      failureTolerance: -1,
      keyringSize: 16,
    })
  })

  it('installs the initial key at its index before returning the room options', async () => {
    const options = await setupE2EE(SECRET_B64, 3)

    // Key was set during setup (i.e. before setE2EEEnabled/connect would run).
    expect(setKeyIndexCalls()).toEqual([3])
    // Shared key => no participant identity.
    expect(hoisted.onSetEncryptionKey.mock.calls[0][1]).toBeUndefined()
    expect(options.keyProvider).toBeDefined()
    expect(options.worker).toBeInstanceOf(FakeWorker)
  })

  it('throws on a missing key instead of silently disabling encryption', async () => {
    await expect(setupE2EE('', 0)).rejects.toThrow('missing_e2ee_key')
  })
})

describe('e2ee key rotation', () => {
  it('installs each rotated key at its own index in the order received', async () => {
    await setupE2EE(SECRET_B64, 0)

    await applyE2EEKey(SECRET_B64, 1)
    await applyE2EEKey(SECRET_B64, 2)

    // Old indices are not overwritten — each rotation lands on a distinct index,
    // which is what lets in-flight frames keep decrypting during the grace window.
    expect(setKeyIndexCalls()).toEqual([0, 1, 2])
  })

  it('serializes rapid rotations so the latest index is applied last', async () => {
    await setupE2EE(SECRET_B64, 0)

    const first = applyE2EEKey(SECRET_B64, 5)
    const second = applyE2EEKey(SECRET_B64, 6)
    await Promise.all([first, second])

    expect(setKeyIndexCalls()).toEqual([0, 5, 6])
  })

  it('wraps key indices into the keyring (mod 16)', async () => {
    await setupE2EE(SECRET_B64, 0)
    await applyE2EEKey(SECRET_B64, 17)

    expect(setKeyIndexCalls()).toEqual([0, 1])
  })

  it('no-ops a rotation when no provider is active (after reset)', async () => {
    await setupE2EE(SECRET_B64, 0)
    resetE2EEKeyProvider()
    hoisted.onSetEncryptionKey.mockClear()

    await applyE2EEKey(SECRET_B64, 4)

    expect(hoisted.onSetEncryptionKey).not.toHaveBeenCalled()
  })
})

describe('e2ee observability', () => {
  it('logs the key index but never the key material', async () => {
    await setupE2EE(SECRET_B64, 7)
    await applyE2EEKey(SECRET_B64, 8)

    const serialized = JSON.stringify(hoisted.logs)
    expect(serialized).not.toContain(SECRET_B64)
    expect(serialized).not.toContain(SECRET_PLAINTEXT)
    // The index is still observable for debugging rotations.
    expect(serialized).toContain('"keyIndex":8')
  })
})

describe('e2ee teardown', () => {
  it('terminates the worker and drops the provider on reset', async () => {
    const options = await setupE2EE(SECRET_B64, 0)
    const worker = options.worker as unknown as FakeWorker

    resetE2EEKeyProvider()

    expect(worker.terminate).toHaveBeenCalledTimes(1)
  })
})
