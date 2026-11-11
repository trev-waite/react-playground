import { useCallback, useRef, useState } from "react";
import type { PublishIdeaInput } from "@react-playground/api";
import { refreshLiveCatalog } from "../lib/liveCatalog";
import { useNavigate } from "react-router";
import { playgroundApi } from "../lib/playgroundApi";

export function useIdeaPublishing() {
  const navigate = useNavigate();
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const publishingRef = useRef(false);

  const clearPublishError = useCallback(() => setPublishError(null), []);

  const publish = useCallback(async (id: string, input: PublishIdeaInput) => {
    if (publishingRef.current) return false;

    publishingRef.current = true;
    setPublishing(true);
    setPublishError(null);

    let published = false;
    try {
      const { slug } = await playgroundApi.publishIdea(id, input);
      await refreshLiveCatalog(slug);
      navigate(`/${slug}`);
      published = true;
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Publish failed");
    }
    publishingRef.current = false;
    setPublishing(false);
    return published;
  }, [navigate]);

  return {
    publish,
    publishing,
    publishError,
    clearPublishError,
  };
}
