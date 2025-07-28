import React, { useState, useCallback, useEffect, useRef } from 'react';
import { CaptionStyle, VideoSource } from './../types';
import VideoPreview from './VideoPreview';
import StyleControls from './StyleControls';
import { useCaptionGenerator } from './../hooks/useCaptionGenerator';
import { DownloadIcon, ErrorIcon } from './icons';

const customScrollbarStyles = `.custom-scrollbar::-webkit-scrollbar{width:6px}.custom-scrollbar::-webkit-scrollbar-track{background:rgba(51,65,85,0.3);border-radius:3px}.custom-scrollbar::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.6);border-radius:3px}.custom-scrollbar::-webkit-scrollbar-thumb:hover{background:rgba(139,92,246,0.8)}`;

if (typeof document !== 'undefined' && !document.getElementById('custom-scrollbar-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'custom-scrollbar-styles';
    styleSheet.textContent = customScrollbarStyles;
    document.head.appendChild(styleSheet);
}

interface EditorViewProps {
    videoSource: VideoSource;
    whisperModels: { value: string, label: string }[];
}

const availableLanguages = [
    { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' }, { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' }, { code: 'it', label: 'Italian' }, { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' }, { code: 'zh', label: 'Chinese' }, { code: 'ru', label: 'Russian' },
    { code: 'ar', label: 'Arabic' }, { code: 'pt', label: 'Portuguese (Brazil)' }
];

const BACKEND_URL =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000/api'
    : 'https://backendnoxsub.vercel.app/api';

const qualityOptions = [
    { label: '720p', value: 'low' }, { label: '1080p', value: 'medium' }, { label: '4K', value: 'high' }
];

const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const stepProgressMap: Record<string | number, number> = {
    0: 0, 1: 5, 2: 15, 3: 25, 4: 35, 5: 45, 6: 60, 7: 75, 8: 85, 9: 95, 10: 100
};

const EditorView: React.FC<EditorViewProps> = ({ videoSource, whisperModels }) => {
    const [videoDuration, setVideoDuration] = useState(0);
    const [language, setLanguage] = useState('en');
    const [model, setModel] = useState('small');
    const [shouldGenerate, setShouldGenerate] = useState(false);
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
        fontSize: 17, color: '#FFFFFF', fontFamily: 'Georgia, serif',
        position: 'bottom', backgroundColor: 'rgba(0, 0, 0, 0.7)'
    });
    const { captions, isLoading, error, setCaptions, loadingText, elapsed, cancelTranscription, stepId } = useCaptionGenerator(videoSource, videoDuration, language, model, shouldGenerate, captionStyle);
    const [selectedQuality, setSelectedQuality] = useState<'low' | 'medium' | 'high'>('medium');
    const [isDownloading, setIsDownloading] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);
    const [pendingDownload, setPendingDownload] = useState<null | { quality: 'low' | 'medium' | 'high' }>(null);
    const [downloadFilename] = useState('video_legendado.mp4');
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const downloadProgressRef = useRef<number | null>(null);
    const [progress, setProgress] = useState(0);

    const TutorialCard = () => (
        <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/20 border border-purple-700/30 rounded-xl p-4 shadow-lg text-white">
            <h2 className="text-lg font-bold mb-2">Como funciona?</h2>
            <ol className="list-decimal ml-4 space-y-1 text-sm">
                <li>Edite ou adicione suas legendas manualmente no painel abaixo do vídeo.</li>
                <li>Quando estiver satisfeito, clique em <span className="font-semibold text-purple-300">Gerar Legendas</span> para transcrição automática.</li>
                <li>Após gerar, exporte o vídeo legendado na qualidade desejada.</li>
            </ol>
            <div className="mt-2 text-xs text-purple-200">Dica: Você pode ajustar o estilo das legendas antes de exportar!</div>
        </div>
    );

    const DownloadModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: (filename: string) => void; defaultFilename: string; }> = ({ isOpen, onClose, onConfirm, defaultFilename }) => {
        const [filename, setFilename] = useState(defaultFilename);
        useEffect(() => { setFilename(defaultFilename); }, [defaultFilename, isOpen]);
        if (!isOpen) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-slate-900 rounded-xl shadow-2xl p-6 w-full max-w-md border border-purple-700/30">
                    <h2 className="text-lg font-bold mb-3 text-white">Salvar vídeo legendado</h2>
                    <label className="block text-slate-300 mb-2 font-medium text-sm">Nome do arquivo</label>
                    <input className="w-full p-2 rounded-lg bg-slate-800 border border-slate-700 text-white mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500" value={filename} onChange={e => setFilename(e.target.value)} autoFocus />
                    <div className="flex justify-end gap-2">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm">Cancelar</button>
                        <button onClick={() => onConfirm(filename)} className="px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 text-sm">Salvar</button>
                    </div>
                </div>
            </div>
        );
    };

    const handleCaptionTextChange = useCallback((id: number, newText: string) => {
        setCaptions(prev => prev.map(cap => cap.id === id ? { ...cap, text: newText } : cap));
    }, [setCaptions]);

    const handleGenerateCaptions = () => setShouldGenerate(true);

    const handleDownload = useCallback(async () => {
        if (!videoSource || captions.length === 0 || isDownloading) return;
        setPendingDownload({ quality: selectedQuality });
        setShowDownloadModal(true);
    }, [videoSource, captions, selectedQuality, isDownloading]);

    const handleDownloadConfirm = async (filename: string) => {
        setShowDownloadModal(false);
        setIsDownloading(true);
        setDownloadProgress(0);
        try {
            // Download com progresso (fetch + stream)
            const quality = pendingDownload?.quality || 'medium';
            // Busca o vídeo real
            const videoResponse = await fetch(videoSource.url);
            if (!videoResponse.ok) throw new Error('Não foi possível baixar o vídeo original.');
            const videoBlob = await videoResponse.blob();
            const videoFile = new File([videoBlob], videoSource.filename || 'video.mp4', { type: videoBlob.type });
            // Monta o formData corretamente
            const formData = new FormData();
            formData.append('file', videoFile);
            const captionsFile = new File([JSON.stringify(captions, null, 2)], 'captions.json', { type: 'application/json' });
            formData.append('captions', captionsFile);
            formData.append('quality', quality);
            if (captionStyle) {
                formData.append('style', JSON.stringify(captionStyle));
            }
            formData.append('format', 'mp4');
            // Chama o endpoint de render normalmente, mas acompanha progresso
            const response = await fetch(`${BACKEND_URL}/render`, {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) throw new Error('Erro ao exportar vídeo.');
            const contentLength = response.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : null;
            const reader = response.body?.getReader();
            let received = 0;
            let chunks: Uint8Array[] = [];
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (value) {
                        chunks.push(value);
                        received += value.length;
                        if (total) {
                          const percent = Math.round((received / total) * 100);
                          setDownloadProgress(percent);
                          downloadProgressRef.current = percent;
                        }
                    }
                }
                setDownloadProgress(100);
                downloadProgressRef.current = 100;
                const blob = new Blob(chunks, { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } else {
                // fallback
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error('Erro ao baixar vídeo legendado:', e);
            alert(`Erro ao baixar vídeo legendado: ${errorMsg}`);
        } finally {
            setIsDownloading(false);
            setDownloadProgress(null);
            setPendingDownload(null);
        }
    };

    // Barra de progresso gradual e suave
    useEffect(() => {
        let interval: number | undefined;
        if (isLoading) {
            const target = (stepId !== null && stepId !== undefined && stepProgressMap.hasOwnProperty(stepId)) ? stepProgressMap[stepId] : 0;
            if (progress < target) {
                interval = window.setInterval(() => {
                    setProgress(prev => {
                        if (prev < target) {
                            return prev + 1;
                        } else {
                            if (interval) clearInterval(interval);
                            return target;
                        }
                    });
                }, 10); // 10ms para suavidade
            } else if (progress > target) {
                setProgress(target);
            }
        } else {
            setProgress(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [stepId, isLoading, progress]);

    useEffect(() => setShouldGenerate(false), [videoSource, model, language, videoDuration]);

    useEffect(() => {
        if (videoDuration > 0 && captions.length === 0) {
            setCaptions([{ id: 1, start: 0, end: 100, text: 'Digite sua primeira legenda aqui.' }]);
        }
    }, [videoDuration, captions.length, setCaptions]);

    if (!videoSource?.url) {
        return (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
                Selecione um vídeo para começar a editar.
            </div>
        );
    }

    const controlsDisabled = isLoading;
    const canGenerate = captions.length > 0 && !isLoading;
    const canDownload = !isLoading && captions.length > 0 && !error;

    return (
        <div style={{
            zoom: 0.75        }} className="w-full max-w-7xl h-full flex flex-col lg:flex-row gap-4">
            <div className="flex-grow lg:w-2/3 flex flex-col gap-4">
                <TutorialCard />
                <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg ring-1 ring-white/10 p-4">
                    <VideoPreview videoUrl={videoSource.url} captions={captions} style={captionStyle} onTimeUpdate={() => {}} onDurationChange={setVideoDuration} />
                </div>
                <div className="relative">
                    <div className="bg-slate-800/90 p-4 rounded-xl shadow-lg ring-1 ring-white/10">
                        <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2 text-white">Edit Style</h3>
                        <StyleControls style={captionStyle} onStyleChange={setCaptionStyle} />
                    </div>
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900/80 backdrop-blur-[2px] rounded-xl">
                            <div className="mb-4">
                                <svg className="animate-spin h-8 w-8 text-purple-400" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                            </div>
                            <span className="text-purple-200 font-medium">Gerando legendas...</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
                <div className="bg-slate-800/90 p-4 rounded-xl shadow-lg ring-1 ring-white/10 relative min-h-[220px] flex flex-col justify-between" style={{height:'220px', maxHeight:'220px'}}>
                    <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2 text-white">Export Video</h3>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        {qualityOptions.map(q => (
                            <button key={q.value} className={selectedQuality === q.value ? "bg-purple-600 text-white font-semibold py-2 rounded-lg text-sm" : "bg-slate-700 hover:bg-slate-600 text-slate-300 py-2 rounded-lg text-sm transition-colors"} onClick={() => setSelectedQuality(q.value as 'low' | 'medium' | 'high')} disabled={controlsDisabled || isDownloading}>
                                {q.label}
                            </button>
                        ))}
                    </div>
                    <button className={`w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200${(controlsDisabled || !canDownload || isDownloading) ? ' cursor-not-allowed opacity-70' : ''}`} onClick={handleDownload} disabled={controlsDisabled || !canDownload || isDownloading}>
                        {isDownloading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Exportando...
                            </span>
                        ) : (
                            <>
                                <DownloadIcon className="h-4 w-4" />
                                <span>Download</span>
                            </>
                        )}
                    </button>
                    <div className="mt-3" style={{minHeight:'24px'}}>
                        {isDownloading && (
                            <div className="w-full">
                                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-purple-500 via-purple-400 to-purple-300 transition-all duration-200" style={{ width: `${downloadProgress ?? 10}%` }}></div>
                                </div>
                                <div className="text-xs text-slate-400 mt-1 text-center">{downloadProgress !== null ? `Progresso: ${downloadProgress}%` : 'Preparando exportação...'}</div>
                            </div>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-center">Exporte o vídeo legendado na qualidade desejada.</p>
                </div>
                <div className="bg-slate-800/90 p-4 rounded-xl shadow-lg ring-1 ring-white/10">
                    <h3 className="text-lg font-semibold mb-3 border-b border-slate-700 pb-2 text-white">Modelo Whisper</h3>
                    <select value={model} onChange={e => setModel(e.target.value)} className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm mb-3" disabled={controlsDisabled}>
                        {whisperModels.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200" onClick={handleGenerateCaptions} disabled={!canGenerate}>
                        Gerar Legendas
                    </button>
                    <div className="text-xs text-slate-400 mt-2">Large models (large-v2, large-v3) may take longer to process and require a GPU.</div>
                </div>
                <div className="bg-slate-800/90 rounded-xl p-4 shadow-lg flex flex-col h-[612px] ring-1 ring-white/10">
                    {isLoading ? (
                        <div className="flex-grow flex flex-col items-center justify-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-900/10 via-slate-800/30 to-blue-900/10 rounded-lg"></div>
                            <div className="relative z-10 flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl animate-pulse"></div>
                                    <div className="relative w-12 h-12 border-4 border-slate-600 border-t-purple-400 border-r-purple-300 rounded-full animate-spin shadow-lg"></div>
                                    <div className="absolute inset-2 w-8 h-8 border-2 border-slate-700 border-b-purple-500 rounded-full animate-spin animation-delay-150"></div>
                                </div>
                                <div className="w-full mb-4 space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className={`font-medium ${error ? 'text-red-400' : 'text-purple-300'}`}>{error ? 'Erro' : 'Progresso'}</span>
                                        <span className={`font-semibold ${error ? 'text-red-400' : 'text-white'}`}>
                                            {(() => {
                                                if (error) return '0%';
                                                const percentMatch = loadingText?.match(/(\d+)%/);
                                                if (percentMatch) return percentMatch[1] + '%';
                                                return progress + '%';
                                            })()}
                                        </span>
                                    </div>
                                    <div className="relative w-full h-2 bg-slate-700/50 rounded-full overflow-hidden shadow-inner">
                                        <div className="absolute inset-0 bg-gradient-to-r from-slate-700 to-slate-600 rounded-full"></div>
                                        <div className={`relative h-full rounded-full shadow-lg transition-all duration-200 ease-out ${error ? 'bg-gradient-to-r from-red-600 to-red-400' : 'bg-gradient-to-r from-purple-500 via-purple-400 to-purple-300'}`} style={{ width: (() => { if (error) return '100%'; const percentMatch = loadingText?.match(/(\d+)%/); if (percentMatch) return percentMatch[1] + '%'; return progress + '%'; })() }}>
                                            <div className={`absolute inset-0 rounded-full ${error ? 'bg-red-500/20' : 'bg-white/20'} ${!error && 'animate-pulse'}`}></div>
                                            {!error && (<div className="absolute right-0 top-0 h-full w-3 bg-gradient-to-l from-white/40 to-transparent rounded-full"></div>)}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2 mb-6">
                                    <h4 className={`text-lg font-bold tracking-tight ${error ? 'text-red-400' : 'text-white'}`}>{error ? 'Erro na Transcrição' : (loadingText || 'Processando...')}</h4>
                                    <p className="text-slate-400 text-sm leading-relaxed">
                                        {error ? (<>Ocorreu um erro durante o processo.<br/><span className="text-red-400">Tente novamente ou use um arquivo diferente.</span></>) : stepId === 6 ? (<>Transcrevendo seu vídeo.<br/><span className="text-purple-300">Por favor aguarde...</span></>) : (<>Aguarde enquanto processamos seu vídeo.<br/><span className="text-purple-300">Isso pode levar alguns minutos.</span></>)}
                                    </p>
                                </div>
                                {elapsed > 0 && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-4">
                                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                                        <span>Tempo decorrido: {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, '0')}</span>
                                    </div>
                                )}
                                <button className="group relative px-6 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2 focus:ring-offset-slate-800" onClick={cancelTranscription}>
                                    <div className="absolute inset-0 bg-gradient-to-r from-red-400/20 to-red-500/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
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
                            <div className="flex-shrink-0 mb-3">
                                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                                    </svg>
                                    Caption Language
                                </label>
                                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full py-3 px-2 bg-slate-700/80 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm hover:bg-slate-700 transition-all duration-200 shadow-sm text-white" disabled={controlsDisabled}>
                                    {availableLanguages.map(lang => (
                                        <option key={lang.code} value={lang.code}>{lang.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex-grow flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-semibold text-white">Transcript</h3>
                                        <span className="px-2 py-1 text-xs bg-purple-600/20 text-purple-300 rounded-full font-medium">{captions.length} {captions.length === 1 ? 'caption' : 'captions'}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200 group" title="Add new caption" onClick={() => { const newId = Math.max(...captions.map(c => c.id), 0) + 1; const lastCaption = captions[captions.length - 1]; const startTime = lastCaption ? lastCaption.end : 0; setCaptions(prev => [...prev, { id: newId, start: startTime, end: startTime + 3, text: 'Nova legenda...' }]); }} disabled={controlsDisabled}>
                                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                        <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all duration-200 group" title="Export transcript" onClick={() => { const transcript = captions.map((cap, i) => `${i + 1}\n${formatTime(cap.start)} --> ${formatTime(cap.end)}\n${cap.text}\n`).join('\n'); const blob = new Blob([transcript], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'transcript.srt'; a.click(); URL.revokeObjectURL(url); }} disabled={controlsDisabled}>
                                            <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-grow overflow-hidden rounded-lg bg-slate-900/50 border border-slate-700/50">
                                    <div className="h-full overflow-y-auto custom-scrollbar p-1">
                                        {captions.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                                <div className="w-12 h-12 bg-slate-700/30 rounded-full flex items-center justify-center mb-3">
                                                    <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2M7 4h10M7 4l-1 16h12L17 4M10 8v8m4-8v8m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </div>
                                                <p className="text-slate-400 text-sm">Nenhuma legenda ainda</p>
                                                <p className="text-slate-500 text-xs mt-1">Gere legendas automaticamente ou adicione manualmente</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 p-2">
                                                {captions.map((caption, index) => (
                                                    <div key={caption.id} className="group relative bg-slate-800/60 hover:bg-slate-800/80 rounded-lg p-3 border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200 hover:shadow-lg">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="flex items-center justify-center w-5 h-5 bg-purple-600/20 text-purple-300 text-xs font-bold rounded-full">{index + 1}</span>
                                                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                                                    <span className="font-mono bg-slate-700/50 px-2 py-1 rounded">{formatTime(caption.start)}</span>
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                    <span className="font-mono bg-slate-700/50 px-2 py-1 rounded">{formatTime(caption.end)}</span>
                                                                </div>
                                                            </div>
                                                            <button className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-all duration-200" title="Delete caption" onClick={() => { setCaptions(prev => prev.filter(c => c.id !== caption.id)); }} disabled={controlsDisabled}>
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                        <textarea value={caption.text} onChange={(e) => handleCaptionTextChange(caption.id, e.target.value)} className="w-full bg-transparent text-slate-100 text-sm leading-relaxed resize-none border-none outline-none placeholder:text-slate-500 min-h-[2.5rem] focus:ring-0" placeholder="Digite o texto da legenda..." rows={2} disabled={controlsDisabled} />
                                                        <div className="flex items-center justify-between mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                            <div className="text-xs text-slate-500">{caption.text.length} caracteres</div>
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
                                    <ErrorIcon className="h-4 w-4 flex-shrink-0" />
                                    <p>{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} onConfirm={handleDownloadConfirm} defaultFilename={downloadFilename} />
        </div>
    );
};

export default EditorView;