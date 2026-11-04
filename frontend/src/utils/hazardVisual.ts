import type { HazardType } from '../types/hazard';

export interface HazardVisualInfo {
  imageUrl: string;
  isRealPhoto: boolean;
  label: string;
}

/**
 * Returns the reliable visual asset for a road hazard record.
 * - If a real rider photo exists, it returns the real photo path with isRealPhoto: true.
 * - If no real photo exists, it returns a relevant local reference photograph for the hazard type
 *   with isRealPhoto: false and the label "Illustrative — not original report evidence".
 */
export const getHazardVisual = (hazard: {
  hazard_type?: string | HazardType;
  image_path?: string | null;
}): HazardVisualInfo => {
  const path = hazard.image_path?.trim();

  // Check for real uploaded photo (uploads directory, data URI, or external HTTP/HTTPS URL)
  const hasRealPhoto =
    !!path &&
    (path.startsWith('/uploads/') ||
      path.startsWith('data:image/') ||
      path.startsWith('http://') ||
      path.startsWith('https://'));

  if (hasRealPhoto && path) {
    return {
      imageUrl: path,
      isRealPhoto: true,
      label: 'Rider Photo Evidence'
    };
  }

  // Real road hazard reference photographs (royalty-free, stored locally — NOT original report evidence).
  // Categories with downloaded real photos use .jpg; remaining categories fall back to SVG diagrams.
  const typeMap: Record<string, string> = {
    pothole:              '/placeholders/pothole.jpg',       // real photo
    debris:               '/placeholders/debris.jpg',        // real photo — rock-slide debris on road
    waterlogging:         '/placeholders/waterlogging.jpg',  // real photo — flooded urban road
    broken_surface:       '/placeholders/cracked_road.jpg',  // real photo — cracked asphalt
    obstacle:             '/placeholders/obstacle.jpg',      // real photo — traffic cones on road
    roadblock:            '/placeholders/roadblock.jpg',     // real photo — construction barricade
    oil_spill:            '/placeholders/oil_spill.svg',
    gravel:               '/placeholders/gravel.svg',
    unmarked_speed_bump:  '/placeholders/unmarked_speed_bump.svg',
    road_works:           '/placeholders/road_works.svg',
    unsafe_condition:     '/placeholders/unsafe_condition.svg'
  };

  const normalizedType = (hazard.hazard_type || 'pothole').toLowerCase();
  const fallbackUrl = typeMap[normalizedType] || '/placeholders/pothole.jpg';

  return {
    imageUrl: fallbackUrl,
    isRealPhoto: false,
    label: 'Illustrative — not original report evidence'
  };
};
