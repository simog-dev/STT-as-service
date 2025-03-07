// Elementi UI
const connectBtn = document.getElementById('connectBtn');
const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
const micSelect = document.getElementById('micSelect');
const bufferSizeSecondsInput = document.getElementById('bufferSizeSeconds');
const micBtn = document.getElementById('micBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const transcriptionEl = document.getElementById('transcription');
const logEl = document.getElementById('log');

// Variabili globali
let ws;
let isRecording = false;
let audioContext;
let mediaStream;
let sourceNode;
let processorNode;

// Variabili per il rilevamento del silenzio
let audioBuffer = [];
let silenceStartTime = 0;
let isSilence = true;  // Start assuming silence
const SILENCE_THRESHOLD = 0.10;  // Livello audio considerato silenzio
const SILENCE_DURATION = 1000;   // Durata del silenzio in ms (1 secondo)
let bufferTotalSamples = 0;      // Contatore dei campioni totali nel buffer
let isBuffering = false;         // Flag to track if we're actively buffering speech

// Funzione per aggiungere log
function addLog(message) {
    const now = new Date().toLocaleTimeString();
    logEl.innerHTML += `[${now}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
    console.log(message);
}

// Carica i dispositivi audio disponibili
async function loadAudioDevices() {
    try {
        micSelect.innerHTML = '<option value="">Caricamento...</option>';
        micSelect.disabled = true;
        
        // Ottieni l'elenco dei dispositivi multimediali
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filtra solo i dispositivi di input audio (microfoni)
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        // Svuota il menu a discesa
        micSelect.innerHTML = '';
        
        if (audioInputs.length === 0) {
            micSelect.innerHTML = '<option value="">Nessun microfono trovato</option>';
            addLog('Nessun dispositivo di input audio trovato');
        } else {
            // Aggiungi ogni dispositivo come opzione
            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                
                // Usa un nome descrittivo se disponibile, altrimenti usa l'ID
                const label = device.label || `Microfono (${device.deviceId.substring(0, 8)}...)`;
                option.text = label;
                
                // Marca il dispositivo predefinito
                if (device.deviceId === 'default' || device.deviceId === '') {
                    option.text += ' (Predefinito)';
                    option.selected = true;
                }
                
                micSelect.appendChild(option);
            });
            
            addLog(`Trovati ${audioInputs.length} dispositivi di input audio`);
        }
        
        // Abilita il menu a discesa
        micSelect.disabled = false;
        
    } catch (error) {
        addLog(`Errore nel caricamento dei dispositivi: ${error.message}`);
        micSelect.innerHTML = '<option value="">Errore caricamento dispositivi</option>';
    }
}

// Connessione WebSocket
function connectWebSocket() {
    statusEl.textContent = 'Connessione...';
    
    ws = new WebSocket('ws://africa.isti.cnr.it:8000/transcribe/realtime');
    
    ws.onopen = () => {
        statusEl.textContent = 'Connesso al server';
        micBtn.disabled = false;
        connectBtn.disabled = true;
        
        // Carica i dispositivi dopo la connessione
        loadAudioDevices();
        
        addLog('WebSocket connesso');
    };
    
    ws.onclose = () => {
        statusEl.textContent = 'Disconnesso';
        micBtn.disabled = true;
        stopBtn.disabled = true;
        connectBtn.disabled = false;
        addLog('WebSocket disconnesso');
        
        if (isRecording) {
            stopRecording();
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            addLog(`Ricevuto: ${JSON.stringify(data).substring(0, 100)}...`);
            
            if (data.error) {
                addLog(`ERRORE: ${data.error}`);
            }
            
            if (data.transcription) {
                transcriptionEl.textContent = data.transcription;
            }
        } catch (e) {
            addLog(`Errore parsing risposta: ${e.message}`);
        }
    };
    
    ws.onerror = (error) => {
        addLog(`WebSocket error: ${error.message || 'Unknown error'}`);
        statusEl.textContent = 'Errore connessione';
    };
}

// Avvia registrazione microfono
async function startMicrophone() {
    try {
        // Ottieni l'ID del dispositivo selezionato
        const selectedDeviceId = micSelect.value;
        
        if (!selectedDeviceId) {
            addLog('Nessun dispositivo microfono selezionato');
            return;
        }
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        addLog(`AudioContext creato: sample rate=${audioContext.sampleRate}`);
        addLog(`Dispositivo selezionato: ${micSelect.options[micSelect.selectedIndex].text}`);
        
        // Configura le opzioni di acquisizione audio
        const constraints = {
            audio: {
                deviceId: { exact: selectedDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };
        
        // Richiedi l'accesso al microfono specifico
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        sourceNode = audioContext.createMediaStreamSource(mediaStream);
        
        // Crea un processor node per inviare i dati
        processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        
        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
        
        // Reset delle variabili di rilevamento silenzio
        audioBuffer = [];
        bufferTotalSamples = 0;
        silenceStartTime = 0;
        isSilence = true;  // Start in silence mode
        isBuffering = false;
        
        // Ottieni la dimensione massima del buffer in campioni
        const maxBufferSeconds = parseFloat(bufferSizeSecondsInput.value) || 10;
        const maxBufferSamples = maxBufferSeconds * audioContext.sampleRate;
        
        addLog(`Dimensione massima buffer: ${maxBufferSeconds}s (${maxBufferSamples} campioni)`);
        
        // Gestisce il processamento dell'audio
        processorNode.onaudioprocess = (e) => {
            if (!isRecording) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Controlla se c'è audio attivo (non solo silenzio)
            const audioLevel = Math.max(...Array.from(inputData).map(Math.abs));
            
            // Gestione del rilevamento silenzio/parlato
            if (audioLevel < SILENCE_THRESHOLD) {
                // Silenzio rilevato
                if (!isSilence) {
                    // Inizio del periodo di silenzio
                    isSilence = true;
                    silenceStartTime = Date.now();
                    addLog(`Inizio silenzio (livello: ${audioLevel.toFixed(4)})`);
                    
                    // Continuiamo ad accumulare per un breve periodo durante il silenzio iniziale
                    // in modo da catturare la fine naturale della frase
                    if (isBuffering) {
                        const audioArray = new Float32Array(inputData);
                        audioBuffer.push(audioArray);
                        bufferTotalSamples += audioArray.length;
                    }
                } else if (isBuffering && Date.now() - silenceStartTime >= SILENCE_DURATION) {
                    // Silenzio per la durata richiesta dopo il parlato, invia il buffer
                    if (bufferTotalSamples > 0) {
                        addLog(`${SILENCE_DURATION}ms di silenzio rilevati dopo parlato, invio buffer`);
                        sendAudioBuffer();
                        isBuffering = false;  // Stop buffering until we hear speech again
                    }
                }
            } else {
                // Parlato rilevato
                if (isSilence) {
                    isSilence = false;
                    if (!isBuffering) {
                        isBuffering = true;  // Start buffering when speech is first detected
                        
                        // Rimuovi qualsiasi residuo dal buffer precedente
                        audioBuffer = [];
                        bufferTotalSamples = 0;
                        
                        addLog(`Parlato rilevato (livello: ${audioLevel.toFixed(4)}), inizio buffering`);
                    }
                }
                
                // Crea una copia dei dati audio solo se stiamo registrando parlato
                if (isBuffering) {
                    const audioArray = new Float32Array(inputData);
                    
                    // Ottieni la dimensione massima del buffer in campioni
                    const maxBufferSeconds = parseFloat(bufferSizeSecondsInput.value) || 10;
                    const maxBufferSamples = maxBufferSeconds * audioContext.sampleRate;
                    
                    // Aggiungi i dati audio al buffer solo se non supera la dimensione massima
                    if (bufferTotalSamples + audioArray.length <= maxBufferSamples) {
                        audioBuffer.push(audioArray);
                        bufferTotalSamples += audioArray.length;
                    } else {
                        // Buffer pieno, invia quello che abbiamo
                        addLog(`Buffer pieno (${bufferTotalSamples} campioni), invio automatico`);
                        sendAudioBuffer();
                        
                        // Continua a registrare dopo l'invio del buffer
                        audioBuffer = [];
                        bufferTotalSamples = 0;
                        audioBuffer.push(audioArray);
                        bufferTotalSamples = audioArray.length;
                    }
                }
            }
        };
        
        isRecording = true;
        micBtn.disabled = true;
        stopBtn.disabled = false;
        micSelect.disabled = true;
        bufferSizeSecondsInput.disabled = true;
        statusEl.textContent = 'Registrazione in corso...';
        addLog('Registrazione avviata');
        
    } catch (error) {
        addLog(`Errore avvio registrazione: ${error.message}`);
        statusEl.textContent = `Errore: ${error.message}`;
    }
}

// Funzione per inviare il buffer audio accumulato
function sendAudioBuffer() {
    if (audioBuffer.length === 0 || bufferTotalSamples === 0) {
        addLog('Buffer vuoto, niente da inviare');
        return;
    }
    
    addLog(`Invio buffer audio (${audioBuffer.length} chunks, ${bufferTotalSamples} campioni)`);
    
    try {
        // Crea un buffer combinato
        const combinedBuffer = new Float32Array(bufferTotalSamples);
        
        // Copia tutti i chunk nel buffer combinato
        let offset = 0;
        for (const chunk of audioBuffer) {
            combinedBuffer.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Converti a int16 per la trasmissione
        const int16Array = new Int16Array(combinedBuffer.length);
        for (let i = 0; i < combinedBuffer.length; i++) {
            const sample = Math.max(-1, Math.min(1, combinedBuffer[i]));
            int16Array[i] = Math.round(sample * 32767);
        }
        
        // Converti a base64
        const buffer = int16Array.buffer;
        const bytes = new Uint8Array(buffer);
        
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        
        const base64 = btoa(binary);
        
        // Invia al server
        if (ws && ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({
                audio: base64,
                sampling_rate: audioContext.sampleRate,
                format: "int16"
            });
            
            ws.send(message);
            
            addLog(`Audio inviato: ${combinedBuffer.length} campioni, ` + 
                   `min=${Math.min(...combinedBuffer).toFixed(4)}, ` + 
                   `max=${Math.max(...combinedBuffer).toFixed(4)}`);
        }
        
        // Svuota completamente il buffer
        audioBuffer = [];
        bufferTotalSamples = 0;
        silenceStartTime = Date.now(); // Reset del timer di silenzio
    } catch (error) {
        addLog(`Errore nell'invio del buffer audio: ${error.message}`);
        // Svuota comunque il buffer in caso di errore per evitare problemi
        audioBuffer = [];
        bufferTotalSamples = 0;
    }
}

