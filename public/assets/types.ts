export interface VideoSource {
    url: string;
    filename?: string;
}

export interface Caption {
    id: number;
    start: number;
    end: number;
    text: string;
}

export interface CaptionStyle {
    fontSize: number;
    color: string;
    fontFamily: string;
    position: 'top' | 'middle' | 'bottom';
    backgroundColor: string;
}