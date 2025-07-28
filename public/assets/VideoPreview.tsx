import React, { useRef, useEffect } from 'react';
import { Caption, CaptionStyle } from '../types';

interface VideoPreviewProps {
    videoUrl: string;
    captions: Caption[];
    style: CaptionStyle;
    onTimeUpdate?: (currentTime: number) => void;
    onDurationChange?: (duration: number) => void;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({
    videoUrl,
    captions,
    style,
    onTimeUpdate,
    onDurationChange
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const trackRef = useRef<HTMLTrackElement>(null);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            onTimeUpdate?.(video.currentTime);
        };

        const handleDurationChange = () => {
            onDurationChange?.(video.duration);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('durationchange', handleDurationChange);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('durationchange', handleDurationChange);
        };
    }, [onTimeUpdate, onDurationChange]);

    useEffect(() => {
        const video = videoRef.current;
        const track = trackRef.current;
        if (!video || !track || !captions.length) return;

        // Create WebVTT content
        const vttContent = `WEBVTT\n\n${captions.map(caption => 
            `${formatTimestamp(caption.start)} --> ${formatTimestamp(caption.end)}\n${caption.text}`
        ).join('\n\n')}`;

        // Create blob and URL for the track
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);

        // Update track source
        track.src = url;

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [captions]);

    const formatTimestamp = (seconds: number): string => {
        const pad = (n: number): string => n.toString().padStart(2, '0');
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${ms.toString().padStart(3, '0')}`;
    };

    return (
        <div className="relative w-full aspect-video">
            <video
                ref={videoRef}
                src={videoUrl}
                controls
                className="w-full h-full"
                crossOrigin="anonymous"
            >
                <track
                    ref={trackRef}
                    kind="subtitles"
                    srcLang="en"
                    label="English"
                    default
                />
            </video>
            {/* Removido style jsx global, use apenas style padrão ou CSS externo */}
            <style>{`
                ::cue {
                    font-size: ${style.fontSize}px;
                    color: ${style.color};
                    font-family: ${style.fontFamily};
                    background-color: ${style.backgroundColor};
                }
            `}</style>
        </div>
    );
};

export default VideoPreview;