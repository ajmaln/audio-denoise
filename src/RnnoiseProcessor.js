 

/**
 * Constant. Rnnoise default sample size, samples of different size won't work.
 */
export const RNNOISE_SAMPLE_LENGTH = 480;

/**
 *  Constant. Rnnoise only takes inputs of 480 PCM float32 samples thus 480*4.
 */
const RNNOISE_BUFFER_SIZE = RNNOISE_SAMPLE_LENGTH * 4;

/**
 *  Constant. Rnnoise only takes operates on 44.1Khz float 32 little endian PCM.
 */
const PCM_FREQUENCY = 44100;

/**
 * Used to shift a 32 bit number by 16 bits.
 */
const SHIFT_16_BIT_NR = 32768;

/**
 * Represents an adaptor for the rnnoise library compiled to webassembly. The class takes care of webassembly
 * memory management and exposes rnnoise functionality such as PCM audio denoising and VAD (voice activity
 * detection) scores.
 */
export default class RnnoiseProcessor {
    /**
     * Constructor.
     *
     * @class
     * @param {Object} wasmInterface - WebAssembly module interface that exposes rnnoise functionality.
     */
    constructor(wasmInterface) {
        // Considering that we deal with dynamic allocated memory employ exception safety strong guarantee
        // i.e. in case of exception there are no side effects.
        try {
            this._wasmInterface = wasmInterface;

            // For VAD score purposes only allocate the buffers once and reuse them
            this._wasmPcmInput = this._wasmInterface._malloc(RNNOISE_BUFFER_SIZE);

            this._wasmPcmInputF32Index = this._wasmPcmInput >> 2;

            if (!this._wasmPcmInput) {
                throw Error('Failed to create wasm input memory buffer!');
            }

            this._context = this._wasmInterface._rnnoise_create();
            this._destroyed = false;
        } catch (error) {
            // release can be called even if not all the components were initialized.
            this.destroy();
            throw error;
        }
    }

    /**
     * Release resources associated with the wasm context. If something goes downhill here
     * i.e. Exception is thrown, there is nothing much we can do.
     */
    _releaseWasmResources() {
        // For VAD score purposes only allocate the buffers once and reuse them
        if (this._wasmPcmInput) {
            this._wasmInterface._free(this._wasmPcmInput);
        }

        if (this._context) {
            this._wasmInterface._rnnoise_destroy(this._context);
        }
    }

    /**
     * Rnnoise can only operate on a certain PCM array size.
     *
     * @returns {number} - The PCM sample array size as required by rnnoise.
     */
    getSampleLength() {
        return RNNOISE_SAMPLE_LENGTH;
    }

    /**
     * Rnnoise can only operate on a certain format of PCM sample namely float 32 44.1Kz.
     *
     * @returns {number} - PCM sample frequency as required by rnnoise.
     */
    getRequiredPCMFrequency() {
        return PCM_FREQUENCY;
    }

    /**
     * Release any resources required by the rnnoise context this needs to be called
     * before destroying any context that uses the processor.
     */
    destroy() {
        // Attempting to release a non initialized processor, do nothing.
        if (this._destroyed) {
            return;
        }

        this._releaseWasmResources();

        this._destroyed = true;
    }

    /**
     * Calculate the Voice Activity Detection for a raw Float32 PCM sample Array.
     * The size of the array must be of exactly 480 samples, this constraint comes from the rnnoise library.
     *
     * @param {Float32Array} pcmFrame - Array containing 32 bit PCM samples.
     * @returns {number} Contains VAD score in the interval 0 - 1 i.e. 0.90.
     */
    calculateAudioFrameVAD(pcmFrame) {
        return this.processAudioFrame(pcmFrame);
    }

    /**
     * Process an audio frame, optionally denoising the input pcmFrame and returning the Voice Activity Detection score
     * for a raw Float32 PCM sample Array.
     * The size of the array must be of exactly 480 samples, this constraint comes from the rnnoise library.
     *
     * @param {Float32Array} pcmFrame - Array containing 32 bit PCM samples. Parameter is also used as output
     * when {@code shouldDenoise} is true.
     * @param {boolean} shouldDenoise - Should the denoised frame be returned in pcmFrame.
     * @returns {number} Contains VAD score in the interval 0 - 1 i.e. 0.90 .
     */
    processAudioFrame(pcmFrame, shouldDenoise = false) {
        console.log('Processing audio frame', shouldDenoise, pcmFrame);
        // Convert 32 bit Float PCM samples to 16 bit Float PCM samples as that's what rnnoise accepts as input
        for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
            this._wasmInterface.HEAPF32[this._wasmPcmInputF32Index + i] = pcmFrame[i] * SHIFT_16_BIT_NR;
        }

        // Use the same buffer for input/output, rnnoise supports this behavior
        const vadScore = this._wasmInterface._rnnoise_process_frame(
            this._context,
            this._wasmPcmInput,
            this._wasmPcmInput
        );

        // Rnnoise denoises the frame by default but we can avoid unnecessary operations if the calling
        // client doesn't use the denoised frame.
        if (shouldDenoise) {
            // Convert back to 32 bit PCM
            for (let i = 0; i < RNNOISE_SAMPLE_LENGTH; i++) {
                pcmFrame[i] = this._wasmInterface.HEAPF32[this._wasmPcmInputF32Index + i] / SHIFT_16_BIT_NR;
            }
        }

        return vadScore;
    }
}