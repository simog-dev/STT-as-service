import torch

class Config:
    MODEL_ID = "openai/whisper-small"
    LANG = "en" #Small model only supports English
    RATE = 16000
    #The CHUNK and MAX_SILENCE_DURATION and THRESHOLD parameters need to be set by the client based on its requirements
    #CHUNK = 1024
    #MAX_SILENCE_DURATION = 2.0
    #SILENCE_THRESHOLD = 500
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    TORCH_DTYPE = torch.float16 if torch.cuda.is_available() else torch.float32