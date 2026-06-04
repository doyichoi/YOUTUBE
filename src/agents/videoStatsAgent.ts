import { getVideoDetails } from "../youtube/client.js";
import type { SearchVideoItem, VideoStatsItem } from "../types.js";
import {
  classifySurge,
  hoursSince,
  viewsPerHour,
} from "../utils/scoring.js";

export async function runVideoStatsAgent(
  searchResults: SearchVideoItem[]
): Promise<VideoStatsItem[]> {
  const ids = searchResults.map((v) => v.videoId);
  const response = await getVideoDetails(ids);
  const byId = new Map(searchResults.map((v) => [v.videoId, v]));

  const stats: VideoStatsItem[] = [];
  const now = new Date();

  for (const item of response.items ?? []) {
    const videoId = item.id;
    const snippet = item.snippet;
    const statistics = item.statistics;
    if (!videoId || !snippet?.publishedAt) continue;

    const searchMeta = byId.get(videoId);
    const viewCount = Number(statistics?.viewCount ?? 0);
    const likeCount = Number(statistics?.likeCount ?? 0);
    const commentCount = Number(statistics?.commentCount ?? 0);
    const hours = hoursSince(snippet.publishedAt, now);
    const vph = viewsPerHour(viewCount, hours);
    const surgeLabel = classifySurge(vph, hours);

    stats.push({
      videoId,
      title: snippet.title ?? searchMeta?.title ?? "",
      channelId: snippet.channelId ?? searchMeta?.channelId ?? "",
      channelTitle: snippet.channelTitle ?? searchMeta?.channelTitle ?? "",
      publishedAt: snippet.publishedAt,
      viewCount,
      likeCount,
      commentCount,
      duration: item.contentDetails?.duration ?? "",
      thumbnailUrl:
        snippet.thumbnails?.high?.url ??
        snippet.thumbnails?.medium?.url ??
        "",
      hoursSincePublished: hours,
      viewsPerHour: vph,
      surgeLabel,
    });
  }

  return stats.sort((a, b) => b.viewsPerHour - a.viewsPerHour);
}
