import { useState, useEffect, useRef } from 'react';
import { Caption, VideoSource } from '../types';

// Suporte a Render.com, localhost e produção
const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000/api'
    : 'https://seu-backend-no-render.onrender.com/api');

// Função para testar se o backend está disponível
async function testBackendConnection(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout

        const response = await fetch(`${BACKEND_URL}/health`, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response.ok || response.status === 200;
    } catch (error) {
        console.warn(`Backend remoto não está disponível:`, error);
        if (error instanceof TypeError && error.message.includes('CORS')) {
            console.info('Servidor pode estar rodando mas com problema de CORS');
            return true;
        }
        return false;
    }
}

export const useCaptionGenerator = (
    videoSource: VideoSource | null,
    videoDuration: number,
    language: string,
    model: string = 'small',
    shouldGenerate: boolean = false,
    captionStyle?: any
) => {
    const [captions, setCaptions] = useState<Caption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingText, setLoadingText] = useState('');
    const [elapsed, setElapsed] = useState(0);
    const [stepId, setStepId] = useState<string | number | null>(null);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const cleanup = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

    const cancelTranscription = () => {
        cleanup();
        setIsLoading(false);
        setLoadingText('Transcrição cancelada');
        setElapsed(0);
        setError(null);
        setStepId(null);
    };

    useEffect(() => {
        if (!videoSource || videoDuration <= 0 || !shouldGenerate) return;

        const generateCaptions = async () => {
            setIsLoading(true);
            setError(null);
            setElapsed(0);
            setLoadingText('Verificando conexão com o servidor...');
            setStepId(null);

            abortControllerRef.current = new AbortController();

            try {
                setLoadingText('Verificando servidor backend...');
                const isBackendAvailable = await testBackendConnection();
                if (!isBackendAvailable) {
                    throw new Error(`Não foi possível conectar ao servidor backend remoto.`);
                }

                setLoadingText('Baixando vídeo...');
                const videoResponse = await fetch(videoSource.url, {
                    signal: abortControllerRef.current.signal
                });
                if (!videoResponse.ok) {
                    throw new Error(`Não foi possível baixar o vídeo. Status: ${videoResponse.status}`);
                }
                const blob = await videoResponse.blob();
                const file = new File([blob], videoSource.filename || 'video.mp4', { type: blob.type });
                const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

                setLoadingText('Preparando transcrição...');
                const formData = new FormData();
                formData.append('file', file);
                formData.append('model', model);
                formData.append('language', language);
                formData.append('session_id', sessionId);

                timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);

                // --- SSE para progresso ---
                if (eventSourceRef.current) eventSourceRef.current.close();
                const sseUrl = `${BACKEND_URL.replace(/\/api$/, '')}/api/transcribe-status?session_id=${encodeURIComponent(sessionId)}`;
                const es = new window.EventSource(sseUrl);
                eventSourceRef.current = es;
                es.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.status) setLoadingText(data.status);
                        if (typeof data.stepId !== 'undefined') setStepId(data.stepId);
                    } catch {}
                };
                es.onerror = () => {
                    es.close();
                };

                setLoadingText('Enviando vídeo para transcrição...');
                const backendResponse = await fetch(`${BACKEND_URL}/transcribe`, {
                    method: 'POST',
                    body: formData,
                    mode: 'cors',
                    credentials: 'omit',
                    signal: abortControllerRef.current.signal,
                });

                if (!backendResponse.ok) {
                    const errorText = await backendResponse.text();
                    throw new Error(`Erro do servidor (${backendResponse.status}): ${errorText}`);
                }

                const responseJson = await backendResponse.json();
                const parsedCaptions = responseJson.captions || responseJson;

                if (Array.isArray(parsedCaptions) && parsedCaptions.length > 0) {
                    setCaptions(parsedCaptions);
                    setLoadingText('Transcrição concluída!');
                } else {
                    setCaptions([{
                        id: 1,
                        start: 0,
                        end: Math.min(5, videoDuration),
                        text: "Digite sua primeira legenda aqui."
                    }]);
                    setLoadingText('Transcrição não gerou resultados');
                }
            } catch (e: any) {
                console.error("Erro ao gerar legendas:", e);

                let errorMsg = 'Erro desconhecido';

                if (e.name === 'AbortError') {
                    errorMsg = 'Operação cancelada pelo usuário';
                } else if (e.name === 'TypeError' && (e.message.includes('Failed to fetch') || e.message.includes('CORS'))) {
                    errorMsg = 'Erro de conectividade ou CORS. Verifique se:\n' +
                        '1. O backend está rodando e acessível\n' +
                        '2. O servidor backend permite requisições CORS';
                } else if (e.message.includes('não está rodando') || e.message.includes('não foi possível conectar')) {
                    errorMsg = e.message;
                } else if (e.message.includes('não contém uma trilha de áudio válida') || e.message.includes('audio track')) {
                    errorMsg = 'O vídeo enviado não possui áudio. Por favor, envie um vídeo com áudio.';
                } else {
                    errorMsg = e.message || String(e);
                }

                setError(`Falha ao gerar legendas: ${errorMsg}`);

                // Criar legenda padrão apenas se não foi cancelado
                if (e.name !== 'AbortError') {
                    setCaptions([{
                        id: 1,
                        start: 0,
                        end: Math.min(5, videoDuration),
                        text: "Digite sua primeira legenda aqui."
                    }]);
                }
            } finally {
                if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
                    setIsLoading(false);
                    if (!error) {
                        setLoadingText('');
                    }
                    setStepId(null);
                }
                cleanup();
            }
        };

        generateCaptions();
        return cleanup;
    }, [videoSource, videoDuration, language, model, shouldGenerate]);

    // Adiciona suporte a salvar em pasta customizada usando File System Access API
    const downloadRenderedVideo = async (
        quality: 'low' | 'medium' | 'high' = 'medium',
        filenameOverride?: string,
        dirHandle?: FileSystemDirectoryHandle | null,
        onSuccess?: () => void
    ) => {
        try {
            if (!videoSource || captions.length === 0) {
                throw new Error('Vídeo ou legendas não disponíveis.');
            }

            // Testar conexão antes de prosseguir
            const isBackendAvailable = await testBackendConnection();
            if (!isBackendAvailable) {
                throw new Error(`Servidor backend não está disponível.`);
            }

            const response = await fetch(videoSource.url);
            if (!response.ok) {
                throw new Error(`Não foi possível baixar o vídeo. Status: ${response.status}`);
            }

            const blob = await response.blob();
            const file = new File([blob], videoSource.filename || 'video.mp4', { type: blob.type });
            const captionsFile = new File([JSON.stringify(captions, null, 2)], 'captions.json', {
                type: 'application/json'
            });

            const formData = new FormData();
            formData.append('file', file);
            formData.append('captions', captionsFile);
            formData.append('quality', quality);
            if (captionStyle) {
                formData.append('style', JSON.stringify(captionStyle));
            }

            // Faz o POST e espera o arquivo diretamente na resposta
            const backendResponse = await fetch(`${BACKEND_URL}/render`, {
                method: 'POST',
                body: formData,
                mode: 'cors',
                credentials: 'omit',
            });

            if (!backendResponse.ok) {
                const errorText = await backendResponse.text();
                throw new Error(`Erro do servidor (${backendResponse.status}): ${errorText}`);
            }

            // Baixa o arquivo de vídeo legendado diretamente da resposta
            const videoBlob = await backendResponse.blob();
            let filename = filenameOverride || 'video_legendado.mp4';
            const disposition = backendResponse.headers.get('content-disposition');
            if (disposition) {
                const match = disposition.match(/filename="?([^";]+)"?/);
                if (match && match[1]) filename = match[1];
            }

            // File System Access API: salvar na pasta escolhida
            if (dirHandle && 'createWritable' in dirHandle) {
                // @ts-ignore
                const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
                // @ts-ignore
                const writable = await fileHandle.createWritable();
                await writable.write(videoBlob);
                await writable.close();
            } else {
                // Fallback: download normal
                const url = URL.createObjectURL(videoBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            }
            if (onSuccess) onSuccess();
        } catch (e: any) {
            const errorMsg = e.message || String(e);
            console.error('Erro ao baixar vídeo legendado:', e);
            alert(`Erro ao baixar vídeo legendado: ${errorMsg}`);
        }
    };

    return {
        captions,
        isLoading,
        error,
        setCaptions,
        downloadRenderedVideo,
        loadingText,
        elapsed,
        cancelTranscription,
        stepId
    };
};