import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ImageFile {
    file: File;
    preview: string;
    isPrimary: boolean;
}

interface ExistingImage {
    id: string; // or image_id
    url: string; // or image_url
    isPrimary: boolean;
}

interface MultiImageUploadProps {
    maxImages?: number;
    onImagesChange: (images: ImageFile[]) => void;
    existingImages?: ExistingImage[];
    onRemoveExisting?: (image: ExistingImage) => void;
    onSetPrimaryExisting?: (image: ExistingImage) => void;
}

export function MultiImageUpload({
    maxImages = 10,
    onImagesChange,
    existingImages = [],
    onRemoveExisting,
    onSetPrimaryExisting
}: MultiImageUploadProps) {
    const [images, setImages] = useState<ImageFile[]>([]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;

        const files = Array.from(e.target.files);
        const remaining = maxImages - (images.length + existingImages.length);

        if (files.length > remaining) {
            alert(`You can only upload ${remaining} more image(s)`);
            return;
        }

        const newImages: ImageFile[] = files.map((file, index) => ({
            file,
            preview: URL.createObjectURL(file),
            // Default to primary if no images exist at all
            isPrimary: images.length === 0 && existingImages.length === 0 && index === 0,
        }));

        const updatedImages = [...images, ...newImages];
        setImages(updatedImages);
        onImagesChange(updatedImages);
    };

    const removeImage = (index: number) => {
        const updatedImages = images.filter((_, i) => i !== index);

        // If removed image was primary... logic is complex with existing images.
        // For now, if removed, just update.
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

        // Note: We don't automatically unset existing primary here visually
        // The parent handling will be deferred until save. 
        // But optimally we should tell parent "Intent is to set this NEW image as primary".
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
                disabled={images.length + existingImages.length >= maxImages}
            />

            {/* Image Preview Grid */}
            {(images.length > 0 || existingImages.length > 0) && (
                <div className="grid grid-cols-3 gap-3 mt-3">
                    {/* Existing Images */}
                    {existingImages.map((img) => (
                        <div key={img.id} className="relative group">
                            <div className={`relative aspect-square rounded-lg overflow-hidden border-2 ${img.isPrimary ? 'border-blue-500' : 'border-gray-200'
                                }`}>
                                <img
                                    src={img.url} // Ensure full URL is passed
                                    alt="Property"
                                    className="w-full h-full object-cover"
                                />

                                {img.isPrimary && (
                                    <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                        <Star className="size-3 fill-white" />
                                        Primary
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    {!img.isPrimary && onSetPrimaryExisting && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => onSetPrimaryExisting(img)}
                                            className="h-7 text-xs"
                                        >
                                            Set Primary
                                        </Button>
                                    )}
                                    {onRemoveExisting && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="destructive"
                                            onClick={() => onRemoveExisting(img)}
                                            className="h-7"
                                        >
                                            <X className="size-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* New Images */}
                    {images.map((img, index) => (
                        <div key={`new-${index}`} className="relative group">
                            <div className={`relative aspect-square rounded-lg overflow-hidden border-2 ${img.isPrimary ? 'border-blue-500' : 'border-dashed border-gray-300'
                                }`}>
                                <img
                                    src={img.preview}
                                    alt={`Upload ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />

                                {img.isPrimary && (
                                    <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                                        <Star className="size-3 fill-white" />
                                        New Primary
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    {!img.isPrimary && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() => setPrimaryImage(index)}
                                            className="h-7 text-xs"
                                        >
                                            Set Primary
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
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
                {images.length + existingImages.length} / {maxImages} images
                {images.length > 0 && ' • Click "Set Primary" to choose main image for new uploads'}
            </p>
        </div>
    );
}
