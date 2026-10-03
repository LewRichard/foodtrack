import { Image, type ImageStyle } from 'expo-image';
import { useEffect, useState } from 'react';
import { View, type StyleProp } from 'react-native';
import { photoUrls } from '@/lib/api';
import { colors } from '@/lib/theme';

/**
 * A check-in photo from the private bucket. Signed URLs change every time they are issued, so the
 * storage path is used as the cache key — each photo downloads once and is then served from disk.
 */
export function Photo({ path, style }: { path: string; style?: StyleProp<ImageStyle> }) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    photoUrls([path])
      .then((urls) => alive && setUri(urls[path] ?? null))
      .catch(() => alive && setUri(null));
    return () => {
      alive = false;
    };
  }, [path]);

  if (!uri) return <View style={[{ backgroundColor: colors.surfaceRaised }, style as object]} />;
  return (
    <Image
      source={{ uri, cacheKey: path }}
      style={style}
      contentFit="cover"
      transition={150}
      cachePolicy="disk"
      recyclingKey={path}
    />
  );
}
