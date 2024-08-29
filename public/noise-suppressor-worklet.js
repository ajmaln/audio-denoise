class NoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.sampleLength = options.processorOptions.sampleLength;
    this.inputBuffer = new Float32Array(this.sampleLength);
    this.inputBufferIndex = 0;
    console.log('NoiseSuppressorProcessor initialized');
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        this.inputBuffer[this.inputBufferIndex] = inputChannel[i];
        this.inputBufferIndex++;

        if (this.inputBufferIndex === this.sampleLength) {
          this.port.postMessage({ audioFrame: this.inputBuffer });
          this.inputBufferIndex = 0;
        }

        outputChannel[i] = inputChannel[i]; // Pass through audio for now
      }
    }

    return true;
  }
}

registerProcessor('noise-suppressor-processor', NoiseSuppressorProcessor);
