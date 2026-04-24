import React, { useRef, useState } from 'react';
import { Card } from './ui';
import { UploadCloud } from 'lucide-react';
import { cn } from '../lib/utils';

export function FileDropZone({ onFilesSelected, disabled }) {
    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragEnter = (e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFilesSelected(e.dataTransfer.files);
        }
    };

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onFilesSelected(e.target.files);
        }
        // Reset target value so selecting the same file twice triggers onchange
        e.target.value = null;
    };

    return (
        <Card
            className={cn(
                "flex flex-col items-center justify-center border-dashed border-2 min-h-[300px] transition-all cursor-pointer",
                isDragging
                    ? "border-primary bg-primary/10 scale-[1.02]"
                    : "border-zinc-700 bg-zinc-900/20 hover:bg-zinc-900/40 hover:border-primary/50",
                disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
            onDragEnter={handleDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !disabled && fileInputRef.current?.click()}
        >
            <input
                type="file"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileInput}
                disabled={disabled}
            />
            <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors",
                isDragging ? "bg-primary/20" : "bg-zinc-800"
            )}>
                <UploadCloud className={cn("w-8 h-8", isDragging ? "text-primary" : "text-zinc-400")} />
            </div>
            <p className="text-lg font-medium text-zinc-300">
                {isDragging ? 'Drop files to send' : 'Drag & Drop files here'}
            </p>
            <p className="text-sm text-zinc-500 mt-2">or click to browse</p>
        </Card>
    );
}
