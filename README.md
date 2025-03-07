# Whisper API Service

A real-time transcription service that uses WebSockets and Whisper models for speech-to-text from audio streaming.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/whisper-api-service.git
cd whisper-api-service
```

2. Install the dependencies:
```bash
pip install -r requirements.txt
```

3. Start the service:
```bash
uvicorn src.api.routes:app --reload
```
or
```bash
python main.py
```
## Usage

The "test" folder contains example usage.

## TODO:
- add python usage example
