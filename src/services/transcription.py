from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import numpy as np
import asyncio
from src.config import Config

# Device e configurazione
device = Config.DEVICE
torch_dtype = Config.TORCH_DTYPE
sample_rate = Config.RATE
model_id = Config.MODEL_ID
lang = Config.LANG

model = AutoModelForSpeechSeq2Seq.from_pretrained(
    model_id, torch_dtype=torch_dtype, low_cpu_mem_usage=True, use_safetensors=True
)
model.to(device)
processor = AutoProcessor.from_pretrained(model_id)

# Pipeline per la trascrizione
pipe = pipeline(
    "automatic-speech-recognition",
    model=model,
    tokenizer=processor.tokenizer,
    feature_extractor=processor.feature_extractor,
    torch_dtype=torch_dtype,
    device=device,
)

async def process_realtime_audio(audio_data, sampling_rate=sample_rate):
    """Process audio chunk in real time."""
 
    if audio_data.size == 0:
        return "No audio data"
    
    audio_input = {"array": audio_data, "sampling_rate": sampling_rate}
    
    # Allow the server to not block requests while processing the audio data (ie., to process multiple requests at the same time)
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None, 
            lambda: pipe(
                audio_input,
                generate_kwargs={"language": lang},
                #chunk_length_s=10 #maximum chunk length (10s), this should be fixed in accordance to the client's chunk length
            )
        )
        
        return result["text"]
    except Exception as e:
        print(f"Transcribing error: {str(e)}")
        return f"Errore: {str(e)}"