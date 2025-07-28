import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Caption, CaptionStyle } from '../types';

interface VideoPreviewProps {
    videoUrl: string;
    captions: Caption[];
    style: CaptionStyle;
    onTimeUpdate?: (currentTime: number) => void;
    onDurationChange?: (duration: number) => void;
}

const formatTimestamp = (seconds: number): string => {
    const pad = (n: number): string => n.toString().padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
        : `${pad(minutes)}:${pad(secs)}`;
};

const VideoPreview: React.FC<VideoPreviewProps> = ({
    videoUrl,
    captions,
    style,
    onTimeUpdate,
    onDurationChange
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const trackRef = useRef<HTMLTrackElement>(null);
    const controlsTimeoutRef = useRef<NodeJS.Timeout>();
    const containerRef = useRef<HTMLDivElement>(null);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showCaptions, setShowCaptions] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);

    // Auto-hide controls logic
    const resetControlsTimeout = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        setShowControls(true);

        if (isPlaying && !isHovering) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
            }, 2000); // Increased from 100ms to 2000ms for better UX
        }
    }, [isPlaying, isHovering]);

    useEffect(() => {
        resetControlsTimeout();
        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        };
    }, [resetControlsTimeout]);

    // Video event handlers
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            onTimeUpdate?.(video.currentTime);
        };

        const handleDurationChange = () => {
            setDuration(video.duration);
            onDurationChange?.(video.duration);
        };

        const handlePlay = () => {
            setIsPlaying(true);
            setIsBuffering(false);
        };

        const handlePause = () => {
            setIsPlaying(false);
            setIsBuffering(false);
        };

        const handleVolumeChange = () => {
            setVolume(video.volume);
            setIsMuted(video.muted);
        };

        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        const handleWaiting = () => setIsBuffering(true);
        const handleCanPlay = () => setIsBuffering(false);
        const handleLoadStart = () => setIsBuffering(true);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('durationchange', handleDurationChange);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        video.addEventListener('volumechange', handleVolumeChange);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('loadstart', handleLoadStart);
        document.addEventListener('fullscreenchange', handleFullscreenChange);

        // Initialize volume state
        setVolume(video.volume);
        setIsMuted(video.muted);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('durationchange', handleDurationChange);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            video.removeEventListener('volumechange', handleVolumeChange);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('loadstart', handleLoadStart);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [onTimeUpdate, onDurationChange]);

    // Update VTT captions when captions or style change
    useEffect(() => {
        const video = videoRef.current;
        const track = trackRef.current;
        if (!video || !track || !captions.length) return;

        const vttContent = `WEBVTT

${captions.map(caption =>
            `${formatTimestamp(caption.start)} --> ${formatTimestamp(caption.end)}\n${caption.text}`
        ).join('\n\n')}`;

        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        track.src = url;

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [captions]);

    // Update playback rate
    useEffect(() => {
        const video = videoRef.current;
        if (video) video.playbackRate = playbackRate;
    }, [playbackRate]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target !== document.body && !(e.target as Element)?.closest('.video-preview-container')) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.shiftKey) {
                        stepFrame(-1);
                    } else {
                        seekRelative(-10);
                    }
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.shiftKey) {
                        stepFrame(1);
                    } else {
                        seekRelative(10);
                    }
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    changeVolume(0.1);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    changeVolume(-0.1);
                    break;
                case 'KeyM':
                    e.preventDefault();
                    toggleMute();
                    break;
                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case 'KeyC':
                    e.preventDefault();
                    toggleCaptions();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Helper functions
    const getActiveCaption = () => {
        return captions.find(caption => currentTime >= caption.start && currentTime <= caption.end);
    };

    const getCaptionPositionStyle = () => {
        const basePosition = style.position;
        const controlsVisible = showControls || !isPlaying;

        // Adjust bottom position based on controls visibility with smoother transition
        const bottomOffset = controlsVisible ? '20%' : '10%';

        switch (basePosition) {
            case 'top':
                return {
                    top: '5%',
                    bottom: 'auto',
                    justifyContent: 'flex-start',
                    transform: 'none',
                    transition: 'all 0.3s ease-in-out'
                };
            case 'middle':
                return {
                    top: '50%',
                    bottom: 'auto',
                    transform: 'translateY(-50%)',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease-in-out'
                };
            case 'bottom':
            default:
                return {
                    bottom: bottomOffset,
                    top: 'auto',
                    justifyContent: 'flex-end',
                    transform: 'none',
                    transition: 'all 0.3s ease-in-out'
                };
        }
    };

    // Control functions
    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
        resetControlsTimeout();
    };

    const seekRelative = (seconds: number) => {
        const video = videoRef.current;
        if (!video) return;

        const newTime = Math.max(0, Math.min(video.currentTime + seconds, duration));
        video.currentTime = newTime;
        setCurrentTime(newTime);
        resetControlsTimeout();
    };

    const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        const value = parseFloat(e.target.value);
        if (video) {
            video.currentTime = value;
            setCurrentTime(value);
        }
    };

    const changeVolume = (delta: number) => {
        const video = videoRef.current;
        if (!video) return;

        const newVolume = Math.max(0, Math.min(1, video.volume + delta));
        video.volume = newVolume;
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
        resetControlsTimeout();
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseFloat(e.target.value);
        changeVolume(value - volume);
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;

        video.muted = !video.muted;
        setIsMuted(video.muted);
        resetControlsTimeout();
    };

    const handleRateChange = (rate: number) => {
        setPlaybackRate(rate);
        setShowSettings(false);
        resetControlsTimeout();
    };

    const toggleCaptions = () => {
        setShowCaptions(v => !v);
        resetControlsTimeout();
    };

    const toggleFullscreen = () => {
        const container = containerRef.current;
        if (!container) return;

        if (!document.fullscreenElement) {
            container.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
        resetControlsTimeout();
    };

    const handlePiP = async () => {
        const video = videoRef.current;
        if (video && 'requestPictureInPicture' in video) {
            try {
                await (video as any).requestPictureInPicture();
            } catch (error) {
                console.warn('Picture-in-Picture failed:', error);
            }
        }
        resetControlsTimeout();
    };

    const stepFrame = (direction: 1 | -1) => {
        const video = videoRef.current;
        if (!video) return;

        if (!video.paused) video.pause();
        const fps = 30;
        const newTime = Math.max(0, Math.min(video.currentTime + direction * (1 / fps), duration));
        video.currentTime = newTime;
        setCurrentTime(newTime);
        resetControlsTimeout();
    };

    return (
        <div
            ref={containerRef}
            className="video-preview-container relative w-full aspect-video rounded-2xl overflow-hidden shadow-xl border-2 border-slate-800 bg-black flex flex-col"
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
            onMouseMove={resetControlsTimeout}
            tabIndex={0}
        >
            <video
                ref={videoRef}
                src={videoUrl}
                controls={false}
                className="w-full h-full object-contain bg-black cursor-pointer"
                crossOrigin="anonymous"
                onClick={togglePlay}
                onDoubleClick={toggleFullscreen}
            >
                <track
                    ref={trackRef}
                    kind="subtitles"
                    srcLang="en"
                    label="English"
                    default={false}
                />
            </video>

            {/* Loading indicator */}
            {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-40">
                    <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {/* Manual caption rendering with improved styling */}
            {captions.length > 0 && showCaptions && getActiveCaption() && (
                <div
                    className="absolute left-0 w-full flex items-center px-4 pointer-events-none select-none z-30"
                    style={{
                        ...getCaptionPositionStyle(),
                        position: 'absolute',
                    }}
                >
                    <div
                        className="mx-auto rounded-lg px-4 py-2 text-center"
                        style={{
                            color: style.color || '#ffffff',
                            fontSize: `${style.fontSize}px`,
                            fontFamily: style.fontFamily || 'Arial, sans-serif',
                            backgroundColor: style.backgroundColor || 'transparent',
                            maxWidth: '90%',
                            width: 'auto',
                            wordBreak: 'break-word',
                            lineHeight: '1.4',
                            textShadow: style.backgroundColor === 'transparent' ? 
                                '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.8)' : 'none',
                            border: style.backgroundColor === 'transparent' ? 
                                '1px solid rgba(255,255,255,0.1)' : 'none',
                            transition: 'all 0.3s ease-in-out',
                            WebkitBackdropFilter: 'blur(2px)',
                            backdropFilter: 'blur(2px)'
                        }}
                    >
                        {getActiveCaption()?.text}
                    </div>
                </div>
            )}

            {/* Controls with improved animations and visibility */}
            <div
                className={`absolute left-0 bottom-0 w-full flex items-center px-4 pb-3 pt-8 z-20 transition-all duration-500 ease-in-out ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
                    }`}
                style={{
                    background: 'linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)',
                    backdropFilter: 'blur(2px)',
                }}
            >
                {/* Play/Pause */}
                <button
                    onClick={togglePlay}
                    className="mr-2 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 backdrop-blur-sm"
                    title={isPlaying ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)'}
                >
                    {isPlaying ? (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                    ) : (
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <polygon points="5,3 19,12 5,21" />
                        </svg>
                    )}
                </button>

                {/* Frame step controls */}
                <button
                    onClick={() => stepFrame(-1)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200"
                    title="Frame anterior (Shift + ←)"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                <button
                    onClick={() => stepFrame(1)}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 mr-3"
                    title="Próximo frame (Shift + →)"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path d="M9 5l7 7-7 7" />
                    </svg>
                </button>

                {/* Volume controls */}
                <button
                    onClick={toggleMute}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200"
                    title={isMuted ? 'Desmutar (M)' : 'Mutar (M)'}
                >
                    {isMuted || volume === 0 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M9 9v6h4l5 5V4l-5 5H9z" />
                            <line x1="23" y1="1" x2="1" y2="23" />
                        </svg>
                    ) : volume < 0.5 ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M9 9v6h4l5 5V4l-5 5H9z" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M9 9v6h4l5 5V4l-5 5H9z" />
                            <path d="M19 9l2 2-2 2" />
                        </svg>
                    )}
                </button>

                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={handleVolumeChange}
                    className="w-20 accent-blue-500 h-1.5 rounded bg-white/20 appearance-none outline-none mx-2 cursor-pointer"
                    title={`Volume: ${Math.round(volume * 100)}%`}
                />

                {/* Time display */}
                <span className="text-sm text-white font-mono ml-3 min-w-[100px]">
                    {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
                </span>

                {/* Progress bar */}
                <input
                    type="range"
                    min={0}
                    max={duration || 1}
                    step={0.01}
                    value={currentTime}
                    onChange={handleProgressChange}
                    className="flex-1 accent-blue-500 h-2 rounded bg-white/20 appearance-none outline-none mx-4 cursor-pointer"
                    title={`Posição: ${formatTimestamp(currentTime)}`}
                />

                {/* Caption toggle */}
                <button
                    onClick={toggleCaptions}
                    className={`p-2 rounded-full ${showCaptions ? 'bg-blue-600' : 'bg-white/10'} hover:bg-blue-700 text-white transition-all duration-200`}
                    title={`${showCaptions ? 'Ocultar' : 'Mostrar'} legendas (C)`}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="M7 15h.01M11 15h2M15 15h.01" />
                    </svg>
                </button>

                {/* Picture-in-Picture */}
                <button
                    onClick={handlePiP}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 ml-1"
                    title="Picture-in-Picture"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <rect x="15" y="13" width="6" height="4" rx="1" />
                    </svg>
                </button>

                {/* Fullscreen */}
                <button
                    onClick={toggleFullscreen}
                    className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200 ml-1"
                    title={`${isFullscreen ? 'Sair da' : 'Entrar em'} tela cheia (F)`}
                >
                    {isFullscreen ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M14 10l6-6m0 0h-4m4 0v4M10 14l-6 6m0 0h4m-4 0v-4" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M10 4l-6 6m0 0h4m-4 0V6m10 10l6 6m0 0h-4m4 0v-4" />
                        </svg>
                    )}
                </button>

                {/* Playback speed */}
                <div className="relative ml-1">
                    <button
                        onClick={() => setShowSettings(s => !s)}
                        className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all duration-200"
                        title="Velocidade de reprodução"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                        </svg>
                    </button>

                    {showSettings && (
                        <div className="absolute right-0 bottom-14 z-50 bg-black/90 backdrop-blur-sm border border-white/20 rounded-lg shadow-xl p-2 flex flex-col gap-1 min-w-[80px]">
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                <button
                                    key={rate}
                                    onClick={() => handleRateChange(rate)}
                                    className={`px-3 py-2 rounded text-sm text-white hover:bg-blue-600 transition-colors ${playbackRate === rate ? 'bg-blue-700' : 'bg-transparent'
                                        }`}
                                >
                                    {rate}x
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Keyboard shortcuts hint (only when focused) */}
            <div className="sr-only">
                Atalhos: Espaço (play/pause), ← → (buscar), Shift + ← → (frame), ↑ ↓ (volume), M (mute), F (fullscreen), C (legendas)
            </div>
        </div>
    );
};

export default VideoPreview;