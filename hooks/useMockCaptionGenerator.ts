import { useState, useEffect } from 'react';
import { Caption, VideoSource } from '../types';

/**
 * Extracts a specified number of frames from a video file as base64 strings.
 * @param videoUrl The URL of the video to process.
 * @param duration The total duration of the video.
 * @param numFrames The number of frames to extract.
 * @returns A promise that resolves to an array of base64 encoded frame data (without the data URL prefix).
 */
const extractFrames = async (videoUrl: string, duration: number, numFrames: number): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.src = videoUrl;
        video.crossOrigin = "anonymous";
        video.muted = true; // Mute to avoid playback issues
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const frames: string[] = [];

        if (!context) {
            return reject(new Error("Failed to get canvas context."));
        }

        video.onloadeddata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            let framesExtracted = 0;

            const captureFrame = () => {
                // Distribute frames evenly, avoiding the very start and end for better content
                const time = (duration / (numFrames + 1)) * (framesExtracted + 1);
                video.currentTime = time;
            };
            
            video.onseeked = () => {
                if (framesExtracted >= numFrames) return; // Avoid extra seeks
                
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg').split(',')[1];
                if (dataUrl) {
                   frames.push(dataUrl);
                }
                framesExtracted++;

                if (framesExtracted < numFrames) {
                    captureFrame();
                } else {
                    resolve(frames);
                }
            };

            video.onerror = () => reject(new Error("Failed to load or process video."));

            // Start the process
            captureFrame();
        };

        // Handle cases where video fails to load
        video.load();
    });
};

// Mock caption generator: gera legendas simuladas para testes
export const useCaptionGenerator = (videoSource: VideoSource | null, videoDuration: number, language: string) => {
    const [captions, setCaptions] = useState<Caption[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!videoSource || videoDuration <= 0) {
            return;
        }

        const generateCaptions = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                // Simula extração de frames (não usado, mas mantido para compatibilidade)
                await extractFrames(videoSource.url, videoDuration, 3);
                // Gera legendas mock
                const mockCaptions: Caption[] = [
                    { id: 1, start: 0, end: Math.min(3, videoDuration), text: `Legenda simulada 1 (${language})` },
                    { id: 2, start: Math.min(3, videoDuration), end: Math.min(6, videoDuration), text: `Legenda simulada 2 (${language})` },
                    { id: 3, start: Math.min(6, videoDuration), end: Math.min(10, videoDuration), text: `Legenda simulada 3 (${language})` },
                ];
                setCaptions(mockCaptions);
            } catch (e) {
                setError("Falha ao gerar legendas simuladas. Você pode editar manualmente.");
                setCaptions([
                    {id: 1, start: 0, end: 5, text: "Digite sua primeira legenda aqui."},
                ]);
            } finally {
                setIsLoading(false);
            }
        };

        generateCaptions();

    }, [videoSource, videoDuration, language]);

    return { captions, isLoading, error, setCaptions };
};