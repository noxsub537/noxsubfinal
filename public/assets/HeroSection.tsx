import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadIcon } from './icons';

// --- Constantes para melhor manutenção ---
const API_BASE_URL = 'http://localhost:8000';
const YOUTUBE_METADATA_URL = `${API_BASE_URL}/api/youtube-metadata`;
const DOWNLOAD_VIDEO_URL = `${API_BASE_URL}/api/download-video`;
const FILES_URL = `${API_BASE_URL}/files/`;

// --- Interfaces e Tipos ---
interface HeroSectionProps {
    onVideoSelect: (file: File) => void;
    error: string | null;
}

interface YouTubeVideoMeta {
    id: string;
    title: string;
    thumbnail: string;
    duration: string;
    channelTitle: string;
}

interface YouTubeState {
    status: string;
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
    const fileInputRef = useRef<HTMLInputElement>(null);
    const debouncedVideoLink = useDebounce(videoLink, 500); // 500ms de delay

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

    // --- Lógica de Importação do YouTube ---
    const fetchYouTubeMetadata = async (url: string) => {
        const videoId = extractYouTubeId(url);
        if (!videoId) return;

        setYoutubeState({ status: 'loadingMeta', meta: null, error: null });
        try {
            const response = await fetch(YOUTUBE_METADATA_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_id: videoId }),
            });

            if (!response.ok) throw new Error('Falha ao obter metadados do vídeo.');

            const data: YouTubeVideoMeta = await response.json();
            setYoutubeState({ status: 'success', meta: data, error: null });
        } catch (err) {
            console.error('Erro ao buscar metadados:', err);
            setYoutubeState({ status: 'error', meta: null, error: (err as Error).message });
        }
    };

    useEffect(() => {
        if (debouncedVideoLink && isValidYouTubeUrl(debouncedVideoLink)) {
            fetchYouTubeMetadata(debouncedVideoLink);
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
        if (isValidYouTubeUrl(pastedText)) {
            setVideoLink(pastedText); // Atualiza o input imediatamente
            // A busca será acionada pelo useEffect com o valor debounceado
        }
    };

    const handleImportFromUrl = async () => {
        if (youtubeState.status !== 'success' || !youtubeState.meta) return;

        setYoutubeState(prevState => ({ ...prevState, status: 'importing', error: null }));

        try {
            // 1. Baixa o vídeo no backend
            const downloadResp = await fetch(DOWNLOAD_VIDEO_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: videoLink }),
            });

            if (!downloadResp.ok) {
                const errorData = await downloadResp.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Falha ao baixar o vídeo do servidor.');
            }

            const { filename } = await downloadResp.json();
            if (!filename) throw new Error('Nome do arquivo não foi retornado pelo backend.');

            // 2. Busca o arquivo baixado
            const fileResp = await fetch(`${FILES_URL}${filename}`);
            if (!fileResp.ok) throw new Error('Arquivo baixado não foi encontrado no servidor.');

            const blob = await fileResp.blob();
            const sanitizedTitle = youtubeState.meta.title.replace(/[<>:"/\\|?*]/g, '_');
            const file = new File([blob], `${sanitizedTitle}.mp4`, { type: blob.type });

            onVideoSelect(file);

            // Limpa o formulário após sucesso
            setVideoLink('');
            setYoutubeState({ status: 'idle', meta: null, error: null });

        } catch (err) {
            const errorMsg = (err as Error).message;
            console.error('Erro ao importar vídeo:', err);

            // Exibe erro específico para problemas de cookies de forma mais amigável
            if (errorMsg.includes('cookies') || errorMsg.includes('login required')) {
                setYoutubeState(prevState => ({
                    ...prevState,
                    status: 'error',
                    error: 'Erro de autenticação. Tente fazer login no YouTube no seu navegador e tente novamente.'
                }));
            } else {
                setYoutubeState(prevState => ({ ...prevState, status: 'error', error: `Erro ao importar: ${errorMsg}` }));
            }
        }
    };

    const statusStr = String(youtubeState.status);

    return (
        <div className="w-full max-w-5xl mx-auto px-4">
            {/* Upload Area */}
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

            {/* Divider */}
            <div className="my-12 flex items-center justify-center">
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
                <span className="mx-6 text-slate-400 font-medium bg-slate-800/50 px-4 py-2 rounded-full border border-slate-600/50">OU</span>
                <div className="flex-grow h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent"></div>
            </div>

            {/* YouTube URL Input */}
            <div className="space-y-6">
                <div className="relative group">
                    <input
                        type="text"
                        placeholder="Cole o link do vídeo do YouTube"
                        className="w-full bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-600/50 text-white placeholder-slate-400 rounded-2xl p-5 pr-14 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 transition-all duration-300 hover:border-slate-500/70"
                        value={videoLink}
                        onChange={handleLinkChange}
                        onPaste={handlePaste}
                    />
                    {youtubeState.status === 'loadingMeta' && (
                        <div className="absolute right-5 top-1/2 transform -translate-y-1/2">
                            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>

                {/* YouTube Error Message */}
                {youtubeState.status === 'error' && youtubeState.error && (
                    <div className="p-3 bg-red-900/30 border border-red-600/50 rounded-xl" aria-live="polite">
                        <p className="text-red-400 text-center text-sm font-medium">{youtubeState.error}</p>
                    </div>
                )}


                {/* Video Preview Card */}
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
                                    onClick={handleImportFromUrl}
                                    disabled={statusStr === 'importing'}
                                    className="group/import mt-4 md:mt-auto self-start relative overflow-hidden bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-300 transform hover:scale-105 disabled:hover:scale-100 hover:shadow-lg hover:shadow-green-500/25 disabled:cursor-not-allowed"
                                >
                                    {statusStr === 'importing' && (
                                        <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                    )}
                                    <span className={`relative z-10 transition-all duration-300 ${statusStr === 'importing' ? 'ml-6' : ''}`}>
                                        {statusStr === 'importing' ? 'Importando...' : 'Importar Vídeo'}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Erro geral (do componente pai) */}
            {error && (
                <div className="mt-6 p-4 bg-red-900/30 border border-red-600/50 rounded-xl backdrop-blur-sm" aria-live="polite">
                    <p className="text-red-400 text-center font-medium">{error}</p>
                </div>
            )}
        </div>
    );
};

export default HeroSection;