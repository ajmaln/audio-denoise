import { useState } from "react";
import AudioRecorder from "./AudioRecorder"

const App = () => {
  const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState(true);

  return <AudioRecorder key={isNoiseSuppressionEnabled} isNoiseSuppressionEnabled={isNoiseSuppressionEnabled} setIsNoiseSuppressionEnabled={setIsNoiseSuppressionEnabled} />
}

export default App;