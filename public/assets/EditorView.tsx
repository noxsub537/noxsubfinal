import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { CaptionStyle, VideoSource } from './../types';
import VideoPreview from './VideoPreview';
import StyleControls from './StyleControls';
import { useCaptionGenerator } from './../hooks/useCaptionGenerator';
import { DownloadIcon, ErrorIcon } from './icons';

// Custom CSS for scrollbar
const customScrollbarStyles = `
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(51, 65, 85, 0.3);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(139, 92, 246, 0.6);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(139, 92, 246, 0.8);
}
`;

// Inject custom styles
if (typeof document !== 'undefined' && !document.getElementById('custom-scrollbar-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'custom-scrollbar-styles';
    styleSheet.textContent = customScrollbarStyles;
    document.head.appendChild(styleSheet);
}

interface EditorViewProps {
    videoSource: VideoSource;
}

const availableLanguages = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ru', label: 'Russian' },
    { code: 'ar', label: 'Arabic' },
    { code: 'pt', label: 'Portuguese (Brazil)' }
];
const whisperModels = [
    { value: 'tiny', label: 'Tiny – Fastest (lowest accuracy)' },
    { value: 'base', label: 'Base – Very fast (basic accuracy)' },
    { value: 'small', label: 'Small – Fast (good accuracy)' },
    { value: 'medium', label: 'Medium – Slower (high accuracy)' },
    { value: 'large-v2', label: 'Large-v2 – Slow, best model (best accuracy)' },
    { value: 'large-v3', label: 'Large-v3 – Slow, best model (maximum accuracy)' },
];

const qualityOptions = [
    { label: '720p', value: 'low' },
    { label: '1080p', value: 'medium' },
    { label: '4K', value: 'high' },
];

// Função para formatar tempo em MM:SS
function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Updated step mapping to match backend's numerical steps
const stepProgressMap: Record<string | number, number> = {
    0: 0,    // Error
    1: 5,    // Starting
    2: 15,   // Saving file
    3: 25,   // Extracting audio
    4: 35,   // FFmpeg processing
    5: 45,   // Loading model
    6: 60,   // Transcribing
    7: 75,   // Processing audio
    8: 85,   // VAD filter
    9: 95,   // Finalizing
    10: 100, // Done
};

