// lib/youtube.ts

interface YouTubeSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle?: string;
  };
}

interface YouTubeSearchResponse {
  items: YouTubeSearchItem[];
}

// Cache untuk menyimpan video ID yang sudah ditemukan (LRU-style cache)
const videoIdCache = new Map<string, string>();
const MAX_CACHE_SIZE = 100;

// Prefetch queue untuk preloading lagu berikutnya
const prefetchQueue = new Map<string, Promise<string | null>>();

// Helper function untuk membuat cache key
function getCacheKey(songTitle: string, artistName: string): string {
  return `${songTitle.toLowerCase()}_${artistName.toLowerCase()}`;
}

// Helper function untuk menambah ke cache dengan LRU eviction
function addToCache(key: string, videoId: string): void {
  if (videoIdCache.size >= MAX_CACHE_SIZE) {
    const firstKey = videoIdCache.keys().next().value;
    if (firstKey) videoIdCache.delete(firstKey);
  }
  videoIdCache.set(key, videoId);
}

// Fungsi untuk prefetch video ID sebelum dibutuhkan
export async function prefetchYouTubeVideoId(
  songTitle: string,
  artistName: string
): Promise<void> {
  const cacheKey = getCacheKey(songTitle, artistName);
  if (videoIdCache.has(cacheKey) || prefetchQueue.has(cacheKey)) return;

  const prefetchPromise = searchYouTubeForSong(songTitle, artistName);
  prefetchQueue.set(cacheKey, prefetchPromise);
  prefetchPromise.finally(() => prefetchQueue.delete(cacheKey));
}

// Fungsi untuk prefetch beberapa lagu sekaligus
export async function prefetchMultipleSongs(
  tracks: Array<{ name: string; artistName: string }>
): Promise<void> {
  const tracksToFetch = tracks.slice(0, 3);
  await Promise.all(
    tracksToFetch.map(track => prefetchYouTubeVideoId(track.name, track.artistName))
  );
}

// === SPOTIFY-LIKE ALGORITHM ===

// Keywords yang menandakan video dengan talking/intro (SANGAT TIDAK DIINGINKAN)
const BAD_INTRO_KEYWORDS = [
  'reaction', 'react', 'review', 'podcast', 'interview', 'behind the scenes',
  'making of', 'explained', 'breakdown', 'analysis', 'commentary',
  'first time', 'listening to', 'hearing', 'unboxing', 'story time',
  'my thoughts', 'opinion', 'discussion', 'talk about', 'reacting'
];

// Keywords untuk versi lagu yang tidak diinginkan
const UNWANTED_VERSION_KEYWORDS = [
  'cover', 'karaoke', 'instrumental', 'slowed', 'reverb', 'bass boosted',
  'sped up', 'nightcore', '8d audio', 'lofi', 'mashup', 'parody',
  'tutorial', 'lesson', 'how to play', 'guitar cover', 'piano cover',
  'drum cover', 'fingerstyle', 'unplugged', 'rehearsal', 'practice',
  'soundcheck', 'acapella', 'minus one'
];

// === YOUTUBE API KEY ROTATION SYSTEM ===
// Support 3 API keys - automatically rotates when quota exceeded

const API_KEYS = [
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_2,
  process.env.NEXT_PUBLIC_YOUTUBE_API_KEY_3,
].filter(Boolean) as string[];

// Track which API key is currently active
let currentKeyIndex = 0;

// Track exhausted keys (reset daily via localStorage or just runtime)
const exhaustedKeys = new Set<number>();

// Get the current active API key
function getCurrentApiKey(): string | null {
  // Find next non-exhausted key starting from current index
  for (let i = 0; i < API_KEYS.length; i++) {
    const index = (currentKeyIndex + i) % API_KEYS.length;
    if (!exhaustedKeys.has(index) && API_KEYS[index]) {
      currentKeyIndex = index;
      return API_KEYS[index];
    }
  }
  return null; // All keys exhausted
}

