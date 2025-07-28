from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, BackgroundTasks, Response, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import yt_dlp
from urllib.parse import urlparse
from pydantic import BaseModel
from typing import List, Optional
from pathlib import Path
import os,json,time,uuid,asyncio,logging,tempfile,subprocess,threading,shutil,concurrent.futures,psutil,torch
from faster_whisper import WhisperModel
import requests
import re

# --- Modelos Pydantic para Validação de Requisições ---

# Usado para baixar um vídeo completo do YouTube
class YouTubeDownloadRequest(BaseModel):
    url: str
    quality: str = 'best' # Opções: best, 720p, 480p, audio

# Usado para buscar apenas os metadados (título, miniatura, etc.) de um vídeo
class YouTubeURLRequest(BaseModel):
    url: str

# --- Configuração de Logging ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Configuração de Hardware e Modelo ---
CPU_CORES = os.cpu_count() or 1
MEMORY_GB = psutil.virtual_memory().total / (1024**3)
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
COMPUTE_TYPE = "float16" if DEVICE == "cuda" else "int8"

if MEMORY_GB <= 4:
    HARDWARE_TIER, DEFAULT_MODEL, MAX_WORKERS, BEAM_SIZE = "low", "tiny", 1, 1
elif MEMORY_GB <= 8:
    HARDWARE_TIER, DEFAULT_MODEL, MAX_WORKERS, BEAM_SIZE = "medium", "base", min(2, CPU_CORES), 1
elif MEMORY_GB <= 16:
    HARDWARE_TIER, DEFAULT_MODEL, MAX_WORKERS, BEAM_SIZE = "high", "small", min(4, CPU_CORES), 1
else:
    HARDWARE_TIER, DEFAULT_MODEL, MAX_WORKERS, BEAM_SIZE = "ultra", "medium", min(8, CPU_CORES), 1

# Parâmetros otimizados para transcrição rápida com Whisper
ULTRA_SPEED_CONFIG = {
    "beam_size": BEAM_SIZE, "best_of": 1, "patience": 1, "length_penalty": 1, "repetition_penalty": 1.0,
    "temperature": [0.0], "compression_ratio_threshold": 2.4, "log_prob_threshold": -1.0,
    "no_speech_threshold": 0.6, "condition_on_previous_text": False, "suppress_blank": True,
    "suppress_tokens": [-1], "without_timestamps": False, "vad_filter": True,
    "vad_parameters": {"threshold": 0.5, "min_speech_duration_ms": 250, "max_speech_duration_s": float("inf"),
                      "min_silence_duration_ms": 1000, "speech_pad_ms": 200}
}

logger.info(f"Config: {HARDWARE_TIER} - {MEMORY_GB:.1f}GB - {CPU_CORES}c - {DEVICE} - {DEFAULT_MODEL}")

# --- Inicialização da Aplicação FastAPI ---
app = FastAPI(title="Video Processing API", version="5.0.0")

# Middleware para permitir requisições de diferentes origens (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000", "http://127.0.0.1:8000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# --- Configurações Globais e Constantes ---
# Corrige o diretório para garantir que a pasta 'files' fique sempre ao lado do app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FILES_DIR = os.path.join(BASE_DIR, "files")
os.makedirs(FILES_DIR, exist_ok=True)
app.mount("/files", StaticFiles(directory=FILES_DIR), name="files")

WHISPER_MODELS = ["tiny", "base", "small", "medium", "large-v2", "large-v3"]
ALLOWED_EXTENSIONS = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500 MB
LANGUAGES = {'en': 'English', 'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese', 'ru': 'Russian', 'ar': 'Arabic', 'pt': 'Portuguese'}

executor = concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS)
status_cache = {} # Cache simples em memória para status
whisper_models_cache = {} # Cache para modelos Whisper carregados

# --- Funções de Ajuda e Utilitários ---

