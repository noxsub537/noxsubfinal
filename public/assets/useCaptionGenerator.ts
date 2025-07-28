import { useState, useEffect } from 'react';
import { Caption, VideoSource, CaptionStyle } from './types';

export const useCaptionGenerator = (
    videoSource: VideoSource | null,
    videoDuration: number,
    language: string,
    model: string,
    shouldGenerate: boolean,
    captionStyle?: CaptionStyle
) => {
    const [captions, setCaptions] = useState<Caption[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [loadingText, setLoadingText] = useState<string>('');
    const [elapsed, setElapsed] = useState<number>(0);
    const [stepId, setStepId] = useState<string | number | null>(null);

    useEffect(() => {
        if (!videoSource || videoDuration <= 0 || !shouldGenerate) return;

        const generateCaptions = async () => {
            setIsLoading(true);
            setError(null);
            setElapsed(0);
            setLoadingText('Generating captions...');

            try {
                // Simulate caption generation
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const mockCaptions: Caption[] = [
                    { id: 1, start: 0, end: Math.min(3, videoDuration), text: `Sample caption 1 (${language})` },
                    { id: 2, start: Math.min(3, videoDuration), end: Math.min(6, videoDuration), text: `Sample caption 2 (${language})` },
                    { id: 3, start: Math.min(6, videoDuration), end: Math.min(10, videoDuration), text: `Sample caption 3 (${language})` },
                ];
                
                setCaptions(mockCaptions);
                setLoadingText('Captions generated successfully');
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
                setError(errorMessage);
                setCaptions([{
                    id: 1,
                    start: 0,
                    end: Math.min(5, videoDuration),
                    text: "Type your first caption here."
                }]);
            } finally {
                setIsLoading(false);
            }
        };

        generateCaptions();
    }, [videoSource, videoDuration, language, model, shouldGenerate]);

    const cancelTranscription = () => {
        setIsLoading(false);
        setLoadingText('Transcription cancelled');
        setElapsed(0);
        setError(null);
        setStepId(null);
    };

    return {
        captions,
        isLoading,
        error,
        setCaptions,
        loadingText,
        elapsed,
        cancelTranscription,
        stepId
    };
};