const EditorView: React.FC<EditorViewProps> = ({ videoSource }) => {
    const [videoDuration, setVideoDuration] = useState(0);
    const [language, setLanguage] = useState('en'); // Default to English
    const [model, setModel] = useState('small');
    const [shouldGenerate, setShouldGenerate] = useState(false);
    const { captions, isLoading, error, setCaptions, downloadRenderedVideo, loadingText, elapsed, cancelTranscription, stepId } = useCaptionGenerator(
        videoSource,
        videoDuration,
        language,
        model,
        shouldGenerate
    );
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
        fontSize: 17,
        color: '#FFFFFF',
        fontFamily: 'Georgia, serif',
        position: 'bottom',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
    });
    const [selectedQuality, setSelectedQuality] = useState<'low' | 'medium' | 'high'>('medium');
    const [isDownloading, setIsDownloading] = useState(false);

    // --- Mini tutorial ---
    const TutorialCard = () => (
        <div className="mb-6 w-full bg-gradient-to-br from-purple-900/30 to-blue-900/20 border border-purple-700/30 rounded-2xl p-6 shadow-lg text-white">
            <h2 className="text-xl font-bold mb-2">Como funciona?</h2>
            <ol className="list-decimal ml-6 space-y-1 text-base">
                <li>Edite ou adicione suas legendas manualmente no painel abaixo do vídeo.</li>
                <li>Quando estiver satisfeito, clique em <span className="font-semibold text-purple-300">Gerar Legendas</span> para transcrição automática.</li>
                <li>Após gerar, exporte o vídeo legendado na qualidade desejada.</li>
            </ol>
            <div className="mt-3 text-sm text-purple-200">Dica: Você pode ajustar o estilo das legendas antes de exportar!</div>
        </div>
    );

    const handleCaptionTextChange = useCallback((id: number, newText: string) => {
        setCaptions(prev => prev.map(cap => cap.id === id ? { ...cap, text: newText } : cap));
    }, [setCaptions]);

    const handleGenerateCaptions = () => {
        setShouldGenerate(true);
    };

    // Reset shouldGenerate quando vídeo/modelo/language mudam
    useEffect(() => {
        setShouldGenerate(false);
    }, [videoSource, model, language, videoDuration]);

    // Exibir legenda de exemplo assim que o vídeo for carregado no preview, se não houver legendas
    useEffect(() => {
        if (videoDuration > 0 && captions.length === 0) {
            setCaptions([
                { id: 1, start: 0, end: 5, text: 'Digite sua primeira legenda aqui.' }
            ]);
        }
    }, [videoDuration, captions.length, setCaptions]);

    // Verificação simplificada - apenas verifica se há URL do vídeo
    if (!videoSource?.url) {
        return (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
                Selecione um vídeo para começar a editar.
            </div>
        );
    }

    // Novo: Download com qualidade
    const handleDownload = useCallback(async () => {
        if (!videoSource || captions.length === 0 || isDownloading) return;
        setIsDownloading(true);
        try {
            await downloadRenderedVideo(selectedQuality);
        } catch (e: unknown) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('Erro ao baixar vídeo legendado:', e);
            alert(`Erro ao baixar vídeo legendado: ${errorMsg}`);
        } finally {
            setIsDownloading(false);
        }
    }, [videoSource, captions, selectedQuality, isDownloading, downloadRenderedVideo]);

    const progressPercent = useMemo(() => {
        if (stepId !== null && stepId !== undefined && stepProgressMap.hasOwnProperty(stepId)) {
            return stepProgressMap[stepId];
        }
        return 0;
    }, [stepId]);

    // --- Desabilitar todos os controles durante loading ---
    const controlsDisabled = isLoading;
    const canGenerate = captions.length > 0 && !isLoading;
    // Corrigido: download disponível quando não está carregando, há legendas e não há erro
    const canDownload = !isLoading && captions.length > 0 && !error;

    return (
        <div className="w-full max-w-7xl h-full flex flex-col lg:flex-row gap-6">
            <div className="flex-grow lg:w-2/3 flex flex-col gap-6">
                {/* Mini tutorial */}
                <TutorialCard />
                <div className="bg-black rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                    <VideoPreview
                        videoUrl={videoSource.url}
                        captions={captions}
                        style={captionStyle}
                        onTimeUpdate={() => { }}
                        onDurationChange={setVideoDuration}
                    />
                </div>
                <div className="bg-slate-800/80 p-4 rounded-2xl shadow-lg ring-1 ring-white/10">
                    <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2">Edit Style</h3>
                    <StyleControls style={captionStyle} onStyleChange={setCaptionStyle} />
                </div>
            </div>
            <div className="w-full lg:w-1/3 flex flex-col gap-6">
                {/* Export Video Box */}
                <div className="bg-slate-800/80 p-4 rounded-2xl shadow-lg ring-1 ring-white/10">
                    <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2">Export Video</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {qualityOptions.map(q => (
                            <button
                                key={q.value}
                                className={
                                    selectedQuality === q.value
                                        ? "bg-purple-600 text-white font-semibold py-2 rounded-lg text-sm"
                                        : "bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm transition-colors"
                                }
                                onClick={() => setSelectedQuality(q.value as 'low' | 'medium' | 'high')}
                                disabled={controlsDisabled}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>
                    <button
                        className={
                            `w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200` +
                            (controlsDisabled || !canDownload || isDownloading ? ' cursor-not-allowed opacity-70' : '')
                        }
                        onClick={handleDownload}
                        disabled={controlsDisabled || !canDownload || isDownloading}
                    >
                        {isDownloading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Baixando...
                            </span>
                        ) : (
                            <>
                                <DownloadIcon className="h-5 w-5" />
                                <span>Download</span>
                            </>
                        )}
                    </button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                        Exporte o vídeo legendado na qualidade desejada.
                    </p>
                </div>
                {/* Whisper Model Box */}
                <div className="bg-slate-800/80 p-4 rounded-2xl shadow-lg ring-1 ring-white/10">
                    <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2">Modelo Whisper</h3>
                    <select
                        id="whisper-model"
                        name="whisper-model"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                        className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-3"
                        disabled={controlsDisabled}
                    >
                        {whisperModels.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <button
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200"
                        onClick={handleGenerateCaptions}
                        disabled={!canGenerate}
                    >
                        Gerar Legendas
                    </button>
                    <div className="text-xs text-slate-400 mt-2">
                        Large models (large-v2, large-v3) may take longer to process and require a GPU.
                    </div>
                </div>
                {/* Transcript Panel */}
                <div className="bg-slate-800/80 rounded-2xl p-4 shadow-lg flex flex-col h-[520px] ring-1 ring-white/10">
                    {isLoading ? (
                        <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden">
                            {/* Background gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-slate-800/30 to-blue-900/10 rounded-xl"></div>
                            {/* Content container */}
                            <div className="relative z-10 flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                                {/* Main spinner with glow effect */}
                                <div className="relative mb-8">
                                    <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-pulse"></div>
                                    <div className="relative w-16 h-16 border-4 border-slate-600 border-t-purple-400 border-r-purple-300 rounded-full animate-spin shadow-lg"></div>
                                    <div className="absolute inset-2 w-12 h-12 border-2 border-slate-700 border-b-purple-500 rounded-full animate-spin animation-delay-150"></div>
                                </div>
                                {/* Progress section in the loading state */}
                                <div className="w-full mb-6 space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className={`font-medium ${error ? 'text-red-400' : 'text-purple-300'}`}>
                                            {error ? 'Erro' : 'Progresso'}
                                        </span>
                                        <span className={`font-semibold ${error ? 'text-red-400' : 'text-white'}`}>
                                            {(() => {
                                                if (error) return '0%';
                                                // Extract percentage if it's in the status text
                                                const percentMatch = loadingText?.match(/(\d+)%/);
                                                if (percentMatch) {
                                                    return percentMatch[1] + '%';
                                                }
                                                // Otherwise use step-based progress
                                                return progressPercent + '%';
                                            })()}
                                        </span>
                                    </div>

                                    <div className="relative w-full h-3 bg-slate-700/50 rounded-full overflow-hidden shadow-inner">
                                        <div className="absolute inset-0 bg-gradient-to-r from-slate-700 to-slate-600 rounded-full"></div>
                                        <div
                                            className={`relative h-full rounded-full shadow-lg transition-all duration-500 ease-out ${
                                                error 
                                                    ? 'bg-gradient-to-r from-red-600 to-red-400' 
                                                    : 'bg-gradient-to-r from-purple-500 via-purple-400 to-purple-300'
                                            }`}
                                            style={{ 
                                                width: (() => {
                                                    if (error) return '100%';
                                                    const percentMatch = loadingText?.match(/(\d+)%/);
                                                    if (percentMatch) {
                                                        return percentMatch[1] + '%';
                                                    }
                                                    return progressPercent + '%';
                                                })()
                                            }}
                                        >
                                            <div className={`absolute inset-0 rounded-full ${error ? 'bg-red-500/20' : 'bg-white/20'} ${!error && 'animate-pulse'}`}></div>
                                            {!error && (
                                                <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-white/40 to-transparent rounded-full"></div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 mb-8">
                                    <h4 className={`text-xl font-bold tracking-tight ${error ? 'text-red-400' : 'text-white'}`}>
                                        {error ? 'Erro na Transcrição' : (loadingText || 'Processando...')}
                                    </h4>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        {error ? (
                                            <>
                                                Ocorreu um erro durante o processo.<br/>
                                                <span className="text-red-400">Tente novamente ou use um arquivo diferente.</span>
                                            </>
                                        ) : stepId === 6 ? (
                                            <>
                                                Transcrevendo seu vídeo.<br/>
                                                <span className="text-purple-300">Por favor aguarde...</span>
                                            </>
                                        ) : (
                                            <>
                                                Aguarde enquanto processamos seu vídeo.<br/>
                                                <span className="text-purple-300">Isso pode levar alguns minutos.</span>
                                            </>
                                        )}
                                    </p>
                                </div>

                                {elapsed > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-6">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                                        <span>Tempo decorrido: {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}</span>
                                    </div>
                                )}

                                <button
                                    className="group relative px-8 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2 focus:ring-offset-slate-800"
                                    onClick={cancelTranscription}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-red-400/20 to-red-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    <span className="relative flex items-center gap-2">
                                        <svg className="w-4 h-4 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Cancelar Transcrição
                                    </span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="flex-shrink-0 mb-4">
                                <label htmlFor="language" className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                    </svg>
                                    Caption Language
                                </label>
                                <select
                                    id="language"
                                    name="language"
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full p-3 bg-slate-700/80 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm hover:bg-slate-700 transition-all duration-200 shadow-sm"
                                    disabled={controlsDisabled}
                                >
                                    {availableLanguages.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.label}</option>
                                    ))}
                                </select>
                            </div>
                            {/* Enhanced Transcript Panel */}
                            <div className="flex-grow flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-semibold text-white">Transcript</h3>
                                        <span className="px-2 py-1 text-xs bg-purple-600/20 text-purple-300 rounded-full font-medium">
                                            {captions.length} {captions.length === 1 ? 'caption' : 'captions'}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200 group"
                                            title="Add new caption"
                                            onClick={() => {
                                                const newId = Math.max(...captions.map(c => c.id), 0) + 1;
                                                const lastCaption = captions[captions.length - 1];
                                                const startTime = lastCaption ? lastCaption.end : 0;
                                                setCaptions(prev => [...prev, {
                                                    id: newId,
                                                    start: startTime,
                                                    end: startTime + 3,
                                                    text: 'Nova legenda...'
                                                }]);
                                            }}
                                            disabled={controlsDisabled}
                                        >
                                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                        <button
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200 group"
                                            title="Export transcript"
                                            onClick={() => {
                                                const transcript = captions.map((cap, i) =>
                                                    `${i + 1}\n${formatTime(cap.start)} --> ${formatTime(cap.end)}\n${cap.text}\n`
                                                ).join('\n');
                                                const blob = new Blob([transcript], { type: 'text/plain' });
                                                const url = URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = 'transcript.srt';
                                                a.click();
                                                URL.revokeObjectURL(url);
                                            }}
                                            disabled={controlsDisabled}
                                        >
                                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-hidden rounded-xl bg-slate-900/50 border border-slate-700/50">
                                    <div className="h-full overflow-y-auto custom-scrollbar p-1">
                                        {captions.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                                                <div className="w-16 h-16 bg-slate-700/30 rounded-full flex items-center justify-center mb-4">
                                                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2M7 4h10M7 4l-1 16h12L17 4M10 8v8m4-8v8m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </div>
                                                <p className="text-slate-400 text-sm">Nenhuma legenda ainda</p>
                                                <p className="text-slate-500 text-xs mt-1">Gere legendas automaticamente ou adicione manualmente</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 p-3">
                                                {captions.map((caption, index) => (
                                                    <div
                                                        key={caption.id}
                                                        className="group relative bg-slate-800/60 hover:bg-slate-800/80 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200 hover:shadow-lg"
                                                    >
                                                        {/* Caption header */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-3">
                                                                <span className="flex items-center justify-center w-6 h-6 bg-purple-600/20 text-purple-300 text-xs font-bold rounded-full">
                                                                    {index + 1}
                                                                </span>
                                                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                    <span className="font-mono bg-slate-700/50 px-2 py-1 rounded">
                                                                        {formatTime(caption.start)}
                                                                    </span>
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                    <span className="font-mono bg-slate-700/50 px-2 py-1 rounded">
                                                                        {formatTime(caption.end)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-200"
                                                                title="Delete caption"
                                                                onClick={() => {
                                                                    setCaptions(prev => prev.filter(c => c.id !== caption.id));
                                                                }}
                                                                disabled={controlsDisabled}
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                        {/* Caption text */}
                                                        <textarea
                                                            value={caption.text}
                                                            onChange={(e) => handleCaptionTextChange(caption.id, e.target.value)}
                                                            className="w-full bg-transparent text-slate-100 text-sm leading-relaxed resize-none border-none outline-none placeholder:text-slate-500 min-h-[3rem] focus:ring-0"
                                                            placeholder="Digite o texto da legenda..."
                                                            rows={2}
                                                            disabled={controlsDisabled}
                                                        />
                                                        {/* Character count */}
                                                        <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            <div className="text-xs text-slate-500">
                                                                {caption.text.length} caracteres
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                                <span>Duração: {(caption.end - caption.start).toFixed(1)}s</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {error && (
                                <div className="pt-2 flex items-center gap-2 text-sm text-red-400 flex-shrink-0">
                                    <ErrorIcon className="h-5 w-5 flex-shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EditorView;