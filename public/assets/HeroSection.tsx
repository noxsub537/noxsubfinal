import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadIcon } from './icons';

// --- Constantes para melhor manutenção ---
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'https://seu-backend-no-render.onrender.com');
const YOUTUBE_METADATA_URL = `${API_BASE_URL}/api/youtube-metadata`;
// Este endpoint agora deve retornar o arquivo de vídeo diretamente para download
const DOWNLOAD_VIDEO_URL = `${API_BASE_URL}/api/download_youtube`;

// --- Interfaces e Tipos ---
interface HeroSectionProps {
    onVideoSelect: (file: File) => void;
    error: string | null;
}

interface YouTubeVideoMeta {
    id?: string;
    title: string;
    thumbnail: string;
    duration: string | number;
    channelTitle: string;
}

interface YouTubeState {
    status: 'idle' | 'loadingMeta' | 'success' | 'error';
    meta: YouTubeVideoMeta | null;
    error: string | null;
}

// --- Hook customizado para Debounce ---
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};


const HeroSection: React.FC<HeroSectionProps> = ({ onVideoSelect, error }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [videoLink, setVideoLink] = useState('');
    const [youtubeState, setYoutubeState] = useState<YouTubeState>({
        status: 'idle',
        meta: null,
        error: null,
    });
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const debouncedVideoLink = useDebounce(videoLink, 500);

    // --- Funções Auxiliares ---
    const extractYouTubeId = (url: string): string | null => {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };

    const isValidYouTubeUrl = (url: string): boolean => Boolean(extractYouTubeId(url));

    // --- Handlers de Eventos de Upload Local ---
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) onVideoSelect(file);
    };

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onVideoSelect(file);
    }, [onVideoSelect]);

    // --- Lógica de Metadados do YouTube ---
    const fetchYouTubeMetadata = async (url: string) => {
        const videoId = extractYouTubeId(url);
        if (!videoId) {
            setYoutubeState({ status: 'error', meta: null, error: 'Link do YouTube inválido.' });
            return;
        }
        setYoutubeState({ status: 'loadingMeta', meta: null, error: null });
        try {
            const response = await fetch(YOUTUBE_METADATA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (!response.ok) throw new Error('Falha ao obter metadados do vídeo.');

            const data = await response.json();
            const meta: YouTubeVideoMeta = {
                ...data,
                channelTitle: data.author || data.channelTitle || '',
            };
            setYoutubeState({ status: 'success', meta, error: null });
        } catch (err) {
            console.error('Erro ao buscar metadados:', err);
            setYoutubeState({ status: 'error', meta: null, error: (err as Error).message });
        }
    };

    useEffect(() => {
        if (debouncedVideoLink) {
            const videoId = extractYouTubeId(debouncedVideoLink);
            if (videoId && videoId.length === 11) {
                fetchYouTubeMetadata(debouncedVideoLink);
            } else if (debouncedVideoLink.trim() !== '') {
                setYoutubeState({ status: 'error', meta: null, error: 'Link do YouTube inválido.' });
            }
        }
    }, [debouncedVideoLink]);


    const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newLink = e.target.value;
        setVideoLink(newLink);
        if (!newLink.trim()) {
            setYoutubeState({ status: 'idle', meta: null, error: null });
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const pastedText = e.clipboardData.getData('text');
        const firstValid = pastedText.trim().split(/\s+/).find(isValidYouTubeUrl);
        if (firstValid) {
            setVideoLink(firstValid);
            e.preventDefault();
        }
    };

    const handleDownloadFromUrl = async () => {
        if (youtubeState.status !== 'success' || !youtubeState.meta) return;

        setIsImporting(true);
        setYoutubeState(prevState => ({ ...prevState, error: null }));

        try {
            const response = await fetch(DOWNLOAD_VIDEO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: videoLink }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || 'O servidor não conseguiu processar o vídeo.');
            }

            const blob = await response.blob();
            const sanitizedTitle = youtubeState.meta.title.replace(/[<>:"/\\|?*]/g, '_');
            const suggestedName = `${sanitizedTitle}.mp4`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setVideoLink('');
            setYoutubeState({ status: 'idle', meta: null, error: null });

        } catch (err) {
            const errorMsg = (err as Error).message;
            console.error('Erro ao baixar vídeo:', err);
            setYoutubeState(prevState => ({
                ...prevState,
                status: 'error',
                error: `Erro ao baixar: ${errorMsg}`
            }));
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="w-full max-w-5xl mx-auto px-4">
            {/* Upload Area (Inalterado) */}
            <div
                className={`relative group border-2 border-dashed rounded-3xl p-12 transition-all duration-500 ease-out ${isDragging
                    ? 'border-purple-400 bg-gradient-to-br from-purple-900/30 to-blue-900/20 scale-105 shadow-2xl shadow-purple-500/20'
                    : 'border-slate-600/60 hover:border-purple-500/60 bg-gradient-to-br from-slate-800/40 to-slate-900/60 hover:shadow-xl hover:shadow-purple-500/10'
                    }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-purple-600/5 to-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                <div className="relative flex flex-col items-center justify-center space-y-6">
                    <div className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center shadow-lg transition-all duration-300 ${isDragging ? 'scale-110 shadow-purple-500/30' : 'group-hover:scale-105'}`}>
                        <UploadIcon className={`h-10 w-10 transition-colors duration-300 ${isDragging ? 'text-purple-400' : 'text-slate-400 group-hover:text-purple-400'}`} />
                    </div>
                    <div className="text-center space-y-2">
                        <h2 className="text-2xl font-bold text-white tracking-tight">
                            Arraste e solte seu vídeo aqui
                        </h2>
                        <p className="text-slate-400 text-lg">ou</p>
                    </div>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="group/btn relative overflow-hidden bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                    >
                        <span className="relative z-10">Selecionar Arquivo</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="video/*" />
                </div>
            </div>

            {/* Divider (Inalterado) */}
            <div className="my-12 flex items-center justify-center">
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
                <span className="mx-6 text-slate-400 font-medium bg-slate-800/50 px-4 py-2 rounded-full border border-slate-600/50">OU</span>
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            </div>

            {/* YouTube URL Input Area */}
            <div className="space-y-6">
                <div className="relative group">
                    <input
                        type="text"
                        placeholder="Cole o link do vídeo do YouTube"
                        className="w-full bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-600/50 text-white placeholder-slate-400 rounded-2xl p-5 pr-14 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 transition-all duration-300 hover:border-slate-500/70"
                        value={videoLink}
                        onChange={handleLinkChange}
                        onPaste={handlePaste}
                        disabled={isImporting}
                    />
                    {youtubeState.status === 'loadingMeta' && (
                        <div className="absolute right-5 top-1/2 transform -translate-y-1/2">
                            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>

                {/* --- INÍCIO DA SEÇÃO DO MINI-TUTORIAL --- */}
                {youtubeState.status === 'idle' && (
                    <div className="text-center px-4">
                        <p className="text-slate-400 text-sm">
                            Você pode fazer o upload de um vídeo do seu computador (acima) ou colar um link do YouTube.
                        </p>
                        <p className="text-slate-500 text-xs mt-1">
                            Ao usar um link, o vídeo será baixado para o seu computador. Depois, você precisará fazer o upload desse arquivo baixado.
                        </p>
                    </div>
                )}
                {/* --- FIM DA SEÇÃO DO MINI-TUTORIAL --- */}

                {/* Mensagem de Erro do YouTube */}
                {youtubeState.status === 'error' && youtubeState.error && (
                    <div className="p-3 bg-red-900/30 border border-red-600/50 rounded-xl" aria-live="polite">
                        <p className="text-red-400 text-center text-sm font-medium">{youtubeState.error}</p>
                    </div>
                )}

                {/* Preview do Vídeo */}
                {youtubeState.status === 'success' && youtubeState.meta && (
                    <div className="relative bg-gradient-to-br from-slate-800/60 to-slate-900/80 backdrop-blur-xl rounded-3xl p-8 border border-slate-600/30 shadow-2xl transform transition-all duration-500 animate-in slide-in-from-bottom-4">
                        <div className="relative z-10 flex flex-col md:flex-row gap-8">
                            <div className="relative w-full md:w-96 aspect-video bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl overflow-hidden border border-slate-600/50 shadow-xl group/thumb flex-shrink-0">
                                <img src={youtubeState.meta.thumbnail} alt={`Thumbnail do vídeo ${youtubeState.meta.title}`} className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105" loading="lazy" />
                                <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-sm font-mono">
                                    {youtubeState.meta.duration}
                                </div>
                            </div>
                            <div className="flex flex-col justify-between flex-1">
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-white leading-snug break-words">{youtubeState.meta.title}</h3>
                                    <p className="text-slate-400">Canal: {youtubeState.meta.channelTitle}</p>
                                </div>
                                <button
                                    onClick={handleDownloadFromUrl}
                                    disabled={isImporting}
                                    className="group/import mt-4 md:mt-auto self-start relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-green-500/25 disabled:cursor-not-allowed"
                                >
                                    {isImporting && (
                                        <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    <span className={`relative z-10 transition-all duration-300 ${isImporting ? 'ml-6' : ''}`}>
                                        {isImporting ? 'Baixando...' : 'Baixar Vídeo'}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Erro Geral (do componente pai) */}
            {error && (
                <div className="mt-6 p-4 bg-red-900/30 border border-red-600/50 rounded-xl backdrop-blur-sm" aria-live="polite">
                    <p className="text-red-400 text-center font-medium">{error}</p>
                </div>
            )}
        </div>
    );
};

export default HeroSection;