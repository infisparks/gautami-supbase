"use client";

import React, { useMemo } from 'react';

// --- TYPES (Mirrored from page.tsx) ---
export interface DrawingPage {
    id: string;
    templateImageUrl: string;
    pageNumber: number;
    pageName: string;
    groupName: string;
    lines: any[];
    images: any[];
    texts: any[];
    locationTag?: string;
}

interface PageRendererProps {
    page: DrawingPage;
    width?: number;
    className?: string;
    onClick?: () => void;
    isSelected?: boolean;
}

// --- CONSTANTS ---
const FLUTTER_CANVAS_WIDTH = 1000;
const FLUTTER_CANVAS_HEIGHT = 1414;
const ASPECT_RATIO = FLUTTER_CANVAS_HEIGHT / FLUTTER_CANVAS_WIDTH;

export default function PageRenderer({ page, width = 300, className = "", onClick, isSelected = false }: PageRendererProps) {
    const height = width * ASPECT_RATIO;
    const scale = width / FLUTTER_CANVAS_WIDTH;

    // Helper to process color
    const getColor = (colorVal: number | undefined) => {
        if (colorVal === undefined) return 'black';
        // Flutter colors are ARGB ints. We need to convert to CSS rgba or hex.
        // Example: 4278190080 is 0xFF000000 (Black)
        // (colorVal >> 16) & 255 -> Red
        // (colorVal >> 8) & 255 -> Green
        // colorVal & 255 -> Blue
        // ((colorVal >> 24) & 255) / 255 -> Alpha
        const r = (colorVal >> 16) & 255;
        const g = (colorVal >> 8) & 255;
        const b = colorVal & 255;
        const a = ((colorVal >> 24) & 255) / 255;
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    };

    // 1. Template Image URL
    const templateParams = useMemo(() => {
        if (!page.templateImageUrl) return null;
        const url = page.templateImageUrl.startsWith('http')
            ? page.templateImageUrl
            : `https://apimmedford.infispark.in/${page.templateImageUrl}`;
        return url;
    }, [page.templateImageUrl]);

    return (
        <div
            className={`relative bg-white shadow-sm border transition-all cursor-pointer overflow-hidden ${isSelected ? 'ring-4 ring-blue-500 border-blue-500' : 'hover:border-gray-300 border-gray-200'} ${className}`}
            style={{ width, height }}
            onClick={onClick}
        >
            {/* A. Template Image (Background) */}
            {templateParams && (
                <img
                    src={templateParams}
                    alt="Template"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
                />
            )}

            {/* SVG Overlay for Drawings, Text, User Images */}
            <svg
                width={width}
                height={height}
                viewBox={`0 0 ${FLUTTER_CANVAS_WIDTH} ${FLUTTER_CANVAS_HEIGHT}`}
                className="absolute inset-0 pointer-events-none"
            >
                {/* B. User Images */}
                {page.images && page.images.map((img: any, idx: number) => {
                    const imgUrl = img.imageUrl.startsWith('http')
                        ? img.imageUrl
                        : `https://apimmedford.infispark.in/${img.imageUrl}`;

                    return (
                        <image
                            key={`img-${idx}`}
                            href={imgUrl}
                            x={img.position?.dx || 0}
                            y={img.position?.dy || 0}
                            width={img.width}
                            height={img.height}
                        />
                    );
                })}

                {/* C. Lines */}
                {page.lines && page.lines.map((line: any, idx: number) => {
                    const strokeColor = getColor(line.colorValue);
                    const strokeWidth = line.strokeWidth || 2.0;

                    let pathD = "";
                    const rawPoints = line.points;

                    if (Array.isArray(rawPoints) && rawPoints.length >= 2) {
                        if (typeof rawPoints[0] === 'number') {
                            // Relative points encoding
                            let lastX = rawPoints[0] / 100.0;
                            let lastY = rawPoints[1] / 100.0;
                            pathD = `M ${lastX} ${lastY}`;

                            for (let i = 2; i < rawPoints.length; i += 2) {
                                if (i + 1 < rawPoints.length) {
                                    lastX += rawPoints[i] / 100.0;
                                    lastY += rawPoints[i + 1] / 100.0;
                                    pathD += ` L ${lastX} ${lastY}`;
                                }
                            }
                        } else if (typeof rawPoints[0] === 'object') {
                            // Absolute points objects {dx, dy}
                            pathD = `M ${rawPoints[0].dx} ${rawPoints[0].dy}`;
                            for (let k = 1; k < rawPoints.length; k++) {
                                pathD += ` L ${rawPoints[k].dx} ${rawPoints[k].dy}`;
                            }
                        }
                    }

                    return (
                        <path
                            key={`line-${idx}`}
                            d={pathD}
                            stroke={strokeColor}
                            strokeWidth={strokeWidth}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    );
                })}

                {/* D. Texts */}
                {page.texts && page.texts.map((textItem: any, idx: number) => {
                    const color = getColor(textItem.colorValue);
                    const fontSize = (textItem.fontSize || 16.0);
                    // Note: SVG font rendering might differ slightly from Flutter/PDF

                    return (
                        <text
                            key={`text-${idx}`}
                            x={textItem.position?.dx || 0}
                            y={textItem.position?.dy || 0}
                            fill={color}
                            fontSize={fontSize}
                            fontFamily="sans-serif"
                            dominantBaseline="hanging" // Flutter draws from top-left usually
                        >
                            {textItem.text}
                        </text>
                    );
                })}
            </svg>

            {/* Selection Overlay */}
            {isSelected && (
                <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                </div>
            )}
        </div>
    );
}
