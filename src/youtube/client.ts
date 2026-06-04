const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function requireApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    throw new Error(
      "YOUTUBE_API_KEY가 설정되지 않았습니다. .env.example을 참고해 .env를 만드세요."
    );
  }
  return key;
}

async function youtubeGet<T>(
  path: string,
  params: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`${YOUTUBE_API_BASE}/${path}`);
  url.searchParams.set("key", requireApiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface YoutubeSearchListResponse {
  items?: Array<{
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
  }>;
}

export interface YoutubeVideosListResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
      publishedAt?: string;
      thumbnails?: { high?: { url?: string }; medium?: { url?: string } };
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: { duration?: string };
  }>;
}

export async function searchVideos(params: {
  q: string;
  publishedAfter: string;
  maxResults: number;
  regionCode: string;
  relevanceLanguage: string;
}): Promise<YoutubeSearchListResponse> {
  return youtubeGet<YoutubeSearchListResponse>("search", {
    part: "snippet",
    type: "video",
    order: "viewCount",
    q: params.q,
    publishedAfter: params.publishedAfter,
    maxResults: params.maxResults,
    regionCode: params.regionCode,
    relevanceLanguage: params.relevanceLanguage,
  });
}

export async function getVideoDetails(
  videoIds: string[]
): Promise<YoutubeVideosListResponse> {
  if (videoIds.length === 0) return { items: [] };
  return youtubeGet<YoutubeVideosListResponse>("videos", {
    part: "statistics,snippet,contentDetails",
    id: videoIds.join(","),
  });
}
