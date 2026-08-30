import { useCallback, useRef, useState } from "react";
import type { PublishIdeaInput } from "@react-playground/api";
import { playgroundApi } from "../lib/playgroundApi";

export function useIdeaPublishing() {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishingRef = useRef(false);

  const clearPublishError = useCallback(() => setPublishError(null), []);

  const publish = useCallback(async (id: string, input: PublishIdeaInput) => {
    if (publishingRef.current) return false;

    publishingRef.current = true;
    setPublishing(true);
    setPublishError(null);

    try {
      const { slug, catalogStatus } = await playgroundApi.publishIdea(id, input);
      if (catalogStatus === "refresh-failed") {
        setPublishError(
          "Published files, but the Live catalog refresh failed. Try Make Live again.",
        );
        return false;
      }

      window.location.assign(`/${slug}`);
      return true;
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Publish failed");
      return false;
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }, []);

  return {
    publish,
    publishing,
    publishError,
    clearPublishError,
  };
}
