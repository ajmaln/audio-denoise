import { useState, useRef, useEffect } from 'react'
import './App.css'
import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';
import RnnoiseProcessor, { RNNOISE_SAMPLE_LENGTH } from './RnnoiseProcessor';

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [audioBlob, setAudioBlob] = useState(null);
  const [isRNNoiseReady, setIsRNNoiseReady] = useState(false);
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(true);
  const mediaRecorder = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const rnnoiseProcessorRef = useRef(null);
  const workletModuleLoadedRef = useRef(false);

  useEffect(() => {
    const initRNNoise = async () => {
      try {
        const wasmInterface = await createRNNWasmModuleSync();
        rnnoiseProcessorRef.current = new RnnoiseProcessor(wasmInterface);
        setIsRNNoiseReady(true);
      } catch (error) {
        console.error('Failed to initialize RNNoise:', error);
      }
    };

    initRNNoise();

    return () => {
      cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (rnnoiseProcessorRef.current) {
        rnnoiseProcessorRef.current.destroy();
      }
    };
  }, []);

  const startRecording = async () => {
    if (!isRNNoiseReady) {
      console.error('RNNoise is not ready yet');
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: rnnoiseProcessorRef.current.getRequiredPCMFrequency()
      });
      
      if (!workletModuleLoadedRef.current) {
        try {
          await audioContextRef.current.audioWorklet.addModule('nn-suppressor-worklet.js');
          workletModuleLoadedRef.current = true;
        } catch (error) {
          console.error('Failed to load audio worklet:', error);
          return;
        }
      }
    }

    try {
      await audioContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      const noiseSuppressorNode = new AudioWorkletNode(audioContextRef.current, 'nn-suppressor-processor', {
        processorOptions: {
          sampleLength: RNNOISE_SAMPLE_LENGTH
        }
      });
      
      noiseSuppressorNode.port.postMessage({ command: 'setNoiseSuppressionEnabled', enabled: isNoiseSuppressionEnabled });
      
      sourceRef.current.connect(noiseSuppressorNode);

      const destinationStream = audioContextRef.current.createMediaStreamDestination();
      noiseSuppressorNode.connect(destinationStream);

      mediaRecorder.current = new MediaRecorder(destinationStream.stream);
      mediaRecorder.current.start();

      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      noiseSuppressorNode.connect(analyserRef.current);

      const audioChunks = [];
      mediaRecorder.current.addEventListener("dataavailable", (event) => {
        audioChunks.push(event.data);
      });

      mediaRecorder.current.addEventListener("stop", () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioURL(audioUrl);
        setAudioBlob(audioBlob);
      });

      setIsRecording(true);
      visualize();
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
    }
    setIsRecording(false);
    cancelAnimationFrame(animationRef.current);
  };

  const visualize = () => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    analyserRef.current.fftSize = 2048;
    const bufferLength = analyserRef.current.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyserRef.current.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

      canvasCtx.beginPath();

      const sliceWidth = WIDTH * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * HEIGHT / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  };

  const toggleNoiseSuppression = () => {
    setIsNoiseSuppressionEnabled(!isNoiseSuppressionEnabled);
    if (noiseSuppressorNode) {
      noiseSuppressorNode.port.postMessage({ command: 'setNoiseSuppressionEnabled', enabled: !isNoiseSuppressionEnabled });
    }
  };

  return (
    <>
      <h1>Record audio with noise suppression</h1>
      <button onClick={isRecording ? stopRecording : startRecording} disabled={!isRNNoiseReady}>
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      <button onClick={toggleNoiseSuppression} disabled={isRecording}>
        Noise Suppression: {isNoiseSuppressionEnabled ? 'ON' : 'OFF'}
      </button>
      <canvas ref={canvasRef} width="300" height="150" />
      {audioURL && (
        <>
          <audio src={audioURL} controls>
            Your browser does not support the audio element.
          </audio>
          {audioBlob && (
            <a
              href={URL.createObjectURL(audioBlob)}
              download="recorded_audio.webm"
            >
              Download Recording
            </a>
          )}
        </>
      )}
    </>
  )
}

export default App