// Stop registrazione
function stopRecording() {
    if (!isRecording) return;
    
    // Invia eventuali dati rimanenti nel buffer
    if (audioBuffer.length > 0 && bufferTotalSamples > 0) {
        sendAudioBuffer();
    }
    
    isRecording = false;
    
    if (processorNode) {
        processorNode.disconnect();
        processorNode = null;
    }
    
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    micBtn.disabled = false;
    stopBtn.disabled = true;
    micSelect.disabled = false;
    bufferSizeSecondsInput.disabled = false;
    statusEl.textContent = 'Registrazione fermata';
    addLog('Registrazione fermata');
}

// Chiedi autorizzazione iniziale per accedere ai dispositivi audio
async function requestInitialPermissions() {
    try {
        // Richiedi autorizzazione generica per accedere all'audio
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Ferma immediatamente lo stream
        stream.getTracks().forEach(track => track.stop());
        
        // Ora che abbiamo il permesso, possiamo enumerare i dispositivi con le etichette
        loadAudioDevices();
    } catch (error) {
        addLog(`Non è possibile accedere al microfono: ${error.message}`);
        micSelect.innerHTML = '<option value="">Permesso microfono negato</option>';
    }
}

// Setup event listeners
connectBtn.addEventListener('click', connectWebSocket);
refreshDevicesBtn.addEventListener('click', loadAudioDevices);
micBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopRecording);

// Chiedi i permessi per accedere ai microfoni
requestInitialPermissions();