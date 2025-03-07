from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from src.services.transcription import process_realtime_audio
import numpy as np
import base64
import json
from src.config import Config
sample_rate = Config.RATE

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Fix for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/transcribe/realtime")
async def websocket_endpoint(websocket: WebSocket):
    """Endpoint WebSocket for real-time transcription."""
    try:
        await websocket.accept()
        print("Client WebSocket connected")
        buffer = []
        
        while True:
            try:
                data = await websocket.receive_text()
                try:
                    audio_data = json.loads(data)
                    if "audio" not in audio_data:
                        await websocket.send_json({"error": "Invalid format: 'audio' missing"})
                        continue
                        
                    audio_bytes = base64.b64decode(audio_data["audio"])
                    
                    sampling_rate = audio_data.get("sampling_rate", sample_rate)
                    
                    # Normalize to an array of [0., 1.] (assuming int16)
                    audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                    
                    # Verifica che l'audio non sia costante o silenzioso
                    if np.max(np.abs(audio_array)) < 0.005:
                        print("Skipping, audio too weak")
                        continue
                    
                except Exception as e:
                    error_msg = f"Error while elaborating audio data: {str(e)}"
                    print(error_msg)
                    await websocket.send_json({"error": error_msg})
                    continue

                buffer.append(audio_array)
                combined_audio = np.concatenate(buffer)
                
                transcription = await process_realtime_audio(combined_audio, sampling_rate)
                await websocket.send_json({"transcription": transcription})
                #print(f"Trascription: {transcription}")
                #buffer = buffer[-1:] #This line maintains the last chunk in the buffer to overlap with the next chunk
                buffer = [] #But we don't want to overlap the chunks, so we clear the buffer after processing
                    
            except json.JSONDecodeError:
                await websocket.send_json({"error": "JSON Data not valid"})
            except Exception as e:
                await websocket.send_json({"error": str(e)})
                
    except WebSocketDisconnect:
        print("Client WebSocket disconnected")
    except Exception as e:
        print(f"Error WebSocket: {str(e)}")

@app.get("/")
def read_root():
    return {
        "message": "Whisper API Service", 
        "endpoints": {
            "WebSocket /transcribe/realtime": "Trascrizione in tempo reale"
        }
    }