import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ImageFile {
    file: File;
    preview: string;
    isPrimary: boolean;
}

interface MultiImageUploadProps {
    maxImages?: number;
    onImagesChange: (images: ImageFile[]) => void;
    existingImages?: { url: string; isPrimary: boolean }[];
}

export function MultiImageUpload({
    maxImages = 10,
    onImagesChange,
    existingImages = []
}: MultiImageUploadProps) {
    const [images, setImages] = useState<ImageFile[]>([]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;

        const files = Array.from(e.target.files);
        const remaining = maxImages - images.length;

        if (files.length > remaining) {
            alert(`You can only upload ${remaining} more image(s)`);
            return;
        }

        const newImages: ImageFile[] = files.map((file, index) => ({
            file,
            preview: URL.createObjectURL(file),
            isPrimary: images.length === 0 && index === 0, // First image is primary
        }));

        const updatedImages = [...images, ...newImages];
        setImages(updatedImages);
        onImagesChange(updatedImages);
    };

    const removeImage = (index: number) => {
        const updatedImages = images.filter((_, i) => i !== index);

        // If removed image was primary, make first image primary
        if (images[index].isPrimary && updatedImages.length > 0) {
            updatedImages[0].isPrimary = true;
        }

        setImages(updatedImages);
        onImagesChange(updatedImages);
    };

    const setPrimaryImage = (index: number) => {
        const updatedImages = images.map((img, i) => ({
            ...img,
            isPrimary: i === index,
        }));
        setImages(updatedImages);
        onImagesChange(updatedImages);
    };

    return (
        <div className="space-y-3">
            <Label>Property Images (Max {maxImages})</Label>

            {/* File Input */}
            <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500
          file:mr-4 file:py-2 file:px-4
          file:rounded-md file:border-0
          file:text-sm file:font-semibold
          file:bg-blue-50 file:text-blue-700
          hover:file:bg-blue-100 cursor-pointer"
                disabled={images.length >= maxImages}
            />

            {/* Image Preview Grid */}
            {images.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-3">
                    {images.map((img, index) => (
                        <div key={index} className="relative group">
                            <div className={`relative aspect-square rounded-lg overflow-hidden border-2 ${img.isPrimary ? 'border-blue-500' : 'border-gray-200'
                                }`}>
                                <img
                                    src={img.preview}
                                    alt={`Upload ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />

                                {/* Primary Badge */}
                                {img.isPrimary && (
                                    <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                        <Star className="size-3 fill-white" />
                                        Primary
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    {!img.isPrimary && (
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setPrimaryImage(index)}
                                            className="h-7 text-xs"
                                        >
                                            Set Primary
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => removeImage(index)}
                                        className="h-7"
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-gray-500">
                {images.length} / {maxImages} images uploaded
                {images.length > 0 && ' • Click "Set Primary" to choose main image'}
            </p>
        </div>
    );
}