def get_model(model_name: str):
    """Carrega um modelo Whisper em cache ou da memória."""
    if model_name not in whisper_models_cache:
        logger.info(f"Carregando modelo Whisper: {model_name}...")
        config = {"device": DEVICE, "compute_type": COMPUTE_TYPE, "cpu_threads": 0 if DEVICE == "cuda" else max(1, CPU_CORES // 2), "num_workers": 1}
        if DEVICE == "cuda": config["device_index"] = 0
        whisper_models_cache[model_name] = WhisperModel(model_name, **config)
        logger.info("Modelo carregado.")
    return whisper_models_cache[model_name]

async def save_file_stream(file: UploadFile, path: str):
    """Salva um arquivo enviado por streaming, verificando o tamanho."""
    total_size = 0
    with open(path, "wb") as buffer:
        while chunk := await file.read(16384):
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE:
                os.remove(path)
                raise HTTPException(status_code=413, detail=f"Arquivo muito grande. Máximo: {MAX_FILE_SIZE/(1024*1024):.0f}MB")
            buffer.write(chunk)
    return total_size

def get_ffmpeg_cmd(input_path: str, output_path: str):
    """Gera o comando FFmpeg para extrair e converter áudio."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-threads", "0"]
    # Tenta usar aceleração por hardware se disponível
    if DEVICE == "cuda":
        try:
            subprocess.run(["ffmpeg", "-hwaccels"], capture_output=True, check=True, timeout=5)
            cmd.extend(["-hwaccel", "cuda"])
        except: pass
    cmd.extend(["-i", input_path, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", "-y", output_path])
    return cmd

def run_ffmpeg(cmd: List[str], error_msg: str, timeout: int = 300):
    """Executa um comando FFmpeg e lida com erros."""
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail=f"Timeout: {error_msg}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Erro no FFmpeg: {e.stderr}")
        raise HTTPException(status_code=500, detail=f"{error_msg}: {e.stderr}")
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="FFmpeg não encontrado. Verifique se está instalado e no PATH do sistema.")

def validate_file(file: UploadFile):
    """Valida a extensão do arquivo enviado."""
    if not file.filename: raise HTTPException(status_code=400, detail="Nome de arquivo não fornecido.")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS: raise HTTPException(status_code=400, detail=f"Formato de arquivo não suportado: {ext}")

def update_status(session_id: str, status: str, step_id: int = 0):
    """Atualiza o status de uma tarefa no cache."""
    status_cache[session_id] = json.dumps({"status": status, "stepId": step_id})

def format_srt_time(seconds: float) -> str:
    """Formata segundos para o padrão de tempo do SRT."""
    h, m, s = int(seconds // 3600), int((seconds % 3600) // 60), int(seconds % 60)
    ms = int((seconds - int(seconds)) * 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

def create_srt(captions: List[dict], srt_path: str):
    """Cria um arquivo .srt a partir de uma lista de legendas."""
    with open(srt_path, "w", encoding="utf-8") as f:
        for c in captions:
            if not all(key in c for key in ['id', 'start', 'end', 'text']): continue
            text = str(c['text']).replace('\n', ' ').strip()
            if not text: continue
            f.write(f"{c['id']}\n{format_srt_time(float(c['start']))} --> {format_srt_time(float(c['end']))}\n{text}\n\n")

def get_hardware_acceleration():
    """Detecta e retorna o melhor método de aceleração por hardware disponível."""
    try:
        # Verifica NVIDIA NVENC
        nvenc_check = subprocess.run(['ffmpeg', '-encoders'], capture_output=True, text=True)
        if 'hevc_nvenc' in nvenc_check.stdout:
            return {
                'hwaccel': 'cuda',
                'encoder': 'hevc_nvenc',
                'extra_params': ['-rc:v', 'vbr_hq', '-qmin', '0', '-qmax', '30']
            }
        
        # Verifica Intel QuickSync
        qsv_check = subprocess.run(['ffmpeg', '-encoders'], capture_output=True, text=True)
        if 'h264_qsv' in qsv_check.stdout:
            return {
                'hwaccel': 'qsv',
                'encoder': 'h264_qsv',
                'extra_params': ['-global_quality', '28']
            }
        
        # Verifica VAAPI
        vaapi_check = subprocess.run(['ffmpeg', '-hwaccels'], capture_output=True, text=True)
        if 'vaapi' in vaapi_check.stdout:
            return {
                'hwaccel': 'vaapi',
                'encoder': 'h264_vaapi',
                'extra_params': ['-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12|vaapi,hwupload']
            }
        
        # Fallback para CPU
        return {
            'hwaccel': None,
            'encoder': 'libx264',
            'extra_params': []
        }
    except Exception as e:
        logger.warning(f"Erro ao detectar aceleração por hardware: {e}")
        return {
            'hwaccel': None,
            'encoder': 'libx264',
            'extra_params': []
        }

def style_to_drawtext(style_dict):
    """Converte um dicionário de estilo para argumentos do drawtext do FFmpeg."""
    cache_key = json.dumps(style_dict, sort_keys=True)
    if not hasattr(style_to_drawtext, 'cache'):
        style_to_drawtext.cache = {}
    cache = style_to_drawtext.cache
    if cache_key in cache:
        return cache[cache_key]
    args = {}
    # Fonte
    if 'fontFamily' in style_dict:
        args['fontfile'] = f"/usr/share/fonts/truetype/{style_dict['fontFamily'].split(',')[0].strip()}.ttf"
    # Tamanho
    if 'fontSize' in style_dict:
        args['fontsize'] = str(int(style_dict['fontSize']))
    # Cor
    if 'color' in style_dict:
        color = style_dict['color']
        if color.startswith('#') and len(color) == 7:
            args['fontcolor'] = color
    # Sombra
    if 'shadow' in style_dict:
        try:
            args['shadowx'] = args['shadowy'] = str(int(float(style_dict['shadow'])))
        except: pass
    # Outline
    if 'outline' in style_dict:
        try:
            args['borderw'] = str(int(float(style_dict['outline'])))
        except: pass
    # Fundo
    if 'backgroundColor' in style_dict and style_dict['backgroundColor'] != 'transparent':
        bg = style_dict['backgroundColor']
        if bg.startswith('#') and len(bg) == 7:
            args['box'] = '1'
            args['boxcolor'] = bg + '@0.7'
    # Posição
    if 'position' in style_dict:
        pos = style_dict['position']
        if pos == 'top':
            args['y'] = 'h*0.05'
        elif pos == 'middle':
            args['y'] = '(h-text_h)/2'
        else:
            args['y'] = 'h-text_h-40'
    else:
        args['y'] = 'h-text_h-40'
    args['x'] = '(w-text_w)/2'
    cache[cache_key] = args
    return args

def generate_drawtext_filters(captions, style_dict):
    """Gera filtros drawtext para cada legenda com base no estilo."""
    filters = []
    for c in captions:
        if not all(k in c for k in ['start','end','text']): continue
        args = style_to_drawtext(style_dict or {})
        text = str(c['text']).replace(':', '\\:').replace("'", "\\'").replace('\\', '\\\\')
        enable = f"between(t,{float(c['start'])},{float(c['end'])})"
        drawtext = f"drawtext=text='{text}'"
        for k, v in args.items():
            drawtext += f":{k}={v}"
        drawtext += f":enable='{enable}'"
        filters.append(drawtext)
    return filters

def get_video_resolution(video_path):
    """Obtém a resolução (largura, altura) do vídeo usando ffprobe."""
    try:
        probe = subprocess.run([
            'ffprobe', '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json', video_path
        ], capture_output=True, text=True)
        info = json.loads(probe.stdout)
        width = info['streams'][0]['width']
        height = info['streams'][0]['height']
        return width, height
    except Exception as e:
        logger.warning(f"Não foi possível detectar resolução do vídeo: {e}")
        return None, None

def get_temp_dir():
    """Retorna um diretório temporário preferencialmente em SSD."""
    # Linux: /tmp geralmente é SSD/ramdisk, Windows: tenta C:/Temp, fallback para padrão
    candidates = [
        os.environ.get('FAST_TEMP'),
        '/tmp',
        'C:/Temp',
        'D:/Temp',
        tempfile.gettempdir()
    ]
    for d in candidates:
        if d and os.path.isdir(d) and os.access(d, os.W_OK):
            return d
    return tempfile.gettempdir()

YOUTUBE_API_KEY = "AIzaSyDSxPM0Rx-qiwGYUrbzCznCjufx3smrXCk"

# --- Endpoints da API ---

@app.post("/api/youtube-metadata")
async def get_youtube_metadata(request: YouTubeURLRequest):
    """Extrai metadados de um vídeo do YouTube usando a YouTube Data API v3."""
    url = request.url
    parsed_url = urlparse(url)
    if 'youtube.com' not in parsed_url.netloc and 'youtu.be' not in parsed_url.netloc:
        raise HTTPException(status_code=400, detail="URL inválida. Apenas links do YouTube são permitidos.")

    # Extrai o video_id
    match = re.search(r'(?:v=|youtu.be/)([\w-]{11})', url)
    if not match:
        raise HTTPException(status_code=400, detail="Não foi possível extrair o ID do vídeo.")
    video_id = match.group(1)

    api_url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id={video_id}&key={YOUTUBE_API_KEY}"
    try:
        resp = requests.get(api_url)
        data = resp.json()
        if not resp.ok or 'items' not in data or not data['items']:
            raise HTTPException(status_code=404, detail="Vídeo não encontrado ou erro na API do YouTube.")
        item = data['items'][0]
        snippet = item['snippet']
        content_details = item['contentDetails']
        # Duração ISO 8601 para segundos
        import isodate
        duration = isodate.parse_duration(content_details['duration']).total_seconds()
        minutes, seconds = divmod(int(duration), 60)
        metadata = {
            "title": snippet.get('title', 'Título não disponível'),
            "thumbnail": snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
            "duration": int(duration),
            "duration_formatted": f"{minutes:02}:{seconds:02}",
            "author": snippet.get('channelTitle', 'Autor desconhecido'),
        }
        return JSONResponse(content=metadata)
    except Exception as e:
        logger.error(f"Erro ao buscar metadados do YouTube Data API: {e}")
        raise HTTPException(status_code=500, detail="Falha ao obter metadados do vídeo pela API do YouTube.")

@app.post("/api/download_youtube")
async def download_youtube_video(request: YouTubeDownloadRequest, background_tasks: BackgroundTasks):
    """Faz o download de um vídeo do YouTube com a qualidade especificada."""
    url, quality = request.url, request.quality
    if 'youtube.com' not in urlparse(url).netloc and 'youtu.be' not in urlparse(url).netloc:
        raise HTTPException(status_code=400, detail="URL inválida.")

    temp_dir = tempfile.mkdtemp()
    background_tasks.add_task(shutil.rmtree, temp_dir)

    format_selector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    if quality == '720p': format_selector = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    elif quality == '480p': format_selector = 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    elif quality == 'audio': format_selector = 'bestaudio/best'

    ydl_opts = {'outtmpl': os.path.join(temp_dir, '%(title)s.%(ext)s'), 'format': format_selector}
    if os.path.exists("cookies.txt"): ydl_opts['cookiefile'] = "cookies.txt"
    if quality == 'audio': ydl_opts['postprocessors'] = [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '192'}]

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            await asyncio.get_event_loop().run_in_executor(executor, lambda: ydl.download([url]))
        
        files = os.listdir(temp_dir)
        if not files: raise HTTPException(status_code=500, detail="Falha no download.")
        
        file_path = os.path.join(temp_dir, files[0])
        return FileResponse(path=file_path, filename=files[0], media_type='application/octet-stream')
    except Exception as e:
        logger.error(f"Erro no download do YouTube: {e}")
        error_message = str(e).lower()
        if "sign in" in error_message or "age-restricted" in error_message:
            raise HTTPException(status_code=403, detail="Vídeo requer login. Coloque um arquivo 'cookies.txt' válido na raiz do projeto.")
        raise HTTPException(status_code=500, detail=f"Erro no download: {e}")

@app.post("/api/transcribe")
async def transcribe_video(file: UploadFile = File(...), model: str = Form(DEFAULT_MODEL), language: Optional[str] = Form("pt"), session_id: Optional[str] = Form(None)):
    """Transcreve o áudio de um arquivo de vídeo enviado."""
    validate_file(file)
    if model not in WHISPER_MODELS: raise HTTPException(status_code=400, detail=f"Modelo inválido: {model}")
    
    session_id = session_id or str(uuid.uuid4())
    language = language or "pt"
    
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            update_status(session_id, "Salvando arquivo...", 2)
            temp_video = os.path.join(temp_dir, f"video{Path(file.filename).suffix}")
            file_size = await save_file_stream(file, temp_video)

            # Verifica se o arquivo é um vídeo válido antes de extrair áudio
            probe_cmd = [
                "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1", temp_video
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
            if probe_result.returncode != 0 or not probe_result.stdout.strip():
                raise HTTPException(status_code=400, detail="O arquivo enviado não contém uma trilha de áudio válida ou não é um vídeo suportado.")

            update_status(session_id, "Extraindo áudio...", 3)
            temp_audio = os.path.join(temp_dir, "audio.wav")
            try:
                run_ffmpeg(get_ffmpeg_cmd(temp_video, temp_audio), "Erro ao extrair áudio")
            except HTTPException as ffmpeg_exc:
                logger.error(f"FFmpeg erro: {ffmpeg_exc.detail}")
                raise HTTPException(status_code=400, detail=f"Erro ao extrair áudio: {ffmpeg_exc.detail}")

            update_status(session_id, "Carregando modelo...", 5)
            whisper_model = get_model(model)
            
            update_status(session_id, "Transcrevendo...", 6)
            segments, info = whisper_model.transcribe(temp_audio, language=language, **ULTRA_SPEED_CONFIG)

            captions = [{"id": i + 1, "start": s.start, "end": s.end, "text": s.text.strip()} for i, s in enumerate(segments)]
            
            response = {
                "captions": captions, "language": language, "duration": info.duration,
                "file_size_mb": round(file_size / (1024 * 1024), 2), "session_id": session_id,
            }
            update_status(session_id, "Concluído", 10)
            return JSONResponse(response)
        except Exception as e:
            logger.error(f"Erro na transcrição (sessão {session_id}): {e}")
            update_status(session_id, "Erro", 0)
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/render")
async def render_video(
    file: UploadFile = File(...),
    captions: UploadFile = File(...),
    style: str = Form(None),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Renderiza legendas em um arquivo de vídeo e serve como arquivo temporário seguro."""
    validate_file(file)
    if not captions.filename or not captions.filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Legendas devem ser um arquivo JSON.")

    import re, tempfile
    try:
        # Cria arquivo temporário seguro para o vídeo de saída
        # Usa SSD para arquivos temporários se disponível
        temp_root = get_temp_dir()
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4', dir=temp_root) as temp_output:
            output_video = temp_output.name
        with tempfile.TemporaryDirectory(dir=temp_root) as temp_dir:
            temp_video = os.path.join(temp_dir, f"video{Path(file.filename).suffix}")
            await save_file_stream(file, temp_video)

            # Corrige erro: obtém resolução do vídeo
            orig_width, orig_height = get_video_resolution(temp_video)

            captions_data = json.loads(await captions.read())
            if not isinstance(captions_data, list): raise ValueError("JSON de legendas inválido.")

            srt_path = os.path.join(temp_dir, "subtitles.srt")
            create_srt(captions_data, srt_path)
            srt_escaped = srt_path.replace('\\', '/').replace(':', '\\:')

            # --- NOVO force_style ---
            force_style = "Fontsize=16,Outline=1,Shadow=0.5,BorderStyle=1,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BackColour=&H80000000&,Alignment=8,Box=1,BoxColour=&H80000000&"
            if style:
                try:
                    style_dict = json.loads(style)
                    # Font size
                    if 'fontSize' in style_dict:
                        force_style = re.sub(r'Fontsize=\\d+', f"Fontsize={int(style_dict['fontSize'])}", force_style)
                    # Font family
                    if 'fontFamily' in style_dict:
                        font = str(style_dict['fontFamily']).split(',')[0].strip()
                        force_style += f",Fontname={font}"
                    # Font color
                    if 'color' in style_dict:
                        color = style_dict['color']
                        if color.startswith('#') and len(color) == 7:
                            r = color[1:3]
                            g = color[3:5]
                            b = color[5:7]
                            force_style = re.sub(r'PrimaryColour=&H[0-9A-Fa-f]+&', f"PrimaryColour=&H00{b}{g}{r}&", force_style)
                    # Background color
                    if 'backgroundColor' in style_dict:
                        bg = style_dict['backgroundColor']
                        if isinstance(bg, str) and bg.startswith('#') and len(bg) == 7:
                            r = bg[1:3]
                            g = bg[3:5]
                            b = bg[5:7]
                            # BackColour para ASS, BoxColour para ffmpeg
                            force_style = re.sub(r'BackColour=&H[0-9A-Fa-f]+&', f"BackColour=&H80{b}{g}{r}&", force_style)
                            force_style = re.sub(r'BoxColour=&H[0-9A-Fa-f]+&', f"BoxColour=&H80{b}{g}{r}&", force_style)
                        elif isinstance(bg, str) and bg.startswith('rgba'):
                            m = re.match(r'rgba\\((\\d+), ?(\\d+), ?(\\d+)(?:, ?([\\d.]+))?\\)', bg)
                            if m:
                                r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
                                a = float(m.group(4)) if m.group(4) else 0.7
                                alpha = int((1-a)*255)
                                force_style = re.sub(r'BackColour=&H[0-9A-Fa-f]+&', f"BackColour=&H{alpha:02X}{b:02X}{g:02X}{r:02X}&", force_style)
                                force_style = re.sub(r'BoxColour=&H[0-9A-Fa-f]+&', f"BoxColour=&H{alpha:02X}{b:02X}{g:02X}{r:02X}&", force_style)
                    # Outline
                    if 'outline' in style_dict:
                        try:
                            outline = float(style_dict['outline'])
                            force_style = re.sub(r'Outline=\\d+(\\.\\d+)?', f"Outline={outline}", force_style)
                        except: pass
                    # Shadow
                    if 'shadow' in style_dict:
                        try:
                            shadow = float(style_dict['shadow'])
                            force_style = re.sub(r'Shadow=\\d+(\\.\\d+)?', f"Shadow={shadow}", force_style)
                        except: pass
                    # Posição (Alignment)
                    if 'position' in style_dict:
                        pos = style_dict['position']
                        alignment = {'bottom':8, 'top':2, 'middle':5}.get(pos,8)
                        force_style = re.sub(r'Alignment=\\d+', f"Alignment={alignment}", force_style)
                except Exception as e:
                    logger.warning(f"Estilo de legenda inválido: {e}")
            vf_filter = f"subtitles='{srt_escaped}':force_style='{force_style}'"
            # Substitui o comando de renderização para mais velocidade e menor qualidade
            # Tenta usar NVENC se disponível, senão cai para libx265 puro
            import shutil
            # Verifica se hevc_nvenc está disponível
            ffmpeg_encoders = subprocess.run(['ffmpeg', '-encoders'], capture_output=True, text=True).stdout
            if 'hevc_nvenc' in ffmpeg_encoders:
                codec = 'hevc_nvenc'
            elif 'libx265' in ffmpeg_encoders:
                codec = 'libx265'
            else:
                codec = 'libx264'  # Fallback universal
            render_cmd = [
                "ffmpeg", "-y",
                "-i", temp_video,
                "-vf", vf_filter,
                "-c:a", "copy",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "28",
                "-movflags", "+faststart",
                "-bufsize", "4M",
                "-maxrate", "8M",
                "-sc_threshold", "0",
            ]
            if orig_width and orig_height:
                render_cmd.extend(["-s", f"{orig_width}x{orig_height}"])
            render_cmd.append(output_video)
            logger.info(f"Comando FFmpeg: {' '.join(render_cmd)}")
            try:
                run_ffmpeg(render_cmd, "Erro ao renderizar vídeo", timeout=600)
            except HTTPException as ffmpeg_exc:
                logger.error(f"FFmpeg erro: {ffmpeg_exc.detail}")
                raise HTTPException(status_code=500, detail=f"Erro ao renderizar vídeo: {ffmpeg_exc.detail}")
            if not os.path.exists(output_video): raise HTTPException(status_code=500, detail="Arquivo renderizado não foi criado.")

        # Streaming de saída: envia o arquivo enquanto é lido
        def iterfile(path):
            with open(path, mode="rb") as file_like:
                while chunk := file_like.read(1024*1024):
                    yield chunk
        background_tasks.add_task(os.remove, output_video)
        safe_filename = re.sub(r'[<>:"/\\|?*]', '_', f"legendado_{Path(file.filename).stem}.mp4")
        file_size = os.path.getsize(output_video)
        return StreamingResponse(iterfile(output_video), media_type='video/mp4', headers={
            'Content-Disposition': f'attachment; filename="{safe_filename}"',
            'Content-Length': str(file_size)
        }, background=background_tasks)
    except Exception as e:
        logger.error(f"Erro na renderização: {e}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/transcribe-status")
async def status_stream(request: Request, session_id: str):
    """Fornece atualizações de status via Server-Sent Events."""
    async def generator():
        last_status = None
        while True:
            if await request.is_disconnected(): break
            status = status_cache.get(session_id)
            if status != last_status and status:
                yield f"data: {status}\n\n"
                last_status = status
            if status and json.loads(status).get("stepId") in [0, 10]:
                status_cache.pop(session_id, None)
                break
            await asyncio.sleep(0.5)
    return StreamingResponse(generator(), media_type="text/event-stream")

@app.get("/api/health")
async def health():
    """Verifica a saúde do sistema."""
    return {"status": "ok"}

@app.get("/api/models")
async def get_available_models():
    """Lista os modelos Whisper disponíveis."""
    recommendations = {"low": ["tiny"], "medium": ["base"], "high": ["small"], "ultra": ["medium"]}
    return {"models": WHISPER_MODELS, "default": DEFAULT_MODEL, "recommended": recommendations.get(HARDWARE_TIER, ["small"])}

@app.get("/api/languages")
async def get_available_languages():
    """Lista os idiomas suportados para transcrição."""
    return {"languages": LANGUAGES, "default": "pt"}

# --- Execução da Aplicação ---
if __name__ == "__main__":
    import uvicorn
    # Altere "main:app" se o seu arquivo for salvo com um nome diferente de 'main.py'
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)