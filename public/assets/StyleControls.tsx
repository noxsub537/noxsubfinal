import * as React from 'react';
import { CaptionStyle } from '../types';

interface StyleControlsProps {
    style: CaptionStyle;
    onStyleChange: (newStyle: CaptionStyle) => void;
}

const fontOptions: string[] = ['Georgia', 'Inter', 'Arial', 'Verdana', 'Courier New'];
const positionOptions: CaptionStyle['position'][] = ['top', 'middle', 'bottom'];

const StyleControls: React.FC<StyleControlsProps> = ({ style, onStyleChange }) => {
    const handleStyleChange = <K extends keyof CaptionStyle>(
        key: K,
        value: CaptionStyle[K]
    ): void => {
        onStyleChange({ ...style, [key]: value });
    };

    // Helper to convert hex to rgba
    const hexToRgba = (hex: string, alpha: number = 1): string => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    // Helper to get hex from rgba
    const rgbaToHex = (rgba: string): string => {
        const parts = rgba.match(/\d+/g);
        if (!parts || parts.length < 3) return '#000000';

        const r = parseInt(parts[0], 10);
        const g = parseInt(parts[1], 10);
        const b = parseInt(parts[2], 10);

        const toHex = (n: number): string => n.toString(16).padStart(2, '0');

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    const getBackgroundAlpha = (): number => {
        const matches = style.backgroundColor.match(/\d*\.?\d+/g);
        if (!matches || matches.length < 4) return 0.7;
        return parseFloat(matches[3]);
    };

    const backgroundAlpha = getBackgroundAlpha();

    const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        handleStyleChange('fontSize', parseInt(e.target.value, 10));
    };

    const handleFontFamilyChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
        handleStyleChange('fontFamily', `${e.target.value}, sans-serif`);
    };

    const handleTextColorChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        handleStyleChange('color', e.target.value);
    };

    const handleBackgroundColorChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        handleStyleChange('backgroundColor', hexToRgba(e.target.value, backgroundAlpha));
    };

    const handlePositionChange = (pos: CaptionStyle['position']): void => {
        handleStyleChange('position', pos);
    };

    return (
        <div className="space-y-4 text-sm">
            {/* Font Size */}
            <div>
                <label htmlFor="fontSize" className="block font-medium mb-2 text-slate-300">
                    Font Size
                </label>
                <div className="flex items-center gap-4">
                    <input
                        id="fontSize"
                        type="range"
                        min="12"
                        max="96"
                        value={style.fontSize}
                        onChange={handleFontSizeChange}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-slate-400 w-10 text-right">
                        {style.fontSize}px
                    </span>
                </div>
            </div>

            {/* Font Family */}
            <div>
                <label htmlFor="fontFamily" className="block font-medium mb-2 text-slate-300">
                    Font
                </label>
                <select
                    id="fontFamily"
                    value={style.fontFamily.split(',')[0]}
                    onChange={handleFontFamilyChange}
                    className="w-full p-2 bg-slate-700 border border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                    {fontOptions.map((font: string) => (
                        <option key={font} value={font}>
                            {font}
                        </option>
                    ))}
                </select>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="textColor" className="block font-medium mb-2 text-slate-300">
                        Text Color
                    </label>
                    <input
                        id="textColor"
                        type="color"
                        value={style.color}
                        onChange={handleTextColorChange}
                        className="w-full h-10 p-1 bg-slate-700 border border-slate-600 rounded-md cursor-pointer"
                    />
                </div>
                <div>
                    <label htmlFor="bgColor" className="block font-medium mb-2 text-slate-300">
                        Background
                    </label>
                    <input
                        id="bgColor"
                        type="color"
                        value={rgbaToHex(style.backgroundColor)}
                        onChange={handleBackgroundColorChange}
                        className="w-full h-10 p-1 bg-slate-700 border border-slate-600 rounded-md cursor-pointer"
                    />
                </div>
            </div>

            {/* Position */}
            <div>
                <label className="block font-medium mb-2 text-slate-300">
                    Position
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {positionOptions.map((pos: CaptionStyle['position']) => (
                        <button
                            key={pos}
                            onClick={() => handlePositionChange(pos)}
                            className={`p-2 rounded-md capitalize text-center transition-colors ${style.position === pos
                                    ? 'bg-purple-600 text-white font-semibold'
                                    : 'bg-slate-700 hover:bg-slate-600'
                                }`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default StyleControls;