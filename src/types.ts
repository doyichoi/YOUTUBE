export type SurgeLabel = "fire" | "rising" | "normal";

export interface SearchVideoItem {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
}

export interface VideoStatsItem {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  thumbnailUrl: string;
  hoursSincePublished: number;
  viewsPerHour: number;
  surgeLabel: SurgeLabel;
}

export interface ResearchInput {
  keyword: string;
  daysBack: number;
  maxResults: number;
  regionCode: string;
  language: string;
}

export interface ResearchResult {
  input: ResearchInput;
  searchedAt: string;
  videos: VideoStatsItem[];
  top10: VideoStatsItem[];
}
