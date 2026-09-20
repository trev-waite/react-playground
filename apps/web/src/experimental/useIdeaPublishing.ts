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

    try {
      const { slug } = await playgroundApi.publishIdea(id, input);
      // Preview serves a production snapshot; only the dev server can refresh it.
      if (import.meta.env.PROD) {
        setPublishError(
          "Published the Live files. Run bun run start again so the production build includes the new entry.",
        );
        return false;
      }
      await refreshLiveCatalog(slug);
      navigate(`/${slug}`);
      return true;
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : "Publish failed");
      return false;
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }, [navigate]);

  return {
    publish,
    publishing,
    publishError,
    clearPublishError,
  };
}