// Mark current key as exhausted and rotate to next
function rotateToNextKey(): boolean {
  exhaustedKeys.add(currentKeyIndex);
  console.warn(`⚠️ YouTube API Key #${currentKeyIndex + 1} quota exceeded, switching to backup...`);

  // Try to find next available key
  const nextKey = getCurrentApiKey();
  if (nextKey) {
    console.log(`✓ Switched to YouTube API Key #${currentKeyIndex + 1}`);
    return true;
  }

  console.error('❌ All YouTube API keys exhausted!');
  return false;
}

// Reset all keys (can be called on new day)
export function resetApiKeys(): void {
  exhaustedKeys.clear();
  currentKeyIndex = 0;
  console.log('✓ YouTube API keys reset');
}

// Get current API status (for debugging)
export function getApiKeyStatus(): { total: number; active: number; exhausted: number[] } {
  return {
    total: API_KEYS.length,
    active: currentKeyIndex + 1,
    exhausted: Array.from(exhaustedKeys).map(i => i + 1)
  };
}

// Fungsi utama untuk mencari lagu di YouTube - SPOTIFY-LIKE ALGORITHM
export async function searchYouTubeForSong(
  songTitle: string,
  artistName: string
): Promise<string | null> {
  const apiKey = getCurrentApiKey();

  if (!apiKey) {
    console.error("No YouTube API key available (all quotas exceeded)");
    throw new Error('YouTube API quota exceeded');
  }

  if (API_KEYS.length === 0) {
    console.error("YouTube API key not found in environment variables");
    return null;
  }

  // Clean up song title dan artist name - agresif
  const cleanTitle = songTitle
    .replace(/\([^)]*\)/g, '')      // Remove (feat. xxx), (Remix), etc.
    .replace(/\[[^\]]*\]/g, '')     // Remove [Official Video], etc.
    .replace(/feat\..*/i, '')       // Remove feat. artist
    .replace(/ft\..*/i, '')         // Remove ft. artist  
    .split('-')[0]                  // Remove everything after dash
    .trim();

  const cleanArtist = artistName.split(',')[0].trim();
  const cacheKey = getCacheKey(cleanTitle, cleanArtist);

  // Check cache (instant return)
  if (videoIdCache.has(cacheKey)) {
    console.log(`✓ Cache hit: "${cleanTitle} - ${cleanArtist}"`);
    return videoIdCache.get(cacheKey)!;
  }

  // Check prefetch queue
  if (prefetchQueue.has(cacheKey)) {
    console.log(`⏳ Waiting prefetch: "${cleanTitle} - ${cleanArtist}"`);
    return prefetchQueue.get(cacheKey)!;
  }

  // Prioritized search queries - Official versions first
  const searchQueries = [
    `"${cleanTitle}" "${cleanArtist}" official audio`,        // Exact match official audio
    `${cleanTitle} ${cleanArtist} VEVO`,                      // VEVO = always official
    `${cleanTitle} ${cleanArtist} official music video`,      // Official MV
    `${cleanTitle} ${cleanArtist} topic`,                     // YouTube Music Topic (pure audio)
    `${cleanTitle} ${cleanArtist} audio`,                     // Audio version
    `${cleanTitle} ${cleanArtist}`,                           // Simple fallback
  ];

  for (const query of searchQueries) {
    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?` +
        `part=snippet&q=${encodeURIComponent(query)}` +
        `&type=video&videoCategoryId=10` +  // Music category only
        `&maxResults=10&key=${apiKey}`      // More results for better filtering
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`YouTube API error for "${query}":`, errorText);
        if (response.status === 403) {
          // Quota exceeded - try to rotate to next API key
          if (rotateToNextKey()) {
            // Retry the entire search with new API key
            return searchYouTubeForSong(songTitle, artistName);
          }
          // All keys exhausted
          throw new Error('YouTube API quota exceeded');
        }
        continue;
      }

      const data: YouTubeSearchResponse = await response.json();

      if (data.items && data.items.length > 0) {
        const lowerTitle = cleanTitle.toLowerCase();
        const lowerArtist = cleanArtist.toLowerCase();

        // Advanced scoring algorithm
        const scoredResults = data.items.map(item => {
          const title = item.snippet.title.toLowerCase();
          const channel = (item.snippet.channelTitle || '').toLowerCase();
          let score = 0;

          // === HIGHEST PRIORITY: Official channels ===
          if (channel.includes('vevo')) score += 100;                    // VEVO = always pure
          if (channel.includes('- topic')) score += 90;                  // Topic = pure audio, no intro
          if (channel.includes(lowerArtist) && channel.includes('official')) score += 80;
          if (channel.includes(lowerArtist)) score += 40;

          // Record label channels
          const labelKeywords = ['records', 'music', 'entertainment', 'universal', 'sony', 'warner'];
          if (labelKeywords.some(kw => channel.includes(kw))) score += 20;

          // === TITLE MATCHING ===
          if (title.includes(lowerTitle)) score += 25;
          if (title.includes(lowerArtist)) score += 20;

          // Official markers
          if (title.includes('official audio')) score += 50;
          if (title.includes('official music video')) score += 40;
          if (title.includes('official video')) score += 35;
          if (title.includes('official')) score += 15;
          if (title.includes('audio')) score += 10;

          // Topic videos (auto-generated) - PURE AUDIO
          if (title.includes('provided to youtube')) score += 60;

          // === HEAVY PENALTIES ===
          // Videos with talking/intros
          for (const kw of BAD_INTRO_KEYWORDS) {
            if (title.includes(kw) || channel.includes(kw)) score -= 200;
          }

          // Unwanted versions
          for (const kw of UNWANTED_VERSION_KEYWORDS) {
            if (title.includes(kw)) score -= 150;
          }

          // Additional penalties
          if (title.includes('remix') && !title.includes('official remix')) score -= 100;
          if (title.includes('live') && !title.includes('official live')) score -= 80;
          if (title.includes('lyric') && !title.includes('official')) score -= 30;
          if (title.includes('concert')) score -= 70;
          if (title.includes('performance') && !title.includes('official')) score -= 50;
          if (title.includes('full album')) score -= 150;
          if (title.includes('playlist')) score -= 150;
          if (title.includes('mix 20')) score -= 150;  // "mix 2024" etc
          if (title.includes('compilation')) score -= 150;
          if (title.includes('best of')) score -= 100;
          if (title.includes('top 10')) score -= 150;
          if (title.includes('extended')) score -= 30;
          if (title.includes('edit')) score -= 20;

          // Non-matching penalty
          if (!title.includes(lowerTitle) && !title.includes(lowerArtist)) score -= 50;

          return { item, score };
        });

        // Filter very low scores
        const validResults = scoredResults.filter(r => r.score > -100);

        if (validResults.length === 0) continue;

        // Sort by score
        validResults.sort((a, b) => b.score - a.score);
        const bestMatch = validResults[0];

        console.log(`✓ Found: "${cleanTitle}" by ${cleanArtist}`, {
          video: bestMatch.item.snippet.title.substring(0, 50),
          channel: bestMatch.item.snippet.channelTitle,
          score: bestMatch.score
        });

        addToCache(cacheKey, bestMatch.item.id.videoId);
        return bestMatch.item.id.videoId;
      }
    } catch (error) {
      console.error(`Search failed: "${query}"`, error);
      if (error instanceof Error && error.message === 'YouTube API quota exceeded') {
        // Try to rotate to next API key
        if (rotateToNextKey()) {
          // Retry the entire search with new API key
          return searchYouTubeForSong(songTitle, artistName);
        }
        // All keys exhausted, throw error to UI
        throw error;
      }
    }
  }

  console.warn(`✗ Not found: "${cleanTitle} - ${cleanArtist}"`);
  return null;
}

// Cache utilities
export function getCacheStats(): { size: number; keys: string[] } {
  return { size: videoIdCache.size, keys: Array.from(videoIdCache.keys()) };
}

export function clearVideoCache(): void {
  videoIdCache.clear();
  prefetchQueue.clear();
}