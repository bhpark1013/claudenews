export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  lang?: string;
  score?: number;
  comments?: number;
  author?: string;
  timestamp: number;
  // Custom (user-registered) feeds only: feed-provided body for sources whose
  // pages block scraping (Reddit etc.), so the plugin's summarizer has text.
  feed_text?: string;
  custom?: boolean;
}
