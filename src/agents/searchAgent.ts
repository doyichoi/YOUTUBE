import { searchVideos } from "../youtube/client.js";
import type { ResearchInput, SearchVideoItem } from "../types.js";
import { publishedAfterIso } from "../utils/scoring.js";

export async function runSearchAgent(
  input: ResearchInput
): Promise<SearchVideoItem[]> {
  const publishedAfter = publishedAfterIso(input.daysBack);
  const response = await searchVideos({
    q: input.keyword,
    publishedAfter,
    maxResults: input.maxResults,
    regionCode: input.regionCode,
    relevanceLanguage: input.language,
  });

  const items: SearchVideoItem[] = [];
  for (const item of response.items ?? []) {
    const videoId = item.id?.videoId;
    const snippet = item.snippet;
    if (!videoId || !snippet?.title || !snippet.publishedAt) continue;

    items.push({
      videoId,
      title: snippet.title,
      channelId: snippet.channelId ?? "",
      channelTitle: snippet.channelTitle ?? "",
      publishedAt: snippet.publishedAt,
    });
  }

  return items;
}
