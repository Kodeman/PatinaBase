"use client";

import { useMutation } from "@tanstack/react-query";
import { createBrowserClient } from "@patina/supabase";
import type { ExtractedProduct } from "@patina/utils";
import {
  MoodBoardUrlUnfurlError,
  normalizeMoodBoardSourceUrl,
  parseMoodBoardUrlUnfurlResult,
  translateMoodBoardUrlUnfurlError,
  type MoodBoardUrlUnfurlResult,
} from "@/lib/mood-board/url-unfurl";

export const MOOD_BOARD_URL_UNFURL_MUTATION_KEY = [
  "mood-board",
  "url-unfurl",
] as const;

export interface MoodBoardUrlUnfurlInput {
  url: string;
}

/** Authenticated client for paste/drop URL resolution through the guarded edge function. */
export function useMoodBoardUrlUnfurl() {
  return useMutation<
    MoodBoardUrlUnfurlResult,
    MoodBoardUrlUnfurlError,
    MoodBoardUrlUnfurlInput
  >({
    mutationKey: MOOD_BOARD_URL_UNFURL_MUTATION_KEY,
    // Every request consumes durable quota immediately before its network
    // fetch. Automatic retries would spend allowance without another gesture.
    retry: false,
    meta: { errorSurface: "inline" },
    mutationFn: async ({ url }) => {
      const sourceUrl = normalizeMoodBoardSourceUrl(url);
      const supabase = createBrowserClient();
      const { data, error } = await supabase.functions.invoke<ExtractedProduct>(
        "capture-from-url",
        { body: { url: sourceUrl, mode: "capture" } },
      );
      if (error) throw await translateMoodBoardUrlUnfurlError(error);
      return parseMoodBoardUrlUnfurlResult(data, sourceUrl);
    },
  });
}
