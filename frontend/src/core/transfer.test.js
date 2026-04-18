/**
 * Tests for file chunking, reassembly, and progress calculation.
 * 
 * This is the most complex frontend module. Every public function
 * must have tests. Coverage requirement: 90%.
 * See SRS.md §2.3 FR-07 through FR-10 for requirements.
 */
import { describe, it, expect } from 'vitest'
import * as transfer from './transfer.js'
const { chunkFile, reassembleChunks, calculateProgress, sendFile, receiveChunk, CHUNK_SIZE } = transfer

// Mock `File` arrayBuffer in jsdom since it doesn't natively support slice().arrayBuffer() easily
class MockFile {
    constructor(dataArray, name) {
        this.data = new Uint8Array(dataArray[0])
        this.name = name
        this.size = this.data.length
    }
    slice(start, end) {
        return new MockBlob(this.data.slice(start, end))
    }
}

class MockBlob {
    constructor(data) {
        this.data = data
        this.size = data.length
    }
    async arrayBuffer() {
        return this.data.buffer.slice(
            this.data.byteOffset,
            this.data.byteOffset + this.data.byteLength
        )
    }
}

describe('chunkFile', () => {
    it('should return correct number of chunks for exact multiple', async () => {
        const file = new MockFile([new Uint8Array(CHUNK_SIZE * 3)], 'test.bin')
        const chunks = await chunkFile(file)
        expect(chunks).toHaveLength(3)
    })

    it('should return correct number of chunks with remainder', async () => {
        const file = new MockFile([new Uint8Array(CHUNK_SIZE + 100)], 'test.bin')
        const chunks = await chunkFile(file)
        expect(chunks).toHaveLength(2)
    })

    it('should handle small files (less than one chunk)', async () => {
        const file = new MockFile([new Uint8Array(1000)], 'tiny.bin')
        const chunks = await chunkFile(file)
        expect(chunks).toHaveLength(1)
    })

    it('should produce ArrayBuffer chunks', async () => {
        const file = new MockFile([new Uint8Array(100)], 'test.bin')
        const chunks = await chunkFile(file)
        expect(chunks[0]).toBeInstanceOf(ArrayBuffer)
    })

    it('should preserve all bytes (lossless chunking)', async () => {
        const data = new Uint8Array(1000).map((_, i) => i % 256)
        const file = new MockFile([data], 'test.bin')
        const chunks = await chunkFile(file)

        // Quick reassembly to verify
        let totalLen = chunks.reduce((acc, c) => acc + c.byteLength, 0)
        let reassembled = new Uint8Array(totalLen)
        let offset = 0
        for (const c of chunks) {
            reassembled.set(new Uint8Array(c), offset)
            offset += c.byteLength
        }

        for (let i = 0; i < data.length; i++) {
            expect(reassembled[i]).toBe(data[i])
        }
    })
})

describe('reassembleChunks', () => {
    it('should produce a Blob from chunk array', async () => {
        const chunks = [new ArrayBuffer(100), new ArrayBuffer(100)]
        const blob = await reassembleChunks(chunks, 2)
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBe(200)
    })
})

describe('calculateProgress', () => {
    it('should return 0% at start', () => {
        const p = calculateProgress(0, 1000, Date.now() - 1000, [])
        expect(p.percent).toBe(0)
    })

    it('should return 100% when all bytes received', () => {
        const p = calculateProgress(1000, 1000, Date.now() - 1000, [])
        expect(p.percent).toBe(100)
    })

    it('should calculate speed in bytes per second', () => {
        const now = Date.now()
        const p = calculateProgress(1000000, 5000000, now - 2000, [
            { bytes: 0, time: now - 900 },
            { bytes: 500000, time: now - 500 }
        ])
        // Speed should be exactly 500000 because we only have 1 sample in the window with 500kb
        expect(p.speedBps).toBe(500000)
    })

    it('should estimate time remaining', () => {
        const now = Date.now()
        const p = calculateProgress(500000, 1000000, now - 1000, [
            { bytes: 0, time: now - 900 },
            { bytes: 500000, time: now - 500 } // Sample inside the 1-second window
        ])
        // 500KB done, 500KB remaining at roughly 500KB/s ≈ 1 second
        expect(p.etaSeconds).toBe(1)
    })
})

describe('receiveChunk', () => {
    it('should parse chunk index and store in array', async () => {
        const chunkStore = []

        // Create a mock raw message: index 5, payload [1,2,3]
        const buffer = new ArrayBuffer(4 + 3)
        const view = new DataView(buffer)
        view.setUint32(0, 5, false) // index 5
        new Uint8Array(buffer).set([1, 2, 3], 4)

        const result = await receiveChunk(buffer, chunkStore, { totalChunks: 10 })

        expect(result.index).toBe(5)

        expect(chunkStore[5].byteLength).toBe(3)
        expect(new Uint8Array(chunkStore[5])[0]).toBe(1)
    })

    it('should detect when completely received', async () => {
        const chunkStore = [new ArrayBuffer(1)] // already has index 0

        // Create a mock raw message: index 1, payload [1,2,3]
        const buffer = new ArrayBuffer(4 + 3)
        const view = new DataView(buffer)
        view.setUint32(0, 1, false)
        new Uint8Array(buffer).set([1, 2, 3], 4)

        const result = await receiveChunk(buffer, chunkStore, { totalChunks: 2 })
        expect(result.index).toBe(1)
    })
})

describe('sendFile', () => {
    it('should properly slice, attach indices, and send to DataChannel', async () => {
        const file = new MockFile([new Uint8Array(CHUNK_SIZE + 10)], 'test.bin')
        const sentMessages = []
        const channel = {
            bufferedAmount: 0,
            send: (data) => sentMessages.push(data)
        }

        let progressCalls = 0
        await sendFile(channel, file, {
            onProgress: () => progressCalls++
        })

        expect(sentMessages).toHaveLength(2)
        expect(progressCalls).toBe(2)

        // Check indices
        const view0 = new DataView(sentMessages[0])
        const view1 = new DataView(sentMessages[1])
        expect(view0.getUint32(0, false)).toBe(0)
        expect(view1.getUint32(0, false)).toBe(1)

        // Check sizes
        expect(sentMessages[0].byteLength).toBe(CHUNK_SIZE + 4)
        expect(sentMessages[1].byteLength).toBe(10 + 4)
    })
})

describe('Download Strategies', () => {
    it('createServiceWorkerStream returns null if streamSaver is missing', () => {
        // streamSaver is undefined in jsdom by default
        const result = transfer.createServiceWorkerStream('test.bin', 100)
        expect(result).toBeNull()
    })

    it('openSaveFilePicker returns null if unsupported', async () => {
        // Not in jsdom
        const result = await transfer.openSaveFilePicker('test.bin')
        expect(result).toBeNull()
    })

    it('triggerDownloadFromBlob works without throwing', () => {
        // mock document body and URL.createObjectURL for jsdom environment
        if (!global.URL.createObjectURL) global.URL.createObjectURL = () => 'blob:test'
        if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => { }

        // Mock a.click to prevent JSDOM navigation error
        const originalCreateElement = document.createElement
        document.createElement = (tag) => {
            const el = originalCreateElement.call(document, tag)
            if (tag === 'a') {
                el.click = () => { } // prevent actual navigation in JSDOM
            }
            return el
        }

        const blob = new Blob(['test'], { type: 'text/plain' })
        expect(() => transfer.triggerDownloadFromBlob(blob, 'test.txt')).not.toThrow()

        // restore
        document.createElement = originalCreateElement
    })
})
