import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting Whisper API Service")
    uvicorn.run("src.api.routes:app", 
                host="0.0.0.0", 
                port=8000, 
                reload=True)