// ============================================================================
//  CLOUDINARY UTILS (The Media Archivist)
// ============================================================================
//  Contains shared logic for interacting with Cloudinary assets.
// ============================================================================

/**
 * Extracts the Cloudinary public_id from a full URL.
 * Handles versioned URLs (e.g., /upload/v1234/folder/image.jpg → folder/image)
 *
 * @param {string} url - The full Cloudinary CDN URL
 * @returns {string|null} - The public_id or null if invalid
 */
export const extractPublicId = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;

  // The public_id starts 2 segments after 'upload' (skips version v123...)
  const publicIdWithExt = parts.slice(uploadIndex + 2).join('/');
  return publicIdWithExt.split('.')[0];
};
